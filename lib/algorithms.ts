import { Subject, Topic, TopicStatus, DailyStatus, PredictedGrade, DailyTask, ScheduleClass, GradeFactor, parseExamFormat, QuestionBank, CrunchModeStatus, StudyGoals, FSRSState, DevelopmentProject, ProjectModule, AcademicEvent, AcademicPeriod, StudyTechnique, TechniquePractice } from './types';
import { DECAY_RULES, STATUS_CONFIG, MOTIVATIONAL_MESSAGES, CLASS_TYPES, CRUNCH_MODE_THRESHOLDS, TOPIC_SIZE_CONFIG, DECAY_THRESHOLDS, ACADEMIC_EVENT_CONFIG } from './constants';

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
  targetR: 0.75,            // Schedule review when R drops to 75% (topics survive longer than cards)
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
  if (!fsrs.stability || fsrs.stability <= 0 || !isFinite(fsrs.stability)) return 0;

  const R = Math.exp(-daysSinceReview / fsrs.stability);
  return Math.max(0, Math.min(1, R));
}

/**
 * Calculate days until retrievability drops to target threshold
 * Solving: targetR = e^(-t/S) → t = -S * ln(targetR)
 */
export function getDaysUntilReview(fsrs: FSRSState, studyGoals?: StudyGoals): number {
  if (!fsrs.stability || fsrs.stability <= 0 || !isFinite(fsrs.stability)) return 0;
  const targetR = studyGoals?.fsrsTargetRetention ?? FSRS_PARAMS.targetR;
  const daysUntil = -fsrs.stability * Math.log(targetR);
  const daysSinceReview = getDaysSince(fsrs.lastReview);
  return Math.max(0, Math.round(daysUntil - daysSinceReview));
}

/**
 * Check if topic needs review based on retrievability
 */
export function topicNeedsReview(topic: Topic, studyGoals?: StudyGoals): boolean {
  if (!topic.fsrs) return false; // No FSRS state = use old decay system

  const targetR = studyGoals?.fsrsTargetRetention ?? FSRS_PARAMS.targetR;
  const R = calculateRetrievability(topic.fsrs);
  return R <= targetR;
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
    lastReview: getTodayString(),
    reps: rating >= 1 ? 1 : 0, // Count as rep only if not "Again"
    lapses: rating === 0 ? 1 : 0
  };
}

/**
 * Update FSRS state after a quiz
 * Core FSRS algorithm adapted for topics
 */
export function updateFSRS(currentFsrs: FSRSState, quizScore: number, studyGoals?: StudyGoals): FSRSState {
  const FSRS = getFSRSParams(studyGoals);
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
    newD = Math.min(FSRS.maxD, currentFsrs.difficulty + 0.1);
  } else {
    // SUCCESS: Grow stability
    newReps++;

    // Stability growth formula (simplified FSRS)
    // Higher R at review → less stability growth (reviewed too early)
    // Lower difficulty → more stability growth
    const growthFactor = FSRS.factor * (1 - currentFsrs.difficulty * 0.3);
    const retrievabilityBonus = 1 + (1 - R) * 0.5; // Bonus for reviewing when R is lower
    const ratingBonus = 1 + (rating - 1) * 0.15; // Easy = more growth

    newS = currentFsrs.stability * growthFactor * retrievabilityBonus * ratingBonus * FSRS.topicMultiplier;
    // Cap growth to max 4.5x per review (higher than cards — topics are bigger units)
    newS = Math.min(currentFsrs.stability * 4.5, newS);
    newS = Math.min(FSRS.maxInterval, Math.max(FSRS.minInterval, newS));

    // Difficulty decreases slightly on success
    const dChange = (rating - 2) * 0.05; // Hard: -0.05, Good: 0, Easy: +0.05 (subtracted below)
    newD = Math.max(FSRS.minD, Math.min(FSRS.maxD, currentFsrs.difficulty - dChange));
  }

  return {
    stability: Math.round(newS * 10) / 10,
    difficulty: Math.round(newD * 100) / 100,
    lastReview: getTodayString(),
    reps: newReps,
    lapses: newLapses
  };
}

/**
 * Get topics that need review today, sorted by urgency
 * Exam-aware: includes topics whose next review is scheduled AFTER the exam
 */
export function getTopicsNeedingFSRSReview(
  subjects: Subject[],
  maxReviews: number = Infinity,
  studyGoals?: StudyGoals
): Array<{ topic: Topic; subject: Subject; urgency: number; retrievability: number }> {
  const FSRS = getFSRSParams(studyGoals);
  const needsReview: Array<{ topic: Topic; subject: Subject; urgency: number; retrievability: number }> = [];

  for (const subject of subjects) {
    if (subject.archived || subject.deletedAt) continue;
    const daysUntilExam = getDaysUntil(subject.examDate);

    for (const topic of subject.topics) {
      if (!topic.fsrs) continue;

      const R = calculateRetrievability(topic.fsrs);
      const daysUntilNextReview = getDaysUntilReview(topic.fsrs, studyGoals);

      // Include if:
      // 1. Below retention threshold (standard FSRS), OR
      // 2. Next review would be AFTER the exam (no point reviewing after exam)
      const belowThreshold = R <= FSRS.targetR;
      const reviewAfterExam = daysUntilExam !== Infinity && daysUntilExam > 0
        && daysUntilNextReview > daysUntilExam;

      if (belowThreshold || reviewAfterExam) {
        // Urgency: combine threshold distance + exam pressure
        let urgency = (FSRS.targetR - R) / FSRS.targetR;
        if (reviewAfterExam && !belowThreshold) {
          // Not technically due yet, but needs pre-exam review — moderate urgency
          urgency = Math.max(urgency, 0.1);
        }
        needsReview.push({ topic, subject, urgency, retrievability: R });
      }
    }
  }

  // Sort by urgency (most urgent first)
  needsReview.sort((a, b) => b.urgency - a.urgency);

  return maxReviews === Infinity ? needsReview : needsReview.slice(0, maxReviews);
}

/**
 * Get project modules that need FSRS review
 * Similar to getTopicsNeedingFSRSReview but for project modules
 * Used in Tier 6b (lowest priority - after all university work)
 */
export function getModulesNeedingFSRSReview(
  projects: DevelopmentProject[],
  maxReviews: number = 4,
  studyGoals?: StudyGoals
): Array<{
  project: DevelopmentProject;
  module: ProjectModule;
  urgency: number;
  retrievability: number;
}> {
  const FSRS = getFSRSParams(studyGoals);
  const needsReview: Array<{
    project: DevelopmentProject;
    module: ProjectModule;
    urgency: number;
    retrievability: number;
  }> = [];

  for (const project of projects) {
    // Only active projects
    if (project.status !== 'active') continue;

    for (const module of project.modules) {
      // Only modules with FSRS state (have had at least one quiz)
      if (!module.fsrs) continue;

      const R = calculateRetrievability(module.fsrs);

      // Include if below threshold
      if (R <= FSRS.targetR) {
        const urgency = (FSRS.targetR - R) / FSRS.targetR;
        needsReview.push({ project, module, urgency, retrievability: R });
      }
    }
  }

  // Sort by urgency (most urgent first)
  needsReview.sort((a, b) => b.urgency - a.urgency);

  // Cap at maxReviews (default 4 for modules)
  return needsReview.slice(0, maxReviews);
}

/**
 * Get upcoming academic events (колоквиуми, контролни, etc.)
 * Returns events sorted by urgency, used in Tier 2.5 of daily planner
 */
export function getUpcomingAcademicEvents(
  events: AcademicEvent[],
  subjects: Subject[],
  maxDaysAhead: number = 21
): Array<{
  event: AcademicEvent;
  subject: Subject;
  daysUntil: number;
  urgency: 'high' | 'medium' | 'low';
}> {
  const result: Array<{
    event: AcademicEvent;
    subject: Subject;
    daysUntil: number;
    urgency: 'high' | 'medium' | 'low';
  }> = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const event of events) {
    const eventDate = new Date(event.date);
    eventDate.setHours(0, 0, 0, 0);

    const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Skip past events or events too far in the future
    if (daysUntil <= 0 || daysUntil > maxDaysAhead) continue;

    const subject = subjects.find(s => s.id === event.subjectId);
    if (!subject || subject.archived) continue;

    const config = ACADEMIC_EVENT_CONFIG[event.type];

    // Calculate urgency based on event type config
    let urgency: 'high' | 'medium' | 'low';
    if (daysUntil <= config.urgencyDays.high) {
      urgency = 'high';
    } else if (daysUntil <= config.urgencyDays.medium) {
      urgency = 'medium';
    } else {
      urgency = 'low';
    }

    result.push({ event, subject, daysUntil, urgency });
  }

  // Sort by urgency (high first), then by days until (sooner first)
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  result.sort((a, b) => {
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    return a.daysUntil - b.daysUntil;
  });

  return result;
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
  // Require at least 3 data points to avoid false positives
  if (lowScoreQuizzes.length >= 3 && highBloomLowScore.length > lowScoreQuizzes.length * 0.5) {
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
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  }
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Convert a UTC ISO string (or Date) to local YYYY-MM-DD string
export function toLocalDateStr(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

    // Sort rules by days ascending to process gradual decay steps first
    const sortedRules = [...rules].sort((a, b) => a.days - b.days);

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
export function getTopicPriority(
  topic: Topic,
  inCrunchMode: boolean = false,
  qbWeakness?: { accuracy: number; attempts: number } | null
): number {
  const masteryScore = getWeightedMasteryScore(topic);
  const bloomLevel = topic.currentBloomLevel || 1;
  const daysSinceReview = getDaysSince(topic.lastReview);

  // Base priority from mastery (0-100)
  // Lower score = needs more attention = selected first
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

  // Material bonus for gray topics: topics with material ready are more productive to study
  if (topic.status === 'gray') {
    const hasMaterial = (topic.material?.trim()?.length ?? 0) > 0
      || (topic.materialImages?.length ?? 0) > 0;
    if (hasMaterial) {
      priority -= 10; // Higher priority for studyable topics
    }
  }

  // Question bank weakness: low accuracy on practiced questions = needs review
  if (qbWeakness && qbWeakness.attempts >= 3) {
    if (qbWeakness.accuracy < 60) {
      priority -= 15; // Significant weakness detected
    } else if (qbWeakness.accuracy < 75) {
      priority -= 8; // Moderate weakness
    }
  }

  // Recent quiz failure boost: very recent bad scores trigger immediate review
  const recentHistory = (topic.quizHistory || []).filter(q => {
    const daysSince = getDaysSince(q.date);
    return daysSince >= 0 && daysSince <= 3;
  });
  if (recentHistory.length > 0) {
    const worstRecentScore = Math.min(...recentHistory.map(q => q.score));
    if (worstRecentScore < 40) {
      priority -= 25; // Critical failure needs immediate attention
    } else if (worstRecentScore < 50) {
      priority -= 20; // Bad score needs urgent review
    } else if (worstRecentScore < 60) {
      priority -= 10; // Below passing, boost somewhat
    }
  }

  // Manual weak concepts: user-identified weak areas boost priority
  const weakCount = topic.weakConcepts?.length || 0;
  if (weakCount >= 2) priority -= 8;
  if (weakCount >= 5) priority -= 5; // Extra boost for heavily marked topics

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

// ============================================================================
// Session Classification — Smart exam session grouping
// ============================================================================

export type SessionCategory = 'active' | 'future' | 'no-exam';

export interface SessionClassification {
  category: SessionCategory;
  subject: Subject;
  daysUntilExam: number;
  examDifficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Classify subjects into exam sessions:
 * - Active: subjects with exams in the nearest session (earliest exam + 30 days)
 * - Future: subjects with exams beyond the active session
 * - No-exam: subjects without exam date or with past exams
 */
export function classifySubjectSessions(subjects: Subject[]): {
  active: SessionClassification[];
  future: SessionClassification[];
  noExam: SessionClassification[];
} {
  const withExam: { subject: Subject; days: number }[] = [];
  const noExam: SessionClassification[] = [];

  for (const subject of subjects) {
    if (subject.archived || subject.deletedAt) continue;
    const days = getDaysUntil(subject.examDate);
    if (days === Infinity || days <= 0) {
      noExam.push({ category: 'no-exam', subject, daysUntilExam: Infinity, examDifficulty: subject.examDifficulty ?? 'medium' });
    } else {
      withExam.push({ subject, days });
    }
  }

  if (withExam.length === 0) {
    return { active: [], future: [], noExam };
  }

  // Find earliest exam → active session window = earliest + 30 days
  withExam.sort((a, b) => a.days - b.days);
  const earliestDays = withExam[0].days;
  const activeWindowEnd = earliestDays + 30;

  const active: SessionClassification[] = [];
  const future: SessionClassification[] = [];

  for (const { subject, days } of withExam) {
    const classification: SessionClassification = {
      category: days <= activeWindowEnd ? 'active' : 'future',
      subject,
      daysUntilExam: days,
      examDifficulty: subject.examDifficulty ?? 'medium',
    };
    if (classification.category === 'active') {
      active.push(classification);
    } else {
      future.push(classification);
    }
  }

  return { active, future, noExam };
}

/**
 * Deterministic trickle day check for future subjects.
 * Uses day-of-year + subject ID hash to spread different subjects across different days.
 */
export function isTrickleDayForSubject(subjectId: string, intervalDays: number): boolean {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const hash = subjectId.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return (dayOfYear + hash) % intervalDays === 0;
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

    // Count remaining workload (gray = full, orange = half since partially learned)
    const grayTopics = subject.topics.filter(t => t.status === 'gray').length;
    const orangeTopics = subject.topics.filter(t => t.status === 'orange').length;
    const remainingTopics = grayTopics + Math.ceil(orangeTopics * 0.5); // Orange counts as half
    if (remainingTopics === 0) continue;

    // Apply exam difficulty multiplier: easy exams need less prep, hard need more
    const difficultyMultiplier = { easy: 0.5, medium: 1, hard: 1.5 }[subject.examDifficulty ?? 'medium'];
    const topicsPerDay = Math.ceil((remainingTopics * difficultyMultiplier) / daysLeft);

    // Determine urgency - shifted by difficulty
    // Hard exams feel urgent sooner, easy exams can wait longer
    let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
    const diff = subject.examDifficulty ?? 'medium';
    if (diff === 'hard') {
      if (daysLeft <= 5) urgency = 'critical';
      else if (daysLeft <= 10) urgency = 'high';
      else if (daysLeft <= 18) urgency = 'medium';
    } else if (diff === 'easy') {
      if (daysLeft <= 2) urgency = 'critical';
      else if (daysLeft <= 4) urgency = 'high';
      else if (daysLeft <= 8) urgency = 'medium';
    } else {
      if (daysLeft <= 3) urgency = 'critical';
      else if (daysLeft <= 7) urgency = 'high';
      else if (daysLeft <= 14) urgency = 'medium';
    }

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

  // Cap total topics by available study time (~25 min per topic)
  if (studyGoals) {
    const isWeekend = [0, 6].includes(new Date().getDay());
    const minutes = (isWeekend && studyGoals.useWeekendHours)
      ? studyGoals.weekendDailyMinutes
      : studyGoals.dailyMinutes;
    const maxTopics = Math.floor(minutes / 25);
    if (total > maxTopics && maxTopics > 0) {
      const scale = maxTopics / total;
      bySubject.forEach(s => {
        s.topics = Math.max(1, Math.round(s.topics * scale));
      });
      total = Math.min(maxTopics, bySubject.reduce((sum, s) => sum + s.topics, 0));
    }
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

  // 2. Mastery Score - average quiz grade (0 when no data, not 3.5)
  const gradedTopics = topics.filter(t => t.avgGrade != null && t.avgGrade > 0);
  const gradedFraction = gradedTopics.length / totalTopics;
  const avgQuizGrade = gradedTopics.length > 0
    ? gradedTopics.reduce((sum, t) => sum + (t.avgGrade || 0), 0) / gradedTopics.length
    : 0;

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
  const baseGrade = (coverageScore * 3 + (avgQuizGrade / 6) * 3 * gradedFraction) * timeFactor;
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
      (avgQuizGrade / 6) * 3 * gradedFraction;
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
  const topicsOnExam = examFormat?.totalTopics || Math.min(5, totalTopics, Math.max(2, Math.ceil(totalTopics * 0.3)));
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

/** Filter out topics already assigned to other tasks */
function filterUsedTopics(topics: Topic[], usedTopicIds: Set<string>): Topic[] {
  return topics.filter(t => !usedTopicIds.has(t.id));
}

/** Add all topic IDs from a task's topics to the used set (including linked topics) */
function markTopicsUsed(topics: Topic[], usedTopicIds: Set<string>): void {
  for (const topic of topics) {
    usedTopicIds.add(topic.id);
    // Also mark cross-subject linked topics as used to avoid scheduling overlapping content
    for (const linkedId of topic.linkedTopicIds || []) {
      usedTopicIds.add(linkedId);
    }
  }
}

/** Estimate study minutes for a set of topics, accounting for overlap analysis. */
function estimateMinutes(topics: Topic[], basePerTopic: number): number {
  let total = 0;
  for (const t of topics) {
    if (t.overlapAnalysis && t.overlapAnalysis.overlapPercent > 0) {
      // Reduce time proportionally — e.g., 80% overlap → only 20% of base time (minimum 5 min)
      const uniqueFraction = (100 - t.overlapAnalysis.overlapPercent) / 100;
      total += Math.max(5, Math.round(basePerTopic * uniqueFraction));
    } else {
      total += basePerTopic;
    }
  }
  return total;
}

/**
 * Get question bank weakness data for a topic.
 * Returns accuracy (0-100) and attempt count from linked questions.
 */
export function getTopicQBWeakness(
  questionBanks: QuestionBank[],
  topicId: string
): { accuracy: number; attempts: number } | null {
  let totalAttempts = 0;
  let totalCorrect = 0;

  for (const bank of questionBanks) {
    for (const q of bank.questions) {
      if (q.linkedTopicIds?.includes(topicId) && q.stats.attempts > 0) {
        totalAttempts += q.stats.attempts;
        totalCorrect += q.stats.correct;
      }
    }
  }

  if (totalAttempts === 0) return null;
  return {
    accuracy: Math.round((totalCorrect / totalAttempts) * 100),
    attempts: totalAttempts
  };
}

/**
 * Select topics with smart priority + material preference + gap filling.
 * Lower getTopicPriority score = needs more attention = selected first.
 */
function selectTopicsWithRelations(
  allTopics: Topic[],
  maxCount: number,
  inCrunchMode: boolean = false,
  qbWeaknessMap?: Map<string, { accuracy: number; attempts: number }>,
  preferredTopicIds?: Set<string>
): Topic[] {
  if (allTopics.length === 0 || maxCount <= 0) return [];

  const getQB = (t: Topic) => qbWeaknessMap?.get(t.id) ?? null;

  // Sort by priority: preferred topics (from weekly program) come first, then by priority score
  const sorted = [...allTopics].sort((a, b) => {
    // Preferred topics (matched to upcoming exercise) always come first
    if (preferredTopicIds && preferredTopicIds.size > 0) {
      const aPref = preferredTopicIds.has(a.id);
      const bPref = preferredTopicIds.has(b.id);
      if (aPref && !bPref) return -1;
      if (!aPref && bPref) return 1;
    }
    const priorityDiff = getTopicPriority(a, inCrunchMode, getQB(a)) - getTopicPriority(b, inCrunchMode, getQB(b));
    if (priorityDiff !== 0) return priorityDiff;
    // Tie-break: topics with material first
    const aHas = (a.material?.trim()?.length ?? 0) > 0 || (a.materialImages?.length ?? 0) > 0;
    const bHas = (b.material?.trim()?.length ?? 0) > 0 || (b.materialImages?.length ?? 0) > 0;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return 0;
  });

  // Phase 1: Pick top N by priority
  const selected: Topic[] = [];
  const selectedIds = new Set<string>();

  for (const topic of sorted) {
    if (selected.length >= maxCount) break;
    if (selectedIds.has(topic.id)) continue;
    selected.push(topic);
    selectedIds.add(topic.id);
  }

  // Phase 2: Gap filling — try to swap weakest selected with an adjacent gap filler
  // This creates natural topic sequences (5,6,7 instead of 5,9,12)
  if (selected.length >= 2 && selected.length === maxCount) {
    const selectedNumbers = new Set(selected.map(t => t.number));

    // Find gap candidates: topics adjacent to already-selected ones
    const gapCandidates: Topic[] = [];
    for (const topic of allTopics) {
      if (selectedIds.has(topic.id)) continue;
      if (selectedNumbers.has(topic.number - 1) || selectedNumbers.has(topic.number + 1)) {
        gapCandidates.push(topic);
      }
    }

    if (gapCandidates.length > 0) {
      // Sort gap candidates: prefer those with 2 selected neighbors, then by priority
      gapCandidates.sort((a, b) => {
        const aNeighbors = (selectedNumbers.has(a.number - 1) ? 1 : 0) + (selectedNumbers.has(a.number + 1) ? 1 : 0);
        const bNeighbors = (selectedNumbers.has(b.number - 1) ? 1 : 0) + (selectedNumbers.has(b.number + 1) ? 1 : 0);
        if (bNeighbors !== aNeighbors) return bNeighbors - aNeighbors;
        return getTopicPriority(a, inCrunchMode, getQB(a)) - getTopicPriority(b, inCrunchMode, getQB(b));
      });

      // Find the weakest (highest priority score = least urgent) selected topic
      const weakest = selected.reduce((worst, t) =>
        getTopicPriority(t, inCrunchMode, getQB(t)) > getTopicPriority(worst, inCrunchMode, getQB(worst)) ? t : worst
      );
      const bestGap = gapCandidates[0];

      const weakestPriority = getTopicPriority(weakest, inCrunchMode, getQB(weakest));
      const gapPriority = getTopicPriority(bestGap, inCrunchMode, getQB(bestGap));

      // Only swap if gap candidate is reasonably close in priority (within 20 points)
      if (gapPriority - weakestPriority <= 20) {
        const weakestIdx = selected.indexOf(weakest);
        selected[weakestIdx] = bestGap;
        selectedIds.delete(weakest.id);
        selectedIds.add(bestGap.id);
      }
    }
  }

  // Sort final selection by topic number for natural reading order
  return selected.sort((a, b) => a.number - b.number);
}

export function generateDailyPlan(
  subjects: Subject[],
  schedule: ScheduleClass[],
  dailyStatus: DailyStatus,
  studyGoals?: StudyGoals,
  ankiDueCards?: number,
  developmentProjects?: DevelopmentProject[],
  academicEvents?: AcademicEvent[],
  studyTechniques?: StudyTechnique[],
  techniquePractices?: TechniquePractice[],
  academicPeriod?: AcademicPeriod,
  questionBanks?: QuestionBank[],
  yesterdayCompletedTopicIds?: string[]
): DailyTask[] {
  const tasks: DailyTask[] = [];
  const usedTopicIds = new Set<string>();

  // Pre-compute QB weakness map for O(1) lookups during priority scoring
  const qbWeaknessMap = new Map<string, { accuracy: number; attempts: number }>();
  if (questionBanks && questionBanks.length > 0) {
    const topicStats = new Map<string, { attempts: number; correct: number }>();
    for (const bank of questionBanks) {
      for (const q of bank.questions) {
        if (q.stats.attempts > 0 && q.linkedTopicIds?.length) {
          for (const tid of q.linkedTopicIds) {
            const existing = topicStats.get(tid) || { attempts: 0, correct: 0 };
            existing.attempts += q.stats.attempts;
            existing.correct += q.stats.correct;
            topicStats.set(tid, existing);
          }
        }
      }
    }
    for (const [tid, stats] of topicStats) {
      qbWeaknessMap.set(tid, {
        accuracy: Math.round((stats.correct / stats.attempts) * 100),
        attempts: stats.attempts
      });
    }
  }

  // Detect crunch mode for priority calculation (disabled in vacation mode)
  const crunchStatus = detectCrunchMode(subjects);
  const inCrunchMode = studyGoals?.vacationMode === true ? false : crunchStatus.isActive;

  // Session classification: active (nearest exam session), future (later exams), no-exam
  const sessions = classifySubjectSessions(subjects);

  // Get per-subject workload from calculateDailyTopics (for active session new material)
  const workload = calculateDailyTopics(subjects, dailyStatus, studyGoals);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = (tomorrow.getDay() + 6) % 7; // Convert to Mon=0

  // Create a map of subject workload for reference
  const subjectWorkload = new Map(workload.bySubject.map(s => [s.subjectId, s]));

  // Check if semester has started (for filtering exercises)
  const semStart = academicPeriod?.semesterStart ? new Date(academicPeriod.semesterStart) : null;
  const semesterStarted = !semStart || semStart <= tomorrow;

  // Build preferred topics per subject from upcoming weekly program (schedule weeklyTopics)
  // Finds the nearest future exercise with weeklyTopics for each subject
  const preferredTopicsBySubject = new Map<string, Set<string>>();
  {
    const todayLocal = getTodayString();
    for (const cls of schedule) {
      if (!cls.weeklyTopics) continue;
      // Find the nearest future date with topics for this class
      const futureDates = Object.keys(cls.weeklyTopics)
        .filter(d => d >= todayLocal)
        .sort();
      if (futureDates.length === 0) continue;
      // Take nearest + next week (so we prepare ahead)
      const datesToUse = futureDates.slice(0, 2);
      const topicIds = new Set<string>();
      for (const date of datesToUse) {
        const entry = cls.weeklyTopics[date];
        if (entry?.topicIds) {
          for (const id of entry.topicIds) topicIds.add(id);
        }
      }
      if (topicIds.size > 0) {
        const existing = preferredTopicsBySubject.get(cls.subjectId) || new Set();
        for (const id of topicIds) existing.add(id);
        preferredTopicsBySubject.set(cls.subjectId, existing);
      }
    }
  }

  // 1. CRITICAL: Exercises tomorrow - take topics from that subject's workload
  const tomorrowExercises = schedule.filter(c => {
    if (c.day !== tomorrowDay || !CLASS_TYPES[c.type].prepRequired) return false;
    if (!semesterStarted && !c.startDate) return false; // semester not started, no individual override
    if (c.startDate && new Date(c.startDate) > tomorrow) return false;
    return true;
  });

  for (const exercise of tomorrowExercises) {
    const subject = subjects.find(s => s.id === exercise.subjectId);
    if (!subject || subject.topics.length === 0) continue;

    const subjectWork = subjectWorkload.get(subject.id);
    const topicsToTake = subjectWork ? subjectWork.topics : 5;

    // Select topics with related grouping (filter already-used topics)
    // Only review known-but-weak topics (orange/yellow) — gray topics go to "Нов материал" tier
    const candidates = filterUsedTopics(subject.topics.filter(t => t.status === 'orange' || t.status === 'yellow'), usedTopicIds);
    const weakTopics = selectTopicsWithRelations(candidates, topicsToTake, inCrunchMode, qbWeaknessMap);

    if (weakTopics.length > 0) {
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'critical',
        priorityBucket: 'must',
        typeLabel: `${CLASS_TYPES[exercise.type].icon} ${CLASS_TYPES[exercise.type].label} утре`,
        description: `Подготовка за ${CLASS_TYPES[exercise.type].label.toLowerCase()}`,
        topics: weakTopics,
        estimatedMinutes: estimateMinutes(weakTopics, 20), // ~20 min per topic
        completed: false
      });
      markTopicsUsed(weakTopics, usedTopicIds);
    }
  }

  // 2. CRITICAL EXAM PREP — Only for exams ≤ 3 days (crisis mode)
  // Non-critical exam subjects get reviews via FSRS/orange tiers + new material via session tiers
  for (const subjectWork of workload.bySubject) {
    if (subjectWork.urgency !== 'critical') continue;

    const subject = subjects.find(s => s.id === subjectWork.subjectId);
    if (!subject) continue;
    if (tasks.some(t => t.subjectId === subject.id && t.type === 'critical')) continue;

    // Critical: include ALL non-green topics (gray too — no time to separate)
    const candidates = filterUsedTopics(subject.topics.filter(t => t.status !== 'green'), usedTopicIds);
    const selected = selectTopicsWithRelations(candidates, subjectWork.topics, inCrunchMode, qbWeaknessMap);

    if (selected.length > 0) {
      const examFormat = parseExamFormat(subject.examFormat);
      const formatGaps = analyzeFormatGaps(subject);
      let description = 'Интензивна подготовка за изпит';
      if (formatGaps.caseWeakness && examFormat?.cases) {
        description = `Фокус върху казуси (${examFormat.cases} на изпита)`;
      } else if (formatGaps.hasOpenQuestions && examFormat?.openQuestions) {
        description = `Упражнявай писмени отговори (${examFormat.openQuestions} на изпита)`;
      } else if (examFormat?.mcq) {
        description = `MCQ практика (${examFormat.mcq} на изпита)`;
      }

      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'critical',
        priorityBucket: 'must',
        typeLabel: `📝 Изпит след ${subjectWork.daysLeft} ${subjectWork.daysLeft === 1 ? 'ден' : 'дни'}`,
        description,
        topics: selected,
        estimatedMinutes: estimateMinutes(selected, 20),
        completed: false
      });
      markTopicsUsed(selected, usedTopicIds);
    }
  }

  // 3. ACADEMIC EVENTS - Колоквиуми, контролни, etc.
  if (academicEvents && academicEvents.length > 0) {
    const upcomingEvents = getUpcomingAcademicEvents(academicEvents, subjects);

    for (const { event, subject, daysUntil, urgency } of upcomingEvents) {
      // Skip if subject already has a critical task (exercises tomorrow)
      if (tasks.some(t => t.subjectId === subject.id && t.type === 'critical')) continue;

      const config = ACADEMIC_EVENT_CONFIG[event.type];
      const topicsToReview = 3; // max 3 per event (pedagogical limit)

      // If event has specific topicIds, use only those topics
      // Otherwise fall back to yellow/orange from the whole subject
      const eventTopicPool = event.topicIds && event.topicIds.length > 0
        ? subject.topics.filter(t => event.topicIds!.includes(t.id))
        : subject.topics;

      // Prioritize yellow/orange topics (consolidation of learned material)
      const candidates = filterUsedTopics(eventTopicPool.filter(t =>
        t.status === 'yellow' || t.status === 'orange'
      ), usedTopicIds);

      // If no yellow/orange topics, include green topics that need review
      // Also include gray topics if event has specific topicIds (student must cover them)
      const fallbackStatuses = filterUsedTopics(event.topicIds && event.topicIds.length > 0
        ? eventTopicPool.filter(t => t.status === 'green' || t.status === 'gray')
        : eventTopicPool.filter(t => t.status === 'green'), usedTopicIds);
      const finalCandidates = candidates.length >= topicsToReview
        ? candidates
        : [...candidates, ...fallbackStatuses];

      const selectedTopics = selectTopicsWithRelations(finalCandidates, topicsToReview, inCrunchMode, qbWeaknessMap);

      if (selectedTopics.length > 0) {
        const eventName = event.name || config.label;
        const taskType = urgency === 'high' ? 'high' : 'medium';

        tasks.push({
          id: generateId(),
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          type: taskType,
          priorityBucket: 'must',
          typeLabel: `${config.icon} ${eventName} след ${daysUntil}д`,
          description: `Подготовка за ${config.label.toLowerCase()}`,
          topics: selectedTopics,
          estimatedMinutes: selectedTopics.length * 25, // ~25 min per topic for consolidation
          completed: false
        });
        markTopicsUsed(selectedTopics, usedTopicIds);
      }
    }
  }

  // 4. ALL FSRS REVIEWS — Spaced repetition, ALL subjects, no daily cap
  // Exam-aware: includes topics whose next review would be after the exam
  const vacationDecayMultiplier = studyGoals?.vacationMode === true ? 1.5 : 1.0;

  {
    const fsrsReviews = getTopicsNeedingFSRSReview(subjects, Infinity, studyGoals);
    const filteredFsrsReviews = fsrsReviews.filter(item => !usedTopicIds.has(item.topic.id));

    // Group by subject
    const fsrsBySubject = new Map<string, typeof fsrsReviews>();
    for (const item of filteredFsrsReviews) {
      const existing = fsrsBySubject.get(item.subject.id) || [];
      existing.push(item);
      fsrsBySubject.set(item.subject.id, existing);
    }

    for (const [subjectId, items] of fsrsBySubject) {
      const subject = subjects.find(s => s.id === subjectId);
      if (!subject) continue;

      const selectedTopics = items.map(i => i.topic);
      const avgR = Math.round(items.reduce((s, i) => s + i.retrievability, 0) / items.length * 100);

      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'medium',
        priorityBucket: 'must',
        typeLabel: '🧠 FSRS Review',
        description: `Spaced repetition (${avgR}% памет, ${selectedTopics.length} ${selectedTopics.length === 1 ? 'тема' : 'теми'})`,
        topics: selectedTopics,
        estimatedMinutes: selectedTopics.length * 25,
        completed: false
      });
      markTopicsUsed(selectedTopics, usedTopicIds);
    }
  }

  // 5. ALL LEGACY DECAY REVIEWS — Topics without FSRS state past warning threshold
  for (const subject of subjects) {
    const decayingTopics = filterUsedTopics(subject.topics.filter(t => {
      if (t.status === 'gray') return false;
      if (t.fsrs) return false; // Skip FSRS topics, already handled
      const days = getDaysSince(t.lastReview);
      const baseWarningDays = getDecayWarningDays(t);
      const warningDays = Math.round(baseWarningDays * vacationDecayMultiplier);
      return days >= warningDays;
    }), usedTopicIds);

    if (decayingTopics.length > 0) {
      const selectedTopics = selectTopicsWithRelations(decayingTopics, decayingTopics.length, inCrunchMode, qbWeaknessMap);
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
        priorityBucket: 'must',
        typeLabel: '⚠️ Преговор',
        description: `Теми без review ${avgWarningDays}+ дни`,
        topics: selectedTopics,
        estimatedMinutes: estimateMinutes(selectedTopics, 20),
        completed: false
      });
      markTopicsUsed(selectedTopics, usedTopicIds);
    }
  }

  // 6. ALL ORANGE REINFORCEMENT — Topics known but weak (grade ~3-3.5), all subjects
  for (const subject of subjects) {
    const orangeTopics = filterUsedTopics(subject.topics.filter(t => t.status === 'orange'), usedTopicIds);
    if (orangeTopics.length === 0) continue;

    const topicsToTake = orangeTopics.length; // Take ALL orange (uncapped)
    const selectedTopics = selectTopicsWithRelations(orangeTopics, topicsToTake, inCrunchMode, qbWeaknessMap);

    if (selectedTopics.length > 0) {
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'high',
        priorityBucket: 'must',
        typeLabel: '🟠 Укрепване',
        description: `Теми за ~3.5 - нужен е преговор`,
        topics: selectedTopics,
        estimatedMinutes: estimateMinutes(selectedTopics, 20),
        completed: false
      });
      markTopicsUsed(selectedTopics, usedTopicIds);
    }
  }

  // 7. YESTERDAY'S CONSOLIDATION - Brief review of newly learned material
  // Science: 24-hour review of new material improves retention by 40%+
  // Targets topics studied yesterday that are still fragile (orange/yellow, low mastery)
  if (yesterdayCompletedTopicIds && yesterdayCompletedTopicIds.length > 0) {
    const yesterdaySet = new Set(yesterdayCompletedTopicIds.filter(Boolean));
    const consolidationCandidates: { topic: Topic; subject: Subject }[] = [];

    for (const subject of subjects) {
      for (const topic of subject.topics) {
        if (!yesterdaySet.has(topic.id)) continue;
        if (usedTopicIds.has(topic.id)) continue;

        const isNewlyLearned = topic.status === 'orange' ||
          (topic.status === 'yellow' && (topic.quizCount || 0) <= 1);
        const hasLowMastery = getWeightedMasteryScore(topic) < 60;

        if (isNewlyLearned || hasLowMastery) {
          consolidationCandidates.push({ topic, subject });
        }
      }
    }

    if (consolidationCandidates.length > 0) {
      consolidationCandidates.sort((a, b) =>
        getWeightedMasteryScore(a.topic) - getWeightedMasteryScore(b.topic)
      );

      // Max 6 consolidation topics (pedagogical limit)
      const maxConsolidation = 6;
      const consolidationBySubject = new Map<string, { topics: Topic[]; subject: Subject }>();
      let consolidationCount = 0;

      for (const { topic, subject } of consolidationCandidates) {
        if (consolidationCount >= maxConsolidation) break;

        const existing = consolidationBySubject.get(subject.id);
        if (existing) {
          existing.topics.push(topic);
        } else {
          consolidationBySubject.set(subject.id, { topics: [topic], subject });
        }
        consolidationCount++;
        markTopicsUsed([topic], usedTopicIds);
      }

      for (const [, { topics: consTopics, subject }] of consolidationBySubject) {
        tasks.push({
          id: generateId(),
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          type: 'medium',
          priorityBucket: 'must',
          typeLabel: '🔄 Затвърждаване',
          description: `Бърз преговор на вчерашен материал (${consTopics.length} ${consTopics.length === 1 ? 'тема' : 'теми'})`,
          topics: consTopics,
          estimatedMinutes: consTopics.length * 10,
          completed: false
        });
      }
    }
  }

  // 8. DRILL WEAKNESS - Target accumulated wrong answers before exams
  for (const subject of subjects) {

    const daysUntilExam = getDaysUntil(subject.examDate);
    if (daysUntilExam > 7 || daysUntilExam <= 0) continue;

    const allWrongAnswers = subject.topics.flatMap(t => t.wrongAnswers || []);
    const unmastered = allWrongAnswers.filter(wa => wa.drillCount < 3);
    if (unmastered.length < 5) continue;

    const priority: 'critical' | 'high' = daysUntilExam <= 3 ? 'critical' : 'high';

    tasks.push({
      id: generateId(),
      subjectId: subject.id,
      subjectName: subject.name,
      subjectColor: subject.color,
      type: priority,
      priorityBucket: 'must',
      typeLabel: `🎯 Drill Weakness`,
      description: `${unmastered.length} неупражнявани грешки (${allWrongAnswers.length - unmastered.length} адресирани)`,
      topics: [], // No specific topics - cross-topic drill
      estimatedMinutes: Math.min(unmastered.length * 2, 30),
      completed: false
    });
  }

  // 9. BLOOM PROGRESSION - Push green/yellow topics toward higher-order thinking
  {
    const bloomCandidates: { topic: Topic; subject: Subject }[] = [];
    for (const subject of subjects) {
      for (const topic of subject.topics) {
        const bl = topic.currentBloomLevel || 1;
        if (
          (topic.status === 'green' || topic.status === 'yellow') &&
          bl <= 2 &&
          topic.quizCount >= 3 &&
          (topic.material?.trim()?.length ?? 0) > 0
        ) {
          bloomCandidates.push({ topic, subject });
        }
      }
    }
    // Sort: lowest bloom first, then most quizzes (most "stuck" at low level)
    bloomCandidates.sort((a, b) => {
      const blDiff = (a.topic.currentBloomLevel || 1) - (b.topic.currentBloomLevel || 1);
      if (blDiff !== 0) return blDiff;
      return (b.topic.quizCount || 0) - (a.topic.quizCount || 0);
    });

    // Group by subject, max 2 total
    const bloomBySubject = new Map<string, { topics: Topic[]; subject: Subject }>();
    let bloomCount = 0;
    for (const { topic, subject } of bloomCandidates) {
      if (bloomCount >= 2) break;
      // Skip if topic already in a task (use global set for O(1) check)
      if (usedTopicIds.has(topic.id)) continue;
      const existing = bloomBySubject.get(subject.id);
      if (existing) {
        existing.topics.push(topic);
      } else {
        bloomBySubject.set(subject.id, { topics: [topic], subject });
      }
      bloomCount++;
    }

    for (const [, { topics: bloomTopics, subject }] of bloomBySubject) {
      const names = bloomTopics.map(t => t.name).join(', ');
      const bl = bloomTopics[0].currentBloomLevel || 1;
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'medium',
        priorityBucket: 'can-postpone',
        typeLabel: 'Higher Order',
        description: `Bloom ${bl} \u2192 опитай Higher Order quiz (${names})`,
        topics: bloomTopics,
        estimatedMinutes: estimateMinutes(bloomTopics, 20),
        completed: false
      });
      markTopicsUsed(bloomTopics, usedTopicIds);
    }
  }

  // 10. NEW MATERIAL — Active session (math-driven: gray topics / days until exam)
  // Track new material topics for the evening review task
  const newMaterialTopicsBySubject: { subjectId: string; subjectName: string; subjectColor: string; topics: Topic[] }[] = [];

  for (const classification of sessions.active) {
    const subject = classification.subject;
    const sw = subjectWorkload.get(subject.id);
    if (!sw) continue;

    const grayTopics = filterUsedTopics(
      subject.topics.filter(t => t.status === 'gray'),
      usedTopicIds
    );
    if (grayTopics.length === 0) continue;

    // Use calculateDailyTopics result — already accounts for examDifficulty, daysLeft, sick/holiday
    const topicsToTake = Math.min(sw.topics, grayTopics.length);
    if (topicsToTake <= 0) continue;

    const preferred = preferredTopicsBySubject.get(subject.id);
    const selectedTopics = selectTopicsWithRelations(grayTopics, topicsToTake, inCrunchMode, qbWeaknessMap, preferred);

    if (selectedTopics.length > 0) {
      const grayCount = subject.topics.filter(t => t.status === 'gray').length;
      const grayPct = subject.topics.length > 0 ? Math.round((grayCount / subject.topics.length) * 100) : 0;

      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'normal',
        priorityBucket: 'should',
        typeLabel: '📚 Нов материал',
        description: `${grayPct}% непокрити, изпит след ${classification.daysUntilExam}д`,
        topics: selectedTopics,
        estimatedMinutes: estimateMinutes(selectedTopics, 20),
        completed: false
      });
      markTopicsUsed(selectedTopics, usedTopicIds);
      newMaterialTopicsBySubject.push({
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        topics: selectedTopics
      });
    }
  }

  // 11. NEW MATERIAL — Future session trickle (hard: 1/day, medium: 1/2 days, easy: 0)
  for (const classification of sessions.future) {
    const subject = classification.subject;
    const difficulty = classification.examDifficulty;

    // easy: wait until session becomes active
    if (difficulty === 'easy') continue;

    // medium: 1 topic every 2 days (deterministic parity)
    if (difficulty === 'medium' && !isTrickleDayForSubject(subject.id, 2)) continue;

    // hard: 1 topic/day (always), medium on trickle day: 1 topic
    const grayTopics = filterUsedTopics(
      subject.topics.filter(t => t.status === 'gray'),
      usedTopicIds
    );
    if (grayTopics.length === 0) continue;

    const preferredFuture = preferredTopicsBySubject.get(subject.id);
    const selectedTopics = selectTopicsWithRelations(grayTopics, 1, inCrunchMode, qbWeaknessMap, preferredFuture);

    if (selectedTopics.length > 0) {
      const totalGray = subject.topics.filter(t => t.status === 'gray').length;
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'normal',
        priorityBucket: 'should',
        typeLabel: difficulty === 'hard' ? '📖 Предв. подготовка' : '📖 Нов материал',
        description: `Бъдещ изпит след ${classification.daysUntilExam}д (${difficulty === 'hard' ? 'труден' : 'среден'}) — ${totalGray} оставащи`,
        topics: selectedTopics,
        estimatedMinutes: estimateMinutes(selectedTopics, 25),
        completed: false
      });
      markTopicsUsed(selectedTopics, usedTopicIds);
      newMaterialTopicsBySubject.push({
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        topics: selectedTopics
      });
    }
  }

  // 12. EVENING REVIEW — Quick recap of today's new material (same-day consolidation)
  // Only shows topics that are NO LONGER gray (user actually studied them today).
  // At plan generation time most are still gray — the task recalculates dynamically.
  {
    const studiedTodayBySubject: { subjectName: string; topicNames: string[] }[] = [];
    for (const subject of subjects) {
      const studiedToday = subject.topics.filter(t =>
        t.status !== 'gray' &&
        t.lastReview === getTodayString()
      );
      if (studiedToday.length > 0) {
        studiedTodayBySubject.push({
          subjectName: subject.name,
          topicNames: studiedToday.map(t => `#${t.number} ${t.name}`)
        });
      }
    }

    if (studiedTodayBySubject.length > 0) {
      const totalCount = studiedTodayBySubject.reduce((s, g) => s + g.topicNames.length, 0);
      const subjectNames = studiedTodayBySubject.map(s => s.subjectName).join(', ');
      // Format: one line per subject with its topics
      const lines = studiedTodayBySubject.map(s =>
        `${s.subjectName}: ${s.topicNames.join(' • ')}`
      );

      tasks.push({
        id: generateId(),
        subjectId: '',
        subjectName: subjectNames,
        subjectColor: '#64748b',
        type: 'normal',
        priorityBucket: 'should',
        typeLabel: '🌙 Вечерен преговор',
        description: lines.join('\n'),
        topics: [],
        estimatedMinutes: Math.max(10, totalCount * 5),
        completed: false
      });
    }
  }

  // 13. PROJECTS — Development projects
  if (developmentProjects && developmentProjects.length > 0) {
    const activeProjects = developmentProjects
      .filter(p => p.status === 'active')
      .sort((a, b) => {
        // Projects with weekly goals come first
        const aHasGoal = a.weeklyGoalMinutes ? 1 : 0;
        const bHasGoal = b.weeklyGoalMinutes ? 1 : 0;
        if (aHasGoal !== bHasGoal) return bHasGoal - aHasGoal;
        // Then by priority (high first), then by progress (less complete first)
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.progressPercent - b.progressPercent;
      });

    // Take max 3 projects per day (projects with goals always appear)
    const projectsToShow = activeProjects.slice(0, 3);

    for (const project of projectsToShow) {
      // All active projects are shown (no capacity gate)

      // Get incomplete modules
      const incompleteModules = project.modules
        .filter(m => m.status !== 'completed')
        .sort((a, b) => a.order - b.order)
        .slice(0, 3); // Max 3 modules per project

      if (incompleteModules.length > 0 || project.modules.length === 0) {
        let dailyMinutes: number;

        if (project.weeklyGoalMinutes) {
          // Smart batching: batch into fewer, longer sessions instead of tiny daily slices
          // ≤30min → 1 session, else ceil(goal/30) sessions (max 5)
          const sessionsNeeded = project.weeklyGoalMinutes <= 30 ? 1
            : Math.min(5, Math.ceil(project.weeklyGoalMinutes / 30));
          const minutesPerSession = Math.round(project.weeklyGoalMinutes / sessionsNeeded);

          // Deterministic day selection using project ID hash
          const projectHash = project.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const dayOfWeek = (new Date(today).getDay() + 6) % 7; // Mon=0, Sun=6

          const sessionDays: number[] = [];
          if (sessionsNeeded === 1) {
            sessionDays.push(5 + (projectHash % 2)); // Saturday(5) or Sunday(6)
          } else if (sessionsNeeded === 2) {
            sessionDays.push(2 + (projectHash % 2)); // Wed(2) or Thu(3)
            sessionDays.push(5 + (projectHash % 2)); // Sat(5) or Sun(6)
          } else {
            // Spread evenly across the week
            const interval = Math.floor(7 / sessionsNeeded);
            for (let i = 0; i < sessionsNeeded; i++) {
              sessionDays.push((projectHash + i * interval) % 7);
            }
          }

          if (!sessionDays.includes(dayOfWeek)) continue; // Not a project day — skip
          dailyMinutes = minutesPerSession;
        } else {
          dailyMinutes = incompleteModules.length > 0 ? incompleteModules.length * 30 : 30;
        }

        const goalLabel = project.weeklyGoalMinutes
          ? (project.weeklyGoalMinutes >= 60
            ? `${Math.round(project.weeklyGoalMinutes / 60)}ч/седмица`
            : `${project.weeklyGoalMinutes}м/седмица`)
          : '';

        const moduleLabel = incompleteModules.length > 0
          ? `${incompleteModules.length} модула`
          : (project.description || 'Продължи');

        tasks.push({
          id: generateId(),
          subjectId: '', // No subject
          subjectName: project.name,
          subjectColor: '#06b6d4', // Cyan for projects
          type: 'project',
          priorityBucket: 'flexible',
          typeLabel: `🚀 Проект`,
          description: goalLabel ? `${goalLabel} — ${moduleLabel}` : moduleLabel,
          topics: [], // No topics
          estimatedMinutes: dailyMinutes,
          completed: false,
          projectId: project.id,
          projectName: project.name,
          projectModules: incompleteModules
        });
      }
    }
  }

  // 14. MODULE FSRS REVIEWS — Project module spaced repetition
  if (developmentProjects && developmentProjects.length > 0) {
    const moduleReviews = getModulesNeedingFSRSReview(
      developmentProjects,
      4, // Max 4 module reviews per day (pedagogical limit)
      studyGoals
    );

    if (moduleReviews.length > 0) {
      // Group by project for cleaner display
      const byProject = new Map<string, typeof moduleReviews>();
      for (const review of moduleReviews) {
        const projectId = review.project.id;
        if (!byProject.has(projectId)) {
          byProject.set(projectId, []);
        }
        byProject.get(projectId)!.push(review);
      }

      for (const [projectId, reviews] of byProject) {
        const project = reviews[0].project;
        const modules = reviews.map(r => r.module);
        const avgRetrievability = reviews.reduce((sum, r) => sum + r.retrievability, 0) / reviews.length;

        tasks.push({
          id: generateId(),
          subjectId: '',
          subjectName: project.name,
          subjectColor: '#8b5cf6', // Purple for module reviews (different from project cyan)
          type: 'project',
          priorityBucket: 'flexible',
          typeLabel: '📦 Проект Review',
          description: `${modules.length} модул${modules.length > 1 ? 'а' : ''} за преговор (${Math.round(avgRetrievability * 100)}% памет)`,
          topics: [],
          estimatedMinutes: modules.length * 15, // ~15 min per module review
          completed: false,
          projectId: project.id,
          projectName: project.name,
          projectModules: modules,
          isModuleReview: true
        });

        // No capacity tracking
      }
    }
  }

  // ================ EMBED TECHNIQUE SUGGESTIONS INTO EXISTING TASKS ================
  // Instead of separate technique tasks, attach 1-2 technique suggestions to existing study tasks
  if (studyTechniques && studyTechniques.length > 0) {
    const activeTechniques = studyTechniques.filter(t => t.isActive);

    // Embed technique suggestions into regular study tasks (not project/technique tasks)
    const studyTasks = tasks.filter(t => t.type !== 'project' && t.type !== 'technique' && t.topics.length > 0);
    if (activeTechniques.length > 0 && studyTasks.length > 0) {
      // Skip spacing - already automated by FSRS
      const eligibleTechniques = activeTechniques.filter(t => t.slug !== 'spacing');

      if (eligibleTechniques.length > 0) {
        // Build effectiveness map per technique from practices
        const practiceMap: Record<string, { avgEff: number; count: number }> = {};
        if (techniquePractices) {
          for (const p of techniquePractices) {
            if (!practiceMap[p.techniqueId]) practiceMap[p.techniqueId] = { avgEff: 0, count: 0 };
            if (p.effectiveness !== null) {
              const entry = practiceMap[p.techniqueId];
              entry.avgEff = (entry.avgEff * entry.count + p.effectiveness) / (entry.count + 1);
              entry.count++;
            }
          }
        }

        // Smart priority scoring: higher = more urgent to practice
        const now = Date.now();
        const scoreTechnique = (t: StudyTechnique): number => {
          let score = 0;
          if (!t.lastPracticedAt) return 50 + (5 - t.practiceCount) * 2;
          const daysSince = (now - new Date(t.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24);
          score += Math.min(30, daysSince);
          const stats = practiceMap[t.id];
          if (stats && stats.count > 0) {
            if (stats.avgEff < 3) score += 15;
            else if (stats.avgEff < 4) score += 8;
          }
          if (t.practiceCount < 3) score += 10;
          else if (t.practiceCount < 7) score += 5;
          return score;
        };

        const sortedTechniques = [...eligibleTechniques].sort((a, b) => scoreTechnique(b) - scoreTechnique(a));

        // Compute task properties for affinity matching
        const uniqueSubjectIds = new Set(studyTasks.map(t => t.subjectId));
        const hasMultipleSubjects = uniqueSubjectIds.size >= 2;
        const taskProps = studyTasks.map((task, idx) => {
          const grayCount = task.topics.filter(t => t.status === 'gray').length;
          const totalTopics = task.topics.length;
          return {
            task,
            idx,
            isNewMaterial: grayCount > 0,
            isReview: grayCount === 0 && totalTopics > 0,
            isFirst: idx === 0,
            isLast: idx === studyTasks.length - 1,
          };
        });

        // Technique-task affinity: how well does this technique fit this task?
        const affinityScore = (technique: StudyTechnique, tp: typeof taskProps[0]): number => {
          let aff = 0;
          switch (technique.slug) {
            case 'priming':
              // Priming = preview before deep learning → new material, first task
              if (tp.isNewMaterial) aff += 10;
              if (tp.isFirst) aff += 5;
              if (tp.isReview) aff -= 5;
              break;
            case 'chunking':
            case 'non-linear-notes':
              // Encoding techniques → new material
              if (tp.isNewMaterial) aff += 8;
              if (tp.isReview) aff -= 3;
              break;
            case 'inquiry-based-learning':
              // Deep questions → any, slight preference for new material
              if (tp.isNewMaterial) aff += 5;
              break;
            case 'rote-management':
              // Identify what to memorize → new material
              if (tp.isNewMaterial) aff += 6;
              break;
            case 'effort-monitoring':
            case 'cognitive-load-regulation':
              // Metacognition → works with anything, slight preference for heavy tasks
              if (tp.isNewMaterial) aff += 3;
              break;
            case 'interleaving':
              // Mix subjects → only makes sense when 2+ subjects in the day
              if (hasMultipleSubjects) aff += 10;
              else aff -= 10; // Don't suggest if only 1 subject
              break;
            case 'reflective-practice':
              // Reflect after studying → last task of the day
              if (tp.isLast) aff += 10;
              if (tp.isFirst && studyTasks.length > 1) aff -= 5;
              break;
            case 'microlearning':
              // Ultra-short review → review tasks, not new material
              if (tp.isReview) aff += 8;
              if (tp.isNewMaterial) aff -= 5;
              break;
          }
          return aff;
        };

        // Greedy matching: for top N techniques by mastery score, find best task for each
        const attachCount = Math.min(2, sortedTechniques.length, studyTasks.length);
        const usedTaskIndices = new Set<number>();

        for (let i = 0; i < attachCount; i++) {
          const technique = sortedTechniques[i];
          // Find the best unused task for this technique
          let bestIdx = -1;
          let bestScore = -Infinity;
          for (const tp of taskProps) {
            if (usedTaskIndices.has(tp.idx)) continue;
            const score = affinityScore(technique, tp);
            if (score > bestScore) {
              bestScore = score;
              bestIdx = tp.idx;
            }
          }
          // Skip if terrible fit (e.g. interleaving with 1 subject)
          if (bestIdx === -1 || bestScore < -5) continue;
          usedTaskIndices.add(bestIdx);
          studyTasks[bestIdx].suggestedTechnique = {
            id: technique.id,
            name: technique.name,
            icon: technique.icon,
            slug: technique.slug,
            description: technique.description,
            howToApply: technique.howToApply
          };
        }
      }
    }

  }

  // ================ STANDALONE TECHNIQUE TASK ================
  // Add a dedicated technique practice task (IcanStudy) if active techniques exist
  // Shows every 2 days if the user has active techniques with low practice count
  if (studyTechniques && studyTechniques.length > 0) {
    const activeTechniques = studyTechniques.filter(t => t.isActive);
    if (activeTechniques.length > 0) {
      // Find the technique most in need of practice
      const now = Date.now();
      const needsPractice = activeTechniques
        .filter(t => t.slug !== 'spacing') // Spacing is automatic via FSRS
        .map(t => {
          const daysSince = t.lastPracticedAt
            ? (now - new Date(t.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24)
            : 999;
          return { technique: t, daysSince };
        })
        .filter(t => t.daysSince >= 2) // Only if not practiced in last 2 days
        .sort((a, b) => b.daysSince - a.daysSince);

      if (needsPractice.length > 0) {
        const best = needsPractice[0].technique;
        tasks.push({
          id: generateId(),
          subjectId: '',
          subjectName: 'IcanStudy',
          subjectColor: '#8b5cf6', // violet
          type: 'technique',
          priorityBucket: 'flexible',
          typeLabel: `${best.icon} Техника`,
          description: `Практикувай: ${best.name}`,
          topics: [],
          estimatedMinutes: 10,
          completed: false,
          techniqueId: best.id,
          techniqueName: best.name,
          techniqueIcon: best.icon,
          techniqueHowToApply: best.howToApply
        });
      }
    }
  }

  // ================ INTERLEAVE SUBJECTS ================
  // Round-robin by subject within priority tiers, then merge tiers in order.
  // Evening review always stays last.
  if (tasks.length > 2) {
    // Pull out evening review to append at the very end
    const eveningReviewIdx = tasks.findIndex(t => t.typeLabel.includes('Вечерен преговор'));
    const eveningReview = eveningReviewIdx >= 0 ? tasks.splice(eveningReviewIdx, 1)[0] : null;

    const priorityValue = (type: string): number => {
      switch (type) {
        case 'critical': return 0;
        case 'high': return 1;
        case 'medium': return 2;
        case 'normal': return 3;
        case 'project': return 4;
        case 'technique': return 5;
        default: return 6;
      }
    };

    // Group tasks into priority tiers
    const tiers = new Map<number, DailyTask[]>();
    for (const task of tasks) {
      const p = priorityValue(task.type);
      if (!tiers.has(p)) tiers.set(p, []);
      tiers.get(p)!.push(task);
    }

    // Within each tier, round-robin by subject
    const interleaved: DailyTask[] = [];
    const sortedTierKeys = [...tiers.keys()].sort((a, b) => a - b);

    for (const tierKey of sortedTierKeys) {
      const tierTasks = tiers.get(tierKey)!;
      if (tierTasks.length <= 1) {
        interleaved.push(...tierTasks);
        continue;
      }

      // Group by subject within this tier
      const bySubject = new Map<string, DailyTask[]>();
      for (const t of tierTasks) {
        const key = t.subjectId || t.projectId || t.id;
        if (!bySubject.has(key)) bySubject.set(key, []);
        bySubject.get(key)!.push(t);
      }

      // Round-robin across subjects
      const queues = [...bySubject.values()];
      while (queues.some(q => q.length > 0)) {
        for (const q of queues) {
          if (q.length > 0) interleaved.push(q.shift()!);
        }
      }
    }

    // Final pass: if two consecutive tasks share a subject, try swapping with the next different one
    // Only swap within the same priority tier to preserve priority ordering
    for (let i = 1; i < interleaved.length - 1; i++) {
      if (interleaved[i].subjectId && interleaved[i].subjectId === interleaved[i - 1].subjectId) {
        const currentPriority = priorityValue(interleaved[i].type);
        for (let j = i + 1; j < Math.min(i + 4, interleaved.length); j++) {
          if (interleaved[j].subjectId !== interleaved[i].subjectId
              && priorityValue(interleaved[j].type) === currentPriority) {
            [interleaved[i], interleaved[j]] = [interleaved[j], interleaved[i]];
            break;
          }
        }
      }
    }

    // Evening review always last
    if (eveningReview) interleaved.push(eveningReview);

    return interleaved;
  }

  return tasks;
}

// ============================================================================
// Soft Cap — Priority summary when plan exceeds available time
// ============================================================================

export type PriorityBucket = 'must' | 'should' | 'can-postpone' | 'flexible';

export interface PrioritySummary {
  totalMinutes: number;
  availableMinutes: number;
  isOverloaded: boolean;
  buckets: {
    bucket: PriorityBucket;
    label: string;
    description: string;
    tasks: DailyTask[];
    totalMinutes: number;
  }[];
  /** Tasks that fit within available time (in priority order) */
  prioritizedIds: Set<string>;
}

/**
 * Analyze daily plan and generate priority summary.
 * When plan exceeds available time, suggests what to focus on.
 */
export function generatePrioritySummary(
  tasks: DailyTask[],
  availableMinutes: number
): PrioritySummary {
  // Classify each task into a priority bucket
  // Uses priorityBucket field set at task creation (robust, not display-string dependent)
  const classifyTask = (task: DailyTask): PriorityBucket => {
    if (task.priorityBucket) return task.priorityBucket;
    // Fallback for tasks without priorityBucket (e.g. custom/manual plans)
    if (task.type === 'critical') return 'must';
    if (task.type === 'project') return 'flexible';
    if (task.type === 'technique') return 'flexible';
    return 'can-postpone';
  };

  const must: DailyTask[] = [];
  const should: DailyTask[] = [];
  const canPostpone: DailyTask[] = [];
  const flexible: DailyTask[] = [];

  for (const task of tasks) {
    const bucket = classifyTask(task);
    switch (bucket) {
      case 'must': must.push(task); break;
      case 'should': should.push(task); break;
      case 'can-postpone': canPostpone.push(task); break;
      case 'flexible': flexible.push(task); break;
    }
  }

  const sumMinutes = (arr: DailyTask[]) => arr.reduce((s, t) => s + t.estimatedMinutes, 0);
  const totalMinutes = sumMinutes(tasks);

  // Build prioritized list that fits in available time
  const prioritizedIds = new Set<string>();
  let timeLeft = availableMinutes;

  // Add in priority order: must → should → can-postpone → flexible
  for (const bucket of [must, should, canPostpone, flexible]) {
    for (const task of bucket) {
      if (timeLeft >= task.estimatedMinutes) {
        prioritizedIds.add(task.id);
        timeLeft -= task.estimatedMinutes;
      } else if (timeLeft > 0 && task.estimatedMinutes > 0) {
        // Partial fit — still include if at least half can be done
        if (timeLeft >= task.estimatedMinutes * 0.5) {
          prioritizedIds.add(task.id);
          timeLeft = 0;
        }
      }
    }
  }

  return {
    totalMinutes,
    availableMinutes,
    isOverloaded: totalMinutes > availableMinutes * 1.2, // 20% buffer before showing warning
    buckets: [
      {
        bucket: 'must' as PriorityBucket,
        label: 'Задължително днес',
        description: 'Забравяш ако не днес / краен срок',
        tasks: must,
        totalMinutes: sumMinutes(must),
      },
      {
        bucket: 'should' as PriorityBucket,
        label: 'Важно за темпото',
        description: 'Поддържа плана ти за покриване',
        tasks: should,
        totalMinutes: sumMinutes(should),
      },
      {
        bucket: 'can-postpone' as PriorityBucket,
        label: 'Може утре',
        description: 'Полезно, но няма спешност',
        tasks: canPostpone,
        totalMinutes: sumMinutes(canPostpone),
      },
      {
        bucket: 'flexible' as PriorityBucket,
        label: 'По избор',
        description: 'Проекти и техники — без академичен натиск',
        tasks: flexible,
        totalMinutes: sumMinutes(flexible),
      },
    ].filter(b => b.tasks.length > 0),
    prioritizedIds,
  };
}

export function parseTopicsFromText(text: string): Omit<Topic, 'id'>[] {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.map((line, index) => {
    const match = line.match(/^(\d+)[\.\)\-\s]+(.+)$/);
    const name = match ? match[2].trim() : line.trim();
    // Use parsed number if available, otherwise sequential
    const parsedNumber = match ? parseInt(match[1], 10) : index + 1;
    return {
      number: parsedNumber,
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
  studyGoals?: StudyGoals,
  academicPeriod?: AcademicPeriod
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

  // Check if semester has started
  const semStart = academicPeriod?.semesterStart ? new Date(academicPeriod.semesterStart) : null;
  const semesterStarted = !semStart || semStart <= tomorrow;

  // Check for exercises tomorrow
  const tomorrowExercises = schedule.filter(c => {
    if (c.day !== tomorrowDay || !CLASS_TYPES[c.type].prepRequired) return false;
    if (!semesterStarted && !c.startDate) return false; // semester not started
    if (c.startDate && new Date(c.startDate) > tomorrow) return false;
    return true;
  });

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

// ============================================================================
// DASHBOARD WIDGET ALGORITHMS
// ============================================================================

export interface SubjectHealthStatus {
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  health: 'healthy' | 'warning' | 'critical';
  issues: string[];
  daysUntilExam: number | null;
  coverage: number;
  decayingTopicsCount: number;
}

/**
 * Get health status for all subjects
 * Critical: exam ≤7d + coverage <50% OR exam ≤3d + coverage <70%
 * Warning: exam ≤14d + coverage <70% OR >5 decaying topics
 * Healthy: otherwise
 */
export function getSubjectHealth(subjects: Subject[]): SubjectHealthStatus[] {
  const results: SubjectHealthStatus[] = [];

  for (const subject of subjects) {
    if (subject.archived || subject.deletedAt) continue;
    if (subject.topics.length === 0) continue;

    const daysUntilExam = getDaysUntil(subject.examDate);
    const hasExam = daysUntilExam !== Infinity && daysUntilExam >= 0;

    // Calculate coverage (green = 100%, yellow = 70%, orange = 30%, gray = 0%)
    const totalTopics = subject.topics.length;
    const greenCount = subject.topics.filter(t => t.status === 'green').length;
    const yellowCount = subject.topics.filter(t => t.status === 'yellow').length;
    const orangeCount = subject.topics.filter(t => t.status === 'orange').length;
    const coverage = ((greenCount * 1.0 + yellowCount * 0.7 + orangeCount * 0.3) / totalTopics) * 100;

    // Count decaying topics (not reviewed in >7 days and not gray)
    const decayingTopicsCount = subject.topics.filter(t => {
      if (t.status === 'gray') return false;
      const days = getDaysSince(t.lastReview);
      return days >= 7;
    }).length;

    const issues: string[] = [];
    let health: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Critical conditions
    if (hasExam && daysUntilExam <= 3 && coverage < 70) {
      health = 'critical';
      issues.push(`Изпит след ${daysUntilExam}д, само ${Math.round(coverage)}% покритие`);
    } else if (hasExam && daysUntilExam <= 7 && coverage < 50) {
      health = 'critical';
      issues.push(`Изпит след ${daysUntilExam}д, само ${Math.round(coverage)}% покритие`);
    }
    // Warning conditions
    else if (hasExam && daysUntilExam <= 14 && coverage < 70) {
      health = 'warning';
      issues.push(`Изпит след ${daysUntilExam}д, ${Math.round(coverage)}% покритие`);
    } else if (decayingTopicsCount > 5) {
      health = 'warning';
      issues.push(`${decayingTopicsCount} теми се нуждаят от преговор`);
    }

    // Add decay warning if there are decaying topics but not already in issues
    if (decayingTopicsCount > 0 && !issues.some(i => i.includes('преговор'))) {
      if (decayingTopicsCount > 3) {
        issues.push(`${decayingTopicsCount} теми не са преговаряни скоро`);
      }
    }

    // Only add to results if not healthy or if there are any issues
    if (health !== 'healthy' || issues.length > 0) {
      results.push({
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        health,
        issues,
        daysUntilExam: hasExam ? daysUntilExam : null,
        coverage: Math.round(coverage),
        decayingTopicsCount
      });
    }
  }

  // Sort by health (critical first) then by days until exam
  const healthOrder = { critical: 0, warning: 1, healthy: 2 };
  results.sort((a, b) => {
    if (healthOrder[a.health] !== healthOrder[b.health]) {
      return healthOrder[a.health] - healthOrder[b.health];
    }
    const aExam = a.daysUntilExam ?? Infinity;
    const bExam = b.daysUntilExam ?? Infinity;
    return aExam - bExam;
  });

  return results;
}

export interface NextExamReadiness {
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  examDate: string;
  daysUntil: number;
  readinessPercent: number;
  coverage: number;
  predictedGrade: number;
  status: 'ready' | 'on_track' | 'at_risk' | 'behind';
}

/**
 * Get readiness status for the next upcoming exam
 * Readiness = 40% coverage + 60% predicted grade (normalized to 0-100)
 */
export function getNextExamReadiness(
  subjects: Subject[],
  questionBanks: QuestionBank[] = []
): NextExamReadiness | null {
  // Find the closest exam
  let closestSubject: Subject | null = null;
  let closestDays = Infinity;

  for (const subject of subjects) {
    if (subject.archived || subject.deletedAt) continue;
    if (!subject.examDate) continue;

    const days = getDaysUntil(subject.examDate);
    if (days >= 0 && days < closestDays) {
      closestDays = days;
      closestSubject = subject;
    }
  }

  if (!closestSubject || closestDays === Infinity) return null;

  // Calculate coverage
  const totalTopics = closestSubject.topics.length;
  if (totalTopics === 0) return null;

  const greenCount = closestSubject.topics.filter(t => t.status === 'green').length;
  const yellowCount = closestSubject.topics.filter(t => t.status === 'yellow').length;
  const orangeCount = closestSubject.topics.filter(t => t.status === 'orange').length;
  const coverage = ((greenCount * 1.0 + yellowCount * 0.7 + orangeCount * 0.3) / totalTopics) * 100;

  // Get predicted grade
  const prediction = calculatePredictedGrade(closestSubject, false, questionBanks);
  const predictedGrade = prediction.current;

  // Calculate readiness: 40% coverage + 60% predicted grade (normalized)
  // Grade is 2-6, normalize to 0-100: (grade - 2) / 4 * 100
  const gradeNormalized = ((predictedGrade - 2) / 4) * 100;
  const readinessPercent = Math.round(coverage * 0.4 + gradeNormalized * 0.6);

  // Determine status - scale thresholds by time remaining
  // Far-away exams (>90 days) should not show panic statuses
  let status: 'ready' | 'on_track' | 'at_risk' | 'behind';
  if (closestDays > 90) {
    // Very far away: only "behind" if truly 0 effort
    if (readinessPercent >= 30) status = 'ready';
    else if (readinessPercent >= 10) status = 'on_track';
    else if (coverage > 0) status = 'on_track';
    else status = 'at_risk';
  } else if (closestDays > 30) {
    // Medium distance: relaxed thresholds
    if (readinessPercent >= 60) status = 'ready';
    else if (readinessPercent >= 30) status = 'on_track';
    else if (readinessPercent >= 15) status = 'at_risk';
    else status = 'behind';
  } else {
    // Close exam (≤30 days): strict thresholds
    if (readinessPercent >= 80) status = 'ready';
    else if (readinessPercent >= 60) status = 'on_track';
    else if (readinessPercent >= 40) status = 'at_risk';
    else status = 'behind';
  }

  return {
    subjectId: closestSubject.id,
    subjectName: closestSubject.name,
    subjectColor: closestSubject.color,
    examDate: closestSubject.examDate!,
    daysUntil: closestDays,
    readinessPercent,
    coverage: Math.round(coverage),
    predictedGrade,
    status
  };
}

// Overall on-track status across ALL subjects with exams
export interface OverallOnTrackStatus {
  status: 'on_track' | 'at_risk' | 'behind' | 'ready';
  label: string;
  avgReadiness: number;
  subjectsAtRisk: number;
  subjectsBehind: number;
  totalWithExam: number;
}

export function getOverallOnTrackStatus(
  subjects: Subject[],
  questionBanks: QuestionBank[] = []
): OverallOnTrackStatus | null {
  const active = subjects.filter(s => !s.archived && !s.deletedAt && s.examDate);
  if (active.length === 0) return null;

  let totalReadiness = 0;
  let atRisk = 0;
  let behind = 0;
  let counted = 0;

  for (const subject of active) {
    const days = getDaysUntil(subject.examDate);
    if (days < 0 || subject.topics.length === 0) continue;

    const totalTopics = subject.topics.length;
    const greenCount = subject.topics.filter(t => t.status === 'green').length;
    const yellowCount = subject.topics.filter(t => t.status === 'yellow').length;
    const orangeCount = subject.topics.filter(t => t.status === 'orange').length;
    const coverage = ((greenCount + yellowCount * 0.7 + orangeCount * 0.3) / totalTopics) * 100;

    const prediction = calculatePredictedGrade(subject, false, questionBanks);
    const gradeNormalized = ((prediction.current - 2) / 4) * 100;
    const readiness = coverage * 0.4 + gradeNormalized * 0.6;

    totalReadiness += readiness;
    counted++;

    if (days <= 30) {
      if (readiness < 40) behind++;
      else if (readiness < 60) atRisk++;
    } else if (days <= 90) {
      if (readiness < 15) behind++;
      else if (readiness < 30) atRisk++;
    }
  }

  if (counted === 0) return null;

  const avgReadiness = totalReadiness / counted;

  let status: OverallOnTrackStatus['status'];
  let label: string;
  if (behind > 0) { status = 'behind'; label = 'Изоставаш'; }
  else if (atRisk > 0) { status = 'at_risk'; label = 'Внимание'; }
  else if (avgReadiness >= 70) { status = 'ready'; label = 'Готов'; }
  else { status = 'on_track'; label = 'По график'; }

  return { status, label, avgReadiness: Math.round(avgReadiness), subjectsAtRisk: atRisk, subjectsBehind: behind, totalWithExam: counted };
}
