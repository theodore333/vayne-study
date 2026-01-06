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
