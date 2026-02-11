import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, questions, topics } = body as {
      apiKey: string;
      questions: Array<{ id: string; text: string }>;
      topics: Array<{ id: string; name: string }>;
    };

    if (!apiKey || !questions?.length || !topics?.length) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    const topicList = topics.map((t, i) => `${i + 1}. ${t.name}`).join('\n');
    const questionList = questions.map((q, i) => `${i + 1}. ${q.text.substring(0, 200)}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Свържи всеки въпрос с най-подходящата тема.

ТЕМИ:
${topicList}

ВЪПРОСИ:
${questionList}

Върни JSON масив с индексите на темите (1-based) за всеки въпрос. Ако въпросът не пасва на нито една тема, напиши null.
Формат: [2, 1, null, 3, ...]
Масивът ТРЯБВА да има точно ${questions.length} елемента.
Върни САМО JSON масива, без markdown.`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Parse the response array
    let indices: (number | null)[];
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      indices = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 });
    }

    if (!Array.isArray(indices)) {
      return Response.json({ error: 'Invalid response format' }, { status: 500 });
    }

    // Map indices to question-topic links
    const links: Array<{ questionId: string; topicId: string }> = [];
    for (let i = 0; i < Math.min(questions.length, indices.length); i++) {
      const topicIndex = indices[i];
      if (topicIndex !== null && topicIndex >= 1 && topicIndex <= topics.length) {
        links.push({
          questionId: questions[i].id,
          topicId: topics[topicIndex - 1].id
        });
      }
    }

    // Haiku pricing: $1/1M input, $5/1M output
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const cost = (inputTokens * 0.001 + outputTokens * 0.005) / 1000000;

    return Response.json({
      links,
      linked: links.length,
      total: questions.length,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('invalid_api_key')) {
      return Response.json({ error: 'Невалиден API ключ.' }, { status: 401 });
    }
    return Response.json({ error: 'Грешка при автоматично свързване.' }, { status: 500 });
  }
}
