'use client';

import { useMemo, useState, useEffect } from 'react';
import { Target, Layers } from 'lucide-react';
import { getTodayString, toLocalDateStr } from '@/lib/algorithms';
import { Subject, QuestionBank } from '@/lib/types';

interface GoalProgressRingsProps {
  subjects: Subject[];
  questionBanks: QuestionBank[];
  dailyTopicGoal: number;
  compact?: boolean;
  inline?: boolean;
}

interface RingData {
  current: number;
  goal: number;
  percentage: number;
  label: string;
  color: string;
  format: string;
}

export default function GoalProgressRings({ subjects, questionBanks, dailyTopicGoal, compact, inline }: GoalProgressRingsProps) {
  const [ankiToday, setAnkiToday] = useState<{ reviewed: number; due: number } | null>(null);

  // Fetch Anki stats if enabled
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ankiEnabled = localStorage.getItem('anki-enabled') === 'true';
    if (!ankiEnabled) return;

    (async () => {
      try {
        const { getTodayStats, getCollectionStats, getSelectedDecks } = await import('@/lib/anki');
        const todayStats = await getTodayStats();
        const selectedDecks = getSelectedDecks();
        const collStats = await getCollectionStats(selectedDecks.length > 0 ? selectedDecks : undefined);
        // Cache today's review count for streak
        const todayStr = getTodayString();
        localStorage.setItem('anki-reviews-' + todayStr, String(todayStats.reviewed));
        setAnkiToday({ reviewed: todayStats.reviewed, due: collStats.dueToday });
      } catch {
        // AnkiConnect not available
      }
    })();
  }, []);

  const progress = useMemo(() => {
    const now = new Date();
    const todayStr = getTodayString();
    const allTopics = subjects.flatMap(s => s.topics);

    // Ring 1: Topics covered today
    const topicsToday = allTopics.filter(t => t.lastReview && toLocalDateStr(t.lastReview) === todayStr).length;
    const topicGoal = dailyTopicGoal || 5;

    // Ring 2: Quizzes this week (Mon-Sun)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = toLocalDateStr(weekStart);
    const quizDatesThisWeek = new Set<string>();
    for (const topic of allTopics) {
      for (const q of topic.quizHistory || []) {
        if (q.date) {
          const d = toLocalDateStr(q.date);
          if (d >= weekStartStr) {
            quizDatesThisWeek.add(d);
          }
        }
      }
    }
    const quizzesThisWeek = quizDatesThisWeek.size;
    const quizGoal = 7;

    // Ring 3: QB questions answered this month
    const monthStr = todayStr.substring(0, 7); // YYYY-MM
    let qbAnswered = 0;
    for (const bank of questionBanks) {
      for (const q of bank.questions) {
        if (q.stats.attempts > 0 && q.stats.lastAttempt && toLocalDateStr(q.stats.lastAttempt).startsWith(monthStr)) {
          qbAnswered++;
        }
      }
    }
    const qbGoal = 50;

    return {
      topics: {
        current: topicsToday,
        goal: topicGoal,
        percentage: topicGoal > 0 ? Math.min(100, (topicsToday / topicGoal) * 100) : 0,
        label: 'Теми',
        color: '#3b82f6',
        format: `${topicsToday}/${topicGoal} теми`
      },
      quizzes: {
        current: quizzesThisWeek,
        goal: quizGoal,
        percentage: Math.min(100, (quizzesThisWeek / quizGoal) * 100),
        label: 'Тестове',
        color: '#8b5cf6',
        format: `${quizzesThisWeek}/${quizGoal} теста`
      },
      qb: {
        current: qbAnswered,
        goal: qbGoal,
        percentage: Math.min(100, (qbAnswered / qbGoal) * 100),
        label: 'Въпроси',
        color: '#06b6d4',
        format: `${qbAnswered}/${qbGoal} въпроса`
      }
    } as const;
  }, [subjects, questionBanks, dailyTopicGoal]);

  const ringSize = inline ? 44 : compact ? 68 : 80;
  const ringStroke = inline ? 4 : compact ? 5 : 6;
  const rings: RingData[] = [progress.topics, progress.quizzes, progress.qb];

  if (inline) {
    return (
      <div className="flex items-center gap-4 flex-wrap">
        {rings.map(ring => {
          const radius = (ringSize - ringStroke) / 2;
          const circ = radius * 2 * Math.PI;
          const offset = circ - (Math.min(ring.percentage, 100) / 100) * circ;
          return (
            <div key={ring.label} className="flex items-center gap-2">
              <div className="relative" style={{ width: ringSize, height: ringSize }}>
                <svg className="transform -rotate-90" width={ringSize} height={ringSize}>
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="currentColor" strokeWidth={ringStroke} fill="transparent" className="text-slate-700" />
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke={ring.color} strokeWidth={ringStroke} fill="transparent" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-500" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold font-mono" style={{ color: ring.color }}>{Math.round(ring.percentage)}%</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-mono leading-tight">{ring.label}</span>
                <span className="text-xs text-slate-300 font-mono leading-tight">{ring.current}<span className="text-slate-500">/{ring.goal}</span></span>
              </div>
            </div>
          );
        })}
        {ankiToday && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10">
            <Layers size={12} className="text-amber-400" />
            <span className="text-xs text-amber-400 font-mono font-medium">{ankiToday.reviewed}<span className="text-amber-400/50">/{ankiToday.due + ankiToday.reviewed}</span></span>
          </div>
        )}
      </div>
    );
  }

  const ringsEl = (
    <div className="flex justify-around items-start">
      {rings.map(ring => {
        const radius = (ringSize - ringStroke) / 2;
        const circumference = radius * 2 * Math.PI;
        const strokeDashoffset = circumference - (Math.min(ring.percentage, 100) / 100) * circumference;
        return (
          <div key={ring.label} className="flex flex-col items-center">
            <div className="relative" style={{ width: ringSize, height: ringSize }}>
              <svg className="transform -rotate-90" width={ringSize} height={ringSize}>
                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="currentColor" strokeWidth={ringStroke} fill="transparent" className="text-slate-700" />
                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke={ring.color} strokeWidth={ringStroke} fill="transparent" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-500" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold font-mono" style={{ color: ring.color }}>{Math.round(ring.percentage)}%</span>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono mt-2">{ring.label}</span>
            <span className="text-[10px] text-slate-500 font-mono">{ring.format}</span>
          </div>
        );
      })}
    </div>
  );

  const ankiBadge = ankiToday && (
    <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
      <Layers size={13} className="text-amber-400" />
      <span className="text-xs text-amber-400 font-mono font-medium">Anki: {ankiToday.reviewed} направени</span>
      {ankiToday.due > 0 && <span className="text-xs text-slate-500 font-mono">/ {ankiToday.due} оставащи</span>}
    </div>
  );

  if (compact) {
    return (
      <>
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-3">
          <Target size={16} className="text-purple-400" />
          Постижения
        </h3>
        {ringsEl}
        {ankiBadge}
      </>
    );
  }

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-4">
        <Target size={16} className="text-purple-400" />
        Постижения
      </h3>
      {ringsEl}
      {ankiBadge}
    </div>
  );
}
