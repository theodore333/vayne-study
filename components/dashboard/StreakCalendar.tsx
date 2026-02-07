'use client';

import { useMemo } from 'react';
import { Flame, Trophy } from 'lucide-react';
import { TimerSession } from '@/lib/types';

interface StreakCalendarProps {
  timerSessions: TimerSession[];
  dailyGoalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  compact?: boolean;
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export default function StreakCalendar({ timerSessions, dailyGoalMinutes, currentStreak, longestStreak, compact }: StreakCalendarProps) {
  const isOnFire = currentStreak >= 3;
  const isRecord = currentStreak >= longestStreak && currentStreak > 0;

  const weeksToShow = compact ? 4 : 5;

  // Build calendar data
  const calendarData = useMemo(() => {
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7; // Mon=0, Sun=6
    const cells: Array<{ date: string; minutes: number; dayLabel: string; isToday: boolean }> = [];

    const daysToShow = weeksToShow * 7;
    const startOffset = todayDow + (weeksToShow - 1) * 7;

    for (let i = startOffset; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dow = (d.getDay() + 6) % 7;

      const minutes = timerSessions
        .filter(s => s.startTime && s.startTime.split('T')[0] === dateStr)
        .reduce((sum, s) => sum + s.duration, 0);

      cells.push({
        date: dateStr,
        minutes,
        dayLabel: DAY_LABELS[dow],
        isToday: i === 0
      });
    }

    return cells.slice(-daysToShow);
  }, [timerSessions, weeksToShow]);

  const studyDays = calendarData.filter(c => c.minutes > 0).length;
  const goal = dailyGoalMinutes || 480;

  // Build grid: 7 rows (Mon-Sun) × 5 cols (weeks)
  const grid: typeof calendarData[number][][] = Array.from({ length: 7 }, () => []);
  calendarData.forEach((cell, i) => {
    const row = i % 7;
    grid[row].push(cell);
  });

  const getColor = (minutes: number, isToday: boolean) => {
    if (minutes === 0) return isToday ? 'bg-slate-700 ring-1 ring-cyan-500/50' : 'bg-slate-800';
    const ratio = minutes / goal;
    if (ratio >= 1) return 'bg-green-500';
    if (ratio >= 0.5) return 'bg-green-600/70';
    return 'bg-green-800/60';
  };

  const header = (
    <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
      <div className="flex items-center gap-2">
        <Flame
          size={compact ? 16 : 20}
          className={isOnFire ? 'text-orange-400' : 'text-slate-500'}
          fill={isOnFire ? 'currentColor' : 'none'}
        />
        <span className="text-sm font-semibold text-slate-300 font-mono">Study Streak</span>
        {isRecord && currentStreak > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 rounded-full">
            <Trophy size={10} className="text-yellow-400" />
            <span className="text-[9px] text-yellow-400 font-mono">Рекорд!</span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`${compact ? 'text-xl' : 'text-2xl'} font-bold font-mono ${isOnFire ? 'text-orange-400' : 'text-slate-400'}`}>
          {currentStreak}
        </span>
        <span className="text-xs text-slate-500 font-mono">
          {currentStreak === 1 ? 'ден' : 'дни'}
        </span>
      </div>
    </div>
  );

  const calendarGrid = (
    <>
      <div className="flex gap-1">
        <div className="flex flex-col gap-[3px] mr-1">
          {[0, 2, 4, 6].map(i => (
            <div key={i} className="flex items-center" style={{ height: compact ? 14 : 16, marginTop: i > 0 ? (compact ? 1 : 3) : 0 }}>
              <span className="text-[9px] text-slate-600 font-mono w-5">{DAY_LABELS[i]}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-rows-7 grid-flow-col gap-[3px]">
          {grid.flat().map((cell, i) => {
            if (!cell) return <div key={i} className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} rounded-sm bg-slate-900`} />;
            return (
              <div
                key={cell.date}
                className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} rounded-sm ${getColor(cell.minutes, cell.isToday)} transition-colors`}
                title={`${cell.date}: ${cell.minutes > 0 ? `${cell.minutes} мин` : 'Няма учене'}`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-slate-500">
        <span>{studyDays} от {calendarData.length} дни</span>
        <div className="flex items-center gap-1">
          <span>По-малко</span>
          <div className="flex gap-[2px]">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-800" />
            <div className="w-2.5 h-2.5 rounded-sm bg-green-800/60" />
            <div className="w-2.5 h-2.5 rounded-sm bg-green-600/70" />
            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
          </div>
          <span>Повече</span>
        </div>
      </div>
    </>
  );

  if (compact) {
    return <>{header}{calendarGrid}</>;
  }

  return (
    <div className={`relative overflow-hidden rounded-xl p-5 border transition-all ${
      isOnFire
        ? 'bg-gradient-to-br from-orange-900/30 to-slate-900/80 border-orange-500/30'
        : 'bg-[rgba(20,20,35,0.8)] border-[#1e293b]'
    }`}>
      {header}
      {calendarGrid}
    </div>
  );
}
