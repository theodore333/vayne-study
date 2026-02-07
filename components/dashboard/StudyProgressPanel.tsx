'use client';

import GoalProgressRings from './GoalProgressRings';
import StreakCalendar from './StreakCalendar';
import { TimerSession } from '@/lib/types';

interface StudyProgressPanelProps {
  timerSessions: TimerSession[];
  studyGoals: {
    dailyMinutes: number;
    weeklyMinutes: number;
    monthlyMinutes: number;
  };
  dailyGoalMinutes: number;
  currentStreak: number;
  longestStreak: number;
}

export default function StudyProgressPanel({
  timerSessions,
  studyGoals,
  dailyGoalMinutes,
  currentStreak,
  longestStreak,
}: StudyProgressPanelProps) {
  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
      <GoalProgressRings
        timerSessions={timerSessions}
        studyGoals={studyGoals}
        compact
      />
      <div className="border-t border-slate-700/50 my-4" />
      <StreakCalendar
        timerSessions={timerSessions}
        dailyGoalMinutes={dailyGoalMinutes}
        currentStreak={currentStreak}
        longestStreak={longestStreak}
        compact
      />
    </div>
  );
}
