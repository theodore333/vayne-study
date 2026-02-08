import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// Types for request data
interface QuizHistoryItem {
  score: number;
  date: string;
}

interface RequestTopic {
  id: string;
  name: string;
  status: 'gray' | 'orange' | 'yellow' | 'green';
  quizHistory?: QuizHistoryItem[];
  quizCount: number;
}

interface RequestSubject {
  id: string;
  name: string;
  subjectType: string;
  examDate: string | null;
  examFormat: string | null;
  topics: RequestTopic[];
}

interface RequestTimerSession {
  startTime: string;
  endTime: string | null;
  duration: number;
}

interface SubjectSummary {
  name: string;
  type: string;
  examFormat: string;
  formatStrategy: string;
  daysUntilExam: number | null;
  totalTopics: number;
  remainingTopics: number;
  weightedWorkload: number;
  workloadPerDay: number;
  rawTopicsPerDay: number;
  workloadWarning: string;
  greenTopics: number;
  yellowTopics: number;
  orangeTopics: number;
  grayTopics: number;
  weakTopics: string[];
  percentComplete: number;
  progressPercent: number;
  touchedTopics: number;
}

interface AnkiStats {
  dueToday: number;
  newToday: number;
  totalCards: number;
  totalDecks: number;
}

export async function POST(request: NextRequest) {
  try {
    const { subjects, timerSessions, dailyStatus, type, apiKey, studyGoals, ankiStats, studyTechniques } = await request.json() as {
      subjects: RequestSubject[];
      timerSessions: RequestTimerSession[];
      dailyStatus: { sick?: boolean; holiday?: boolean };
      type: 'daily' | 'weekly';
      apiKey: string;
      studyGoals?: { dailyMinutes?: number; weekendDailyMinutes?: number };
      ankiStats?: AnkiStats | null;
      studyTechniques?: Array<{ name: string; slug: string; category: string; practiceCount: number; lastPracticedAt: string | null; notes: string; isActive: boolean }>;
    };

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API ключ е задължителен. Добави го в Settings.' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Calculate stats for context
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Weekly sessions
    const weeklySessions = timerSessions.filter((s) =>
      s.endTime && new Date(s.startTime) >= weekAgo
    );
    const weeklyMinutes = weeklySessions.reduce((sum, s) => sum + (s.duration || 0), 0);

    // Today's sessions
    const todayStr = today.toISOString().split('T')[0];
    const todaySessions = timerSessions.filter((s) =>
      s.endTime && s.startTime.startsWith(todayStr)
    );
    const todayMinutes = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);

    // Subject summaries with WEIGHTED workload calculation
    // Status weights (effort needed):
    // - Gray: 1.0 (не съм пипал - пълно учене)
    // - Orange: 0.75 (минимални основи - нужна работа)
    // - Yellow: 0.35 (знам добре - само преговор/детайли)
    // - Green: 0 (готово)
    const STATUS_WEIGHTS = { gray: 1.0, orange: 0.75, yellow: 0.35, green: 0 };

    const subjectSummaries: SubjectSummary[] = subjects.map((s) => {
      const totalTopics = s.topics.length;
      const greenTopics = s.topics.filter((t) => t.status === 'green').length;
      const yellowTopics = s.topics.filter((t) => t.status === 'yellow').length;
      const orangeTopics = s.topics.filter((t) => t.status === 'orange').length;
      const grayTopics = s.topics.filter((t) => t.status === 'gray').length;

      // WEIGHTED workload calculation
      const weightedWorkload =
        grayTopics * STATUS_WEIGHTS.gray +
        orangeTopics * STATUS_WEIGHTS.orange +
        yellowTopics * STATUS_WEIGHTS.yellow;
      const weightedWorkloadRounded = Math.round(weightedWorkload * 10) / 10;

      // Simple remaining (not green) for reference
      const remainingTopics = totalTopics - greenTopics;

      // Weak topics (low quiz scores)
      const weakTopics = s.topics
        .filter((t): t is RequestTopic & { quizHistory: QuizHistoryItem[] } =>
          Boolean(t.quizHistory && t.quizHistory.length > 0))
        .filter((t) => {
          const avgScore = t.quizHistory.reduce((sum, q) => sum + q.score, 0) / t.quizHistory.length;
          return avgScore < 60;
        })
        .map((t) => t.name);

      // Days until exam & weighted workload per day
      let daysUntilExam = null;
      let workloadPerDay = 0;
      let rawTopicsPerDay = 0;
      let workloadWarning = '';
      if (s.examDate) {
        const examDate = new Date(s.examDate);
        daysUntilExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilExam > 0) {
          workloadPerDay = Math.round((weightedWorkload / daysUntilExam) * 10) / 10;
          rawTopicsPerDay = Math.ceil(remainingTopics / daysUntilExam);

          // Warnings based on weighted workload
          if (workloadPerDay > 15) {
            workloadWarning = `НЕВЪЗМОЖНО: ${weightedWorkloadRounded} units за ${daysUntilExam} дни = ${workloadPerDay}/ден!`;
          } else if (workloadPerDay > 8) {
            workloadWarning = `МНОГО ТЕЖКО: ${workloadPerDay} units/ден`;
          } else if (workloadPerDay > 5) {
            workloadWarning = `Интензивно: ${workloadPerDay} units/ден`;
          }
        }
      }

      // Progress = topics that are not gray (have been touched)
      const touchedTopics = greenTopics + yellowTopics + orangeTopics;
      const progressPercent = totalTopics > 0 ? Math.round((touchedTopics / totalTopics) * 100) : 0;
      const readyPercent = totalTopics > 0 ? Math.round((greenTopics / totalTopics) * 100) : 0;

      // Exam format analysis
      const examFormat = s.examFormat || '';
      let formatStrategy = '';
      if (examFormat.toLowerCase().includes('случайн') || examFormat.toLowerCase().includes('тегл') || examFormat.toLowerCase().includes('random')) {
        formatStrategy = 'СЛУЧАЕН ИЗБОР: По-добре покрий ПОВЕЧЕ теми повърхностно, отколкото малко в дълбочина!';
      } else if (examFormat.toLowerCase().includes('казус') || examFormat.toLowerCase().includes('case')) {
        formatStrategy = 'КАЗУСИ: Фокусирай се на практическо приложение и клинично мислене.';
      } else if (examFormat.toLowerCase().includes('тест') || examFormat.toLowerCase().includes('mcq')) {
        formatStrategy = 'ТЕСТОВЕ: Важни са детайлите и точните факти.';
      } else if (examFormat.toLowerCase().includes('устен') || examFormat.toLowerCase().includes('oral')) {
        formatStrategy = 'УСТЕН: Трябва да можеш да обясниш с думи, не само да разпознаеш.';
      }

      return {
        name: s.name,
        type: s.subjectType,
        examFormat,
        formatStrategy,
        daysUntilExam,
        totalTopics,
        remainingTopics,
        weightedWorkload: weightedWorkloadRounded,
        workloadPerDay,
        rawTopicsPerDay,
        workloadWarning,
        greenTopics,
        yellowTopics,
        orangeTopics,
        grayTopics,
        weakTopics: weakTopics.slice(0, 5),
        percentComplete: readyPercent,
        progressPercent,
        touchedTopics
      };
    }).filter((s) => s.totalTopics > 0);

    // Build prompt based on type
    let prompt = '';

    // Check for critical exams
    const criticalExams = subjectSummaries.filter((s) => s.daysUntilExam !== null && s.daysUntilExam <= 7);
    const hasCriticalExam = criticalExams.length > 0;
    const mostUrgent = criticalExams.sort((a, b) => (a.daysUntilExam ?? 999) - (b.daysUntilExam ?? 999))[0];

    // Current time analysis
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    const timeStr = `${currentHour}:${currentMinute.toString().padStart(2, '0')}`;
    const productiveHoursLeft = Math.max(0, 23 - currentHour); // Until 23:00
    const todayHours = Math.round(todayMinutes / 60 * 10) / 10;

    // User's base daily goal (from settings, default 8 hours)
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    const userDailyGoalMinutes = studyGoals?.dailyMinutes || 480;
    const userWeekendGoalMinutes = studyGoals?.weekendDailyMinutes || userDailyGoalMinutes;
    const baseGoalHours = Math.round((isWeekend ? userWeekendGoalMinutes : userDailyGoalMinutes) / 60);

    // Dynamic daily target based on exam urgency
    let dailyTarget = baseGoalHours;
    let urgencyBoost = '';
    const urgentExamDays = mostUrgent?.daysUntilExam ?? Infinity;
    if (hasCriticalExam && urgentExamDays <= 2) {
      dailyTarget = Math.max(baseGoalHours, Math.round(baseGoalHours * 1.5)); // +50% for 2 days or less
      urgencyBoost = `ИЗПИТ СЛЕД ${urgentExamDays} ДНИ! Цел увеличена с 50%: ${dailyTarget}ч`;
    } else if (hasCriticalExam && urgentExamDays <= 5) {
      dailyTarget = Math.max(baseGoalHours, Math.round(baseGoalHours * 1.25)); // +25% for 5 days or less
      urgencyBoost = `Изпит скоро (${urgentExamDays} дни). Цел увеличена: ${dailyTarget}ч`;
    }

    // Adjust for sick/holiday (50% reduction)
    let statusNote = '';
    if (dailyStatus?.sick) {
      dailyTarget = Math.round(dailyTarget * 0.5);
      statusNote = `БОЛЕН: Намалена цел до ${dailyTarget}ч (50% от нормалното). Почивката е важна!`;
    } else if (dailyStatus?.holiday) {
      dailyTarget = Math.round(dailyTarget * 0.5);
      statusNote = `ПОЧИВКА: Намалена цел до ${dailyTarget}ч (50%). Все пак учи малко!`;
    }

    const hoursNeeded = Math.max(0, dailyTarget - todayHours);
    const isLate = currentHour >= 15 && todayHours < (dailyTarget * 0.25);
    const isCriticallyLate = currentHour >= 18 && todayHours < (dailyTarget * 0.4);

    // Build detailed subject info for prompt with weighted workload
    const subjectDetails = subjectSummaries.map((s) => {
      let info = `${s.name}:`;
      info += `\n  Теми: ${s.grayTopics} нови + ${s.orangeTopics} с основи + ${s.yellowTopics} за преговор + ${s.greenTopics} готови = ${s.totalTopics} общо`;
      info += `\n  Натоварване: ${s.weightedWorkload} units (${s.grayTopics}×1.0 + ${s.orangeTopics}×0.75 + ${s.yellowTopics}×0.35)`;
      if (s.daysUntilExam !== null) {
        info += `\n  Изпит: след ${s.daysUntilExam} дни | ${s.workloadPerDay} units/ден нужни`;
      }
      if (s.workloadWarning) info += `\n  ⚠️ ${s.workloadWarning}`;
      if (s.examFormat) info += `\n  Формат: ${s.examFormat}`;
      if (s.formatStrategy) info += `\n  Стратегия: ${s.formatStrategy}`;
      if (s.weakTopics.length > 0) info += `\n  Слаби теми: ${s.weakTopics.join(', ')}`;
      return info;
    }).join('\n\n');

    // Build study techniques context
    let techniqueContext = '';
    if (studyTechniques && studyTechniques.length > 0) {
      const activeTechniques = studyTechniques.filter(t => t.isActive);
      const staleTechniques = activeTechniques.filter(t => {
        if (!t.lastPracticedAt) return true;
        const daysSince = Math.floor((today.getTime() - new Date(t.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince >= 3;
      });
      const recentlyPracticed = activeTechniques.filter(t => {
        if (!t.lastPracticedAt) return false;
        const daysSince = Math.floor((today.getTime() - new Date(t.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince < 3;
      });

      techniqueContext = `
УЧЕБНИ ТЕХНИКИ (IcanStudy/HUDLE):
- Активни: ${activeTechniques.map(t => `${t.name} (${t.practiceCount}x${t.lastPracticedAt ? ', последно: ' + new Date(t.lastPracticedAt).toLocaleDateString('bg-BG') : ', непрактикувана'})`).join(', ')}
${staleTechniques.length > 0 ? `- НЕПРАКТИКУВАНИ (>3 дни): ${staleTechniques.map(t => t.name).join(', ')} - ПРЕПОРЪЧАЙ да практикува поне 1 от тях!` : ''}
${recentlyPracticed.length > 0 ? `- Скорошни: ${recentlyPracticed.map(t => t.name).join(', ')}` : ''}
- Когато съветваш, споменавай КОНКРЕТНА техника за днешните теми (напр. "Приложи Chunking за тежките теми" или "Interleaving е добра идея - имаш теми от различни предмети")`;
    }

    if (type === 'daily') {
      prompt = `Ти си СТРОГ учебен coach за медицински студент в МУ София. Анализирай данните и дай КОНКРЕТЕН съвет.

СЕГА Е ${timeStr}! ${isWeekend ? '(уикенд)' : '(делник)'}

ВРЕМЕ ДНЕС:
- Учил: ${todayMinutes} мин (${todayHours}ч)
- Дневна цел: ${dailyTarget}ч
- Нужни още: ${hoursNeeded}ч
- Оставащи часове до 23:00: ~${productiveHoursLeft}ч
${urgencyBoost ? '- ' + urgencyBoost : ''}
${statusNote ? '- ' + statusNote : ''}
${isLate ? '- ЗАКЪСНЕНИЕ: ' + currentHour + ':00 е, само ' + todayHours + 'ч от ' + dailyTarget + 'ч!' : ''}
${ankiStats ? `
ANKI FLASHCARDS:
- Due карти: ${ankiStats.dueToday}
- Нови карти: ${ankiStats.newToday}
- Общо карти в колекцията: ${ankiStats.totalCards}
- Очаквано време за Anki: ~${Math.round((ankiStats.dueToday + ankiStats.newToday) * 0.5)} мин` : ''}

СЕДМИЦА: ${Math.round(weeklyMinutes / 60)}ч

ПРЕДМЕТИ И НАТОВАРВАНЕ:
${subjectDetails}

${hasCriticalExam ? `
КРИТИЧЕН ИЗПИТ: ${mostUrgent.name}
- След ${mostUrgent.daysUntilExam} дни!
- Натоварване: ${mostUrgent.weightedWorkload} units (${mostUrgent.grayTopics} нови, ${mostUrgent.orangeTopics} с основи, ${mostUrgent.yellowTopics} за преговор)
- Нужни: ${mostUrgent.workloadPerDay} units/ден
${mostUrgent.workloadWarning ? '- ' + mostUrgent.workloadWarning : ''}
${mostUrgent.formatStrategy ? '- ' + mostUrgent.formatStrategy : ''}
` : ''}

${techniqueContext}

СИСТЕМА ЗА СТАТУС (важно!):
- СИВИ (×1.0): Не съм пипал - нужно ПЪЛНО учене
- ОРАНЖЕВИ (×0.75): Минимални основи - нужна сериозна работа
- ЖЪЛТИ (×0.35): Знам добре за потенциален отличен - само преговор и детайли
- ЗЕЛЕНИ (×0): Готови - не се броят

1 unit ≈ 1 тема с пълно учене. Жълта тема = 0.35 units (бърз преговор).

ИНСТРУКЦИИ ЗА ОТГОВОР:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji)
- Използвай WEIGHTED workload (units), не брой теми! Жълтите НЕ са като сивите!
- Кажи колко СИВИ (нови) + колко ОРАНЖЕВИ (с основи, нужна работа) + колко ЖЪЛТИ (преговор) теми да мине днес
- ОРАНЖЕВИТЕ са приоритет заедно със сивите - те имат само минимални основи!
${ankiStats && ankiStats.dueToday > 0 ? '- ANKI: Препоръчай да направи Anki reviews ПЪРВО, преди новите теми (due: ' + ankiStats.dueToday + ', ~' + Math.round(ankiStats.dueToday * 0.5) + ' мин)' : ''}
- Ако има случаен избор на изпита - препоръчай широко покритие на сиви + оранжеви
- Ако натоварването е нереалистично (>10 units/ден) - предложи да фокусира сиви и оранжеви
- ${dailyStatus?.sick ? 'БОЛЕН - бъди разбиращ, ' + dailyTarget + 'ч цел' : dailyStatus?.holiday ? 'ПОЧИВКА - ' + dailyTarget + 'ч цел' : 'Бъди строг'}
- Максимум 5-6 изречения, директно и конкретно
- Говори като треньор`;
    } else {
      // Weekly review
      prompt = `Ти си СТРОГ учебен coach за медицински студент. Прави седмичен преглед.

СЕДМИЦА:
- Сесии: ${weeklySessions.length}
- Време: ${Math.round(weeklyMinutes / 60)} часа

ПРЕДМЕТИ И ПРОГРЕС:
${subjectDetails}

ПРЕДСТОЯЩИ ИЗПИТИ:
${subjectSummaries.filter((s) => s.daysUntilExam !== null && s.daysUntilExam <= 14).map((s) =>
  `- ${s.name}: ${s.daysUntilExam}д | ${s.weightedWorkload} units (${s.grayTopics} сиви, ${s.orangeTopics} оранжеви, ${s.yellowTopics} жълти) | ${s.workloadPerDay} units/ден`
).join('\n') || 'Няма изпити в следващите 2 седмици'}

${techniqueContext}

СИСТЕМА ЗА СТАТУС:
- СИВИ (×1.0): Не съм пипал - ОРАНЖЕВИ (×0.75): Минимални основи - ЖЪЛТИ (×0.35): Знам добре - ЗЕЛЕНИ: Готови

ИНСТРУКЦИИ:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji)
- Използвай weighted workload (units) - оранжеви нужна работа, жълтите само преговор!
- СИВИ + ОРАНЖЕВИ са приоритет (нужна сериозна работа), жълтите са за затвърждаване
- Оцени седмицата спрямо units/ден нужни, не брой теми
- Ако има много сиви/оранжеви теми и малко време - предложи приоритизация
- Максимум 5-6 изречения`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = message.content.find(block => block.type === 'text');
    const advice = textContent ? textContent.text : 'Няма съвет в момента.';

    // Calculate cost
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return NextResponse.json({
      advice,
      cost,
      type
    });

  } catch (error) {
    console.error('AI advice error:', error);

    // Return more specific error message
    let errorMessage = 'Failed to get AI advice';
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('authentication')) {
        errorMessage = 'Невалиден API ключ. Провери го в Settings.';
      } else if (error.message.includes('429') || error.message.includes('rate')) {
        errorMessage = 'Rate limit - опитай пак след малко.';
      } else if (error.message.includes('model')) {
        errorMessage = 'Проблем с модела. Провери API ключа.';
      } else {
        errorMessage = `Грешка: ${error.message}`;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
