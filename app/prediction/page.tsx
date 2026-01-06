'use client';

import { useState } from 'react';
import { TrendingUp, Zap, Calendar, Target, Star, ArrowUp, AlertTriangle, TrendingDown, Shuffle } from 'lucide-react';
import { useApp } from '@/lib/context';
import { calculatePredictedGrade, getDaysUntil, getSubjectProgress } from '@/lib/algorithms';
import { STATUS_CONFIG } from '@/lib/constants';

export default function PredictionPage() {
  const { data, isLoading } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [showVayne, setShowVayne] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const selectedSubject = selectedSubjectId
    ? data.subjects.find(s => s.id === selectedSubjectId)
    : data.subjects[0];

  const prediction = selectedSubject ? calculatePredictedGrade(selectedSubject) : null;
  const progress = selectedSubject ? getSubjectProgress(selectedSubject) : null;

  const gradeColor = (grade: number) => {
    if (grade >= 5.5) return 'text-green-400';
    if (grade >= 4.5) return 'text-yellow-400';
    if (grade >= 3.5) return 'text-orange-400';
    return 'text-red-400';
  };

  const factorColor = (impact: string) => {
    if (impact === 'positive') return 'bg-green-500';
    if (impact === 'negative') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono">Прогноза за оценки</h1>
          <p className="text-sm text-slate-500 font-mono mt-1">Предвиждане базирано на твоя прогрес</p>
        </div>
        <button
          onClick={() => setShowVayne(!showVayne)}
          className={"flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-mono text-sm " + (showVayne ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}
        >
          <Zap size={18} />
          {showVayne ? "Vayne Mode ON" : "Vayne Mode"}
        </button>
      </div>

      {data.subjects.length === 0 ? (
        <div className="p-12 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
          <TrendingUp size={48} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-mono">Добави предмети за да видиш прогнози</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Subject List */}
          <div className="lg:col-span-1">
            <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-3">Предмети</h3>
              <div className="space-y-2">
                {data.subjects.map(subject => {
                  const pred = calculatePredictedGrade(subject);
                  const days = getDaysUntil(subject.examDate);
                  const isSelected = (selectedSubject?.id || data.subjects[0]?.id) === subject.id;

                  return (
                    <button
                      key={subject.id}
                      onClick={() => setSelectedSubjectId(subject.id)}
                      className={"w-full p-4 rounded-lg text-left transition-all " + (isSelected ? "bg-slate-700/50 border border-slate-600" : "hover:bg-slate-800/50 border border-transparent")}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color }} />
                          <span className="text-sm font-medium text-slate-200 truncate">{subject.name}</span>
                        </div>
                        <span className={"text-lg font-bold font-mono " + gradeColor(showVayne ? pred.vayne : pred.current)}>
                          {(showVayne ? pred.vayne : pred.current).toFixed(2)}
                        </span>
                      </div>
                      {days !== Infinity && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                          <Calendar size={10} />
                          <span>{days <= 0 ? "ДНЕС" : days + " дни до изпит"}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Prediction Details */}
          <div className="lg:col-span-2">
            {selectedSubject && prediction && progress ? (
              <div className="space-y-6">
                {/* Main Prediction Card */}
                <div className="p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: selectedSubject.color }} />
                    <h2 className="text-xl font-semibold text-slate-100">{selectedSubject.name}</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Current Prediction */}
                    <div className={"p-6 rounded-xl text-center " + (showVayne ? "bg-slate-800/50" : "bg-gradient-to-br from-blue-900/30 to-purple-900/30 border border-blue-700/30")}>
                      <div className="text-sm text-slate-400 font-mono mb-2">Текуща прогноза</div>
                      <div className={"text-5xl font-bold font-mono " + gradeColor(prediction.current)}>
                        {prediction.current.toFixed(2)}
                      </div>
                    </div>

                    {/* Vayne Prediction */}
                    <div className={"p-6 rounded-xl text-center " + (showVayne ? "bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-700/30" : "bg-slate-800/50")}>
                      <div className="text-sm text-purple-400 font-mono mb-2 flex items-center justify-center gap-1">
                        <Zap size={14} /> Vayne прогноза
                      </div>
                      <div className={"text-5xl font-bold font-mono " + gradeColor(prediction.vayne)}>
                        {prediction.vayne.toFixed(2)}
                      </div>
                      {prediction.improvement > 0 && (
                        <div className="mt-2 flex items-center justify-center gap-1 text-green-400 font-mono text-sm">
                          <ArrowUp size={14} />
                          +{prediction.improvement.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Distribution */}
                  <div className="mb-6">
                    <div className="text-sm text-slate-400 font-mono mb-2">Разпределение по статус</div>
                    <div className="flex gap-4">
                      {Object.entries(progress.counts).map(([status, count]) => {
                        const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
                        return (
                          <div key={status} className="flex items-center gap-2">
                            <span className="text-lg">{config.emoji}</span>
                            <span className="font-mono" style={{ color: config.text }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Motivational Message */}
                  <div className="p-4 rounded-lg bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-800/30">
                    <p className="text-purple-300 font-mono text-sm">{prediction.message}</p>
                  </div>
                </div>

                {/* Monte Carlo Simulation Results */}
                {prediction.simulation && (
                  <div className="p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
                    <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
                      <Shuffle size={20} />
                      Симулация (Random Topics)
                    </h3>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {/* Best Case */}
                      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                        <div className="flex items-center justify-center gap-1 text-green-400 text-xs font-mono mb-1">
                          <ArrowUp size={12} />
                          Best Case
                        </div>
                        <div className="text-2xl font-bold font-mono text-green-400">
                          {prediction.simulation.bestCase.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">падат силни теми</div>
                      </div>

                      {/* Expected */}
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
                        <div className="text-blue-400 text-xs font-mono mb-1">Очаквано</div>
                        <div className="text-2xl font-bold font-mono text-blue-400">
                          {prediction.current.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">±{prediction.simulation.variance.toFixed(2)}</div>
                      </div>

                      {/* Worst Case */}
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
                        <div className="flex items-center justify-center gap-1 text-red-400 text-xs font-mono mb-1">
                          <TrendingDown size={12} />
                          Worst Case
                        </div>
                        <div className="text-2xl font-bold font-mono text-red-400">
                          {prediction.simulation.worstCase.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">падат слаби теми</div>
                      </div>
                    </div>

                    {/* Critical Topics Warning */}
                    {prediction.simulation.criticalTopics.length > 0 && (
                      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
                        <div className="flex items-center gap-2 text-amber-400 font-mono text-sm mb-2">
                          <AlertTriangle size={16} />
                          <span className="font-semibold">{prediction.simulation.criticalTopics.length} критични теми</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {prediction.simulation.criticalTopics.slice(0, 5).map((topic, i) => (
                            <span key={i} className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-mono">
                              {topic.length > 30 ? topic.slice(0, 30) + '...' : topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Impact Recommendation */}
                    {prediction.simulation.impactTopics.length > 0 && (
                      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <div className="text-emerald-400 font-mono text-sm mb-2 font-semibold">
                          📈 Приоритизирай тези теми:
                        </div>
                        <div className="space-y-2">
                          {prediction.simulation.impactTopics.slice(0, 3).map((topic, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-slate-300 font-mono truncate flex-1 mr-2">
                                {topic.topicName.length > 40 ? topic.topicName.slice(0, 40) + '...' : topic.topicName}
                              </span>
                              <span className="text-emerald-400 font-mono shrink-0">
                                +{topic.impact.toFixed(2)} към worst
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Exam Format Analysis */}
                {prediction.formatAnalysis && (prediction.formatAnalysis.hasCases || prediction.formatAnalysis.hasOpenQuestions) && (
                  <div className="p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
                    <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
                      <Target size={20} />
                      Exam Format Analysis
                    </h3>

                    <div className="flex gap-3 mb-4">
                      {prediction.formatAnalysis.hasCases && (
                        <span className={`px-3 py-1.5 rounded-lg font-mono text-sm ${
                          prediction.formatAnalysis.caseWeakness
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          Казуси {prediction.formatAnalysis.caseWeakness && '⚠️'}
                        </span>
                      )}
                      {prediction.formatAnalysis.hasOpenQuestions && (
                        <span className={`px-3 py-1.5 rounded-lg font-mono text-sm ${
                          prediction.formatAnalysis.openWeakness
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-slate-700 text-slate-300'
                        }`}>
                          Отворени {prediction.formatAnalysis.openWeakness && '⚠️'}
                        </span>
                      )}
                    </div>

                    {prediction.formatAnalysis.formatTip && (
                      <p className="text-slate-400 font-mono text-sm">{prediction.formatAnalysis.formatTip}</p>
                    )}
                  </div>
                )}

                {/* Factors */}
                <div className="p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
                  <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
                    <Target size={20} />
                    Фактори
                  </h3>
                  <div className="space-y-4">
                    {prediction.factors.map(factor => (
                      <div key={factor.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-300 font-mono">{factor.label}</span>
                          <span className="text-sm font-mono" style={{ color: factor.impact === 'positive' ? '#4ade80' : factor.impact === 'negative' ? '#f87171' : '#fbbf24' }}>
                            {factor.name === 'mastery' ? factor.value.toFixed(2) : factor.value + "%"}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={"h-full rounded-full transition-all " + factorColor(factor.impact)}
                            style={{ width: (factor.name === 'mastery' ? (factor.value / 6) * 100 : factor.value) + "%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tips */}
                <div className="p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
                  <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
                    <Star size={20} />
                    Съвети за подобрение
                  </h3>
                  <ul className="space-y-2">
                    {prediction.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span className="text-slate-300 font-mono text-sm">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
                <p className="text-slate-500 font-mono">Избери предмет</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overall Stats */}
      {data.subjects.length > 0 && (
        <div className="mt-6 p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
          <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4">Общ преглед</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.subjects.map(subject => {
              const pred = calculatePredictedGrade(subject);
              return (
                <div key={subject.id} className="p-4 rounded-lg bg-slate-800/50 text-center">
                  <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: subject.color }} />
                  <div className="text-xs text-slate-400 font-mono truncate mb-1">{subject.name}</div>
                  <div className={"text-2xl font-bold font-mono " + gradeColor(showVayne ? pred.vayne : pred.current)}>
                    {(showVayne ? pred.vayne : pred.current).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}