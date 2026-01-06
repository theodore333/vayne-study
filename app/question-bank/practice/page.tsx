'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/context';
import { BankQuestion, ClinicalCase } from '@/lib/types';
import { ArrowLeft, ArrowRight, Check, X, RotateCcw, Trophy, Target, Clock } from 'lucide-react';
import Link from 'next/link';

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

  // Get questions
  const subject = data.subjects.find(s => s.id === subjectId);
  const banks = (data.questionBanks || []).filter(b =>
    bankId ? b.id === bankId : b.subjectId === subjectId
  );
  const allQuestions = banks.flatMap(b => b.questions.map(q => ({ ...q, bankId: b.id })));
  const allCases = banks.flatMap(b => b.cases);

  // Shuffle questions on mount
  const [shuffledQuestions, setShuffledQuestions] = useState<(BankQuestion & { bankId: string })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<{ correct: boolean; questionId: string }[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [openAnswer, setOpenAnswer] = useState('');

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

  useEffect(() => {
    // Shuffle questions
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    setShuffledQuestions(shuffled);
  }, [subjectId, bankId]);

  const currentQuestion = shuffledQuestions[currentIndex];
  const currentCase = currentQuestion?.caseId
    ? allCases.find(c => c.id === currentQuestion.caseId)
    : null;

  const handleAnswer = (answer: string) => {
    if (showResult) return;

    const isMultiple = hasMultipleCorrect(currentQuestion.correctAnswer);

    if (isMultiple) {
      // Toggle selection for multiple-answer questions
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
      // Single selection
      setSelectedAnswers(new Set([answer]));
    }
  };

  const handleSubmit = () => {
    if (!currentQuestion || showResult) return;

    let isCorrect: boolean;

    if (currentQuestion.type === 'open') {
      isCorrect = true; // Open questions are always "correct" for now
    } else {
      const correctAnswersList = parseCorrectAnswers(currentQuestion.correctAnswer);
      const selectedList = Array.from(selectedAnswers).map(a => a.toUpperCase());

      // Check if selected answers match correct answers exactly
      isCorrect =
        selectedList.length === correctAnswersList.length &&
        selectedList.every(a => correctAnswersList.includes(a)) &&
        correctAnswersList.every(a => selectedList.includes(a));
    }

    // Update stats
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
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    setShuffledQuestions(shuffled);
    setCurrentIndex(0);
    setSelectedAnswers(new Set());
    setShowResult(false);
    setAnswers([]);
    setSessionComplete(false);
    setOpenAnswer('');
  };

  if (!subject || shuffledQuestions.length === 0) {
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
              {subject.name}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
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
              Нова сесия
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
        <Link
          href="/question-bank"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm"
        >
          <ArrowLeft size={16} />
          Question Bank
        </Link>
        <div className="flex items-center gap-4 text-sm font-mono">
          <span className="text-slate-400">
            {currentIndex + 1} / {shuffledQuestions.length}
          </span>
          <div className="flex items-center gap-2">
            <Check size={14} className="text-green-400" />
            <span className="text-green-400">{answers.filter(a => a.correct).length}</span>
            <X size={14} className="text-red-400 ml-2" />
            <span className="text-red-400">{answers.filter(a => !a.correct).length}</span>
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
        {/* Case Description (if applicable) */}
        {currentCase && (
          <div className="p-4 bg-orange-500/10 border-b border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-400 font-mono text-sm mb-2">
              <Target size={14} />
              Клиничен казус
            </div>
            <p className="text-slate-200 text-sm leading-relaxed">
              {currentCase.description}
            </p>
          </div>
        )}

        {/* Question */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-xs px-2 py-1 rounded font-mono ${
              currentQuestion.type === 'mcq'
                ? 'bg-blue-500/20 text-blue-300'
                : currentQuestion.type === 'case_study'
                ? 'bg-orange-500/20 text-orange-300'
                : 'bg-green-500/20 text-green-300'
            }`}>
              {currentQuestion.type === 'mcq' ? 'MCQ' :
               currentQuestion.type === 'case_study' ? 'Казус' : 'Отворен'}
            </span>
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

          {/* Open Answer */}
          {currentQuestion.type === 'open' && (
            <div>
              <textarea
                value={openAnswer}
                onChange={(e) => setOpenAnswer(e.target.value)}
                placeholder="Напиши отговора тук..."
                rows={4}
                disabled={showResult}
                className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono resize-none"
              />
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
              disabled={selectedAnswers.size === 0 && currentQuestion.type !== 'open'}
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
