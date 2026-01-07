'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Brain, Play, ChevronRight, CheckCircle, XCircle, RefreshCw, ArrowLeft, Settings, AlertCircle, TrendingUp, Sparkles, Lightbulb, Target, FileText, Zap, Clock, StopCircle, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import { BLOOM_LEVELS, BloomLevel, QuizLengthPreset, QUIZ_LENGTH_PRESETS, WrongAnswer } from '@/lib/types';

type QuizMode = 'assessment' | 'free_recall' | 'gap_analysis' | 'mid_order' | 'higher_order' | 'custom' | 'drill_weakness';

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
  const subjectId = searchParams.get('subject');
  const topicId = searchParams.get('topic');
  const isMultiMode = searchParams.get('multi') === 'true';
  const topicsParam = searchParams.get('topics');

  const { data, addGrade, incrementApiCalls, updateTopic, trackTopicRead } = useApp();

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

  // Timer state
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Per-question time tracking
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]); // Seconds per question

  // Early termination state
  const [showEarlyStopConfirm, setShowEarlyStopConfirm] = useState(false);

  // Question count warning
  const [countWarning, setCountWarning] = useState<string | null>(null);

  const MAX_HINTS = 3;

  const subject = data.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);

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

  // Auto-select recommended mode on mount
  useEffect(() => {
    if (aiRecommendation && mode === null) {
      setMode(aiRecommendation.suggestedMode);
    }
  }, [aiRecommendation, mode]);

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
            index = parseInt(e.key) - 1;
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
          topicsList: topicNames
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
          wrongAnswers: (mode === 'drill_weakness' || mode === 'gap_analysis') ? topic?.wrongAnswers : undefined
        };
      }

      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (!response.ok) {
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
    } catch {
      setQuizState(prev => ({
        ...prev,
        isGenerating: false,
        error: 'Грешка при генериране.'
      }));
    }
  };

  const requestHint = async () => {
    if (hintsUsed >= MAX_HINTS || !topic?.material) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setHintLoading(true);
    try {
      const response = await fetch('/api/quiz', {
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
        })
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

  const evaluateFreeRecall = async () => {
    if (!freeRecallText.trim() || !topic?.material) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setIsEvaluating(true);
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'free_recall',
          material: topic.material,
          topicName: topic.name,
          subjectName: subject?.name,
          userRecall: freeRecallText
        })
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

  const handleAnswer = () => {
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
        correct += 0.5;
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

  const handleSaveGrade = () => {
    if (!subjectId || !topicId || !topic) return;
    const score = calculateScore();
    const grade = getGradeFromScore(score, quizState.questions.length);
    const percentage = (score / quizState.questions.length) * 100;

    addGrade(subjectId, topicId, grade);
    trackTopicRead(subjectId, topicId); // Track as read when quiz is completed

    // Collect wrong answers AND track correctly answered concepts
    const newWrongAnswers: WrongAnswer[] = [];
    const masteredConcepts: Set<string> = new Set(); // Concepts answered correctly this quiz

    quizState.questions.forEach((q, i) => {
      const userAnswer = quizState.answers[i];
      const concept = q.concept || 'General';
      const isCorrect = (q.type === 'multiple_choice' || q.type === 'case_study')
        ? userAnswer === q.correctAnswer
        : false; // Open questions are considered for review

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
    });

    // Handle wrong answers based on mode
    let mergedWrongAnswers: WrongAnswer[];
    const existingWrongAnswers = topic.wrongAnswers || [];

    if (mode === 'drill_weakness') {
      // For drill_weakness mode: increment drillCount on all existing wrong answers
      // (they were all used to generate the drill questions)
      mergedWrongAnswers = existingWrongAnswers.map(wa => ({
        ...wa,
        drillCount: wa.drillCount + 1
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
    // This cleans up old weaknesses that the student has now overcome
    mergedWrongAnswers = mergedWrongAnswers.filter(wa => {
      const isMastered = wa.drillCount >= 3 && masteredConcepts.has(wa.concept);
      return !isMastered;
    });

    // Determine new Bloom level
    let newBloomLevel: BloomLevel = topic.currentBloomLevel || 1;
    if (mode === 'assessment') {
      // Assessment: find highest level with >= 70%
      const levelScores: Record<number, { correct: number; total: number }> = {};
      quizState.questions.forEach((q, i) => {
        const level = q.bloomLevel || 1;
        if (!levelScores[level]) levelScores[level] = { correct: 0, total: 0 };
        levelScores[level].total++;
        if ((q.type === 'multiple_choice' || q.type === 'case_study') && quizState.answers[i] === q.correctAnswer) {
          levelScores[level].correct++;
        } else if (q.type === 'open' && quizState.answers[i]) {
          levelScores[level].correct += 0.5;
        }
      });

      newBloomLevel = 1;
      for (let level = 1; level <= 6; level++) {
        const ls = levelScores[level];
        if (ls && ls.total > 0 && (ls.correct / ls.total) >= 0.7) {
          newBloomLevel = level as BloomLevel;
        } else break;
      }
    } else if (percentage >= 75 && newBloomLevel < 6) {
      newBloomLevel = Math.min(6, newBloomLevel + 1) as BloomLevel;
    }

    // Get weight from preset (custom mode uses standard weight)
    const weight = mode === 'custom' ? 1.0 : QUIZ_LENGTH_PRESETS[quizLength].weight;

    const quizResult = {
      date: new Date().toISOString(),
      bloomLevel: newBloomLevel,
      score: Math.round(percentage),
      questionsCount: quizState.questions.length,
      correctAnswers: Math.round(score),
      weight
    };

    updateTopic(subjectId, topicId, {
      currentBloomLevel: newBloomLevel,
      quizHistory: [...(topic.quizHistory || []), quizResult],
      wrongAnswers: mergedWrongAnswers
    });
  };

  const handleSaveFreeRecallGrade = () => {
    if (!subjectId || !topicId || !topic || !freeRecallEvaluation) return;

    addGrade(subjectId, topicId, freeRecallEvaluation.grade);
    trackTopicRead(subjectId, topicId); // Track as read when free recall is completed

    // Free recall gets standard weight
    const quizResult = {
      date: new Date().toISOString(),
      bloomLevel: freeRecallEvaluation.bloomLevel as BloomLevel,
      score: freeRecallEvaluation.score,
      questionsCount: 1,
      correctAnswers: freeRecallEvaluation.score >= 50 ? 1 : 0,
      weight: 1.0
    };

    updateTopic(subjectId, topicId, {
      currentBloomLevel: freeRecallEvaluation.bloomLevel as BloomLevel,
      quizHistory: [...(topic.quizHistory || []), quizResult]
    });
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

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 font-mono">
            Избери тема за тест
          </h2>

          <div className="space-y-4">
            {data.subjects.map(subj => (
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
        <Link href="/quiz" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm">
          <ArrowLeft size={16} /> Назад
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
              onClick={resetQuiz}
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
    const grade = getGradeFromScore(score, quizState.questions.length);
    const percentage = Math.round((score / quizState.questions.length) * 100);

    return (
      <div className="min-h-screen p-6 space-y-6">
        <Link href="/quiz" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm">
          <ArrowLeft size={16} /> Назад
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
                return (
                  <div className="flex flex-wrap gap-4 justify-center text-xs text-slate-500 font-mono">
                    <span>⏱️ Средно: {avgTime}s/въпрос</span>
                    <span className="text-amber-400">🐢 Най-бавен: Q{slowestIndex + 1} ({maxTime}s)</span>
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

          {/* Wrong answers count */}
          {quizState.questions.length - Math.round(score) > 0 && (
            <p className="text-sm text-orange-400 font-mono mb-4">
              {quizState.questions.length - Math.round(score)} грешни въпроса
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={handleSaveGrade}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg font-mono"
            >
              <CheckCircle size={20} /> Запази
            </button>
            <button
              onClick={resetQuiz}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-slate-200 font-semibold rounded-lg font-mono"
            >
              <RefreshCw size={20} /> Нов тест
            </button>
            {/* Drill Weakness button - only show if there were wrong answers */}
            {quizState.questions.length - Math.round(score) > 0 && (
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
          </div>
        </div>
      </div>
    );
  }

  // Quiz in progress
  if (quizState.questions.length > 0) {
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const isCorrect = (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study')
      ? selectedAnswer === currentQuestion.correctAnswer
      : true;

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
          <Link href="/quiz" className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </Link>
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
            </div>
          )}

          {showExplanation && (
            <div className={`mt-6 p-4 rounded-lg border ${
              isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-orange-500/10 border-orange-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {isCorrect ? <CheckCircle size={18} className="text-green-400" /> : <XCircle size={18} className="text-orange-400" />}
                <span className={`font-mono font-semibold ${isCorrect ? 'text-green-400' : 'text-orange-400'}`}>
                  {isCorrect ? 'Правилно!' : 'Провери'}
                </span>
              </div>
              <p className="text-sm text-slate-300 font-mono">{currentQuestion.explanation}</p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            {!showExplanation ? (
              <button
                onClick={handleAnswer}
                disabled={(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study') ? !selectedAnswer : !openAnswer.trim()}
                className="px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg font-mono disabled:opacity-50"
              >
                Провери
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

          {quizState.error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
                <AlertCircle size={16} /> {quizState.error}
              </div>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={generateQuiz}
            disabled={quizState.isGenerating || !mode}
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
            {quizState.isGenerating ? (
              <><RefreshCw size={20} className="animate-spin" /> Генериране...</>
            ) : !mode ? (
              <>Избери режим първо</>
            ) : mode === 'drill_weakness' ? (
              <><Repeat size={20} /> Drill Weakness ({previewQuestionCount} въпроса)</>
            ) : (
              <><Play size={20} /> Старт Quiz ({previewQuestionCount} въпроса)</>
            )}
          </button>
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
