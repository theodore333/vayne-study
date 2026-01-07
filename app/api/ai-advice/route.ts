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

    // Subject summaries
    const subjectSummaries = subjects.map((s: any) => {
      const totalTopics = s.topics.length;
      const greenTopics = s.topics.filter((t: any) => t.status === 'green').length;
      const yellowTopics = s.topics.filter((t: any) => t.status === 'yellow').length;
      const orangeTopics = s.topics.filter((t: any) => t.status === 'orange').length;
      const grayTopics = s.topics.filter((t: any) => t.status === 'gray').length;

      // Weak topics (low quiz scores)
      const weakTopics = s.topics
        .filter((t: any) => t.quizHistory && t.quizHistory.length > 0)
        .filter((t: any) => {
          const avgScore = t.quizHistory.reduce((sum: number, q: any) => sum + q.score, 0) / t.quizHistory.length;
          return avgScore < 60;
        })
        .map((t: any) => t.name);

      // Days until exam
      let daysUntilExam = null;
      if (s.examDate) {
        const examDate = new Date(s.examDate);
        daysUntilExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Progress = topics that are not gray (have been touched)
      const touchedTopics = greenTopics + yellowTopics + orangeTopics;
      const progressPercent = totalTopics > 0 ? Math.round((touchedTopics / totalTopics) * 100) : 0;
      const readyPercent = totalTopics > 0 ? Math.round((greenTopics / totalTopics) * 100) : 0;

      return {
        name: s.name,
        type: s.subjectType,
        examFormat: s.examFormat,
        daysUntilExam,
        totalTopics,
        progress: `${greenTopics}/${totalTopics} green, ${yellowTopics} yellow, ${orangeTopics} orange, ${grayTopics} gray`,
        weakTopics: weakTopics.slice(0, 3),
        percentComplete: readyPercent,
        progressPercent, // Topics touched (not gray)
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

    if (type === 'daily') {
      prompt = `Ти си СТРОГ учебен coach за медицински студент в МУ София. Говориш директно, без украшения.

СЕГА Е ${timeStr}! ${isWeekend ? '(уикенд)' : '(делник)'}

СТАТИСТИКА:
- Учил днес: ${todayMinutes} мин (${todayHours}ч)
- Дневна цел: ${dailyTarget}ч ${baseGoalHours !== dailyTarget ? `(база ${baseGoalHours}ч, коригирана)` : ''}
- Нужни още: ${hoursNeeded}ч
- Оставащи часове до 23:00: ~${productiveHoursLeft}ч
${urgencyBoost ? '- ' + urgencyBoost : ''}
${statusNote ? '- ' + statusNote : ''}
${isLate ? '- ЗАКЪСНЕНИЕ: ' + currentHour + ':00 е, а си учил само ' + todayHours + 'ч от ' + dailyTarget + 'ч цел!' : ''}
${isCriticallyLate ? '- КРИТИЧНО: Ще трябва да учиш до късно за да стигнеш целта!' : ''}

СЕДМИЦА: ${Math.round(weeklyMinutes / 60)}ч | Streak: ${userProgress?.stats?.longestStreak || 0} дни

ПРЕДМЕТИ:
${subjectSummaries.map((s: any) => `${s.name}: ${s.touchedTopics}/${s.totalTopics} минати (${s.progressPercent}%), ${s.percentComplete}% зелени${s.daysUntilExam !== null ? ' | ' + s.daysUntilExam + 'д до изпит' : ''}${s.weakTopics.length > 0 ? ' | Слаби: ' + s.weakTopics.join(', ') : ''}`).join('\n')}

${hasCriticalExam ? `КРИТИЧНО: ${mostUrgent.name} след ${mostUrgent.daysUntilExam} дни! ${mostUrgent.touchedTopics}/${mostUrgent.totalTopics} минати.` : ''}

ИНСТРУКЦИИ:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji)
- Коментирай часа и прогреса спрямо ДИНАМИЧНАТА цел от ${dailyTarget}ч (не фиксирана!)
- Ако е късно и има много за навакасване - кажи до колко часа трябва да учи
- ${dailyStatus?.sick ? 'Студентът е БОЛЕН - бъди разбиращ но насърчи леко учене (' + dailyTarget + 'ч днес)' : dailyStatus?.holiday ? 'Студентът е в ПОЧИВКА - все пак насърчи ' + dailyTarget + 'ч учене' : 'Бъди строг и директен'}
- Кажи ТОЧНО кои теми първо (yellow към green е най-бързо)
- Максимум 4-5 изречения
- Говори като треньор`;
    } else {
      // Weekly review
      prompt = `Ти си СТРОГ учебен coach за медицински студент. Прави седмичен преглед.

СЕДМИЦА:
- Сесии: ${weeklySessions.length}
- Време: ${Math.round(weeklyMinutes / 60)} часа
- Теми завършени: ${userProgress?.stats?.topicsCompleted || 0}
- Зелени теми: ${userProgress?.stats?.greenTopics || 0}

ПРЕДМЕТИ:
${subjectSummaries.map((s: any) => `${s.name}: ${s.percentComplete}% готов, ${s.daysUntilExam !== null ? s.daysUntilExam + ' дни до изпит' : 'без дата'}${s.weakTopics.length > 0 ? ' | Слаби: ' + s.weakTopics.join(', ') : ''}`).join('\n')}

ИНСТРУКЦИИ:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji)
- Кратка оценка: какво е направено, какво липсва
- Конкретни приоритети за следващата седмица
- Ако часовете са малко за медицина - кажи го директно
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
