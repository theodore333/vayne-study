import { Subject, Topic, TopicStatus, DailyStatus, PredictedGrade, DailyTask, ScheduleClass, GradeFactor, parseExamFormat, getQuestionTypeWeights, QuestionBank } from './types';
import { DECAY_RULES, STATUS_CONFIG, MOTIVATIONAL_MESSAGES, CLASS_TYPES } from './constants';

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
  if (topics.length === 0 || topicsOnExam <= 0) {
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
    const shuffled = [...topicScores].sort(() => Math.random() - 0.5);
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
    const currentContribution = t.score / actualTopicsOnExam;
    const improvedContribution = improvedScore / actualTopicsOnExam;
    const impact = (improvedContribution - currentContribution) * (1 / topics.length * actualTopicsOnExam);

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

export function applyDecay(topic: Topic): Topic {
  if (topic.status === 'gray') return topic;

  const daysSinceReview = getDaysSince(topic.lastReview);
  const rules = DECAY_RULES[topic.status];

  for (const rule of rules) {
    if (daysSinceReview >= rule.days) {
      return { ...topic, status: rule.newStatus };
    }
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
    // Recency factor: more recent = higher weight (last quiz = 1.5x, older = decreasing)
    const recencyFactor = 1 + (0.5 * (index / history.length));
    const quizWeight = (quiz.weight || 1.0) * recencyFactor;

    totalWeight += quizWeight;
    weightedScore += quiz.score * quizWeight;
  });

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

/**
 * Get topic priority score (lower = needs more attention)
 * Combines: mastery score, bloom level, time since last review, quiz weight
 */
export function getTopicPriority(topic: Topic): number {
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

  return Math.max(0, priority);
}

export function calculateEffectiveHours(status: DailyStatus): number {
  let hours = status.availableHours;
  if (status.sick) hours *= 0.5;
  if (status.sleep < 3) hours *= 0.7;
  if (status.energy < 3) hours *= 0.8;
  return Math.max(1, Math.round(hours * 10) / 10);
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
  let avgQuizGrade = gradedTopics.length > 0
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

  // Calculate both modes
  const currentPrediction = vayneMode ? predicted : predicted;
  const vaynePrediction = vayneMode ? predicted : calculatePredictedGrade(subject, true, questionBanks).current;

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

export function generateDailyPlan(
  subjects: Subject[],
  schedule: ScheduleClass[],
  effectiveHours: number
): DailyTask[] {
  const tasks: DailyTask[] = [];
  const totalMinutes = effectiveHours * 60;
  let remainingMinutes = totalMinutes;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = (tomorrow.getDay() + 6) % 7; // Convert to Mon=0

  // 1. CRITICAL: Exercises tomorrow (40% of time)
  const criticalMinutes = totalMinutes * 0.4;
  const tomorrowExercises = schedule.filter(
    c => c.day === tomorrowDay && CLASS_TYPES[c.type].prepRequired
  );

  for (const exercise of tomorrowExercises) {
    const subject = subjects.find(s => s.id === exercise.subjectId);
    if (!subject || subject.topics.length === 0) continue;

    // Sort by weighted priority (lower = needs more attention)
    const weakTopics = subject.topics
      .filter(t => t.status !== 'green')
      .sort((a, b) => getTopicPriority(a) - getTopicPriority(b))
      .slice(0, 5);

    if (weakTopics.length > 0) {
      const taskMinutes = Math.min(criticalMinutes / tomorrowExercises.length, remainingMinutes);
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'critical',
        typeLabel: `${CLASS_TYPES[exercise.type].icon} ${CLASS_TYPES[exercise.type].label} утре`,
        description: `Подготовка за ${CLASS_TYPES[exercise.type].label.toLowerCase()}`,
        topics: weakTopics,
        estimatedMinutes: Math.round(taskMinutes),
        completed: false
      });
      remainingMinutes -= taskMinutes;
    }
  }

  // 2. HIGH: Exam in 7 days (50% of remaining)
  const examSubjects = subjects
    .filter(s => {
      const days = getDaysUntil(s.examDate);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => getDaysUntil(a.examDate) - getDaysUntil(b.examDate));

  const highMinutes = remainingMinutes * 0.5;
  for (const subject of examSubjects) {
    if (remainingMinutes <= 0) break;

    // Check exam format for special recommendations
    const examFormat = parseExamFormat(subject.examFormat);
    const formatGaps = analyzeFormatGaps(subject);

    // Sort by weighted priority (lower = needs more attention)
    const weakTopics = subject.topics
      .filter(t => t.status !== 'green')
      .sort((a, b) => getTopicPriority(a) - getTopicPriority(b))
      .slice(0, 8);

    if (weakTopics.length > 0) {
      const taskMinutes = Math.min(highMinutes / examSubjects.length, remainingMinutes);
      const daysLeft = getDaysUntil(subject.examDate);

      // Format-aware description
      let description = 'Интензивна подготовка за изпит';
      if (formatGaps.caseWeakness && examFormat?.cases) {
        description = `Фокус върху казуси (${examFormat.cases} на изпита) + слаби теми`;
      } else if (formatGaps.hasOpenQuestions && examFormat?.openQuestions) {
        description = `Упражнявай писмени отговори (${examFormat.openQuestions} на изпита)`;
      } else if (examFormat?.mcq) {
        description = `MCQ практика (${examFormat.mcq} на изпита) - покрий повече теми`;
      }

      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'high',
        typeLabel: `📝 Изпит след ${daysLeft} ${daysLeft === 1 ? 'ден' : 'дни'}`,
        description,
        topics: weakTopics,
        estimatedMinutes: Math.round(taskMinutes),
        completed: false
      });
      remainingMinutes -= taskMinutes;
    }
  }

  // 3. MEDIUM: Decay warning (30% of remaining)
  const mediumMinutes = remainingMinutes * 0.3;
  for (const subject of subjects) {
    if (remainingMinutes <= 0) break;

    const decayingTopics = subject.topics.filter(t => {
      const days = getDaysSince(t.lastReview);
      return days >= 7 && t.status !== 'gray';
    });

    if (decayingTopics.length > 0) {
      const taskMinutes = Math.min(mediumMinutes / 2, remainingMinutes);
      tasks.push({
        id: generateId(),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectColor: subject.color,
        type: 'medium',
        typeLabel: '⚠️ Риск от забравяне',
        description: 'Преговор на теми без review 7+ дни',
        topics: decayingTopics.slice(0, 5),
        estimatedMinutes: Math.round(taskMinutes),
        completed: false
      });
      remainingMinutes -= taskMinutes;
    }
  }

  // 4. NORMAL: New material (rest)
  for (const subject of subjects) {
    if (remainingMinutes <= 15) break;

    const newTopics = subject.topics.filter(t => t.status === 'gray');
    const daysUntilExam = getDaysUntil(subject.examDate);

    if (newTopics.length > 0 && daysUntilExam !== Infinity) {
      const priority = newTopics.length / Math.max(1, daysUntilExam);
      if (priority > 0.5) {
        const taskMinutes = Math.min(remainingMinutes / 2, remainingMinutes);
        tasks.push({
          id: generateId(),
          subjectId: subject.id,
          subjectName: subject.name,
          subjectColor: subject.color,
          type: 'normal',
          typeLabel: '📚 Нов материал',
          description: 'Започни нови теми',
          topics: newTopics.slice(0, 3),
          estimatedMinutes: Math.round(taskMinutes),
          completed: false
        });
        remainingMinutes -= taskMinutes;
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
      quizHistory: []
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

export function getAlerts(subjects: Subject[], schedule: ScheduleClass[]): {
  type: 'critical' | 'warning' | 'info';
  message: string;
  subjectId?: string;
}[] {
  const alerts: { type: 'critical' | 'warning' | 'info'; message: string; subjectId?: string }[] = [];

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

  // Check for decay warnings
  for (const subject of subjects) {
    const decayingCount = subject.topics.filter(t => {
      const days = getDaysSince(t.lastReview);
      return days >= 7 && t.status !== 'gray';
    }).length;

    if (decayingCount >= 3) {
      alerts.push({
        type: 'warning',
        message: `⚠️ ${subject.name}: ${decayingCount} теми в риск от забравяне`,
        subjectId: subject.id
      });
    }
  }

  return alerts;
}
