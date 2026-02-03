import { Subject, TimerSession, UserProgress } from './types';
import { calculateRetrievability, getDaysUntilReview } from './algorithms';

// Helper to extract date string from TimerSession
function getSessionDate(session: TimerSession): string {
  if (!session.startTime) return '';
  return session.startTime.split('T')[0];
}

// ============ Study Time Analytics ============

interface DailyStudyData {
  date: string;
  minutes: number;
  goal: number;
  sessions: number;
}

export function getStudyTimeByDay(
  sessions: TimerSession[],
  dailyGoalMinutes: number,
  days: number = 30
): DailyStudyData[] {
  const now = new Date();
  const result: DailyStudyData[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const daySessions = sessions.filter(s => {
      if (!s.startTime) return false;
      const sessionDate = s.startTime.split('T')[0];
      return sessionDate === dateStr;
    });
    const minutes = daySessions.reduce((sum, s) => sum + s.duration, 0);

    result.push({
      date: dateStr,
      minutes,
      goal: dailyGoalMinutes,
      sessions: daySessions.length
    });
  }

  return result;
}

interface SubjectStudyData {
  name: string;
  color: string;
  minutes: number;
  percentage: number;
}

export function getStudyTimeBySubject(
  sessions: TimerSession[],
  subjects: Subject[]
): SubjectStudyData[] {
  const subjectMap = new Map(subjects.map(s => [s.id, s]));
  const totals = new Map<string, number>();

  sessions.forEach(session => {
    const current = totals.get(session.subjectId) || 0;
    totals.set(session.subjectId, current + session.duration);
  });

  const totalMinutes = Array.from(totals.values()).reduce((a, b) => a + b, 0);

  return Array.from(totals.entries())
    .map(([subjectId, minutes]) => {
      const subject = subjectMap.get(subjectId);
      return {
        name: subject?.name || 'Неизвестен',
        color: subject?.color || '#666',
        minutes,
        percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

interface HourlyData {
  hour: number;
  dayOfWeek: number;
  minutes: number;
  sessions: number;
}

export function getStudyHeatmap(sessions: TimerSession[]): HourlyData[] {
  const data: HourlyData[] = [];

  // Initialize all slots
  for (let day = 0; day < 7; day++) {
    for (let hour = 6; hour < 24; hour++) {
      data.push({ hour, dayOfWeek: day, minutes: 0, sessions: 0 });
    }
  }

  sessions.forEach(session => {
    if (!session.startTime) return;

    const date = new Date(session.startTime);
    const hour = date.getHours();
    const dayOfWeek = date.getDay(); // 0 = Sunday

    if (hour >= 6 && hour < 24) {
      const slot = data.find(d => d.hour === hour && d.dayOfWeek === dayOfWeek);
      if (slot) {
        slot.minutes += session.duration;
        slot.sessions += 1;
      }
    }
  });

  return data;
}

// ============ Progress Analytics ============

interface TopicStatusCount {
  date: string;
  gray: number;
  yellow: number;
  green: number;
  total: number;
}

export function getTopicStatusTimeline(
  subjects: Subject[],
  days: number = 30
): TopicStatusCount[] {
  // Since we don't have statusHistory yet, we'll show current distribution
  // This will be enhanced when statusHistory is added
  const allTopics = subjects.flatMap(s => s.topics);

  const gray = allTopics.filter(t => t.status === 'gray').length;
  const yellow = allTopics.filter(t => t.status === 'yellow').length;
  const green = allTopics.filter(t => t.status === 'green').length;

  const now = new Date();
  const result: TopicStatusCount[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    result.push({
      date: date.toISOString().split('T')[0],
      gray,
      yellow,
      green,
      total: gray + yellow + green
    });
  }

  return result;
}

interface QuizScoreData {
  range: string;
  count: number;
}

export function getQuizScoreDistribution(subjects: Subject[]): QuizScoreData[] {
  const ranges = [
    { range: '0-20%', min: 0, max: 20, count: 0 },
    { range: '21-40%', min: 21, max: 40, count: 0 },
    { range: '41-60%', min: 41, max: 60, count: 0 },
    { range: '61-80%', min: 61, max: 80, count: 0 },
    { range: '81-100%', min: 81, max: 100, count: 0 },
  ];

  subjects.forEach(subject => {
    subject.topics.forEach(topic => {
      topic.quizHistory?.forEach(quiz => {
        const range = ranges.find(r => quiz.score >= r.min && quiz.score <= r.max);
        if (range) range.count++;
      });
    });
  });

  return ranges.map(r => ({ range: r.range, count: r.count }));
}

interface BloomData {
  level: string;
  count: number;
  color: string;
}

export function getBloomDistribution(subjects: Subject[]): BloomData[] {
  const levels: Record<string, { count: number; color: string }> = {
    'remember': { count: 0, color: '#ef4444' },
    'understand': { count: 0, color: '#f97316' },
    'apply': { count: 0, color: '#eab308' },
    'analyze': { count: 0, color: '#22c55e' },
    'evaluate': { count: 0, color: '#3b82f6' },
    'create': { count: 0, color: '#8b5cf6' },
  };

  const bloomNames: Record<string, string> = {
    'remember': 'Запомняне',
    'understand': 'Разбиране',
    'apply': 'Прилагане',
    'analyze': 'Анализ',
    'evaluate': 'Оценка',
    'create': 'Създаване',
  };

  subjects.forEach(subject => {
    subject.topics.forEach(topic => {
      const level = topic.currentBloomLevel || 'remember';
      if (levels[level]) levels[level].count++;
    });
  });

  return Object.entries(levels).map(([level, data]) => ({
    level: bloomNames[level] || level,
    count: data.count,
    color: data.color
  }));
}

// ============ FSRS Analytics ============

interface FSRSData {
  topic: string;
  subjectName: string;
  subjectColor: string;
  retrievability: number;
  stability: number;
  nextReview: string | null;
}

export function getFSRSOverview(subjects: Subject[]): FSRSData[] {
  const data: FSRSData[] = [];

  subjects.forEach(subject => {
    subject.topics.forEach(topic => {
      if (topic.fsrs) {
        const retrievability = calculateRetrievability(topic.fsrs);
        const daysUntil = getDaysUntilReview(topic.fsrs);
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + Math.ceil(daysUntil));

        data.push({
          topic: topic.name,
          subjectName: subject.name,
          subjectColor: subject.color,
          retrievability,
          stability: topic.fsrs.stability,
          nextReview: daysUntil > 0 ? nextReviewDate.toISOString().split('T')[0] : null
        });
      }
    });
  });

  return data.sort((a, b) => a.retrievability - b.retrievability);
}

// ============ Streak & Engagement ============

interface StreakDay {
  date: string;
  studied: boolean;
  minutes: number;
  intensity: 0 | 1 | 2 | 3 | 4; // For heatmap coloring
}

export function getStudyStreak(sessions: TimerSession[], days: number = 90): StreakDay[] {
  const now = new Date();
  const result: StreakDay[] = [];

  // Find max minutes for intensity calculation
  const minutesByDay = new Map<string, number>();
  sessions.forEach(s => {
    const sessionDate = getSessionDate(s);
    if (!sessionDate) return;
    const current = minutesByDay.get(sessionDate) || 0;
    minutesByDay.set(sessionDate, current + s.duration);
  });
  const maxMinutes = Math.max(...Array.from(minutesByDay.values()), 1);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const minutes = minutesByDay.get(dateStr) || 0;
    const studied = minutes > 0;

    // Calculate intensity (0-4 scale)
    let intensity: 0 | 1 | 2 | 3 | 4 = 0;
    if (minutes > 0) {
      const ratio = minutes / maxMinutes;
      if (ratio > 0.75) intensity = 4;
      else if (ratio > 0.5) intensity = 3;
      else if (ratio > 0.25) intensity = 2;
      else intensity = 1;
    }

    result.push({ date: dateStr, studied, minutes, intensity });
  }

  return result;
}

export function getCurrentStreak(sessions: TimerSession[]): number {
  const studyDays = new Set(sessions.map(s => getSessionDate(s)).filter(d => d));
  let streak = 0;
  const now = new Date();

  for (let i = 0; i < 365; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    if (studyDays.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      // Allow today to not be studied yet
      break;
    }
  }

  return streak;
}

export function getLongestStreak(sessions: TimerSession[]): number {
  const studyDays = new Set(sessions.map(s => getSessionDate(s)).filter(d => d));
  const sortedDays = Array.from(studyDays).sort();

  if (sortedDays.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

// ============ Summary Statistics ============

export interface AnalyticsSummary {
  totalStudyMinutes: number;
  totalSessions: number;
  averageSessionLength: number;
  currentStreak: number;
  longestStreak: number;
  totalTopics: number;
  masteredTopics: number;
  reviewingTopics: number;
  newTopics: number;
  totalQuizzes: number;
  averageQuizScore: number;
  xpTotal: number;
  level: number;
}

export function getAnalyticsSummary(
  sessions: TimerSession[],
  subjects: Subject[],
  userProgress: UserProgress
): AnalyticsSummary {
  const totalStudyMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
  const totalSessions = sessions.length;

  const allTopics = subjects.flatMap(s => s.topics);
  const totalQuizzes = allTopics.reduce((sum, t) => sum + (t.quizHistory?.length || 0), 0);

  let totalScore = 0;
  let quizCount = 0;
  allTopics.forEach(t => {
    t.quizHistory?.forEach(q => {
      totalScore += q.score;
      quizCount++;
    });
  });

  return {
    totalStudyMinutes,
    totalSessions,
    averageSessionLength: totalSessions > 0 ? Math.round(totalStudyMinutes / totalSessions) : 0,
    currentStreak: getCurrentStreak(sessions),
    longestStreak: getLongestStreak(sessions),
    totalTopics: allTopics.length,
    masteredTopics: allTopics.filter(t => t.status === 'green').length,
    reviewingTopics: allTopics.filter(t => t.status === 'yellow').length,
    newTopics: allTopics.filter(t => t.status === 'gray').length,
    totalQuizzes,
    averageQuizScore: quizCount > 0 ? Math.round(totalScore / quizCount) : 0,
    xpTotal: userProgress.xp,
    level: userProgress.level
  };
}

// ============ Weekly Trends ============

interface WeeklyData {
  week: string;
  minutes: number;
  sessions: number;
  quizzes: number;
}

export function getWeeklyTrends(
  sessions: TimerSession[],
  subjects: Subject[],
  weeks: number = 8
): WeeklyData[] {
  const result: WeeklyData[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const weekSessions = sessions.filter(s => {
      const sessionDate = getSessionDate(s);
      return sessionDate >= weekStartStr && sessionDate < weekEndStr;
    });
    const minutes = weekSessions.reduce((sum, s) => sum + s.duration, 0);

    // Count quizzes taken in this week
    let quizzes = 0;
    subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        topic.quizHistory?.forEach(quiz => {
          if (quiz.date >= weekStartStr && quiz.date < weekEndStr) {
            quizzes++;
          }
        });
      });
    });

    result.push({
      week: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
      minutes,
      sessions: weekSessions.length,
      quizzes
    });
  }

  return result;
}
