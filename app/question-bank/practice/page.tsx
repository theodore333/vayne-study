'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/context';
import { BankQuestion, ClinicalCase } from '@/lib/types';
import { ArrowLeft, ArrowRight, Check, X, RotateCcw, Trophy, Target, Clock, Timer, Shuffle, AlertTriangle, Calendar, FileText } from 'lucide-react';
import Link from 'next/link';

// Practice modes
type PracticeMode = 'all' | 'weak' | 'spaced' | 'custom';

const PRACTICE_MODES: { mode: PracticeMode; icon: React.ReactNode; title: string; description: string }[] = [
  { mode: 'all', icon: <Shuffle size={24} />, title: 'Всички въпроси', description: 'Случаен ред' },
  { mode: 'weak', icon: <AlertTriangle size={24} />, title: 'Слаби въпроси', description: 'accuracy < 50%' },
  { mode: 'spaced', icon: <Calendar size={24} />, title: 'Spaced Review', description: 'Стари първо' },
  { mode: 'custom', icon: <FileText size={24} />, title: 'Избор на брой', description: 'Колкото искаш' },
];

const QUESTION_COUNT_PRESETS = [10, 20, 30, 50];

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PracticeContent />
    </Suspense>
  );
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const { data, updateQuestionStats } = useApp();

  const subjectId = searchParams.get('subject');
  const bankId = searchParams.get('bank');

  // Get subject and questions
  const subject = data.subjects.find(s => s.id === subjectId);
  const banks = (data.questionBanks || []).filter(b =>
    bankId ? b.id === bankId : b.subjectId === subjectId
  );
  const allQuestions = useMemo(() =>
    banks.flatMap(b => b.questions.map(q => ({ ...q, bankId: b.id }))),
    [banks]
  );
  const allCases = banks.flatMap(b => b.cases);

  // Mode selection state
  const [mode, setMode] = useState<PracticeMode | null>(null);
  const [practiceStarted, setPracticeStarted] = useState(false);
  const [customQuestionCount, setCustomQuestionCount] = useState(20);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Calculate stats for mode selection
  const stats = useMemo(() => {
    const weakQuestions = allQuestions.filter(q =>
      q.stats.attempts > 0 && (q.stats.correct / q.stats.attempts) < 0.5
    );

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldQuestions = allQuestions.filter(q => {
      if (!q.stats.lastAttempt) return true;
      return new Date(q.stats.lastAttempt).getTime() < sevenDaysAgo;
    });

    return {
      total: allQuestions.length,
      weak: weakQuestions.length,
      old: oldQuestions.length
    };
  }, [allQuestions]);

  // Shuffle helper
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Get filtered questions based on mode
  const getFilteredQuestions = (selectedMode: PracticeMode) => {
    switch (selectedMode) {
      case 'weak':
        const weakQs = allQuestions.filter(q =>
          q.stats.attempts > 0 && (q.stats.correct / q.stats.attempts) < 0.5
        );
        return shuffleArray(weakQs.length > 0 ? weakQs : allQuestions);

      case 'spaced':
        return [...allQuestions].sort((a, b) => {
          const aTime = a.stats.lastAttempt ? new Date(a.stats.lastAttempt).getTime() : 0;
          const bTime = b.stats.lastAttempt ? new Date(b.stats.lastAttempt).getTime() : 0;
          return aTime - bTime; // Oldest first
        });

      case 'custom':
        return shuffleArray(allQuestions).slice(0, Math.min(customQuestionCount, allQuestions.length));

      default: // 'all'
        return shuffleArray(allQuestions);
    }
  };

  // Practice state
  const [shuffledQuestions, setShuffledQuestions] = useState<(BankQuestion & { bankId: string })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<{ correct: boolean; questionId: string }[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [openAnswer, setOpenAnswer] = useState('');

  // Timer state
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: Check if question has multiple correct answers
  const hasMultipleCorrect = (correctAnswer: string) => {
    return correctAnswer.includes(',') || correctAnswer.includes(' ');
  };

  // Helper: Parse correct answers into array of letters
  const parseCorrectAnswers = (correctAnswer: string): string[] => {
    return correctAnswer
      .toUpperCase()
      .split(/[,\s]+/)
      .map(a => a.trim().charAt(0))
      .filter(a => a.length > 0);
  };

  // Start practice with selected mode
  const startPractice = (selectedMode: PracticeMode) => {
    setMode(selectedMode);
    const filtered = getFilteredQuestions(selectedMode);
    setShuffledQuestions(filtered);
    setCurrentIndex(0);
    setSelectedAnswers(new Set());
    setShowResult(false);
    setAnswers([]);
    setSessionComplete(false);
    setOpenAnswer('');
    setStartTime(Date.now());
    setElapsedTime(0);
    setPracticeStarted(true);
  };

  // Timer tick
  useEffect(() => {
    if (!startTime || sessionComplete) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, sessionComplete]);

  const currentQuestion = shuffledQuestions[currentIndex];

  // Keyboard shortcuts
  useEffect(() => {
    if (!practiceStarted || shuffledQuestions.length === 0 || sessionComplete) return;

    const question = shuffledQuestions[currentIndex];
    if (!question || question.type === 'open') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      const options = question.options || [];
      const isMultiple = hasMultipleCorrect(question.correctAnswer);

      if (!showResult) {
        if (e.key.toUpperCase() >= 'A' && e.key.toUpperCase() <= 'E') {
          const letter = e.key.toUpperCase();
          const index = letter.charCodeAt(0) - 65;
          if (index < options.length) {
            // Handle answer inline to avoid stale closure
            if (isMultiple) {
              setSelectedAnswers(prev => {
                const newSet = new Set(prev);
                if (newSet.has(letter)) {
                  newSet.delete(letter);
                } else {
                  newSet.add(letter);
                }
                return newSet;
              });
            } else {
              setSelectedAnswers(new Set([letter]));
            }
          }
        }

        if (e.key === 'Enter' && selectedAnswers.size > 0) {
          e.preventDefault();
          // Handle submit inline
          const correctAnswersList = parseCorrectAnswers(question.correctAnswer);
          const selectedList = Array.from(selectedAnswers).map(a => a.toUpperCase());
          const isCorrect =
            selectedList.length === correctAnswersList.length &&
            selectedList.every(a => correctAnswersList.includes(a)) &&
            correctAnswersList.every(a => selectedList.includes(a));
          updateQuestionStats(question.bankId, question.id, isCorrect);
          setAnswers(prev => [...prev, { correct: isCorrect, questionId: question.id }]);
          setShowResult(true);
        }
      } else {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Handle next inline
          if (currentIndex >= shuffledQuestions.length - 1) {
            setSessionComplete(true);
          } else {
            setCurrentIndex(prev => prev + 1);
            setSelectedAnswers(new Set());
            setShowResult(false);
            setOpenAnswer('');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [practiceStarted, shuffledQuestions, currentIndex, sessionComplete, showResult, selectedAnswers, updateQuestionStats]);

  const handleAnswer = (answer: string) => {
    if (showResult) return;

    const isMultiple = hasMultipleCorrect(currentQuestion.correctAnswer);

    if (isMultiple) {
      setSelectedAnswers(prev => {
        const newSet = new Set(prev);
        if (newSet.has(answer)) {
          newSet.delete(answer);
        } else {
          newSet.add(answer);
        }
        return newSet;
      });
    } else {
      setSelectedAnswers(new Set([answer]));
    }
  };

  const handleSubmit = () => {
    if (!currentQuestion || showResult) return;

    let isCorrect: boolean;

    // MCQ questions - check answer
    {
      const correctAnswersList = parseCorrectAnswers(currentQuestion.correctAnswer);
      const selectedList = Array.from(selectedAnswers).map(a => a.toUpperCase());

      isCorrect =
        selectedList.length === correctAnswersList.length &&
        selectedList.every(a => correctAnswersList.includes(a)) &&
        correctAnswersList.every(a => selectedList.includes(a));
    }

    updateQuestionStats(currentQuestion.bankId, currentQuestion.id, isCorrect);

    setAnswers(prev => [...prev, { correct: isCorrect, questionId: currentQuestion.id }]);
    setShowResult(true);
  };

  const handleNext = () => {
    if (currentIndex >= shuffledQuestions.length - 1) {
      setSessionComplete(true);
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswers(new Set());
      setShowResult(false);
      setOpenAnswer('');
    }
  };

  const handleRestart = () => {
    setPracticeStarted(false);
    setMode(null);
    setShowCustomPicker(false);
  };

  const handleBackToModes = () => {
    setPracticeStarted(false);
    setMode(null);
    setShuffledQuestions([]);
    setCurrentIndex(0);
    setAnswers([]);
    setSessionComplete(false);
    setShowCustomPicker(false);
  };

  // No subject or questions
  if (!subject || allQuestions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-12 text-center">
          <p className="text-slate-500 font-mono mb-4">Няма въпроси за практика</p>
          <Link
            href="/question-bank"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono text-sm"
          >
            <ArrowLeft size={16} />
            Обратно към Question Bank
          </Link>
        </div>
      </div>
    );
  }

  // Mode Selection Screen
  if (!practiceStarted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/question-bank"
              className="flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm"
            >
              <ArrowLeft size={16} />
              Question Bank
            </Link>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-slate-100 font-mono mb-2">
              📚 {subject.name}
            </h2>
            <p className="text-slate-400 font-mono text-sm">
              Избери режим на практика
            </p>
          </div>

          {/* Mode Selection Grid */}
          {!showCustomPicker ? (
            <div className="grid grid-cols-2 gap-4 mb-8">
              {PRACTICE_MODES.map(({ mode: m, icon, title, description }) => {
                const isDisabled = m === 'weak' && stats.weak === 0;
                const count = m === 'weak' ? stats.weak
                  : m === 'spaced' ? stats.old
                  : m === 'custom' ? customQuestionCount
                  : stats.total;

                return (
                  <button
                    key={m}
                    onClick={() => {
                      if (isDisabled) return;
                      if (m === 'custom') {
                        setShowCustomPicker(true);
                      } else {
                        startPractice(m);
                      }
                    }}
                    disabled={isDisabled}
                    className={`p-6 rounded-xl border text-left transition-all ${
                      isDisabled
                        ? 'bg-slate-800/30 border-slate-700/50 cursor-not-allowed opacity-50'
                        : 'bg-slate-800/50 border-slate-700 hover:border-purple-500/50 hover:bg-slate-700/50 cursor-pointer'
                    }`}
                  >
                    <div className={`mb-3 ${isDisabled ? 'text-slate-600' : 'text-purple-400'}`}>
                      {icon}
                    </div>
                    <h3 className={`font-mono font-semibold mb-1 ${isDisabled ? 'text-slate-500' : 'text-slate-100'}`}>
                      {title}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mb-2">
                      {description}
                    </p>
                    <div className={`text-sm font-mono ${isDisabled ? 'text-slate-600' : 'text-cyan-400'}`}>
                      {count} въпроса
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Custom Question Count Picker */
            <div className="mb-8">
              <button
                onClick={() => setShowCustomPicker(false)}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm mb-6"
              >
                <ArrowLeft size={16} />
                Обратно
              </button>

              <h3 className="text-lg font-mono font-semibold text-slate-100 mb-4">
                Колко въпроса искаш?
              </h3>

              {/* Preset buttons */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {QUESTION_COUNT_PRESETS.filter(n => n <= stats.total).map(count => (
                  <button
                    key={count}
                    onClick={() => setCustomQuestionCount(count)}
                    className={`py-3 rounded-lg font-mono font-semibold transition-all ${
                      customQuestionCount === count
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>

              {/* Custom slider */}
              <div className="bg-slate-800/30 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400 font-mono">Или избери:</span>
                  <span className="text-lg font-bold text-cyan-400 font-mono">{customQuestionCount}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={stats.total}
                  value={customQuestionCount}
                  onChange={(e) => setCustomQuestionCount(parseInt(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-xs text-slate-500 font-mono mt-1">
                  <span>5</span>
                  <span>{stats.total}</span>
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={() => startPractice('custom')}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-mono font-semibold text-lg transition-all"
              >
                Започни с {customQuestionCount} въпроса
              </button>
            </div>
          )}

          {/* Stats Preview - hide when custom picker is open */}
          {!showCustomPicker && (
            <div className="bg-slate-800/30 rounded-lg p-4">
              <h4 className="text-xs text-slate-500 font-mono mb-3 uppercase tracking-wide">
                Статистика
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-blue-400 font-mono">{stats.total}</div>
                  <div className="text-xs text-slate-500 font-mono">Общо</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-orange-400 font-mono">{stats.weak}</div>
                  <div className="text-xs text-slate-500 font-mono">Слаби (&lt;50%)</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-purple-400 font-mono">{stats.old}</div>
                  <div className="text-xs text-slate-500 font-mono">&gt;7 дни</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Session Complete Screen
  if (sessionComplete) {
    const correctCount = answers.filter(a => a.correct).length;
    const accuracy = Math.round((correctCount / answers.length) * 100);

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-8">
          <div className="text-center mb-8">
            <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
            <h2 className="text-2xl font-bold text-slate-100 font-mono mb-2">
              Сесия завършена!
            </h2>
            <p className="text-slate-400 font-mono">
              {subject.name} • {PRACTICE_MODES.find(m => m.mode === mode)?.title}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-cyan-400 font-mono tabular-nums">
                {formatTime(elapsedTime)}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">Време</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-400 font-mono">
                {answers.length}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">Въпроси</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-400 font-mono">
                {correctCount}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">Верни</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <div className={`text-3xl font-bold font-mono ${
                accuracy >= 80 ? 'text-green-400' :
                accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {accuracy}%
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">Точност</div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleRestart}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono"
            >
              <RotateCcw size={18} />
              Нов режим
            </button>
            <Link
              href="/question-bank"
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-mono"
            >
              <ArrowLeft size={18} />
              Question Bank
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleBackToModes}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm"
        >
          <ArrowLeft size={16} />
          Режими
        </button>
        <div className="flex items-center gap-6 font-mono">
          {/* Mode indicator */}
          <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
            {PRACTICE_MODES.find(m => m.mode === mode)?.title}
          </span>

          {/* Timer */}
          <div className="flex items-center gap-2 text-cyan-400">
            <Timer size={18} />
            <span className="text-lg font-semibold tabular-nums">{formatTime(elapsedTime)}</span>
          </div>

          {/* Progress */}
          <span className="text-slate-400 text-sm">
            {currentIndex + 1} / {shuffledQuestions.length}
          </span>

          {/* Score */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <Check size={16} className="text-green-400" />
              <span className="text-green-400 font-semibold">{answers.filter(a => a.correct).length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <X size={16} className="text-red-400" />
              <span className="text-red-400 font-semibold">{answers.filter(a => !a.correct).length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-slate-800 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / shuffledQuestions.length) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl overflow-hidden">
        {/* Question */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded font-mono bg-blue-500/20 text-blue-300">
              MCQ
            </span>
            {/* Question stats */}
            {currentQuestion.stats.attempts > 0 && (
              <span className={`text-xs px-2 py-1 rounded font-mono ${
                (currentQuestion.stats.correct / currentQuestion.stats.attempts) >= 0.5
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {Math.round((currentQuestion.stats.correct / currentQuestion.stats.attempts) * 100)}% ({currentQuestion.stats.attempts})
              </span>
            )}
          </div>

          <h2 className="text-lg text-slate-100 mb-6 leading-relaxed">
            {currentQuestion.text}
          </h2>

          {/* MCQ Options */}
          {currentQuestion.options && (
            <div className="space-y-2">
              {/* Multiple answer hint */}
              {hasMultipleCorrect(currentQuestion.correctAnswer) && !showResult && (
                <p className="text-xs text-purple-400 font-mono mb-2 flex items-center gap-1">
                  <Check size={12} />
                  Избери ВСИЧКИ верни отговори
                </p>
              )}

              {currentQuestion.options.map((option, i) => {
                const letter = option.charAt(0).toUpperCase();
                const isSelected = selectedAnswers.has(letter);
                const correctAnswersList = parseCorrectAnswers(currentQuestion.correctAnswer);
                const isCorrectOption = correctAnswersList.includes(letter);

                let bgColor = 'bg-slate-800/50 hover:bg-slate-700/50';
                let borderColor = 'border-slate-700';

                if (showResult) {
                  if (isCorrectOption) {
                    bgColor = 'bg-green-500/20';
                    borderColor = 'border-green-500';
                  } else if (isSelected && !isCorrectOption) {
                    bgColor = 'bg-red-500/20';
                    borderColor = 'border-red-500';
                  }
                } else if (isSelected) {
                  bgColor = 'bg-purple-500/20';
                  borderColor = 'border-purple-500';
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(letter)}
                    disabled={showResult}
                    className={`w-full p-4 rounded-lg border text-left transition-all ${bgColor} ${borderColor} ${
                      showResult ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox for multiple / Radio for single */}
                      {hasMultipleCorrect(currentQuestion.correctAnswer) && !showResult && (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-500'
                        }`}>
                          {isSelected && <Check size={14} className="text-white" />}
                        </div>
                      )}
                      <span className="text-slate-200">{option}</span>
                      {showResult && isCorrectOption && (
                        <Check size={16} className="text-green-400 ml-auto shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}


          {/* Result Feedback */}
          {showResult && (
            <div className={`mt-4 p-4 rounded-lg ${
              answers[answers.length - 1]?.correct
                ? 'bg-green-500/20 border border-green-500/30'
                : 'bg-red-500/20 border border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {answers[answers.length - 1]?.correct ? (
                  <Check size={18} className="text-green-400" />
                ) : (
                  <X size={18} className="text-red-400" />
                )}
                <span className={`font-mono font-semibold ${
                  answers[answers.length - 1]?.correct ? 'text-green-400' : 'text-red-400'
                }`}>
                  {answers[answers.length - 1]?.correct ? 'Вярно!' : 'Грешно'}
                </span>
              </div>

              {currentQuestion.type !== 'open' && !answers[answers.length - 1]?.correct && (
                <p className="text-sm text-slate-300 font-mono">
                  Верен отговор: {currentQuestion.correctAnswer}
                </p>
              )}

              {currentQuestion.explanation && (
                <p className="text-sm text-slate-400 mt-2">
                  {currentQuestion.explanation}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-800 flex justify-between">
          {!showResult ? (
            <button
              onClick={handleSubmit}
              disabled={selectedAnswers.size === 0}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Провери
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-mono flex items-center justify-center gap-2"
            >
              {currentIndex >= shuffledQuestions.length - 1 ? 'Виж резултата' : 'Следващ'}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
