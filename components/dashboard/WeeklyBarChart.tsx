'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';

interface DayData {
  date: string;
  dayName: string;
  minutes: number;
  isToday: boolean;
}

interface WeeklyBarChartProps {
  timerSessions: Array<{ startTime: string; duration: number }>;
  dailyGoal: number;
}

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export default function WeeklyBarChart({ timerSessions, dailyGoal }: WeeklyBarChartProps) {
  const safeSessions = timerSessions || [];
  const safeGoal = dailyGoal || 120;

  const weekData = useMemo(() => {
    const result: DayData[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayMinutes = safeSessions
        .filter(s => s.startTime?.startsWith(dateStr))
        .reduce((sum, s) => sum + (s.duration || 0), 0);

      result.push({
        date: dateStr,
        dayName: DAY_NAMES[date.getDay()],
        minutes: dayMinutes,
        isToday: i === 0
      });
    }

    return result;
  }, [safeSessions]);

  const maxMinutes = Math.max(...weekData.map(d => d.minutes), safeGoal) || 1;
  const totalMinutes = weekData.reduce((sum, d) => sum + d.minutes, 0);

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}м`;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return minutes > 0 ? `${hours}ч${minutes}м` : `${hours}ч`;
  };

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-400" />
          Последните 7 дни
        </h3>
        <span className="text-xs text-slate-500 font-mono">
          Общо: {formatTime(totalMinutes)}
        </span>
      </div>

      <div className="flex items-end gap-2 h-32">
        {weekData.map((day) => {
          const height = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
          const reachedGoal = day.minutes >= safeGoal;

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500 font-mono h-4">
                {day.minutes > 0 ? formatTime(day.minutes) : '-'}
              </span>
              <div className="relative w-full flex-1 flex items-end">
                {/* Goal line indicator */}
                {safeGoal > 0 && (
                  <div
                    className="absolute w-full border-t border-dashed border-slate-600 z-10"
                    style={{ bottom: `${(safeGoal / maxMinutes) * 100}%` }}
                  />
                )}
                <div
                  className={`w-full rounded-t transition-all ${
                    day.isToday
                      ? reachedGoal ? 'bg-green-500' : 'bg-blue-500'
                      : reachedGoal ? 'bg-green-600/70' : day.minutes > 0 ? 'bg-slate-600' : 'bg-slate-800'
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
          <span className="w-2 h-0.5 border-t border-dashed border-slate-500" /> Дневна цел
        </span>
      </div>
    </div>
  );
}
