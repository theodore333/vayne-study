'use client';

import { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, Circle, Clock, Target, Zap, BookOpen, Check } from 'lucide-react';
import { useApp } from '@/lib/context';
import { generateDailyPlan, calculateEffectiveHours } from '@/lib/algorithms';
import { STATUS_CONFIG } from '@/lib/constants';
import DailyCheckinModal from '@/components/modals/DailyCheckinModal';
import Link from 'next/link';

export default function TodayPage() {
  const { data, isLoading } = useApp();
  const [showCheckin, setShowCheckin] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());

  // Check which topics have been reviewed today (quiz or status change)
  const today = new Date().toISOString().split('T')[0];

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
    // Merge with manually completed
    setCompletedTopics(prev => {
      const merged = new Set(prev);
      reviewedToday.forEach(id => merged.add(id));
      return merged;
    });
  }, [data.subjects, today]);

  const effectiveHours = useMemo(() => calculateEffectiveHours(data.dailyStatus), [data.dailyStatus]);
  const dailyPlan = useMemo(
    () => generateDailyPlan(data.subjects, data.schedule, effectiveHours),
    [data.subjects, data.schedule, effectiveHours]
  );

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
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleTopic = (topicId: string) => {
    setCompletedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  // Calculate total topics and completed topics for progress
  const allPlanTopics = dailyPlan.flatMap(task => task.topics);
  const completedTopicCount = allPlanTopics.filter(t => completedTopics.has(t.id)).length;
  const topicProgressPercent = allPlanTopics.length > 0
    ? Math.round((completedTopicCount / allPlanTopics.length) * 100)
    : 0;

  const totalMinutes = dailyPlan.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const completedMinutes = dailyPlan
    .filter(t => completedTasks.has(t.id))
    .reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const progressPercent = totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0;

  const typeColors = {
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    high: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
    normal: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' }
  };

  const formatDate = () => {
    const d = new Date();
    const days = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
    const months = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
    return days[d.getDay()] + ", " + d.getDate() + " " + months[d.getMonth()];
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono">Днешен план</h1>
          <p className="text-sm text-slate-500 font-mono mt-1">{formatDate()}</p>
        </div>
        <button
          onClick={() => setShowCheckin(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-mono text-sm"
        >
          <Zap size={18} /> Редактирай статус
        </button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={18} className="text-green-400" />
            <span className="text-sm text-slate-400 font-mono">Ефективни часове</span>
          </div>
          <div className="text-3xl font-bold text-green-400 font-mono">{effectiveHours}ч</div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            Сън: {data.dailyStatus.sleep}/5 | Енергия: {data.dailyStatus.energy}/5
            {data.dailyStatus.sick && " | Болен"}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-2">
            <Target size={18} className="text-blue-400" />
            <span className="text-sm text-slate-400 font-mono">Теми</span>
          </div>
          <div className="text-3xl font-bold text-blue-400 font-mono">
            {completedTopicCount}/{allPlanTopics.length}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">
            {dailyPlan.length} {dailyPlan.length === 1 ? 'блок' : 'блока'}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-purple-400" />
            <span className="text-sm text-slate-400 font-mono">Прогрес</span>
          </div>
          <div className="text-3xl font-bold text-purple-400 font-mono">{topicProgressPercent}%</div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
              style={{ width: topicProgressPercent + "%" }}
            />
          </div>
        </div>
      </div>

      {/* Daily Plan Tasks */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
        <div className="p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <BookOpen size={20} />
            AI генериран план
          </h2>
          <p className="text-sm text-slate-500 font-mono mt-1">
            Базиран на изпити, упражнения и decay риск
          </p>
        </div>

        {dailyPlan.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-slate-400 font-mono">Няма планирани задачи за днес</p>
            <p className="text-sm text-slate-500 font-mono mt-2">
              Добави предмети и теми за да получиш персонализиран план
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e293b]">
            {dailyPlan.map(task => {
              const isCompleted = completedTasks.has(task.id);
              const colors = typeColors[task.type];

              return (
                <div
                  key={task.id}
                  className={"p-5 transition-all " + (isCompleted ? "opacity-50" : "")}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="mt-1 transition-transform hover:scale-110"
                    >
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
                        <span className="text-xs font-mono text-slate-500">
                          ~{task.estimatedMinutes} мин
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
                              <div
                                key={topic.id}
                                className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                                  isTopicDone ? 'bg-green-500/10' : 'hover:bg-slate-800/50'
                                }`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTopic(topic.id);
                                  }}
                                  className="shrink-0"
                                >
                                  {isTopicDone ? (
                                    <CheckCircle2 size={18} className="text-green-500" />
                                  ) : (
                                    <Circle size={18} className="text-slate-600 hover:text-slate-400" />
                                  )}
                                </button>
                                <Link
                                  href={subject ? `/subjects/${subject.id}/topics/${topic.id}` : '#'}
                                  className={`flex-1 text-xs font-mono truncate ${
                                    isTopicDone ? 'line-through text-slate-500' : 'text-slate-300 hover:text-white'
                                  }`}
                                  title={`#${topic.number} ${topic.name}`}
                                >
                                  <span
                                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                                    style={{ backgroundColor: STATUS_CONFIG[topic.status].text }}
                                  />
                                  #{topic.number} {topic.name}
                                </Link>
                                {isTopicDone && topic.lastReview?.startsWith(today) && (
                                  <span className="text-[10px] text-green-400 font-mono shrink-0">
                                    Quiz ✓
                                  </span>
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

      {/* Motivational Footer */}
      {dailyPlan.length > 0 && topicProgressPercent < 100 && (
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-700/30 text-center">
          <p className="text-purple-300 font-mono">
            {topicProgressPercent < 30 && "💪 Започни с първата тема - всяка стъпка има значение!"}
            {topicProgressPercent >= 30 && topicProgressPercent < 70 && "🔥 Страхотен прогрес! Продължавай така!"}
            {topicProgressPercent >= 70 && "🏆 Почти там! Финалният спринт!"}
          </p>
        </div>
      )}

      {topicProgressPercent === 100 && dailyPlan.length > 0 && (
        <div className="mt-6 p-6 rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/30 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-green-300 font-mono text-lg">Всички задачи за днес са завършени!</p>
          <p className="text-green-400/70 font-mono text-sm mt-1">Vayne mode: ACTIVATED</p>
        </div>
      )}

      {showCheckin && <DailyCheckinModal onClose={() => setShowCheckin(false)} />}
    </div>
  );
}