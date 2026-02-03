import { ClassType, TopicStatus, TopicSize, ProjectType, ProjectCategory, ProjectPriority, AcademicEventType } from './types';

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

// New material quota - guarantees progress with gray topics
export const NEW_MATERIAL_QUOTA = 0.25; // 25% of daily capacity reserved for gray topics

// Adaptive decay thresholds based on mastery (avgGrade)
// Higher mastery = longer intervals before decay warning
export const DECAY_THRESHOLDS = [
  { minGrade: 95, warningDays: 21 },  // Excellent mastery - can wait longer
  { minGrade: 85, warningDays: 16 },  // Very good - moderate interval
  { minGrade: 70, warningDays: 12 },  // Good - more frequent review
  { minGrade: 50, warningDays: 8 },   // Weak - needs soon
  { minGrade: 0, warningDays: 5 }     // Critical - urgent review
];

// Updated decay rules with longer intervals (spaced repetition style)
export const DECAY_RULES = {
  green: [
    { days: 28, newStatus: 'orange' as TopicStatus },  // was 18
    { days: 18, newStatus: 'yellow' as TopicStatus }   // was 10
  ],
  yellow: [
    { days: 28, newStatus: 'gray' as TopicStatus },    // was 14
    { days: 14, newStatus: 'orange' as TopicStatus }   // was 7
  ],
  orange: [
    { days: 18, newStatus: 'gray' as TopicStatus }     // was 12
  ],
  gray: []
};

export const STORAGE_KEY = 'vayne-command-center';

export const NAV_ITEMS = [
  { href: '/', label: 'Табло', icon: 'LayoutDashboard' },
  { href: '/subjects', label: 'Предмети', icon: 'BookOpen' },
  { href: '/projects', label: 'Проекти', icon: 'Rocket' },
  { href: '/schedule', label: 'Седмичен график', icon: 'Calendar' },
  { href: '/today', label: 'Днешен план', icon: 'Target' },
  { href: '/prediction', label: 'Прогноза', icon: 'TrendingUp' }
];

// ================ DEVELOPMENT PROJECTS (Phase 1: Vayne Doctor) ================

export const PROJECT_TYPE_CONFIG: Record<ProjectType, {
  label: string;
  icon: string;
  color: string;
}> = {
  course: { label: 'Курс', icon: '🎓', color: '#3b82f6' },
  book: { label: 'Книга', icon: '📚', color: '#8b5cf6' },
  skill: { label: 'Умение', icon: '⚡', color: '#f59e0b' },
  certification: { label: 'Сертификат', icon: '📜', color: '#22c55e' },
  other: { label: 'Друго', icon: '📦', color: '#64748b' }
};

export const PROJECT_CATEGORY_CONFIG: Record<ProjectCategory, {
  label: string;
  color: string;
}> = {
  'meta-learning': { label: 'Мета-учене', color: '#ec4899' },
  'productivity': { label: 'Продуктивност', color: '#06b6d4' },
  'clinical-skill': { label: 'Клинични умения', color: '#ef4444' },
  'research': { label: 'Изследвания', color: '#8b5cf6' },
  'language': { label: 'Език', color: '#22c55e' },
  'career': { label: 'Кариера', color: '#f59e0b' },
  'wellbeing': { label: 'Здраве', color: '#14b8a6' },
  'other': { label: 'Друго', color: '#64748b' }
};

export const PROJECT_PRIORITY_CONFIG: Record<ProjectPriority, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  high: { label: 'Висок', color: '#ef4444', bgColor: '#450a0a' },
  medium: { label: 'Среден', color: '#f59e0b', bgColor: '#451a03' },
  low: { label: 'Нисък', color: '#64748b', bgColor: '#1e293b' }
};

export const MEDICAL_SPECIALTIES = [
  'Вътрешни болести', 'Хирургия', 'Педиатрия', 'Акушерство и гинекология',
  'Психиатрия', 'Неврология', 'Кардиология', 'Ортопедия', 'Дерматология',
  'Офталмология', 'УНГ', 'Анестезиология', 'Спешна медицина', 'Обща медицина',
  'Радиология', 'Патология', 'Онкология', 'Урология', 'Ендокринология',
  'Гастроентерология', 'Пулмология', 'Нефрология', 'Ревматология', 'Инфекциозни болести'
];

// Academic Events Configuration
export const ACADEMIC_EVENT_CONFIG: Record<AcademicEventType, {
  label: string;
  labelShort: string;
  icon: string;
  color: string;
  defaultWeight: number;
  urgencyDays: { high: number; medium: number };
}> = {
  colloquium: {
    label: 'Колоквиум',
    labelShort: 'Колокв.',
    icon: '📋',
    color: '#a78bfa',
    defaultWeight: 1.0,
    urgencyDays: { high: 5, medium: 14 }
  },
  control_test: {
    label: 'Контролно',
    labelShort: 'Контр.',
    icon: '✅',
    color: '#f472b6',
    defaultWeight: 0.8,
    urgencyDays: { high: 3, medium: 7 }
  },
  practical_exam: {
    label: 'Практически изпит',
    labelShort: 'Практ.',
    icon: '🔬',
    color: '#4ade80',
    defaultWeight: 1.0,
    urgencyDays: { high: 5, medium: 10 }
  },
  seminar: {
    label: 'Семинар',
    labelShort: 'Сем.',
    icon: '📚',
    color: '#38bdf8',
    defaultWeight: 0.5,
    urgencyDays: { high: 2, medium: 5 }
  },
  other: {
    label: 'Друго',
    labelShort: 'Друго',
    icon: '📌',
    color: '#94a3b8',
    defaultWeight: 0.5,
    urgencyDays: { high: 3, medium: 7 }
  }
};
