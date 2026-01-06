'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Brain, Play, ChevronRight, CheckCircle, XCircle, RefreshCw, ArrowLeft, Settings, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';

interface Question {
  type: 'multiple_choice' | 'open';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
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

  const { data, addGrade, incrementApiCalls } = useApp();
  const [questionCount, setQuestionCount] = useState(5);
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

  const subject = data.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);

  const generateQuiz = async () => {
    if (!topic?.material) {
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
          material: topic.material,
          topicName: topic.name,
          subjectName: subject?.name || '',
          questionCount
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setQuizState(prev => ({
          ...prev,
          isGenerating: false,
          error: result.error || 'Грешка при генериране на теста.'
        }));
        return;
      }

      // Track API usage
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
    } catch (err) {
      setQuizState(prev => ({
        ...prev,
        isGenerating: false,
        error: 'Грешка при генериране на теста.'
      }));
    }
  };

  const handleAnswer = () => {
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const answer = currentQuestion.type === 'multiple_choice' ? selectedAnswer : openAnswer;

    const newAnswers = [...quizState.answers];
    newAnswers[quizState.currentIndex] = answer;

    setShowExplanation(true);
  };

  const handleNext = () => {
    const answer = quizState.questions[quizState.currentIndex].type === 'multiple_choice'
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
      if (q.type === 'multiple_choice' && quizState.answers[i] === q.correctAnswer) {
        correct++;
      } else if (q.type === 'open' && quizState.answers[i]) {
        // For open questions, give partial credit if answered
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
    if (!subjectId || !topicId) return;
    const score = calculateScore();
    const grade = getGradeFromScore(score, quizState.questions.length);
    addGrade(subjectId, topicId, grade);
  };

  // No topic selected - show selection
  if (!subject || !topic) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
            <Brain className="text-pink-400" />
            AI Тест
          </h1>
          <p className="text-slate-400 mt-1 font-mono text-sm">
            Генерирай тест от твоя материал
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
                      <div className="mt-1 text-xs text-slate-500 font-mono">
                        {t.material.substring(0, 50)}...
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

          {data.subjects.length === 0 && (
            <p className="text-slate-500 font-mono text-center py-8">
              Добави предмети и материал за да генерираш тестове
            </p>
          )}
        </div>
      </div>
    );
  }

  // Show results
  if (quizState.showResult) {
    const score = calculateScore();
    const grade = getGradeFromScore(score, quizState.questions.length);
    const percentage = Math.round((score / quizState.questions.length) * 100);

    return (
      <div className="min-h-screen p-6 space-y-6">
        <Link
          href="/quiz"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm"
        >
          <ArrowLeft size={16} />
          Назад към тестовете
        </Link>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-4">
            {percentage >= 75 ? '🎉' : percentage >= 50 ? '👍' : '📚'}
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2 font-mono">
            Резултат: {score.toFixed(1)} / {quizState.questions.length}
          </h2>
          <p className="text-slate-400 font-mono mb-6">
            {percentage}% правилни отговори
          </p>

          <div className={`inline-block px-8 py-4 rounded-xl border-2 font-mono text-4xl font-bold mb-6 ${
            grade >= 5 ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            grade >= 4 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
            grade >= 3 ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
            'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {grade.toFixed(2)}
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleSaveGrade}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all font-mono"
            >
              <CheckCircle size={20} />
              Запази оценката
            </button>
            <button
              onClick={() => {
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
              }}
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-slate-200 font-semibold rounded-lg hover:bg-slate-600 transition-all font-mono"
            >
              <RefreshCw size={20} />
              Нов тест
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Quiz in progress
  if (quizState.questions.length > 0) {
    const currentQuestion = quizState.questions[quizState.currentIndex];
    const isCorrect = currentQuestion.type === 'multiple_choice'
      ? selectedAnswer === currentQuestion.correctAnswer
      : true; // Open questions are always "correct" for now

    return (
      <div className="min-h-screen p-6 space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-4">
          <Link
            href="/quiz"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <div className="flex justify-between text-sm text-slate-400 font-mono mb-1">
              <span>Въпрос {quizState.currentIndex + 1} от {quizState.questions.length}</span>
              <span>{topic.name}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all"
                style={{ width: `${((quizState.currentIndex + 1) / quizState.questions.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-3xl mx-auto">
          <div className="mb-6">
            <span className={`px-3 py-1 rounded-full text-xs font-mono ${
              currentQuestion.type === 'multiple_choice'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}>
              {currentQuestion.type === 'multiple_choice' ? 'Избор от много' : 'Отворен въпрос'}
            </span>
          </div>

          <h2 className="text-xl text-slate-100 mb-6 font-mono leading-relaxed">
            {currentQuestion.question}
          </h2>

          {currentQuestion.type === 'multiple_choice' ? (
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
                  {showExplanation && option === currentQuestion.correctAnswer && (
                    <CheckCircle size={18} className="inline ml-2" />
                  )}
                  {showExplanation && option === selectedAnswer && option !== currentQuestion.correctAnswer && (
                    <XCircle size={18} className="inline ml-2" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              disabled={showExplanation}
              placeholder="Напиши отговора си тук..."
              className="w-full h-32 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-500 font-mono resize-none"
            />
          )}

          {/* Explanation */}
          {showExplanation && (
            <div className={`mt-6 p-4 rounded-lg border ${
              isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-orange-500/10 border-orange-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {isCorrect ? (
                  <CheckCircle size={18} className="text-green-400" />
                ) : (
                  <XCircle size={18} className="text-orange-400" />
                )}
                <span className={`font-mono font-semibold ${isCorrect ? 'text-green-400' : 'text-orange-400'}`}>
                  {isCorrect ? 'Правилно!' : 'Провери отговора'}
                </span>
              </div>
              <p className="text-sm text-slate-300 font-mono">
                {currentQuestion.explanation}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-4">
            {!showExplanation ? (
              <button
                onClick={handleAnswer}
                disabled={currentQuestion.type === 'multiple_choice' ? !selectedAnswer : !openAnswer.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg hover:from-pink-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Провери
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg hover:from-pink-500 hover:to-purple-500 transition-all font-mono"
              >
                {quizState.currentIndex < quizState.questions.length - 1 ? (
                  <>Следващ <ChevronRight size={20} /></>
                ) : (
                  <>Виж резултата</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Setup screen
  return (
    <div className="min-h-screen p-6 space-y-6">
      <Link
        href="/quiz"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm"
      >
        <ArrowLeft size={16} />
        Назад
      </Link>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Brain size={24} className="text-pink-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100 font-mono">
              AI Тест: {topic.name}
            </h2>
            <p className="text-sm text-slate-400 font-mono" style={{ color: subject.color }}>
              {subject.name}
            </p>
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
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 font-mono text-sm"
                >
                  <Settings size={14} />
                  Настройки
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
                <AlertCircle size={18} />
                {quizState.error}
              </div>
            )}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-2 font-mono">
            Брой въпроси
          </label>
          <div className="flex gap-2">
            {[3, 5, 10, 15].map(n => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={`px-4 py-2 rounded-lg border font-mono transition-all ${
                  questionCount === n
                    ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 p-4 bg-slate-800/50 rounded-lg">
          <h4 className="text-sm font-semibold text-slate-400 mb-2 font-mono">Материал:</h4>
          <p className="text-sm text-slate-300 font-mono line-clamp-3">
            {topic.material || 'Няма добавен материал'}
          </p>
        </div>

        <button
          onClick={generateQuiz}
          disabled={quizState.isGenerating || !topic.material}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg hover:from-pink-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {quizState.isGenerating ? (
            <>
              <RefreshCw size={20} className="animate-spin" />
              Генериране...
            </>
          ) : (
            <>
              <Play size={20} />
              Генерирай тест
            </>
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
