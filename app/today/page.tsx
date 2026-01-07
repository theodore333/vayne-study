'use client';

import { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, Circle, Target, Zap, BookOpen, Flame, Thermometer, Palmtree, Trophy, Bot, Sparkles, Calendar } from 'lucide-react';
import { useApp } from '@/lib/context';
import { generateDailyPlan, calculateDailyTopics } from '@/lib/algorithms';
import { getLevelInfo, getXpForNextLevel, getComboMultiplier, ACHIEVEMENT_DEFINITIONS } from '@/lib/gamification';
import { LEVEL_THRESHOLDS } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';
import DailyCheckinModal from '@/components/modals/DailyCheckinModal';
import Link from 'next/link';

export default function TodayPage() {
  const { data, isLoading, newAchievements, clearNewAchievements, incrementApiCalls } = useApp();
  const [showCheckin, setShowCheckin] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());
  const [showAchievementPopup, setShowAchievementPopup] = useState(false);

  // AI Advice state
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [loadingWeekly, setLoadingWeekly] = useState(false);

  // Check which topics have been reviewed today
  const today = new Date().toISOString().split('T')[0];

  // Show achievement popup when new achievements are unlocked
  useEffect(() => {
    if (newAchievements.length > 0) {
      setShowAchievementPopup(true);
    }
  }, [newAchievements]);

  // Auto-mark topics that were reviewed today
  useEffect(() => {
    const reviewedToday = new Set<string>();
    data.subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.lastReview && topic.lastReview.startsWith(today)) {
          reviewedToday.add(topic.id);
        }
      });
    });
    setCompletedTopics(prev => {
      const merged = new Set(prev);
      reviewedToday.forEach(id => merged.add(id));
      return merged;
    });
  }, [data.subjects, today]);

  // Calculate workload based on exam dates
  const workload = useMemo(
    () => calculateDailyTopics(data.subjects, data.dailyStatus),
    [data.subjects, data.dailyStatus]
  );

  const dailyPlan = useMemo(
    () => generateDailyPlan(data.subjects, data.schedule, 1),
    [data.subjects, data.schedule]
  );

  // Calculate study streak
  const streak = useMemo(() => {
    const dates = new Set(
      data.timerSessions.filter(s => s.endTime !== null).map(s => s.startTime.split('T')[0])
    );
    let count = 0;
    const checkDate = new Date();
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (count === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        if (dates.has(checkDate.toISOString().split('T')[0])) {
          count++;
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      } else break;
    }
    return count;
  }, [data.timerSessions]);

  // Gamification data
  const progress = data.userProgress;
  const levelInfo = getLevelInfo(progress?.level || 1);
  const xpProgress = getXpForNextLevel(progress?.xp || 0);
  const comboMultiplier = getComboMultiplier(progress?.combo?.count || 0);
  const recentAchievements = (progress?.achievements || []).slice(-3).reverse();

  // Fetch AI advice
  const fetchAiAdvice = async (type: 'daily' | 'weekly') => {
    if (type === 'daily') {
      setLoadingAdvice(true);
    } else {
      setLoadingWeekly(true);
    }

    try {
      const response = await fetch('/api/ai-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: data.subjects,
          userProgress: data.userProgress,
          timerSessions: data.timerSessions,
          dailyStatus: data.dailyStatus,
          type
        })
      });

      const result = await response.json();
      if (result.advice) {
        if (type === 'daily') {
          setAiAdvice(result.advice);
        } else {
          setWeeklyReview(result.advice);
        }
        if (result.cost) {
          incrementApiCalls(result.cost);
        }
      }
    } catch (error) {
      console.error('Failed to fetch AI advice:', error);
    } finally {
      if (type === 'daily') {
        setLoadingAdvice(false);
      } else {
        setLoadingWeekly(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const toggleTask = (taskId: string) => {
    setCompletedTasks(prev => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  };

  const toggleTopic = (topicId: string) => {
    setCompletedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const allPlanTopics = dailyPlan.flatMap(task => task.topics);
  const completedTopicCount = allPlanTopics.filter(t => completedTopics.has(t.id)).length;
  const topicProgressPercent = allPlanTopics.length > 0
    ? Math.round((completedTopicCount / allPlanTopics.length) * 100) : 0;

  const typeColors = {
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    high: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
    normal: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' }
  };

  const urgencyColors = {
    critical: 'text-red-400 bg-red-500/20 border-red-500/30',
    high: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
    medium: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
    low: 'text-blue-400 bg-blue-500/20 border-blue-500/30'
  };

  const formatDate = () => {
    const d = new Date();
    const days = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
    const months = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
    return days[d.getDay()] + ", " + d.getDate() + " " + months[d.getMonth()];
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* XP Bar & Level */}
      <div className="bg-gradient-to-r from-purple-900/40 to-cyan-900/40 border border-purple-500/30 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{levelInfo.icon}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white font-mono">{levelInfo.name}</span>
                <span className="text-sm text-purple-300 font-mono">Lv.{progress?.level || 1}</span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {progress?.xp?.toLocaleString() || 0} XP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Combo */}
            {(progress?.combo?.count || 0) >= 2 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full">
                <Zap size={14} className="text-yellow-400" />
                <span className="text-sm font-bold text-yellow-400 font-mono">{progress?.combo?.count}x</span>
                <span className="text-xs text-yellow-400/70">({comboMultiplier}x XP)</span>
              </div>
            )}
            {/* Streak */}
            {streak > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full">
                <Flame size={14} className="text-orange-400" />
                <span className="text-sm font-bold text-orange-400 font-mono">{streak}</span>
              </div>
            )}
            {/* Status Button */}
            <button
              onClick={() => setShowCheckin(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                data.dailyStatus.sick || data.dailyStatus.holiday
                  ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {data.dailyStatus.sick ? <Thermometer size={16} /> :
               data.dailyStatus.holiday ? <Palmtree size={16} /> : <Zap size={16} />}
              <span className="text-xs font-mono">
                {data.dailyStatus.sick ? 'Болен' : data.dailyStatus.holiday ? 'Почивка' : 'Нормален'}
              </span>
            </button>
          </div>
        </div>
        {/* XP Progress Bar */}
        <div className="relative">
          <div className="h-3 bg-slate-800/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 transition-all duration-500"
              style={{ width: `${xpProgress.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-500 font-mono">
            <span>{xpProgress.current} / {xpProgress.needed} XP</span>
            <span>Next: {LEVEL_THRESHOLDS.find(l => l.level === (progress?.level || 1) + 1)?.name || 'MAX'}</span>
          </div>
        </div>
      </div>

      {/* Today's Workload (Topic-Based) */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <Target size={20} className="text-cyan-400" />
            Днешен Workload
          </h2>
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {workload.total} теми
          </div>
        </div>

        {workload.bySubject.length === 0 ? (
          <p className="text-slate-500 font-mono text-sm text-center py-4">
            Няма предмети с изпитни дати
          </p>
        ) : (
          <div className="space-y-2">
            {workload.bySubject.map(item => {
              const subject = data.subjects.find(s => s.id === item.subjectId);
              return (
                <div key={item.subjectId} className={`flex items-center justify-between p-3 rounded-lg ${
                  item.warning ? 'bg-red-500/10 border border-red-500/30' : 'bg-slate-800/30'
                }`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject?.color || '#666' }} />
                    <span className="text-slate-200 font-mono truncate">{item.subjectName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border font-mono shrink-0 ${urgencyColors[item.urgency]}`}>
                      {item.daysLeft}д
                    </span>
                    {item.warning && (
                      <span className="text-xs text-red-400 font-mono shrink-0">{item.warning}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-lg font-bold font-mono ${item.warning ? 'text-red-400' : 'text-cyan-400'}`}>
                      {item.topics}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">/{item.remaining}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Advice & Weekly Review */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI Daily Advice */}
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
              <Bot size={16} className="text-cyan-400" />
              AI Съвет
            </h3>
            <button
              onClick={() => fetchAiAdvice('daily')}
              disabled={loadingAdvice}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white text-xs rounded-lg transition-colors font-mono"
            >
              {loadingAdvice ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Мисля...
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Генерирай
                </>
              )}
            </button>
          </div>
          {aiAdvice ? (
            <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap bg-slate-800/50 rounded-lg p-3 max-h-48 overflow-y-auto">
              {aiAdvice}
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-mono text-center py-4">
              Натисни "Генерирай" за персонализиран AI съвет за днес
            </p>
          )}
        </div>

        {/* Weekly Review */}
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
              <Calendar size={16} className="text-purple-400" />
              Седмичен Преглед
            </h3>
            <button
              onClick={() => fetchAiAdvice('weekly')}
              disabled={loadingWeekly}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white text-xs rounded-lg transition-colors font-mono"
            >
              {loadingWeekly ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Анализирам...
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Генерирай
                </>
              )}
            </button>
          </div>
          {weeklyReview ? (
            <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap bg-slate-800/50 rounded-lg p-3 max-h-48 overflow-y-auto">
              {weeklyReview}
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-mono text-center py-4">
              Натисни "Генерирай" за AI преглед на седмицата
            </p>
          )}
        </div>
      </div>

      {/* Recent Achievements */}
      {recentAchievements.length > 0 && (
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
              <Trophy size={16} className="text-yellow-400" />
              Последни Achievements
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {progress?.achievements?.length || 0} / {ACHIEVEMENT_DEFINITIONS.length}
            </span>
          </div>
          <div className="flex gap-3">
            {recentAchievements.map(ach => (
              <div key={ach.id} className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <span className="text-xl">{ach.icon}</span>
                <div>
                  <div className="text-sm font-medium text-yellow-400 font-mono">{ach.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{ach.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
          <div className="text-2xl font-bold text-purple-400 font-mono">{progress?.stats?.topicsCompleted || 0}</div>
          <div className="text-xs text-slate-500 font-mono">Теми</div>
        </div>
        <div className="p-4 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
          <div className="text-2xl font-bold text-green-400 font-mono">{progress?.stats?.greenTopics || 0}</div>
          <div className="text-xs text-slate-500 font-mono">Зелени</div>
        </div>
        <div className="p-4 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
          <div className="text-2xl font-bold text-blue-400 font-mono">{progress?.stats?.quizzesTaken || 0}</div>
          <div className="text-xs text-slate-500 font-mono">Тестове</div>
        </div>
        <div className="p-4 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
          <div className="text-2xl font-bold text-orange-400 font-mono">{progress?.stats?.longestStreak || streak}</div>
          <div className="text-xs text-slate-500 font-mono">Max Streak</div>
        </div>
      </div>

      {/* Daily Plan Tasks */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
        <div className="p-6 border-b border-[#1e293b]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
                <BookOpen size={20} />
                Днешен план
              </h2>
              <p className="text-sm text-slate-500 font-mono mt-1">{formatDate()}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-400 font-mono">{topicProgressPercent}%</div>
              <div className="text-xs text-slate-500 font-mono">{completedTopicCount}/{allPlanTopics.length} теми</div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
              style={{ width: topicProgressPercent + "%" }}
            />
          </div>
        </div>

        {dailyPlan.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-slate-400 font-mono">Няма планирани задачи за днес</p>
            <p className="text-sm text-slate-500 font-mono mt-2">
              Добави предмети с изпитни дати за персонализиран план
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e293b]">
            {dailyPlan.map(task => {
              const isCompleted = completedTasks.has(task.id);
              const colors = typeColors[task.type];
              return (
                <div key={task.id} className={"p-5 transition-all " + (isCompleted ? "opacity-50" : "")}>
                  <div className="flex items-start gap-4">
                    <button onClick={() => toggleTask(task.id)} className="mt-1 transition-transform hover:scale-110">
                      {isCompleted ? (
                        <CheckCircle2 size={24} className="text-green-500" />
                      ) : (
                        <Circle size={24} className="text-slate-600 hover:text-slate-400" />
                      )}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={"text-xs font-mono px-2 py-1 rounded " + colors.bg + " " + colors.text + " border " + colors.border}>
                          {task.typeLabel}
                        </span>
                        <span className="text-xs font-mono text-cyan-400">
                          +{task.topics.length * 50} XP
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: task.subjectColor }} />
                        <span className={"font-medium " + (isCompleted ? "line-through text-slate-500" : "text-slate-200")}>
                          {task.subjectName}
                        </span>
                      </div>
                      <p className={"text-sm mb-3 " + (isCompleted ? "text-slate-600" : "text-slate-400")}>
                        {task.description}
                      </p>
                      {task.topics.length > 0 && (
                        <div className="space-y-1.5">
                          {task.topics.map(topic => {
                            const isTopicDone = completedTopics.has(topic.id);
                            const subject = data.subjects.find(s => s.topics.some(t => t.id === topic.id));
                            return (
                              <div key={topic.id} className={`flex items-center gap-2 p-2 rounded-lg transition-all overflow-hidden ${
                                isTopicDone ? 'bg-green-500/10' : 'hover:bg-slate-800/50'
                              }`}>
                                <button onClick={(e) => { e.stopPropagation(); toggleTopic(topic.id); }} className="shrink-0">
                                  {isTopicDone ? (
                                    <CheckCircle2 size={18} className="text-green-500" />
                                  ) : (
                                    <Circle size={18} className="text-slate-600 hover:text-slate-400" />
                                  )}
                                </button>
                                <Link
                                  href={subject ? `/subjects/${subject.id}/topics/${topic.id}` : '#'}
                                  className={`flex-1 min-w-0 overflow-hidden text-xs font-mono group ${
                                    isTopicDone ? 'line-through text-slate-500' : 'text-slate-300 hover:text-blue-400'
                                  }`}
                                  title={`#${topic.number} ${topic.name}`}
                                >
                                  <span className="shrink-0 w-2 h-2 rounded-full inline-block mr-1.5"
                                    style={{ backgroundColor: STATUS_CONFIG[topic.status].text }} />
                                  <span className="group-hover:underline">
                                    #{topic.number} {topic.name.length > 45 ? topic.name.slice(0, 45) + '...' : topic.name}
                                  </span>
                                </Link>
                                {isTopicDone && (
                                  <span className="text-[10px] text-green-400 font-mono shrink-0">+50 XP</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completion Message */}
      {topicProgressPercent === 100 && dailyPlan.length > 0 && (
        <div className="p-6 rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/30 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-green-300 font-mono text-lg">Всички задачи за днес са завършени!</p>
          <p className="text-green-400/70 font-mono text-sm mt-1">+{allPlanTopics.length * 50} XP earned!</p>
        </div>
      )}

      {/* Achievement Popup */}
      {showAchievementPopup && newAchievements.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowAchievementPopup(false); clearNewAchievements(); }} />
          <div className="relative bg-gradient-to-b from-yellow-900/90 to-slate-900/95 border-2 border-yellow-500/50 rounded-2xl p-8 max-w-md w-full text-center animate-bounce-in">
            <div className="text-6xl mb-4">{newAchievements[0].icon}</div>
            <div className="text-yellow-400 font-mono text-sm mb-2">ACHIEVEMENT UNLOCKED!</div>
            <h3 className="text-2xl font-bold text-white font-mono mb-2">{newAchievements[0].name}</h3>
            <p className="text-slate-300 font-mono mb-6">{newAchievements[0].description}</p>
            <button
              onClick={() => { setShowAchievementPopup(false); clearNewAchievements(); }}
              className="px-6 py-2 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors font-mono"
            >
              Супер!
            </button>
          </div>
        </div>
      )}

      {showCheckin && <DailyCheckinModal onClose={() => setShowCheckin(false)} />}
    </div>
  );
}
