import { BloomLevel } from './types';

export type QuizMode = 'assessment' | 'free_recall' | 'lower_order' | 'mid_order' | 'higher_order' | 'custom' | 'drill_weakness' | 'anki_cards';

export type QuestionType = 'multiple_choice' | 'open' | 'case_study' | 'fill_blank' | 'short_answer' | 'matching' | 'ordering';

export interface Question {
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  bloomLevel?: number;
  concept?: string;
  // New type-specific fields
  acceptableAnswers?: string[]; // fill_blank: alternative correct answers
  pairs?: Array<{ left: string; right: string }>; // matching: correct pairs
  items?: string[]; // ordering: items in CORRECT order (UI shuffles)
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

// Check if answer is correct for a question (shared logic)
export function isAnswerCorrect(q: Question, answer: string | null, openEval?: OpenAnswerEvaluation): boolean {
  if (!answer) return false;
  switch (q.type) {
    case 'multiple_choice':
    case 'case_study':
      return answer === q.correctAnswer;
    case 'fill_blank': {
      const userAns = answer.toLowerCase().trim();
      if (userAns === q.correctAnswer.toLowerCase().trim()) return true;
      return (q.acceptableAnswers || []).some(a => a.toLowerCase().trim() === userAns);
    }
    case 'short_answer':
    case 'open':
      return !!openEval && openEval.score >= 0.7;
    case 'matching': {
      try {
        const userPairs = JSON.parse(answer) as Record<string, string>;
        return (q.pairs || []).every(p => userPairs[p.left] === p.right);
      } catch { return false; }
    }
    case 'ordering': {
      try {
        const userOrder = JSON.parse(answer) as string[];
        return JSON.stringify(userOrder) === JSON.stringify(q.items);
      } catch { return false; }
    }
    default:
      return answer === q.correctAnswer;
  }
}

// Get partial score for a question (0-1)
export function getQuestionScore(q: Question, answer: string | null, openEval?: OpenAnswerEvaluation): number {
  if (!answer) return 0;
  switch (q.type) {
    case 'open':
    case 'short_answer':
      return openEval ? openEval.score : 0;
    case 'matching': {
      try {
        const userPairs = JSON.parse(answer) as Record<string, string>;
        const pairs = q.pairs || [];
        if (pairs.length === 0) return 0;
        const correctCount = pairs.filter(p => userPairs[p.left] === p.right).length;
        return correctCount / pairs.length;
      } catch { return 0; }
    }
    default:
      return isAnswerCorrect(q, answer, openEval) ? 1 : 0;
  }
}

// Pure score calculation
export function calculateScore(
  questions: Question[],
  answers: (string | null)[],
  openEvaluations: Record<number, OpenAnswerEvaluation>
): number {
  let correct = 0;
  questions.forEach((q, i) => {
    correct += getQuestionScore(q, answers[i], openEvaluations[i]);
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
