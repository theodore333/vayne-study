import { BloomLevel } from './types';

export type QuizMode = 'assessment' | 'free_recall' | 'gap_analysis' | 'lower_order' | 'mid_order' | 'higher_order' | 'custom' | 'drill_weakness';

export interface Question {
  type: 'multiple_choice' | 'open' | 'case_study';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  bloomLevel?: number;
  concept?: string;
}

export interface FreeRecallEvaluation {
  score: number;
  grade: number;
  bloomLevel: number;
  covered: Array<{ concept: string; accuracy: string; detail: string }>;
  missing: Array<{ concept: string; importance: string }>;
  feedback: string;
  suggestedNextStep: string;
}

export interface OpenAnswerEvaluation {
  score: number; // 0-1
  isCorrect: boolean;
  feedback: string;
  keyPointsCovered: string[];
  keyPointsMissed: string[];
}

export interface MistakeAnalysis {
  summary: string;
  weakConcepts: string[];
  patterns: Array<{
    type: string;
    description: string;
    frequency: string;
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    reason: string;
  }>;
  priorityFocus: string | null;
}

export interface QuizState {
  questions: Question[];
  currentIndex: number;
  answers: (string | null)[];
  showResult: boolean;
  isGenerating: boolean;
  error: string | null;
}

// Mastery context for smarter quiz generation
export interface MasteryContext {
  topicStatus: string;
  bloomLevel: number;
  avgGrade: number | null;
  quizCount: number;
  readCount: number;
  lastReview: string | null;
  recentQuizzes: Array<{ date: string; score: number; bloomLevel: number }>;
  masteredConcepts: string[];
  weakConcepts: Array<{ concept: string; drillCount: number }>;
}

export function buildMasteryContext(topic: {
  status: string;
  currentBloomLevel?: BloomLevel | number;
  avgGrade: number | null;
  quizCount: number;
  readCount: number;
  lastReview: string | null;
  quizHistory?: Array<{ date: string; score: number; bloomLevel: number }>;
  wrongAnswers?: Array<{ concept: string; drillCount: number }>;
}): MasteryContext {
  return {
    topicStatus: topic.status,
    bloomLevel: topic.currentBloomLevel || 1,
    avgGrade: topic.avgGrade,
    quizCount: topic.quizCount,
    readCount: topic.readCount,
    lastReview: topic.lastReview,
    recentQuizzes: (topic.quizHistory || []).slice(-5).map(q => ({
      date: q.date, score: q.score, bloomLevel: q.bloomLevel
    })),
    masteredConcepts: [...new Set(
      (topic.wrongAnswers || [])
        .filter(wa => wa.drillCount >= 3)
        .map(wa => wa.concept)
    )],
    weakConcepts: (topic.wrongAnswers || [])
      .filter(wa => wa.drillCount < 3)
      .map(wa => ({ concept: wa.concept, drillCount: wa.drillCount }))
  };
}

// Pure score calculation
export function calculateScore(
  questions: Question[],
  answers: (string | null)[],
  openEvaluations: Record<number, OpenAnswerEvaluation>
): number {
  let correct = 0;
  questions.forEach((q, i) => {
    if ((q.type === 'multiple_choice' || q.type === 'case_study') && answers[i] === q.correctAnswer) {
      correct++;
    } else if (q.type === 'open' && answers[i]) {
      const evaluation = openEvaluations[i];
      if (evaluation) {
        correct += evaluation.score;
      }
    }
  });
  return correct;
}

// Grade from percentage
export function getGradeFromScore(score: number, total: number): number {
  const percentage = (score / total) * 100;
  if (percentage >= 90) return 6;
  if (percentage >= 75) return 5;
  if (percentage >= 60) return 4;
  if (percentage >= 40) return 3;
  return 2;
}
