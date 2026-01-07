import { ClassType, TopicStatus, TopicSize } from './types';

export const STATUS_CONFIG: Record<TopicStatus, {
  bg: string;
  border: string;
  text: string;
  label: string;
  emoji: string;
  weight: number;
}> = {
  gray: { bg: '#1f2937', border: '#374151', text: '#6b7280', label: 'Незапочната', emoji: '⚪', weight: 0 },
  orange: { bg: '#431407', border: '#9a3412', text: '#fb923c', label: 'В процес', emoji: '🟠', weight: 0.3 },
  yellow: { bg: '#422006', border: '#a16207', text: '#fbbf24', label: 'Научена', emoji: '🟡', weight: 0.7 },
  green: { bg: '#052e16', border: '#166534', text: '#4ade80', label: 'Солидна', emoji: '🟢', weight: 1.0 }
};

export const CLASS_TYPES: Record<ClassType, {
  label: string;
  color: string;
  icon: string;
  prepRequired: boolean;
}> = {
  exercise: { label: 'Упражнение', color: '#f97316', icon: '✏️', prepRequired: true }
};

export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899'
];

export const DAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];
export const DAYS_SHORT = ['Пон', 'Вт', 'Ср', 'Чет', 'Пет', 'Съб', 'Нед'];

export const MOTIVATIONAL_MESSAGES = {
  low: [
    "💪 Време е за Vayne mode! Всеки ден по малко = голям резултат.",
    "🎯 Не се отчайвай — започни с 2-3 теми днес.",
    "⚡ Дисциплината побеждава мотивацията. Започни СЕГА."
  ],
  medium: [
    "📈 Добър прогрес! Още малко усилие и си на 5+.",
    "🔥 Momentum-ът е на твоя страна. Не спирай!",
    "💡 Focus на слабите теми = максимален ROI."
  ],
  high: [
    "🏆 Отличен прогрес! Шестицата е на една ръка разстояние.",
    "⭐ Vayne mode ACTIVATED. Продължавай така!",
    "🎓 При това темпо — изпитът е твой."
  ]
};

// Smart Scheduling: Topic Size Configuration
export const TOPIC_SIZE_CONFIG: Record<TopicSize, {
  label: string;
  short: string;
  color: string;
  bgColor: string;
  crunchBonus: number;
  minutes: number;
}> = {
  small: { label: 'Малка', short: 'S', color: '#4ade80', bgColor: '#052e16', crunchBonus: 3, minutes: 15 },
  medium: { label: 'Средна', short: 'M', color: '#fbbf24', bgColor: '#422006', crunchBonus: 1, minutes: 30 },
  large: { label: 'Голяма', short: 'L', color: '#ef4444', bgColor: '#450a0a', crunchBonus: 0, minutes: 60 }
};

// Smart Scheduling: Crunch Mode Thresholds
export const CRUNCH_MODE_THRESHOLDS = {
  workloadPerDayHigh: 5,       // Activate when > 5 topics/day needed
  daysUntilExamCritical: 7,    // Within 7 days of exam
  workloadPerDayCritical: 3    // And > 3 topics/day in that period
};

export const DECAY_RULES = {
  green: [
    { days: 18, newStatus: 'orange' as TopicStatus },
    { days: 10, newStatus: 'yellow' as TopicStatus }
  ],
  yellow: [
    { days: 14, newStatus: 'gray' as TopicStatus },
    { days: 7, newStatus: 'orange' as TopicStatus }
  ],
  orange: [
    { days: 12, newStatus: 'gray' as TopicStatus }
  ],
  gray: []
};

export const STORAGE_KEY = 'vayne-command-center';

export const NAV_ITEMS = [
  { href: '/', label: 'Табло', icon: 'LayoutDashboard' },
  { href: '/subjects', label: 'Предмети', icon: 'BookOpen' },
  { href: '/schedule', label: 'Седмичен график', icon: 'Calendar' },
  { href: '/today', label: 'Днешен план', icon: 'Target' },
  { href: '/prediction', label: 'Прогноза', icon: 'TrendingUp' }
];
