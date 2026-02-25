'use client';

import { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Brain, CheckCircle, RefreshCw, ArrowLeft, Settings, AlertCircle, Sparkles, Lightbulb, FileText, Copy, Plus } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import { BLOOM_LEVELS, BloomLevel, QuizLengthPreset, QUIZ_LENGTH_PRESETS, WrongAnswer } from '@/lib/types';
import { QuizMode, Question, FreeRecallEvaluation, MindMapEvaluation, OpenAnswerEvaluation, MistakeAnalysis, QuizState, buildMasteryContext, calculateScore, getGradeFromScore, isAnswerCorrect, getQuestionScore } from '@/lib/quiz-types';
import { fetchWithTimeout, getFetchErrorMessage, isAbortOrTimeoutError } from '@/lib/fetch-utils';
import { checkAnkiConnect, addClozeNotes } from '@/lib/anki';
import { showToast } from '@/components/Toast';
import { useQuizTimer } from '@/hooks/useQuizTimer';
import { useQuizGeneration } from '@/hooks/useQuizGeneration';
import { getCachedQuiz, saveCachedQuiz, hashMaterial } from '@/lib/indexeddb-storage';
import { QuizModeSelector } from '@/components/quiz/QuizModeSelector';
import { QuizQuestion } from '@/components/quiz/QuizQuestion';
import { QuizResults } from '@/components/quiz/QuizResults';
import { QuizPreview } from '@/components/quiz/QuizPreview';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import { MindMapBuilder, MindMapBranch, MindMapConnection, serializeMindMap } from '@/components/quiz/MindMapBuilder';

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
  const initialMode = searchParams.get('mode') as QuizMode | null;

  const { data, addGrade, addModuleGrade, incrementApiCalls, updateTopic, trackTopicRead, updateProjectModule, addQuestionBank, addQuestionsToBank, setQuizActive } = useApp();

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
  const [mode, setMode] = useState<QuizMode | null>(initialMode); // null = no selection yet, or pre-selected via URL param
  const [forceNewQuestions, setForceNewQuestions] = useState(false);
  const [usedCache, setUsedCache] = useState(false);
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
  // New question type state
  const [fillBlankAnswer, setFillBlankAnswer] = useState('');
  const [deleteQuestionIndex, setDeleteQuestionIndex] = useState<number | null>(null);

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
  const [pendingCogAction, setPendingCogAction] = useState<(() => void) | null>(null);
  const [freeRecallEvaluation, setFreeRecallEvaluation] = useState<FreeRecallEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Mind map state
  const [mindMapCentral, setMindMapCentral] = useState('');
  const [mindMapBranches, setMindMapBranches] = useState<MindMapBranch[]>([]);
  const [mindMapConnections, setMindMapConnections] = useState<MindMapConnection[]>([]);
  const [mindMapImage, setMindMapImage] = useState<string | null>(null);
  const [mindMapEvaluation, setMindMapEvaluation] = useState<MindMapEvaluation | null>(null);

  // Open answer AI evaluation
  const [openEvaluations, setOpenEvaluations] = useState<Record<number, OpenAnswerEvaluation>>({});
  const [isEvaluatingOpen, setIsEvaluatingOpen] = useState(false);
  const [openEvalFailed, setOpenEvalFailed] = useState<Record<number, boolean>>({});

  // Track submitted questions + saved partial answers for navigation
  const [submittedQuestions, setSubmittedQuestions] = useState<Set<number>>(new Set());
  const [savedInputs, setSavedInputs] = useState<Record<number, { selected?: string | null; open?: string; fillBlank?: string }>>({});

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

  // Cloze card generation state (from wrong answers in results)
  const [clozeCards, setClozeCards] = useState<string[] | null>(null);
  const [isGeneratingCloze, setIsGeneratingCloze] = useState(false);
  const [clozeError, setClozeError] = useState<string | null>(null);

  // Anki cards from material (quiz mode)
  const [ankiMaterialCards, setAnkiMaterialCards] = useState<string[] | null>(null);
  const [isGeneratingAnkiMaterial, setIsGeneratingAnkiMaterial] = useState(false);
  const [ankiMaterialError, setAnkiMaterialError] = useState<string | null>(null);
  const [ankiConnectAvailable, setAnkiConnectAvailable] = useState<boolean | null>(null);
  const [ankiSendResult, setAnkiSendResult] = useState<string | null>(null);

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
        recommendation: `${daysUntilExam} дни до изпита! → Drill Weakness за слабите места.`,
        suggestedMode: 'drill_weakness'
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
    const isActive = quizState.questions.length > 0 && !quizState.showResult;

    // Set global quiz guard so Sidebar can block navigation
    setQuizActive(isActive);

    if (!isActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Имаш незавършен тест. Сигурен ли си, че искаш да напуснеш?';
      return e.returnValue;
    };

    // Push a dummy history entry so back button triggers popstate instead of leaving
    window.history.pushState({ quizGuard: true }, '');
    const handlePopState = () => {
      if (confirm('Имаш незавършен тест. Ако се върнеш назад, прогресът ти ще бъде загубен. Продължи?')) {
        // User confirmed — allow back navigation
        window.history.back();
      } else {
        // User cancelled — re-push the guard entry
        window.history.pushState({ quizGuard: true }, '');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      setQuizActive(false);
    };
  }, [quizState.questions.length, quizState.showResult, setQuizActive]);

  // Refs for keyboard handler to avoid stale closures (functions defined later)
  const handleAnswerRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});

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
          handleAnswerRef.current();
        }
      } else {
        // After showing explanation, Enter to go next - call handleNext to persist answer
        if (e.key === 'Enter') {
          e.preventDefault();
          handleNextRef.current();
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
    } else if (isMultiMode && multiTopics.length > 0) {
      handleSaveGrade();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizState.showResult]);

  // Format time helper
  // formatTime is now in useQuizTimer hook
  // Open preview screen and set initial question count
  const openPreview = () => {
    if (mode === 'anki_cards') {
      generateAnkiFromMaterial();
      return;
    }
    if (mode === 'specimen_quiz') {
      // Specimen quiz skips preview, goes straight to generation
      setPreviewQuestionCount(topic?.specimens?.length ? Math.min(topic.specimens.length * 2, 20) : 10);
      setShowPreview(true);
      return;
    }
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

    // specimen_quiz requires specimens
    if (mode === 'specimen_quiz' && (!topic?.specimens || topic.specimens.length === 0)) {
      setQuizState(prev => ({ ...prev, error: 'Добави препарати към темата преди да започнеш.' }));
      return;
    }

    // free_recall and mind_map require material
    if ((mode === 'free_recall' || mode === 'mind_map') && !topic?.material?.trim()) {
      setQuizState(prev => ({ ...prev, error: `${mode === 'free_recall' ? 'Free Recall' : 'Mind Map'} изисква добавен материал към темата.` }));
      return;
    }

    // mind_map skips generation — renders directly from mode selection
    if (mode === 'mind_map') return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setQuizState(prev => ({ ...prev, error: 'API_KEY_MISSING' }));
      return;
    }

    setQuizState(prev => ({ ...prev, isGenerating: true, error: null }));
    setUsedCache(false);

    // Cacheable modes (not dependent on wrong answers or unique recall)
    const cacheableModes: Set<string> = new Set(['assessment', 'lower_order', 'mid_order', 'higher_order', 'custom']);
    // Skip cache when AI decides count (previewQuestionCount === 0) — needs fresh generation
    const isCacheable = !isMultiMode && !forceNewQuestions && topicId && mode && cacheableModes.has(mode) && previewQuestionCount > 0;

    // Valid question types (filter out removed types like 'matching')
    const validTypes = new Set(['multiple_choice', 'open', 'case_study', 'fill_blank', 'short_answer']);

    // Check cache for reusable questions (will be mixed with new ones if not enough)
    let cachedQuestions: Question[] = [];
    if (isCacheable && topicId && mode) {
      try {
        const cached = await getCachedQuiz(topicId, mode);
        if (cached && cached.questions.length > 0) {
          const currentHash = hashMaterial(topic?.material || '');
          if (cached.materialHash === currentHash) {
            // Filter out invalid/removed question types and shuffle
            cachedQuestions = cached.questions
              .filter((q: Question) => validTypes.has(q.type))
              .sort(() => Math.random() - 0.5);
          }
        }
      } catch { /* cache miss */ }
    }

    // If cache fully covers the requested count, use cache only (skip when AI decides count)
    if (previewQuestionCount > 0 && cachedQuestions.length >= previewQuestionCount) {
      const selected = cachedQuestions.slice(0, previewQuestionCount);
      setUsedCache(true);
      setQuizState({
        questions: selected,
        currentIndex: 0,
        answers: new Array(selected.length).fill(null),
        showResult: false, isGenerating: false, error: null
      });
      timer.initQuestionTimes(selected.length);
      setForceNewQuestions(false);
      return;
    }

    // Generate new questions (request only the missing count if cache has some)
    const newQuestionsNeeded = previewQuestionCount - cachedQuestions.length;
    // When previewQuestionCount is 0 (AI decides), send null so API lets AI choose
    const questionCount = previewQuestionCount === 0 ? null : newQuestionsNeeded;
    let requestBody;

    if (isMultiMode && multiTopics.length > 0) {
      const combinedMaterial = multiTopics.map(({ subject: s, topic: t }) =>
        `=== ТЕМА: ${t.name} (${s.name}) ===\n${t.material}`
      ).join('\n\n---\n\n');
      const topicNames = multiTopics.map(({ topic: t }) => t.name).join(', ');
      const avgBloom = Math.round(
        multiTopics.reduce((sum, { topic: t }) => sum + (t.currentBloomLevel || 1), 0) / multiTopics.length
      );

      // Collect previous questions from all topics in the mix
      let mixPreviousQuestions: string[] = [];
      if (mode !== 'drill_weakness') {
        for (const { subject: s, topic: t } of multiTopics) {
          const banks = (data.questionBanks || []).filter(b => b.subjectId === s.id);
          for (const bank of banks) {
            for (const q of bank.questions || []) {
              if (q.linkedTopicIds?.includes(t.id)) {
                mixPreviousQuestions.push(q.text);
              }
            }
          }
          if (t.wrongAnswers?.length) {
            for (const wa of t.wrongAnswers) {
              if (!mixPreviousQuestions.includes(wa.question)) {
                mixPreviousQuestions.push(wa.question);
              }
            }
          }
        }
        mixPreviousQuestions = mixPreviousQuestions.slice(-30);
      }

      // Build combined masteryContext from all topics
      const mixMasteryContexts = multiTopics.map(({ topic: t }) =>
        buildMasteryContext({ ...t, weakConcepts: t.weakConcepts })
      );
      // Merge: combine weak concepts, mastered concepts, avg grades, sum quiz counts
      const mergedMastery = {
        topicStatus: mixMasteryContexts.some(m => m.topicStatus === 'gray') ? 'gray' :
                     mixMasteryContexts.some(m => m.topicStatus === 'orange') ? 'orange' : 'green',
        bloomLevel: avgBloom,
        avgGrade: mixMasteryContexts.filter(m => m.avgGrade !== null).length > 0
          ? Math.round(mixMasteryContexts.filter(m => m.avgGrade !== null).reduce((s, m) => s + m.avgGrade!, 0) / mixMasteryContexts.filter(m => m.avgGrade !== null).length)
          : null,
        quizCount: mixMasteryContexts.reduce((s, m) => s + m.quizCount, 0),
        readCount: mixMasteryContexts.reduce((s, m) => s + m.readCount, 0),
        lastReview: null as string | null,
        recentQuizzes: mixMasteryContexts.flatMap(m => m.recentQuizzes).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
        masteredConcepts: [...new Set(mixMasteryContexts.flatMap(m => m.masteredConcepts))],
        weakConcepts: mixMasteryContexts.flatMap(m => m.weakConcepts)
      };

      // Collect specimens from all topics
      const mixSpecimens = multiTopics.flatMap(({ topic: t }) => t.specimens || []);

      // Collect custom questions from all topics
      const mixCustomQuestions = multiTopics.flatMap(({ topic: t }) => t.customQuestions || []);

      requestBody = {
        apiKey, material: combinedMaterial,
        topicName: `Mix: ${multiTopics.length} теми`,
        subjectName: multiTopics.map(({ subject: s }) => s.name).filter((v, i, a) => a.indexOf(v) === i).join(', '),
        subjectType: multiTopics[0]?.subject.subjectType || 'preclinical',
        examFormat: multiTopics[0]?.subject.examFormat,
        matchExamFormat, mode, questionCount,
        bloomLevel: mode === 'custom' ? customBloomLevel : null,
        currentBloomLevel: avgBloom, isMultiTopic: true, topicsList: topicNames, model: selectedModel,
        previousQuestions: mixPreviousQuestions.length > 0 ? mixPreviousQuestions : undefined,
        masteryContext: mergedMastery,
        specimens: mixSpecimens.length > 0 ? mixSpecimens : undefined,
        customQuestions: mixCustomQuestions.length > 0 ? mixCustomQuestions : undefined
      };
    } else {
      // Build overlap context if this topic has overlap analysis
      const topicOverlapCtx = topic?.overlapAnalysis?.uniqueConcepts?.length
        ? {
            sharedConcepts: topic.overlapAnalysis.sharedConcepts || [],
            uniqueConcepts: topic.overlapAnalysis.uniqueConcepts,
            overlapPercent: topic.overlapAnalysis.overlapPercent,
            linkedTopicName: (() => {
              for (const s of data.subjects) {
                const t = s.topics.find(t => t.id === topic.overlapAnalysis?.linkedTopicId);
                if (t) return t.name;
              }
              return '';
            })(),
          }
        : undefined;

      // Collect previous question texts to avoid repetition
      let previousQuestions: string[] = [];
      if (topicId && mode !== 'drill_weakness') {
        // From question bank (auto-saved AI quiz questions for this topic)
        const banks = (data.questionBanks || []).filter(b => b.subjectId === subjectId);
        for (const bank of banks) {
          for (const q of bank.questions || []) {
            if (q.linkedTopicIds?.includes(topicId)) {
              previousQuestions.push(q.text);
            }
          }
        }
        // From wrong answers (questions the student got wrong)
        if (topic?.wrongAnswers?.length) {
          for (const wa of topic.wrongAnswers) {
            if (!previousQuestions.includes(wa.question)) {
              previousQuestions.push(wa.question);
            }
          }
        }
        // Keep last 30 to limit token cost
        previousQuestions = previousQuestions.slice(-30);
      }

      requestBody = {
        apiKey, material: topic?.material, topicName: topic?.name,
        subjectName: subject?.name || '',
        subjectType: subject?.subjectType || 'preclinical',
        examFormat: subject?.examFormat, matchExamFormat, mode, questionCount,
        bloomLevel: mode === 'custom' ? customBloomLevel : null,
        currentBloomLevel: topic?.currentBloomLevel || 1,
        wrongAnswers: mode === 'drill_weakness'
          ? (crossTopicDrill ? crossTopicWrongAnswers : topic?.wrongAnswers)
          : undefined,
        model: selectedModel,
        masteryContext: topic ? buildMasteryContext({ ...topic, weakConcepts: topic.weakConcepts }) : undefined,
        specimens: topic?.specimens?.length ? topic.specimens : undefined,
        customQuestions: topic?.customQuestions?.length ? topic.customQuestions : undefined,
        overlapContext: topicOverlapCtx,
        previousQuestions: previousQuestions.length > 0 ? previousQuestions : undefined
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

    // Mix cached questions with newly generated ones
    let allQuestions = result.questions!;
    if (cachedQuestions.length > 0) {
      // Deduplicate: skip cached questions whose text matches new ones
      const newTexts = new Set(allQuestions.map(q => q.question.toLowerCase().trim().substring(0, 100)));
      const uniqueCached = cachedQuestions.filter(q => !newTexts.has(q.question.toLowerCase().trim().substring(0, 100)));
      allQuestions = [...allQuestions, ...uniqueCached].sort(() => Math.random() - 0.5);
      setUsedCache(true);
    }

    // Mix in question bank questions linked to this topic (or all topics in mix mode)
    const bankTopicIds = isMultiMode ? multiTopics.map(({ topic: t }) => t.id) : (topicId ? [topicId] : []);
    const bankSubjectIds = isMultiMode ? [...new Set(multiTopics.map(({ subject: s }) => s.id))] : (subjectId ? [subjectId] : []);
    if (bankTopicIds.length > 0 && bankSubjectIds.length > 0 && !isModuleQuiz) {
      const banks = (data.questionBanks || []).filter(b => bankSubjectIds.includes(b.subjectId));

      // Determine Bloom level range for the current quiz mode
      const bloomRange: [number, number] | null =
        mode === 'lower_order' ? [1, 2] :
        mode === 'mid_order' ? [3, 4] :
        mode === 'higher_order' ? [5, 6] :
        null; // assessment, custom, etc. = any level

      const linkedBankQs = banks.flatMap(b =>
        b.questions.filter(q => {
          if (!q.linkedTopicIds?.some(id => bankTopicIds.includes(id))) return false;
          if (q.type !== 'mcq' && q.type !== 'open') return false;
          if (q.type === 'mcq' && !(q.options?.length)) return false;
          // Filter by Bloom level if mode is specific and question has a level
          if (bloomRange && typeof q.bloomLevel === 'number' && q.bloomLevel >= 1 && q.bloomLevel <= 6) {
            if (q.bloomLevel < bloomRange[0] || q.bloomLevel > bloomRange[1]) return false;
          }
          return true;
        })
      );
      if (linkedBankQs.length > 0) {
        // Deduplicate: skip bank questions already covered by AI
        const aiTexts = new Set(allQuestions.map(q => q.question.toLowerCase().trim().substring(0, 100)));
        const uniqueBankQs = linkedBankQs.filter(q => !aiTexts.has(q.text.toLowerCase().trim().substring(0, 100)));
        // Pick up to 3 random bank questions per topic (more for mix mode)
        const maxBankQs = isMultiMode ? Math.min(2 * bankTopicIds.length, 8) : 3;
        const shuffled = uniqueBankQs.sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, Math.min(maxBankQs, shuffled.length));
        const converted: Question[] = picked.map(q => ({
          type: q.type === 'mcq' ? 'multiple_choice' as const : 'open' as const,
          question: q.text,
          options: q.type === 'mcq' ? q.options : undefined,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          bloomLevel: q.bloomLevel,
        }));
        // Shuffle bank questions into the mix
        allQuestions = [...allQuestions, ...converted].sort(() => Math.random() - 0.5);
      }
    }

    setQuizState({
      questions: allQuestions,
      currentIndex: 0,
      answers: new Array(allQuestions.length).fill(null),
      showResult: false, isGenerating: false, error: null
    });
    // Init state for first question
    if (allQuestions.length > 0) initQuestionState(allQuestions[0]);
    timer.initQuestionTimes(allQuestions.length);

    // Save combined questions to cache (cached + new, excluding bank questions)
    if (isCacheable && topicId && mode && result.questions) {
      // Store new + valid cached (without bank questions which are added separately)
      const cacheWorthy = [...result.questions, ...cachedQuestions.filter(q => validTypes.has(q.type))];
      // Deduplicate by question text
      const seen = new Set<string>();
      const deduped = cacheWorthy.filter(q => {
        const key = q.question.toLowerCase().trim().substring(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      saveCachedQuiz(topicId, mode, deduped, topic?.material || '');
    }
    setForceNewQuestions(false);
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
          userRecall: freeRecallText,
          studyTechniques: data.studyTechniques?.filter(t => t.isActive).map(t => ({
            name: t.name, slug: t.slug, howToApply: t.howToApply.substring(0, 150)
          }))
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

  // Mind map evaluation
  const evaluateMindMap = async () => {
    if (isEvaluating || !topic?.material) return;

    const hasBranches = mindMapBranches.some(b => b.text.trim());
    if (!hasBranches && !mindMapImage) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setIsEvaluating(true);
    try {
      const mindMapData = hasBranches
        ? serializeMindMap(mindMapCentral || topic.name, mindMapBranches, mindMapConnections)
        : null;

      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'mind_map',
          material: topic.material,
          topicName: topic.name,
          subjectName: subject?.name,
          mindMapData,
          mindMapImage: mindMapImage || undefined
        }),
        signal: gen.abortControllerRef.current?.signal
      });

      const result = await response.json();
      if (result.evaluation) {
        setMindMapEvaluation(result.evaluation);
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch (e) {
      console.error('Mind map eval failed:', e);
    }
    setIsEvaluating(false);
  };

  const handleAnswer = async () => {
    if (isEvaluatingOpen) return; // Guard against double-click
    const questionIndex = quizState.currentIndex; // Capture index before any async gap
    const currentQuestion = quizState.questions[questionIndex];

    // Determine answer based on question type
    let answer: string | null = null;
    switch (currentQuestion.type) {
      case 'multiple_choice':
      case 'case_study':
        answer = selectedAnswer;
        break;
      case 'fill_blank':
        answer = fillBlankAnswer.trim();
        break;
      case 'open':
      case 'short_answer':
      default:
        answer = openAnswer;
        break;
    }

    const newAnswers = [...quizState.answers];
    newAnswers[questionIndex] = answer;

    // Persist the answer immediately so early stop captures it
    setQuizState(prev => ({ ...prev, answers: newAnswers }));

    // Record time spent on this question
    timer.recordQuestionTime(questionIndex);

    // For open/short_answer questions, evaluate with AI
    if ((currentQuestion.type === 'open' || currentQuestion.type === 'short_answer') && openAnswer.trim()) {
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
        } catch (e) {
          console.error('AI eval failed:', e);
          setOpenEvalFailed(prev => ({ ...prev, [questionIndex]: true }));
        }
        setIsEvaluatingOpen(false);
      }
    }

    setSubmittedQuestions(prev => new Set(prev).add(questionIndex));
    setShowExplanation(true);
  };

  // Retry AI evaluation for a specific question
  const retryEvaluation = async (questionIndex: number) => {
    const question = quizState.questions[questionIndex];
    const answer = quizState.answers[questionIndex];
    if (!question || !answer) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setIsEvaluatingOpen(true);
    setOpenEvalFailed(prev => ({ ...prev, [questionIndex]: false }));
    try {
      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'evaluate_open',
          question: question.question,
          userAnswer: answer,
          correctAnswer: question.correctAnswer,
          bloomLevel: question.bloomLevel || 3
        }),
        timeout: 60000
      });
      const result = await response.json();
      if (result.evaluation) {
        setOpenEvaluations(prev => ({ ...prev, [questionIndex]: result.evaluation }));
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch {
      setOpenEvalFailed(prev => ({ ...prev, [questionIndex]: true }));
    }
    setIsEvaluatingOpen(false);
  };

  // Save current input state before navigating away
  const saveCurrentInput = () => {
    const idx = quizState.currentIndex;
    setSavedInputs(prev => ({
      ...prev,
      [idx]: { selected: selectedAnswer, open: openAnswer, fillBlank: fillBlankAnswer }
    }));
  };

  // Initialize type-specific state for a question (restore saved inputs if any)
  const initQuestionState = (question: Question, targetIndex?: number) => {
    const saved = targetIndex !== undefined ? savedInputs[targetIndex] : undefined;
    setSelectedAnswer(saved?.selected ?? null);
    setOpenAnswer(saved?.open ?? '');
    setOpenHint(null);
    setFillBlankAnswer(saved?.fillBlank ?? '');
  };

  // Navigate to a specific question index
  const navigateToQuestion = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= quizState.questions.length) return;
    saveCurrentInput();
    const targetQuestion = quizState.questions[targetIndex];
    setQuizState(prev => ({ ...prev, currentIndex: targetIndex }));
    initQuestionState(targetQuestion, targetIndex);
    setShowExplanation(submittedQuestions.has(targetIndex));
  };

  const handleNext = () => {
    if (quizState.currentIndex < quizState.questions.length - 1) {
      navigateToQuestion(quizState.currentIndex + 1);
    } else {
      // Last question — show results
      saveCurrentInput();
      setQuizState(prev => ({ ...prev, showResult: true }));
    }
  };

  const handlePrev = () => {
    if (quizState.currentIndex > 0) {
      navigateToQuestion(quizState.currentIndex - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  // Keep refs current for keyboard handler (avoids stale closures)
  handleAnswerRef.current = handleAnswer;
  handleNextRef.current = handleNext;

  // Early quiz termination - finish with answered questions only
  const handleEarlyStop = () => {
    // Save current answer if any
    const currentQuestion = quizState.questions[quizState.currentIndex];
    let answer: string | null = null;
    switch (currentQuestion.type) {
      case 'multiple_choice': case 'case_study':
        answer = selectedAnswer; break;
      case 'fill_blank':
        answer = fillBlankAnswer.trim() || null; break;
      default:
        answer = openAnswer || null; break;
    }

    const newAnswers = [...quizState.answers];
    if (answer) {
      newAnswers[quizState.currentIndex] = answer;
    }

    // Keep only questions that were actually answered (filter out nulls)
    const answeredIndices = newAnswers.map((a, i) => a !== null ? i : -1).filter(i => i >= 0);
    if (answeredIndices.length === 0) {
      // No answers given — show results without saving grade
      setQuizState(prev => ({ ...prev, questions: [], answers: [], showResult: true }));
      setShowEarlyStopConfirm(false);
      return;
    }
    const trimmedQuestions = answeredIndices.map(i => quizState.questions[i]);
    const trimmedAnswers = answeredIndices.map(i => newAnswers[i]);

    setQuizState(prev => ({
      ...prev,
      questions: trimmedQuestions,
      answers: trimmedAnswers,
      showResult: true
    }));
    setShowEarlyStopConfirm(false);
  };

  // Edit a question in-place (fix AI mistakes)
  const handleEditQuestion = (index: number, updated: Question) => {
    setQuizState(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => i === index ? updated : q)
    }));
  };

  // Delete a question from the quiz
  const handleDeleteQuestion = () => {
    if (deleteQuestionIndex === null) return;
    const idx = deleteQuestionIndex;

    setQuizState(prev => {
      const newQuestions = prev.questions.filter((_, i) => i !== idx);
      const newAnswers = prev.answers.filter((_, i) => i !== idx);

      // Shift openEvaluations indices
      const newEvals: Record<number, typeof openEvaluations[number]> = {};
      Object.entries(openEvaluations).forEach(([key, val]) => {
        const k = Number(key);
        if (k < idx) newEvals[k] = val;
        else if (k > idx) newEvals[k - 1] = val;
        // k === idx is deleted
      });
      // Shift openEvalFailed, submittedQuestions, savedInputs
      const newFailed: Record<number, boolean> = {};
      Object.entries(openEvalFailed).forEach(([key, val]) => {
        const k = Number(key);
        if (k < idx) newFailed[k] = val;
        else if (k > idx) newFailed[k - 1] = val;
      });
      const newSubmitted = new Set<number>();
      submittedQuestions.forEach(k => {
        if (k < idx) newSubmitted.add(k);
        else if (k > idx) newSubmitted.add(k - 1);
      });
      const newSaved: typeof savedInputs = {};
      Object.entries(savedInputs).forEach(([key, val]) => {
        const k = Number(key);
        if (k < idx) newSaved[k] = val;
        else if (k > idx) newSaved[k - 1] = val;
      });

      // We'll update these via setTimeout after setState returns
      setTimeout(() => {
        setOpenEvaluations(newEvals);
        setOpenEvalFailed(newFailed);
        setSubmittedQuestions(newSubmitted);
        setSavedInputs(newSaved);
      }, 0);

      if (newQuestions.length === 0) {
        return { ...prev, questions: newQuestions, answers: newAnswers, showResult: true };
      }

      // If we deleted the current or a later question, stay at same index (or go back if at end)
      const newIndex = idx >= newQuestions.length ? newQuestions.length - 1 : idx;
      return {
        ...prev,
        questions: newQuestions,
        answers: newAnswers,
        currentIndex: newIndex
      };
    });

    // Reset explanation view since we moved to a new question
    setShowExplanation(false);
    setDeleteQuestionIndex(null);
  };

  // Add a custom question to the question bank during quiz
  const handleAddQuestion = (question: { type: 'mcq' | 'open'; text: string; options?: string[]; correctAnswer: string; explanation?: string }) => {
    if (!subjectId) return;
    const existingBanks = (data.questionBanks || []).filter(b => b.subjectId === subjectId);
    let aiBank = existingBanks.find(b => b.name === 'AI Quiz');
    let bankId: string;
    if (aiBank) {
      bankId = aiBank.id;
    } else {
      bankId = addQuestionBank(subjectId, 'AI Quiz');
    }
    addQuestionsToBank(bankId, [{
      ...question,
      linkedTopicIds: topicId ? [topicId] : [],
      stats: { attempts: 0, correct: 0 }
    }], []);
  };

  // Re-evaluate open answer with student feedback
  const handleReEvaluate = async (index: number, feedback: string) => {
    const question = quizState.questions[index];
    const userAnswer = quizState.answers[index];
    if (!question || !userAnswer) {
      console.error('Re-evaluate: missing data', { question: !!question, userAnswer: !!userAnswer, index });
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      console.error('Re-evaluate: no API key');
      return;
    }

    const prevEval = openEvaluations[index];

    setIsEvaluatingOpen(true);
    try {
      // If no previous AI evaluation (fill_blank/MCQ), use evaluate_open with feedback context
      const requestBody = prevEval ? {
        apiKey,
        mode: 're_evaluate_open' as const,
        question: question.question,
        userAnswer,
        correctAnswer: question.correctAnswer,
        bloomLevel: question.bloomLevel || 3,
        previousEvaluation: {
          score: prevEval.score,
          feedback: prevEval.feedback,
          keyPointsCovered: Array.isArray(prevEval.keyPointsCovered) ? prevEval.keyPointsCovered : [],
          keyPointsMissed: Array.isArray(prevEval.keyPointsMissed) ? prevEval.keyPointsMissed : []
        },
        studentFeedback: feedback
      } : {
        apiKey,
        mode: 'evaluate_open' as const,
        question: `${question.question}\n\n[Студентът оспорва оценката: ${feedback}]`,
        userAnswer,
        correctAnswer: question.correctAnswer,
        bloomLevel: question.bloomLevel || 3
      };

      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: 120000
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Re-evaluate API error:', response.status, errData);
        setIsEvaluatingOpen(false);
        return;
      }

      const result = await response.json();
      if (result.evaluation) {
        setOpenEvaluations(prev => ({
          ...prev,
          [index]: result.evaluation
        }));
        if (result.usage) incrementApiCalls(result.usage.cost);
      }
    } catch (err) {
      console.error('Re-evaluate failed:', err);
    }
    setIsEvaluatingOpen(false);
  };

  // Meta-learning reflection evaluation
  const handleMetaReflection = async (index: number, reflection: string): Promise<{ feedback: string; connectionTips: string[]; memoryTechnique?: string } | null> => {
    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return null;

    const question = quizState.questions[index];
    const evaluation = openEvaluations[index];
    if (!question || !evaluation) return null;

    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'evaluate_meta',
          question: question.question,
          correctAnswer: question.correctAnswer,
          keyPointsMissed: evaluation.keyPointsMissed || [],
          studentReflection: reflection
        })
      });
      const result = await res.json();
      if (result.usage) incrementApiCalls(result.usage.cost);
      return result.metaFeedback || null;
    } catch (err) {
      console.error('Meta reflection evaluation failed:', err);
      return null;
    }
  };

  // Analyze mistakes using AI
  const analyzeMistakes = async (selfReflection?: string, errorTypes?: string[]) => {
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
      const correct = isAnswerCorrect(q, userAnswer, openEvaluations[i]);
      if (!correct) {
        mistakes.push({
          question: q.question,
          userAnswer: userAnswer || '(без отговор)',
          correctAnswer: q.correctAnswer,
          concept: q.concept,
          bloomLevel: q.bloomLevel
        });
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
          subjectName: subject.name,
          selfReflection: selfReflection || undefined,
          errorTypes: errorTypes?.length ? errorTypes : undefined,
          studyTechniques: data.studyTechniques?.filter(t => t.isActive).map(t => ({
            name: t.name, slug: t.slug, howToApply: t.howToApply.substring(0, 150)
          }))
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
      if (!isAnswerCorrect(q, userAnswer, openEvaluations[i])) {
        wrongAnswers.push({
          question: q.question,
          userAnswer: userAnswer,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation
        });
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
        timeout: 60000
      });

      const result = await response.json();
      if (result.error) {
        setClozeError(result.error);
      } else if (result.cards) {
        setClozeCards(result.cards);
      }
    } catch (err) {
      setClozeError(getFetchErrorMessage(err));
    }
    setIsGeneratingCloze(false);
  };

  // Generate Anki cloze cards from topic material (Bloom L1)
  const generateAnkiFromMaterial = async (forceRegenerate = false) => {
    if (isGeneratingAnkiMaterial) return;

    // If topic already has saved cards and not forcing regeneration, show them
    if (!forceRegenerate && topic?.ankiCards && topic.ankiCards.length > 0) {
      setAnkiMaterialCards(topic.ankiCards);
      // Warn if material changed since cards were generated
      if (topic.ankiCardsSourceLength && topic.material) {
        const diff = Math.abs(topic.material.length - topic.ankiCardsSourceLength);
        if (diff > 100) {
          setAnkiMaterialError('MATERIAL_CHANGED');
        }
      }
      // Check AnkiConnect in background
      checkAnkiConnect().then(setAnkiConnectAvailable).catch(() => setAnkiConnectAvailable(false));
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setAnkiMaterialError('API_KEY_MISSING');
      return;
    }

    if (!topic?.material?.trim()) {
      setAnkiMaterialError('Тази тема няма добавен материал.');
      return;
    }

    setIsGeneratingAnkiMaterial(true);
    setAnkiMaterialError(null);
    setAnkiMaterialCards(null);
    setAnkiSendResult(null);

    try {
      const response = await fetchWithTimeout('/api/anki-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          material: topic.material,
          topicName: topic.name,
          mode: 'from_material'
        }),
        timeout: 300000
      });

      const result = await response.json();
      if (result.error) {
        setAnkiMaterialError(result.error);
      } else if (result.cards && result.cards.length > 0) {
        setAnkiMaterialCards(result.cards);
        if (result.cost) incrementApiCalls(result.cost);
        // Save to topic with source length for staleness detection
        if (subjectId && topicId) {
          updateTopic(subjectId, topicId, { ankiCards: result.cards, ankiCardsSourceLength: topic.material?.length });
        }
        // Check AnkiConnect in background
        checkAnkiConnect().then(setAnkiConnectAvailable).catch(() => setAnkiConnectAvailable(false));
      } else {
        setAnkiMaterialError('Не бяха генерирани карти.');
      }
    } catch (err) {
      if (!isAbortOrTimeoutError(err)) {
        setAnkiMaterialError(getFetchErrorMessage(err));
      }
    }
    setIsGeneratingAnkiMaterial(false);
  };

  // Generate MORE Anki cards (appends to existing)
  const generateMoreAnkiCards = async () => {
    if (isGeneratingAnkiMaterial || !ankiMaterialCards) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) { setAnkiMaterialError('API_KEY_MISSING'); return; }
    if (!topic?.material?.trim()) return;

    setIsGeneratingAnkiMaterial(true);
    setAnkiMaterialError(null);
    setAnkiSendResult(null);

    try {
      const response = await fetchWithTimeout('/api/anki-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          material: topic.material,
          topicName: topic.name,
          mode: 'from_material',
          existingCards: ankiMaterialCards
        }),
        timeout: 300000
      });

      const result = await response.json();
      if (result.error) {
        setAnkiMaterialError(result.error);
      } else if (result.cards && result.cards.length > 0) {
        const merged = [...ankiMaterialCards, ...result.cards];
        setAnkiMaterialCards(merged);
        if (result.cost) incrementApiCalls(result.cost);
        if (subjectId && topicId) {
          updateTopic(subjectId, topicId, { ankiCards: merged, ankiCardsSourceLength: topic.material?.length });
        }
        setAnkiSendResult(`+${result.cards.length} нови карти (общо ${merged.length})`);
      } else {
        setAnkiSendResult('Няма допълнителни карти — материалът е покрит.');
      }
    } catch (err) {
      if (!isAbortOrTimeoutError(err)) {
        setAnkiMaterialError(getFetchErrorMessage(err));
      }
    }
    setIsGeneratingAnkiMaterial(false);
  };

  // Send generated Anki cards to AnkiConnect
  const sendCardsToAnki = async () => {
    if (!ankiMaterialCards || ankiMaterialCards.length === 0) return;
    if (!subject || !topic) return;

    try {
      const paddedNumber = String(topic.number).padStart(2, '0');
      const deckName = `${subject.name}::${paddedNumber}. ${topic.name}`;
      const result = await addClozeNotes(deckName, ankiMaterialCards, ['vayne-study', 'bloom-l1']);
      setAnkiSendResult(`Добавени ${result.added} карти в Anki (${result.duplicates} дубликати)`);
    } catch (err) {
      setAnkiSendResult(`Грешка: ${err instanceof Error ? err.message : 'Неизвестна грешка'}`);
    }
  };

  const handleSaveGrade = () => {
    // Prevent duplicate saves
    // Support topic quizzes, module quizzes, and multi-topic mix quizzes
    const isValidTopicQuiz = !isModuleQuiz && subjectId && topicId && topic;
    const isValidModuleQuiz = isModuleQuiz && projectId && moduleId && module;
    const isValidMultiQuiz = isMultiMode && multiTopics.length > 0;

    if (gradeSaved || isSavingGrade) return;
    if (!isValidTopicQuiz && !isValidModuleQuiz && !isValidMultiQuiz) return;
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
    } else if (isValidMultiQuiz) {
      // Mix mode: split score proportionally across topics (not full score to each)
      const topicCount = multiTopics.length;
      const perTopicQuestions = Math.round(quizState.questions.length / topicCount);
      const perTopicCorrect = Math.round(score / topicCount);
      for (const { subject: s, topic: t } of multiTopics) {
        addGrade(s.id, t.id, grade, {
          bloomLevel: t.currentBloomLevel || 1,
          questionsCount: perTopicQuestions,
          correctAnswers: perTopicCorrect,
          weight: quizWeight
        });
      }
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
      const correct = isAnswerCorrect(q, userAnswer, openEvaluations[i]);

      if (correct) {
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
        levelScores[level].correct += getQuestionScore(q, quizState.answers[i], openEvaluations[i]);
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
    } else if (isMultiMode && multiTopics.length > 0) {
      // Mix mode: attribute wrong answers to matching topics by concept/name similarity
      // Questions without a clear match go to the first topic only
      for (const { subject: s, topic: t } of multiTopics) {
        const topicNameLower = t.name.toLowerCase();
        const topicWrongAnswers = newWrongAnswers.filter(wa => {
          const conceptLower = (wa.concept || '').toLowerCase();
          return conceptLower.includes(topicNameLower) || topicNameLower.includes(conceptLower);
        });
        if (topicWrongAnswers.length > 0) {
          const existingWA = t.wrongAnswers || [];
          const merged = [...topicWrongAnswers, ...existingWA].slice(0, 20);
          updateTopic(s.id, t.id, { wrongAnswers: merged });
        }
      }
      // Unmatched wrong answers go to first topic as fallback
      const matchedConcepts = new Set<string>();
      for (const { topic: t } of multiTopics) {
        const topicNameLower = t.name.toLowerCase();
        newWrongAnswers.forEach(wa => {
          const conceptLower = (wa.concept || '').toLowerCase();
          if (conceptLower.includes(topicNameLower) || topicNameLower.includes(conceptLower)) {
            matchedConcepts.add(wa.concept || 'General');
          }
        });
      }
      const unmatchedWA = newWrongAnswers.filter(wa => !matchedConcepts.has(wa.concept || 'General'));
      if (unmatchedWA.length > 0 && multiTopics.length > 0) {
        const firstTopic = multiTopics[0];
        const existingWA = firstTopic.topic.wrongAnswers || [];
        const merged = [...unmatchedWA, ...existingWA].slice(0, 20);
        updateTopic(firstTopic.subject.id, firstTopic.topic.id, { wrongAnswers: merged });
      }
    } else if (subjectId && topicId) {
      updateTopic(subjectId, topicId, {
        wrongAnswers: mergedWrongAnswers
      });
    }
    // Auto-save quiz questions to question bank (for drilling later)
    const saveBankSubjectId = isMultiMode ? multiTopics[0]?.subject.id : subjectId;
    const saveBankTopicIds = isMultiMode ? multiTopics.map(({ topic: t }) => t.id) : (topicId ? [topicId] : []);
    if (saveBankSubjectId && quizState.questions.length > 0 && !isModuleQuiz) {
      try {
        const existingBanks = (data.questionBanks || []).filter(b => b.subjectId === saveBankSubjectId);
        let aiBank = existingBanks.find(b => b.name === 'AI Quiz');
        let bankId: string;
        if (aiBank) {
          bankId = aiBank.id;
        } else {
          bankId = addQuestionBank(saveBankSubjectId, 'AI Quiz');
          aiBank = { id: bankId, subjectId: saveBankSubjectId, name: 'AI Quiz', questions: [], cases: [], uploadedAt: new Date().toISOString() };
        }
        // Deduplicate: skip questions whose text already exists in the bank
        const existingTexts = new Set((aiBank.questions || []).map(q => q.text.toLowerCase().trim()));
        const mapToBankType = (t: string): 'mcq' | 'open' | 'case_study' => {
          if (t === 'multiple_choice') return 'mcq';
          if (t === 'case_study') return 'case_study';
          // fill_blank, short_answer, open → all map to 'open'
          return 'open';
        };
        const newBankQuestions = quizState.questions
          .filter(q => !existingTexts.has(q.question.toLowerCase().trim()))
          .map(q => ({
            type: mapToBankType(q.type),
            text: q.question,
            options: q.type === 'multiple_choice' || q.type === 'case_study' ? q.options : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            linkedTopicIds: saveBankTopicIds,
            bloomLevel: q.bloomLevel,
            stats: { attempts: 0, correct: 0 }
          }));
        if (newBankQuestions.length > 0) {
          addQuestionsToBank(bankId, newBankQuestions, []);
        }
      } catch (e) {
        console.error('Auto-save to question bank failed:', e);
      }
    }

    // Mark as saved and show feedback
    setGradeSaved(true);
    setIsSavingGrade(false);
  };

  const [freeRecallGradeSaved, setFreeRecallGradeSaved] = useState(false);
  const [mindMapGradeSaved, setMindMapGradeSaved] = useState(false);

  const handleSaveFreeRecallGrade = () => {
    if (!freeRecallEvaluation || freeRecallGradeSaved) return;

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
    setFreeRecallGradeSaved(true);
  };

  const handleSaveMindMapGrade = () => {
    if (!mindMapEvaluation || mindMapGradeSaved) return;
    if (subjectId && topicId && topic) {
      addGrade(subjectId, topicId, mindMapEvaluation.grade, {
        bloomLevel: mindMapEvaluation.bloomLevel,
        questionsCount: 1,
        correctAnswers: mindMapEvaluation.score >= 50 ? 1 : 0,
        weight: 1.0
      });
    }
    setMindMapGradeSaved(true);
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
    setMindMapCentral('');
    setMindMapBranches([]);
    setMindMapConnections([]);
    setMindMapImage(null);
    setMindMapEvaluation(null);
    setCurrentHint(null);
    setHintsUsed(0);
    timer.reset();
    setShowPreview(false);
    setSelectedTopics([]);
    setOpenEvaluations({}); // Reset AI evaluations
    setGradeSaved(false);
    setIsSavingGrade(false);
    setFreeRecallGradeSaved(false);
    setMindMapGradeSaved(false);
    setMistakeAnalysis(null);
    setIsAnalyzingMistakes(false);
    setClozeCards(null);
    setIsGeneratingCloze(false);
    setClozeError(null);
    setAnkiMaterialCards(null);
    setIsGeneratingAnkiMaterial(false);
    setAnkiMaterialError(null);
    setAnkiSendResult(null);
    setAnkiConnectAvailable(null);
    setCountWarning(null);
    setShowEarlyStopConfirm(false);
    setShowBackConfirm(false);
    setFillBlankAnswer('');
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
          const drillCount = Math.min(10, quizState.questions.length - Math.round(score));
          handleSaveGrade();
          resetQuiz();
          setMode('drill_weakness');
          setShowPreview(true);
          setPreviewQuestionCount(drillCount);
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
      <>
      {usedCache && quizState.currentIndex === 0 && !showExplanation && (
        <div className="mx-6 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <span className="text-[11px] text-blue-400">⚡ Кеширани въпроси (без разход)</span>
          <button
            onClick={() => { setForceNewQuestions(true); resetQuiz(); }}
            className="ml-auto text-[11px] text-blue-300 hover:text-white transition-colors underline"
          >
            Генерирай нови
          </button>
        </div>
      )}
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
        requestOpenHint={() => setPendingCogAction(() => requestOpenHint)}
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
        onBack={() => { setShowBackConfirm(false); resetQuiz(); }}
        fillBlankAnswer={fillBlankAnswer}
        setFillBlankAnswer={setFillBlankAnswer}
        onEditQuestion={handleEditQuestion}
        onDeleteQuestion={(idx) => setDeleteQuestionIndex(idx)}
        onReEvaluate={handleReEvaluate}
        onMetaReflection={handleMetaReflection}
        onAddQuestion={handleAddQuestion}
        openEvalFailed={openEvalFailed}
        onRetryEval={retryEvaluation}
        onSkip={handleSkip}
        onPrev={handlePrev}
        canGoBack={quizState.currentIndex > 0}
      />
      {/* Cognitive offloading warning (must render in quiz view) */}
      <ConfirmDialog
        isOpen={!!pendingCogAction}
        onClose={() => setPendingCogAction(null)}
        onConfirm={() => {
          pendingCogAction?.();
          setPendingCogAction(null);
        }}
        title="Опитай първо сам!"
        message="Активното припомняне укрепва паметта многократно повече от четенето на подсказки. Опитай да си спомниш сам преди да използваш AI помощ."
        confirmText="Покажи подсказка"
        cancelText="Ще опитам сам"
        variant="warning"
      />
      {/* Delete question confirmation */}
      <ConfirmDialog
        isOpen={deleteQuestionIndex !== null}
        onClose={() => setDeleteQuestionIndex(null)}
        onConfirm={handleDeleteQuestion}
        title="Изтрий въпрос?"
        message={`Въпрос ${(deleteQuestionIndex ?? 0) + 1} ще бъде премахнат от quiz-а. Оставащи: ${quizState.questions.length - 1}`}
        confirmText="Изтрий"
        cancelText="Отказ"
        variant="danger"
      />
      </>
    );
  }

  // Anki Cards from Material view
  if (ankiMaterialCards || isGeneratingAnkiMaterial) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <button
          onClick={() => { setAnkiMaterialCards(null); setAnkiMaterialError(null); setAnkiSendResult(null); }}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm"
        >
          <ArrowLeft size={16} /> Назад към режими
        </button>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl mx-auto">
          {isGeneratingAnkiMaterial ? (
            <div className="text-center py-12">
              <RefreshCw size={32} className="animate-spin text-emerald-400 mx-auto" />
              <p className="text-slate-400 mt-4 font-mono">Генериране на Anki карти от материала...</p>
              <p className="text-xs text-slate-600 font-mono mt-1">Bloom L1 (Запомняне): дефиниции, термини, факти</p>
            </div>
          ) : ankiMaterialCards ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <Sparkles size={24} className="text-emerald-400" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-100 font-mono">Anki Карти: {topic?.name}</h2>
                  <p className="text-sm text-slate-400 font-mono">Bloom L1 (Запомняне) · {ankiMaterialCards.length} карти</p>
                </div>
              </div>

              {/* Cards list */}
              <div className="space-y-2 mb-6 max-h-[500px] overflow-y-auto pr-1">
                {ankiMaterialCards.map((card, i) => (
                  <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 group relative">
                    <span className="text-[10px] text-slate-600 font-mono absolute top-1.5 left-2">{i + 1}</span>
                    <p
                      className="text-slate-200 font-mono text-sm leading-relaxed pl-5 pr-8"
                      dangerouslySetInnerHTML={{
                        __html: card.replace(
                          /\{\{c\d+::(.*?)\}\}/g,
                          '<span class="text-emerald-400 font-semibold bg-emerald-400/10 px-1 rounded">$1</span>'
                        )
                      }}
                    />
                    <button
                      onClick={() => { navigator.clipboard.writeText(card); showToast('Копирано!', 'success'); }}
                      className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 bg-slate-700/80 hover:bg-emerald-600/80 text-slate-400 hover:text-white rounded transition-all"
                      title="Копирай"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(ankiMaterialCards.join('\n\n'));
                    showToast(`${ankiMaterialCards.length} карти копирани!`, 'success');
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/30 rounded-lg font-mono text-sm transition-colors"
                >
                  <Copy size={16} /> Копирай всички
                </button>

                {ankiConnectAvailable && (
                  <button
                    onClick={sendCardsToAnki}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-mono text-sm transition-colors"
                  >
                    <Sparkles size={16} /> Изпрати в Anki
                  </button>
                )}

                <button
                  onClick={generateMoreAnkiCards}
                  disabled={isGeneratingAnkiMaterial}
                  className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600/20 border border-cyan-600/30 text-cyan-400 hover:bg-cyan-600/30 rounded-lg font-mono text-sm transition-colors disabled:opacity-50"
                >
                  <Plus size={16} /> Генерирай още
                </button>

                <button
                  onClick={() => generateAnkiFromMaterial(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-mono text-sm transition-colors"
                >
                  <RefreshCw size={16} /> Генерирай отново
                </button>
              </div>

              {ankiSendResult && (
                <p className={`mt-3 text-sm font-mono ${ankiSendResult.startsWith('Грешка') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {ankiSendResult}
                </p>
              )}
            </>
          ) : null}

          {ankiMaterialError && (
            <div className={`mt-4 p-4 rounded-lg ${ankiMaterialError === 'MATERIAL_CHANGED' ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              {ankiMaterialError === 'API_KEY_MISSING' ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-400" />
                    <span className="text-amber-400 font-mono text-sm">Нужен е API ключ</span>
                  </div>
                  <Link href="/settings" className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg font-mono text-sm">
                    <Settings size={14} /> Настройки
                  </Link>
                </div>
              ) : ankiMaterialError === 'MATERIAL_CHANGED' ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400 font-mono text-sm">
                    <AlertCircle size={18} /> Материалът е променен от последното генериране
                  </div>
                  <button
                    onClick={() => { setAnkiMaterialError(null); generateAnkiFromMaterial(true); }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-mono text-sm hover:bg-emerald-500"
                  >
                    Генерирай отново
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
                  <AlertCircle size={18} /> {ankiMaterialError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
              onClick={() => setPendingCogAction(() => requestHint)}
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
        {/* Cognitive offloading warning (must render in free recall view) */}
        <ConfirmDialog
          isOpen={!!pendingCogAction}
          onClose={() => setPendingCogAction(null)}
          onConfirm={() => {
            pendingCogAction?.();
            setPendingCogAction(null);
          }}
          title="Опитай първо сам!"
          message="Активното припомняне укрепва паметта многократно повече от четенето на подсказки. Опитай да си спомниш сам преди да използваш AI помощ."
          confirmText="Покажи подсказка"
          cancelText="Ще опитам сам"
          variant="warning"
        />
      </div>
    );
  }

  // Mind Map Mode
  if (mode === 'mind_map' && !quizState.isGenerating) {
    // Show results if evaluation is done
    if (mindMapEvaluation) {
      const evalEmoji = mindMapEvaluation.score >= 75 ? '🎉' : mindMapEvaluation.score >= 50 ? '👍' : '📚';
      return (
        <div className="min-h-screen p-6 space-y-6">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl">
            {/* Header */}
            <div className="text-center mb-6">
              <span className="text-5xl">{evalEmoji}</span>
              <div className={`text-4xl font-bold font-mono mt-3 ${
                mindMapEvaluation.grade >= 5 ? 'text-green-400' :
                mindMapEvaluation.grade >= 4 ? 'text-yellow-400' : 'text-orange-400'
              }`}>
                {mindMapEvaluation.grade.toFixed(1)}
              </div>
              <p className="text-sm text-slate-500 font-mono mt-1">
                Mind Map · {mindMapEvaluation.score}% покритие · Bloom {mindMapEvaluation.bloomLevel}
              </p>
            </div>

            {/* Feedback */}
            <div className="p-4 bg-slate-800/50 rounded-lg mb-4">
              <p className="text-sm text-slate-300 font-mono">{mindMapEvaluation.feedback}</p>
            </div>

            {/* Hierarchy score */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-1">
                <span>Организация на йерархията</span>
                <span>{mindMapEvaluation.hierarchyScore}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    mindMapEvaluation.hierarchyScore >= 70 ? 'bg-green-500' :
                    mindMapEvaluation.hierarchyScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${mindMapEvaluation.hierarchyScore}%` }}
                />
              </div>
            </div>

            {/* Concepts covered */}
            {mindMapEvaluation.conceptsCovered.length > 0 && (
              <div className="p-3 bg-green-500/10 rounded-lg mb-3">
                <p className="text-xs text-green-400 font-mono font-semibold mb-1.5">Покрити концепции:</p>
                <div className="flex flex-wrap gap-1.5">
                  {mindMapEvaluation.conceptsCovered.map((c, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-mono ${
                      c.accuracy === 'correct' ? 'bg-green-500/20 text-green-400' :
                      c.accuracy === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {c.concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Connections covered */}
            {mindMapEvaluation.connectionsCovered.length > 0 && (
              <div className="p-3 bg-teal-500/10 rounded-lg mb-3">
                <p className="text-xs text-teal-400 font-mono font-semibold mb-1.5">Покрити връзки:</p>
                <ul className="space-y-1">
                  {mindMapEvaluation.connectionsCovered.map((c, i) => (
                    <li key={i} className={`text-xs font-mono flex items-center gap-1.5 ${
                      c.accuracy === 'correct' ? 'text-green-400' :
                      c.accuracy === 'partial' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {c.from} → {c.to}: {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing concepts */}
            {mindMapEvaluation.missingConcepts.length > 0 && (
              <div className="p-3 bg-red-500/10 rounded-lg mb-3">
                <p className="text-xs text-red-400 font-mono font-semibold mb-1.5">Пропуснати концепции:</p>
                <div className="flex flex-wrap gap-1.5">
                  {mindMapEvaluation.missingConcepts.map((c, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-mono ${
                      c.importance === 'critical' ? 'bg-red-500/20 text-red-400' :
                      c.importance === 'important' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {c.concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Missing connections */}
            {mindMapEvaluation.missingConnections.length > 0 && (
              <div className="p-3 bg-orange-500/10 rounded-lg mb-3">
                <p className="text-xs text-orange-400 font-mono font-semibold mb-1.5">Пропуснати връзки:</p>
                <ul className="space-y-1">
                  {mindMapEvaluation.missingConnections.map((c, i) => (
                    <li key={i} className="text-xs font-mono text-orange-300">
                      {c.from} → {c.to}: {c.relationship}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next step */}
            {mindMapEvaluation.suggestedNextStep && (
              <div className="p-3 bg-purple-500/10 rounded-lg mb-4">
                <p className="text-xs text-purple-400 font-mono font-semibold mb-1">Следваща стъпка:</p>
                <p className="text-sm text-slate-300 font-mono">{mindMapEvaluation.suggestedNextStep}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { handleSaveMindMapGrade(); resetQuiz(); }}
                className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold rounded-lg font-mono"
              >
                Запази и затвори
              </button>
              <button
                onClick={() => { handleSaveMindMapGrade(); setMindMapEvaluation(null); }}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-mono"
              >
                Опитай пак
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show builder
    return (
      <div className="min-h-screen p-6 space-y-6">
        <Link href="/quiz" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm">
          <ArrowLeft size={16} /> Назад
        </Link>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl">
          <MindMapBuilder
            central={mindMapCentral}
            setCentral={setMindMapCentral}
            branches={mindMapBranches}
            setBranches={setMindMapBranches}
            connections={mindMapConnections}
            setConnections={setMindMapConnections}
            image={mindMapImage}
            setImage={setMindMapImage}
            isEvaluating={isEvaluating}
            onEvaluate={evaluateMindMap}
            topicName={topic?.name || ''}
          />
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
          hasSpecimens={!isMultiMode && (topic?.specimens?.length || 0) > 0 && /анатомия|патоанатомия|микробиология|хистология|патология/i.test(subject?.name || '')}
          specimenCount={topic?.specimens?.length || 0}
          onOpenPreview={openPreview}
        />
      </div>

      {/* Cognitive offloading warning */}
      <ConfirmDialog
        isOpen={!!pendingCogAction}
        onClose={() => setPendingCogAction(null)}
        onConfirm={() => {
          pendingCogAction?.();
          setPendingCogAction(null);
        }}
        title="Опитай първо сам!"
        message="Активното припомняне укрепва паметта многократно повече от четенето на подсказки. Опитай да си спомниш сам преди да използваш AI помощ."
        confirmText="Покажи подсказка"
        cancelText="Ще опитам сам"
        variant="warning"
      />
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
