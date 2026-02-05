'use client';

import { useState, useEffect, Suspense, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Brain, Play, ChevronRight, CheckCircle, XCircle, RefreshCw, ArrowLeft, Settings, AlertCircle, TrendingUp, Sparkles, Lightbulb, Target, FileText, Zap, Clock, StopCircle, Repeat, Download } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import { BLOOM_LEVELS, BloomLevel, QuizLengthPreset, QUIZ_LENGTH_PRESETS, WrongAnswer } from '@/lib/types';
import { fetchWithTimeout, getFetchErrorMessage, isAbortOrTimeoutError } from '@/lib/fetch-utils';
import { showToast } from '@/components/Toast';

type QuizMode = 'assessment' | 'free_recall' | 'gap_analysis' | 'lower_order' | 'mid_order' | 'higher_order' | 'custom' | 'drill_weakness';

interface Question {
  type: 'multiple_choice' | 'open' | 'case_study';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  bloomLevel?: number;
  concept?: string;
}

interface FreeRecallEvaluation {
  score: number;
  grade: number;
  bloomLevel: number;
  covered: Array<{ concept: string; accuracy: string; detail: string }>;
  missing: Array<{ concept: string; importance: string }>;
  feedback: string;
  suggestedNextStep: string;
}

interface OpenAnswerEvaluation {
  score: number; // 0-1
  isCorrect: boolean;
  feedback: string;
  keyPointsCovered: string[];
  keyPointsMissed: string[];
}

interface MistakeAnalysis {
  summary: string;
  weakConcepts: string[];
  patterns: Array<{
    type: string;
    description: string;
    frequency: string;
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    reason: string;
  }>;
  priorityFocus: string | null;
}

interface QuizState {
  questions: Question[];
  currentIndex: number;
  answers: (string | null)[];
  showResult: boolean;
  isGenerating: boolean;
  error: string | null;
}

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

  // AbortController for cleanup on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup effect - abort any pending requests on unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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
      if (!subj || !top || !top.material) return null;
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
  const [generatingStartTime, setGeneratingStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [openAnswer, setOpenAnswer] = useState('');
  const [openHint, setOpenHint] = useState<string | null>(null);
  const [openHintLoading, setOpenHintLoading] = useState(false);

  // Preview screen state
  const [showPreview, setShowPreview] = useState(false);
  const [previewQuestionCount, setPreviewQuestionCount] = useState(12);

  // Multi-topic mode
  const [multiTopicMode, setMultiTopicMode] = useState(false);
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

  // Timer state
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Per-question time tracking
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]); // Seconds per question

  // Early termination state
  const [showEarlyStopConfirm, setShowEarlyStopConfirm] = useState(false);

  // Back navigation confirmation state
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // Question count warning
  const [countWarning, setCountWarning] = useState<string | null>(null);

  // Mistake analysis state
  const [mistakeAnalysis, setMistakeAnalysis] = useState<MistakeAnalysis | null>(null);
  const [isAnalyzingMistakes, setIsAnalyzingMistakes] = useState(false);

  // Grade save state - prevents duplicate saves and shows feedback
  const [gradeSaved, setGradeSaved] = useState(false);
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  // Anki preview modal state
  const [showAnkiPreview, setShowAnkiPreview] = useState(false);
  const [ankiCards, setAnkiCards] = useState<Array<{ front: string; back: string; tag: string }>>([]);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const MAX_HINTS = 3;

  // Elapsed time counter during generation
  useEffect(() => {
    if (!generatingStartTime) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - generatingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [generatingStartTime]);

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

  // Timer effect - runs when quiz starts
  useEffect(() => {
    if (quizState.questions.length > 0 && !quizState.showResult && !quizStartTime) {
      setQuizStartTime(Date.now());
    }
  }, [quizState.questions.length, quizState.showResult, quizStartTime]);

  // Timer tick
  useEffect(() => {
    if (!quizStartTime || quizState.showResult) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - quizStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [quizStartTime, quizState.showResult]);

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

        // Enter to submit - handled inline to avoid stale closure
        if (e.key === 'Enter' && selectedAnswer) {
          e.preventDefault();
          setShowExplanation(true);
        }
      } else {
        // After showing explanation, Enter to go next - handled inline
        if (e.key === 'Enter') {
          e.preventDefault();
          // Trigger next question logic
          const nextIndex = quizState.currentIndex + 1;
          if (nextIndex < quizState.questions.length) {
            setQuizState(prev => ({ ...prev, currentIndex: nextIndex }));
            setSelectedAnswer(null);
            setOpenAnswer('');
            setShowExplanation(false);
          } else {
            setQuizState(prev => ({ ...prev, showResult: true }));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quizState.questions, quizState.currentIndex, quizState.showResult, showExplanation, selectedAnswer]);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Open preview screen and set initial question count
  const openPreview = () => {
    const initialCount = mode === 'custom'
      ? customQuestionCount
      : QUIZ_LENGTH_PRESETS[quizLength].questions;
    setPreviewQuestionCount(initialCount);
    setShowPreview(true);
  };

  const generateQuiz = async () => {
    // Prevent double-click
    if (quizState.isGenerating) return;

    // Validate mode is selected
    if (!mode) {
      setQuizState(prev => ({ ...prev, error: 'Избери режим на теста.' }));
      return;
    }

    // Check if we have material (single topic or multi-topic)
    const hasValidMaterial = isMultiMode
      ? multiTopics.length > 0
      : (topic?.material && topic.material.trim().length > 0);

    if (!hasValidMaterial && mode !== 'free_recall') {
      setQuizState(prev => ({ ...prev, error: 'Няма добавен материал към темата.' }));
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setQuizState(prev => ({ ...prev, error: 'API_KEY_MISSING' }));
      return;
    }

    setQuizState(prev => ({ ...prev, isGenerating: true, error: null }));
    setGeneratingStartTime(Date.now());

    try {
      // Use preview question count (user may have adjusted it)
      const questionCount = previewQuestionCount;

      // Build request body based on mode
      let requestBody;

      if (isMultiMode && multiTopics.length > 0) {
        // Multi-topic mode: combine materials
        const combinedMaterial = multiTopics.map(({ subject: s, topic: t }) =>
          `=== ТЕМА: ${t.name} (${s.name}) ===\n${t.material}`
        ).join('\n\n---\n\n');

        const topicNames = multiTopics.map(({ topic: t }) => t.name).join(', ');
        const avgBloom = Math.round(
          multiTopics.reduce((sum, { topic: t }) => sum + (t.currentBloomLevel || 1), 0) / multiTopics.length
        );

        requestBody = {
          apiKey,
          material: combinedMaterial,
          topicName: `Mix: ${multiTopics.length} теми`,
          subjectName: multiTopics.map(({ subject: s }) => s.name).filter((v, i, a) => a.indexOf(v) === i).join(', '),
          subjectType: multiTopics[0]?.subject.subjectType || 'preclinical',
          examFormat: multiTopics[0]?.subject.examFormat,
          matchExamFormat,
          mode,
          questionCount,
          bloomLevel: mode === 'custom' ? customBloomLevel : null,
          currentBloomLevel: avgBloom,
          isMultiTopic: true,
          topicsList: topicNames,
          model: selectedModel
        };
      } else {
        // Single topic mode
        requestBody = {
          apiKey,
          material: topic?.material,
          topicName: topic?.name,
          subjectName: subject?.name || '',
          subjectType: subject?.subjectType || 'preclinical',
          examFormat: subject?.examFormat,
          matchExamFormat,
          mode,
          questionCount,
          bloomLevel: mode === 'custom' ? customBloomLevel : null,
          currentBloomLevel: topic?.currentBloomLevel || 1,
          quizHistory: topic?.quizHistory,
          // For drill_weakness and gap_analysis modes - pass wrong answers
          wrongAnswers: (mode === 'drill_weakness' || mode === 'gap_analysis') ? topic?.wrongAnswers : undefined,
          model: selectedModel
        };
      }

      const response = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: 240000, // 4 min - long topics can take 2-3 min
        signal: abortControllerRef.current?.signal
      });

      const result = await response.json();

      if (!response.ok) {
        setGeneratingStartTime(null);
        setQuizState(prev => ({
          ...prev,
          isGenerating: false,
          error: result.error || 'Грешка при генериране.'
        }));
        return;
      }

      if (result.usage) {
        incrementApiCalls(result.usage.cost);
      }

      // Check for count warning
      if (result.countWarning) {
        setCountWarning(result.countWarning);
      } else {
        setCountWarning(null);
      }

      setGeneratingStartTime(null);
      setQuizState({
        questions: result.questions,
        currentIndex: 0,
        answers: new Array(result.questions.length).fill(null),
        showResult: false,
        isGenerating: false,
        error: null
      });
      // Start timers
      const now = Date.now();
      setQuizStartTime(now);
      setQuestionStartTime(now);
      setQuestionTimes(new Array(result.questions.length).fill(0));
    } catch (error) {
      setGeneratingStartTime(null);
      if (isAbortOrTimeoutError(error)) {
        setQuizState(prev => ({
          ...prev,
          isGenerating: false,
          error: 'Генерирането беше отменено.'
        }));
      } else {
        setQuizState(prev => ({
          ...prev,
          isGenerating: false,
          error: getFetchErrorMessage(error)
        }));
      }
    }
  };

  const cancelGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    setGeneratingStartTime(null);
    setQuizState(prev => ({
      ...prev,
      isGenerating: false,
      error: null
    }));
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
        
        signal: abortControllerRef.current?.signal
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
        
        signal: abortControllerRef.current?.signal
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
        signal: abortControllerRef.current?.signal
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
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const answer = currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study'
      ? selectedAnswer
      : openAnswer;

    const newAnswers = [...quizState.answers];
    newAnswers[quizState.currentIndex] = answer;

    // Record time spent on this question
    if (questionStartTime) {
      const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
      setQuestionTimes(prev => {
        const newTimes = [...prev];
        newTimes[quizState.currentIndex] = timeSpent;
        return newTimes;
      });
    }

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
            
            signal: abortControllerRef.current?.signal
          });

          const result = await response.json();
          if (result.evaluation) {
            setOpenEvaluations(prev => ({
              ...prev,
              [quizState.currentIndex]: result.evaluation
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
      // Start timer for next question
      setQuestionStartTime(Date.now());
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

  const calculateScore = () => {
    let correct = 0;
    quizState.questions.forEach((q, i) => {
      if ((q.type === 'multiple_choice' || q.type === 'case_study') && quizState.answers[i] === q.correctAnswer) {
        correct++;
      } else if (q.type === 'open' && quizState.answers[i]) {
        // Use AI evaluation score if available, otherwise 0
        const evaluation = openEvaluations[i];
        if (evaluation) {
          correct += evaluation.score; // 0-1 based on AI evaluation
        }
        // No automatic points - AI must evaluate
      }
    });
    return correct;
  };

  const getGradeFromScore = (score: number, total: number) => {
    const percentage = (score / total) * 100;
    if (percentage >= 90) return 6;
    if (percentage >= 75) return 5;
    if (percentage >= 60) return 4;
    if (percentage >= 40) return 3;
    return 2;
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
        signal: abortControllerRef.current?.signal
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

  // Build Anki cards from wrong answers
  const buildAnkiCards = (): Array<{ front: string; back: string; tag: string }> => {
    const cards: Array<{ front: string; back: string; tag: string }> = [];

    quizState.questions.forEach((q, i) => {
      const openEval = openEvaluations[i];

      const isWrong = q.type === 'open'
        ? (!openEval || openEval.score < 0.7)
        : quizState.answers[i] !== q.correctAnswer;

      if (!isWrong) return;

      const front = q.question.replace(/\t/g, ' ').replace(/\n/g, ' ');
      let back = q.correctAnswer.replace(/\t/g, ' ').replace(/\n/g, ' ');
      if (q.explanation) {
        back += '\n\n' + q.explanation.replace(/\t/g, ' ').replace(/\n/g, ' ');
      }
      const tag = q.concept ? q.concept.replace(/\s+/g, '_') : 'General';

      cards.push({ front, back, tag });
    });

    return cards;
  };

  // Download TSV file from cards array
  const downloadAnkiTSV = (cards: Array<{ front: string; back: string; tag: string }>) => {
    const content = cards.map(card =>
      `${card.front.replace(/\t/g, ' ')}\t${card.back.replace(/\t/g, ' ').replace(/\n/g, '<br>')}\t${card.tag}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `anki-cards-${topic?.name || 'quiz'}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Direct export - one click download
  const exportAnkiDirect = () => {
    const cards = buildAnkiCards();
    if (cards.length === 0) {
      showToast('Няма грешки за експорт.', 'info');
      return;
    }
    downloadAnkiTSV(cards);
    showToast(`${cards.length} Anki карти изтеглени!`, 'success');
  };

  // Open preview modal for editing before export
  const prepareAnkiCards = () => {
    const cards = buildAnkiCards();
    if (cards.length === 0) {
      showToast('Няма грешки за генериране на карти.', 'info');
      return;
    }
    setAnkiCards(cards);
    setShowAnkiPreview(true);
    setEditingCardIndex(null);
  };

  // Export from preview modal (after editing)
  const exportAnkiCards = () => {
    if (ankiCards.length === 0) return;
    downloadAnkiTSV(ankiCards);
    setShowAnkiPreview(false);
    showToast(`${ankiCards.length} Anki карти изтеглени!`, 'success');
  };

  // Update a single Anki card
  const updateAnkiCard = (index: number, field: 'front' | 'back' | 'tag', value: string) => {
    setAnkiCards(prev => prev.map((card, i) =>
      i === index ? { ...card, [field]: value } : card
    ));
  };

  // Delete an Anki card
  const deleteAnkiCard = (index: number) => {
    setAnkiCards(prev => prev.filter((_, i) => i !== index));
    setEditingCardIndex(null);
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
    const score = calculateScore();
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
            timeSpent: questionTimes[i] || 0
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
              timeSpent: questionTimes[i] || 0
            });
          }
        }
      }
    });

    // Handle wrong answers based on mode
    let mergedWrongAnswers: WrongAnswer[];
    const existingWrongAnswers = isModuleQuiz ? (module?.wrongAnswers || []) : (topic?.wrongAnswers || []);

    if (mode === 'drill_weakness') {
      // For drill_weakness mode: only increment drillCount for questions that were ACTUALLY in this quiz
      // Get the concepts that were drilled (from the quiz questions)
      const drilledConcepts = new Set(
        quizState.questions.map(q => q.concept || 'General')
      );

      mergedWrongAnswers = existingWrongAnswers.map(wa => {
        // Only increment if this wrong answer's concept was drilled in this quiz
        const wasDrilled = drilledConcepts.has(wa.concept);
        return {
          ...wa,
          drillCount: wasDrilled ? wa.drillCount + 1 : wa.drillCount
        };
      });
      // Also add any NEW wrong answers from this drill session
      if (newWrongAnswers.length > 0) {
        mergedWrongAnswers = [...newWrongAnswers, ...mergedWrongAnswers].slice(0, 20);
      }
    } else {
      // For other modes: just merge new wrong answers with existing
      mergedWrongAnswers = [...newWrongAnswers, ...existingWrongAnswers].slice(0, 20);
    }

    // Remove "mastered" wrong answers: drillCount >= 3 AND concept answered correctly
    // This cleans up old weaknesses that the student has now overcome
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

    // Get weight from preset (custom mode uses standard weight)
    const weight = mode === 'custom' ? 1.0 : QUIZ_LENGTH_PRESETS[quizLength].weight;

    const quizResult = {
      date: new Date().toISOString(),
      bloomLevel: quizBloomLevel, // The level this quiz was taken at
      score: Math.round(percentage),
      questionsCount: quizState.questions.length,
      correctAnswers: Math.round(score),
      weight
    };

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
    setQuizStartTime(null);
    setElapsedTime(0);
    setShowPreview(false);
    setSelectedTopics([]);
    setOpenEvaluations({}); // Reset AI evaluations
  };

  // Toggle topic selection for multi-topic mode
  const toggleTopicSelection = (subjectId: string, topicId: string) => {
    setSelectedTopics(prev => {
      const exists = prev.some(t => t.subjectId === subjectId && t.topicId === topicId);
      if (exists) {
        return prev.filter(t => !(t.subjectId === subjectId && t.topicId === topicId));
      } else {
        return [...prev, { subjectId, topicId }];
      }
    });
  };

  // Get combined material for multi-topic quiz
  const getMultiTopicMaterial = () => {
    return selectedTopics.map(({ subjectId, topicId }) => {
      const subj = data.subjects.find(s => s.id === subjectId);
      const top = subj?.topics.find(t => t.id === topicId);
      if (!subj || !top) return null;
      return {
        subjectName: subj.name,
        topicName: top.name,
        topicNumber: top.number,
        material: top.material || ''
      };
    }).filter(Boolean);
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
                  {subj.topics.filter(t => t.material).map(t => (
                    <Link
                      key={t.id}
                      href={`/quiz?subject=${subj.id}&topic=${t.id}`}
                      className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-pink-500/50 hover:bg-pink-500/5 transition-all"
                    >
                      <div className="flex items-start gap-2">
                        <span className="shrink-0">{STATUS_CONFIG[t.status].emoji}</span>
                        <span className="text-slate-200 font-mono text-sm line-clamp-2" title={`#${t.number} ${t.name}`}>
                          #{t.number} {t.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                        <span>Bloom: {t.currentBloomLevel || 1}</span>
                        {t.quizCount > 0 && <span>• {t.quizCount} теста</span>}
                      </div>
                    </Link>
                  ))}
                </div>
                {subj.topics.filter(t => t.material).length === 0 && (
                  <p className="text-sm text-slate-600 font-mono">
                    Няма теми с добавен материал
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
    const score = calculateScore();
    const questionsCount = quizState.questions.length || 1; // Guard against division by zero
    const grade = getGradeFromScore(score, questionsCount);
    const percentage = Math.round((score / questionsCount) * 100);

    // Count wrong answers accurately for Anki export and analysis buttons
    const wrongCount = quizState.questions.filter((q, i) => {
      const openEval = openEvaluations[i];
      return q.type === 'open'
        ? (!openEval || openEval.score < 0.7)
        : quizState.answers[i] !== q.correctAnswer;
    }).length;

    return (
      <div className="min-h-screen p-6 space-y-6">
        <Link
          href={subjectId && topicId ? `/subjects/${subjectId}/topics/${topicId}` : '/quiz'}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm"
        >
          <ArrowLeft size={16} /> {subjectId && topicId ? 'Към темата' : 'Назад'}
        </Link>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-4">
            {percentage >= 75 ? '🎉' : percentage >= 50 ? '👍' : '📚'}
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2 font-mono">
            {score.toFixed(1)} / {quizState.questions.length}
          </h2>
          <p className="text-slate-400 font-mono mb-2">{percentage}% правилни</p>
          {elapsedTime > 0 && (
            <div className="text-sm mb-6 space-y-1">
              <p className="text-blue-400 font-mono flex items-center justify-center gap-2">
                <Clock size={14} />
                Общо време: {formatTime(elapsedTime)}
              </p>
              {questionTimes.length > 0 && questionTimes.some(t => t > 0) && (() => {
                const validTimes = questionTimes.filter(t => t > 0);
                const avgTime = Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
                const maxTime = Math.max(...validTimes);
                const slowestIndex = questionTimes.indexOf(maxTime);
                const slowestQuestion = quizState.questions[slowestIndex];
                const questionText = slowestQuestion?.question || '';
                const truncatedText = questionText.length > 80
                  ? questionText.substring(0, 80) + '...'
                  : questionText;
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-4 justify-center text-xs text-slate-500 font-mono">
                      <span>⏱️ Средно: {avgTime}s/въпрос</span>
                      <span className="text-amber-400">🐢 Най-бавен: Q{slowestIndex + 1} ({maxTime}s)</span>
                    </div>
                    {truncatedText && (
                      <div className="text-xs text-amber-300/70 font-mono px-4 py-2 bg-amber-500/5 rounded-lg border border-amber-500/20 max-w-md mx-auto">
                        <span className="text-amber-400/50">„</span>
                        {truncatedText}
                        <span className="text-amber-400/50">"</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div className={`inline-block px-8 py-4 rounded-xl border-2 font-mono text-4xl font-bold mb-6 ${
            grade >= 5 ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            grade >= 4 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
            'bg-orange-500/10 border-orange-500/30 text-orange-400'
          }`}>
            {grade.toFixed(2)}
          </div>

          {/* Wrong answers detail */}
          {wrongCount > 0 && (
            <div className="w-full max-w-2xl mx-auto mb-6">
              <details className="group">
                <summary className="cursor-pointer text-sm text-orange-400 font-mono mb-2 hover:text-orange-300 transition-colors flex items-center justify-center gap-2">
                  <XCircle size={16} />
                  {quizState.questions.length - Math.round(score)} грешни въпроса
                  <span className="text-xs text-slate-500">(цъкни за детайли)</span>
                </summary>
                <div className="mt-4 space-y-4 text-left">
                  {quizState.questions.map((q, i) => {
                    const userAnswer = quizState.answers[i];
                    const openEval = openEvaluations[i];

                    // Determine if wrong
                    const isWrong = q.type === 'open'
                      ? (!openEval || openEval.score < 0.7)
                      : userAnswer !== q.correctAnswer;

                    if (!isWrong) return null;

                    return (
                      <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded font-mono">
                            Q{i + 1}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {q.type === 'case_study' ? 'Казус' : q.type === 'open' ? 'Отворен' : 'Избор'}
                          </span>
                          {q.concept && (
                            <span className="text-xs text-purple-400 font-mono ml-auto">
                              {q.concept}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-300 font-mono mb-3 leading-relaxed">
                          {q.question}
                        </p>

                        <div className="grid gap-2 text-xs font-mono">
                          <div className="bg-red-500/10 rounded p-2 border-l-2 border-red-500">
                            <span className="text-red-400 font-semibold">Твой отговор: </span>
                            <span className="text-red-300">{userAnswer || '(празен)'}</span>
                          </div>
                          <div className="bg-green-500/10 rounded p-2 border-l-2 border-green-500">
                            <span className="text-green-400 font-semibold">Правилен: </span>
                            <span className="text-green-300">{q.correctAnswer}</span>
                          </div>
                          {q.explanation && (
                            <div className="bg-slate-700/50 rounded p-2 border-l-2 border-slate-500">
                              <span className="text-slate-400 font-semibold">Обяснение: </span>
                              <span className="text-slate-300">{q.explanation}</span>
                            </div>
                          )}
                          {q.type === 'open' && openEval && (
                            <div className="bg-purple-500/10 rounded p-2 border-l-2 border-purple-500">
                              <span className="text-purple-400 font-semibold">AI оценка: </span>
                              <span className="text-purple-300">{Math.round(openEval.score * 100)}% - {openEval.feedback}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={handleSaveGrade}
              disabled={gradeSaved || isSavingGrade}
              className={`flex items-center gap-2 px-6 py-3 font-semibold rounded-lg font-mono transition-all ${gradeSaved ? "bg-green-800 text-green-200 cursor-default" : isSavingGrade ? "bg-slate-600 text-slate-300 cursor-wait" : "bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700"}`}
            >
              {isSavingGrade ? (
                <><RefreshCw size={20} className="animate-spin" /> Запазване...</>
              ) : gradeSaved ? (
                <><CheckCircle size={20} /> Запазено!</>
              ) : (
                <><CheckCircle size={20} /> Запази</>
              )}
            </button>
            <button
              onClick={() => {
                handleSaveGrade(); // Auto-save before reset to preserve wrong answers
                resetQuiz();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-slate-200 font-semibold rounded-lg font-mono"
            >
              <RefreshCw size={20} /> Нов тест
            </button>
            {/* Drill Weakness button - only show if there were wrong answers */}
            {wrongCount > 0 && (
              <button
                onClick={() => {
                  handleSaveGrade(); // Save first to record wrong answers
                  setMode('drill_weakness');
                  setShowPreview(true);
                  setPreviewQuestionCount(Math.min(10, quizState.questions.length - Math.round(score)));
                  setQuizState({
                    questions: [],
                    currentIndex: 0,
                    answers: [],
                    showResult: false,
                    isGenerating: false,
                    error: null
                  });
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-semibold rounded-lg font-mono"
              >
                <Repeat size={20} /> Drill Weakness
              </button>
            )}
            {/* Anki Export buttons - only show if there were wrong answers */}
            {wrongCount > 0 && (
              <>
                <button
                  onClick={exportAnkiDirect}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg font-mono hover:from-cyan-700 hover:to-blue-700 transition-all"
                  title="Изтегли грешките като Anki карти (TSV)"
                >
                  <Download size={20} /> Anki Export
                </button>
                <button
                  onClick={prepareAnkiCards}
                  className="flex items-center gap-2 px-4 py-3 bg-slate-700/60 border border-slate-600/50 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-700 hover:text-cyan-300 transition-all"
                  title="Прегледай и редактирай картите преди експорт"
                >
                  <Settings size={16} /> Preview
                </button>
              </>
            )}
          </div>

          {/* AI Mistake Analysis Section */}
          {wrongCount > 0 && (
            <div className="mt-8 w-full max-w-2xl mx-auto">
              {!mistakeAnalysis && !isAnalyzingMistakes && (
                <button
                  onClick={analyzeMistakes}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg font-mono hover:from-purple-700 hover:to-indigo-700 transition-all"
                >
                  <Brain size={20} /> Анализирай грешките с AI
                </button>
              )}

              {isAnalyzingMistakes && (
                <div className="flex items-center justify-center gap-3 py-4 text-purple-400 font-mono">
                  <RefreshCw size={20} className="animate-spin" />
                  AI анализира грешките...
                </div>
              )}

              {mistakeAnalysis && (
                <div className="bg-slate-800/50 border border-purple-500/30 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-purple-400 font-mono font-semibold border-b border-slate-700 pb-3">
                    <Brain size={20} />
                    AI Анализ на грешките
                  </div>

                  {/* Summary */}
                  <div className="text-slate-300 font-mono text-sm">
                    {mistakeAnalysis.summary}
                  </div>

                  {/* Priority Focus */}
                  {mistakeAnalysis.priorityFocus && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-red-400 font-mono text-xs font-semibold mb-1">
                        <Target size={14} />
                        ПРИОРИТЕТЕН ФОКУС
                      </div>
                      <p className="text-red-300 font-mono text-sm">{mistakeAnalysis.priorityFocus}</p>
                    </div>
                  )}

                  {/* Weak Concepts */}
                  {mistakeAnalysis.weakConcepts.length > 0 && (
                    <div>
                      <h4 className="text-slate-400 font-mono text-xs font-semibold mb-2">Слаби концепции:</h4>
                      <div className="flex flex-wrap gap-2">
                        {mistakeAnalysis.weakConcepts.map((concept, i) => (
                          <span key={i} className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs font-mono">
                            {concept}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Patterns */}
                  {mistakeAnalysis.patterns.length > 0 && (
                    <div>
                      <h4 className="text-slate-400 font-mono text-xs font-semibold mb-2">Открити модели:</h4>
                      <div className="space-y-2">
                        {mistakeAnalysis.patterns.map((pattern, i) => (
                          <div key={i} className="bg-slate-700/50 rounded p-2 text-xs font-mono">
                            <span className={`inline-block px-1.5 py-0.5 rounded mr-2 ${
                              pattern.type === 'conceptual_gap' ? 'bg-red-500/30 text-red-300' :
                              pattern.type === 'confusion' ? 'bg-yellow-500/30 text-yellow-300' :
                              pattern.type === 'detail_miss' ? 'bg-blue-500/30 text-blue-300' :
                              pattern.type === 'application_error' ? 'bg-purple-500/30 text-purple-300' :
                              'bg-slate-500/30 text-slate-300'
                            }`}>
                              {pattern.type === 'conceptual_gap' ? 'Концептуална празнина' :
                               pattern.type === 'confusion' ? 'Объркване' :
                               pattern.type === 'detail_miss' ? 'Пропуснат детайл' :
                               pattern.type === 'application_error' ? 'Грешка в приложението' :
                               pattern.type === 'recall_failure' ? 'Проблем с паметта' :
                               pattern.type}
                            </span>
                            <span className="text-slate-300">{pattern.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {mistakeAnalysis.recommendations.length > 0 && (
                    <div>
                      <h4 className="text-slate-400 font-mono text-xs font-semibold mb-2">Препоръки:</h4>
                      <div className="space-y-2">
                        {mistakeAnalysis.recommendations.map((rec, i) => (
                          <div key={i} className={`rounded p-3 text-xs font-mono border-l-2 ${
                            rec.priority === 'high' ? 'bg-red-500/10 border-red-500' :
                            rec.priority === 'medium' ? 'bg-yellow-500/10 border-yellow-500' :
                            'bg-green-500/10 border-green-500'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`uppercase text-[10px] font-bold ${
                                rec.priority === 'high' ? 'text-red-400' :
                                rec.priority === 'medium' ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>
                                {rec.priority === 'high' ? 'Важно' : rec.priority === 'medium' ? 'Средно' : 'Допълнително'}
                              </span>
                            </div>
                            <p className="text-slate-200 mb-1">{rec.action}</p>
                            <p className="text-slate-500 text-[10px]">{rec.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Quiz in progress
  if (quizState.questions.length > 0) {
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const openEval = openEvaluations[quizState.currentIndex];
    const isCorrect = (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study')
      ? selectedAnswer === currentQuestion.correctAnswer
      : openEval?.isCorrect ?? false; // Open questions use AI evaluation

    return (
      <div className="min-h-screen p-6 space-y-6">
        {/* Early stop confirmation modal */}
        {showEarlyStopConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-slate-100 font-mono mb-2">
                Прекрати теста?
              </h3>
              <p className="text-sm text-slate-400 font-mono mb-4">
                Отговорил си на {quizState.answers.filter(a => a !== null).length} от {quizState.questions.length} въпроса.
                Резултатът ще се изчисли само от отговорените.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEarlyStopConfirm(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg font-mono text-sm hover:bg-slate-600"
                >
                  Продължи
                </button>
                <button
                  onClick={handleEarlyStop}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-mono text-sm hover:bg-red-500"
                >
                  Прекрати
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back navigation confirmation modal */}
        {showBackConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-slate-100 font-mono mb-2">
                Напускаш теста?
              </h3>
              <p className="text-sm text-slate-400 font-mono mb-4">
                Имаш незавършен тест. Ако излезеш сега, прогресът ти ще бъде загубен.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBackConfirm(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg font-mono text-sm hover:bg-slate-600"
                >
                  Остани
                </button>
                <button
                  onClick={() => {
                    setShowBackConfirm(false);
                    router.push('/quiz');
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-mono text-sm hover:bg-red-500"
                >
                  Напусни
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Anki Preview Modal */}
        {showAnkiPreview && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-cyan-500/30 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-cyan-400 font-mono flex items-center gap-2">
                  <Download size={20} /> Anki Preview - {ankiCards.length} карти
                </h3>
                <button
                  onClick={() => setShowAnkiPreview(false)}
                  className="text-slate-400 hover:text-slate-200 text-xl"
                >
                  &times;
                </button>
              </div>

              <p className="text-sm text-slate-400 font-mono mb-4">
                Прегледай и редактирай картите преди експорт. Кликни върху карта за редакция.
              </p>

              <div className="space-y-3 mb-6">
                {ankiCards.map((card, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      editingCardIndex === index
                        ? 'border-cyan-500 bg-slate-700/50'
                        : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                    }`}
                    onClick={() => setEditingCardIndex(editingCardIndex === index ? null : index)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-cyan-400 font-mono text-sm font-bold">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        {editingCardIndex === index ? (
                          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                            <div>
                              <label className="text-xs text-slate-400 font-mono">Front (Въпрос):</label>
                              <textarea
                                value={card.front}
                                onChange={(e) => updateAnkiCard(index, 'front', e.target.value)}
                                className="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 font-mono"
                                rows={2}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 font-mono">Back (Отговор):</label>
                              <textarea
                                value={card.back}
                                onChange={(e) => updateAnkiCard(index, 'back', e.target.value)}
                                className="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 font-mono"
                                rows={4}
                              />
                            </div>
                            <div className="flex gap-3">
                              <div className="flex-1">
                                <label className="text-xs text-slate-400 font-mono">Tag:</label>
                                <input
                                  value={card.tag}
                                  onChange={(e) => updateAnkiCard(index, 'tag', e.target.value)}
                                  className="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 font-mono"
                                />
                              </div>
                              <button
                                onClick={() => deleteAnkiCard(index)}
                                className="self-end px-3 py-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 text-sm font-mono"
                              >
                                Изтрий
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-200 font-mono text-sm line-clamp-2">{card.front}</p>
                            <p className="text-slate-400 font-mono text-xs mt-1 line-clamp-2">{card.back}</p>
                            <span className="inline-block mt-2 px-2 py-0.5 bg-slate-700 text-cyan-400 text-xs rounded font-mono">{card.tag}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowAnkiPreview(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg font-mono text-sm hover:bg-slate-600"
                >
                  Отказ
                </button>
                <button
                  onClick={exportAnkiCards}
                  className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-mono text-sm hover:from-cyan-700 hover:to-blue-700 flex items-center gap-2"
                >
                  <Download size={16} /> Експорт ({ankiCards.length} карти)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Question count warning banner */}
        {countWarning && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-200 font-mono">{countWarning}</p>
            </div>
            <button
              onClick={() => setCountWarning(null)}
              className="text-amber-400/60 hover:text-amber-400 text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowBackConfirm(true)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="Назад (ще поиска потвърждение)"
          >
            <ArrowLeft size={20} />
          </button>
          {/* Early stop button */}
          <button
            onClick={() => setShowEarlyStopConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all font-mono text-sm"
            title="Прекрати теста преждевременно"
          >
            <StopCircle size={16} />
            <span className="hidden sm:inline">Прекрати</span>
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-sm text-slate-400 font-mono mb-1">
              <span>Въпрос {quizState.currentIndex + 1} / {quizState.questions.length}</span>
              <div className="flex items-center gap-4">
                {currentQuestion.bloomLevel && (
                  <span className="text-purple-400 flex items-center gap-1">
                    Ниво: {BLOOM_LEVELS.find(b => b.level === currentQuestion.bloomLevel)?.name || 'Запомняне'}
                    <span className="text-lg">{currentQuestion.bloomLevel >= 5 ? '🧠' : currentQuestion.bloomLevel >= 3 ? '💡' : '📖'}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-blue-400">
                  <Clock size={14} />
                  {formatTime(elapsedTime)}
                </span>
              </div>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${((quizState.currentIndex + 1) / quizState.questions.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl mx-auto">
          <div className="mb-6">
            <span className={`px-3 py-1 rounded-full text-xs font-mono ${
              currentQuestion.type === 'case_study' ? 'bg-amber-500/20 text-amber-400' :
              currentQuestion.type === 'multiple_choice' ? 'bg-blue-500/20 text-blue-400' :
              'bg-purple-500/20 text-purple-400'
            }`}>
              {currentQuestion.type === 'case_study' ? 'Казус' :
               currentQuestion.type === 'multiple_choice' ? 'Избор' : 'Отворен'}
            </span>
          </div>

          <h2 className="text-xl md:text-2xl text-slate-100 mb-6 font-mono leading-relaxed tracking-wide">
            {currentQuestion.question}
          </h2>

          {(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study') ? (
            <div className="space-y-3">
              {currentQuestion.options?.map((option, i) => (
                <button
                  key={i}
                  onClick={() => !showExplanation && setSelectedAnswer(option)}
                  disabled={showExplanation}
                  className={`w-full p-4 rounded-lg border text-left font-mono transition-all ${
                    showExplanation
                      ? option === currentQuestion.correctAnswer
                        ? 'bg-green-500/20 border-green-500 text-green-300'
                        : option === selectedAnswer
                          ? 'bg-red-500/20 border-red-500 text-red-300'
                          : 'bg-slate-800/30 border-slate-700 text-slate-500'
                      : selectedAnswer === option
                        ? 'bg-purple-500/20 border-purple-500 text-purple-200'
                        : 'bg-slate-800/50 border-slate-600 text-slate-100 hover:border-slate-500 hover:bg-slate-700/50'
                  }`}
                >
                  <span className={`mr-3 inline-flex items-center justify-center w-6 h-6 rounded text-xs ${
                    showExplanation
                      ? option === currentQuestion.correctAnswer
                        ? 'bg-green-500/30 text-green-300'
                        : option === selectedAnswer
                          ? 'bg-red-500/30 text-red-300'
                          : 'bg-slate-700 text-slate-500'
                      : selectedAnswer === option
                        ? 'bg-purple-500/30 text-purple-200'
                        : 'bg-slate-700 text-slate-400'
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {option}
                </button>
              ))}
              {!showExplanation && (
                <p className="text-xs text-slate-500 font-mono mt-2">
                  ⌨️ Натисни A-D или 1-4 за избор, Enter за проверка
                </p>
              )}
            </div>
          ) : (
            <div>
              {/* Dynamic textarea size based on Bloom level */}
              <textarea
                value={openAnswer}
                onChange={(e) => setOpenAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.ctrlKey && e.key === 'Enter' && !showExplanation && openAnswer.trim()) {
                    handleAnswer();
                  }
                }}
                disabled={showExplanation}
                placeholder={
                  (currentQuestion.bloomLevel || 1) >= 5
                    ? "Напиши подробен отговор (5-8 изречения)... Включи анализ, обосновка и заключение. (Ctrl+Enter за проверка)"
                    : "Напиши отговора тук... (Ctrl+Enter за проверка)"
                }
                className={`w-full px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 text-base font-mono resize-y focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all placeholder:text-slate-500 ${
                  (currentQuestion.bloomLevel || 1) >= 5 ? 'min-h-[280px]' :
                  (currentQuestion.bloomLevel || 1) >= 3 ? 'min-h-[200px]' : 'min-h-[160px]'
                }`}
              />
              <p className="text-xs text-slate-500 font-mono mt-2">
                {(currentQuestion.bloomLevel || 1) >= 5
                  ? '🧠 Higher-Order: Препоръчително 5-8 изречения с анализ и обосновка'
                  : (currentQuestion.bloomLevel || 1) >= 3
                    ? '💡 Препоръчително: 3-5 изречения за пълен отговор'
                    : '📝 Препоръчително: 2-3 изречения'}
              </p>

              {/* Hint button and display for open questions */}
              {!showExplanation && (
                <div className="mt-3">
                  {openHint ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-xs text-amber-400 font-mono font-semibold mb-2">Подсказка:</p>
                      <p className="text-sm text-amber-200 font-mono">{openHint}</p>
                    </div>
                  ) : (
                    <button
                      onClick={requestOpenHint}
                      disabled={openHintLoading}
                      className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-sm font-mono rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {openHintLoading ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Зареждане...
                        </>
                      ) : (
                        <>
                          <Lightbulb size={14} />
                          Подсказка
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {showExplanation && (
            <div className="mt-6 space-y-4">
              {/* AI Evaluation for open questions */}
              {currentQuestion.type === 'open' && openEval && (
                <div className={`p-4 rounded-lg border ${
                  openEval.score >= 0.7 ? 'bg-green-500/10 border-green-500/30' :
                  openEval.score >= 0.4 ? 'bg-yellow-500/10 border-yellow-500/30' :
                  'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {openEval.score >= 0.7 ? <CheckCircle size={18} className="text-green-400" /> :
                       openEval.score >= 0.4 ? <AlertCircle size={18} className="text-yellow-400" /> :
                       <XCircle size={18} className="text-red-400" />}
                      <span className={`font-mono font-semibold ${
                        openEval.score >= 0.7 ? 'text-green-400' :
                        openEval.score >= 0.4 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {openEval.score >= 0.7 ? 'Правилно!' :
                         openEval.score >= 0.4 ? 'Частично' :
                         'Неправилно'}
                      </span>
                    </div>
                    <span className={`text-lg font-bold font-mono ${
                      openEval.score >= 0.7 ? 'text-green-400' :
                      openEval.score >= 0.4 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {Math.round(openEval.score * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 font-mono mb-3">{openEval.feedback}</p>
                  {openEval.keyPointsMissed && openEval.keyPointsMissed.length > 0 && (
                    <div className="mt-2 p-2 bg-red-500/10 rounded">
                      <p className="text-xs text-red-400 font-mono font-semibold mb-1">Пропуснато:</p>
                      <ul className="text-xs text-red-300 font-mono list-disc list-inside">
                        {openEval.keyPointsMissed.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {openEval.keyPointsCovered && openEval.keyPointsCovered.length > 0 && (
                    <div className="mt-2 p-2 bg-green-500/10 rounded">
                      <p className="text-xs text-green-400 font-mono font-semibold mb-1">Покрито:</p>
                      <ul className="text-xs text-green-300 font-mono list-disc list-inside">
                        {openEval.keyPointsCovered.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Standard result for MCQ */}
              {(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study') && (
                <div className={`p-4 rounded-lg border ${
                  isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-orange-500/10 border-orange-500/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {isCorrect ? <CheckCircle size={18} className="text-green-400" /> : <XCircle size={18} className="text-orange-400" />}
                    <span className={`font-mono font-semibold ${isCorrect ? 'text-green-400' : 'text-orange-400'}`}>
                      {isCorrect ? 'Правилно!' : 'Грешно'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 font-mono">{currentQuestion.explanation}</p>
                </div>
              )}

              {/* Model answer for open questions */}
              {currentQuestion.type === 'open' && (
                <div className="p-4 rounded-lg border bg-slate-800/50 border-slate-600">
                  <p className="text-xs text-slate-500 font-mono mb-2 uppercase">Примерен отговор:</p>
                  <p className="text-sm text-slate-300 font-mono">{currentQuestion.correctAnswer}</p>
                  {currentQuestion.explanation && (
                    <p className="text-sm text-slate-400 font-mono mt-3 pt-3 border-t border-slate-700">
                      {currentQuestion.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            {!showExplanation ? (
              <button
                onClick={handleAnswer}
                disabled={
                  isEvaluatingOpen ||
                  ((currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study') ? !selectedAnswer : !openAnswer.trim())
                }
                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg font-mono disabled:opacity-50 flex items-center gap-2"
              >
                {isEvaluatingOpen ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    AI оценява...
                  </>
                ) : (
                  'Провери'
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg font-mono"
              >
                {quizState.currentIndex < quizState.questions.length - 1 ? (
                  <>Следващ <ChevronRight size={20} /></>
                ) : 'Резултат'}
              </button>
            )}
          </div>
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
    const getModeLabel = () => {
      switch (mode) {
        case 'assessment': return 'Assess My Level';
        case 'lower_order': return 'Lower-Order (Remember/Understand)';
        case 'mid_order': return 'Mid-Order (Apply/Analyze)';
        case 'higher_order': return 'Higher-Order (Evaluate/Create)';
        case 'gap_analysis': return 'Gap Analysis';
        case 'drill_weakness': return 'Drill Weakness';
        case 'custom': return `Custom (Bloom ${customBloomLevel})`;
        default: return 'Quiz';
      }
    };

    const getModeColor = () => {
      switch (mode) {
        case 'assessment': return 'amber';
        case 'lower_order': return 'cyan';
        case 'mid_order': return 'blue';
        case 'higher_order': return 'pink';
        case 'gap_analysis': return 'red';
        case 'drill_weakness': return 'orange';
        case 'custom': return 'purple';
        default: return 'slate';
      }
    };

    const color = getModeColor();

    return (
      <div className="min-h-screen p-6 space-y-6">
        <button
          onClick={() => setShowPreview(false)}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm"
        >
          <ArrowLeft size={16} /> Обратно към настройки
        </button>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-lg mx-auto">
          <div className="text-center mb-6">
            <Brain size={40} className={`mx-auto mb-3 text-${color}-400`} />
            <h2 className="text-xl font-bold text-slate-100 font-mono">Преглед на Quiz</h2>
            <p className="text-sm text-slate-400 font-mono mt-1">Провери и коригирай преди старт</p>
          </div>

          {/* Summary */}
          <div className="space-y-3 mb-6">
            {isMultiMode && multiTopics.length > 0 ? (
              <>
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <span className="text-purple-300 font-mono text-sm font-semibold">
                    🔀 Mix Quiz: {multiTopics.length} теми
                  </span>
                  <div className="mt-2 space-y-1">
                    {multiTopics.slice(0, 5).map(({ topic: t, subject: s }) => (
                      <div key={t.id} className="text-xs text-slate-400 font-mono flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        #{t.number} {t.name.length > 30 ? t.name.slice(0, 30) + '...' : t.name}
                      </div>
                    ))}
                    {multiTopics.length > 5 && (
                      <div className="text-xs text-slate-500 font-mono">
                        +{multiTopics.length - 5} още...
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400 font-mono text-sm">Режим</span>
                  <span className={`text-${color}-400 font-mono text-sm`}>{getModeLabel()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400 font-mono text-sm">Тема</span>
                  <span className="text-slate-200 font-mono text-sm truncate max-w-[200px]" title={topic?.name}>
                    {topic?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400 font-mono text-sm">Режим</span>
                  <span className={`text-${color}-400 font-mono text-sm`}>{getModeLabel()}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-slate-400 font-mono text-sm">Текущо Bloom ниво</span>
                  <span className="text-purple-400 font-mono text-sm">
                    {topic?.currentBloomLevel || 1} - {BLOOM_LEVELS.find(b => b.level === (topic?.currentBloomLevel || 1))?.name}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Question Count Adjuster */}
          <div className="mb-6">
            <label className="block text-xs text-slate-500 mb-3 font-mono uppercase tracking-wider text-center">
              Брой въпроси
            </label>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setPreviewQuestionCount(Math.max(3, previewQuestionCount - 5))}
                disabled={previewQuestionCount <= 3}
                className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xl hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                -5
              </button>
              <button
                onClick={() => setPreviewQuestionCount(Math.max(1, previewQuestionCount - 1))}
                disabled={previewQuestionCount <= 1}
                className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 font-mono hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                -1
              </button>
              <div className="w-20 text-center">
                <span className="text-4xl font-bold text-white font-mono">{previewQuestionCount}</span>
              </div>
              <button
                onClick={() => setPreviewQuestionCount(Math.min(50, previewQuestionCount + 1))}
                disabled={previewQuestionCount >= 50}
                className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 font-mono hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                +1
              </button>
              <button
                onClick={() => setPreviewQuestionCount(Math.min(50, previewQuestionCount + 5))}
                disabled={previewQuestionCount >= 50}
                className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xl hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                +5
              </button>
            </div>
            <p className="text-xs text-slate-500 font-mono text-center mt-2">
              мин: 3 | макс: 50
            </p>
          </div>

          {/* Quick presets */}
          <div className="flex justify-center gap-2 mb-6">
            {[5, 10, 15, 20, 30].map(n => (
              <button
                key={n}
                onClick={() => setPreviewQuestionCount(n)}
                className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all ${
                  previewQuestionCount === n
                    ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Model Selector */}
          <div className="mb-6">
            <label className="block text-xs text-slate-500 mb-3 font-mono uppercase tracking-wider text-center">
              AI Модел (цена/качество)
            </label>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setSelectedModel('haiku')}
                className={`flex-1 max-w-[140px] px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                  selectedModel === 'haiku'
                    ? 'bg-green-500/20 border-2 border-green-500 text-green-300'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="font-semibold">Haiku</div>
                <div className="text-[10px] opacity-70">~$0.01/quiz</div>
                <div className="text-[10px] opacity-50">бърз, базов</div>
              </button>
              <button
                onClick={() => setSelectedModel('sonnet')}
                className={`flex-1 max-w-[140px] px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                  selectedModel === 'sonnet'
                    ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="font-semibold">Sonnet</div>
                <div className="text-[10px] opacity-70">~$0.06/quiz</div>
                <div className="text-[10px] opacity-50">баланс</div>
              </button>
              <button
                onClick={() => setSelectedModel('opus')}
                className={`flex-1 max-w-[140px] px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                  selectedModel === 'opus'
                    ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-300'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="font-semibold">Opus</div>
                <div className="text-[10px] opacity-70">~$0.30/quiz</div>
                <div className="text-[10px] opacity-50">най-добър</div>
              </button>
            </div>
          </div>

          {quizState.error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
                <AlertCircle size={16} /> {quizState.error}
              </div>
              <button
                onClick={generateQuiz}
                className="mt-2 px-4 py-1.5 bg-amber-600/20 border border-amber-600/40 text-amber-300 rounded-lg font-mono text-xs hover:bg-amber-600/30 transition-colors"
              >
                <RefreshCw size={12} className="inline mr-1.5" /> Опитай отново
              </button>
            </div>
          )}

          {/* Generating state - full feedback */}
          {quizState.isGenerating ? (
            <div className="space-y-3">
              <div className="w-full py-4 bg-slate-700/50 border border-slate-600/50 rounded-lg font-mono text-center">
                <div className="flex items-center justify-center gap-2 text-slate-200 mb-2">
                  <RefreshCw size={20} className="animate-spin text-amber-400" />
                  <span className="font-semibold">Генериране... ({elapsedSeconds}s)</span>
                </div>
                <p className="text-xs text-slate-400">Обикновено 30-120 секунди. По-дълги теми отнемат повече.</p>
                {/* Progress bar animation */}
                <div className="mt-3 mx-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full animate-pulse" style={{ width: `${Math.min(95, (elapsedSeconds / 120) * 100)}%`, transition: 'width 1s linear' }} />
                </div>
              </div>
              <button
                onClick={cancelGeneration}
                className="w-full py-2 bg-slate-800/60 border border-slate-600/50 text-slate-400 hover:text-red-400 hover:border-red-600/40 rounded-lg font-mono text-sm flex items-center justify-center gap-2 transition-all"
              >
                <StopCircle size={16} /> Отмени
              </button>
            </div>
          ) : (
            /* Start Button */
            <button
              onClick={generateQuiz}
              disabled={!mode}
              className={`w-full py-4 font-semibold rounded-lg font-mono flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === 'gap_analysis'
                  ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-500 hover:to-orange-500'
                  : mode === 'drill_weakness'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-500 hover:to-amber-500'
                    : mode === 'mid_order'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500'
                      : mode === 'higher_order'
                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white hover:from-pink-500 hover:to-purple-500'
                        : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500'
              }`}
            >
              {!mode ? (
                <>Избери режим първо</>
              ) : mode === 'drill_weakness' ? (
                <><Repeat size={20} /> Drill Weakness ({previewQuestionCount} въпроса)</>
              ) : (
                <><Play size={20} /> Старт Quiz ({previewQuestionCount} въпроса)</>
              )}
            </button>
          )}
        </div>
      </div>
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

        {/* Mode Selection - 5 main modes */}
        <div className="mb-6">
          <label className="block text-xs text-slate-500 mb-3 font-mono uppercase tracking-wider">Избери режим</label>

          <div className="grid grid-cols-2 gap-3">
            {/* Assess My Level */}
            <button
              onClick={() => { setMode('assessment'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'assessment' ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <TrendingUp size={20} className={mode === 'assessment' ? 'text-amber-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'assessment' ? 'text-amber-400' : 'text-slate-300'}`}>
                Assess My Level
              </span>
              <span className="text-xs text-slate-500 font-mono">Всички Bloom нива</span>
            </button>

            {/* Free Recall - only for single topic */}
            {!isMultiMode && (
              <button
                onClick={() => { setMode('free_recall'); setShowCustomOptions(false); }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  mode === 'free_recall' ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <FileText size={20} className={mode === 'free_recall' ? 'text-emerald-400' : 'text-slate-400'} />
                <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'free_recall' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  Free Recall
                </span>
                <span className="text-xs text-slate-500 font-mono">Пиши → AI оценява</span>
              </button>
            )}

            {/* Lower-Order */}
            <button
              onClick={() => { setMode('lower_order'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'lower_order' ? 'bg-cyan-500/20 border-cyan-500 ring-2 ring-cyan-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Lightbulb size={20} className={mode === 'lower_order' ? 'text-cyan-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'lower_order' ? 'text-cyan-400' : 'text-slate-300'}`}>
                Lower-Order
              </span>
              <span className="text-xs text-slate-500 font-mono">Bloom 1-2: Remember, Understand</span>
            </button>

            {/* Mid-Order */}
            <button
              onClick={() => { setMode('mid_order'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'mid_order' ? 'bg-blue-500/20 border-blue-500 ring-2 ring-blue-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Zap size={20} className={mode === 'mid_order' ? 'text-blue-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'mid_order' ? 'text-blue-400' : 'text-slate-300'}`}>
                Mid-Order
              </span>
              <span className="text-xs text-slate-500 font-mono">Bloom 3-4: Apply, Analyze</span>
            </button>

            {/* Higher-Order */}
            <button
              onClick={() => { setMode('higher_order'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'higher_order' ? 'bg-pink-500/20 border-pink-500 ring-2 ring-pink-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Brain size={20} className={mode === 'higher_order' ? 'text-pink-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'higher_order' ? 'text-pink-400' : 'text-slate-300'}`}>
                Higher-Order
              </span>
              <span className="text-xs text-slate-500 font-mono">Bloom 5-6: Evaluate, Create</span>
            </button>

            {/* Gap Analysis */}
            <button
              onClick={() => { setMode('gap_analysis'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'gap_analysis' ? 'bg-red-500/20 border-red-500 ring-2 ring-red-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Target size={20} className={mode === 'gap_analysis' ? 'text-red-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'gap_analysis' ? 'text-red-400' : 'text-slate-300'}`}>
                Gap Analysis
              </span>
              <span className="text-xs text-slate-500 font-mono">Открий слаби места</span>
            </button>

            {/* Drill Weakness - only show if there are wrong answers */}
            {!isMultiMode && topic?.wrongAnswers && topic.wrongAnswers.length > 0 && (
              <button
                onClick={() => { setMode('drill_weakness'); setShowCustomOptions(false); }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  mode === 'drill_weakness' ? 'bg-orange-500/20 border-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <Repeat size={20} className={mode === 'drill_weakness' ? 'text-orange-400' : 'text-slate-400'} />
                <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'drill_weakness' ? 'text-orange-400' : 'text-slate-300'}`}>
                  Drill Weakness
                </span>
                <span className="text-xs text-slate-500 font-mono">{topic.wrongAnswers.length} грешки за преговор</span>
              </button>
            )}
          </div>

          {/* Quiz Length Dropdown - only show for standard quiz modes */}
          {mode && mode !== 'free_recall' && mode !== 'custom' && mode !== 'drill_weakness' && (
            <div className="mt-4">
              <label className="block text-xs text-slate-500 mb-2 font-mono uppercase tracking-wider">
                Дължина на теста
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(QUIZ_LENGTH_PRESETS) as QuizLengthPreset[]).map(preset => {
                  const config = QUIZ_LENGTH_PRESETS[preset];
                  const isSelected = quizLength === preset;
                  return (
                    <button
                      key={preset}
                      onClick={() => setQuizLength(preset)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500 ring-1 ring-purple-500/30'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <span className={`block font-mono text-sm font-medium ${
                        isSelected ? 'text-purple-300' : 'text-slate-300'
                      }`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {config.description}
                      </span>
                      <span className={`block text-xs mt-1 font-mono ${
                        config.weight >= 1.5 ? 'text-green-400' :
                        config.weight <= 0.5 ? 'text-amber-400' : 'text-slate-500'
                      }`}>
                        {config.weight}x тежест
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Match Exam Format Checkbox */}
          {subject?.examFormat && (
            <label className="flex items-center gap-3 mt-4 p-3 bg-slate-800/30 rounded-lg cursor-pointer hover:bg-slate-800/50 transition-colors">
              <input
                type="checkbox"
                checked={matchExamFormat}
                onChange={(e) => setMatchExamFormat(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
              />
              <div>
                <span className="text-sm text-slate-300 font-mono">Match Exam Format</span>
                <p className="text-xs text-slate-500 font-mono">{subject?.examFormat}</p>
              </div>
            </label>
          )}

          {/* Custom Override */}
          <button
            onClick={() => { setShowCustomOptions(!showCustomOptions); if (!showCustomOptions) setMode('custom'); }}
            className="mt-3 text-xs text-slate-500 hover:text-slate-400 font-mono"
          >
            {showCustomOptions ? '▼ Скрий custom' : '▶ Custom (override)'}
          </button>

          {showCustomOptions && (
            <div className="mt-4 p-4 bg-slate-800/30 rounded-lg space-y-4 border border-slate-700">
              <div>
                <label className="block text-xs text-slate-400 mb-2 font-mono">Брой въпроси (само тук се задава ръчно)</label>
                <div className="flex gap-2">
                  {[3, 5, 10, 15, 20, 30].map(n => (
                    <button
                      key={n}
                      onClick={() => setCustomQuestionCount(n)}
                      className={`px-3 py-1.5 rounded-lg border font-mono text-sm ${
                        customQuestionCount === n ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2 font-mono">Bloom ниво</label>
                <div className="grid grid-cols-6 gap-1">
                  {BLOOM_LEVELS.map(b => (
                    <button
                      key={b.level}
                      onClick={() => setCustomBloomLevel(b.level)}
                      className={`p-2 rounded border text-center font-mono text-xs ${
                        customBloomLevel === b.level ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'
                      }`}
                      title={b.name}
                    >
                      {b.level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Start Button */}
        <button
          onClick={mode === 'free_recall' ? () => {} : openPreview}
          disabled={
            quizState.isGenerating ||
            !mode ||
            (isMultiMode ? multiTopics.length === 0 : (!topic?.material && mode !== 'free_recall'))
          }
          className={`w-full py-4 font-semibold rounded-lg font-mono disabled:opacity-50 flex items-center justify-center gap-2 ${
            mode === 'free_recall'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white'
              : mode === 'gap_analysis'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white'
                : mode === 'mid_order'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                  : mode === 'higher_order'
                    ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white'
          }`}
        >
          {mode === 'free_recall' ? (
            <><FileText size={20} /> Започни Free Recall</>
          ) : (
            <><Settings size={20} /> Преглед и редакция</>
          )}
        </button>
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
