import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function POST(request: NextRequest) {
  try {
    const { subjects, userProgress, timerSessions, dailyStatus, type } = await request.json();

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

    if (type === 'daily') {
      prompt = `Ти си личен учебен асистент за медицински студент. Дай кратък, полезен съвет за днешното учене.

ДАННИ:
- Ниво: ${userProgress?.level || 1} (${userProgress?.xp || 0} XP)
- Streak: ${userProgress?.stats?.longestStreak || 0} дни
- Статус днес: ${dailyStatus?.sick ? 'Болен' : dailyStatus?.holiday ? 'Почивка' : 'Нормален'}
- Тази седмица: ${Math.round(weeklyMinutes / 60)} часа учене

ПРЕДМЕТИ:
${subjectSummaries.map((s: any) => `- ${s.name}: ${s.progress} (${s.daysUntilExam !== null ? s.daysUntilExam + 'д до изпит' : 'без дата'})${s.weakTopics.length > 0 ? '\n  Слаби теми: ' + s.weakTopics.join(', ') : ''}`).join('\n')}

Дай 2-3 конкретни съвета за днес (на български). Бъди кратък и мотивиращ. Ако има критични предмети (≤7 дни), фокусирай се там.`;
    } else {
      // Weekly review
      prompt = `Ти си личен учебен асистент за медицински студент. Направи седмичен преглед.

ДАННИ ЗА СЕДМИЦАТА:
- Учебни сесии: ${weeklySessions.length}
- Общо време: ${Math.round(weeklyMinutes / 60)} часа
- XP спечелени: ~${userProgress?.totalXpEarned || 0} общо
- Текущо ниво: ${userProgress?.level || 1}
- Теми завършени общо: ${userProgress?.stats?.topicsCompleted || 0}
- Зелени теми: ${userProgress?.stats?.greenTopics || 0}

ПРЕДМЕТИ:
${subjectSummaries.map((s: any) => `- ${s.name} (${s.type}): ${s.percentComplete}% готов, ${s.daysUntilExam !== null ? s.daysUntilExam + 'д до изпит' : 'без дата'}
  Формат: ${s.examFormat || 'неизвестен'}
  ${s.weakTopics.length > 0 ? 'Слаби теми: ' + s.weakTopics.join(', ') : ''}`).join('\n\n')}

Направи кратък седмичен преглед (на български):
1. Какво е постигнато
2. Къде има проблеми
3. Приоритети за следващата седмица
4. Мотивиращо съобщение

Бъди конкретен и полезен. Максимум 200 думи.`;
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
