'use client';

import { Flame, Trophy } from 'lucide-react';
import GoalProgressRings from './GoalProgressRings';
import { TimerSession } from '@/lib/types';

interface StudyProgressPanelProps {
  timerSessions: TimerSession[];
  studyGoals: {
    dailyMinutes: number;
    weeklyMinutes: number;
    monthlyMinutes: number;
  };
  currentStreak: number;
  longestStreak: number;
}

export default function StudyProgressPanel({
  timerSessions,
  studyGoals,
  currentStreak,
  longestStreak,
}: StudyProgressPanelProps) {
  const isOnFire = currentStreak >= 3;

  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b] h-full">
      <GoalProgressRings
        timerSessions={timerSessions}
        studyGoals={studyGoals}
        compact
      />
      <div className="border-t border-slate-700/50 my-4" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame
            size={16}
            className={isOnFire ? 'text-orange-400' : 'text-slate-500'}
            fill={isOnFire ? 'currentColor' : 'none'}
          />
          <span className={`text-sm font-bold font-mono ${isOnFire ? 'text-orange-400' : 'text-slate-400'}`}>
            {currentStreak} {currentStreak === 1 ? 'ден' : 'дни'}
          </span>
          {currentStreak > 0 && currentStreak >= longestStreak && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-500/20 rounded-full">
              <Trophy size={10} className="text-yellow-400" />
              <span className="text-[9px] text-yellow-400 font-mono">Рекорд!</span>
            </span>
          )}
        </div>
        {longestStreak > 0 && currentStreak < longestStreak && (
          <span className="text-xs text-slate-500 font-mono">
            Рекорд: {longestStreak}
          </span>
        )}
      </div>
    </div>
  );
}
