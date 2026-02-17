'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, CheckCircle, XCircle, RefreshCw, ArrowLeft, AlertCircle, Lightbulb, Clock, StopCircle, ChevronUp, ChevronDown, ArrowUpDown, Pencil, Trash2, Save, X } from 'lucide-react';
import { Question, OpenAnswerEvaluation, isAnswerCorrect } from '@/lib/quiz-types';
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

// Type label mapping
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  multiple_choice: { label: 'Избор', color: 'bg-blue-500/20 text-blue-400' },
  case_study: { label: 'Казус', color: 'bg-amber-500/20 text-amber-400' },
  open: { label: 'Отворен', color: 'bg-purple-500/20 text-purple-400' },
  fill_blank: { label: 'Попълни', color: 'bg-cyan-500/20 text-cyan-400' },
  short_answer: { label: 'Кратък', color: 'bg-indigo-500/20 text-indigo-400' },
  matching: { label: 'Свържи', color: 'bg-emerald-500/20 text-emerald-400' },
  ordering: { label: 'Подреди', color: 'bg-orange-500/20 text-orange-400' },
};

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
  // New type props
  matchingAnswers: Record<string, string>;
  setMatchingAnswers: (answers: Record<string, string>) => void;
  orderingItems: string[];
  setOrderingItems: (items: string[]) => void;
  fillBlankAnswer: string;
  setFillBlankAnswer: (answer: string) => void;
  onEditQuestion?: (index: number, updated: Question) => void;
  onDeleteQuestion?: (index: number) => void;
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
  onAnswer, onNext, onEarlyStop, onBack,
  matchingAnswers, setMatchingAnswers,
  orderingItems, setOrderingItems,
  fillBlankAnswer, setFillBlankAnswer,
  onEditQuestion, onDeleteQuestion
}: QuizQuestionProps) {
  const currentQuestion = questions[currentIndex];
  const [isEditing, setIsEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const openEval = openEvaluations[currentIndex];
  const currentAnswer = answers[currentIndex];
  const isCorrect = isAnswerCorrect(currentQuestion, currentAnswer, openEval);
  const typeInfo = TYPE_LABELS[currentQuestion.type] || TYPE_LABELS.open;

  // Memoize shuffled right-side options for matching (avoid re-shuffle on every render)
  const shuffledMatchingOptions = useMemo(() => {
    if (currentQuestion.type !== 'matching' || !currentQuestion.pairs) return [];
    return [...currentQuestion.pairs.map(p => p.right)].sort(() => Math.random() - 0.5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQuestion.type]);

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
          <span className={`px-3 py-1 rounded-full text-xs font-mono ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        </div>

        {/* Hide heading for fill_blank — the question is rendered inline with the input */}
        {currentQuestion.type !== 'fill_blank' && (
          <h2 className="text-xl md:text-2xl text-slate-100 mb-6 font-mono leading-relaxed tracking-wide">
            {formatQuestionText(currentQuestion.question)}
          </h2>
        )}

        {/* ── MCQ / Case Study ── */}
        {(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'case_study') && (
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
                Натисни A-D или 1-4 за избор, Enter за проверка
              </p>
            )}
          </div>
        )}

        {/* ── Fill in the Blank ── */}
        {currentQuestion.type === 'fill_blank' && (
          <div>
            <div className="text-lg text-slate-100 font-mono leading-relaxed mb-4">
              {currentQuestion.question.split('____').map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    showExplanation ? (
                      <span className={`inline-block px-3 py-1 mx-1 rounded border-b-2 font-semibold ${
                        fillBlankAnswer.toLowerCase().trim() === currentQuestion.correctAnswer.toLowerCase().trim() ||
                        (currentQuestion.acceptableAnswers || []).some(a => a.toLowerCase().trim() === fillBlankAnswer.toLowerCase().trim())
                          ? 'text-green-400 border-green-500 bg-green-500/10'
                          : 'text-red-400 border-red-500 bg-red-500/10'
                      }`}>
                        {fillBlankAnswer || '(празно)'}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={fillBlankAnswer}
                        onChange={(e) => setFillBlankAnswer(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && fillBlankAnswer.trim()) onAnswer(); }}
                        placeholder="..."
                        className="inline-block w-48 px-3 py-1 mx-1 bg-slate-800/50 border-b-2 border-purple-500 text-purple-200 font-mono text-lg focus:outline-none focus:border-purple-400 placeholder:text-slate-600"
                        autoFocus
                      />
                    )
                  )}
                </span>
              ))}
            </div>
            {showExplanation && (
              <p className="text-sm text-slate-400 font-mono">
                Верен отговор: <span className="text-green-400">{currentQuestion.correctAnswer}</span>
                {currentQuestion.acceptableAnswers?.length ? (
                  <span className="text-slate-500"> (също: {currentQuestion.acceptableAnswers.join(', ')})</span>
                ) : null}
              </p>
            )}
          </div>
        )}

        {/* ── Short Answer ── */}
        {currentQuestion.type === 'short_answer' && (
          <div>
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === 'Enter' && !showExplanation && openAnswer.trim()) onAnswer();
              }}
              disabled={showExplanation}
              placeholder="Кратък отговор (1-3 изречения)... Ctrl+Enter за проверка"
              className="w-full px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 text-base font-mono resize-y focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all placeholder:text-slate-500 min-h-[120px]"
            />
            <p className="text-xs text-slate-500 font-mono mt-2">Кратък отговор: 1-3 изречения</p>
          </div>
        )}

        {/* ── Matching ── */}
        {currentQuestion.type === 'matching' && currentQuestion.pairs && (
          <div className="space-y-3">
            {currentQuestion.pairs.map((pair, i) => {
              const userChoice = matchingAnswers[pair.left] || '';
              const isCorrectPair = showExplanation && userChoice === pair.right;
              const isWrongPair = showExplanation && userChoice !== pair.right;
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  showExplanation
                    ? isCorrectPair ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
                    : 'bg-slate-800/30 border-slate-700/50'
                }`}>
                  <div className="shrink-0 min-w-[80px] max-w-[40%] text-sm text-slate-200 font-mono">{pair.left}</div>
                  <ArrowUpDown size={16} className="text-slate-500 shrink-0" />
                  {showExplanation ? (
                    <div className="flex-1 text-right">
                      <span className={`text-sm font-mono ${isCorrectPair ? 'text-green-400' : 'text-red-400'}`}>
                        {userChoice || '(не е избран)'}
                      </span>
                      {isWrongPair && (
                        <span className="text-xs text-green-400 font-mono block">→ {pair.right}</span>
                      )}
                    </div>
                  ) : (
                    <select
                      value={userChoice}
                      onChange={(e) => setMatchingAnswers({ ...matchingAnswers, [pair.left]: e.target.value })}
                      className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-slate-200 font-mono text-sm focus:border-purple-500 focus:outline-none"
                    >
                      <option value="">— избери —</option>
                      {shuffledMatchingOptions.map((right, j) => (
                        <option key={j} value={right}>{right}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Ordering ── */}
        {currentQuestion.type === 'ordering' && orderingItems.length > 0 && (
          <div className="space-y-2">
            {orderingItems.map((item, i) => {
              const correctPos = currentQuestion.items?.indexOf(item) ?? -1;
              const isCorrectPos = showExplanation && correctPos === i;
              const isWrongPos = showExplanation && correctPos !== i;
              return (
                <div key={item} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  showExplanation
                    ? isCorrectPos ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
                    : 'bg-slate-800/30 border-slate-700/50'
                }`}>
                  <span className={`w-7 h-7 rounded flex items-center justify-center text-sm font-bold font-mono ${
                    showExplanation
                      ? isCorrectPos ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-slate-200 font-mono">{item}</span>
                  {!showExplanation && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => {
                          if (i === 0) return;
                          const arr = [...orderingItems];
                          [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                          setOrderingItems(arr);
                        }}
                        disabled={i === 0}
                        className="p-0.5 text-slate-400 hover:text-slate-200 disabled:text-slate-700 transition-colors"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (i === orderingItems.length - 1) return;
                          const arr = [...orderingItems];
                          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                          setOrderingItems(arr);
                        }}
                        disabled={i === orderingItems.length - 1}
                        className="p-0.5 text-slate-400 hover:text-slate-200 disabled:text-slate-700 transition-colors"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  )}
                  {isWrongPos && (
                    <span className="text-xs text-green-400 font-mono">#{correctPos + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Open ── */}
        {currentQuestion.type === 'open' && (
          <div>
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === 'Enter' && !showExplanation && openAnswer.trim()) onAnswer();
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
                ? 'Higher-Order: Препоръчително 5-8 изречения с анализ и обосновка'
                : (currentQuestion.bloomLevel || 1) >= 3
                  ? 'Препоръчително: 3-5 изречения за пълен отговор'
                  : 'Препоръчително: 2-3 изречения'}
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
            {/* AI Evaluation for open/short_answer questions */}
            {(currentQuestion.type === 'open' || currentQuestion.type === 'short_answer') && openEval && (
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

            {/* Standard result for MCQ, true_false, fill_blank, matching, ordering */}
            {(['multiple_choice', 'case_study', 'fill_blank', 'matching', 'ordering'].includes(currentQuestion.type)) && (
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

            {/* Model answer for open/short_answer questions */}
            {(currentQuestion.type === 'open' || currentQuestion.type === 'short_answer') && (
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

        {/* Inline edit form */}
        {showExplanation && isEditing && onEditQuestion && (
          <div className="mt-4 p-4 bg-slate-800/60 border border-slate-600 rounded-xl space-y-3">
            <div>
              <label className="text-xs text-slate-500 font-mono mb-1 block">Въпрос</label>
              <textarea
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>
            {['multiple_choice', 'case_study'].includes(currentQuestion.type) && (
              <div>
                <label className="text-xs text-slate-500 font-mono mb-1 block">Опции</label>
                {editOptions.map((opt, i) => (
                  <input
                    key={i}
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...editOptions];
                      newOpts[i] = e.target.value;
                      setEditOptions(newOpts);
                    }}
                    className="w-full px-3 py-1.5 mb-1 bg-slate-900/50 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:border-purple-500 focus:outline-none"
                  />
                ))}
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500 font-mono mb-1 block">Верен отговор</label>
              {['open', 'short_answer'].includes(currentQuestion.type) ? (
                <textarea
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:border-purple-500 focus:outline-none resize-none"
                />
              ) : (
                <input
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:border-purple-500 focus:outline-none"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500 font-mono mb-1 block">Обяснение</label>
              <textarea
                value={editExplanation}
                onChange={(e) => setEditExplanation(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-sm font-mono text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              >
                <X size={14} /> Отказ
              </button>
              <button
                onClick={() => {
                  const updated: Question = {
                    ...currentQuestion,
                    question: editQuestion,
                    correctAnswer: editAnswer,
                    explanation: editExplanation,
                    ...((['multiple_choice', 'case_study'].includes(currentQuestion.type) && editOptions.length > 0)
                      ? { options: editOptions }
                      : {})
                  };
                  onEditQuestion(currentIndex, updated);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-sm font-mono bg-green-600/30 text-green-400 hover:bg-green-600/50 rounded-lg transition-colors flex items-center gap-1"
              >
                <Save size={14} /> Запази
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          {/* Edit/Delete buttons — only after answering */}
          {showExplanation && (onEditQuestion || onDeleteQuestion) ? (
            <div className="flex items-center gap-2">
              {onEditQuestion && !isEditing && (
                <button
                  onClick={() => {
                    setEditQuestion(currentQuestion.question);
                    setEditAnswer(currentQuestion.correctAnswer);
                    setEditExplanation(currentQuestion.explanation || '');
                    setEditOptions(currentQuestion.options ? [...currentQuestion.options] : []);
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-lg transition-colors"
                >
                  <Pencil size={13} /> Редактирай
                </button>
              )}
              {onDeleteQuestion && (
                <button
                  onClick={() => onDeleteQuestion(currentIndex)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-red-400/70 hover:text-red-400 bg-slate-800/50 hover:bg-red-900/20 border border-slate-700 hover:border-red-700/50 rounded-lg transition-colors"
                >
                  <Trash2 size={13} /> Изтрий
                </button>
              )}
            </div>
          ) : <div />}

          <div className="flex justify-end">
          {!showExplanation ? (
            <button
              onClick={onAnswer}
              disabled={
                isEvaluatingOpen ||
                (['multiple_choice', 'case_study'].includes(currentQuestion.type) ? !selectedAnswer :
                 currentQuestion.type === 'fill_blank' ? !fillBlankAnswer.trim() :
                 currentQuestion.type === 'matching' ? Object.keys(matchingAnswers).length < (currentQuestion.pairs?.length || 0) :
                 currentQuestion.type === 'ordering' ? false :
                 !openAnswer.trim())
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
    </div>
  );
}
