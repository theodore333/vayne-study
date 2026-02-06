'use client';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import {
  Scissors, Play, ArrowLeft, Send, CheckCircle, Clock,
  ChevronRight, AlertCircle, User, Syringe, Activity,
  ClipboardList, Shield, BookOpen
} from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  OR_STEPS, ORStep, InteractiveORCase, ORMessage, ORStepEvaluation,
  SuggestedImage
} from '@/lib/types';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';
import { generateId } from '@/lib/algorithms';

// Demo OR case for testing without API key
const DEMO_CASE: InteractiveORCase = {
  id: 'demo_or_1',
  subjectId: 'demo',
  topicId: 'demo',
  difficulty: 'intermediate',
  procedureName: 'Лапароскопска апендектомия',
  specialty: 'Обща хирургия',
  createdAt: new Date().toISOString(),
  completedAt: null,
  patient: {
    age: 24,
    gender: 'male',
    diagnosis: 'Остър апендицит',
    indication: 'Пациент с клинична картина на остър апендицит, потвърден с ехография и лабораторни изследвания.',
    relevantHistory: 'Без значима минала анамнеза. Няма алергии. Няма предишни операции.'
  },
  hiddenData: {
    procedureSteps: [
      'Въвеждане на Veress игла и създаване на пневмоперитонеум (12-14 mmHg CO2)',
      'Поставяне на 10mm порт в умбиликалната зона (камера) и два 5mm работни порта',
      'Ревизия на коремната кухина. Идентификация на апендикса и илеоцекалната връзка',
      'Скелетиране на мезоапендикса с коагулация на a. appendicularis',
      'Лигиране на базата на апендикса с ендолупове (x2) и срязване',
      'Екстракция на апендикса през 10mm порта в ендобаг',
      'Хемостаза, лаваж, проверка и затваряне на портовете'
    ],
    expectedAnesthesia: 'Обща ендотрахеална анестезия (OEA) - стандарт за лапароскопски операции. Мускулна релаксация е необходима за адекватен пневмоперитонеум.',
    expectedPositioning: 'По гръб (supine) с леко Trendelenburg наляво (ляв латерален декубит ~15°) за отместване на чревните бримки от дясната илиачна ямка.',
    keyAnatomy: [
      'A. appendicularis (клон на a. ileocolica) - основен съд, който трябва да се коагулира',
      'Илеоцекална връзка (valva ileocaecalis) - ориентир за намиране на апендикса',
      'Taeniae coli на цекума - конвергират към базата на апендикса',
      'Мезоапендикс - съдържа a. appendicularis, трябва внимателно скелетиране',
      'Уретер (десен) - отстои латерално, но трябва да се внимава при дълбока дисекция'
    ],
    expectedComplications: [
      'Кървене от a. appendicularis',
      'Перфорация на апендикса при манипулация',
      'Термично увреждане на околни тъкани'
    ],
    complicationScenario: {
      description: 'По време на коагулацията на мезоапендикса се появява умерено кървене от a. appendicularis, което замъглява операционното поле.',
      correctResponse: 'Приложи директен натиск с грасер/аспиратор. Идентифицирай точката на кървене. Приложи клип или биполярна коагулация. При нужда - конверсия.',
      severity: 'moderate'
    },
    postOpOrders: {
      medications: [
        'Метамизол 1g i.v. на 8 часа (аналгезия)',
        'Цефазолин 1g i.v. на 8ч за 24 часа (АБ профилактика)',
        'Метоклопрамид 10mg i.v. при гадене',
        'Еноксапарин 40mg s.c. (тромбопрофилактика)'
      ],
      monitoring: [
        'Витални показатели на 4 часа',
        'Диуреза - мониториране',
        'Следене за перитонеални симптоми',
        'Температура'
      ],
      instructions: [
        'Ранна мобилизация - ставане от леглото след 6-8 часа',
        'Течна диета след възстановяване на перисталтиката',
        'Смяна на превръзките на следващия ден',
        'Изписване при липса на усложнения - на 2-ри ден'
      ]
    }
  },
  currentStep: 'briefing',
  procedureMessages: [],
  complicationMessages: [],
  setupChoices: { anesthesiaType: '', positioning: '', teamConfirmed: false },
  postOpOrders: { medications: '', monitoring: '', instructions: '' },
  evaluations: [],
  overallScore: null,
  timeSpentMinutes: 0
};

// Demo surgeon responses for procedure chat
const DEMO_SURGEON_PROCEDURE_RESPONSES = [
  'Добре, започваме. Създаваме пневмоперитонеум с Veress игла в умбиликуса. Налягането е 14 mmHg. Поставяме камерата. Какво виждаш на екрана? Опиши ми коремната кухина.',
  'Отлично наблюдение. Виждам леко зачервяване в дясната илиачна ямка. Поставяме двата работни порта. Можеш ли да ми подадеш грасера? Трябва да отместим чревните бримки.',
  'Перфектно. Сега виждаме цекума и тениите. Проследи ги с поглед - къде ни водят? Идентифицирай апендикса.',
  'Точно така, апендиксът е тук. Виждам, че е оточен и зачервен - потвърждава диагнозата. Сега трябва да скелетираме мезоапендикса. Кой съд е критичен тук?',
  'A. appendicularis, правилно. Внимателно коагулираме с биполярен инструмент. Държиш ли добре? Сега лигираме базата на апендикса с ендолупове.',
  'Две ендолупи проксимално, една дистално. Срязваме между тях. Слагаме апендикса в ендобаг. Проверяваме хемостазата. Всичко изглежда добре.'
];

// Demo surgeon responses for complications chat
const DEMO_SURGEON_COMPLICATION_RESPONSES = [
  'Внимание! Виждам кървене от мезоапендикса - изглежда, че a. appendicularis не е напълно коагулирана. Какво правим?',
  'Добре, натискът помага да овладеем ситуацията. Сега ми трябва по-добра видимост. Какъв инструмент ще ми подготвиш?',
  'Биполярен коагулатор е правилният избор. Идентифицирам точката на кървене. Коагулирам внимателно. Кървенето спира. Браво, добре се справи!'
];

const STEP_ICONS: Record<ORStep, React.ReactNode> = {
  briefing: <ClipboardList className="w-5 h-5" />,
  setup: <Syringe className="w-5 h-5" />,
  procedure: <Scissors className="w-5 h-5" />,
  complications: <AlertCircle className="w-5 h-5" />,
  postop: <Activity className="w-5 h-5" />
};

function ORRoomContent() {
  const { data } = useApp();
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('claude-api-key') : null;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort pending requests on unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  // Core state
  const [activeCase, setActiveCase] = useState<InteractiveORCase | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [demoResponseIndex, setDemoResponseIndex] = useState(0);
  const [demoComplicationIndex, setDemoComplicationIndex] = useState(0);

  // Selection state
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Setup state
  const [anesthesiaType, setAnesthesiaType] = useState('');
  const [positioning, setPositioning] = useState('');
  const [teamConfirmed, setTeamConfirmed] = useState(false);

  // Post-op state
  const [postOpMedications, setPostOpMedications] = useState('');
  const [postOpMonitoring, setPostOpMonitoring] = useState('');
  const [postOpInstructions, setPostOpInstructions] = useState('');

  // Step evaluation
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [stepCompleted, setStepCompleted] = useState(false);

  // Results
  const [showResults, setShowResults] = useState(false);
  const [finalSummary, setFinalSummary] = useState<Record<string, unknown> | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeCase?.procedureMessages, activeCase?.complicationMessages]);

  // Filter active subjects with material
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  const selectedSubjectObj = activeSubjects.find(s => s.id === selectedSubject);
  const availableTopics = selectedSubjectObj?.topics?.filter(t =>
    t.material && t.material.length >= 200
  ) || [];

  // Start demo case
  const startDemoCase = useCallback(() => {
    setActiveCase({ ...DEMO_CASE, id: generateId(), createdAt: new Date().toISOString() });
    setIsDemo(true);
    setDemoResponseIndex(0);
    setDemoComplicationIndex(0);
    startTimeRef.current = Date.now();
    setError(null);
  }, []);

  // Generate real case from API
  const handleGenerateCase = useCallback(async () => {
    if (!apiKey || !selectedTopic || !selectedSubject) return;

    const topic = availableTopics.find(t => t.id === selectedTopic);
    const subject = activeSubjects.find(s => s.id === selectedSubject);
    if (!topic || !subject) return;

    setIsGenerating(true);
    setError(null);

    try {
      // Find pharmacology and anatomy subjects for cross-subject
      const pharmacologySubjects = data.subjects.filter(s =>
        !s.archived && !s.deletedAt && s.name.toLowerCase().includes('фармакол')
      );
      const anatomySubjects = data.subjects.filter(s =>
        !s.archived && !s.deletedAt && s.name.toLowerCase().includes('анатом')
      );

      const pharmacologyTopics = pharmacologySubjects.flatMap(s =>
        (s.topics || []).filter(t => t.material && t.material.length > 100)
          .map(t => ({ id: t.id, name: t.name, subjectId: s.id }))
      );
      const anatomyTopics = anatomySubjects.flatMap(s =>
        (s.topics || []).filter(t => t.material && t.material.length > 100)
          .map(t => ({ id: t.id, name: t.name, subjectId: s.id }))
      );

      const res = await fetchWithTimeout('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'generate_or_case',
          material: topic.material?.substring(0, 4000),
          topicName: topic.name,
          subjectName: subject.name,
          difficulty: selectedDifficulty,
          pharmacologyTopics: pharmacologyTopics.slice(0, 30),
          anatomyTopics: anatomyTopics.slice(0, 30)
        }),
        timeout: 60000,
        signal: abortControllerRef.current?.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      const caseData = result.case;

      const newCase: InteractiveORCase = {
        id: generateId(),
        subjectId: selectedSubject,
        topicId: selectedTopic,
        difficulty: selectedDifficulty,
        procedureName: caseData.procedureName || 'Неизвестна процедура',
        specialty: caseData.specialty || subject.name,
        createdAt: new Date().toISOString(),
        completedAt: null,
        patient: caseData.patient || { age: 50, gender: 'male', diagnosis: '', indication: '', relevantHistory: '' },
        hiddenData: caseData.hiddenData || {},
        currentStep: 'briefing',
        procedureMessages: [],
        complicationMessages: [],
        setupChoices: { anesthesiaType: '', positioning: '', teamConfirmed: false },
        postOpOrders: { medications: '', monitoring: '', instructions: '' },
        evaluations: [],
        overallScore: null,
        timeSpentMinutes: 0
      };

      setActiveCase(newCase);
      setIsDemo(false);
      startTimeRef.current = Date.now();
    } catch (err) {
      setError(getFetchErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, selectedTopic, selectedSubject, selectedDifficulty, availableTopics, activeSubjects, data.subjects]);

  // Send chat message (procedure or complications)
  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !activeCase || isSendingMessage) return;

    const messageText = chatInput.trim();
    setChatInput('');

    const isProcedure = activeCase.currentStep === 'procedure';
    const messages = isProcedure ? activeCase.procedureMessages : activeCase.complicationMessages;

    // Add student message
    const studentMsg: ORMessage = {
      id: generateId(),
      role: 'student',
      content: messageText,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, studentMsg];
    setActiveCase(prev => prev ? {
      ...prev,
      ...(isProcedure
        ? { procedureMessages: updatedMessages }
        : { complicationMessages: updatedMessages })
    } : null);

    // Get surgeon response
    if (isDemo) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

      const responses = isProcedure ? DEMO_SURGEON_PROCEDURE_RESPONSES : DEMO_SURGEON_COMPLICATION_RESPONSES;
      const idx = isProcedure ? demoResponseIndex : demoComplicationIndex;
      const responseText = responses[idx % responses.length] || 'Добра работа, продължаваме.';

      const surgeonMsg: ORMessage = {
        id: generateId(),
        role: 'surgeon',
        content: responseText,
        timestamp: new Date().toISOString()
      };

      setActiveCase(prev => prev ? {
        ...prev,
        ...(isProcedure
          ? { procedureMessages: [...updatedMessages, surgeonMsg] }
          : { complicationMessages: [...updatedMessages, surgeonMsg] })
      } : null);

      if (isProcedure) setDemoResponseIndex(i => i + 1);
      else setDemoComplicationIndex(i => i + 1);
    } else if (apiKey) {
      setIsSendingMessage(true);
      try {
        const res = await fetchWithTimeout('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            mode: 'or_surgeon_response',
            caseContext: JSON.stringify({
              procedureName: activeCase.procedureName,
              patient: activeCase.patient,
              specialty: activeCase.specialty
            }),
            conversationHistory: updatedMessages.map(m => ({ role: m.role, content: m.content })),
            studentAction: messageText,
            currentStep: activeCase.currentStep,
            procedureSteps: activeCase.hiddenData.procedureSteps,
            complicationScenario: activeCase.hiddenData.complicationScenario,
            keyAnatomy: activeCase.hiddenData.keyAnatomy
          }),
          timeout: 30000,
          signal: abortControllerRef.current?.signal
        });

        if (res.ok) {
          const result = await res.json();
          const surgeonMsg: ORMessage = {
            id: generateId(),
            role: 'surgeon',
            content: result.response,
            timestamp: new Date().toISOString()
          };

          setActiveCase(prev => prev ? {
            ...prev,
            ...(isProcedure
              ? { procedureMessages: [...updatedMessages, surgeonMsg] }
              : { complicationMessages: [...updatedMessages, surgeonMsg] })
          } : null);
        }
      } catch (err) {
        console.error('Surgeon response error:', err);
      } finally {
        setIsSendingMessage(false);
      }
    }
  }, [chatInput, activeCase, isSendingMessage, isDemo, apiKey, demoResponseIndex, demoComplicationIndex]);

  // Evaluate current step and advance
  const handleCompleteStep = useCallback(async () => {
    if (!activeCase) return;

    const step = activeCase.currentStep;
    setIsEvaluating(true);

    // Build student data for evaluation
    let studentData: Record<string, unknown> = {};

    switch (step) {
      case 'briefing':
        studentData = { confirmed: true };
        break;
      case 'setup':
        studentData = { anesthesiaType, positioning, teamConfirmed };
        // Save choices
        setActiveCase(prev => prev ? {
          ...prev,
          setupChoices: { anesthesiaType, positioning, teamConfirmed }
        } : null);
        break;
      case 'procedure':
        studentData = {
          messageCount: activeCase.procedureMessages.filter(m => m.role === 'student').length,
          chatSummary: activeCase.procedureMessages.map(m =>
            `${m.role === 'student' ? 'Асистент' : 'Хирург'}: ${m.content}`
          ).join('\n')
        };
        break;
      case 'complications':
        studentData = {
          chatSummary: activeCase.complicationMessages.map(m =>
            `${m.role === 'student' ? 'Асистент' : 'Хирург'}: ${m.content}`
          ).join('\n')
        };
        break;
      case 'postop':
        studentData = { medications: postOpMedications, monitoring: postOpMonitoring, instructions: postOpInstructions };
        setActiveCase(prev => prev ? {
          ...prev,
          postOpOrders: { medications: postOpMedications, monitoring: postOpMonitoring, instructions: postOpInstructions }
        } : null);
        break;
    }

    let evaluation: ORStepEvaluation;

    if (isDemo) {
      await new Promise(r => setTimeout(r, 1000));
      const demoScores: Record<string, number> = {
        briefing: 90, setup: 80, procedure: 75, complications: 70, postop: 85
      };
      evaluation = {
        step: step as ORStep,
        score: demoScores[step] || 75,
        feedback: getDemoFeedback(step),
        strengths: getDemoStrengths(step),
        areasToImprove: getDemoImprovements(step),
        timestamp: new Date().toISOString(),
        suggestedImages: getDemoSuggestedImages(step)
      };
    } else if (apiKey) {
      try {
        // Load cross-subject material if needed
        let pharmacologyMaterial = '';
        let anatomyMaterial = '';

        if ((step === 'postop' || step === 'procedure') && activeCase.hiddenData.relevantPharmacologyTopicIds) {
          const pharmaIds = activeCase.hiddenData.relevantPharmacologyTopicIds;
          for (const subj of data.subjects) {
            for (const t of subj.topics || []) {
              if (pharmaIds.includes(t.id) && t.material) {
                pharmacologyMaterial += `\n--- ${t.name} ---\n${t.material.substring(0, 3000)}`;
                if (pharmacologyMaterial.length > 8000) break;
              }
            }
            if (pharmacologyMaterial.length > 8000) break;
          }
        }

        if (step === 'procedure' && activeCase.hiddenData.relevantAnatomyTopicIds) {
          const anatIds = activeCase.hiddenData.relevantAnatomyTopicIds;
          for (const subj of data.subjects) {
            for (const t of subj.topics || []) {
              if (anatIds.includes(t.id) && t.material) {
                anatomyMaterial += `\n--- ${t.name} ---\n${t.material.substring(0, 3000)}`;
                if (anatomyMaterial.length > 8000) break;
              }
            }
            if (anatomyMaterial.length > 8000) break;
          }
        }

        const topic = data.subjects
          .flatMap(s => s.topics || [])
          .find(t => t.id === activeCase.topicId);

        const res = await fetchWithTimeout('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            mode: 'evaluate_or_step',
            step,
            caseContext: JSON.stringify({
              procedureName: activeCase.procedureName,
              patient: activeCase.patient,
              specialty: activeCase.specialty,
              difficulty: activeCase.difficulty
            }),
            studentData,
            hiddenData: activeCase.hiddenData,
            material: topic?.material?.substring(0, 2000),
            pharmacologyMaterial: pharmacologyMaterial || undefined,
            anatomyMaterial: anatomyMaterial || undefined
          }),
          timeout: 45000,
          signal: abortControllerRef.current?.signal
        });

        if (!res.ok) throw new Error('Evaluation failed');

        const result = await res.json();
        evaluation = {
          step: step as ORStep,
          ...result.evaluation,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        console.error('Step evaluation error:', err);
        evaluation = {
          step: step as ORStep,
          score: 50,
          feedback: 'Не успяхме да оценим тази стъпка.',
          strengths: [],
          areasToImprove: [],
          timestamp: new Date().toISOString()
        };
      }
    } else {
      evaluation = {
        step: step as ORStep,
        score: 50,
        feedback: 'Няма API ключ за оценка.',
        strengths: [],
        areasToImprove: [],
        timestamp: new Date().toISOString()
      };
    }

    // Save evaluation
    setActiveCase(prev => prev ? {
      ...prev,
      evaluations: [...prev.evaluations, evaluation]
    } : null);

    setStepCompleted(true);
    setIsEvaluating(false);
  }, [activeCase, isDemo, apiKey, anesthesiaType, positioning, teamConfirmed, postOpMedications, postOpMonitoring, postOpInstructions, data.subjects]);

  // Advance to next step
  const handleNextStep = useCallback(() => {
    if (!activeCase) return;

    const stepOrder: ORStep[] = ['briefing', 'setup', 'procedure', 'complications', 'postop'];
    const currentIdx = stepOrder.indexOf(activeCase.currentStep);

    if (currentIdx < stepOrder.length - 1) {
      const nextStep = stepOrder[currentIdx + 1];
      setActiveCase(prev => prev ? { ...prev, currentStep: nextStep } : null);
      setStepCompleted(false);

      // Add system message when entering procedure chat
      if (nextStep === 'procedure') {
        const systemMsg: ORMessage = {
          id: generateId(),
          role: 'system',
          content: `Операцията започва. Вие сте асистиращ хирург на ${activeCase.procedureName}. Водещият хирург ще ви напътства. Отговаряйте на въпросите и помагайте.`,
          timestamp: new Date().toISOString()
        };
        setActiveCase(prev => prev ? { ...prev, procedureMessages: [systemMsg] } : null);
      }

      // Add system message when entering complications
      if (nextStep === 'complications') {
        const systemMsg: ORMessage = {
          id: generateId(),
          role: 'system',
          content: 'Възникна усложнение по време на операцията! Реагирайте бързо.',
          timestamp: new Date().toISOString()
        };
        setActiveCase(prev => prev ? { ...prev, complicationMessages: [systemMsg] } : null);
      }
    } else {
      // Last step - show results
      handleShowResults();
    }
  }, [activeCase]);

  // Show final results
  const handleShowResults = useCallback(async () => {
    if (!activeCase) return;

    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 60000);

    setActiveCase(prev => prev ? {
      ...prev,
      completedAt: new Date().toISOString(),
      timeSpentMinutes: timeSpent
    } : null);

    setShowResults(true);

    // Get summary
    if (isDemo) {
      await new Promise(r => setTimeout(r, 1500));
      const avgScore = activeCase.evaluations.length > 0
        ? Math.round(activeCase.evaluations.reduce((s, e) => s + e.score, 0) / activeCase.evaluations.length)
        : 75;
      setFinalSummary({
        overallScore: avgScore,
        grade: avgScore >= 90 ? 6 : avgScore >= 75 ? 5 : avgScore >= 60 ? 4 : avgScore >= 40 ? 3 : 2,
        summary: 'Добро представяне в операционната. Показахте разбиране на хирургичните стъпки и анатомичните ориентири.',
        keyLearnings: [
          'Идентификация на ключови анатомични структури при лапароскопия',
          'Стъпки на лапароскопска апендектомия',
          'Реакция при интраоперативно кървене'
        ],
        surgicalSkills: [
          'Познаване на хирургичните инструменти',
          'Комуникация в операционния екип'
        ],
        areasForReview: [
          'Постоперативни назначения и тромбопрофилактика'
        ],
        encouragement: 'Браво! Всяка операция е нов урок. Продължавай да учиш анатомия - тя е основата на хирургията.',
        nextSteps: 'Прегледай анатомията на илеоцекалната област и стъпките при усложнения.',
        suggestedImages: [
          { description: 'Анатомия на илеоцекалната област - a. appendicularis и мезоапендикс', type: 'anatomy' as const, topicId: '', subjectId: '' },
          { description: 'Лапароскопски инструменти - грасер, ножица, коагулатор', type: 'instrument' as const, topicId: '', subjectId: '' }
        ]
      });
    } else if (apiKey) {
      setIsLoadingSummary(true);
      try {
        // Collect cross-subject topics from evaluations
        const pharmacologyTopics = activeCase.evaluations
          .flatMap(e => e.pharmacologyTopics || [])
          .filter((v, i, a) => a.indexOf(v) === i);
        const anatomyTopics = activeCase.evaluations
          .flatMap(e => e.anatomyTopics || [])
          .filter((v, i, a) => a.indexOf(v) === i);

        const res = await fetchWithTimeout('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            mode: 'or_case_summary',
            caseData: {
              procedureName: activeCase.procedureName,
              specialty: activeCase.specialty,
              patient: activeCase.patient
            },
            evaluations: activeCase.evaluations.map(e => ({
              step: e.step,
              score: e.score,
              feedback: e.feedback
            })),
            timeSpentMinutes: timeSpent,
            crossSubjectTopics: {
              pharmacology: pharmacologyTopics,
              anatomy: anatomyTopics
            }
          }),
          timeout: 45000,
          signal: abortControllerRef.current?.signal
        });

        if (res.ok) {
          const result = await res.json();
          setFinalSummary(result.summary);
        }
      } catch (err) {
        console.error('Summary error:', err);
      } finally {
        setIsLoadingSummary(false);
      }
    }
  }, [activeCase, isDemo, apiKey]);

  // Reset everything
  const handleBackToSelection = useCallback(() => {
    setActiveCase(null);
    setIsDemo(false);
    setShowResults(false);
    setFinalSummary(null);
    setStepCompleted(false);
    setAnesthesiaType('');
    setPositioning('');
    setTeamConfirmed(false);
    setPostOpMedications('');
    setPostOpMonitoring('');
    setPostOpInstructions('');
    setChatInput('');
    setError(null);
  }, []);

  // ============================================
  // RENDER: Results View
  // ============================================
  if (showResults && activeCase) {
    const avgScore = activeCase.evaluations.length > 0
      ? Math.round(activeCase.evaluations.reduce((s, e) => s + e.score, 0) / activeCase.evaluations.length)
      : 0;
    const grade = avgScore >= 90 ? 6 : avgScore >= 75 ? 5 : avgScore >= 60 ? 4 : avgScore >= 40 ? 3 : 2;
    const gradeColors: Record<number, string> = {
      6: 'text-green-400 border-green-500/30 bg-green-500/10',
      5: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
      4: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
      3: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
      2: 'text-red-400 border-red-500/30 bg-red-500/10'
    };

    return (
      <div className="min-h-screen bg-[#0a0a1a] p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToSelection}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={20} /> Нов случай
            </button>
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Clock size={16} />
              {activeCase.timeSpentMinutes || Math.round((Date.now() - startTimeRef.current) / 60000)} мин
            </div>
          </div>

          {/* Grade Circle */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-slate-200 mb-4">{activeCase.procedureName}</h2>
            <p className="text-slate-400 mb-6">{activeCase.patient.diagnosis} | {activeCase.specialty}</p>

            <div className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 text-4xl font-bold mb-4 ${gradeColors[grade]}`}>
              {grade}
            </div>
            <p className="text-2xl font-bold text-slate-200 mb-1">{avgScore}%</p>
            <p className="text-slate-400">Средна оценка</p>
          </div>

          {/* Step Evaluations */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-slate-200 mb-4">Оценки по стъпки</h3>
            <div className="space-y-4">
              {activeCase.evaluations.map((ev, i) => {
                const stepInfo = OR_STEPS.find(s => s.step === ev.step);
                const scoreColor = ev.score >= 80 ? 'text-green-400' : ev.score >= 60 ? 'text-yellow-400' : 'text-red-400';
                return (
                  <div key={i} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {STEP_ICONS[ev.step]}
                        <span className="font-medium text-slate-200">{stepInfo?.name || ev.step}</span>
                      </div>
                      <span className={`text-lg font-bold ${scoreColor}`}>{ev.score}%</span>
                    </div>
                    <p className="text-slate-300 text-base leading-relaxed mb-3">{ev.feedback}</p>
                    {ev.strengths && ev.strengths.length > 0 && (
                      <div className="mb-2">
                        <span className="text-green-400 text-sm font-medium">Силни страни: </span>
                        <span className="text-slate-300 text-sm">{ev.strengths.join(', ')}</span>
                      </div>
                    )}
                    {ev.areasToImprove && ev.areasToImprove.length > 0 && (
                      <div>
                        <span className="text-amber-400 text-sm font-medium">За подобрение: </span>
                        <span className="text-slate-300 text-sm">{ev.areasToImprove.join(', ')}</span>
                      </div>
                    )}
                    {/* Suggested images per step */}
                    {ev.suggestedImages && ev.suggestedImages.length > 0 && (
                      <SuggestedImagesCard images={ev.suggestedImages} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final Summary */}
          {isLoadingSummary && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-400">Генериране на обобщение...</p>
            </div>
          )}

          {finalSummary && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-200">Обобщение</h3>

              {finalSummary.summary ? (
                <p className="text-slate-300 text-base leading-relaxed">{String(finalSummary.summary)}</p>
              ) : null}

              {(finalSummary.keyLearnings as string[])?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-green-400 mb-2">Научени уроци</h4>
                  <ul className="space-y-1">
                    {(finalSummary.keyLearnings as string[]).map((l, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-300 text-base">
                        <CheckCircle size={16} className="text-green-400 mt-1 flex-shrink-0" />
                        {String(l)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(finalSummary.surgicalSkills as string[])?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-blue-400 mb-2">Хирургични умения</h4>
                  <ul className="space-y-1">
                    {(finalSummary.surgicalSkills as string[]).map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-300 text-base">
                        <Scissors size={16} className="text-blue-400 mt-1 flex-shrink-0" />
                        {String(s)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {finalSummary.encouragement ? (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-blue-300 text-base leading-relaxed">{String(finalSummary.encouragement)}</p>
                </div>
              ) : null}

              {finalSummary.nextSteps ? (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-purple-400 mb-1">Следващи стъпки</h4>
                  <p className="text-purple-300 text-base">{String(finalSummary.nextSteps)}</p>
                </div>
              ) : null}

              {/* Summary suggested images */}
              {(finalSummary.suggestedImages as SuggestedImage[])?.length > 0 && (
                <SuggestedImagesCard images={finalSummary.suggestedImages as SuggestedImage[]} />
              )}
            </div>
          )}

          {/* Back button */}
          <button
            onClick={handleBackToSelection}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
          >
            Нова операция
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Active Case
  // ============================================
  if (activeCase) {
    const step = activeCase.currentStep;
    const stepInfo = OR_STEPS.find(s => s.step === step);
    const stepIdx = OR_STEPS.findIndex(s => s.step === step);

    return (
      <div className="min-h-screen bg-[#0a0a1a] p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToSelection}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={20} /> Назад
            </button>
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Clock size={16} />
              {Math.round((Date.now() - startTimeRef.current) / 60000)} мин
              {isDemo && <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-xs">ДЕМО</span>}
            </div>
          </div>

          {/* Case info bar */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-slate-200">{activeCase.procedureName}</h2>
              <span className="text-sm text-slate-400">{activeCase.specialty}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>{activeCase.patient.age}г. {activeCase.patient.gender === 'male' ? 'мъж' : 'жена'}</span>
              <span>{activeCase.patient.diagnosis}</span>
            </div>
          </div>

          {/* Step progress */}
          <div className="flex items-center gap-1">
            {OR_STEPS.map((s, i) => {
              const isActive = i === stepIdx;
              const isDone = i < stepIdx || (i === stepIdx && stepCompleted);
              const evalScore = activeCase.evaluations.find(e => e.step === s.step)?.score;
              return (
                <div key={s.step} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-full h-2 rounded-full ${
                    isDone ? 'bg-green-500/60' : isActive ? 'bg-blue-500/60' : 'bg-slate-700/50'
                  }`} />
                  <span className={`text-xs ${isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-slate-600'}`}>
                    {s.name}
                    {evalScore !== undefined && <span className="ml-1">({evalScore}%)</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Step content */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              {STEP_ICONS[step]}
              <h3 className="text-xl font-bold text-slate-200">{stepInfo?.name}</h3>
            </div>

            {/* Briefing */}
            {step === 'briefing' && (
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-blue-400 mb-2">Индикация</h4>
                  <p className="text-slate-200 text-base leading-relaxed">{activeCase.patient.indication}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Пациент</h4>
                    <p className="text-slate-200">{activeCase.patient.age}г. {activeCase.patient.gender === 'male' ? 'мъж' : 'жена'}</p>
                    <p className="text-slate-200 font-medium">{activeCase.patient.diagnosis}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Анамнеза</h4>
                    <p className="text-slate-300 text-sm leading-relaxed">{activeCase.patient.relevantHistory}</p>
                  </div>
                </div>
                <p className="text-slate-400 text-sm">Прочетете внимателно брифинга преди да продължите.</p>
              </div>
            )}

            {/* Setup */}
            {step === 'setup' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Вид анестезия</label>
                  <select
                    value={anesthesiaType}
                    onChange={e => setAnesthesiaType(e.target.value)}
                    className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Изберете...</option>
                    <option value="Обща ендотрахеална анестезия (ОЕА)">Обща ендотрахеална анестезия (ОЕА)</option>
                    <option value="Спинална анестезия">Спинална анестезия</option>
                    <option value="Епидурална анестезия">Епидурална анестезия</option>
                    <option value="Локална анестезия с i.v. седация">Локална анестезия с i.v. седация</option>
                    <option value="Регионален блок">Регионален блок</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Позиция на пациента</label>
                  <select
                    value={positioning}
                    onChange={e => setPositioning(e.target.value)}
                    className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Изберете...</option>
                    <option value="По гръб (supine)">По гръб (supine)</option>
                    <option value="По гръб с Trendelenburg">По гръб с Trendelenburg</option>
                    <option value="По гръб с ляв латерален наклон">По гръб с ляв латерален наклон</option>
                    <option value="По корем (prone)">По корем (prone)</option>
                    <option value="Странично (lateral decubitus)">Странично (lateral decubitus)</option>
                    <option value="Литотомна позиция">Литотомна позиция</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-700/30 rounded-xl cursor-pointer hover:border-slate-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={teamConfirmed}
                    onChange={e => setTeamConfirmed(e.target.checked)}
                    className="w-5 h-5 rounded accent-blue-500"
                  />
                  <div>
                    <span className="text-slate-200 font-medium">Потвърждаване на екипа (WHO Checklist)</span>
                    <p className="text-slate-400 text-sm">Правилен пациент, правилна процедура, правилна страна</p>
                  </div>
                </label>
              </div>
            )}

            {/* Procedure Chat */}
            {step === 'procedure' && (
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-xl border border-slate-700/30 h-[28rem] overflow-y-auto p-4 space-y-3">
                  {activeCase.procedureMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'student'
                          ? 'bg-blue-600/30 text-blue-100 border border-blue-500/20'
                          : msg.role === 'surgeon'
                            ? 'bg-green-600/20 text-green-100 border border-green-500/20'
                            : 'bg-slate-700/30 text-slate-300 border border-slate-600/20 text-center w-full'
                      }`}>
                        {msg.role !== 'system' && (
                          <div className="flex items-center gap-2 mb-1">
                            {msg.role === 'surgeon'
                              ? <Scissors size={14} className="text-green-400" />
                              : <User size={14} className="text-blue-400" />}
                            <span className="text-xs font-medium opacity-70">
                              {msg.role === 'surgeon' ? 'Хирург' : 'Вие'}
                            </span>
                          </div>
                        )}
                        <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isSendingMessage && (
                    <div className="flex justify-start">
                      <div className="bg-green-600/20 text-green-100 border border-green-500/20 rounded-2xl px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                    placeholder="Опишете действието си или отговорете на хирурга..."
                    className="flex-1 p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                    disabled={isSendingMessage}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isSendingMessage}
                    className="px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="text-slate-500 text-xs">Минимум 3 съобщения преди да можете да завършите стъпката.</p>
              </div>
            )}

            {/* Complications Chat */}
            {step === 'complications' && (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-2">
                  <p className="text-red-300 text-sm font-medium flex items-center gap-2">
                    <AlertCircle size={16} /> Усложнение по време на операцията!
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-xl border border-slate-700/30 h-[28rem] overflow-y-auto p-4 space-y-3">
                  {activeCase.complicationMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'student'
                          ? 'bg-blue-600/30 text-blue-100 border border-blue-500/20'
                          : msg.role === 'surgeon'
                            ? 'bg-red-600/20 text-red-100 border border-red-500/20'
                            : 'bg-slate-700/30 text-slate-300 border border-slate-600/20 text-center w-full'
                      }`}>
                        {msg.role !== 'system' && (
                          <div className="flex items-center gap-2 mb-1">
                            {msg.role === 'surgeon'
                              ? <AlertCircle size={14} className="text-red-400" />
                              : <User size={14} className="text-blue-400" />}
                            <span className="text-xs font-medium opacity-70">
                              {msg.role === 'surgeon' ? 'Хирург' : 'Вие'}
                            </span>
                          </div>
                        )}
                        <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isSendingMessage && (
                    <div className="flex justify-start">
                      <div className="bg-red-600/20 text-red-100 border border-red-500/20 rounded-2xl px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}}
                    placeholder="Какво правите? Как реагирате на усложнението?"
                    className="flex-1 p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 placeholder-slate-500 focus:border-red-500 focus:outline-none"
                    disabled={isSendingMessage}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isSendingMessage}
                    className="px-4 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Post-op Orders */}
            {step === 'postop' && (
              <div className="space-y-4">
                <p className="text-slate-400 text-sm">Операцията е завършена. Напишете постоперативните назначения.</p>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Медикаменти</label>
                  <textarea
                    value={postOpMedications}
                    onChange={e => setPostOpMedications(e.target.value)}
                    placeholder="Напр: Метамизол 1g i.v. на 8ч, Цефазолин 1g i.v. на 8ч..."
                    rows={4}
                    className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Мониториране</label>
                  <textarea
                    value={postOpMonitoring}
                    onChange={e => setPostOpMonitoring(e.target.value)}
                    placeholder="Напр: Витални на 4ч, диуреза, температура..."
                    rows={3}
                    className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Инструкции</label>
                  <textarea
                    value={postOpInstructions}
                    onChange={e => setPostOpInstructions(e.target.value)}
                    placeholder="Напр: Ранна мобилизация, течна диета, смяна на превръзки..."
                    rows={3}
                    className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step evaluation result */}
          {stepCompleted && activeCase.evaluations.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              {(() => {
                const lastEval = activeCase.evaluations[activeCase.evaluations.length - 1];
                const scoreColor = lastEval.score >= 80 ? 'text-green-400' : lastEval.score >= 60 ? 'text-yellow-400' : 'text-red-400';
                return (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-base font-medium text-slate-200">Оценка: {OR_STEPS.find(s => s.step === lastEval.step)?.name}</h4>
                      <span className={`text-2xl font-bold ${scoreColor}`}>{lastEval.score}%</span>
                    </div>
                    <p className="text-slate-300 text-base leading-relaxed mb-3">{lastEval.feedback}</p>
                    {lastEval.strengths && lastEval.strengths.length > 0 && (
                      <div className="mb-2">
                        <span className="text-green-400 text-sm font-medium">Силни страни: </span>
                        <span className="text-slate-300 text-sm">{lastEval.strengths.join(', ')}</span>
                      </div>
                    )}
                    {lastEval.areasToImprove && lastEval.areasToImprove.length > 0 && (
                      <div className="mb-2">
                        <span className="text-amber-400 text-sm font-medium">За подобрение: </span>
                        <span className="text-slate-300 text-sm">{lastEval.areasToImprove.join(', ')}</span>
                      </div>
                    )}
                    {lastEval.suggestedImages && lastEval.suggestedImages.length > 0 && (
                      <SuggestedImagesCard images={lastEval.suggestedImages} />
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!stepCompleted ? (
              <button
                onClick={handleCompleteStep}
                disabled={isEvaluating || (step === 'procedure' && activeCase.procedureMessages.filter(m => m.role === 'student').length < 3) || (step === 'complications' && activeCase.complicationMessages.filter(m => m.role === 'student').length < 1) || (step === 'setup' && (!anesthesiaType || !positioning))}
                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isEvaluating ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Оценяване...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Завърши стъпката
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNextStep}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {stepIdx < OR_STEPS.length - 1 ? (
                  <>
                    Следваща стъпка: {OR_STEPS[stepIdx + 1]?.name}
                    <ChevronRight size={18} />
                  </>
                ) : (
                  <>
                    Виж резултатите
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Selection Screen
  // ============================================
  return (
    <div className="min-h-screen bg-[#0a0a1a] p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Scissors className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Операционна зала</h1>
            <p className="text-slate-400">Влезте в ролята на асистиращ хирург</p>
          </div>
        </div>

        {/* Demo card */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Play className="w-6 h-6 text-green-400" />
            <h3 className="text-lg font-bold text-green-300">Демо: Лапароскопска апендектомия</h3>
          </div>
          <p className="text-slate-300 text-base mb-4 leading-relaxed">
            Изпробвайте операционната зала с демо случай. 24-годишен мъж с остър апендицит.
            Ще преминете през всички 5 стъпки: брифинг, подготовка, процедура, усложнение и постоперативни назначения.
          </p>
          <button
            onClick={startDemoCase}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            <Play size={18} /> Стартирай демо
          </button>
        </div>

        {/* Generate from material */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-200 mb-4">Генерирай от материал</h3>

          {!apiKey && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
              <p className="text-amber-300 text-sm">Нужен е API ключ. Добавете го в <Link href="/settings" className="underline">Настройки</Link>.</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Предмет</label>
              <select
                value={selectedSubject}
                onChange={e => { setSelectedSubject(e.target.value); setSelectedTopic(''); }}
                className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Изберете предмет...</option>
                {activeSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {selectedSubject && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Тема ({availableTopics.length} с материал)
                </label>
                <select
                  value={selectedTopic}
                  onChange={e => setSelectedTopic(e.target.value)}
                  className="w-full p-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Изберете тема...</option>
                  {availableTopics.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Сложност</label>
              <div className="flex gap-2">
                {(['beginner', 'intermediate', 'advanced'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setSelectedDifficulty(d)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      selectedDifficulty === d
                        ? d === 'beginner' ? 'bg-green-600/30 text-green-300 border border-green-500/30'
                          : d === 'intermediate' ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/30'
                            : 'bg-red-600/30 text-red-300 border border-red-500/30'
                        : 'bg-slate-900/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    {d === 'beginner' ? 'Начинаещ' : d === 'intermediate' ? 'Среден' : 'Напреднал'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateCase}
              disabled={!apiKey || !selectedTopic || isGenerating}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Генериране...
                </>
              ) : (
                <>
                  <Scissors size={18} /> Генерирай операция
                </>
              )}
            </button>
          </div>
        </div>

        {/* Cross-subject info */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
          <h4 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
            <BookOpen size={16} /> Междупредметна интеграция
          </h4>
          <p className="text-purple-300/80 text-sm leading-relaxed">
            Операционната зала автоматично интегрира теми от Анатомия и Фармакология.
            AI ще ви пита за анатомични структури по време на процедурата и ще оцени
            фармакологичните ви знания при постоперативните назначения.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Suggested Images Card component
function SuggestedImagesCard({ images }: { images: SuggestedImage[] }) {
  const typeLabels: Record<string, string> = {
    ecg: 'ЕКГ',
    anatomy: 'Анатомия',
    imaging: 'Образна диагн.',
    instrument: 'Инструмент',
    pathology: 'Патология'
  };

  const typeColors: Record<string, string> = {
    ecg: 'bg-red-500/20 text-red-300 border-red-500/30',
    anatomy: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    imaging: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    instrument: 'bg-green-500/20 text-green-300 border-green-500/30',
    pathology: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
  };

  return (
    <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
      <h5 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
        <Shield size={14} /> Предложени изображения за качване
      </h5>
      <div className="space-y-2">
        {images.map((img, i) => (
          <div key={i} className="flex items-start gap-3 bg-slate-900/30 rounded-lg p-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${typeColors[img.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
              {typeLabels[img.type] || img.type}
            </span>
            <p className="text-slate-300 text-sm flex-1">{img.description}</p>
            {img.topicId && (
              <Link
                href={`/subjects?id=${img.subjectId}`}
                className="text-amber-400 text-xs hover:underline flex-shrink-0"
              >
                Отвори тема
              </Link>
            )}
          </div>
        ))}
      </div>
      <p className="text-amber-400/60 text-xs mt-2">Качете тези изображения в материалите си за визуално учене.</p>
    </div>
  );
}

// Demo helper functions
function getDemoFeedback(step: string): string {
  const feedbacks: Record<string, string> = {
    briefing: 'Добро запознаване с брифинга. Прочетохте основната информация за пациента и индикацията за операцията.',
    setup: 'Добър избор на анестезия и позициониране. WHO Checklist-ът е важна стъпка за безопасността.',
    procedure: 'Активно участие по време на процедурата. Показахте познания за хирургичните стъпки и анатомичните ориентири.',
    complications: 'Реагирахте на усложнението. В реална ситуация е важно бързо да се овладее кървенето и да се запази видимостта.',
    postop: 'Добри постоперативни назначения. Включихте аналгезия и антибиотична профилактика.'
  };
  return feedbacks[step] || 'Завършена стъпка.';
}

function getDemoStrengths(step: string): string[] {
  const strengths: Record<string, string[]> = {
    briefing: ['Внимателно четене на случая'],
    setup: ['Правилен избор на анестезия', 'Потвърждение на WHO Checklist'],
    procedure: ['Активна комуникация с хирурга', 'Познаване на анатомичните структури'],
    complications: ['Бърза реакция при усложнение'],
    postop: ['Адекватна аналгезия', 'Антибиотична профилактика']
  };
  return strengths[step] || [];
}

function getDemoImprovements(step: string): string[] {
  const improvements: Record<string, string[]> = {
    briefing: ['Може да се запитате за алергии и коморбидности по-детайлно'],
    setup: ['Обосновете избора на анестезия спрямо типа операция'],
    procedure: ['Споменавайте конкретни анатомични структури по-често'],
    complications: ['Посочете конкретен инструмент за хемостаза'],
    postop: ['Добавете тромбопрофилактика', 'Уточнете диетичния режим']
  };
  return improvements[step] || [];
}

function getDemoSuggestedImages(step: string): SuggestedImage[] {
  const images: Record<string, SuggestedImage[]> = {
    procedure: [
      { description: 'Анатомия на илеоцекалния ъгъл - цекум, апендикс, терминален илеум', type: 'anatomy', topicId: '', subjectId: '' },
      { description: 'Лапароскопски инструменти - грасер, биполярен коагулатор, ендолупи', type: 'instrument', topicId: '', subjectId: '' }
    ],
    complications: [
      { description: 'A. appendicularis - ход и вариации', type: 'anatomy', topicId: '', subjectId: '' }
    ],
    postop: [
      { description: 'Рентгенография на корем - нормална находка постоперативно', type: 'imaging', topicId: '', subjectId: '' }
    ]
  };
  return images[step] || [];
}

export default function ORRoomPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Зареждане...</p>
        </div>
      </div>
    }>
      <ORRoomContent />
    </Suspense>
  );
}
