import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { subjects, userProgress, timerSessions, dailyStatus, type, apiKey, studyGoals } = await request.json();

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
    const weeklySessions = timerSessions.filter((s: any) =>
      s.endTime && new Date(s.startTime) >= weekAgo
    );
    const weeklyMinutes = weeklySessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);

    // Today's sessions
    const todayStr = today.toISOString().split('T')[0];
    const todaySessions = timerSessions.filter((s: any) =>
      s.endTime && s.startTime.startsWith(todayStr)
    );
    const todayMinutes = todaySessions.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);

    // Subject summaries with workload calculation
    const subjectSummaries = subjects.map((s: any) => {
      const totalTopics = s.topics.length;
      const greenTopics = s.topics.filter((t: any) => t.status === 'green').length;
      const yellowTopics = s.topics.filter((t: any) => t.status === 'yellow').length;
      const orangeTopics = s.topics.filter((t: any) => t.status === 'orange').length;
      const grayTopics = s.topics.filter((t: any) => t.status === 'gray').length;

      // Remaining topics (not green)
      const remainingTopics = totalTopics - greenTopics;

      // Weak topics (low quiz scores)
      const weakTopics = s.topics
        .filter((t: any) => t.quizHistory && t.quizHistory.length > 0)
        .filter((t: any) => {
          const avgScore = t.quizHistory.reduce((sum: number, q: any) => sum + q.score, 0) / t.quizHistory.length;
          return avgScore < 60;
        })
        .map((t: any) => t.name);

      // Days until exam & topics per day
      let daysUntilExam = null;
      let topicsPerDay = 0;
      let workloadWarning = '';
      if (s.examDate) {
        const examDate = new Date(s.examDate);
        daysUntilExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilExam > 0 && remainingTopics > 0) {
          topicsPerDay = Math.ceil(remainingTopics / daysUntilExam);
          if (topicsPerDay > 20) {
            workloadWarning = `НЕВЪЗМОЖНО: ${remainingTopics} теми за ${daysUntilExam} дни = ${topicsPerDay}/ден!`;
          } else if (topicsPerDay > 10) {
            workloadWarning = `МНОГО ТЕЖКО: ${topicsPerDay} теми/ден`;
          } else if (topicsPerDay > 5) {
            workloadWarning = `Интензивно: ${topicsPerDay} теми/ден`;
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
        topicsPerDay,
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
    }).filter((s: any) => s.totalTopics > 0);

    // Build prompt based on type
    let prompt = '';

    // Check for critical exams
    const criticalExams = subjectSummaries.filter((s: any) => s.daysUntilExam !== null && s.daysUntilExam <= 7);
    const hasCriticalExam = criticalExams.length > 0;
    const mostUrgent = criticalExams.sort((a: any, b: any) => a.daysUntilExam - b.daysUntilExam)[0];

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
    if (hasCriticalExam && mostUrgent?.daysUntilExam <= 2) {
      dailyTarget = Math.max(baseGoalHours, Math.round(baseGoalHours * 1.5)); // +50% for 2 days or less
      urgencyBoost = `ИЗПИТ СЛЕД ${mostUrgent.daysUntilExam} ДНИ! Цел увеличена с 50%: ${dailyTarget}ч`;
    } else if (hasCriticalExam && mostUrgent?.daysUntilExam <= 5) {
      dailyTarget = Math.max(baseGoalHours, Math.round(baseGoalHours * 1.25)); // +25% for 5 days or less
      urgencyBoost = `Изпит скоро (${mostUrgent.daysUntilExam} дни). Цел увеличена: ${dailyTarget}ч`;
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

    // Build detailed subject info for prompt
    const subjectDetails = subjectSummaries.map((s: any) => {
      let info = `${s.name}:`;
      info += ` ${s.remainingTopics}/${s.totalTopics} оставащи`;
      if (s.daysUntilExam !== null) {
        info += ` | ${s.daysUntilExam}д до изпит`;
        if (s.topicsPerDay > 0) {
          info += ` | Нужни ${s.topicsPerDay} теми/ден`;
        }
      }
      if (s.workloadWarning) info += ` | ${s.workloadWarning}`;
      if (s.examFormat) info += `\n  Формат: ${s.examFormat}`;
      if (s.formatStrategy) info += `\n  Стратегия: ${s.formatStrategy}`;
      if (s.weakTopics.length > 0) info += `\n  Слаби теми: ${s.weakTopics.join(', ')}`;
      info += `\n  Статус: ${s.greenTopics} зелени, ${s.yellowTopics} жълти, ${s.orangeTopics} оранжеви, ${s.grayTopics} сиви`;
      return info;
    }).join('\n\n');

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

СЕДМИЦА: ${Math.round(weeklyMinutes / 60)}ч

ПРЕДМЕТИ И НАТОВАРВАНЕ:
${subjectDetails}

${hasCriticalExam ? `
КРИТИЧЕН ИЗПИТ: ${mostUrgent.name}
- След ${mostUrgent.daysUntilExam} дни!
- Оставащи теми: ${mostUrgent.remainingTopics}
- Нужни на ден: ${mostUrgent.topicsPerDay} теми
${mostUrgent.workloadWarning ? '- ' + mostUrgent.workloadWarning : ''}
${mostUrgent.formatStrategy ? '- ' + mostUrgent.formatStrategy : ''}
` : ''}

ИНСТРУКЦИИ ЗА ОТГОВОР:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji)
- Кажи КОНКРЕТНО колко теми трябва да мине ДНЕС за всеки предмет с изпит
- Ако има случаен избор на изпита (теглят се теми) - препоръчай широко покритие вместо дълбочина
- Ако натоварването е нереалистично (>15 теми/ден) - кажи го директно и предложи приоритизация
- Кои теми да ПРОПУСНЕ ако няма време за всички? (най-малко вероятни, най-лесни за научаване набързо)
- Кои теми са ЗАДЪЛЖИТЕЛНИ? (high-yield, чести на изпит)
- ${dailyStatus?.sick ? 'БОЛЕН - бъди разбиращ, ' + dailyTarget + 'ч цел' : dailyStatus?.holiday ? 'ПОЧИВКА - ' + dailyTarget + 'ч цел' : 'Бъди строг'}
- Максимум 5-6 изречения, директно и конкретно
- Говори като треньор който знае медицина`;
    } else {
      // Weekly review
      prompt = `Ти си СТРОГ учебен coach за медицински студент. Прави седмичен преглед.

СЕДМИЦА:
- Сесии: ${weeklySessions.length}
- Време: ${Math.round(weeklyMinutes / 60)} часа

ПРЕДМЕТИ И ПРОГРЕС:
${subjectDetails}

ПРЕДСТОЯЩИ ИЗПИТИ:
${subjectSummaries.filter((s: any) => s.daysUntilExam !== null && s.daysUntilExam <= 14).map((s: any) =>
  `- ${s.name}: ${s.daysUntilExam}д | ${s.remainingTopics} оставащи | ${s.topicsPerDay} теми/ден нужни`
).join('\n') || 'Няма изпити в следващите 2 седмици'}

ИНСТРУКЦИИ:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji)
- Оцени седмицата: достатъчно ли е времето спрямо предстоящите изпити?
- Конкретни приоритети за следващата седмица базирани на теми/ден нужни
- Ако темпото е недостатъчно за изпитите - кажи го директно с числа
- Препоръчай стратегия: широко покритие vs дълбочина, базирано на формата
- Максимум 5-6 изречения`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
    return NextResponse.json(
      { error: 'Failed to get AI advice' },
      { status: 500 }
    );
  }
}
