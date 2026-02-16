'use client';

import Link from 'next/link';
import { Brain, CheckCircle, XCircle, RefreshCw, ArrowLeft, Sparkles, Target, FileText, Clock, Repeat, Copy } from 'lucide-react';
import { Question, OpenAnswerEvaluation, MistakeAnalysis, calculateScore, getGradeFromScore, isAnswerCorrect } from '@/lib/quiz-types';
import { showToast } from '@/components/Toast';

interface QuizResultsProps {
  questions: Question[];
  answers: (string | null)[];
  openEvaluations: Record<number, OpenAnswerEvaluation>;
  elapsedTime: number;
  formatTime: (seconds: number) => string;
  questionTimes: number[];
  subjectId: string | null;
  topicId: string | null;
  gradeSaved: boolean;
  isSavingGrade: boolean;
  onSaveGrade: () => void;
  onReset: () => void;
  onDrillWeakness: () => void;
  clozeCards: string[] | null;
  isGeneratingCloze: boolean;
  clozeError: string | null;
  onGenerateCloze: () => void;
  onResetCloze: () => void;
  mistakeAnalysis: MistakeAnalysis | null;
  isAnalyzingMistakes: boolean;
  onAnalyzeMistakes: () => void;
}

export function QuizResults({
  questions, answers, openEvaluations,
  elapsedTime, formatTime, questionTimes,
  subjectId, topicId,
  gradeSaved, isSavingGrade, onSaveGrade, onReset, onDrillWeakness,
  clozeCards, isGeneratingCloze, clozeError, onGenerateCloze, onResetCloze,
  mistakeAnalysis, isAnalyzingMistakes, onAnalyzeMistakes
}: QuizResultsProps) {
  const score = calculateScore(questions, answers, openEvaluations);
  const questionsCount = questions.length || 1;
  const grade = getGradeFromScore(score, questionsCount);
  const percentage = Math.round((score / questionsCount) * 100);

  const wrongCount = questions.filter((q, i) => {
    return !isAnswerCorrect(q, answers[i], openEvaluations[i]);
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
          {score.toFixed(1)} / {questions.length}
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
              const slowestQuestion = questions[slowestIndex];
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
                {wrongCount} грешни въпроса
                <span className="text-xs text-slate-500">(цъкни за детайли)</span>
              </summary>
              <div className="mt-4 space-y-4 text-left">
                {questions.map((q, i) => {
                  const userAnswer = answers[i];
                  const openEval = openEvaluations[i];
                  const isWrong = !isAnswerCorrect(q, userAnswer, openEval);

                  if (!isWrong) return null;

                  return (
                    <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded font-mono">
                          Q{i + 1}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {q.type === 'case_study' ? 'Казус' : q.type === 'open' ? 'Отворен' :
                           q.type === 'true_false' ? 'Вярно/Невярно' : q.type === 'fill_blank' ? 'Попълни' :
                           q.type === 'short_answer' ? 'Кратък' : q.type === 'matching' ? 'Свържи' :
                           q.type === 'ordering' ? 'Подреди' : 'Избор'}
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
                          <span className="text-red-300">
                            {!userAnswer ? '(празен)' :
                             q.type === 'matching' ? (() => {
                               try { const pairs = JSON.parse(userAnswer) as Record<string, string>;
                                 return Object.entries(pairs).map(([l, r]) => `${l} → ${r}`).join('; ');
                               } catch { return userAnswer; }
                             })() :
                             q.type === 'ordering' ? (() => {
                               try { const items = JSON.parse(userAnswer) as string[];
                                 return items.map((it, idx) => `${idx + 1}. ${it}`).join('; ');
                               } catch { return userAnswer; }
                             })() :
                             q.type === 'true_false' ? (userAnswer === 'true' ? 'Вярно' : 'Невярно') :
                             userAnswer}
                          </span>
                        </div>
                        <div className="bg-green-500/10 rounded p-2 border-l-2 border-green-500">
                          <span className="text-green-400 font-semibold">Правилен: </span>
                          <span className="text-green-300">
                            {q.type === 'matching' && q.pairs ? q.pairs.map(p => `${p.left} → ${p.right}`).join('; ') :
                             q.type === 'ordering' && q.items ? q.items.map((it, idx) => `${idx + 1}. ${it}`).join('; ') :
                             q.type === 'true_false' ? (q.correctAnswer === 'true' ? 'Вярно' : 'Невярно') :
                             q.correctAnswer}
                          </span>
                        </div>
                        {q.explanation && (
                          <div className="bg-slate-700/50 rounded p-2 border-l-2 border-slate-500">
                            <span className="text-slate-400 font-semibold">Обяснение: </span>
                            <span className="text-slate-300">{q.explanation}</span>
                          </div>
                        )}
                        {(q.type === 'open' || q.type === 'short_answer') && openEval && (
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
            onClick={onSaveGrade}
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
            onClick={onReset}
            className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-slate-200 font-semibold rounded-lg font-mono"
          >
            <RefreshCw size={20} /> Нов тест
          </button>
          {wrongCount > 0 && (
            <button
              onClick={onDrillWeakness}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-semibold rounded-lg font-mono"
            >
              <Repeat size={20} /> Drill Weakness
            </button>
          )}
        </div>

        {/* Cloze Cards from Wrong Answers */}
        {wrongCount > 0 && (
          <div className="mt-8 w-full max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-cyan-400 font-mono flex items-center gap-2">
                <FileText size={16} /> Cloze карти от грешки
              </h3>
              <div className="flex items-center gap-2">
                {clozeCards && (
                  <button
                    onClick={onResetCloze}
                    className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-cyan-400 font-mono text-xs transition-colors"
                    title="Генерирай отново"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
                {clozeCards && clozeCards.length > 0 && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(clozeCards.join('\n'));
                      showToast(`${clozeCards.length} карти копирани!`, 'success');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 border border-cyan-600/40 text-cyan-300 rounded-lg font-mono text-xs hover:bg-cyan-600/30 transition-colors"
                  >
                    <Copy size={12} /> Копирай всички
                  </button>
                )}
              </div>
            </div>

            {!clozeCards && !isGeneratingCloze && !clozeError && (
              <button
                onClick={onGenerateCloze}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-600/30 text-cyan-300 font-mono text-sm rounded-lg hover:from-cyan-600/30 hover:to-blue-600/30 transition-all"
              >
                <Sparkles size={16} /> Генерирай Cloze карти (Wozniak 20 Rules)
              </button>
            )}

            {isGeneratingCloze && (
              <div className="flex items-center justify-center gap-3 py-6 text-cyan-400 font-mono text-sm">
                <RefreshCw size={16} className="animate-spin" />
                Генериране на cloze карти...
              </div>
            )}

            {clozeError && (
              <div className="text-red-400 font-mono text-xs text-center py-3">
                {clozeError}
                <button
                  onClick={onResetCloze}
                  className="ml-2 text-cyan-400 underline"
                >
                  Опитай отново
                </button>
              </div>
            )}

            {clozeCards && clozeCards.length > 0 && (
              <div className="space-y-2">
                {clozeCards.map((card, i) => (
                  <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 min-w-0 text-slate-200 font-mono text-sm leading-relaxed"
                         dangerouslySetInnerHTML={{
                           __html: card.replace(/\{\{c\d+::(.*?)\}\}/g,
                             '<span class="text-cyan-400 font-semibold bg-cyan-400/10 px-1 rounded">$1</span>')
                         }}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(card);
                          showToast('Картата е копирана!', 'success');
                        }}
                        className="flex-shrink-0 p-1.5 text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Копирай"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Mistake Analysis Section */}
        {wrongCount > 0 && (
          <div className="mt-8 w-full max-w-2xl mx-auto">
            {!mistakeAnalysis && !isAnalyzingMistakes && (
              <button
                onClick={onAnalyzeMistakes}
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

                <div className="text-slate-300 font-mono text-sm">
                  {mistakeAnalysis.summary}
                </div>

                {mistakeAnalysis.priorityFocus && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-400 font-mono text-xs font-semibold mb-1">
                      <Target size={14} />
                      ПРИОРИТЕТЕН ФОКУС
                    </div>
                    <p className="text-red-300 font-mono text-sm">{mistakeAnalysis.priorityFocus}</p>
                  </div>
                )}

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
