'use client';

import { useState, useMemo } from 'react';
import { BarChart3, HelpCircle, FileCheck, Target, CheckCircle2, BookOpen, Calendar, Brain, TrendingUp } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '@/lib/context';
import { toLocalDateStr } from '@/lib/algorithms';
import { getActivityDays, getBloomDistribution } from '@/lib/analytics';

type Period = 'today' | 'week' | 'month' | 'all';

export default function AnalyticsPage() {
  const { data, isLoading } = useApp();
  const [period, setPeriod] = useState<Period>('week');

  const activeSubjects = useMemo(() =>
    data.subjects.filter(s => !s.archived && !s.deletedAt),
    [data.subjects]
  );

  // ── All-time stats (6 cards) ──
  const allTimeStats = useMemo(() => {
    const allTopics = activeSubjects.flatMap(s => s.topics);
    let totalQuestions = 0;
    let totalQuizzes = 0;
    let totalScore = 0;

    allTopics.forEach(t => {
      t.quizHistory?.forEach(q => {
        totalQuestions += q.questionsCount;
        totalQuizzes++;
        totalScore += q.score;
      });
    });

    const greenTopics = allTopics.filter(t => t.status === 'green').length;
    const topicsWithMaterial = allTopics.filter(t => t.material && t.material.trim().length > 0).length;
    const activityDays = getActivityDays(data.timerSessions, data.subjects, data.questionBanks);

    return {
      totalQuestions,
      totalQuizzes,
      avgScore: totalQuizzes > 0 ? Math.round(totalScore / totalQuizzes) : 0,
      greenTopics,
      totalTopics: allTopics.length,
      topicsWithMaterial,
      activityDaysCount: activityDays.size,
    };
  }, [activeSubjects, data.timerSessions, data.subjects, data.questionBanks]);

  // ── Period date range ──
  const periodRange = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalDateStr(now);
    switch (period) {
      case 'today':
        return { start: todayStr, end: todayStr };
      case 'week': {
        const ws = new Date(now);
        ws.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        return { start: toLocalDateStr(ws), end: todayStr };
      }
      case 'month': {
        const ms = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: toLocalDateStr(ms), end: todayStr };
      }
      case 'all':
        return { start: '2000-01-01', end: todayStr };
    }
  }, [period]);

  // ── Period-filtered stats ──
  const periodStats = useMemo(() => {
    const allTopics = activeSubjects.flatMap(s => s.topics);
    const { start, end } = periodRange;
    let questions = 0, quizzes = 0, scoreSum = 0, scoreCount = 0;

    allTopics.forEach(t => {
      t.quizHistory?.forEach(q => {
        const d = toLocalDateStr(q.date);
        if (d >= start && d <= end) {
          questions += q.questionsCount;
          quizzes++;
          scoreSum += q.score;
          scoreCount++;
        }
      });
    });

    // New topics = first quiz or first read falls in range
    const newTopics = allTopics.filter(t => {
      const dates: string[] = [];
      if (t.quizHistory?.length) dates.push(toLocalDateStr(t.quizHistory[0].date));
      if (t.lastRead) dates.push(toLocalDateStr(t.lastRead));
      if (!dates.length) return false;
      const earliest = dates.sort()[0];
      return earliest >= start && earliest <= end;
    }).length;

    return { questions, quizzes, newTopics, avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0 };
  }, [activeSubjects, periodRange]);

  // ── Bloom distribution ──
  const bloomData = useMemo(() => getBloomDistribution(activeSubjects), [activeSubjects]);
  const maxBloom = Math.max(...bloomData.map(b => b.count), 1);

  // ── Subject breakdown (period-filtered) ──
  const subjectBreakdown = useMemo(() => {
    const { start, end } = periodRange;
    return activeSubjects.map(subject => {
      let quizzes = 0, scoreSum = 0, scoreCount = 0, weakCount = 0;
      subject.topics.forEach(topic => {
        topic.quizHistory?.forEach(q => {
          const d = toLocalDateStr(q.date);
          if (d >= start && d <= end) {
            quizzes++;
            scoreSum += q.score;
            scoreCount++;
          }
        });
        weakCount += (topic.weakConcepts?.length || 0) + (topic.wrongAnswers?.filter(wa => wa.drillCount < 3).length || 0);
      });
      return {
        id: subject.id, name: subject.name, color: subject.color,
        topicCount: subject.topics.length, quizzes,
        avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
        weakCount,
      };
    }).filter(s => s.topicCount > 0).sort((a, b) => b.quizzes - a.quizzes);
  }, [activeSubjects, periodRange]);

  // ── 30-day trend data ──
  const trendData = useMemo(() => {
    const allTopics = activeSubjects.flatMap(s => s.topics);
    const now = new Date();
    const days: Array<{ label: string; quizzes: number; questions: number }> = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = toLocalDateStr(d);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      let quizzes = 0, questions = 0;
      allTopics.forEach(t => {
        t.quizHistory?.forEach(q => {
          if (toLocalDateStr(q.date) === dateStr) { quizzes++; questions += q.questionsCount; }
        });
      });
      days.push({ label, quizzes, questions });
    }
    return days;
  }, [activeSubjects]);

  // ── 8-week score trend ──
  const weeklyScoreTrend = useMemo(() => {
    const allTopics = activeSubjects.flatMap(s => s.topics);
    const now = new Date();
    const weeks: Array<{ week: string; avgScore: number | null }> = [];

    for (let i = 7; i >= 0; i--) {
      const wEnd = new Date(now);
      wEnd.setDate(wEnd.getDate() - i * 7);
      const wStart = new Date(wEnd);
      wStart.setDate(wStart.getDate() - 6);
      const startStr = toLocalDateStr(wStart);
      const endStr = toLocalDateStr(wEnd);
      const label = `${wStart.getDate()}/${wStart.getMonth() + 1}`;

      let totalScore = 0, count = 0;
      allTopics.forEach(t => {
        t.quizHistory?.forEach(q => {
          const qd = toLocalDateStr(q.date);
          if (qd >= startStr && qd <= endStr) { totalScore += q.score; count++; }
        });
      });
      weeks.push({ week: label, avgScore: count > 0 ? Math.round(totalScore / count) : null });
    }
    return weeks;
  }, [activeSubjects]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <div className="h-16 bg-slate-800/30 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-slate-800/30 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  // Empty state
  if (allTimeStats.totalQuizzes === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="text-blue-400" /> Прогрес
          </h1>
        </div>
        <div className="text-center py-16">
          <BarChart3 size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 font-mono">Няма данни за показване</p>
          <p className="text-slate-500 text-sm font-mono mt-1">Реши тестове за да видиш прогреса си тук</p>
        </div>
      </div>
    );
  }

  const periodLabels: Record<Period, string> = { today: 'Днес', week: 'Тази седмица', month: 'Този месец', all: 'Всичко' };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 className="text-blue-400" /> Прогрес
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-mono">Количествени показатели за учебната дейност</p>
      </div>

      {/* ── 6 Quick Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<HelpCircle size={16} className="text-violet-400" />} label="Въпроси" value={allTimeStats.totalQuestions.toLocaleString()} />
        <StatCard icon={<FileCheck size={16} className="text-blue-400" />} label="Тестове" value={allTimeStats.totalQuizzes.toString()} />
        <StatCard icon={<Target size={16} className="text-pink-400" />} label="Средна оценка" value={`${allTimeStats.avgScore}%`} />
        <StatCard icon={<CheckCircle2 size={16} className="text-green-400" />} label="Усвоени теми" value={`${allTimeStats.greenTopics}/${allTimeStats.totalTopics}`} />
        <StatCard icon={<BookOpen size={16} className="text-amber-400" />} label="Вкаран материал" value={allTimeStats.topicsWithMaterial.toString()} />
        <StatCard icon={<Calendar size={16} className="text-cyan-400" />} label="Активни дни" value={allTimeStats.activityDaysCount.toString()} />
      </div>

      {/* ── Period Filter ── */}
      <div className="flex gap-2">
        {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
              period === p ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* ── Period Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Въпроси" value={periodStats.questions} />
        <MiniStat label="Тестове" value={periodStats.quizzes} />
        <MiniStat label="Нови теми" value={periodStats.newTopics} />
        <MiniStat label="Средна оценка" value={periodStats.avgScore > 0 ? `${periodStats.avgScore}%` : '-'} />
      </div>

      {/* ── Bloom Distribution ── */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 font-mono flex items-center gap-2">
          <Brain size={16} className="text-purple-400" /> Bloom разпределение
        </h2>
        <div className="space-y-2">
          {bloomData.map(item => (
            <div key={item.level} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono w-24 text-right truncate">{item.level}</span>
              <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${(item.count / maxBloom) * 100}%`, backgroundColor: item.color }}
                />
              </div>
              <span className="text-xs text-slate-300 font-mono w-8 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Subject Breakdown Table ── */}
      {subjectBreakdown.length > 0 && (
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 font-mono">По предмети ({periodLabels[period].toLowerCase()})</h2>
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-wide border-b border-slate-700/50">
                <th className="text-left pb-2 pr-4">Предмет</th>
                <th className="text-right pb-2 px-2">Теми</th>
                <th className="text-right pb-2 px-2">Тестове</th>
                <th className="text-right pb-2 px-2">Ср. оценка</th>
                <th className="text-right pb-2 pl-2">Слаби</th>
              </tr>
            </thead>
            <tbody>
              {subjectBreakdown.map(s => (
                <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-slate-300 truncate max-w-[200px]">{s.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-2 px-2 text-slate-400">{s.topicCount}</td>
                  <td className="text-right py-2 px-2 text-slate-300">{s.quizzes}</td>
                  <td className={`text-right py-2 px-2 ${
                    s.avgScore === null ? 'text-slate-600' : s.avgScore >= 70 ? 'text-green-400' : s.avgScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {s.avgScore !== null ? `${s.avgScore}%` : '-'}
                  </td>
                  <td className={`text-right py-2 pl-2 ${s.weakCount > 0 ? 'text-orange-400' : 'text-slate-600'}`}>
                    {s.weakCount || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Trend Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quizzes per day */}
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 font-mono flex items-center gap-2">
            <FileCheck size={14} className="text-blue-400" /> Тестове по ден
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="quizzes" name="Тестове" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Questions per day */}
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 font-mono flex items-center gap-2">
            <HelpCircle size={14} className="text-violet-400" /> Въпроси по ден
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="questions" name="Въпроси" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Weekly score trend */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4 font-mono flex items-center gap-2">
          <TrendingUp size={14} className="text-green-400" /> Средна оценка по седмица
        </h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyScoreTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 100]} width={35} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value) => value != null ? [`${value}%`, 'Ср. оценка'] : ['-', 'Ср. оценка']}
              />
              <Line type="monotone" dataKey="avgScore" name="Ср. оценка" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-bold text-white font-mono">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-3">
      <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wide mb-1">{label}</div>
      <div className="text-base font-bold text-slate-200 font-mono">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}
