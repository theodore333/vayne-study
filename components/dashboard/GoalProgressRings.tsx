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

export default function GoalProgressRings({ timerSessions, studyGoals }: GoalProgressRingsProps) {
  const progress = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Daily
    const dailyMinutes = timerSessions
      .filter(s => s.startTime?.startsWith(todayStr))
      .reduce((sum, s) => sum + s.duration, 0);

    // Weekly (Monday start)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weeklyMinutes = timerSessions
      .filter(s => s.startTime && new Date(s.startTime) >= weekStart)
      .reduce((sum, s) => sum + s.duration, 0);

    // Monthly
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyMinutes = timerSessions
      .filter(s => s.startTime && new Date(s.startTime) >= monthStart)
      .reduce((sum, s) => sum + s.duration, 0);

    return {
      daily: {
        current: dailyMinutes,
        goal: studyGoals.dailyMinutes,
        percentage: Math.min(100, (dailyMinutes / studyGoals.dailyMinutes) * 100)
      },
      weekly: {
        current: weeklyMinutes,
        goal: studyGoals.weeklyMinutes,
        percentage: Math.min(100, (weeklyMinutes / studyGoals.weeklyMinutes) * 100)
      },
      monthly: {
        current: monthlyMinutes,
        goal: studyGoals.monthlyMinutes,
        percentage: Math.min(100, (monthlyMinutes / studyGoals.monthlyMinutes) * 100)
      }
    };
  }, [timerSessions, studyGoals]);

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-4">
        <Target size={16} className="text-purple-400" />
        Цели за учене
      </h3>

      <div className="flex justify-around items-start">
        <ProgressRing
          percentage={progress.daily.percentage}
          size={80}
          strokeWidth={6}
          color="#3b82f6"
          label="Днес"
          current={progress.daily.current}
          goal={progress.daily.goal}
        />
        <ProgressRing
          percentage={progress.weekly.percentage}
          size={80}
          strokeWidth={6}
          color="#8b5cf6"
          label="Седмица"
          current={progress.weekly.current}
          goal={progress.weekly.goal}
        />
        <ProgressRing
          percentage={progress.monthly.percentage}
          size={80}
          strokeWidth={6}
          color="#06b6d4"
          label="Месец"
          current={progress.monthly.current}
          goal={progress.monthly.goal}
        />
      </div>
    </div>
  );
}
