import { BloomLevel } from './types';

export type QuizMode = 'assessment' | 'free_recall' | 'mind_map' | 'lower_order' | 'mid_order' | 'higher_order' | 'custom' | 'drill_weakness' | 'anki_cards' | 'specimen_quiz';

export type QuestionType = 'multiple_choice' | 'open' | 'case_study' | 'fill_blank' | 'short_answer';

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

export interface MindMapEvaluation {
  score: number;           // 0-100
  grade: number;           // 2-6 Bulgarian grade
  bloomLevel: number;      // 4-6 typically
  conceptsCovered: Array<{ concept: string; accuracy: 'correct' | 'partial' | 'wrong' }>;
  connectionsCovered: Array<{ from: string; to: string; label: string; accuracy: 'correct' | 'partial' | 'wrong' }>;
  missingConcepts: Array<{ concept: string; importance: 'critical' | 'important' | 'nice_to_know' }>;
  missingConnections: Array<{ from: string; to: string; relationship: string }>;
  hierarchyScore: number;  // 0-100 how well organized
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
  weakConcepts?: string[];
}): MasteryContext {
  const quizDerived = (topic.wrongAnswers || [])
    .filter(wa => wa.drillCount < 3)
    .map(wa => ({ concept: wa.concept, drillCount: wa.drillCount }));
  const quizConceptNames = new Set(quizDerived.map(wc => wc.concept.toLowerCase()));
  // Manual weak concepts get drillCount 0 (highest priority), deduped against quiz-derived
  const manualWeak = (topic.weakConcepts || [])
    .filter(c => !quizConceptNames.has(c.toLowerCase()))
    .map(c => ({ concept: c, drillCount: 0 }));

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
    weakConcepts: [...manualWeak, ...quizDerived]
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
      // Normalize: lowercase, trim, collapse whitespace, treat hyphens as spaces
      const normalize = (s: string) => s.toLowerCase().trim().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
      const userAns = normalize(answer);
      if (userAns === normalize(q.correctAnswer)) return true;
      return (q.acceptableAnswers || []).some(a => normalize(a) === userAns);
    }
    case 'short_answer':
    case 'open':
      return !!openEval && openEval.score >= 0.7;
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
