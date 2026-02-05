'use client';

import { Flame, Trophy } from 'lucide-react';

interface StudyStreakWidgetProps {
  currentStreak: number;
  longestStreak: number;
}

export default function StudyStreakWidget({ currentStreak, longestStreak }: StudyStreakWidgetProps) {
  const isOnFire = currentStreak >= 3;
  const isRecord = currentStreak >= longestStreak && currentStreak > 0;

  return (
    <div className={`relative overflow-hidden rounded-xl p-5 border transition-all ${
      isOnFire
        ? 'bg-gradient-to-br from-orange-900/40 to-red-900/40 border-orange-500/30'
        : 'bg-[rgba(20,20,35,0.8)] border-[#1e293b]'
    }`}>
      {/* Animated flame background for streak >= 3 */}
      {isOnFire && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-32 opacity-20">
            <div className="animate-pulse">
              <Flame size={128} className="text-orange-500" />
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`${isOnFire ? 'animate-bounce' : ''}`}>
              <Flame
                size={24}
                className={isOnFire ? 'text-orange-400' : 'text-slate-500'}
                fill={isOnFire ? 'currentColor' : 'none'}
              />
            </div>
            <span className="text-sm font-semibold text-slate-300 font-mono">Study Streak</span>
          </div>
          {isRecord && currentStreak > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 rounded-full">
              <Trophy size={12} className="text-yellow-400" />
              <span className="text-[10px] text-yellow-400 font-mono">Рекорд!</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-4xl font-bold font-mono ${
            isOnFire ? 'text-orange-400' : 'text-slate-400'
          }`}>
            {currentStreak}
          </span>
          <span className={`text-sm font-mono ${
            isOnFire ? 'text-orange-300/70' : 'text-slate-500'
          }`}>
            {currentStreak === 1 ? 'ден' : 'дни'}
          </span>
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <Trophy size={12} className="text-yellow-500/70" />
            <span className="text-slate-500">Рекорд:</span>
            <span className="text-slate-400">{longestStreak} дни</span>
          </div>
        </div>

        {/* Streak milestones */}
        {currentStreak > 0 && (
          <div className="flex gap-1 mt-3">
            {[3, 7, 14, 30].map((milestone) => (
              <div
                key={milestone}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  currentStreak >= milestone
                    ? 'bg-orange-500'
                    : 'bg-slate-700'
                }`}
                title={`${milestone} дни`}
              />
            ))}
          </div>
        )}

        {currentStreak === 0 && (
          <p className="text-xs text-slate-500 font-mono mt-2">
            Започни да учиш днес и изгради streak!
          </p>
        )}
      </div>
    </div>
  );
}
