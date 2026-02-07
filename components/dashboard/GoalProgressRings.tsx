'use client';

import { useMemo } from 'react';
import { Target } from 'lucide-react';

interface GoalProgressRingsProps {
  timerSessions: Array<{ startTime: string; duration: number }>;
  studyGoals: {
    dailyMinutes: number;
    weeklyMinutes: number;
    monthlyMinutes: number;
  };
  compact?: boolean;
}

interface RingProps {
  percentage: number;
  size: number;
  strokeWidth: number;
  color: string;
  label: string;
  current: number;
  goal: number;
}

function ProgressRing({ percentage, size, strokeWidth, color, label, current, goal }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}м`;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return minutes > 0 ? `${hours}ч${minutes}м` : `${hours}ч`;
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-slate-700"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold font-mono" style={{ color }}>
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
      <span className="text-xs text-slate-400 font-mono mt-2">{label}</span>
      <span className="text-[10px] text-slate-500 font-mono">
        {formatTime(current)} / {formatTime(goal)}
      </span>
    </div>
  );
}

export default function GoalProgressRings({ timerSessions, studyGoals, compact }: GoalProgressRingsProps) {
  const safeSessions = timerSessions || [];
  const safeGoals = {
    dailyMinutes: studyGoals?.dailyMinutes || 120,
    weeklyMinutes: studyGoals?.weeklyMinutes || 600,
    monthlyMinutes: studyGoals?.monthlyMinutes || 2400
  };

  const progress = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Daily
    const dailyMinutes = safeSessions
      .filter(s => s.startTime?.startsWith(todayStr))
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    // Weekly (Monday start)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weeklyMinutes = safeSessions
      .filter(s => s.startTime && new Date(s.startTime) >= weekStart)
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    // Monthly
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyMinutes = safeSessions
      .filter(s => s.startTime && new Date(s.startTime) >= monthStart)
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    const dailyGoal = safeGoals.dailyMinutes || 1;
    const weeklyGoal = safeGoals.weeklyMinutes || 1;
    const monthlyGoal = safeGoals.monthlyMinutes || 1;

    return {
      daily: {
        current: dailyMinutes,
        goal: safeGoals.dailyMinutes,
        percentage: Math.min(100, (dailyMinutes / dailyGoal) * 100) || 0
      },
      weekly: {
        current: weeklyMinutes,
        goal: safeGoals.weeklyMinutes,
        percentage: Math.min(100, (weeklyMinutes / weeklyGoal) * 100) || 0
      },
      monthly: {
        current: monthlyMinutes,
        goal: safeGoals.monthlyMinutes,
        percentage: Math.min(100, (monthlyMinutes / monthlyGoal) * 100) || 0
      }
    };
  }, [safeSessions, safeGoals.dailyMinutes, safeGoals.weeklyMinutes, safeGoals.monthlyMinutes]);

  const rings = (
    <div className="flex justify-around items-start">
      <ProgressRing
        percentage={progress.daily.percentage}
        size={compact ? 68 : 80}
        strokeWidth={compact ? 5 : 6}
        color="#3b82f6"
        label="Днес"
        current={progress.daily.current}
        goal={progress.daily.goal}
      />
      <ProgressRing
        percentage={progress.weekly.percentage}
        size={compact ? 68 : 80}
        strokeWidth={compact ? 5 : 6}
        color="#8b5cf6"
        label="Седмица"
        current={progress.weekly.current}
        goal={progress.weekly.goal}
      />
      <ProgressRing
        percentage={progress.monthly.percentage}
        size={compact ? 68 : 80}
        strokeWidth={compact ? 5 : 6}
        color="#06b6d4"
        label="Месец"
        current={progress.monthly.current}
        goal={progress.monthly.goal}
      />
    </div>
  );

  if (compact) {
    return (
      <>
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-3">
          <Target size={16} className="text-purple-400" />
          Цели за учене
        </h3>
        {rings}
      </>
    );
  }

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-4">
        <Target size={16} className="text-purple-400" />
        Цели за учене
      </h3>
      {rings}
    </div>
  );
}
