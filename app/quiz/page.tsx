'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Brain, CheckCircle, RefreshCw, ArrowLeft, Settings, AlertCircle, Sparkles, Lightbulb, FileText } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import { BLOOM_LEVELS, BloomLevel, QuizLengthPreset, QUIZ_LENGTH_PRESETS, WrongAnswer } from '@/lib/types';
import { QuizMode, Question, FreeRecallEvaluation, OpenAnswerEvaluation, MistakeAnalysis, QuizState, buildMasteryContext, calculateScore, getGradeFromScore } from '@/lib/quiz-types';
import { fetchWithTimeout, getFetchErrorMessage, isAbortOrTimeoutError } from '@/lib/fetch-utils';
import { showToast } from '@/components/Toast';
import { useQuizTimer } from '@/hooks/useQuizTimer';
import { useQuizGeneration } from '@/hooks/useQuizGeneration';
import { QuizModeSelector } from '@/components/quiz/QuizModeSelector';
import { QuizQuestion } from '@/components/quiz/QuizQuestion';
import { QuizResults } from '@/components/quiz/QuizResults';
import { QuizPreview } from '@/components/quiz/QuizPreview';

function QuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subjectId = searchParams.get('subject');
  const topicId = searchParams.get('topic');
  const isMultiMode = searchParams.get('multi') === 'true';
  const topicsParam = searchParams.get('topics');

  // Module quiz params (Projects 2.0)
  const projectId = searchParams.get('project');
  const moduleId = searchParams.get('module');

  const { data, addGrade, addModuleGrade, incrementApiCalls, updateTopic, trackTopicRead, updateProjectModule } = useApp();

  // Get project and module if this is a module quiz
  const project = projectId ? data.developmentProjects.find(p => p.id === projectId) : null;
  const module = project && moduleId ? project.modules.find(m => m.id === moduleId) : null;
  const isModuleQuiz = !!project && !!module;

  // Quiz generation hook (abort controller, retry logic, elapsed counter)
  const gen = useQuizGeneration();

  // Filter out archived and soft-deleted subjects for selection
  const activeSubjects = useMemo(
    () => data.subjects.filter(s => !s.archived && !s.deletedAt),
    [data.subjects]
  );

  // Parse multi-topic params
  const multiTopics = useMemo(() => {
    if (!isMultiMode || !topicsParam) return [];
    return topicsParam.split(',').map(pair => {
      const [subjId, topId] = pair.split(':');
      const subj = data.subjects.find(s => s.id === subjId);
      const top = subj?.topics.find(t => t.id === topId);
      if (!subj || !top) return null;
      return { subject: subj, topic: top };
    }).filter(Boolean) as Array<{ subject: typeof data.subjects[0]; topic: typeof data.subjects[0]['topics'][0] }>;
  }, [isMultiMode, topicsParam, data.subjects]);

  // Quiz settings
  const [mode, setMode] = useState<QuizMode | null>(null); // null = no selection yet
  const [quizLength, setQuizLength] = useState<QuizLengthPreset>('standard');
  const [matchExamFormat, setMatchExamFormat] = useState(false);
  const [showCustomOptions, setShowCustomOptions] = useState(false);
  const [customQuestionCount, setCustomQuestionCount] = useState(5);
  const [customBloomLevel, setCustomBloomLevel] = useState<BloomLevel>(1);
  const [selectedModel, setSelectedModel] = useState<'opus' | 'sonnet' | 'haiku'>('sonnet'); // Default to Sonnet for balance

  // Quiz state
  const [quizState, setQuizState] = useState<QuizState>({
    questions: [],
    currentIndex: 0,
    answers: [],
    showResult: false,
    isGenerating: false,
    error: null
  });
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [openAnswer, setOpenAnswer] = useState('');
  const [openHint, setOpenHint] = useState<string | null>(null);
  const [openHintLoading, setOpenHintLoading] = useState(false);

  // Preview screen state
  const [showPreview, setShowPreview] = useState(false);
  const [previewQuestionCount, setPreviewQuestionCount] = useState(12);

  // Multi-topic mode (selectedTopics used by resetQuiz)
  const [selectedTopics, setSelectedTopics] = useState<Array<{ subjectId: string; topicId: string }>>([]);

  // Free recall state
  const [freeRecallText, setFreeRecallText] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [freeRecallEvaluation, setFreeRecallEvaluation] = useState<FreeRecallEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Open answer AI evaluation
  const [openEvaluations, setOpenEvaluations] = useState<Record<number, OpenAnswerEvaluation>>({});
  const [isEvaluatingOpen, setIsEvaluatingOpen] = useState(false);

  // Timer (extracted hook)
  const timer = useQuizTimer(
    quizState.questions.length > 0,
    quizState.showResult
  );

  // Early termination state
  const [showEarlyStopConfirm, setShowEarlyStopConfirm] = useState(false);

  // Back navigation confirmation state
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // Question count warning
  const [countWarning, setCountWarning] = useState<string | null>(null);

  // Cross-topic drill weakness
  const [crossTopicDrill, setCrossTopicDrill] = useState(false);

  // Mistake analysis state
  const [mistakeAnalysis, setMistakeAnalysis] = useState<MistakeAnalysis | null>(null);
  const [isAnalyzingMistakes, setIsAnalyzingMistakes] = useState(false);

  // Cloze card generation state
  const [clozeCards, setClozeCards] = useState<string[] | null>(null);
  const [isGeneratingCloze, setIsGeneratingCloze] = useState(false);
  const [clozeError, setClozeError] = useState<string | null>(null);

  // Grade save state - prevents duplicate saves and shows feedback
  const [gradeSaved, setGradeSaved] = useState(false);
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  const MAX_HINTS = 3;

  const subject = data.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);

  // Unified quiz target - either topic or module
  const quizTarget = useMemo(() => {
    if (isModuleQuiz && module) {
      return {
        name: module.title,
        material: module.material,
        currentBloomLevel: module.currentBloomLevel || 1,
        quizHistory: module.quizHistory || [],
        wrongAnswers: module.wrongAnswers || [],
        isModule: true,
        projectName: project?.name
      };
    }
    if (topic) {
      return {
        name: topic.name,
        material: topic.material,
        currentBloomLevel: topic.currentBloomLevel || 1,
        quizHistory: topic.quizHistory || [],
        wrongAnswers: topic.wrongAnswers || [],
        isModule: false,
        projectName: undefined
      };
    }
    return null;
  }, [isModuleQuiz, module, project, topic]);

  // Cross-topic weakness stats for the selected subject
  const subjectWeaknessStats = useMemo(() => {
    if (!subject || isModuleQuiz) return null;
    const allWrongAnswers = subject.topics.flatMap(t => t.wrongAnswers || []);
    const unmastered = allWrongAnswers.filter(wa => wa.drillCount < 3);
    const mastered = allWrongAnswers.length - unmastered.length;
    return { total: allWrongAnswers.length, unmastered: unmastered.length, mastered };
  }, [subject, isModuleQuiz]);

  // Get prioritized cross-topic wrong answers (sorted by drillCount asc, date desc, capped at 30)
  const crossTopicWrongAnswers = useMemo(() => {
    if (!subject || !crossTopicDrill) return [];
    return subject.topics
      .flatMap(t => t.wrongAnswers || [])
      .filter(wa => wa.drillCount < 3)
      .sort((a, b) => {
        if (a.drillCount !== b.drillCount) return a.drillCount - b.drillCount;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      })
      .slice(0, 30);
  }, [subject, crossTopicDrill]);

  // Validation state - detect when params don't match existing data
  const [invalidParamsWarning, setInvalidParamsWarning] = useState<string | null>(null);

  // Validate search params on mount
  useEffect(() => {
    if (subjectId && !subject) {
      setInvalidParamsWarning(`Предмет с ID "${subjectId}" не съществува.`);
    } else if (subjectId && topicId && !topic) {
      setInvalidParamsWarning(`Тема с ID "${topicId}" не съществува в предмет "${subject?.name}".`);
    } else if (isMultiMode && topicsParam) {
      const invalidTopics = topicsParam.split(',').filter(pair => {
        const [subjId, topId] = pair.split(':');
        const subj = data.subjects.find(s => s.id === subjId);
        const top = subj?.topics.find(t => t.id === topId);
        return !subj || !top;
      });
      if (invalidTopics.length > 0) {
        setInvalidParamsWarning(`${invalidTopics.length} невалидни теми бяха пропуснати.`);
      }
    } else {
      setInvalidParamsWarning(null);
    }
  }, [subjectId, topicId, subject, topic, isMultiMode, topicsParam, data.subjects]);

  // Initialize custom bloom level from topic
  useEffect(() => {
    if (topic?.currentBloomLevel) {
      setCustomBloomLevel(topic.currentBloomLevel);
    }
  }, [topic?.currentBloomLevel]);

  // Generate AI recommendation for which MODE to use
  const getRecommendation = (): { recommendation: string; suggestedMode: QuizMode } | null => {
    if (!topic || !subject) return null;

    const daysUntilExam = subject.examDate
      ? Math.ceil((new Date(subject.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const bloomLevel = topic.currentBloomLevel || 1;
    const bloomName = BLOOM_LEVELS.find(b => b.level === bloomLevel)?.name || 'Запомняне';

    // AI logic to recommend which mode
    if (topic.quizCount === 0) {
      return {
        recommendation: `Първи тест по темата → Assess My Level за определяне на начално ниво.`,
        suggestedMode: 'assessment'
      };
    }

    if (daysUntilExam !== null && daysUntilExam <= 3) {
      return {
        recommendation: `${daysUntilExam} дни до изпита! → Gap Analysis за откриване на слаби места.`,
        suggestedMode: 'gap_analysis'
      };
    }

    if (bloomLevel >= 5) {
      return {
        recommendation: `Ниво ${bloomLevel} (${bloomName}) → Higher-Order за предизвикателни въпроси.`,
        suggestedMode: 'higher_order'
      };
    }

    if (bloomLevel >= 3) {
      return {
        recommendation: `Ниво ${bloomLevel} (${bloomName}) → Mid-Order за прилагане и анализ.`,
        suggestedMode: 'mid_order'
      };
    }

    if (daysUntilExam !== null && daysUntilExam <= 14) {
      return {
        recommendation: `${daysUntilExam} дни до изпита → Free Recall за дълбоко затвърждаване.`,
        suggestedMode: 'free_recall'
      };
    }

    return {
      recommendation: `Ниво: ${bloomName}. → Assess My Level за проверка на прогреса.`,
      suggestedMode: 'assessment'
    };
  };

  const aiRecommendation = getRecommendation();

  // NOTE: Removed auto-selection - let user choose their preferred mode
  // AI recommendation is displayed but not auto-selected

  // Timer effects are now in useQuizTimer hook
  // Prevent accidental navigation away during active quiz
  useEffect(() => {
    // Only warn if quiz is in progress (has questions and not showing results)
    const isQuizActive = quizState.questions.length > 0 && !quizState.showResult;

    if (!isQuizActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers require returnValue to be set
      e.returnValue = 'Имаш незавършен тест. Сигурен ли си, че искаш да напуснеш?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quizState.questions.length, quizState.showResult]);

  // Keyboard shortcuts for MCQ (1-4 or A-D to select, Enter to submit)
  useEffect(() => {
    if (quizState.questions.length === 0 || quizState.showResult) return;

    const currentQuestion = quizState.questions[quizState.currentIndex];
    if (currentQuestion.type !== 'multiple_choice' && currentQuestion.type !== 'case_study') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in textarea
      if (e.target instanceof HTMLTextAreaElement) return;

      const options = currentQuestion.options || [];

      // Number keys 1-4 or letter keys A-D to select
      if (!showExplanation) {
        if ((e.key >= '1' && e.key <= '4') || (e.key.toUpperCase() >= 'A' && e.key.toUpperCase() <= 'D')) {
          let index: number;
          if (e.key >= '1' && e.key <= '4') {
            index = parseInt(e.key, 10) - 1;
          } else {
            index = e.key.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
          }
          if (index < options.length) {
            setSelectedAnswer(options[index]);
          }
        }

        // Enter to submit - call handleAnswer to record time + save answer
        if (e.key === 'Enter' && selectedAnswer) {
          e.preventDefault();
          handleAnswer();
        }
      } else {
        // After showing explanation, Enter to go next - call handleNext to persist answer
        if (e.key === 'Enter') {
          e.preventDefault();
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quizState.questions, quizState.currentIndex, quizState.showResult, showExplanation, selectedAnswer]);

  // Auto-save grade when quiz results appear (feedback loop: quiz → topic status)
  useEffect(() => {
    if (!quizState.showResult || gradeSaved || isSavingGrade) return;
    if (quizState.questions.length === 0) return;
    // Auto-save for topic quizzes (not module)
    if (!isModuleQuiz && subjectId && topicId && topic && subject) {
      handleSaveGrade();
    } else if (isModuleQuiz && projectId && moduleId && module) {
      handleSaveGrade();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizState.showResult]);

  // Format time helper
  // formatTime is now in useQuizTimer hook
  // Open preview screen and set initial question count
  const openPreview = () => {
    const initialCount = mode === 'custom'
      ? customQuestionCount
      : QUIZ_LENGTH_PRESETS[quizLength].questions;
    setPreviewQuestionCount(initialCount);
    setShowPreview(true);
  };

  const generateQuiz = async () => {
    if (quizState.isGenerating) return;

    if (!mode) {
      setQuizState(prev => ({ ...prev, error: 'Избери режим на теста.' }));
      return;
    }

    // free_recall requires material (compares student recall against it)
    if (mode === 'free_recall' && !topic?.material?.trim()) {
      setQuizState(prev => ({ ...prev, error: 'Free Recall изисква добавен материал към темата.' }));
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setQuizState(prev => ({ ...prev, error: 'API_KEY_MISSING' }));
      return;
    }

    setQuizState(prev => ({ ...prev, isGenerating: true, error: null }));

    // Build request body
    const questionCount = previewQuestionCount;
    let requestBody;

    if (isMultiMode && multiTopics.length > 0) {
      const combinedMaterial = multiTopics.map(({ subject: s, topic: t }) =>
        `=== ТЕМА: ${t.name} (${s.name}) ===\n${t.material}`
      ).join('\n\n---\n\n');
      const topicNames = multiTopics.map(({ topic: t }) => t.name).join(', ');
      const avgBloom = Math.round(
        multiTopics.reduce((sum, { topic: t }) => sum + (t.currentBloomLevel || 1), 0) / multiTopics.length
      );
      requestBody = {
        apiKey, material: combinedMaterial,
        topicName: `Mix: ${multiTopics.length} теми`,
        subjectName: multiTopics.map(({ subject: s }) => s.name).filter((v, i, a) => a.indexOf(v) === i).join(', '),
        subjectType: multiTopics[0]?.subject.subjectType || 'preclinical',
        examFormat: multiTopics[0]?.subject.examFormat,
        matchExamFormat, mode, questionCount,
        bloomLevel: mode === 'custom' ? customBloomLevel : null,
        currentBloomLevel: avgBloom, isMultiTopic: true, topicsList: topicNames, model: selectedModel
      };
    } else {
      requestBody = {
        apiKey, material: topic?.material, topicName: topic?.name,
        subjectName: subject?.name || '',
        subjectType: subject?.subjectType || 'preclinical',
        examFormat: subject?.examFormat, matchExamFormat, mode, questionCount,
        bloomLevel: mode === 'custom' ? customBloomLevel : null,
        currentBloomLevel: topic?.currentBloomLevel || 1,
        quizHistory: topic?.quizHistory,
        wrongAnswers: mode === 'drill_weakness'
          ? (crossTopicDrill ? crossTopicWrongAnswers : topic?.wrongAnswers)
          : mode === 'gap_analysis' ? topic?.wrongAnswers : undefined,
        model: selectedModel,
        masteryContext: topic ? buildMasteryContext(topic) : undefined
      };
    }

    // Generate with retry logic (handled by hook)
    const result = await gen.generate(requestBody, {
      onRetry: () => showToast('Първият опит се провали, опитвам отново...', 'info')
    });

    if (result.error) {
      setQuizState(prev => ({ ...prev, isGenerating: false, error: result.error! }));
      return;
    }

    if (result.usage) incrementApiCalls(result.usage.cost);
    setCountWarning(result.countWarning || null);
    setQuizState({
      questions: result.questions!,
      currentIndex: 0,
      answers: new Array(result.questions!.length).fill(null),
      showResult: false, isGenerating: false, error: null
    });
    timer.initQuestionTimes(result.questions!.length);
  };

  const cancelGeneration = () => {
    gen.cancel();
    setQuizState(prev => ({ ...prev, isGenerating: false, error: null }));
  };

  const requestHint = async () => {
    if (hintLoading || hintsUsed >= MAX_HINTS || !topic?.material) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setHintLoading(true);
    try {
      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'free_recall',
          requestHint: true,
          material: topic.material,
          topicName: topic.name,
          userRecall: freeRecallText,
          hintContext: ''
        }),
        
        signal: gen.abortControllerRef.current?.signal
      });

      const result = await response.json();
      if (result.hint) {
        setCurrentHint(result.hint);
        setHintsUsed(prev => prev + 1);
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch {
      // Silently fail
    }
    setHintLoading(false);
  };

  // Request structural hint for open questions
  const requestOpenHint = async () => {
    if (openHintLoading) return;

    const currentQuestion = quizState.questions[quizState.currentIndex];
    if (!currentQuestion || currentQuestion.type !== 'open') return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setOpenHintLoading(true);
    try {
      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'open_hint',
          question: currentQuestion.question,
          bloomLevel: currentQuestion.bloomLevel || 3,
          concept: currentQuestion.concept
        }),
        
        signal: gen.abortControllerRef.current?.signal
      });

      const result = await response.json();
      if (result.hint) {
        setOpenHint(result.hint);
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch {
      // Silently fail
    }
    setOpenHintLoading(false);
  };

  const evaluateFreeRecall = async () => {
    if (isEvaluating || !freeRecallText.trim() || !topic?.material) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setIsEvaluating(true);
    try {
      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'free_recall',
          material: topic.material,
          topicName: topic.name,
          subjectName: subject?.name,
          userRecall: freeRecallText
        }),
        signal: gen.abortControllerRef.current?.signal
      });

      const result = await response.json();
      if (result.evaluation) {
        setFreeRecallEvaluation(result.evaluation);
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch {
      // Handle error
    }
    setIsEvaluating(false);
  };

  const handleAnswer = async () => {
    if (isEvaluatingOpen) return; // Guard against double-click
    const questionIndex = quizState.currentIndex; // Capture index before any async gap
    const currentQuestion = quizState.questions[questionIndex];
    const answer = currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study'
      ? selectedAnswer
      : openAnswer;

    const newAnswers = [...quizState.answers];
    newAnswers[questionIndex] = answer;

    // Persist the answer immediately so early stop captures it
    setQuizState(prev => ({ ...prev, answers: newAnswers }));

    // Record time spent on this question
    timer.recordQuestionTime(questionIndex);

    // For open questions, evaluate with AI
    if (currentQuestion.type === 'open' && openAnswer.trim()) {
      const apiKey = localStorage.getItem('claude-api-key');
      if (apiKey) {
        setIsEvaluatingOpen(true);
        try {
          const response = await fetchWithTimeout('/api/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey,
              mode: 'evaluate_open',
              question: currentQuestion.question,
              userAnswer: openAnswer,
              correctAnswer: currentQuestion.correctAnswer,
              bloomLevel: currentQuestion.bloomLevel || 3
            }),

            signal: gen.abortControllerRef.current?.signal
          });

          const result = await response.json();
          if (result.evaluation) {
            setOpenEvaluations(prev => ({
              ...prev,
              [questionIndex]: result.evaluation
            }));
            if (result.usage) incrementApiCalls(result.usage.cost);
          }
        } catch {
          // Fallback - show explanation without AI feedback
        }
        setIsEvaluatingOpen(false);
      }
    }

    setShowExplanation(true);
  };

  const handleNext = () => {
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const answer = currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study'
      ? selectedAnswer
      : openAnswer;

    const newAnswers = [...quizState.answers];
    newAnswers[quizState.currentIndex] = answer;

    if (quizState.currentIndex < quizState.questions.length - 1) {
      setQuizState(prev => ({
        ...prev,
        currentIndex: prev.currentIndex + 1,
        answers: newAnswers
      }));
      setSelectedAnswer(null);
      setOpenAnswer('');
      setOpenHint(null);
      setShowExplanation(false);
    } else {
      setQuizState(prev => ({
        ...prev,
        answers: newAnswers,
        showResult: true
      }));
    }
  };

  // Early quiz termination - finish with answered questions only
  const handleEarlyStop = () => {
    // Save current answer if any
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const answer = currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study'
      ? selectedAnswer
      : openAnswer;

    const newAnswers = [...quizState.answers];
    if (answer) {
      newAnswers[quizState.currentIndex] = answer;
    }

    // Trim questions and answers to only answered ones
    const answeredCount = newAnswers.filter(a => a !== null).length;
    const trimmedQuestions = quizState.questions.slice(0, answeredCount || quizState.currentIndex);
    const trimmedAnswers = newAnswers.slice(0, answeredCount || quizState.currentIndex);

    setQuizState(prev => ({
      ...prev,
      questions: trimmedQuestions.length > 0 ? trimmedQuestions : prev.questions.slice(0, 1),
      answers: trimmedAnswers.length > 0 ? trimmedAnswers : [null],
      showResult: true
    }));
    setShowEarlyStopConfirm(false);
  };

  // Analyze mistakes using AI
  const analyzeMistakes = async () => {
    if (isAnalyzingMistakes) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!topic || !subject || !apiKey) return;

    // Collect mistakes from the quiz
    const mistakes: Array<{
      question: string;
      userAnswer: string;
      correctAnswer: string;
      concept?: string;
      bloomLevel?: number;
    }> = [];

    quizState.questions.forEach((q, i) => {
      const userAnswer = quizState.answers[i];

      if (q.type === 'multiple_choice' || q.type === 'case_study') {
        if (userAnswer !== q.correctAnswer) {
          mistakes.push({
            question: q.question,
            userAnswer: userAnswer || '(без отговор)',
            correctAnswer: q.correctAnswer,
            concept: q.concept,
            bloomLevel: q.bloomLevel
          });
        }
      } else if (q.type === 'open') {
        const evaluation = openEvaluations[i];
        if (!evaluation || evaluation.score < 0.7) {
          mistakes.push({
            question: q.question,
            userAnswer: userAnswer || '(без отговор)',
            correctAnswer: q.correctAnswer,
            concept: q.concept,
            bloomLevel: q.bloomLevel
          });
        }
      }
    });

    if (mistakes.length === 0) {
      setMistakeAnalysis({
        summary: 'Отлично представяне! Няма значителни грешки за анализ.',
        weakConcepts: [],
        patterns: [],
        recommendations: [],
        priorityFocus: null
      });
      return;
    }

    setIsAnalyzingMistakes(true);
    try {
      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'analyze_mistakes',
          mistakes,
          topicName: topic.name,
          subjectName: subject.name
        }),
        signal: gen.abortControllerRef.current?.signal
      });

      const result = await response.json();
      if (result.error) {
        console.error("Mistake analysis error:", result.error);
        setMistakeAnalysis({
          summary: "Грешка при анализа: " + result.error,
          weakConcepts: [],
          patterns: [],
          recommendations: [],
          priorityFocus: null
        });
      } else if (result.analysis) {
        setMistakeAnalysis(result.analysis);
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch (err) {
      console.error("Mistake analysis fetch error:", err);
      setMistakeAnalysis({
        summary: getFetchErrorMessage(err),
        weakConcepts: [],
        patterns: [],
        recommendations: [],
        priorityFocus: null
      });
    }
    setIsAnalyzingMistakes(false);
  };

  const generateClozeCards = async () => {
    if (isGeneratingCloze) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setClozeError('API ключът не е конфигуриран. Добави го в Настройки.');
      return;
    }

    const topicName = isModuleQuiz ? module?.title : topic?.name;

    // Collect wrong answers with student's actual answer
    const wrongAnswers: Array<{
      question: string;
      userAnswer: string | null;
      correctAnswer: string;
      explanation?: string;
    }> = [];

    quizState.questions.forEach((q, i) => {
      const userAnswer = quizState.answers[i];
      if (q.type === 'open') {
        const evaluation = openEvaluations[i];
        if (!evaluation || evaluation.score < 0.7) {
          wrongAnswers.push({
            question: q.question,
            userAnswer: userAnswer,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation
          });
        }
      } else {
        if (userAnswer !== q.correctAnswer) {
          wrongAnswers.push({
            question: q.question,
            userAnswer: userAnswer,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation
          });
        }
      }
    });

    if (wrongAnswers.length === 0) return;

    setIsGeneratingCloze(true);
    setClozeError(null);

    try {
      const response = await fetchWithTimeout('/api/anki-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, wrongAnswers, topicName }),
        signal: gen.abortControllerRef.current?.signal,
        timeout: 30000
      });

      const result = await response.json();
      if (result.error) {
        setClozeError(result.error);
      } else if (result.cards) {
        setClozeCards(result.cards);
      }
    } catch (err) {
      if (!isAbortOrTimeoutError(err)) {
        setClozeError(getFetchErrorMessage(err));
      }
    }
    setIsGeneratingCloze(false);
  };

  const handleSaveGrade = () => {
    // Prevent duplicate saves
    // Support both topic quizzes and module quizzes
    const isValidTopicQuiz = !isModuleQuiz && subjectId && topicId && topic;
    const isValidModuleQuiz = isModuleQuiz && projectId && moduleId && module;

    if (gradeSaved || isSavingGrade) return;
    if (!isValidTopicQuiz && !isValidModuleQuiz) return;
    if (quizState.questions.length === 0) return; // Guard against division by zero
    setIsSavingGrade(true);
    const score = calculateScore(quizState.questions, quizState.answers, openEvaluations);
    const grade = getGradeFromScore(score, quizState.questions.length);
    const percentage = (score / quizState.questions.length) * 100;

    // Pass quiz metadata for accurate history tracking
    // Use preset weight for consistent quiz weighting
    const quizWeight = mode === 'custom' ? 1.0 : QUIZ_LENGTH_PRESETS[quizLength].weight;

    // Save grade using appropriate function
    if (isModuleQuiz && projectId && moduleId && module) {
      addModuleGrade(projectId, moduleId, grade, {
        bloomLevel: module.currentBloomLevel || 1,
        questionsCount: quizState.questions.length,
        correctAnswers: score,
        weight: quizWeight
      });
    } else if (subjectId && topicId && topic) {
      addGrade(subjectId, topicId, grade, {
        bloomLevel: topic.currentBloomLevel || 1,
        questionsCount: quizState.questions.length,
        correctAnswers: score,
        weight: quizWeight
      });
    }
    // Note: Don't track as "read" here - quizzes test knowledge, not reading

    // Collect wrong answers AND track correctly answered concepts
    const newWrongAnswers: WrongAnswer[] = [];
    const masteredConcepts: Set<string> = new Set(); // Concepts answered correctly this quiz

    quizState.questions.forEach((q, i) => {
      const userAnswer = quizState.answers[i];
      const concept = q.concept || 'General';

      // Track MCQ/case_study based on exact match
      if (q.type === 'multiple_choice' || q.type === 'case_study') {
        const isCorrect = userAnswer === q.correctAnswer;

        if (isCorrect) {
          masteredConcepts.add(concept);
        } else if (userAnswer !== null) {
          newWrongAnswers.push({
            question: q.question,
            userAnswer: userAnswer,
            correctAnswer: q.correctAnswer,
            concept: concept,
            bloomLevel: q.bloomLevel || 1,
            date: new Date().toISOString(),
            drillCount: 0,
            timeSpent: timer.questionTimes[i] || 0
          });
        }
      }
      // Track open questions based on AI evaluation
      else if (q.type === 'open') {
        const evaluation = openEvaluations[i];
        if (evaluation) {
          if (evaluation.isCorrect || evaluation.score >= 0.7) {
            masteredConcepts.add(concept);
          } else if (userAnswer && userAnswer.trim()) {
            // Track as wrong answer if AI score < 0.7
            newWrongAnswers.push({
              question: q.question,
              userAnswer: userAnswer,
              correctAnswer: q.correctAnswer,
              concept: concept,
              bloomLevel: q.bloomLevel || 1,
              date: new Date().toISOString(),
              drillCount: 0,
              timeSpent: timer.questionTimes[i] || 0
            });
          }
        }
      }
    });

    // Handle wrong answers based on mode
    let mergedWrongAnswers: WrongAnswer[];
    const existingWrongAnswers = isModuleQuiz ? (module?.wrongAnswers || []) : (topic?.wrongAnswers || []);

    if (mode === 'drill_weakness' && crossTopicDrill && subject) {
      // Cross-topic drill: update drillCount across ALL topics of the subject
      const drilledConcepts = new Set(
        quizState.questions.map(q => q.concept || 'General')
      );

      subject.topics.forEach(t => {
        if (!t.wrongAnswers || t.wrongAnswers.length === 0) return;
        const updated = t.wrongAnswers
          .map(wa => ({
            ...wa,
            drillCount: drilledConcepts.has(wa.concept) ? wa.drillCount + 1 : wa.drillCount
          }))
          .filter(wa => !(wa.drillCount >= 3 && masteredConcepts.has(wa.concept)));
        if (subjectId) {
          updateTopic(subjectId, t.id, { wrongAnswers: updated });
        }
      });
      // Current topic was already updated in the loop above - compute its final state
      // to match what the loop saved, so the final save below doesn't overwrite it
      const currentTopicWA = existingWrongAnswers
        .map(wa => ({
          ...wa,
          drillCount: drilledConcepts.has(wa.concept) ? wa.drillCount + 1 : wa.drillCount
        }))
        .filter(wa => !(wa.drillCount >= 3 && masteredConcepts.has(wa.concept)));
      mergedWrongAnswers = currentTopicWA;
    } else if (mode === 'drill_weakness') {
      // Per-topic drill: only increment drillCount for questions that were ACTUALLY in this quiz
      const drilledConcepts = new Set(
        quizState.questions.map(q => q.concept || 'General')
      );

      mergedWrongAnswers = existingWrongAnswers.map(wa => ({
        ...wa,
        drillCount: drilledConcepts.has(wa.concept) ? wa.drillCount + 1 : wa.drillCount
      }));
      // Also add any NEW wrong answers from this drill session
      if (newWrongAnswers.length > 0) {
        mergedWrongAnswers = [...newWrongAnswers, ...mergedWrongAnswers].slice(0, 20);
      }
    } else {
      // For other modes: just merge new wrong answers with existing
      mergedWrongAnswers = [...newWrongAnswers, ...existingWrongAnswers].slice(0, 20);
    }

    // Remove "mastered" wrong answers: drillCount >= 3 AND concept answered correctly
    mergedWrongAnswers = mergedWrongAnswers.filter(wa => {
      const isMastered = wa.drillCount >= 3 && masteredConcepts.has(wa.concept);
      return !isMastered;
    });

    // Determine the Bloom level this quiz was taken AT (not new level - that's calculated by context.tsx)
    // For assessment mode, find the highest level with >= 70%
    // For other modes, use the topic/module's current bloom level (the level questions were generated for)
    const currentBloom = isModuleQuiz ? (module?.currentBloomLevel || 1) : (topic?.currentBloomLevel || 1);
    let quizBloomLevel: BloomLevel = currentBloom as BloomLevel;

    if (mode === 'assessment') {
      // Assessment: find highest level with >= 70% using REAL scores
      const levelScores: Record<number, { correct: number; total: number }> = {};
      quizState.questions.forEach((q, i) => {
        const level = q.bloomLevel || 1;
        if (!levelScores[level]) levelScores[level] = { correct: 0, total: 0 };
        levelScores[level].total++;
        if ((q.type === 'multiple_choice' || q.type === 'case_study') && quizState.answers[i] === q.correctAnswer) {
          levelScores[level].correct++;
        } else if (q.type === 'open') {
          // Use actual AI evaluation score for open questions
          const evaluation = openEvaluations[i];
          if (evaluation) {
            levelScores[level].correct += evaluation.score;
          }
          // No automatic points if no evaluation
        }
      });

      quizBloomLevel = 1;
      for (let level = 1; level <= 6; level++) {
        const ls = levelScores[level];
        if (ls && ls.total > 0 && (ls.correct / ls.total) >= 0.7) {
          quizBloomLevel = level as BloomLevel;
        } else if (ls && ls.total > 0) {
          // Stop at first level that doesn't pass
          break;
        }
      }
    }
    // Note: We don't increment bloom level here anymore - context.tsx handles that
    // based on quizHistory (needs 2+ successful quizzes at current level)

    // Don't set currentBloomLevel directly - let context.tsx calculate it
    // based on quizHistory (requires 2+ successful quizzes at current level to advance)
    // Note: quizHistory is now updated via addGrade()/addModuleGrade(), only update wrongAnswers here
    if (isModuleQuiz && projectId && moduleId) {
      updateProjectModule(projectId, moduleId, {
        wrongAnswers: mergedWrongAnswers
      });
    } else if (subjectId && topicId) {
      updateTopic(subjectId, topicId, {
        wrongAnswers: mergedWrongAnswers
      });
    }
    // Mark as saved and show feedback
    setGradeSaved(true);
    setIsSavingGrade(false);
  };

  const handleSaveFreeRecallGrade = () => {
    if (!freeRecallEvaluation) return;

    // Support both topic and module quizzes
    if (isModuleQuiz && projectId && moduleId && module) {
      addModuleGrade(projectId, moduleId, freeRecallEvaluation.grade, {
        bloomLevel: freeRecallEvaluation.bloomLevel,
        questionsCount: 1,
        correctAnswers: freeRecallEvaluation.score >= 50 ? 1 : 0,
        weight: 1.0
      });
    } else if (subjectId && topicId && topic) {
      addGrade(subjectId, topicId, freeRecallEvaluation.grade, {
        bloomLevel: freeRecallEvaluation.bloomLevel,
        questionsCount: 1,
        correctAnswers: freeRecallEvaluation.score >= 50 ? 1 : 0,
        weight: 1.0
      });
    }
    // Note: Don't track as "read" here - free recall tests knowledge, not reading
  };

  const resetQuiz = () => {
    setQuizState({
      questions: [],
      currentIndex: 0,
      answers: [],
      showResult: false,
      isGenerating: false,
      error: null
    });
    setSelectedAnswer(null);
    setOpenAnswer('');
    setShowExplanation(false);
    setFreeRecallText('');
    setFreeRecallEvaluation(null);
    setCurrentHint(null);
    setHintsUsed(0);
    timer.reset();
    setShowPreview(false);
    setSelectedTopics([]);
    setOpenEvaluations({}); // Reset AI evaluations
    setGradeSaved(false);
    setIsSavingGrade(false);
    setMistakeAnalysis(null);
    setIsAnalyzingMistakes(false);
    setClozeCards(null);
    setIsGeneratingCloze(false);
    setClozeError(null);
    setCountWarning(null);
    setShowEarlyStopConfirm(false);
    setShowBackConfirm(false);
  };

  // No topic selected - show simple topic selection (skip if multi-topic mode or showing preview)
  if ((!subject || !topic) && !isMultiMode && !showPreview) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
            <Brain className="text-pink-400" />
            AI Тест
          </h1>
          <p className="text-slate-400 mt-1 font-mono text-sm">
            Интелигентно тестване с адаптивна сложност
          </p>
        </div>

        {/* Invalid params warning */}
        {invalidParamsWarning && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-200 font-mono">{invalidParamsWarning}</p>
              <p className="text-xs text-amber-400/60 font-mono mt-1">Избери валидна тема от списъка по-долу.</p>
            </div>
          </div>
        )}

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 font-mono">
            Избери тема за тест
          </h2>

          <div className="space-y-4">
            {activeSubjects.map(subj => (
              <div key={subj.id}>
                <h3 className="text-sm text-slate-400 font-mono mb-2" style={{ color: subj.color }}>
                  {subj.name}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {subj.topics.map(t => (
                    <Link
                      key={t.id}
                      href={`/quiz?subject=${subj.id}&topic=${t.id}`}
                      className={`p-3 bg-slate-800/50 border rounded-lg hover:border-pink-500/50 hover:bg-pink-500/5 transition-all ${
                        t.material ? 'border-slate-700' : 'border-slate-700/50 border-dashed'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="shrink-0">{STATUS_CONFIG[t.status].emoji}</span>
                        <span className="text-slate-200 font-mono text-sm line-clamp-2" title={`#${t.number} ${t.name}`}>
                          #{t.number} {t.name}
                        </span>
                        {!t.material && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                            общи
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                        <span>Bloom: {t.currentBloomLevel || 1}</span>
                        {t.quizCount > 0 && <span>• {t.quizCount} {t.quizCount === 1 ? 'тест' : 'теста'}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
                {subj.topics.length === 0 && (
                  <p className="text-sm text-slate-600 font-mono">
                    Няма добавени теми
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Free Recall Evaluation Results
  if (freeRecallEvaluation) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <Link
          href={subjectId && topicId ? `/subjects/${subjectId}/topics/${topicId}` : '/quiz'}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm"
        >
          <ArrowLeft size={16} /> {subjectId && topicId ? 'Към темата' : 'Назад'}
        </Link>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">
              {freeRecallEvaluation.score >= 75 ? '🎉' : freeRecallEvaluation.score >= 50 ? '👍' : '📚'}
            </div>
            <h2 className="text-2xl font-bold text-slate-100 font-mono">
              Free Recall Оценка
            </h2>
            <p className="text-slate-400 font-mono">
              {freeRecallEvaluation.score}% покритие на материала
            </p>
          </div>

          <div className={`text-center mb-6 px-8 py-4 rounded-xl border-2 font-mono text-4xl font-bold ${
            freeRecallEvaluation.grade >= 5 ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            freeRecallEvaluation.grade >= 4 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
            'bg-orange-500/10 border-orange-500/30 text-orange-400'
          }`}>
            {freeRecallEvaluation.grade.toFixed(2)}
          </div>

          <div className="space-y-4 mb-6">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-300 mb-2 font-mono">Обратна връзка</h3>
              <p className="text-slate-400 font-mono text-sm">{freeRecallEvaluation.feedback}</p>
            </div>

            {freeRecallEvaluation.missing.length > 0 && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-semibold text-red-400 mb-2 font-mono">Пропуснати концепции</h3>
                <ul className="space-y-1">
                  {freeRecallEvaluation.missing.slice(0, 5).map((m, i) => (
                    <li key={i} className="text-sm text-slate-400 font-mono flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        m.importance === 'critical' ? 'bg-red-500/20 text-red-400' :
                        m.importance === 'important' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>{m.importance}</span>
                      {m.concept}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <h3 className="text-sm font-semibold text-purple-400 mb-2 font-mono">Следваща стъпка</h3>
              <p className="text-slate-300 font-mono text-sm">{freeRecallEvaluation.suggestedNextStep}</p>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleSaveFreeRecallGrade}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all font-mono"
            >
              <CheckCircle size={20} /> Запази
            </button>
            <button
              onClick={() => {
                handleSaveFreeRecallGrade(); // Auto-save before reset
                resetQuiz();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-slate-200 font-semibold rounded-lg hover:bg-slate-600 transition-all font-mono"
            >
              <RefreshCw size={20} /> Отново
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Quiz Results
  if (quizState.showResult) {
    const score = calculateScore(quizState.questions, quizState.answers, openEvaluations);
    return (
      <QuizResults
        questions={quizState.questions}
        answers={quizState.answers}
        openEvaluations={openEvaluations}
        elapsedTime={timer.elapsedTime}
        formatTime={timer.formatTime}
        questionTimes={timer.questionTimes}
        subjectId={subjectId}
        topicId={topicId}
        gradeSaved={gradeSaved}
        isSavingGrade={isSavingGrade}
        onSaveGrade={handleSaveGrade}
        onReset={() => { handleSaveGrade(); resetQuiz(); }}
        onDrillWeakness={() => {
          handleSaveGrade();
          setMode('drill_weakness');
          setShowPreview(true);
          setPreviewQuestionCount(Math.min(10, quizState.questions.length - Math.round(score)));
          setQuizState({ questions: [], currentIndex: 0, answers: [], showResult: false, isGenerating: false, error: null });
        }}
        clozeCards={clozeCards}
        isGeneratingCloze={isGeneratingCloze}
        clozeError={clozeError}
        onGenerateCloze={generateClozeCards}
        onResetCloze={() => { setClozeCards(null); setClozeError(null); generateClozeCards(); }}
        mistakeAnalysis={mistakeAnalysis}
        isAnalyzingMistakes={isAnalyzingMistakes}
        onAnalyzeMistakes={analyzeMistakes}
      />
    );
  }

  // Quiz in progress
  if (quizState.questions.length > 0) {
    return (
      <QuizQuestion
        questions={quizState.questions}
        currentIndex={quizState.currentIndex}
        answers={quizState.answers}
        selectedAnswer={selectedAnswer}
        setSelectedAnswer={setSelectedAnswer}
        openAnswer={openAnswer}
        setOpenAnswer={setOpenAnswer}
        openHint={openHint}
        openHintLoading={openHintLoading}
        requestOpenHint={requestOpenHint}
        openEvaluations={openEvaluations}
        isEvaluatingOpen={isEvaluatingOpen}
        showExplanation={showExplanation}
        showEarlyStopConfirm={showEarlyStopConfirm}
        setShowEarlyStopConfirm={setShowEarlyStopConfirm}
        showBackConfirm={showBackConfirm}
        setShowBackConfirm={setShowBackConfirm}
        countWarning={countWarning}
        setCountWarning={setCountWarning}
        elapsedTime={timer.elapsedTime}
        formatTime={timer.formatTime}
        onAnswer={handleAnswer}
        onNext={handleNext}
        onEarlyStop={handleEarlyStop}
        onBack={() => { setShowBackConfirm(false); router.push('/quiz'); }}
      />
    );
  }

  // Free Recall Mode
  if (mode === 'free_recall' && !quizState.isGenerating) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <Link href="/quiz" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm">
          <ArrowLeft size={16} /> Назад
        </Link>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <FileText size={24} className="text-emerald-400" />
            <div>
              <h2 className="text-lg font-semibold text-slate-100 font-mono">Free Recall: {topic?.name}</h2>
              <p className="text-sm text-slate-400 font-mono">Напиши всичко, което знаеш</p>
            </div>
          </div>

          <textarea
            value={freeRecallText}
            onChange={(e) => setFreeRecallText(e.target.value)}
            placeholder="Започни да пишеш всичко, което помниш по тази тема..."
            className="w-full h-64 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono resize-none mb-4"
          />

          {currentHint && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb size={16} className="text-amber-400" />
                <span className="text-amber-400 font-mono text-sm font-semibold">Hint</span>
              </div>
              <p className="text-slate-300 font-mono text-sm">{currentHint}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={requestHint}
              disabled={hintsUsed >= MAX_HINTS || hintLoading}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-600/30 rounded-lg font-mono text-sm disabled:opacity-50"
            >
              <Lightbulb size={16} />
              {hintLoading ? 'Зареждане...' : `Hint (${MAX_HINTS - hintsUsed} оставащи)`}
            </button>

            <button
              onClick={evaluateFreeRecall}
              disabled={!freeRecallText.trim() || isEvaluating}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-lg font-mono disabled:opacity-50"
            >
              {isEvaluating ? (
                <><RefreshCw size={18} className="animate-spin" /> Оценяване...</>
              ) : (
                <><CheckCircle size={18} /> Оцени</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Preview/Edit Screen (also shows during generation)
  if (showPreview && quizState.questions.length === 0) {
    return (
      <QuizPreview
        mode={mode}
        customBloomLevel={customBloomLevel}
        isMultiMode={isMultiMode}
        multiTopics={multiTopics.map(({ topic: t, subject: s }) => ({
          id: t.id, number: t.number, name: t.name,
          currentBloomLevel: t.currentBloomLevel, subjectColor: s.color
        }))}
        topicName={topic?.name}
        topicBloomLevel={topic?.currentBloomLevel || 1}
        previewQuestionCount={previewQuestionCount}
        setPreviewQuestionCount={setPreviewQuestionCount}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        hasMaterial={isMultiMode ? multiTopics.some(({ topic: t }) => t.material?.trim()) : !!(topic?.material && topic.material.trim().length > 0)}
        isGenerating={quizState.isGenerating}
        elapsedSeconds={gen.elapsedSeconds}
        error={quizState.error}
        onBack={() => setShowPreview(false)}
        onGenerate={generateQuiz}
        onCancel={cancelGeneration}
      />
    );
  }

  // Setup Screen
  return (
    <div className="min-h-screen p-6 space-y-6">
      <Link href="/quiz" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm">
        <ArrowLeft size={16} /> Назад
      </Link>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-2xl">
        {/* Header - different for single vs multi-topic */}
        {isMultiMode && multiTopics.length > 0 ? (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Brain size={24} className="text-purple-400" />
              <div>
                <h2 className="text-lg font-semibold text-slate-100 font-mono">Mix Quiz: {multiTopics.length} теми</h2>
                <p className="text-sm text-slate-400 font-mono">Въпросите ще бъдат смесени от всички теми</p>
              </div>
            </div>
            {/* Selected topics list */}
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {multiTopics.map(({ topic: t, subject: s }) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm font-mono">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-300 shrink-0">#{t.number}</span>
                    <span className="text-slate-200 truncate" title={t.name}>
                      {t.name.length > 40 ? t.name.slice(0, 40) + '...' : t.name}
                    </span>
                    <span className="text-slate-500 text-xs ml-auto shrink-0">Bloom {t.currentBloomLevel || 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-6">
            <Brain size={24} className="text-pink-400" />
            <div>
              <h2 className="text-lg font-semibold text-slate-100 font-mono">{topic?.name}</h2>
              <p className="text-sm font-mono" style={{ color: subject?.color }}>{subject?.name}</p>
            </div>
          </div>
        )}

        {quizState.error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            {quizState.error === 'API_KEY_MISSING' ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-amber-400" />
                  <span className="text-amber-400 font-mono text-sm">Нужен е API ключ</span>
                </div>
                <Link href="/settings" className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg font-mono text-sm">
                  <Settings size={14} /> Настройки
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
                <AlertCircle size={18} /> {quizState.error}
              </div>
            )}
          </div>
        )}

        {/* AI Recommendation Banner - only for single topic */}
        {aiRecommendation && !isMultiMode && (
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={18} className="text-purple-400" />
              <span className="text-purple-400 font-mono font-semibold text-sm">AI Препоръка</span>
            </div>
            <p className="text-slate-300 font-mono text-sm">{aiRecommendation.recommendation}</p>
          </div>
        )}

        <QuizModeSelector
          mode={mode}
          setMode={setMode}
          isMultiMode={isMultiMode}
          quizLength={quizLength}
          setQuizLength={setQuizLength}
          showCustomOptions={showCustomOptions}
          setShowCustomOptions={setShowCustomOptions}
          customBloomLevel={customBloomLevel}
          setCustomBloomLevel={setCustomBloomLevel}
          customQuestionCount={customQuestionCount}
          setCustomQuestionCount={setCustomQuestionCount}
          crossTopicDrill={crossTopicDrill}
          setCrossTopicDrill={setCrossTopicDrill}
          subjectWeaknessStats={subjectWeaknessStats}
          topicWrongAnswers={topic?.wrongAnswers}
          examFormat={subject?.examFormat}
          matchExamFormat={matchExamFormat}
          setMatchExamFormat={setMatchExamFormat}
          isGenerating={quizState.isGenerating}
          hasMaterial={isMultiMode ? multiTopics.length > 0 : !!(topic?.material && topic.material.trim().length > 0)}
          onOpenPreview={openPreview}
        />
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-slate-400 font-mono">Зареждане...</div>
      </div>
    }>
      <QuizContent />
    </Suspense>
  );
}
