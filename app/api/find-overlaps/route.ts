import Anthropic from '@anthropic-ai/sdk';

interface TopicInfo {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
}

interface OverlapPair {
  topicA: { id: string; name: string; subjectName: string };
  topicB: { id: string; name: string; subjectName: string };
  confidence: number;
  reason: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, subjects } = body as {
      apiKey: string;
      subjects: Array<{ id: string; name: string; topics: Array<{ id: string; name: string }> }>;
    };

    if (!apiKey || !subjects?.length) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Build flat topic list with subject context
    const allTopics: TopicInfo[] = [];
    for (const subj of subjects) {
      for (const topic of subj.topics) {
        allTopics.push({
          id: topic.id,
          name: topic.name,
          subjectId: subj.id,
          subjectName: subj.name,
        });
      }
    }

    if (allTopics.length < 2) {
      return Response.json({ pairs: [], usage: { inputTokens: 0, outputTokens: 0, cost: 0 } });
    }

    // Format for the prompt — group by subject
    const subjectBlocks = subjects.map(s =>
      `## ${s.name}\n${s.topics.map((t, i) => `  ${i + 1}. [${t.id}] ${t.name}`).join('\n')}`
    ).join('\n\n');

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Анализирай тези теми от различни предмети и намери ПРИПОКРИВАЩИ СЕ теми (теми, които покриват сходно съдържание, но са от различни предмети).

${subjectBlocks}

Намери двойки от РАЗЛИЧНИ предмети, които имат значително припокриване в съдържанието (>50%).

Върни JSON масив с обекти:
[
  {
    "idA": "topic-id-A",
    "idB": "topic-id-B",
    "confidence": 85,
    "reason": "Кратко обяснение защо се припокриват"
  }
]

Правила:
- Само двойки от РАЗЛИЧНИ предмети
- confidence е число 50-100 (процент припокриване)
- Ако няма припокриващи се теми, върни празен масив []
- Върни САМО JSON масива, без markdown`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Parse response
    let rawPairs: Array<{ idA: string; idB: string; confidence: number; reason: string }>;
    try {
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      rawPairs = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 });
    }

    if (!Array.isArray(rawPairs)) {
      return Response.json({ error: 'Invalid response format' }, { status: 500 });
    }

    // Build lookup map
    const topicMap = new Map(allTopics.map(t => [t.id, t]));

    // Convert to enriched pairs
    const pairs: OverlapPair[] = rawPairs
      .filter(p => p.idA && p.idB && topicMap.has(p.idA) && topicMap.has(p.idB))
      .map(p => {
        const a = topicMap.get(p.idA)!;
        const b = topicMap.get(p.idB)!;
        return {
          topicA: { id: a.id, name: a.name, subjectName: a.subjectName },
          topicB: { id: b.id, name: b.name, subjectName: b.subjectName },
          confidence: Math.min(100, Math.max(50, p.confidence || 70)),
          reason: p.reason || '',
        };
      })
      // Filter out same-subject pairs (in case AI made a mistake)
      .filter(p => {
        const a = topicMap.get(p.topicA.id)!;
        const b = topicMap.get(p.topicB.id)!;
        return a.subjectId !== b.subjectId;
      });

    // Haiku pricing: $1/1M input, $5/1M output
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const cost = (inputTokens * 0.001 + outputTokens * 0.005) / 1000;

    return Response.json({
      pairs,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 1000000) / 1000000,
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('invalid_api_key')) {
      return Response.json({ error: 'Невалиден API ключ.' }, { status: 401 });
    }
    console.error('find-overlaps error:', error);
    return Response.json({ error: 'Грешка при търсене на припокриващи се теми.' }, { status: 500 });
  }
}
