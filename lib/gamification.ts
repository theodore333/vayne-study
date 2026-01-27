import { Achievement, UserProgress, TopicStatus, LEVEL_THRESHOLDS, XP_REWARDS, Subject } from './types';
import { getTodayString } from './algorithms';

// Achievement Definitions
export const ACHIEVEMENT_DEFINITIONS: {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (progress: UserProgress, subjects: Subject[], streak: number) => boolean;
}[] = [
  // First Steps
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Завърши първата си тема',
    icon: '🩸',
    check: (p) => p.stats.topicsCompleted >= 1
  },
  {
    id: 'first_green',
    name: 'Зелена Светлина',
    description: 'Първа зелена тема',
    icon: '🟢',
    check: (p) => p.stats.greenTopics >= 1
  },
  {
    id: 'first_quiz',
    name: 'Quiz Time',
    description: 'Направи първия си тест',
    icon: '❓',
    check: (p) => p.stats.quizzesTaken >= 1
  },

  // Streak Achievements
  {
    id: 'streak_3',
    name: 'Warming Up',
    description: '3 дни поредни',
    icon: '🔥',
    check: (_, __, streak) => streak >= 3
  },
  {
    id: 'streak_7',
    name: 'On Fire',
    description: '7 дни поредни',
    icon: '🔥🔥',
    check: (_, __, streak) => streak >= 7
  },
  {
    id: 'streak_14',
    name: 'Unstoppable',
    description: '14 дни поредни',
    icon: '💥',
    check: (_, __, streak) => streak >= 14
  },
  {
    id: 'streak_30',
    name: 'Legendary',
    description: '30 дни поредни',
    icon: '⚡',
    check: (_, __, streak) => streak >= 30
  },

  // Topic Milestones
  {
    id: 'topics_10',
    name: 'Getting Started',
    description: '10 теми завършени',
    icon: '📝',
    check: (p) => p.stats.topicsCompleted >= 10
  },
  {
    id: 'topics_50',
    name: 'Halfway There',
    description: '50 теми завършени',
    icon: '📚',
    check: (p) => p.stats.topicsCompleted >= 50
  },
  {
    id: 'topics_100',
    name: 'Century',
    description: '100 теми завършени',
    icon: '💯',
    check: (p) => p.stats.topicsCompleted >= 100
  },
  {
    id: 'topics_250',
    name: 'Scholar',
    description: '250 теми завършени',
    icon: '🎓',
    check: (p) => p.stats.topicsCompleted >= 250
  },

  // Green Topics
  {
    id: 'green_10',
    name: 'Green Machine',
    description: '10 зелени теми',
    icon: '🌱',
    check: (p) => p.stats.greenTopics >= 10
  },
  {
    id: 'green_25',
    name: 'Forest',
    description: '25 зелени теми',
    icon: '🌲',
    check: (p) => p.stats.greenTopics >= 25
  },
  {
    id: 'green_50',
    name: 'Jungle',
    description: '50 зелени теми',
    icon: '🌳',
    check: (p) => p.stats.greenTopics >= 50
  },

  // Quiz Achievements
  {
    id: 'quiz_10',
    name: 'Quiz Enthusiast',
    description: '10 теста направени',
    icon: '📋',
    check: (p) => p.stats.quizzesTaken >= 10
  },
  {
    id: 'quiz_50',
    name: 'Quiz Master',
    description: '50 теста направени',
    icon: '🧪',
    check: (p) => p.stats.quizzesTaken >= 50
  },
  {
    id: 'perfect_5',
    name: 'Perfectionist',
    description: '5 перфектни теста',
    icon: '✨',
    check: (p) => p.stats.perfectQuizzes >= 5
  },
  {
    id: 'perfect_20',
    name: 'Flawless',
    description: '20 перфектни теста',
    icon: '💎',
    check: (p) => p.stats.perfectQuizzes >= 20
  },

  // Subject Mastery
  {
    id: 'subject_master',
    name: 'Subject Master',
    description: '100% зелен предмет',
    icon: '🏅',
    check: (_, subjects) => subjects.some(s =>
      s.topics.length > 0 && s.topics.every(t => t.status === 'green')
    )
  },

  // Level Achievements
  {
    id: 'level_5',
    name: 'Rising Star',
    description: 'Достигни ниво 5',
    icon: '⭐',
    check: (p) => p.level >= 5
  },
  {
    id: 'level_7',
    name: 'Elite',
    description: 'Достигни ниво 7',
    icon: '🌟',
    check: (p) => p.level >= 7
  },
  {
    id: 'vayne_mode',
    name: 'VAYNE MODE',
    description: 'Достигни максимално ниво',
    icon: '⚡👑',
    check: (p) => p.level >= 9
  },

  // XP Milestones
  {
    id: 'xp_1000',
    name: 'XP Hunter',
    description: '1,000 XP събрани',
    icon: '💰',
    check: (p) => p.totalXpEarned >= 1000
  },
  {
    id: 'xp_10000',
    name: 'XP Lord',
    description: '10,000 XP събрани',
    icon: '💎',
    check: (p) => p.totalXpEarned >= 10000
  },

  // Combo
  {
    id: 'combo_5',
    name: 'Combo Starter',
    description: '5x комбо',
    icon: '🔗',
    check: (p) => p.combo.count >= 5
  },
  {
    id: 'combo_10',
    name: 'Combo King',
    description: '10x комбо',
    icon: '⛓️',
    check: (p) => p.combo.count >= 10
  },
];

// Calculate level from XP
export function calculateLevel(xp: number): number {
  let level = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp >= threshold.xp) {
      level = threshold.level;
    } else {
      break;
    }
  }
  return level;
}

// Get level info
export function getLevelInfo(level: number) {
  return LEVEL_THRESHOLDS.find(l => l.level === level) || LEVEL_THRESHOLDS[0];
}

// Get XP needed for next level
export function getXpForNextLevel(currentXp: number): { current: number; needed: number; progress: number } {
  const currentLevel = calculateLevel(currentXp);
  const currentThreshold = LEVEL_THRESHOLDS.find(l => l.level === currentLevel);
  const nextThreshold = LEVEL_THRESHOLDS.find(l => l.level === currentLevel + 1);

  if (!nextThreshold) {
    // Max level
    return { current: currentXp, needed: currentXp, progress: 100 };
  }

  const currentLevelXp = currentThreshold?.xp || 0;
  const xpInCurrentLevel = currentXp - currentLevelXp;
  const xpNeededForLevel = nextThreshold.xp - currentLevelXp;
  const progress = Math.round((xpInCurrentLevel / xpNeededForLevel) * 100);

  return {
    current: xpInCurrentLevel,
    needed: xpNeededForLevel,
    progress
  };
}

// Calculate XP for topic status change
export function calculateTopicXp(oldStatus: TopicStatus, newStatus: TopicStatus, comboMultiplier: number): number {
  let baseXp = 0;

  if (newStatus === 'green') {
    if (oldStatus === 'gray') {
      baseXp = XP_REWARDS.topicAnyToGreen;
    } else if (oldStatus === 'yellow') {
      baseXp = XP_REWARDS.topicYellowToGreen;
    } else if (oldStatus === 'orange') {
      baseXp = XP_REWARDS.topicOrangeToYellow + XP_REWARDS.topicYellowToGreen;
    }
  } else if (newStatus === 'yellow' && (oldStatus === 'gray' || oldStatus === 'orange')) {
    baseXp = oldStatus === 'gray'
      ? XP_REWARDS.topicGrayToOrange + XP_REWARDS.topicOrangeToYellow
      : XP_REWARDS.topicOrangeToYellow;
  } else if (newStatus === 'orange' && oldStatus === 'gray') {
    baseXp = XP_REWARDS.topicGrayToOrange;
  }

  // Apply combo multiplier - only add bonus when actually in a combo (3+ actions)
  const comboBonus = comboMultiplier > 1.0 ? Math.floor(comboMultiplier * XP_REWARDS.comboBonus) : 0;
  return baseXp + comboBonus;
}

// Calculate XP for quiz
export function calculateQuizXp(score: number, comboMultiplier: number): number {
  let baseXp = XP_REWARDS.quizComplete;

  if (score === 100) {
    baseXp = XP_REWARDS.quizPerfect;
  } else if (score >= 85) {
    baseXp = XP_REWARDS.quizGreat;
  } else if (score >= 70) {
    baseXp = XP_REWARDS.quizGood;
  }

  // Only add combo bonus when actually in a combo (3+ actions)
  const comboBonus = comboMultiplier > 1.0 ? Math.floor(comboMultiplier * XP_REWARDS.comboBonus) : 0;
  return baseXp + comboBonus;
}

// Update combo (actions within 30 minutes increase combo)
export function updateCombo(lastActionTime: string | null, currentCount: number): { count: number; lastActionTime: string } {
  const now = new Date();
  const nowString = now.toISOString();

  if (!lastActionTime) {
    return { count: 1, lastActionTime: nowString };
  }

  const lastTime = new Date(lastActionTime);
  const diffMinutes = (now.getTime() - lastTime.getTime()) / (1000 * 60);

  // Combo continues if action within 30 minutes
  if (diffMinutes <= 30) {
    return { count: currentCount + 1, lastActionTime: nowString };
  }

  // Combo resets
  return { count: 1, lastActionTime: nowString };
}

// Get combo multiplier (for display)
export function getComboMultiplier(comboCount: number): number {
  if (comboCount >= 10) return 2.0;
  if (comboCount >= 5) return 1.5;
  if (comboCount >= 3) return 1.2;
  return 1.0;
}

// Check and unlock new achievements
export function checkAchievements(
  progress: UserProgress,
  subjects: Subject[],
  streak: number
): Achievement[] {
  const newAchievements: Achievement[] = [];
  const unlockedIds = new Set(progress.achievements.map(a => a.id));

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (!unlockedIds.has(def.id) && def.check(progress, subjects, streak)) {
      newAchievements.push({
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        unlockedAt: getTodayString()
      });
    }
  }

  return newAchievements;
}

// Default user progress
export const defaultUserProgress: UserProgress = {
  xp: 0,
  level: 1,
  totalXpEarned: 0,
  achievements: [],
  combo: {
    count: 0,
    lastActionTime: null
  },
  stats: {
    topicsCompleted: 0,
    quizzesTaken: 0,
    perfectQuizzes: 0,
    greenTopics: 0,
    longestStreak: 0
  }
};

// Calculate daily workload (topics) based on exam dates
export function calculateDailyWorkload(
  subjects: Subject[],
  dailyStatus: { sick: boolean; holiday: boolean }
): { totalTopics: number; bySubject: { subjectId: string; topics: number; daysLeft: number; urgency: 'critical' | 'high' | 'medium' | 'low' }[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bySubject: { subjectId: string; topics: number; daysLeft: number; urgency: 'critical' | 'high' | 'medium' | 'low' }[] = [];

  for (const subject of subjects) {
    if (!subject.examDate) continue;

    const examDate = new Date(subject.examDate);
    examDate.setHours(0, 0, 0, 0);
    const daysLeft = Math.max(1, Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Count non-green topics
    const remainingTopics = subject.topics.filter(t => t.status !== 'green').length;
    if (remainingTopics === 0) continue;

    // Calculate topics per day needed
    let topicsPerDay = Math.ceil(remainingTopics / daysLeft);

    // Urgency adjustments
    let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (daysLeft <= 3) {
      urgency = 'critical';
      topicsPerDay = Math.max(topicsPerDay, Math.ceil(remainingTopics / 3)); // At least finish in 3 days
    } else if (daysLeft <= 7) {
      urgency = 'high';
      topicsPerDay = Math.max(topicsPerDay, 3); // At least 3 per day
    } else if (daysLeft <= 14) {
      urgency = 'medium';
      topicsPerDay = Math.max(topicsPerDay, 2); // At least 2 per day
    }

    // Cap at reasonable maximum
    topicsPerDay = Math.min(topicsPerDay, 10);

    bySubject.push({
      subjectId: subject.id,
      topics: topicsPerDay,
      daysLeft,
      urgency
    });
  }

  // Sort by urgency
  bySubject.sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });

  // Calculate total with modifiers
  let totalTopics = bySubject.reduce((sum, s) => sum + s.topics, 0);

  // Apply sick/holiday modifiers
  if (dailyStatus.sick) totalTopics = Math.ceil(totalTopics * 0.5);
  if (dailyStatus.holiday) totalTopics = Math.ceil(totalTopics * 0.5);
  if (dailyStatus.sick && dailyStatus.holiday) totalTopics = Math.ceil(totalTopics * 0.25);

  // Minimum 1 topic per day if there are pending topics
  if (bySubject.length > 0 && totalTopics < 1) totalTopics = 1;

  return { totalTopics, bySubject };
}
