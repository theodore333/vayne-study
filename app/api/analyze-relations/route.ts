import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// See CLAUDE_MODELS.md for correct model IDs

export async function POST(request: NextRequest) {
  console.log('[ANALYZE-RELATIONS] === REQUEST STARTED ===');

  try {
    const { topics, subjectName, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 400 });
    }

    if (!topics || topics.length < 3) {
      return NextResponse.json({ error: 'Нужни са поне 3 теми за анализ' }, { status: 400 });
    }

    if (!subjectName) {
      return NextResponse.json({ error: 'Missing subject name' }, { status: 400 });
    }

    console.log('[ANALYZE-RELATIONS] Subject:', subjectName, 'Topics:', topics.length);

    const anthropic = new Anthropic({ apiKey });

    // Create topic list for prompt
    const topicList = topics.map((t: { number: number; name: string }) =>
      `${t.number}. ${t.name}`
    ).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Анализирай следните теми от предмет "${subjectName}" и определи техните връзки.

ТЕМИ:
${topicList}

ЗАДАЧА:
1. КЛЪСТЕРИ - групирай свързани теми в логически категории
   - Например: "Пулмология", "Кардиология", "Ендокринология"
   - Групирай по анатомична система, патология, или друг логичен принцип

2. СВЪРЗАНИ ТЕМИ - определи кои теми са тематично свързани
   - Споделят общи концепции
   - Надграждат една върху друга
   - Често се комбинират на изпит

3. PREREQUISITES - коя тема трябва да се научи ПРЕДИ друга
   - Базови теми преди специфични
   - Анатомия преди патология
   - Физиология преди клиника

ОТГОВОРИ САМО С ВАЛИДЕН JSON (без markdown formatting):
{
  "clusters": {
    "Име на клъстер": [номера на темите като числа],
    "Друг клъстер": [номера]
  },
  "relations": [
    {"topic": номер, "related": [номера на свързани теми]}
  ],
  "prerequisites": [
    {"topic": номер, "requires": [номера на теми които трябва да се знаят първо]}
  ]
}

ВАЖНО:
- Използвай САМО номерата на темите (числа), не имена
- Не всички теми имат prerequisites - само където има ясна зависимост
- Включи само силни/ясни връзки, не всяка възможна
- Върни САМО JSON, без обяснения`
      }]
    });

    const textContent = message.content.find(block => block.type === 'text');
    const responseText = textContent?.text || '{}';

    console.log('[ANALYZE-RELATIONS] Response length:', responseText.length);

    // Parse JSON response
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from response if wrapped in text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('[ANALYZE-RELATIONS] Failed to parse JSON:', responseText.slice(0, 200));
          return NextResponse.json({ error: 'Невалиден JSON отговор от AI' }, { status: 500 });
        }
      } else {
        console.error('[ANALYZE-RELATIONS] No JSON found in response');
        return NextResponse.json({ error: 'Не намерих JSON в отговора' }, { status: 500 });
      }
    }

    // Validate structure
    if (!parsed.clusters || !parsed.relations || !parsed.prerequisites) {
      console.error('[ANALYZE-RELATIONS] Invalid structure:', Object.keys(parsed));
      return NextResponse.json({ error: 'Непълен отговор от AI' }, { status: 500 });
    }

    // Sonnet pricing: $3/1M input, $15/1M output
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    console.log('[ANALYZE-RELATIONS] Success. Clusters:', Object.keys(parsed.clusters).length,
      'Relations:', parsed.relations.length, 'Prerequisites:', parsed.prerequisites.length);

    return NextResponse.json({
      clusters: parsed.clusters || {},
      relations: parsed.relations || [],
      prerequisites: parsed.prerequisites || [],
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    console.error('[ANALYZE-RELATIONS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ' }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
