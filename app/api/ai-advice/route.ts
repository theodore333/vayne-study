import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { subjects, userProgress, timerSessions, dailyStatus, type, apiKey } = await request.json();

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

      return {
        name: s.name,
        type: s.subjectType,
        examFormat: s.examFormat,
        daysUntilExam,
        totalTopics,
        progress: `${greenTopics}/${totalTopics} green, ${yellowTopics} yellow, ${orangeTopics} orange, ${grayTopics} gray`,
        weakTopics: weakTopics.slice(0, 3),
        percentComplete: totalTopics > 0 ? Math.round((greenTopics / totalTopics) * 100) : 0
      };
    }).filter((s: any) => s.totalTopics > 0);

    // Build prompt based on type
    let prompt = '';

    // Check for critical exams
    const criticalExams = subjectSummaries.filter((s: any) => s.daysUntilExam !== null && s.daysUntilExam <= 7);
    const hasCriticalExam = criticalExams.length > 0;
    const mostUrgent = criticalExams.sort((a: any, b: any) => a.daysUntilExam - b.daysUntilExam)[0];

    if (type === 'daily') {
      prompt = `Ти си СТРОГ учебен coach за медицински студент в МУ София. Говориш директно, без украшения.

КОНТЕКСТ: Медицина изисква 8-12 часа учене на ден при критични изпити. Това е нормално. Push hard.

ДАННИ:
- Streak: ${userProgress?.stats?.longestStreak || 0} дни
- Тази седмица: ${Math.round(weeklyMinutes / 60)} часа учене
- Статус: ${dailyStatus?.sick ? 'Болен' : dailyStatus?.holiday ? 'Почивка' : 'Нормален'}

ПРЕДМЕТИ:
${subjectSummaries.map((s: any) => `${s.name}: ${s.progress} (${s.daysUntilExam !== null ? s.daysUntilExam + ' дни до изпит' : 'без дата'})${s.weakTopics.length > 0 ? ' | Слаби: ' + s.weakTopics.join(', ') : ''}`).join('\n')}

${hasCriticalExam ? `КРИТИЧНО: ${mostUrgent.name} след ${mostUrgent.daysUntilExam} дни! ${mostUrgent.percentComplete}% готов.` : ''}

ИНСТРУКЦИИ:
- Пиши ЧИСТ текст без форматиране (без **, без #, без emoji в началото на редове)
- Бъди ДИРЕКТЕН и АГРЕСИВЕН с времето - медицина изисква много часове
- Ако има изпит до 3 дни - препоръчай 8-10+ часа на ден
- Ако има изпит до 7 дни - препоръчай 6-8 часа на ден
- Кажи ТОЧНО кои теми да направи първо (yellow към green е най-бързо)
- Максимум 3-4 изречения, без списъци с точки
- Говори като треньор, не като приятел`;
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
