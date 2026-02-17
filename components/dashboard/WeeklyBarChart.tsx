'use client';

import { useMemo } from 'react';
import { BarChart3, Layers } from 'lucide-react';
import { toLocalDateStr } from '@/lib/algorithms';
import { Subject } from '@/lib/types';

interface DayData {
  date: string;
  dayName: string;
  topics: number;
  isToday: boolean;
}

interface AnkiStats {
  dueToday: number;
  newToday: number;
  totalCards: number;
}

interface WeeklyBarChartProps {
  subjects: Subject[];
  dailyGoal: number;
  ankiStats?: AnkiStats | null;
}

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export default function WeeklyBarChart({ subjects, dailyGoal, ankiStats }: WeeklyBarChartProps) {
  const safeGoal = dailyGoal || 5;

  const weekData = useMemo(() => {
    const result: DayData[] = [];
    const now = new Date();
    const allTopics = subjects.flatMap(s => s.topics);

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = toLocalDateStr(date);

      const topicsCount = allTopics.filter(t =>
        t.lastReview && toLocalDateStr(t.lastReview) === dateStr
      ).length;

      result.push({
        date: dateStr,
        dayName: DAY_NAMES[date.getDay()],
        topics: topicsCount,
        isToday: i === 0
      });
    }

    return result;
  }, [subjects]);

  const maxTopics = Math.max(...weekData.map(d => d.topics), safeGoal) || 1;
  const totalTopics = weekData.reduce((sum, d) => sum + d.topics, 0);

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-400" />
          Последните 7 дни
        </h3>
        <span className="text-xs text-slate-500 font-mono">
          Общо: {totalTopics} теми
        </span>
      </div>

      <div className="flex items-end gap-2 h-32">
        {weekData.map((day) => {
          const height = maxTopics > 0 ? (day.topics / maxTopics) * 100 : 0;
          const reachedGoal = day.topics >= safeGoal;

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500 font-mono h-4">
                {day.topics > 0 ? day.topics : '-'}
              </span>
              <div className="relative w-full flex-1 flex items-end">
                {safeGoal > 0 && (
                  <div
                    className="absolute w-full border-t border-dashed border-slate-600 z-10"
                    style={{ bottom: `${(safeGoal / maxTopics) * 100}%` }}
                  />
                )}
                <div
                  className={`w-full rounded-t transition-all ${
                    day.isToday
                      ? reachedGoal ? 'bg-green-500' : 'bg-blue-500'
                      : reachedGoal ? 'bg-green-600/70' : day.topics > 0 ? 'bg-slate-600' : 'bg-slate-800'
                  }`}
                  style={{ height: `${Math.max(height, 4)}%` }}
                />
              </div>
              <span className={`text-xs font-mono ${day.isToday ? 'text-blue-400 font-semibold' : 'text-slate-500'}`}>
                {day.dayName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-green-500" /> Цел постигната
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 border-t border-dashed border-slate-500" /> Дневна цел ({safeGoal} теми)
        </span>
      </div>

      {/* Anki stats footer */}
      {ankiStats && (
        <div className="border-t border-slate-700/50 mt-4 pt-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Layers size={13} className="text-amber-400" />
              <span className="text-[11px] text-slate-400 font-mono font-medium">Anki</span>
            </div>
            <div className="flex gap-4 text-[11px] font-mono">
              <span className="text-amber-400">{ankiStats.dueToday + ankiStats.newToday} <span className="text-slate-500">оставащи</span></span>
              <span className="text-slate-400">{ankiStats.totalCards.toLocaleString()} <span className="text-slate-500">общо</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
