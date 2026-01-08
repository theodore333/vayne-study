// Subject types for adapting quiz generation
export type SubjectType = 'preclinical' | 'clinical' | 'hybrid';

export const SUBJECT_TYPES: { type: SubjectType; name: string; description: string; examples: string }[] = [
  {
    type: 'preclinical',
    name: 'Предклиничен',
    description: 'Фокус върху структури, механизми, теория',
    examples: 'Анатомия, Биохимия, Физиология, Хистология'
  },
  {
    type: 'clinical',
    name: 'Клиничен',
    description: 'Фокус върху диагностика, лечение, пациенти',
    examples: 'Вътрешни, Хирургия, Педиатрия, Акушерство'
  },
  {
    type: 'hybrid',
    name: 'Хибриден',
    description: 'Микс от теория и клинично приложение',
    examples: 'Патология, Фармакология, Патофизиология'
  }
];

export interface Subject {
  id: string;
  name: string;
  color: string;
  subjectType: SubjectType; // NEW: preclinical, clinical, or hybrid
  examDate: string | null;
  examFormat: string | null; // Description of exam format (e.g., "20 теста, 2 казуса, 1 есе")
  topics: Topic[];
  createdAt: string;
}

// Parsed exam format structure
export interface ParsedExamFormat {
  mcq: number;           // Брой MCQ тестове
  openQuestions: number; // Брой отворени въпроси
  cases: number;         // Брой казуси
  essays: number;        // Брой есета
  totalTopics: number;   // Колко теми се падат на изпит (ако е посочено)
  raw: string;           // Original string
}

// Parse exam format string into structured data
export function parseExamFormat(format: string | null): ParsedExamFormat | null {
  if (!format) return null;

  const result: ParsedExamFormat = {
    mcq: 0,
    openQuestions: 0,
    cases: 0,
    essays: 0,
    totalTopics: 0,
    raw: format
  };

  const lower = format.toLowerCase();

  // Parse MCQ/тестове
  const mcqMatch = lower.match(/(\d+)\s*(mcq|тест|теста|тестове|въпрос|въпроса)/);
  if (mcqMatch) result.mcq = parseInt(mcqMatch[1]);

  // Parse open questions
  const openMatch = lower.match(/(\d+)\s*(отворен|отворени|open)/);
  if (openMatch) result.openQuestions = parseInt(openMatch[1]);

  // Parse cases/казуси
  const caseMatch = lower.match(/(\d+)\s*(казус|казуса|казуси|case|cases)/);
  if (caseMatch) result.cases = parseInt(caseMatch[1]);

  // Parse essays/есета
  const essayMatch = lower.match(/(\d+)\s*(есе|есета|essay|essays)/);
  if (essayMatch) result.essays = parseInt(essayMatch[1]);

  // Parse total topics (e.g., "5 теми от 65")
  const topicsMatch = lower.match(/(\d+)\s*(теми|тема|topics?)\s*(от|from)/);
  if (topicsMatch) result.totalTopics = parseInt(topicsMatch[1]);

  return result;
}

// Get question type weights for scoring
export function getQuestionTypeWeights(format: ParsedExamFormat | null): {
  mcqWeight: number;
  openWeight: number;
  caseWeight: number;
  essayWeight: number;
} {
  if (!format) {
    return { mcqWeight: 0.6, openWeight: 0.2, caseWeight: 0.15, essayWeight: 0.05 };
  }

  const total = format.mcq + format.openQuestions + format.cases + format.essays;
  if (total === 0) {
    return { mcqWeight: 0.6, openWeight: 0.2, caseWeight: 0.15, essayWeight: 0.05 };
  }

  // Weight by difficulty: MCQ easiest (1x), Open (1.5x), Cases (2x), Essays (2x)
  const mcqPoints = format.mcq * 1;
  const openPoints = format.openQuestions * 1.5;
  const casePoints = format.cases * 2;
  const essayPoints = format.essays * 2;
  const totalPoints = mcqPoints + openPoints + casePoints + essayPoints || 1;

  return {
    mcqWeight: mcqPoints / totalPoints,
    openWeight: openPoints / totalPoints,
    caseWeight: casePoints / totalPoints,
    essayWeight: essayPoints / totalPoints
  };
}

// Bloom's Taxonomy levels (1-6)
export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const BLOOM_LEVELS: { level: BloomLevel; name: string; nameEn: string; description: string }[] = [
  { level: 1, name: 'Запомняне', nameEn: 'Remember', description: 'Възпроизвеждане на факти и концепции' },
  { level: 2, name: 'Разбиране', nameEn: 'Understand', description: 'Обясняване на идеи и концепции' },
  { level: 3, name: 'Прилагане', nameEn: 'Apply', description: 'Използване на знанията в нови ситуации' },
  { level: 4, name: 'Анализиране', nameEn: 'Analyze', description: 'Разграничаване на връзки и компоненти' },
  { level: 5, name: 'Оценяване', nameEn: 'Evaluate', description: 'Обосноваване на становище или решение' },
  { level: 6, name: 'Създаване', nameEn: 'Create', description: 'Създаване на нов продукт или гледна точка' },
];

export interface QuizResult {
  date: string;
  bloomLevel: BloomLevel;
  score: number; // 0-100
  questionsCount: number;
  correctAnswers: number;
  weight: number; // Quiz length weight: 0.5 (quick), 1.0 (standard), 1.5 (deep), 2.0 (marathon)
}

// Track wrong answers for gap analysis and drill weakness
export interface WrongAnswer {
  question: string;
  userAnswer: string | null;
  correctAnswer: string;
  concept: string;
  bloomLevel: number;
  date: string;
  drillCount: number; // How many times this was drilled
  timeSpent?: number; // Seconds spent on this question
}

export type QuizLengthPreset = 'quick' | 'standard' | 'deep' | 'marathon';

export const QUIZ_LENGTH_PRESETS: Record<QuizLengthPreset, {
  label: string;
  questions: number;
  weight: number;
  description: string;
}> = {
  quick: { label: 'Бърз преговор', questions: 5, weight: 0.5, description: '5 въпроса' },
  standard: { label: 'Стандартен', questions: 12, weight: 1.0, description: '10-15 въпроса' },
  deep: { label: 'Задълбочен', questions: 22, weight: 1.5, description: '20-25 въпроса' },
  marathon: { label: 'Маратон', questions: 35, weight: 2.0, description: '30+ въпроса' }
};

export interface Topic {
  id: string;
  number: number;
  name: string;
  status: TopicStatus;
  lastReview: string | null;
  grades: number[];
  avgGrade: number | null;
  quizCount: number;
  material: string;
  materialImages: string[];
  // Bloom's Taxonomy tracking
  currentBloomLevel: BloomLevel; // Current mastery level
  quizHistory: QuizResult[]; // History of quiz results by Bloom level
  // Reading tracking
  readCount: number; // How many times the topic material was read
  lastRead: string | null; // When the material was last read
  // Smart Scheduling: Size classification
  size: TopicSize | null; // S/M/L classification
  sizeSetBy: 'ai' | 'user' | null; // Who set the size
  // Gap Analysis: Track wrong answers for drilling
  wrongAnswers: WrongAnswer[]; // Recent wrong answers for drill weakness mode
  // Reader Mode: Highlights
  highlights: TextHighlight[]; // Highlighted text passages
}

// Text highlight for reader mode
export interface TextHighlight {
  id: string;
  text: string; // The highlighted text content
  startOffset: number; // Character offset from start of material
  endOffset: number; // End character offset
  color: 'yellow' | 'green' | 'blue' | 'pink'; // Highlight color
  note?: string; // Optional note attached to this highlight
  createdAt: string;
}

export type TopicStatus = 'gray' | 'orange' | 'yellow' | 'green';

// Topic size classification for Smart Scheduling
export type TopicSize = 'small' | 'medium' | 'large';

// Crunch Mode status for high-pressure scheduling
export interface CrunchModeStatus {
  isActive: boolean;
  reason: string;
  urgentSubjects: Array<{
    name: string;
    daysLeft: number;
    workloadPerDay: number;
  }>;
  tips: string[];
}

export interface ScheduleClass {
  id: string;
  subjectId: string;
  day: number;
  time: string;
  type: ClassType;
  room: string;
}

export type ClassType = 'exercise';

export interface DailyStatus {
  date: string;
  sick: boolean;
  holiday: boolean;
}

export interface TimerSession {
  id: string;
  subjectId: string;
  topicId: string | null;
  startTime: string;
  endTime: string | null;
  duration: number;
  rating: number | null;
  pomodorosCompleted?: number; // Number of pomodoro cycles completed in this session
  sessionType?: 'normal' | 'pomodoro'; // Type of timer session
  distractionNote?: string; // Notes about what distracted during the session
}

export interface PomodoroSettings {
  workDuration: number;      // Work duration in minutes (default 25)
  shortBreakDuration: number; // Short break in minutes (default 5)
  longBreakDuration: number;  // Long break in minutes (default 15)
  longBreakAfter: number;     // Long break after N pomodoros (default 4)
  autoStartBreaks: boolean;   // Auto-start break timer
  autoStartWork: boolean;     // Auto-start work after break
  soundEnabled: boolean;      // Play sound on timer end
}

export interface StudyGoals {
  dailyMinutes: number;       // Weekday goal in minutes (default 480 = 8 hours)
  weeklyMinutes: number;      // Weekly goal in minutes (auto-calculated)
  monthlyMinutes: number;     // Monthly goal in minutes (auto-calculated)
  weekendDailyMinutes: number; // Weekend goal in minutes (default same as daily)
  useWeekendHours: boolean;   // Use different hours for weekends
}

export interface AcademicPeriod {
  semesterStart: string | null;  // Semester start date (ISO)
  semesterEnd: string | null;    // Semester end date (ISO)
  sessionStart: string | null;   // Exam session start (ISO)
  sessionEnd: string | null;     // Exam session end (ISO)
}


export interface SemesterGrade {
  id: string;
  semester: number;
  year: number;
  subjectName: string;
  grade: number;
}

export interface GPAData {
  grades: SemesterGrade[];
  targetGPA: number;
}

export interface UsageData {
  dailyCalls: number;
  monthlyCost: number;
  monthlyBudget: number;
  lastReset: string;
}

// Question Bank Types
export type BankQuestionType = 'mcq' | 'open' | 'case_study';

export interface BankQuestion {
  id: string;
  type: BankQuestionType;
  text: string;                    // Въпросът
  options?: string[];              // За MCQ: A, B, C, D
  correctAnswer: string;           // Верен отговор
  explanation?: string;            // Обяснение (ако има)
  linkedTopicIds: string[];        // Свързани теми (AI auto-link)
  caseId?: string;                 // Ако е част от казус
  stats: {
    attempts: number;
    correct: number;
    lastAttempt?: string;          // ISO date of last attempt
  };
}

export interface ClinicalCase {
  id: string;
  description: string;             // Описание на пациента/случая
  questionIds: string[];           // Въпроси към казуса
}

export interface QuestionBank {
  id: string;
  subjectId: string;
  name: string;                    // "Сборник 2024" и т.н.
  questions: BankQuestion[];
  cases: ClinicalCase[];
  uploadedAt: string;
}

// Gamification Types
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string;
}

export interface UserProgress {
  xp: number;
  level: number;
  totalXpEarned: number;
  achievements: Achievement[];
  combo: {
    count: number;
    lastActionTime: string | null;
  };
  stats: {
    topicsCompleted: number;
    quizzesTaken: number;
    perfectQuizzes: number;
    greenTopics: number;
    longestStreak: number;
  };
}

export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, name: 'Студент', icon: '📚' },
  { level: 2, xp: 500, name: 'Редовен', icon: '📖' },
  { level: 3, xp: 1500, name: 'Старателен', icon: '✏️' },
  { level: 4, xp: 3500, name: 'Амбициозен', icon: '🎯' },
  { level: 5, xp: 6500, name: 'Специалист', icon: '🔬' },
  { level: 6, xp: 11000, name: 'Експерт', icon: '🧠' },
  { level: 7, xp: 17500, name: 'Майстор', icon: '🏆' },
  { level: 8, xp: 26000, name: 'Легенда', icon: '👑' },
  { level: 9, xp: 40000, name: 'Vayne Mode', icon: '⚡' },
];

export const XP_REWARDS = {
  topicGrayToOrange: 50,
  topicOrangeToYellow: 75,
  topicYellowToGreen: 100,
  topicAnyToGreen: 150, // Direct to green bonus
  quizComplete: 20,
  quizGood: 30, // ≥70%
  quizGreat: 50, // ≥85%
  quizPerfect: 100, // 100%
  bloomLevelUp: 100,
  streakDay: 20, // × streak multiplier
  comboBonus: 10, // per combo level
};

export interface AppData {
  subjects: Subject[];
  schedule: ScheduleClass[];
  dailyStatus: DailyStatus;
  timerSessions: TimerSession[];
  gpaData: GPAData;
  usageData: UsageData;
  questionBanks: QuestionBank[];
  pomodoroSettings: PomodoroSettings;
  studyGoals: StudyGoals;
  academicPeriod: AcademicPeriod;
  userProgress: UserProgress;
}

export interface PredictedGrade {
  current: number;
  vayne: number;
  improvement: number;
  factors: GradeFactor[];
  tips: string[];
  message: string;
  // Monte Carlo simulation results
  simulation?: {
    bestCase: number;      // Best possible outcome
    worstCase: number;     // Worst possible outcome
    variance: number;      // Standard deviation
    criticalTopics: string[]; // Topics that drag down worst case
    impactTopics: { topicId: string; topicName: string; impact: number }[]; // Topics to prioritize
  };
  // Exam format analysis
  formatAnalysis?: {
    hasCases: boolean;
    hasOpenQuestions: boolean;
    caseWeakness: boolean;   // True if weak at cases
    openWeakness: boolean;   // True if weak at open questions
    formatTip: string;       // Tip based on format
  };
}

export interface GradeFactor {
  name: string;
  value: number;
  maxValue: number;
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface DailyTask {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  type: 'critical' | 'high' | 'medium' | 'normal';
  typeLabel: string;
  description: string;
  topics: Topic[];
  estimatedMinutes: number;
  completed: boolean;
}
