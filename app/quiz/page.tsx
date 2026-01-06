'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Brain, Play, ChevronRight, CheckCircle, XCircle, RefreshCw, ArrowLeft, Settings, AlertCircle, TrendingUp, Sparkles, Lightbulb, Target, FileText, Zap } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import { BLOOM_LEVELS, BloomLevel } from '@/lib/types';

type QuizMode = 'assessment' | 'free_recall' | 'gap_analysis' | 'mid_order' | 'higher_order' | 'custom';

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

  const { data, addGrade, incrementApiCalls, updateTopic } = useApp();

  // Quiz settings
  const [mode, setMode] = useState<QuizMode | null>(null); // null = no selection yet
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

  // Free recall state
  const [freeRecallText, setFreeRecallText] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [freeRecallEvaluation, setFreeRecallEvaluation] = useState<FreeRecallEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

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

  const generateQuiz = async () => {
    if (!topic?.material && mode !== 'free_recall') {
      setQuizState(prev => ({ ...prev, error: 'Няма добавен материал към тази тема.' }));
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setQuizState(prev => ({ ...prev, error: 'API_KEY_MISSING' }));
      return;
    }

    setQuizState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          material: topic?.material,
          topicName: topic?.name,
          subjectName: subject?.name || '',
          subjectType: subject?.subjectType || 'preclinical',
          examFormat: subject?.examFormat,
          matchExamFormat,
          mode,
          questionCount: mode === 'custom' ? customQuestionCount : null,
          bloomLevel: mode === 'custom' ? customBloomLevel : null,
          currentBloomLevel: topic?.currentBloomLevel || 1,
          quizHistory: topic?.quizHistory
        })
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

      setQuizState({
        questions: result.questions,
        currentIndex: 0,
        answers: new Array(result.questions.length).fill(null),
        showResult: false,
        isGenerating: false,
        error: null
      });
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
    } else {
      setQuizState(prev => ({
        ...prev,
        answers: newAnswers,
        showResult: true
      }));
    }
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

    const quizResult = {
      date: new Date().toISOString(),
      bloomLevel: newBloomLevel,
      score: Math.round(percentage),
      questionsCount: quizState.questions.length,
      correctAnswers: Math.round(score)
    };

    updateTopic(subjectId, topicId, {
      currentBloomLevel: newBloomLevel,
      quizHistory: [...(topic.quizHistory || []), quizResult]
    });
  };

  const handleSaveFreeRecallGrade = () => {
    if (!subjectId || !topicId || !topic || !freeRecallEvaluation) return;

    addGrade(subjectId, topicId, freeRecallEvaluation.grade);

    const quizResult = {
      date: new Date().toISOString(),
      bloomLevel: freeRecallEvaluation.bloomLevel as BloomLevel,
      score: freeRecallEvaluation.score,
      questionsCount: 1,
      correctAnswers: freeRecallEvaluation.score >= 50 ? 1 : 0
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
  };

  // No topic selected
  if (!subject || !topic) {
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
                      <div className="flex items-center gap-2">
                        <span>{STATUS_CONFIG[t.status].emoji}</span>
                        <span className="text-slate-200 font-mono text-sm">
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
          <p className="text-slate-400 font-mono mb-6">{percentage}% правилни</p>

          <div className={`inline-block px-8 py-4 rounded-xl border-2 font-mono text-4xl font-bold mb-6 ${
            grade >= 5 ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            grade >= 4 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
            'bg-orange-500/10 border-orange-500/30 text-orange-400'
          }`}>
            {grade.toFixed(2)}
          </div>

          <div className="flex gap-4 justify-center">
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
        <div className="flex items-center gap-4">
          <Link href="/quiz" className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <div className="flex justify-between text-sm text-slate-400 font-mono mb-1">
              <span>Въпрос {quizState.currentIndex + 1} / {quizState.questions.length}</span>
              {currentQuestion.bloomLevel && (
                <span className="text-purple-400">Bloom {currentQuestion.bloomLevel}</span>
              )}
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all"
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

          <h2 className="text-xl text-slate-100 mb-6 font-mono leading-relaxed">
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
                        ? 'bg-green-500/20 border-green-500 text-green-400'
                        : option === selectedAnswer
                          ? 'bg-red-500/20 border-red-500 text-red-400'
                          : 'bg-slate-800/30 border-slate-700 text-slate-400'
                      : selectedAnswer === option
                        ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                        : 'bg-slate-800/30 border-slate-700 text-slate-200 hover:border-slate-600'
                  }`}
                >
                  <span className="mr-3 opacity-50">{String.fromCharCode(65 + i)}.</span>
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              disabled={showExplanation}
              placeholder="Отговор..."
              className="w-full h-32 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono resize-none"
            />
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
              <h2 className="text-lg font-semibold text-slate-100 font-mono">Free Recall: {topic.name}</h2>
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

  // Setup Screen
  return (
    <div className="min-h-screen p-6 space-y-6">
      <Link href="/quiz" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm">
        <ArrowLeft size={16} /> Назад
      </Link>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Brain size={24} className="text-pink-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100 font-mono">{topic.name}</h2>
            <p className="text-sm font-mono" style={{ color: subject.color }}>{subject.name}</p>
          </div>
        </div>

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

        {/* AI Recommendation Banner */}
        {aiRecommendation && (
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

            {/* Free Recall */}
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

            {/* Gap Analysis - full width */}
            <button
              onClick={() => { setMode('gap_analysis'); setShowCustomOptions(false); }}
              className={`col-span-2 p-4 rounded-xl border text-left transition-all ${
                mode === 'gap_analysis' ? 'bg-red-500/20 border-red-500 ring-2 ring-red-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Target size={20} className={mode === 'gap_analysis' ? 'text-red-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'gap_analysis' ? 'text-red-400' : 'text-slate-300'}`}>
                Gap Analysis
              </span>
              <span className="text-xs text-slate-500 font-mono">Открий слаби места на базата на quiz history</span>
            </button>
          </div>

          {/* Match Exam Format Checkbox */}
          {subject.examFormat && (
            <label className="flex items-center gap-3 mt-4 p-3 bg-slate-800/30 rounded-lg cursor-pointer hover:bg-slate-800/50 transition-colors">
              <input
                type="checkbox"
                checked={matchExamFormat}
                onChange={(e) => setMatchExamFormat(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
              />
              <div>
                <span className="text-sm text-slate-300 font-mono">Match Exam Format</span>
                <p className="text-xs text-slate-500 font-mono">{subject.examFormat}</p>
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
          onClick={mode === 'free_recall' ? () => {} : generateQuiz}
          disabled={quizState.isGenerating || (!topic.material && mode !== 'free_recall') || !mode}
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
          {quizState.isGenerating ? (
            <><RefreshCw size={20} className="animate-spin" /> AI генерира въпроси...</>
          ) : mode === 'free_recall' ? (
            <><FileText size={20} /> Започни Free Recall</>
          ) : (
            <><Play size={20} /> Генерирай Quiz</>
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
