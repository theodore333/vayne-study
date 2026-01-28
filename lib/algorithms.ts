import { Subject, Topic, TopicStatus, DailyStatus, PredictedGrade, DailyTask, ScheduleClass, GradeFactor, parseExamFormat, QuestionBank, CrunchModeStatus, StudyGoals, FSRSState } from './types';
import { DECAY_RULES, STATUS_CONFIG, MOTIVATIONAL_MESSAGES, CLASS_TYPES, CRUNCH_MODE_THRESHOLDS, TOPIC_SIZE_CONFIG, NEW_MATERIAL_QUOTA, DECAY_THRESHOLDS } from './constants';

// ============================================================================
// FSRS (Free Spaced Repetition Scheduler) for Topics
// Adapted from FSRS v4 algorithm for larger knowledge units (topics vs flashcards)
// Key difference: Longer base intervals since topics are bigger than cards
// ============================================================================

// FSRS Default Parameters (tuned for topics, not flashcards)
const FSRS_DEFAULTS = {
  // Initial stability values by first rating
  w: [0.4, 0.6, 2.4, 5.8],  // Again, Hard, Good, Easy → initial S
  // Stability growth factors
  factor: 2.5,              // Base growth factor
  decay: -0.5,              // Decay rate for stability increase
  // Topic-specific adjustments (topics need less frequent review than cards)
  topicMultiplier: 1.5,     // Topics get 50% longer intervals than cards
  // Difficulty bounds
  minD: 0.1,
  maxD: 1.0,
  // Retrievability threshold for scheduling
  targetR: 0.85,            // Schedule review when R drops to 85% (vs 90% for cards)
  // Anti-review-hell settings
  maxDailyReviews: 8,       // Cap reviews per day
  minInterval: 1,           // Minimum 1 day between reviews
  maxInterval: 180,         // Max 6 months for well-known topics
};

// Get FSRS params merged with user settings
export function getFSRSParams(studyGoals?: StudyGoals) {
  return {
    ...FSRS_DEFAULTS,
    targetR: studyGoals?.fsrsTargetRetention ?? FSRS_DEFAULTS.targetR,
    maxDailyReviews: studyGoals?.fsrsMaxReviewsPerDay ?? FSRS_DEFAULTS.maxDailyReviews,
    maxInterval: studyGoals?.fsrsMaxInterval ?? FSRS_DEFAULTS.maxInterval,
  };
}

// For backwards compatibility
const FSRS_PARAMS = FSRS_DEFAULTS;

/**
 * Calculate retrievability (probability of recall) at time t
 * R(t) = e^(-t/S) where S is stability
 */
export function calculateRetrievability(fsrs: FSRSState): number {
  const daysSinceReview = getDaysSince(fsrs.lastReview);
  if (daysSinceReview === 0) return 1.0;

  const R = Math.exp(-daysSinceReview / fsrs.stability);
  return Math.max(0, Math.min(1, R));
}

/**
 * Calculate days until retrievability drops to target threshold
 * Solving: targetR = e^(-t/S) → t = -S * ln(targetR)
 */
export function getDaysUntilReview(fsrs: FSRSState): number {
  const daysUntil = -fsrs.stability * Math.log(FSRS_PARAMS.targetR);
  const daysSinceReview = getDaysSince(fsrs.lastReview);
  return Math.max(0, Math.round(daysUntil - daysSinceReview));
}

/**
 * Check if topic needs review based on retrievability
 */
export function topicNeedsReview(topic: Topic): boolean {
  if (!topic.fsrs) return false; // No FSRS state = use old decay system

  const R = calculateRetrievability(topic.fsrs);
  return R <= FSRS_PARAMS.targetR;
}

/**
 * Initialize FSRS state for a topic (called after first quiz)
 */
export function initializeFSRS(quizScore: number): FSRSState {
  // Convert score (0-100) to rating (0-3): Again, Hard, Good, Easy
  const rating = quizScore < 60 ? 0 : quizScore < 75 ? 1 : quizScore < 90 ? 2 : 3;

  // Initial stability based on first performance
  const initialS = FSRS_PARAMS.w[rating] * FSRS_PARAMS.topicMultiplier;

  // Initial difficulty estimate (adjusted by performance)
  // Good/Easy performance → lower difficulty, Again/Hard → higher
  const initialD = 0.5 + (2 - rating) * 0.15; // 0.8, 0.65, 0.5, 0.35

  return {
    stability: Math.max(1, initialS),
    difficulty: Math.max(FSRS_PARAMS.minD, Math.min(FSRS_PARAMS.maxD, initialD)),
    lastReview: new Date().toISOString().split('T')[0],
    reps: rating >= 1 ? 1 : 0, // Count as rep only if not "Again"
    lapses: rating === 0 ? 1 : 0
  };
}

/**
 * Update FSRS state after a quiz
 * Core FSRS algorithm adapted for topics
 */
export function updateFSRS(currentFsrs: FSRSState, quizScore: number): FSRSState {
  const rating = quizScore < 60 ? 0 : quizScore < 75 ? 1 : quizScore < 90 ? 2 : 3;
  const R = calculateRetrievability(currentFsrs);

  let newS: number;
  let newD: number;
  let newReps = currentFsrs.reps;
  let newLapses = currentFsrs.lapses;

  if (rating === 0) {
    // LAPSE: Failed recall - reduce stability significantly
    newLapses++;
    // Stability drops to fraction based on difficulty
    newS = Math.max(1, currentFsrs.stability * 0.3 * (1 - currentFsrs.difficulty * 0.5));
    // Difficulty increases on lapse
    newD = Math.min(FSRS_PARAMS.maxD, currentFsrs.difficulty + 0.1);
  } else {
    // SUCCESS: Grow stability
    newReps++;

    // Stability growth formula (simplified FSRS)
    // Higher R at review → less stability growth (reviewed too early)
    // Lower difficulty → more stability growth
    const growthFactor = FSRS_PARAMS.factor * (1 - currentFsrs.difficulty * 0.3);
    const retrievabilityBonus = 1 + (1 - R) * 0.5; // Bonus for reviewing when R is lower
    const ratingBonus = 1 + (rating - 1) * 0.15; // Easy = more growth

    newS = currentFsrs.stability * growthFactor * retrievabilityBonus * ratingBonus * FSRS_PARAMS.topicMultiplier;
    newS = Math.min(FSRS_PARAMS.maxInterval, Math.max(FSRS_PARAMS.minInterval, newS));

    // Difficulty decreases slightly on success
    const dChange = (rating - 2) * 0.05; // Hard: +0.05, Good: 0, Easy: -0.05
    newD = Math.max(FSRS_PARAMS.minD, Math.min(FSRS_PARAMS.maxD, currentFsrs.difficulty - dChange));
  }

  return {
    stability: Math.round(newS * 10) / 10,
    difficulty: Math.round(newD * 100) / 100,
    lastReview: new Date().toISOString().split('T')[0],
    reps: newReps,
    lapses: newLapses
  };
}

/**
 * Get topics that need review today, sorted by urgency
 * Includes anti-review-hell protection
 */
export function getTopicsNeedingFSRSReview(
  subjects: Subject[],
  maxReviews: number = FSRS_PARAMS.maxDailyReviews
): Array<{ topic: Topic; subject: Subject; urgency: number; retrievability: number }> {
  const needsReview: Array<{ topic: Topic; subject: Subject; urgency: number; retrievability: number }> = [];

  for (const subject of subjects) {
    if (subject.archived) continue;

    for (const topic of subject.topics) {
      if (!topic.fsrs) continue;

      const R = calculateRetrievability(topic.fsrs);

      // Include if below threshold
      if (R <= FSRS_PARAMS.targetR) {
        // Urgency: how far below threshold (lower R = more urgent)
        const urgency = (FSRS_PARAMS.targetR - R) / FSRS_PARAMS.targetR;
        needsReview.push({ topic, subject, urgency, retrievability: R });
      }
    }
  }

  // Sort by urgency (most urgent first)
  needsReview.sort((a, b) => b.urgency - a.urgency);

  // Anti-review-hell: cap daily reviews
  return needsReview.slice(0, maxReviews);
}

/**
 * Migrate topic from old decay system to FSRS
 * Uses existing quiz history to estimate initial state
 */
export function migrateToFSRS(topic: Topic): FSRSState | null {
  // Need at least one quiz to initialize
  if (topic.quizHistory.length === 0) return null;

  // Use most recent quiz for initial rating
  const recentQuiz = topic.quizHistory[topic.quizHistory.length - 1];
  const fsrs = initializeFSRS(recentQuiz.score);

  // Adjust stability based on status (proxy for past performance)
  if (topic.status === 'green') {
    fsrs.stability *= 2; // Green topics have proven retention
    fsrs.difficulty = Math.max(0.2, fsrs.difficulty - 0.1);
  } else if (topic.status === 'yellow') {
    fsrs.stability *= 1.3;
  } else if (topic.status === 'orange') {
    fsrs.difficulty = Math.min(0.8, fsrs.difficulty + 0.1);
  }

  // Use actual last review date if available
  if (topic.lastReview) {
    fsrs.lastReview = topic.lastReview;
  }

  // Estimate reps from quiz count
  fsrs.reps = Math.min(topic.quizCount, 10);

  return fsrs;
}

/**
 * Fisher-Yates shuffle for unbiased random permutation
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Monte Carlo simulation for exam outcome
 * Simulates random topic selection to estimate grade distribution
 */
export function simulateExamOutcome(
  topics: Topic[],
  topicsOnExam: number,
  iterations: number = 1000
): {
  bestCase: number;
  worstCase: number;
  expected: number;
  variance: number;
  criticalTopics: string[];
  impactTopics: { topicId: string; topicName: string; impact: number }[];
} {
  if (topics.length === 0 || topicsOnExam <= 0 || iterations <= 0) {
    return { bestCase: 2, worstCase: 2, expected: 2, variance: 0, criticalTopics: [], impactTopics: [] };
  }

  // Calculate topic scores (0-6 scale)
  const topicScores = topics.map(t => {
    let score = 3; // Base score
    if (t.status === 'green') score = 5.5;
    else if (t.status === 'yellow') score = 4.5;
    else if (t.status === 'orange') score = 3.5;
    else score = 2.5; // gray

    // Adjust by quiz performance
    if (t.avgGrade) score = (score + t.avgGrade) / 2;

    return { id: t.id, name: t.name, score, status: t.status };
  });

  const results: number[] = [];
  const actualTopicsOnExam = Math.min(topicsOnExam, topics.length);

  // Run simulations
  for (let i = 0; i < iterations; i++) {
    // Random selection of topics
    const shuffled = shuffleArray(topicScores);
    const selected = shuffled.slice(0, actualTopicsOnExam);
    const avgScore = selected.reduce((sum, t) => sum + t.score, 0) / actualTopicsOnExam;
    results.push(avgScore);
  }

  // Calculate statistics
  const sorted = [...results].sort((a, b) => a - b);
  const expected = results.reduce((a, b) => a + b, 0) / results.length;
  const variance = Math.sqrt(
    results.reduce((sum, r) => sum + Math.pow(r - expected, 2), 0) / results.length
  );

  // Best/worst from percentiles
  const bestCase = sorted[Math.floor(iterations * 0.95)]; // 95th percentile
  const worstCase = sorted[Math.floor(iterations * 0.05)]; // 5th percentile

  // Find critical topics (weakest)
  const weakTopics = topicScores
    .filter(t => t.status === 'gray' || t.status === 'orange')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  // Calculate impact of improving each weak topic
  const impactTopics = weakTopics.map(t => {
    // If this topic was improved, how much would worst case improve?
    const improvedScore = 5.0; // Assume topic becomes "yellow-green"
    // Impact = score improvement * probability of topic being selected
    const scoreDiff = improvedScore - t.score;
    const selectionProbability = actualTopicsOnExam / topics.length;
    const impact = scoreDiff * selectionProbability;

    return {
      topicId: t.id,
      topicName: t.name,
      impact: Math.round(impact * 100) / 100
    };
  }).sort((a, b) => b.impact - a.impact);

  return {
    bestCase: Math.round(bestCase * 100) / 100,
    worstCase: Math.round(worstCase * 100) / 100,
    expected: Math.round(expected * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    criticalTopics: weakTopics.map(t => t.name),
    impactTopics
  };
}

/**
 * Analyze gap based on exam format
 * Returns weakness analysis for different question types
 */
export function analyzeFormatGaps(
  subject: Subject
): {
  hasCases: boolean;
  hasOpenQuestions: boolean;
  caseWeakness: boolean;
  openWeakness: boolean;
  formatTip: string;
} {
  const format = parseExamFormat(subject.examFormat);
  const result = {
    hasCases: false,
    hasOpenQuestions: false,
    caseWeakness: false,
    openWeakness: false,
    formatTip: ''
  };

  if (!format) return result;

  result.hasCases = format.cases > 0;
  result.hasOpenQuestions = format.openQuestions > 0;

  // Analyze quiz history for weakness patterns
  const allQuizResults = subject.topics.flatMap(t => t.quizHistory || []);

  // Check if topics with cases have lower scores
  // (simplified - in reality would need quiz type tracking)
  const lowScoreQuizzes = allQuizResults.filter(q => q.score < 60);
  const highBloomLowScore = lowScoreQuizzes.filter(q => q.bloomLevel >= 4);

  // If many high-bloom quizzes have low scores, likely weak at complex questions
  if (highBloomLowScore.length > lowScoreQuizzes.length * 0.5) {
    if (result.hasCases) result.caseWeakness = true;
    if (result.hasOpenQuestions) result.openWeakness = true;
  }

  // Generate tip
  if (result.caseWeakness && result.hasCases) {
    result.formatTip = `Изпитът включва ${format.cases} казуса. Фокусирай се върху практически случаи и клинични сценарии.`;
  } else if (result.hasOpenQuestions && result.openWeakness) {
    result.formatTip = `Изпитът има ${format.openQuestions} отворени въпроса. Упражнявай писмено формулиране на отговори.`;
  } else if (format.mcq > 0) {
    result.formatTip = `${format.mcq} тестови въпроса. MCQ са по-лесни за точки - фокусирай се на покритие.`;
  }

  return result;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDaysSince(dateString: string | null): number {
  if (!dateString) return Infinity;
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDaysUntil(dateString: string | null): number {
  if (!dateString) return Infinity;
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get adaptive decay warning days based on topic mastery (avgGrade)
 * Higher mastery = longer intervals before decay warning
 * This implements spaced repetition principles
 */
export function getDecayWarningDays(topic: Topic): number {
  // Convert avgGrade (2-6 scale) to percentage (0-100)
  const grade = topic.avgGrade ? ((topic.avgGrade - 2) / 4) * 100 : 0;

  for (const threshold of DECAY_THRESHOLDS) {
    if (grade >= threshold.minGrade) {
      return threshold.warningDays;
    }
  }
  return 5; // default for topics with no grades
}

export function applyDecay(topic: Topic): Topic {
  if (topic.status === 'gray') return topic;

  const daysSinceReview = getDaysSince(topic.lastReview);
  let currentStatus: TopicStatus = topic.status;
  let totalDecayDays = 0;

  // Apply decay iteratively - topic can fall multiple levels if enough time passed
  // This handles cases like: green topic not reviewed for 40 days should become gray
  // (green → yellow after 10d, yellow → orange after 7d, orange → gray after 12d)
  while (currentStatus !== 'gray') {
    const decayStatus = currentStatus as 'green' | 'yellow' | 'orange';
    const rules = DECAY_RULES[decayStatus];
    if (!rules || rules.length === 0) break;

    // Sort rules by days descending to check longest threshold first
    const sortedRules = [...rules].sort((a, b) => b.days - a.days);

    let decayed = false;
    for (const rule of sortedRules) {
      // Check if remaining days since review exceed this threshold
      const remainingDays = daysSinceReview - totalDecayDays;
      if (remainingDays >= rule.days) {
        totalDecayDays += rule.days;
        currentStatus = rule.newStatus;
        decayed = true;
        break;
      }
    }

    // If no decay rule matched, stop
    if (!decayed) break;
  }

  if (currentStatus !== topic.status) {
    return { ...topic, status: currentStatus };
  }

  return topic;
}

export function applyDecayToSubjects(subjects: Subject[]): Subject[] {
  return subjects.map(subject => ({
    ...subject,
    topics: subject.topics.map(applyDecay)
  }));
}

export function gradeToStatus(avgGrade: number): TopicStatus {
  if (avgGrade >= 5.5) return 'green';
  if (avgGrade >= 4.5) return 'yellow';
  return 'orange';
}

/**
 * Calculate weighted mastery score for a topic based on quiz history
 * Higher weight quizzes have more influence on the final score
 * Returns a score from 0-100 (higher = better mastery)
 */
export function getWeightedMasteryScore(topic: Topic): number {
  const history = topic.quizHistory || [];
  if (history.length === 0) return 0;

  // Calculate weighted average with recency bias
  // More recent quizzes count more
  let totalWeight = 0;
  let weightedScore = 0;

  history.forEach((quiz, index) => {
    // Recency factor: more recent = higher weight (last quiz = 1.5x, first/oldest = 1.0x)
    // Array is ordered oldest to newest, so higher index = more recent
    const recencyFactor = 1 + (0.5 * (index / Math.max(1, history.length - 1)));
    const quizWeight = (quiz.weight || 1.0) * recencyFactor;

    totalWeight += quizWeight;
    weightedScore += quiz.score * quizWeight;
  });

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

/**
 * Get topic priority score (lower = needs more attention)
 * Combines: mastery score, bloom level, time since last review, quiz weight
 * In crunch mode, adds size bonus for gray topics (small topics get higher priority)
 */
export function getTopicPriority(topic: Topic, inCrunchMode: boolean = false): number {
  const masteryScore = getWeightedMasteryScore(topic);
  const bloomLevel = topic.currentBloomLevel || 1;
  const daysSinceReview = getDaysSince(topic.lastReview);

  // Base priority from mastery (0-100)
  let priority = masteryScore;

  // Bloom level bonus (higher bloom = better understanding)
  priority += bloomLevel * 5; // +5 to +30

  // Decay penalty for old reviews
  if (daysSinceReview !== Infinity) {
    priority -= Math.min(20, daysSinceReview * 2); // -2 per day, max -20
  }

  // Status penalty
  const statusPenalty = { gray: 30, orange: 20, yellow: 10, green: 0 };
  priority -= statusPenalty[topic.status];

  // Crunch mode: size bonus for gray topics (smaller topics get higher priority)
  // Lower priority score = needs more attention, so we SUBTRACT the bonus
  if (inCrunchMode && topic.status === 'gray' && topic.size) {
    const sizeBonus = TOPIC_SIZE_CONFIG[topic.size].crunchBonus;
    priority -= sizeBonus * 5; // small: -15, medium: -5, large: 0
  }

  return Math.max(0, priority);
}

export function calculateEffectiveHours(status: DailyStatus): number {
  // Legacy function - returns topic multiplier instead of hours
  // 1.0 = normal, 0.5 = reduced
  if (status.sick && status.holiday) return 0.25;
  if (status.sick || status.holiday) return 0.5;
  return 1.0;
}

// Calculate daily topic workload based on exam dates
export function calculateDailyTopics(
  subjects: Subject[],
  status: DailyStatus,
  studyGoals?: StudyGoals
): { total: number; bySubject: { subjectId: string; subjectName: string; topics: number; remaining: number; daysLeft: number; urgency: 'critical' | 'high' | 'medium' | 'low'; warning: string | null }[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bySubject: { subjectId: string; subjectName: string; topics: number; remaining: number; daysLeft: number; urgency: 'critical' | 'high' | 'medium' | 'low'; warning: string | null }[] = [];

  for (const subject of subjects) {
    if (!subject.examDate) continue;

    const examDate = new Date(subject.examDate);
    examDate.setHours(0, 0, 0, 0);
    const rawDaysLeft = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Skip past exams (including today - exam day)
    if (rawDaysLeft <= 0) continue;

    const daysLeft = rawDaysLeft;

    // Count non-green topics
    const remainingTopics = subject.topics.filter(t => t.status !== 'green').length;
    if (remainingTopics === 0) continue;

    // Calculate exact topics per day needed (no cap - show reality)
    const topicsPerDay = Math.ceil(remainingTopics / daysLeft);

    // Determine urgency
    let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (daysLeft <= 3) urgency = 'critical';
    else if (daysLeft <= 7) urgency = 'high';
    else if (daysLeft <= 14) urgency = 'medium';

    // Warning if workload is unrealistic
    let warning: string | null = null;
    if (topicsPerDay > 20) {
      warning = `Невъзможно! ${remainingTopics} теми за ${daysLeft}д`;
    } else if (topicsPerDay > 10) {
      warning = 'Много тежко!';
    }

    bySubject.push({
      subjectId: subject.id,
      subjectName: subject.name,
      topics: topicsPerDay,
      remaining: remainingTopics,
      daysLeft,
      urgency,
      warning
    });
  }

  // Sort by urgency then by days left
  bySubject.sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    return a.daysLeft - b.daysLeft;
  });

  // Calculate total
  let total = bySubject.reduce((sum, s) => sum + s.topics, 0);

  // Apply sick/holiday modifiers
  const modifier = calculateEffectiveHours(status);
  if (modifier < 1) {
    total = Math.max(1, Math.ceil(total * modifier));
    bySubject.forEach(s => {
      s.topics = Math.max(1, Math.ceil(s.topics * modifier));
    });
  }

  // Apply vacation mode multiplier
  if (studyGoals?.vacationMode && studyGoals.vacationMultiplier < 1) {
    const vacationMult = studyGoals.vacationMultiplier;
    total = Math.max(1, Math.ceil(total * vacationMult));
    bySubject.forEach(s => {
      s.topics = Math.max(1, Math.ceil(s.topics * vacationMult));
    });
  }

  return { total, bySubject };
}

/**
 * Detect if Crunch Mode should be active based on workload and exam proximity
 * Crunch Mode prioritizes covering more small topics over fewer large topics
 */
export function detectCrunchMode(subjects: Subject[]): CrunchModeStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const urgentSubjects: CrunchModeStatus['urgentSubjects'] = [];
  let maxWorkloadPerDay = 0;
  let hasCriticalExam = false;

  for (const subject of subjects) {
    if (!subject.examDate) continue;

    const examDate = new Date(subject.examDate);
    examDate.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Skip past exams
    if (daysLeft <= 0) continue;

    const remainingTopics = subject.topics.filter(t => t.status !== 'green').length;
    if (remainingTopics === 0) continue;

    const workloadPerDay = Math.round((remainingTopics / daysLeft) * 10) / 10;
    maxWorkloadPerDay = Math.max(maxWorkloadPerDay, workloadPerDay);

    if (daysLeft <= CRUNCH_MODE_THRESHOLDS.daysUntilExamCritical) {
      hasCriticalExam = true;
    }

    if (workloadPerDay >= 3) {
      urgentSubjects.push({
        name: subject.name,
        daysLeft,
        workloadPerDay
      });
    }
  }

  // Crunch mode conditions
  const isActive = maxWorkloadPerDay > CRUNCH_MODE_THRESHOLDS.workloadPerDayHigh ||
    (hasCriticalExam && maxWorkloadPerDay > CRUNCH_MODE_THRESHOLDS.workloadPerDayCritical);

  let reason = '';
  const tips: string[] = [];

  if (isActive) {
    if (maxWorkloadPerDay > 10) {
      reason = 'КРИТИЧНО натоварване!';
      tips.push('Фокусирай се на МАЛКИ (S) сиви теми за бързо покритие');
      tips.push('Прегледай само ключовите точки от големите теми');
      tips.push('Използвай Quiz за затвърждаване, не за учене');
    } else if (hasCriticalExam) {
      reason = 'Изпит скоро + високо натоварване';
      tips.push('Приоритизирай ключови теми');
      tips.push('Малките теми дават бързи победи');
      tips.push('Групирай свързани теми за ефективност');
    } else {
      reason = 'Високо натоварване';
      tips.push('Планирай по размер: първо S, после M');
      tips.push('Големите (L) теми раздели на 2-3 сесии');
    }
  }

  return {
    isActive,
    reason,
    urgentSubjects: urgentSubjects.sort((a, b) => a.daysLeft - b.daysLeft),
    tips
  };
}

export function calculatePredictedGrade(
  subject: Subject,
  vayneMode: boolean = false,
  questionBanks: QuestionBank[] = []
): PredictedGrade {
  const topics = subject.topics;
  const totalTopics = topics.length;

  if (totalTopics === 0) {
    return {
      current: 2,
      vayne: 2,
      improvement: 0,
      factors: [],
      tips: ['Добави теми към предмета за да получиш прогноза.'],
      message: MOTIVATIONAL_MESSAGES.low[0]
    };
  }

  const statusCounts = {
    green: topics.filter(t => t.status === 'green').length,
    yellow: topics.filter(t => t.status === 'yellow').length,
    orange: topics.filter(t => t.status === 'orange').length,
    gray: topics.filter(t => t.status === 'gray').length
  };

  // 1. Coverage Score (0-1)
  let coverageScore = (
    statusCounts.green * 1.0 +
    statusCounts.yellow * 0.7 +
    statusCounts.orange * 0.3
  ) / totalTopics;

  // 2. Mastery Score - average quiz grade
  const gradedTopics = topics.filter(t => t.avgGrade !== null);
  const avgQuizGrade = gradedTopics.length > 0
    ? gradedTopics.reduce((sum, t) => sum + (t.avgGrade || 0), 0) / gradedTopics.length
    : 3.5;

  // 3. Consistency Score - topics reviewed in last 7 days
  const recentlyReviewedCount = topics.filter(t => {
    const days = getDaysSince(t.lastReview);
    return days <= 7;
  }).length;
  let consistencyScore = recentlyReviewedCount / totalTopics;

  // 4. Time Pressure Factor
  const daysUntilExam = getDaysUntil(subject.examDate);
  let timeFactor = 1.0;
  if (daysUntilExam <= 3) timeFactor = 0.7;
  else if (daysUntilExam <= 7) timeFactor = 0.85;
  else if (daysUntilExam <= 14) timeFactor = 0.95;

  // 5. Decay Risk
  const notReviewedIn5Days = topics.filter(t => {
    const days = getDaysSince(t.lastReview);
    return days >= 5 && t.status !== 'gray';
  }).length;
  let decayRisk = notReviewedIn5Days / totalTopics;

  // 6. Question Bank Performance (NEW)
  const subjectBanks = questionBanks.filter(b => b.subjectId === subject.id);
  const allQuestions = subjectBanks.flatMap(b => b.questions);
  const attemptedQuestions = allQuestions.filter(q => q.stats.attempts > 0);

  let questionBankScore = 0;
  let questionBankAccuracy = 0;
  let hasQuestionBankData = false;

  if (attemptedQuestions.length >= 5) {  // Minimum 5 attempts for meaningful data
    hasQuestionBankData = true;
    const totalAttempts = attemptedQuestions.reduce((sum, q) => sum + q.stats.attempts, 0);
    const totalCorrect = attemptedQuestions.reduce((sum, q) => sum + q.stats.correct, 0);
    questionBankAccuracy = totalCorrect / totalAttempts;  // 0-1

    // Convert to score: 50% = 0, 100% = 1, below 50% = negative
    questionBankScore = (questionBankAccuracy - 0.5) * 2;  // -1 to 1
  }

  // Vayne mode adjustments
  if (vayneMode) {
    coverageScore = Math.min(1, coverageScore * 1.3);
    consistencyScore = Math.min(1, consistencyScore + 0.5);
    decayRisk = decayRisk * 0.5;
    if (hasQuestionBankData) questionBankScore = Math.min(1, questionBankScore + 0.2);
  }

  // Final calculation - Question Bank влияе с до 0.5 точки
  const baseGrade = (coverageScore * 3 + (avgQuizGrade / 6) * 3) * timeFactor;
  const consistencyBonus = consistencyScore * 0.5;
  const decayPenalty = decayRisk * 0.5;
  const questionBankBonus = hasQuestionBankData ? questionBankScore * 0.5 : 0;

  let predicted = baseGrade + consistencyBonus - decayPenalty + questionBankBonus + 2;
  predicted = Math.min(6, Math.max(2, predicted));
  predicted = Math.round(predicted * 4) / 4;

  // Calculate both modes without recursion
  // For vayne prediction, we pre-calculate the boost
  let vaynePrediction = predicted;
  if (!vayneMode) {
    // Calculate vayne mode boost directly
    const vayneBoost =
      Math.min(1, coverageScore * 1.3) * 3 +
      (avgQuizGrade / 6) * 3;
    const vayneConsistency = Math.min(1, consistencyScore + 0.5);
    const vayneDecay = decayRisk * 0.5;
    const vayneQBBonus = hasQuestionBankData ? Math.min(1, questionBankScore + 0.2) * 0.5 : 0;
    vaynePrediction = (vayneBoost * timeFactor) + (vayneConsistency * 0.5) - vayneDecay + vayneQBBonus + 2;
    vaynePrediction = Math.min(6, Math.max(2, vaynePrediction));
    vaynePrediction = Math.round(vaynePrediction * 4) / 4;
  }
  const currentPrediction = predicted;

  // Generate factors
  const factors: GradeFactor[] = [
    {
      name: 'coverage',
      value: Math.round(coverageScore * 100),
      maxValue: 100,
      label: 'Покритие на материала',
      impact: coverageScore >= 0.7 ? 'positive' : coverageScore >= 0.4 ? 'neutral' : 'negative'
    },
    {
      name: 'mastery',
      value: avgQuizGrade,
      maxValue: 6,
      label: 'Средна оценка от тестове',
      impact: avgQuizGrade >= 5 ? 'positive' : avgQuizGrade >= 4 ? 'neutral' : 'negative'
    },
    {
      name: 'consistency',
      value: Math.round(consistencyScore * 100),
      maxValue: 100,
      label: 'Редовност на преговаряне',
      impact: consistencyScore >= 0.5 ? 'positive' : consistencyScore >= 0.3 ? 'neutral' : 'negative'
    },
    {
      name: 'time',
      value: Math.round(timeFactor * 100),
      maxValue: 100,
      label: 'Времеви фактор',
      impact: timeFactor >= 0.95 ? 'positive' : timeFactor >= 0.85 ? 'neutral' : 'negative'
    },
    {
      name: 'decay',
      value: Math.round((1 - decayRisk) * 100),
      maxValue: 100,
      label: 'Запазване на знанията',
      impact: decayRisk <= 0.2 ? 'positive' : decayRisk <= 0.4 ? 'neutral' : 'negative'
    }
  ];

  // Add Question Bank factor if we have data
  if (hasQuestionBankData) {
    factors.push({
      name: 'questionBank',
      value: Math.round(questionBankAccuracy * 100),
      maxValue: 100,
      label: `Сборници (${attemptedQuestions.length} въпроса)`,
      impact: questionBankAccuracy >= 0.7 ? 'positive' : questionBankAccuracy >= 0.5 ? 'neutral' : 'negative'
    });
  }

  // Generate tips based on weak factors
  const tips: string[] = [];
  if (coverageScore < 0.5) tips.push('Фокусирай се върху незапочнатите теми.');
  if (avgQuizGrade < 4.5) tips.push('Направи повече тестове за да подобриш средната си оценка.');
  if (consistencyScore < 0.3) tips.push('Преговаряй редовно - поне 3-4 теми на седмица.');
  if (decayRisk > 0.3) tips.push('Внимание! Много теми са в риск от забравяне.');
  if (daysUntilExam <= 7) tips.push('Изпитът наближава! Максимизирай учебните часове.');
  if (hasQuestionBankData && questionBankAccuracy < 0.5) tips.push('Практикувай повече от сборниците - accuracy е под 50%.');

  // Monte Carlo simulation for exam outcomes
  const examFormat = parseExamFormat(subject.examFormat);
  const topicsOnExam = examFormat?.totalTopics || Math.min(5, Math.ceil(totalTopics * 0.1));
  const simulation = simulateExamOutcome(topics, topicsOnExam);

  // Add simulation-based tips
  if (simulation.criticalTopics.length > 0) {
    tips.push(`⚠️ ${simulation.criticalTopics.length} критични теми могат да свалят оценката.`);
  }
  if (simulation.impactTopics.length > 0) {
    const topImpact = simulation.impactTopics[0];
    tips.push(`📈 Научи "${topImpact.topicName}" за +${topImpact.impact.toFixed(2)} към worst case.`);
  }

  // Format gap analysis
  const formatAnalysis = analyzeFormatGaps(subject);
  if (formatAnalysis.formatTip) {
    tips.push(formatAnalysis.formatTip);
  }

  if (tips.length === 0) tips.push('Продължавай в същия дух!');

  // Select motivational message
  let messageCategory: 'low' | 'medium' | 'high' = 'medium';
  if (predicted < 4) messageCategory = 'low';
  else if (predicted >= 5) messageCategory = 'high';
  const messages = MOTIVATIONAL_MESSAGES[messageCategory];
  const message = messages[Math.floor(Math.random() * messages.length)];

  return {
    current: vayneMode ? vaynePrediction : currentPrediction,
    vayne: vaynePrediction,
    improvement: vaynePrediction - currentPrediction,
    factors,
    tips,
    message,
    simulation: {
      bestCase: simulation.bestCase,
      worstCase: simulation.worstCase,
      variance: simulation.variance,
      criticalTopics: simulation.criticalTopics,
      impactTopics: simulation.impactTopics
    },
    formatAnalysis
  };
}

/**
 * Select topics while keeping related topics together
 * Returns topics sorted/grouped by relations
 */
function selectTopicsWithRelations(
  allTopics: Topic[],
  maxCount: number,
  inCrunchMode: boolean = false
): Topic[] {
  if (allTopics.length === 0 || maxCount <= 0) return [];

  // Sort by priority first
  const sorted = [...allTopics].sort((a, b) => getTopicPriority(a, inCrunchMode) - getTopicPriority(b, inCrunchMode));

  const selected: Topic[] = [];
  const selectedIds = new Set<string>();

  for (const topic of sorted) {
    if (selected.length >= maxCount) break;
    if (selectedIds.has(topic.id)) continue;

    // Add this topic
    selected.push(topic);
    selectedIds.add(topic.id);
  }

  // Sort by topic number
  return selected.sort((a, b) => a.number - b.number);
}

export function generateDailyPlan(
  subjects: Subject[],
  schedule: ScheduleClass[],
  dailyStatus: DailyStatus,
  studyGoals?: StudyGoals
): DailyTask[] {
  const tasks: DailyTask[] = [];

  // Detect crunch mode for priority calculation (disabled in vacation mode)
  const crunchStatus = detectCrunchMode(subjects);
  const inCrunchMode = studyGoals?.vacationMode === true ? false : crunchStatus.isActive;

  // Get topic-based workload from calculateDailyTopics (vacation mode applied inside)
  const workload = calculateDailyTopics(subjects, dailyStatus, studyGoals);
  let remainingTopics = workload.total;

  if (remainingTopics === 0) return tasks;

  // DYNAMIC QUOTA for new material based on urgency
  // More gray topics + closer exam = higher quota for new material
  const totalTopics = subjects.reduce((sum, s) => sum + s.topics.length, 0);
  const totalGrayTopics = subjects.reduce((sum, s) =>
    sum + s.topics.filter(t => t.status === 'gray').length, 0);
  const grayPercentage = totalTopics > 0 ? totalGrayTopics / totalTopics : 0;

  // Find closest exam
  const closestExamDays = Math.min(
    ...subjects
      .filter(s => s.examDate)
      .map(s => getDaysUntil(s.examDate))
      .filter(d => d > 0),
    Infinity
  );

  // Calculate dynamic quota (30-50%)
  let newMaterialQuota = NEW_MATERIAL_QUOTA; // base 25%
  if (grayPercentage > 0.6) {
    newMaterialQuota = 0.45; // 60%+ gray → 45% quota
  } else if (grayPercentage > 0.4 && closestExamDays < 14) {
    newMaterialQuota = 0.50; // 40%+ gray AND exam <14 days → 50% quota
  } else if (grayPercentage > 0.4) {
    newMaterialQuota = 0.40; // 40%+ gray → 40% quota
  } else if (closestExamDays < 7 && grayPercentage > 0.2) {
    newMaterialQuota = 0.40; // Exam <7 days AND 20%+ gray → 40%
  } else {
    newMaterialQuota = 0.30; // Default 30%
  }

  const reservedForNew = Math.min(
    Math.ceil(remainingTopics * newMaterialQuota),
    totalGrayTopics
  );

  // Capacity for Tier 1-2 (critical exams, exercises)
  // New material is now Tier 3, FSRS is Tier 4
  let capacityForPriority = Math.max(0, remainingTopics - reservedForNew);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = (tomorrow.getDay() + 6) % 7; // Convert to Mon=0

  // Create a map of subject workload for reference
  const subjectWorkload = new Map(workload.bySubject.map(s => [s.subjectId, s]));

  // 1. CRITICAL: Exercises tomorrow - take topics from that subject's workload
  const tomorrowExercises = schedule.filter(
    c => c.day === tomorrowDay && CLASS_TYPES[c.type].prepRequired
  );

  for (const exercise of tomorrowExercises) {
    const subject = subjects.find(s => s.id === exercise.subjectId);
    if (!subject || subject.topics.length === 0) continue;

    const subjectWork = subjectWorkload.get(subject.id);
    const topicsToTake = subjectWork ? Math.min(subjectWork.topics, capacityForPriority) : Math.min(5, capacityForPriority);

    // Select topics with related grouping
    const candidates = subject.topics.filter(t => t.status !== 'green');
    const weakTopics = selectTopicsWithRelations(candidates, topicsToTake, inCrunchMode);

    if (weakTopics.length > 0) {
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'critical',
        typeLabel: `${CLASS_TYPES[exercise.type].icon} ${CLASS_TYPES[exercise.type].label} утре`,
        description: `Подготовка за ${CLASS_TYPES[exercise.type].label.toLowerCase()}`,
        topics: weakTopics,
        estimatedMinutes: weakTopics.length * 20, // ~20 min per topic
        completed: false
      });
      capacityForPriority -= weakTopics.length;
    }
  }

  // 2. HIGH: Subjects with exams - use their calculated daily workload
  for (const subjectWork of workload.bySubject) {
    if (capacityForPriority <= 0) break;

    const subject = subjects.find(s => s.id === subjectWork.subjectId);
    if (!subject) continue;

    // Skip if already added as critical
    if (tasks.some(t => t.subjectId === subject.id && t.type === 'critical')) continue;

    const topicsToTake = Math.min(subjectWork.topics, capacityForPriority);

    // Check exam format for special recommendations
    const examFormat = parseExamFormat(subject.examFormat);
    const formatGaps = analyzeFormatGaps(subject);

    // Select topics with related grouping
    const candidates = subject.topics.filter(t => t.status !== 'green');
    const weakTopics = selectTopicsWithRelations(candidates, topicsToTake, inCrunchMode);

    if (weakTopics.length > 0) {
      // Format-aware description
      let description = 'Интензивна подготовка за изпит';
      if (formatGaps.caseWeakness && examFormat?.cases) {
        description = `Фокус върху казуси (${examFormat.cases} на изпита) + слаби теми`;
      } else if (formatGaps.hasOpenQuestions && examFormat?.openQuestions) {
        description = `Упражнявай писмени отговори (${examFormat.openQuestions} на изпита)`;
      } else if (examFormat?.mcq) {
        description = `MCQ практика (${examFormat.mcq} на изпита) - покрий повече теми`;
      }

      const taskType = subjectWork.urgency === 'critical' ? 'critical' :
                       subjectWork.urgency === 'high' ? 'high' : 'medium';

      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: taskType,
        typeLabel: `📝 Изпит след ${subjectWork.daysLeft} ${subjectWork.daysLeft === 1 ? 'ден' : 'дни'}`,
        description,
        topics: weakTopics,
        estimatedMinutes: weakTopics.length * 20,
        completed: false
      });
      capacityForPriority -= weakTopics.length;
    }
  }

  // 3. NEW MATERIAL - Higher priority than reviews!
  // Coverage is more important than retention polish
  // Uses dynamic quota (30-50%) based on gray% and exam proximity
  const availableForNew = reservedForNew + Math.max(0, capacityForPriority);
  let capacityAfterNew = capacityForPriority; // Track remaining for FSRS

  if (availableForNew > 0) {
    // Collect all gray topics from subjects with exams, sorted by urgency
    const subjectsWithGray = subjects
      .filter(s => {
        const daysUntilExam = getDaysUntil(s.examDate);
        return daysUntilExam !== Infinity && s.topics.some(t => t.status === 'gray');
      })
      .map(s => ({
        subject: s,
        grayTopics: s.topics.filter(t => t.status === 'gray'),
        daysUntilExam: getDaysUntil(s.examDate),
        priority: s.topics.filter(t => t.status === 'gray').length / Math.max(1, getDaysUntil(s.examDate))
      }))
      .sort((a, b) => b.priority - a.priority);

    let newMaterialBudget = availableForNew;

    for (const { subject, grayTopics, daysUntilExam } of subjectsWithGray) {
      if (newMaterialBudget <= 0) break;

      // Calculate how many topics to take from this subject
      // Prioritize subjects with more gray topics relative to time
      const topicsToTake = Math.min(
        newMaterialBudget,
        Math.ceil(grayTopics.length / Math.max(1, daysUntilExam) * 2), // Scale by urgency
        grayTopics.length,
        5 // Max 5 per subject
      );

      if (topicsToTake > 0) {
        const selectedTopics = selectTopicsWithRelations(grayTopics, topicsToTake, inCrunchMode);

        if (selectedTopics.length > 0) {
          // Check if there's already a task for this subject
          const existingTask = tasks.find(t => t.subjectId === subject.id);

          if (existingTask && existingTask.type !== 'critical') {
            // Add to existing task
            existingTask.topics.push(...selectedTopics);
            existingTask.estimatedMinutes += selectedTopics.length * 20;
            existingTask.description += ' + нов материал';
          } else {
            // Create new task - NOW MEDIUM PRIORITY (tier 3)
            tasks.push({
              id: generateId(),
              subjectId: subject.id,
              subjectName: subject.name,
              subjectColor: subject.color,
              type: 'medium',
              typeLabel: `📚 Нов материал (${Math.round(newMaterialQuota * 100)}%)`,
              description: `Покрий нови теми - ${Math.round(grayPercentage * 100)}% непокрити`,
              topics: selectedTopics,
              estimatedMinutes: selectedTopics.length * 20,
              completed: false
            });
          }

          newMaterialBudget -= selectedTopics.length;
          capacityAfterNew -= selectedTopics.length;
        }
      }
    }
  }

  // 4. FSRS Reviews - After new material, use remaining capacity
  // Reviews are "polish" - important but not as urgent as coverage
  const vacationDecayMultiplier = studyGoals?.vacationMode === true ? 1.5 : 1.0;
  const fsrsParams = getFSRSParams(studyGoals);

  if (capacityAfterNew > 0) {
    // 4a. FSRS-based reviews
    const fsrsReviews = getTopicsNeedingFSRSReview(subjects, Math.min(capacityAfterNew, fsrsParams.maxDailyReviews));

    if (fsrsReviews.length > 0) {
      // Group by subject
      const bySubject = new Map<string, typeof fsrsReviews>();
      for (const item of fsrsReviews) {
        const existing = bySubject.get(item.subject.id) || [];
        existing.push(item);
        bySubject.set(item.subject.id, existing);
      }

      for (const [subjectId, items] of bySubject) {
        if (capacityAfterNew <= 0) break;
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) continue;

        const topicsToTake = Math.min(items.length, capacityAfterNew, 4);
        const selectedTopics = items.slice(0, topicsToTake).map(i => i.topic);
        const avgR = Math.round(items.slice(0, topicsToTake).reduce((s, i) => s + i.retrievability, 0) / topicsToTake * 100);

        tasks.push({
          id: generateId(),
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          type: 'normal',
          typeLabel: '🧠 FSRS Review',
          description: `Spaced repetition (${avgR}% памет)`,
          topics: selectedTopics,
          estimatedMinutes: selectedTopics.length * 15, // Reviews are faster
          completed: false
        });
        capacityAfterNew -= selectedTopics.length;
      }
    }

    // 4b. Legacy decay-based reviews (for topics without FSRS state)
    for (const subject of subjects) {
      if (capacityAfterNew <= 0) break;

      // Only consider topics WITHOUT fsrs state (legacy)
      const decayingTopics = subject.topics.filter(t => {
        if (t.status === 'gray') return false;
        if (t.fsrs) return false; // Skip FSRS topics, already handled
        const days = getDaysSince(t.lastReview);
        const baseWarningDays = getDecayWarningDays(t);
        const warningDays = Math.round(baseWarningDays * vacationDecayMultiplier);
        return days >= warningDays;
      });

      if (decayingTopics.length > 0 && capacityAfterNew > 0) {
        const topicsToTake = Math.min(Math.ceil(capacityAfterNew * 0.3), decayingTopics.length, 5);
        const selectedTopics = selectTopicsWithRelations(decayingTopics, topicsToTake, inCrunchMode);
        if (selectedTopics.length === 0) continue;
        const avgWarningDays = Math.round(
          selectedTopics.reduce((sum, t) => sum + getDecayWarningDays(t), 0) / selectedTopics.length
        );
        tasks.push({
          id: generateId(),
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          type: 'normal',
          typeLabel: '⚠️ Преговор',
          description: `Теми без review ${avgWarningDays}+ дни`,
          topics: selectedTopics,
          estimatedMinutes: selectedTopics.length * 20,
          completed: false
        });
        capacityAfterNew -= selectedTopics.length;
      }
    }
  }

  return tasks;
}

export function parseTopicsFromText(text: string): Omit<Topic, 'id'>[] {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.map((line, index) => {
    const match = line.match(/^(\d+)[\.\)\-\s]+(.+)$/);
    const name = match ? match[2].trim() : line.trim();
    return {
      number: index + 1,
      name,
      status: 'gray' as TopicStatus,
      lastReview: null,
      grades: [],
      avgGrade: null,
      quizCount: 0,
      material: '',
      materialImages: [],
      currentBloomLevel: 1 as const,
      quizHistory: [],
      readCount: 0,
      lastRead: null,
      // Smart Scheduling fields
      size: null,
      sizeSetBy: null,
      // Gap Analysis
      wrongAnswers: [],
      // Reader Mode
      highlights: []
    };
  });
}

export function getSubjectProgress(subject: Subject): {
  percentage: number;
  counts: Record<TopicStatus, number>;
} {
  const counts: Record<TopicStatus, number> = {
    gray: 0,
    orange: 0,
    yellow: 0,
    green: 0
  };

  for (const topic of subject.topics) {
    counts[topic.status]++;
  }

  const total = subject.topics.length;
  if (total === 0) return { percentage: 0, counts };

  const weighted =
    counts.green * STATUS_CONFIG.green.weight +
    counts.yellow * STATUS_CONFIG.yellow.weight +
    counts.orange * STATUS_CONFIG.orange.weight;

  return {
    percentage: Math.round((weighted / total) * 100),
    counts
  };
}

export function getAlerts(
  subjects: Subject[],
  schedule: ScheduleClass[],
  studyGoals?: StudyGoals
): {
  type: 'critical' | 'warning' | 'info';
  message: string;
  subjectId?: string;
}[] {
  const alerts: { type: 'critical' | 'warning' | 'info'; message: string; subjectId?: string }[] = [];

  // In vacation mode, extend decay thresholds by 50%
  const decayMultiplier = studyGoals?.vacationMode === true ? 1.5 : 1.0;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = (tomorrow.getDay() + 6) % 7;

  // Check for exercises tomorrow
  const tomorrowExercises = schedule.filter(
    c => c.day === tomorrowDay && CLASS_TYPES[c.type].prepRequired
  );

  for (const exercise of tomorrowExercises) {
    const subject = subjects.find(s => s.id === exercise.subjectId);
    if (subject) {
      alerts.push({
        type: 'critical',
        message: `${CLASS_TYPES[exercise.type].icon} ${subject.name}: ${CLASS_TYPES[exercise.type].label} утре!`,
        subjectId: subject.id
      });
    }
  }

  // Check for upcoming exams
  for (const subject of subjects) {
    const days = getDaysUntil(subject.examDate);
    if (days >= 0 && days <= 7) {
      alerts.push({
        type: days <= 3 ? 'critical' : 'warning',
        message: `📝 ${subject.name}: изпит след ${days} ${days === 1 ? 'ден' : 'дни'}`,
        subjectId: subject.id
      });
    }
  }

  // Check for decay warnings (using adaptive thresholds)
  // In vacation mode, thresholds are extended so fewer warnings appear
  for (const subject of subjects) {
    const decayingCount = subject.topics.filter(t => {
      if (t.status === 'gray') return false;
      const days = getDaysSince(t.lastReview);
      const baseWarningDays = getDecayWarningDays(t);  // Adaptive threshold
      const warningDays = Math.round(baseWarningDays * decayMultiplier);
      return days >= warningDays;
    }).length;

    if (decayingCount >= 3) {
      alerts.push({
        type: 'warning',
        message: `⚠️ ${subject.name}: ${decayingCount} теми в риск от забравяне`,
        subjectId: subject.id
      });
    }
  }

  // Check for subjects missing setup (PRIORITY alerts before studying)
  for (const subject of subjects) {
    const setup = getSubjectSetupStatus(subject);

    // No topics = highest priority - can't study without syllabus
    if (!setup.hasTopics) {
      alerts.unshift({
        type: 'critical',
        message: `📋 ${subject.name}: добави конспект/теми преди да учиш!`,
        subjectId: subject.id
      });
    }
    // No exam date set - important for planning
    else if (!setup.hasExamDate) {
      alerts.unshift({
        type: 'warning',
        message: `📅 ${subject.name}: задай дата на изпит за по-добро планиране`,
        subjectId: subject.id
      });
    }
    // No material entered for any topic
    else if (!setup.hasMaterial) {
      alerts.unshift({
        type: 'warning',
        message: `📝 ${subject.name}: добави материал поне за някои теми`,
        subjectId: subject.id
      });
    }
    // No quizzes taken yet
    else if (!setup.hasQuizzes) {
      alerts.unshift({
        type: 'info',
        message: `🧪 ${subject.name}: направи поне 1 тест за да оценим знанията ти`,
        subjectId: subject.id
      });
    }
  }

  return alerts;
}

/**
 * Check subject setup completeness
 * Returns what data the user has entered vs what's missing
 */
export interface SubjectSetupStatus {
  hasTopics: boolean;           // Has at least 1 topic (syllabus entered)
  hasExamDate: boolean;         // Has exam date set
  hasMaterial: boolean;         // At least 1 topic has material
  hasQuizzes: boolean;          // At least 1 quiz taken
  topicsWithMaterial: number;   // Count of topics with material
  topicsWithQuizzes: number;    // Count of topics with quizzes
  completenessScore: number;    // 0-100 percentage
  isReadyForPlanning: boolean;  // Has minimum data for effective planning
}

export function getSubjectSetupStatus(subject: Subject): SubjectSetupStatus {
  const hasTopics = subject.topics.length > 0;
  const hasExamDate = subject.examDate !== null;

  const topicsWithMaterial = subject.topics.filter(t =>
    (t.material?.trim()?.length ?? 0) > 0 ||
    (Array.isArray(t.materialImages) && t.materialImages.length > 0)
  ).length;

  const topicsWithQuizzes = subject.topics.filter(t =>
    t.quizCount > 0 || (t.quizHistory && t.quizHistory.length > 0)
  ).length;

  const hasMaterial = topicsWithMaterial > 0;
  const hasQuizzes = topicsWithQuizzes > 0;

  // Calculate completeness score (weighted)
  // 30% topics, 20% exam date, 25% material, 25% quizzes
  let score = 0;
  if (hasTopics) score += 30;
  if (hasExamDate) score += 20;
  if (hasMaterial) {
    const materialCoverage = Math.min(topicsWithMaterial / Math.max(subject.topics.length, 1), 1);
    score += 25 * materialCoverage;
  }
  if (hasQuizzes) {
    const quizCoverage = Math.min(topicsWithQuizzes / Math.max(subject.topics.length, 1), 1);
    score += 25 * quizCoverage;
  }

  // Ready for planning if has topics + exam date + (material OR quizzes)
  const isReadyForPlanning = hasTopics && hasExamDate && (hasMaterial || hasQuizzes);

  return {
    hasTopics,
    hasExamDate,
    hasMaterial,
    hasQuizzes,
    topicsWithMaterial,
    topicsWithQuizzes,
    completenessScore: Math.round(score),
    isReadyForPlanning
  };
}
