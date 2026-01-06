export interface Subject {
  id: string;
  name: string;
  color: string;
  examDate: string | null;
  topics: Topic[];
  createdAt: string;
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

export interface AppData {
  subjects: Subject[];
  schedule: ScheduleClass[];
  dailyStatus: DailyStatus;
  timerSessions: TimerSession[];
  gpaData: GPAData;
  usageData: UsageData;
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
