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
  archived?: boolean; // Archived subjects are hidden and excluded from calculations
  deletedAt?: string | null; // Soft delete timestamp - subjects with deletedAt are in trash
  semester?: string; // Optional semester grouping (e.g., "Семестър 1", "2024/2025")
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
  if (mcqMatch) result.mcq = parseInt(mcqMatch[1], 10);

  // Parse open questions
  const openMatch = lower.match(/(\d+)\s*(отворен|отворени|open)/);
  if (openMatch) result.openQuestions = parseInt(openMatch[1], 10);

  // Parse cases/казуси
  const caseMatch = lower.match(/(\d+)\s*(казус|казуса|казуси|case|cases)/);
  if (caseMatch) result.cases = parseInt(caseMatch[1], 10);

  // Parse essays/есета
  const essayMatch = lower.match(/(\d+)\s*(есе|есета|essay|essays)/);
  if (essayMatch) result.essays = parseInt(essayMatch[1], 10);

  // Parse total topics (e.g., "5 теми от 65")
  const topicsMatch = lower.match(/(\d+)\s*(теми|тема|topics?)\s*(от|from)/);
  if (topicsMatch) result.totalTopics = parseInt(topicsMatch[1], 10);

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

// Topic section for organizing theory vs practice
export type TopicSection = 'theoretical' | 'practical';

// FSRS Memory State for spaced repetition
export interface FSRSState {
  stability: number;       // S - how long memory lasts (days), starts at 1
  difficulty: number;      // D - inherent topic difficulty (0.1-1.0)
  lastReview: string;      // ISO date of last review
  reps: number;            // successful review count
  lapses: number;          // times forgotten (score < 60%)
}

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
  // FSRS Spaced Repetition (optional, migrates from old system)
  fsrs?: FSRSState;
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
  // Section: theoretical or practical
  section?: TopicSection;
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
  description?: string;     // Free-text topic/theme of the exercise
  topicIds?: string[];       // Specific topics covered in this exercise
  startDate?: string;        // ISO date - when this class starts (ignore before this date)
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
  vacationMode: boolean;      // Between semesters - reduced workload
  vacationMultiplier: number; // Multiplier for vacation mode (default 0.4 = 40%)
  // FSRS Settings
  fsrsEnabled?: boolean;           // Enable FSRS spaced repetition (default true)
  fsrsTargetRetention?: number;    // Target retrievability 0.7-0.95 (default 0.85)
  fsrsMaxReviewsPerDay?: number;   // Max reviews per day 1-20 (default 8)
  fsrsMaxInterval?: number;        // Max interval in days 30-365 (default 180)
}

export interface AcademicPeriod {
  semesterStart: string | null;  // Semester start date (ISO)
  semesterEnd: string | null;    // Semester end date (ISO)
  sessionStart: string | null;   // Exam session start (ISO)
  sessionEnd: string | null;     // Exam session end (ISO)
  cycleStart: string | null;     // Clinical cycle/rotation start (ISO)
  cycleEnd: string | null;       // Clinical cycle/rotation end (ISO)
}


export interface SemesterGrade {
  id: string;
  semester: number;
  year: number;
  subjectName: string;
  grade: number;
}

export interface StateExam {
  name: string;
  grade: number;
}

export interface GPAData {
  grades: SemesterGrade[];
  targetGPA: number;
  stateExams: StateExam[];
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
  clinicalCaseSessions: ClinicalCaseSession;
  orRoomSessions: ORRoomSession;
  // Phase 1: Vayne Doctor
  developmentProjects: DevelopmentProject[];
  careerProfile: CareerProfile | null;
  // Academic Events (Колоквиуми, Контролни)
  academicEvents: AcademicEvent[];
  // Dashboard Features
  lastOpenedTopic: LastOpenedTopic | null;
  dailyGoals: DailyGoal[];
  // Study Techniques (IcanStudy HUDLE Framework)
  studyTechniques: StudyTechnique[];
  techniquePractices: TechniquePractice[];
  // Sync metadata
  lastModified?: string; // ISO timestamp for cloud merge freshness
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
  type: 'setup' | 'critical' | 'high' | 'medium' | 'normal' | 'project' | 'technique';
  typeLabel: string;
  description: string;
  topics: Topic[];
  estimatedMinutes: number;
  completed: boolean;
  // Project-specific fields (for type='project')
  projectId?: string;
  projectName?: string;
  projectModules?: ProjectModule[];
  // Module FSRS review flag
  isModuleReview?: boolean;
  // Technique practice fields (for type='technique')
  techniqueId?: string;
  techniqueName?: string;
  techniqueIcon?: string;
  techniqueHowToApply?: string;
  // Embedded technique suggestion (shown inside the task card, not as separate task)
  suggestedTechnique?: {
    id: string;
    name: string;
    icon: string;
    slug: string;
    description: string;
    howToApply: string;
  };
}

// Custom daily plan (edited by user)
export interface CustomDailyPlan {
  date: string;  // YYYY-MM-DD
  tasks: DailyTask[];
  isCustomized: boolean;
}

// Weekly review data
export interface WeeklyReviewData {
  lastReviewDate: string;  // YYYY-MM-DD
  userFeedback: {
    overloaded: boolean;
    tooMuchRepetition: boolean;
    enoughNewMaterial: boolean;
  };
  adjustments: {
    decayMultiplier: number;  // 1.0 = default, 1.2 = longer intervals
    quotaAdjustment: number;  // 0 = default, +5 = more new material percentage
  };
}

// ================ INTERACTIVE CLINICAL CASES ================

// Case step identifiers
export type CaseStep =
  | 'presentation'
  | 'history'
  | 'physical_exam'
  | 'investigations'
  | 'ddx'
  | 'confirmation'
  | 'treatment';

export const CASE_STEPS: { step: CaseStep; name: string; icon: string }[] = [
  { step: 'presentation', name: 'Представяне', icon: 'User' },
  { step: 'history', name: 'Анамнеза', icon: 'MessageCircle' },
  { step: 'physical_exam', name: 'Физикален преглед', icon: 'Stethoscope' },
  { step: 'investigations', name: 'Изследвания', icon: 'TestTube' },
  { step: 'ddx', name: 'DDx', icon: 'ListOrdered' },
  { step: 'confirmation', name: 'Диагноза', icon: 'CheckCircle' },
  { step: 'treatment', name: 'Лечение', icon: 'Pill' },
];

// Chat message for history step
export interface CaseMessage {
  id: string;
  role: 'student' | 'patient' | 'system';
  content: string;
  timestamp: string;
}

// Physical exam finding
export interface ExamFinding {
  system: string;
  finding: string;
  isNormal: boolean;
  isRelevant: boolean;
}

// Investigation (lab/imaging)
export interface CaseInvestigation {
  id: string;
  name: string;
  category: 'laboratory' | 'imaging' | 'procedure' | 'other';
  justification: string;
  result: string;
  isAppropriate: boolean;
  feedback?: string;
}

// DDx entry
export interface DifferentialDiagnosis {
  id: string;
  diagnosis: string;
  rank: number;
}

// Treatment plan entry
export interface TreatmentPlanItem {
  id: string;
  category: 'medication' | 'procedure' | 'lifestyle' | 'referral' | 'monitoring';
  description: string;
  dosage?: string;
  duration?: string;
  priority: 'immediate' | 'short_term' | 'long_term';
}

// Step evaluation from AI
export interface StepEvaluation {
  step: CaseStep;
  score: number;
  feedback: string;
  strengths: string[];
  areasToImprove: string[];
  missedPoints?: string[];
  timestamp: string;
  pharmacologyTopics?: Array<{ id: string; name: string; subjectId: string }>;
  pharmacologyFeedback?: string;
  suggestedImages?: SuggestedImage[];
}

export interface SuggestedImage {
  description: string;
  topicId: string;
  subjectId: string;
  type: 'ecg' | 'anatomy' | 'imaging' | 'instrument' | 'pathology';
}

export interface TopicImage {
  id: string;
  topicId: string;
  subjectId: string;
  type: 'ecg' | 'anatomy' | 'imaging' | 'instrument' | 'pathology';
  description: string;
  tags: string[]; // searchable keywords (e.g. ["лапароскопия", "инструменти", "грасер"])
  data: string; // base64 data URI
  createdAt: string;
}

// Case difficulty
export type CaseDifficulty = 'beginner' | 'intermediate' | 'advanced';

// Full Interactive Clinical Case
export interface InteractiveClinicalCase {
  id: string;
  subjectId: string;
  topicId: string;

  // Case metadata
  difficulty: CaseDifficulty;
  specialty: string;
  createdAt: string;
  completedAt: string | null;

  // Patient presentation
  presentation: {
    age: number;
    gender: 'male' | 'female';
    chiefComplaint: string;
    briefHistory: string;
  };

  // Hidden case data (AI-generated, revealed progressively)
  hiddenData: {
    actualDiagnosis: string;
    keyHistoryFindings: string[];
    keyExamFindings: Record<string, ExamFinding>;
    expectedInvestigations: string[];
    investigationImages?: Record<string, string>;
    differentialDiagnoses: string[];
    treatmentPlan: TreatmentPlanItem[];
    relevantPharmacologyTopicIds?: string[];
    relevantPharmacologyTopicNames?: string[];
  };

  // Student's progress and responses
  currentStep: CaseStep;
  historyMessages: CaseMessage[];
  selectedExams: string[];
  examFindings: ExamFinding[];
  orderedInvestigations: CaseInvestigation[];
  studentDdx: DifferentialDiagnosis[];
  finalDiagnosis: string | null;
  treatmentPlan: TreatmentPlanItem[];

  // Evaluations per step
  evaluations: StepEvaluation[];

  // Overall scoring
  overallScore: number | null;
  timeSpentMinutes: number;
}

// Case session state
export interface ClinicalCaseSession {
  activeCaseId: string | null;
  cases: InteractiveClinicalCase[];
  totalCasesCompleted: number;
  averageScore: number;
}

// Available exam systems for physical exam step
export const EXAM_SYSTEMS = [
  { id: 'general', name: 'Общ статус', icon: 'User' },
  { id: 'cardiovascular', name: 'Сърдечносъдова', icon: 'Heart' },
  { id: 'respiratory', name: 'Дихателна', icon: 'Wind' },
  { id: 'abdominal', name: 'Коремна', icon: 'Circle' },
  { id: 'neurological', name: 'Неврологичен', icon: 'Brain' },
  { id: 'musculoskeletal', name: 'Опорно-двигателен', icon: 'Bone' },
  { id: 'skin', name: 'Кожа', icon: 'Droplet' },
  { id: 'lymphatic', name: 'Лимфни възли', icon: 'GitBranch' },
  { id: 'head_neck', name: 'Глава и шия', icon: 'Eye' },
] as const;

// Investigation categories
export const INVESTIGATION_CATEGORIES = {
  laboratory: {
    name: 'Лабораторни',
    tests: [
      'ПКК (CBC)', 'Биохимия', 'Електролити', 'ЧДФ', 'Урина',
      'Кръвна захар', 'Сърдечни маркери', 'Коагулация', 'Щитовидна жлеза',
      'Хемокултура', 'CRP', 'D-димер', 'Кръвно-газов анализ'
    ]
  },
  imaging: {
    name: 'Образна диагностика',
    tests: [
      'Рентген гръден кош', 'Рентген корем', 'КТ глава', 'КТ гръден кош',
      'КТ корем', 'МРТ мозък', 'Ехография корем', 'Ехокардиография',
      'Доплер на съдове'
    ]
  },
  procedure: {
    name: 'Процедури',
    tests: [
      'ЕКГ', 'Лумбална пункция', 'Парацентеза', 'Торакоцентеза',
      'Гастроскопия', 'Колоноскопия', 'Бронхоскопия'
    ]
  },
  other: {
    name: 'Други',
    tests: ['Кожна биопсия', 'Костно-мозъчна биопсия', 'Спирометрия']
  }
} as const;

// ================ OR ROOM SIMULATION ================

export type ORStep = 'briefing' | 'setup' | 'procedure' | 'complications' | 'postop';

export const OR_STEPS: { step: ORStep; name: string }[] = [
  { step: 'briefing', name: 'Брифинг' },
  { step: 'setup', name: 'Подготовка' },
  { step: 'procedure', name: 'Процедура' },
  { step: 'complications', name: 'Усложнение' },
  { step: 'postop', name: 'Постоп' },
];

export interface ORMessage {
  id: string;
  role: 'student' | 'surgeon' | 'system';
  content: string;
  timestamp: string;
}

export interface ORStepEvaluation {
  step: ORStep;
  score: number;
  feedback: string;
  strengths: string[];
  areasToImprove: string[];
  missedPoints?: string[];
  timestamp: string;
  suggestedImages?: SuggestedImage[];
  pharmacologyTopics?: Array<{ id: string; name: string; subjectId: string }>;
  pharmacologyFeedback?: string;
  anatomyTopics?: Array<{ id: string; name: string; subjectId: string }>;
}

export interface InteractiveORCase {
  id: string;
  subjectId: string;
  topicId: string;

  difficulty: CaseDifficulty;
  procedureName: string;
  specialty: string;
  createdAt: string;
  completedAt: string | null;

  patient: {
    age: number;
    gender: 'male' | 'female';
    diagnosis: string;
    indication: string;
    relevantHistory: string;
  };

  hiddenData: {
    procedureSteps: string[];
    expectedAnesthesia: string;
    expectedPositioning: string;
    keyAnatomy: string[];
    expectedComplications: string[];
    complicationScenario: {
      description: string;
      correctResponse: string;
      severity: 'minor' | 'moderate' | 'major';
    };
    postOpOrders: {
      medications: string[];
      monitoring: string[];
      instructions: string[];
    };
    relevantPharmacologyTopicIds?: string[];
    relevantPharmacologyTopicNames?: string[];
    relevantAnatomyTopicIds?: string[];
    relevantAnatomyTopicNames?: string[];
  };

  currentStep: ORStep;
  procedureMessages: ORMessage[];
  complicationMessages: ORMessage[];

  setupChoices: {
    anesthesiaType: string;
    positioning: string;
    teamConfirmed: boolean;
  };
  postOpOrders: {
    medications: string;
    monitoring: string;
    instructions: string;
  };

  evaluations: ORStepEvaluation[];
  overallScore: number | null;
  timeSpentMinutes: number;
}

export interface ORRoomSession {
  activeCaseId: string | null;
  cases: InteractiveORCase[];
  totalCasesCompleted: number;
  averageScore: number;
}

// ================ DEVELOPMENT PROJECTS (Phase 1: Vayne Doctor) ================

export type ProjectType = 'course' | 'book' | 'skill' | 'certification' | 'other';
export type ProjectCategory = 'meta-learning' | 'productivity' | 'clinical-skill' | 'research' | 'language' | 'career' | 'wellbeing' | 'other';
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type ProjectPriority = 'high' | 'medium' | 'low';
export type ModuleStatus = 'locked' | 'available' | 'in_progress' | 'completed';
export type InsightType = 'principle' | 'technique' | 'mindset' | 'fact';

export interface ProjectModule {
  id: string;
  title: string;
  order: number;
  status: ModuleStatus;
  completedAt?: string;

  // Learning Material
  material: string;
  materialImages: string[];

  // FSRS Spaced Repetition (same as Topic)
  fsrs?: FSRSState;

  // Quiz Tracking
  grades: number[];
  avgGrade: number | null;
  quizCount: number;
  quizHistory: QuizResult[];
  currentBloomLevel: BloomLevel;
  lastReview: string | null;

  // Gap Analysis
  wrongAnswers: WrongAnswer[];

  // Reading Progress
  readCount: number;
  lastRead: string | null;

  // Size (time estimation)
  size: TopicSize | null;
  sizeSetBy: 'ai' | 'user' | null;

  // Reader Mode
  highlights: TextHighlight[];
}

export interface ProjectInsight {
  id: string;
  date: string;
  moduleId?: string;
  insight: string;
  type: InsightType;
  applied: boolean;
}

export interface DevelopmentProject {
  id: string;
  name: string;
  description?: string;
  type: ProjectType;
  category: ProjectCategory;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate?: string;
  targetDate?: string;
  completedDate?: string;
  modules: ProjectModule[];
  progressPercent: number;
  timeInvested: number;  // minutes
  insights: ProjectInsight[];
  createdAt: string;
  updatedAt: string;
}

// ================ CAREER PROFILE (Phase 1: Vayne Doctor) ================

export type MedicalStage = 'preclinical' | 'clinical' | 'intern' | 'resident' | 'other';

export interface CareerProfile {
  currentYear: number;  // 1-6 for med school
  stage: MedicalStage;
  university?: string;
  interestedSpecialties: string[];
  academicInterests: string[];
  shortTermGoals: string[];
  longTermGoals: string[];
  createdAt: string;
  updatedAt: string;
}

// ================ ACADEMIC EVENTS (Колоквиуми, Контролни, etc.) ================

export type AcademicEventType = 'colloquium' | 'control_test' | 'practical_exam' | 'seminar' | 'other';

export interface AcademicEvent {
  id: string;
  type: AcademicEventType;
  subjectId: string;
  date: string;              // ISO date
  name?: string;             // "Колоквиум 1", "Контролно №2"
  description?: string;
  topicIds?: string[];       // Specific topics covered (empty/undefined = all topics in subject)
  weight: number;            // 0.5 = light, 1.0 = normal, 1.5 = important
  createdAt: string;
}

// ================ STUDY TECHNIQUES (IcanStudy HUDLE Framework) ================

export type TechniqueCategory = 'encoding' | 'retrieval' | 'metacognition' | 'self-management';

export interface StudyTechnique {
  id: string;
  name: string;                    // e.g. "Chunking", "Interleaving"
  slug: string;                    // e.g. "chunking", "interleaving" - for matching
  category: TechniqueCategory;
  description: string;             // Short description (1-2 sentences)
  notes: string;                   // Rich notes (HTML) - user's own notes from course
  howToApply: string;              // Practical instructions for applying this technique
  icon: string;                    // Emoji icon
  isBuiltIn: boolean;              // true = pre-seeded from IcanStudy, false = user-created
  isActive: boolean;               // user can enable/disable techniques
  practiceCount: number;           // times practiced
  lastPracticedAt: string | null;  // ISO date
  createdAt: string;
}

export interface TechniquePractice {
  id: string;
  techniqueId: string;
  topicId: string;
  subjectId: string;
  date: string;                    // ISO date
  effectiveness: number | null;    // 1-5 rating after practice
  aiPrompt: string;                // What AI suggested to do
  userReflection: string | null;   // Optional: user's reflection on the practice
}

// ================ DASHBOARD FEATURES ================

// Track last opened topic for "Continue where you left off"
export interface LastOpenedTopic {
  subjectId: string;
  topicId: string;
  timestamp: string;          // ISO timestamp
}

// Daily goals checklist item
export interface DailyGoal {
  id: string;
  text: string;
  completed: boolean;
  date: string;               // YYYY-MM-DD
  type: 'daily' | 'weekly';
  createdAt: string;
}
