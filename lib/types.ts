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
}

export type TopicStatus = 'gray' | 'orange' | 'yellow' | 'green';

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
  sleep: number;
  energy: number;
  sick: boolean;
  availableHours: number;
}

export interface TimerSession {
  id: string;
  subjectId: string;
  topicId: string | null;
  startTime: string;
  endTime: string | null;
  duration: number;
  rating: number | null;
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

export interface AppData {
  subjects: Subject[];
  schedule: ScheduleClass[];
  dailyStatus: DailyStatus;
  timerSessions: TimerSession[];
  gpaData: GPAData;
  usageData: UsageData;
  questionBanks: QuestionBank[];
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
