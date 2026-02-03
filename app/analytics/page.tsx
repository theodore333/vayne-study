'use client';

import { useState, useMemo } from 'react';
import {
  BarChart3, TrendingUp, Calendar, Clock, Target, Award,
  Flame, Brain, BookOpen, ChevronDown, Zap
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { useApp } from '@/lib/context';
import {
  getStudyTimeByDay,
  getStudyTimeBySubject,
  getStudyStreak,
  getAnalyticsSummary,
  getWeeklyTrends,
  getQuizScoreDistribution,
  getBloomDistribution,
  getFSRSOverview,
  getCurrentStreak,
  getLongestStreak
} from '@/lib/analytics';

const DAYS_OPTIONS = [7, 14, 30, 90];

export default function AnalyticsPage() {
  const { data, isLoading } = useApp();
  const [timeRange, setTimeRange] = useState(30);

  const activeSubjects = useMemo(() =>
    data.subjects.filter(s => !s.archived),
    [data.subjects]
  );

  const summary = useMemo(() =>
    getAnalyticsSummary(data.timerSessions, activeSubjects, data.userProgress),
    [data.timerSessions, activeSubjects, data.userProgress]
  );

  const dailyStudyData = useMemo(() =>
    getStudyTimeByDay(data.timerSessions, data.studyGoals.dailyMinutes, timeRange),
    [data.timerSessions, data.studyGoals.dailyMinutes, timeRange]
  );

  const subjectStudyData = useMemo(() =>
    getStudyTimeBySubject(data.timerSessions, activeSubjects),
    [data.timerSessions, activeSubjects]
  );

  const streakData = useMemo(() =>
    getStudyStreak(data.timerSessions, 90),
    [data.timerSessions]
  );

  const weeklyTrends = useMemo(() =>
    getWeeklyTrends(data.timerSessions, activeSubjects, 8),
    [data.timerSessions, activeSubjects]
  );

  const quizScores = useMemo(() =>
    getQuizScoreDistribution(activeSubjects),
    [activeSubjects]
  );

  const bloomData = useMemo(() =>
    getBloomDistribution(activeSubjects),
    [activeSubjects]
  );

  const fsrsData = useMemo(() =>
    getFSRSOverview(activeSubjects).slice(0, 10),
    [activeSubjects]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins}м`;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return minutes > 0 ? `${hours}ч ${minutes}м` : `${hours}ч`;
  };

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#eab308'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="text-blue-400" />
            Статистики и Анализи
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-mono">
            Детайлен преглед на учебната активност
          </p>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1">
          {DAYS_OPTIONS.map(days => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
                timeRange === days
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {days}д
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <SummaryCard
          icon={Clock}
          label="Общо време"
          value={formatMinutes(summary.totalStudyMinutes)}
          color="blue"
        />
        <SummaryCard
          icon={Target}
          label="Сесии"
          value={summary.totalSessions.toString()}
          color="purple"
        />
        <SummaryCard
          icon={Flame}
          label="Streak"
          value={`${summary.currentStreak} дни`}
          subValue={`Макс: ${summary.longestStreak}`}
          color="orange"
        />
        <SummaryCard
          icon={Brain}
          label="Усвоени теми"
          value={`${summary.masteredTopics}/${summary.totalTopics}`}
          color="green"
        />
        <SummaryCard
          icon={BookOpen}
          label="Тестове"
          value={summary.totalQuizzes.toString()}
          subValue={`Ср: ${summary.averageQuizScore}%`}
          color="pink"
        />
        <SummaryCard
          icon={Zap}
          label="XP / Ниво"
          value={`${summary.xpTotal} XP`}
          subValue={`Lv. ${summary.level}`}
          color="yellow"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Study Time */}
        <ChartCard title="Дневно учене" icon={Clock}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyStudyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={10}
                tickFormatter={(d) => {
                  const date = new Date(d);
                  return `${date.getDate()}/${date.getMonth() + 1}`;
                }}
              />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value) => [`${value ?? 0} мин`, 'Учене']}
                labelFormatter={(d) => new Date(d as string).toLocaleDateString('bg-BG')}
              />
              <Bar dataKey="minutes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="goal" stroke="#ef4444" strokeDasharray="5 5" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Weekly Trends */}
        <ChartCard title="Седмични тенденции" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={weeklyTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Area
                type="monotone"
                dataKey="minutes"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.3}
                name="Минути"
              />
              <Area
                type="monotone"
                dataKey="quizzes"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.3}
                name="Тестове"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Study Time by Subject */}
        <ChartCard title="Време по предмети" icon={BookOpen}>
          {subjectStudyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={subjectStudyData}
                  dataKey="minutes"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  label={({ name, payload }) => `${String(name).slice(0, 10)}... ${payload?.percentage ?? 0}%`}
                  labelLine={false}
                >
                  {subjectStudyData.map((entry, index) => (
                    <Cell key={entry.name} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value) => [`${formatMinutes(value as number ?? 0)}`, 'Учене']}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-500 font-mono text-sm">
              Няма данни за учене
            </div>
          )}
        </ChartCard>

        {/* Quiz Score Distribution */}
        <ChartCard title="Резултати от тестове" icon={Target}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={quizScores}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="range" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" fontSize={10} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} name="Брой тестове" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bloom Taxonomy Distribution */}
        <ChartCard title="Bloom нива" icon={Brain}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={bloomData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#64748b" fontSize={10} />
              <YAxis type="category" dataKey="level" stroke="#64748b" fontSize={10} width={80} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="count" name="Теми" radius={[0, 4, 4, 0]}>
                {bloomData.map((entry, index) => (
                  <Cell key={entry.level} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* FSRS Retrievability */}
        <ChartCard title="FSRS - Най-ниска запаметеност" icon={Award}>
          {fsrsData.length > 0 ? (
            <div className="space-y-2 p-2 max-h-[250px] overflow-y-auto">
              {fsrsData.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg"
                >
                  <div
                    className="w-2 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.subjectColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 truncate">{item.topic}</div>
                    <div className="text-[10px] text-slate-500">{item.subjectName}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-mono font-bold ${
                      item.retrievability < 0.5 ? 'text-red-400' :
                      item.retrievability < 0.8 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {Math.round(item.retrievability * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-500 font-mono text-sm">
              Няма FSRS данни
            </div>
          )}
        </ChartCard>
      </div>

      {/* Streak Calendar */}
      <div className="mt-6">
        <ChartCard title="Streak календар (90 дни)" icon={Flame}>
          <StreakCalendar data={streakData} />
        </ChartCard>
      </div>
    </div>
  );
}

// ============ Components ============

function SummaryCard({
  icon: Icon,
  label,
  value,
  subValue,
  color
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  color: 'blue' | 'purple' | 'orange' | 'green' | 'pink' | 'yellow';
}) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} />
        <span className="text-xs font-mono opacity-80">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subValue && (
        <div className="text-xs opacity-60 mt-1">{subValue}</div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-slate-400" />
        <h3 className="font-semibold text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StreakCalendar({ data }: { data: Array<{ date: string; intensity: 0 | 1 | 2 | 3 | 4; minutes: number }> }) {
  const intensityColors = {
    0: 'bg-slate-800',
    1: 'bg-green-900',
    2: 'bg-green-700',
    3: 'bg-green-500',
    4: 'bg-green-400',
  };

  // Group by weeks
  const weeks: typeof data[] = [];
  let currentWeek: typeof data = [];

  data.forEach((day, i) => {
    const date = new Date(day.date);
    if (date.getDay() === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          {dayNames.map((name, i) => (
            <div key={name} className="w-4 h-4 text-[8px] text-slate-500 flex items-center">
              {i % 2 === 1 ? name : ''}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => {
              const day = week.find(d => new Date(d.date).getDay() === dayOfWeek);
              if (!day) {
                return <div key={dayOfWeek} className="w-4 h-4" />;
              }
              return (
                <div
                  key={day.date}
                  className={`w-4 h-4 rounded-sm ${intensityColors[day.intensity]} cursor-pointer transition-transform hover:scale-125`}
                  title={`${new Date(day.date).toLocaleDateString('bg-BG')}: ${day.minutes} мин`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-3">
        <span className="text-xs text-slate-500">По-малко</span>
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`w-3 h-3 rounded-sm ${intensityColors[i as 0 | 1 | 2 | 3 | 4]}`}
          />
        ))}
        <span className="text-xs text-slate-500">Повече</span>
      </div>
    </div>
  );
}
