import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateRetrievability,
  getDaysUntilReview,
  getDaysSince,
  initializeFSRS,
  updateFSRS,
  gradeToStatus,
  applyDecay,
  getWeightedMasteryScore,
  getTopicPriority,
} from '../algorithms';
import type { FSRSState, Topic, BloomLevel } from '../types';

// ============================================================================
// Helpers
// ============================================================================

function makeFSRS(overrides: Partial<FSRSState> = {}): FSRSState {
  return {
    stability: 10,
    difficulty: 0.5,
    lastReview: new Date().toISOString().split('T')[0],
    reps: 3,
    lapses: 0,
    ...overrides,
  };
}

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    number: 1,
    name: 'Test Topic',
    status: 'green',
    lastReview: new Date().toISOString().split('T')[0],
    grades: [5],
    avgGrade: 5,
    quizCount: 1,
    material: '',
    materialImages: [],
    currentBloomLevel: 1 as BloomLevel,
    quizHistory: [],
    readCount: 0,
    lastRead: null,
    size: null,
    sizeSetBy: null,
    wrongAnswers: [],
    highlights: [],
    customQuestions: [],
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// calculateRetrievability
// ============================================================================

describe('calculateRetrievability', () => {
  it('returns 1.0 when reviewed today', () => {
    const fsrs = makeFSRS({ lastReview: new Date().toISOString().split('T')[0] });
    expect(calculateRetrievability(fsrs)).toBe(1.0);
  });

  it('decays over time', () => {
    const fsrs = makeFSRS({ lastReview: daysAgo(10), stability: 5 });
    const R = calculateRetrievability(fsrs);
    // e^(-10/5) = e^-2 ≈ 0.135
    expect(R).toBeCloseTo(0.135, 2);
  });

  it('is always between 0 and 1', () => {
    const fsrs = makeFSRS({ lastReview: daysAgo(1000), stability: 1 });
    const R = calculateRetrievability(fsrs);
    expect(R).toBeGreaterThanOrEqual(0);
    expect(R).toBeLessThanOrEqual(1);
  });

  it('higher stability = slower decay', () => {
    const lowS = makeFSRS({ lastReview: daysAgo(10), stability: 5 });
    const highS = makeFSRS({ lastReview: daysAgo(10), stability: 20 });
    expect(calculateRetrievability(highS)).toBeGreaterThan(calculateRetrievability(lowS));
  });
});

// ============================================================================
// getDaysSince
// ============================================================================

describe('getDaysSince', () => {
  it('returns 0 for today', () => {
    expect(getDaysSince(new Date().toISOString().split('T')[0])).toBe(0);
  });

  it('returns correct count for past dates', () => {
    expect(getDaysSince(daysAgo(5))).toBe(5);
    expect(getDaysSince(daysAgo(30))).toBe(30);
  });

  it('returns Infinity for null', () => {
    expect(getDaysSince(null)).toBe(Infinity);
  });
});

// ============================================================================
// getDaysUntilReview
// ============================================================================

describe('getDaysUntilReview', () => {
  it('returns 0 when already due', () => {
    const fsrs = makeFSRS({ lastReview: daysAgo(100), stability: 5 });
    expect(getDaysUntilReview(fsrs)).toBe(0);
  });

  it('returns positive for recently reviewed topic', () => {
    const fsrs = makeFSRS({ lastReview: new Date().toISOString().split('T')[0], stability: 30 });
    const days = getDaysUntilReview(fsrs);
    expect(days).toBeGreaterThan(0);
  });

  it('never returns negative', () => {
    const fsrs = makeFSRS({ lastReview: daysAgo(999), stability: 1 });
    expect(getDaysUntilReview(fsrs)).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// initializeFSRS
// ============================================================================

describe('initializeFSRS', () => {
  it('score < 60 → rating 0 (Again)', () => {
    const fsrs = initializeFSRS(45);
    expect(fsrs.lapses).toBe(1);
    expect(fsrs.reps).toBe(0);
  });

  it('score 60-74 → rating 1 (Hard)', () => {
    const fsrs = initializeFSRS(65);
    expect(fsrs.reps).toBe(1);
    expect(fsrs.lapses).toBe(0);
  });

  it('score 75-89 → rating 2 (Good)', () => {
    const fsrs = initializeFSRS(80);
    expect(fsrs.reps).toBe(1);
    expect(fsrs.lapses).toBe(0);
  });

  it('score >= 90 → rating 3 (Easy)', () => {
    const fsrs = initializeFSRS(95);
    expect(fsrs.reps).toBe(1);
    expect(fsrs.lapses).toBe(0);
  });

  it('higher scores → higher stability', () => {
    const low = initializeFSRS(45);
    const mid = initializeFSRS(80);
    const high = initializeFSRS(95);
    expect(high.stability).toBeGreaterThan(mid.stability);
    expect(mid.stability).toBeGreaterThan(low.stability);
  });

  it('higher scores → lower difficulty', () => {
    const low = initializeFSRS(45);
    const high = initializeFSRS(95);
    expect(high.difficulty).toBeLessThan(low.difficulty);
  });

  it('difficulty stays within bounds (0.1 - 1.0)', () => {
    for (const score of [0, 30, 59, 60, 74, 75, 89, 90, 100]) {
      const fsrs = initializeFSRS(score);
      expect(fsrs.difficulty).toBeGreaterThanOrEqual(0.1);
      expect(fsrs.difficulty).toBeLessThanOrEqual(1.0);
    }
  });

  it('stability is at least 1', () => {
    const fsrs = initializeFSRS(0);
    expect(fsrs.stability).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// updateFSRS
// ============================================================================

describe('updateFSRS', () => {
  it('lapse: stability drops, difficulty rises', () => {
    const before = makeFSRS({ stability: 20, difficulty: 0.5 });
    const after = updateFSRS(before, 40); // score < 60 = lapse
    expect(after.stability).toBeLessThan(before.stability);
    expect(after.difficulty).toBeGreaterThan(before.difficulty);
    expect(after.lapses).toBe(before.lapses + 1);
  });

  it('success: stability grows', () => {
    const before = makeFSRS({ stability: 10, difficulty: 0.5, lastReview: daysAgo(5) });
    const after = updateFSRS(before, 85); // rating 2 (Good)
    expect(after.stability).toBeGreaterThan(before.stability);
    expect(after.reps).toBe(before.reps + 1);
  });

  it('easy gives more growth than hard', () => {
    const base = makeFSRS({ stability: 10, difficulty: 0.5, lastReview: daysAgo(5) });
    const hard = updateFSRS(base, 65);  // rating 1
    const easy = updateFSRS(base, 95);  // rating 3
    expect(easy.stability).toBeGreaterThan(hard.stability);
  });

  it('difficulty stays within bounds after many updates', () => {
    let fsrs = makeFSRS({ stability: 5, difficulty: 0.5 });
    // 20 lapses should not push difficulty above 1.0
    for (let i = 0; i < 20; i++) {
      fsrs = updateFSRS(fsrs, 30);
    }
    expect(fsrs.difficulty).toBeLessThanOrEqual(1.0);

    // 20 easy successes should not push difficulty below 0.1
    fsrs = makeFSRS({ stability: 5, difficulty: 0.5, lastReview: daysAgo(1) });
    for (let i = 0; i < 20; i++) {
      fsrs = { ...updateFSRS(fsrs, 95), lastReview: daysAgo(1) };
    }
    expect(fsrs.difficulty).toBeGreaterThanOrEqual(0.1);
  });

  it('stability never goes below 1 on lapse', () => {
    const before = makeFSRS({ stability: 1, difficulty: 0.9 });
    const after = updateFSRS(before, 20);
    expect(after.stability).toBeGreaterThanOrEqual(1);
  });

  it('stability capped at maxInterval (180)', () => {
    let fsrs = makeFSRS({ stability: 150, difficulty: 0.1, lastReview: daysAgo(100) });
    fsrs = updateFSRS(fsrs, 95);
    expect(fsrs.stability).toBeLessThanOrEqual(180);
  });
});

// ============================================================================
// gradeToStatus
// ============================================================================

describe('gradeToStatus', () => {
  it('>= 5.5 → green', () => {
    expect(gradeToStatus(5.5)).toBe('green');
    expect(gradeToStatus(6)).toBe('green');
  });

  it('>= 4.5 but < 5.5 → yellow', () => {
    expect(gradeToStatus(4.5)).toBe('yellow');
    expect(gradeToStatus(5.0)).toBe('yellow');
    expect(gradeToStatus(5.49)).toBe('yellow');
  });

  it('< 4.5 → orange', () => {
    expect(gradeToStatus(4.49)).toBe('orange');
    expect(gradeToStatus(3)).toBe('orange');
    expect(gradeToStatus(2)).toBe('orange');
  });
});

// ============================================================================
// applyDecay
// ============================================================================

describe('applyDecay', () => {
  it('gray topics do not decay', () => {
    const topic = makeTopic({ status: 'gray', lastReview: daysAgo(100) });
    expect(applyDecay(topic).status).toBe('gray');
  });

  it('recently reviewed green topic stays green', () => {
    const topic = makeTopic({ status: 'green', lastReview: daysAgo(5) });
    expect(applyDecay(topic).status).toBe('green');
  });

  it('green → yellow after 18+ days', () => {
    const topic = makeTopic({ status: 'green', lastReview: daysAgo(19) });
    expect(applyDecay(topic).status).toBe('yellow');
  });

  it('green → orange after 32+ days (18d green→yellow + 14d yellow→orange)', () => {
    const topic = makeTopic({ status: 'green', lastReview: daysAgo(33) });
    expect(applyDecay(topic).status).toBe('orange');
  });

  it('multi-step decay: green → gray after 60+ days', () => {
    // green→yellow(18d) + yellow→orange(14d) + orange→gray(18d) = 50 days total
    const topic = makeTopic({ status: 'green', lastReview: daysAgo(60) });
    expect(applyDecay(topic).status).toBe('gray');
  });

  it('yellow → orange after 14+ days', () => {
    const topic = makeTopic({ status: 'yellow', lastReview: daysAgo(15) });
    expect(applyDecay(topic).status).toBe('orange');
  });

  it('orange → gray after 18+ days', () => {
    const topic = makeTopic({ status: 'orange', lastReview: daysAgo(19) });
    expect(applyDecay(topic).status).toBe('gray');
  });

  it('does not mutate original topic', () => {
    const topic = makeTopic({ status: 'green', lastReview: daysAgo(20) });
    const result = applyDecay(topic);
    expect(topic.status).toBe('green');
    expect(result.status).toBe('yellow');
  });
});

// ============================================================================
// getWeightedMasteryScore
// ============================================================================

describe('getWeightedMasteryScore', () => {
  it('returns 0 for empty history', () => {
    const topic = makeTopic({ quizHistory: [] });
    expect(getWeightedMasteryScore(topic)).toBe(0);
  });

  it('returns the score for single quiz', () => {
    const topic = makeTopic({
      quizHistory: [{ date: daysAgo(1), score: 80, bloomLevel: 1, questionsCount: 5, correctAnswers: 4, weight: 1.0 }]
    });
    expect(getWeightedMasteryScore(topic)).toBe(80);
  });

  it('newer quizzes weighted more than older ones', () => {
    const topic = makeTopic({
      quizHistory: [
        { date: daysAgo(10), score: 40, bloomLevel: 1, questionsCount: 5, correctAnswers: 2, weight: 1.0 },
        { date: daysAgo(1), score: 90, bloomLevel: 1, questionsCount: 5, correctAnswers: 4, weight: 1.0 },
      ]
    });
    const score = getWeightedMasteryScore(topic);
    // Simple average would be 65, but recency bias should push it above 65
    expect(score).toBeGreaterThan(65);
  });
});

// ============================================================================
// getTopicPriority
// ============================================================================

describe('getTopicPriority', () => {
  it('gray topics have lower priority score (= need more attention)', () => {
    const gray = makeTopic({ status: 'gray', lastReview: null, quizHistory: [] });
    const green = makeTopic({
      status: 'green',
      lastReview: daysAgo(1),
      quizHistory: [{ date: daysAgo(1), score: 90, bloomLevel: 3, questionsCount: 5, correctAnswers: 5, weight: 1.0 }],
      currentBloomLevel: 3 as BloomLevel
    });
    expect(getTopicPriority(gray)).toBeLessThan(getTopicPriority(green));
  });

  it('higher bloom level increases priority score', () => {
    const low = makeTopic({ currentBloomLevel: 1 as BloomLevel, status: 'yellow', lastReview: daysAgo(1), quizHistory: [] });
    const high = makeTopic({ currentBloomLevel: 4 as BloomLevel, status: 'yellow', lastReview: daysAgo(1), quizHistory: [] });
    expect(getTopicPriority(high)).toBeGreaterThan(getTopicPriority(low));
  });

  it('returns 0 or above (never negative)', () => {
    const worst = makeTopic({ status: 'gray', lastReview: null, quizHistory: [], currentBloomLevel: 1 as BloomLevel });
    expect(getTopicPriority(worst)).toBeGreaterThanOrEqual(0);
  });
});
