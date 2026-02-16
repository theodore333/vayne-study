'use client';

import { ChevronRight, CheckCircle, XCircle, RefreshCw, ArrowLeft, AlertCircle, Lightbulb, Clock, StopCircle } from 'lucide-react';
import { Question, OpenAnswerEvaluation } from '@/lib/quiz-types';
import { BLOOM_LEVELS } from '@/lib/types';

// Format matching/numbered question text with line breaks
function formatQuestionText(text: string): React.ReactNode {
  const formatted = text
    .replace(/\s+(\d+)\.\s/g, '\n$1. ')
    .replace(/\s+([а-дa-e])\.\s/gi, '\n$1. ')
    .trim();
  if (formatted === text) return text;
  return formatted.split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

interface QuizQuestionProps {
  questions: Question[];
  currentIndex: number;
  answers: (string | null)[];
  selectedAnswer: string | null;
  setSelectedAnswer: (answer: string | null) => void;
  openAnswer: string;
  setOpenAnswer: (answer: string) => void;
  openHint: string | null;
  openHintLoading: boolean;
  requestOpenHint: () => void;
  openEvaluations: Record<number, OpenAnswerEvaluation>;
  isEvaluatingOpen: boolean;
  showExplanation: boolean;
  showEarlyStopConfirm: boolean;
  setShowEarlyStopConfirm: (show: boolean) => void;
  showBackConfirm: boolean;
  setShowBackConfirm: (show: boolean) => void;
  countWarning: string | null;
  setCountWarning: (warning: string | null) => void;
  elapsedTime: number;
  formatTime: (seconds: number) => string;
  onAnswer: () => void;
  onNext: () => void;
  onEarlyStop: () => void;
  onBack: () => void;
}

export function QuizQuestion({
  questions, currentIndex, answers,
  selectedAnswer, setSelectedAnswer,
  openAnswer, setOpenAnswer,
  openHint, openHintLoading, requestOpenHint,
  openEvaluations, isEvaluatingOpen,
  showExplanation,
  showEarlyStopConfirm, setShowEarlyStopConfirm,
  showBackConfirm, setShowBackConfirm,
  countWarning, setCountWarning,
  elapsedTime, formatTime,
  onAnswer, onNext, onEarlyStop, onBack
}: QuizQuestionProps) {
  const currentQuestion = questions[currentIndex];
  const openEval = openEvaluations[currentIndex];
  const isCorrect = (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study')
    ? selectedAnswer === currentQuestion.correctAnswer
    : openEval?.isCorrect ?? false;

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
              Отговорил си на {answers.filter(a => a !== null).length} от {questions.length} въпроса.
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
                onClick={onEarlyStop}
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
                onClick={onBack}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-mono text-sm hover:bg-red-500"
              >
                Напусни
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
            <span>Въпрос {currentIndex + 1} / {questions.length}</span>
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
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
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
          {formatQuestionText(currentQuestion.question)}
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
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === 'Enter' && !showExplanation && openAnswer.trim()) {
                  onAnswer();
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
              onClick={onAnswer}
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
              onClick={onNext}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg font-mono"
            >
              {currentIndex < questions.length - 1 ? (
                <>Следващ <ChevronRight size={20} /></>
              ) : 'Резултат'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
