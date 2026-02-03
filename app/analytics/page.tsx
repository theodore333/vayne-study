'use client';

import { useMemo } from 'react';
import { BarChart3, Clock, Flame, Brain, BookOpen, Target, CheckCircle2, TrendingUp } from 'lucide-react';
import { useApp } from '@/lib/context';
import Link from 'next/link';

export default function AnalyticsPage() {
  const { data, isLoading } = useApp();

  const activeSubjects = useMemo(() =>
    data.subjects.filter(s => !s.archived),
    [data.subjects]
  );

  // Calculate stats
  const stats = useMemo(() => {
    // Study time from timer sessions
    const totalMinutes = data.timerSessions.reduce((sum, s) => sum + s.duration, 0);
    const totalSessions = data.timerSessions.length;

    // Streak calculation
    const studyDates = new Set<string>();
    data.timerSessions.forEach(s => {
      if (s.startTime) {
        const date = s.startTime.split('T')[0];
        if (date) studyDates.add(date);
      }
    });

    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      if (studyDates.has(dateStr)) {
        currentStreak++;
      } else if (i > 0) {
        break;
      }
    }

    // Topic stats
    const allTopics = activeSubjects.flatMap(s => s.topics);
    const greenTopics = allTopics.filter(t => t.status === 'green').length;
    const yellowTopics = allTopics.filter(t => t.status === 'yellow').length;
    const grayTopics = allTopics.filter(t => t.status === 'gray').length;

    // Quiz stats
    let totalQuizzes = 0;
    let totalScore = 0;
    allTopics.forEach(t => {
      if (t.quizHistory) {
        totalQuizzes += t.quizHistory.length;
        t.quizHistory.forEach(q => totalScore += q.score);
      }
    });
    const avgScore = totalQuizzes > 0 ? Math.round(totalScore / totalQuizzes) : 0;

    // Study time by subject
    const bySubject: Array<{ name: string; color: string; minutes: number }> = [];
    const subjectMinutes = new Map<string, number>();
    data.timerSessions.forEach(s => {
      const current = subjectMinutes.get(s.subjectId) || 0;
      subjectMinutes.set(s.subjectId, current + s.duration);
    });
    activeSubjects.forEach(subject => {
      const minutes = subjectMinutes.get(subject.id) || 0;
      if (minutes > 0) {
        bySubject.push({ name: subject.name, color: subject.color, minutes });
      }
    });
    bySubject.sort((a, b) => b.minutes - a.minutes);

    // Last 7 days activity
    const last7Days: Array<{ date: string; dayName: string; minutes: number }> = [];
    const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayMinutes = data.timerSessions
        .filter(s => s.startTime?.startsWith(dateStr))
        .reduce((sum, s) => sum + s.duration, 0);
      last7Days.push({
        date: dateStr,
        dayName: dayNames[date.getDay()],
        minutes: dayMinutes
      });
    }

    return {
      totalMinutes,
      totalSessions,
      currentStreak,
      studyDays: studyDates.size,
      totalTopics: allTopics.length,
      greenTopics,
      yellowTopics,
      grayTopics,
      totalQuizzes,
      avgScore,
      level: data.userProgress.level,
      xp: data.userProgress.xp,
      bySubject,
      last7Days
    };
  }, [data.timerSessions, activeSubjects, data.userProgress]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins} мин`;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return minutes > 0 ? `${hours}ч ${minutes}м` : `${hours}ч`;
  };

  const maxMinutes = Math.max(...stats.last7Days.map(d => d.minutes), 1);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 className="text-blue-400" />
          Статистики
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-mono">
          Преглед на учебната активност
        </p>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Clock size={20} className="text-blue-400" />}
          label="Общо учене"
          value={formatTime(stats.totalMinutes)}
          sub={`${stats.totalSessions} сесии`}
        />
        <StatCard
          icon={<Flame size={20} className="text-orange-400" />}
          label="Streak"
          value={`${stats.currentStreak} дни`}
          sub={`${stats.studyDays} общо дни`}
        />
        <StatCard
          icon={<CheckCircle2 size={20} className="text-green-400" />}
          label="Усвоени теми"
          value={`${stats.greenTopics}`}
          sub={`от ${stats.totalTopics} общо`}
        />
        <StatCard
          icon={<Target size={20} className="text-pink-400" />}
          label="Тестове"
          value={stats.totalQuizzes.toString()}
          sub={stats.avgScore > 0 ? `Ср. ${stats.avgScore}%` : 'Няма данни'}
        />
      </div>

      {/* Progress Overview */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Brain size={16} />
          Прогрес по теми
        </h2>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden flex">
            {stats.totalTopics > 0 && (
              <>
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${(stats.greenTopics / stats.totalTopics) * 100}%` }}
                  title={`Усвоени: ${stats.greenTopics}`}
                />
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${(stats.yellowTopics / stats.totalTopics) * 100}%` }}
                  title={`В процес: ${stats.yellowTopics}`}
                />
                <div
                  className="h-full bg-slate-600"
                  style={{ width: `${(stats.grayTopics / stats.totalTopics) * 100}%` }}
                  title={`Нови: ${stats.grayTopics}`}
                />
              </>
            )}
          </div>
          <span className="text-lg font-bold text-white font-mono">
            {stats.totalTopics > 0 ? Math.round((stats.greenTopics / stats.totalTopics) * 100) : 0}%
          </span>
        </div>
        <div className="flex gap-6 text-xs font-mono">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-green-500" />
            <span className="text-slate-400">Усвоени: {stats.greenTopics}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-yellow-500" />
            <span className="text-slate-400">В процес: {stats.yellowTopics}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-slate-600" />
            <span className="text-slate-400">Нови: {stats.grayTopics}</span>
          </span>
        </div>
      </div>

      {/* Last 7 Days */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <TrendingUp size={16} />
          Последни 7 дни
        </h2>
        <div className="flex items-end gap-2 h-32">
          {stats.last7Days.map((day, i) => {
            const height = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
            const isToday = i === 6;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-mono">
                  {day.minutes > 0 ? formatTime(day.minutes) : '-'}
                </span>
                <div
                  className={`w-full rounded-t transition-all ${
                    isToday ? 'bg-blue-500' : day.minutes > 0 ? 'bg-slate-600' : 'bg-slate-800'
                  }`}
                  style={{ height: `${Math.max(height, 4)}%` }}
                />
                <span className={`text-xs font-mono ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>
                  {day.dayName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time by Subject */}
      {stats.bySubject.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <BookOpen size={16} />
            Време по предмети
          </h2>
          <div className="space-y-3">
            {stats.bySubject.slice(0, 6).map(subject => {
              const percent = stats.totalMinutes > 0
                ? Math.round((subject.minutes / stats.totalMinutes) * 100)
                : 0;
              return (
                <div key={subject.name} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: subject.color }}
                  />
                  <span className="text-sm text-slate-300 flex-1 truncate">{subject.name}</span>
                  <span className="text-xs text-slate-500 font-mono">{formatTime(subject.minutes)}</span>
                  <span className="text-xs text-slate-500 font-mono w-10 text-right">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Level & XP */}
      <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl border border-purple-500/30 p-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-purple-400 font-mono">НИВО</span>
            <div className="text-3xl font-bold text-white">{stats.level}</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-pink-400 font-mono">XP</span>
            <div className="text-3xl font-bold text-white">{stats.xp.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {stats.totalSessions === 0 && (
        <div className="text-center py-8">
          <Clock size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 font-mono">Няма записани сесии</p>
          <p className="text-slate-500 text-sm font-mono mt-1">
            Използвай таймера за да записваш учебното си време
          </p>
          <Link
            href="/timer"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-mono text-sm"
          >
            Към таймера
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400 font-mono">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-500 font-mono mt-1">{sub}</div>
    </div>
  );
}
