import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, subjectName, apiKey } = await request.json();

    if (!text || !apiKey) {
      return NextResponse.json({ error: 'Missing text or API key' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Прочети този конспект и извлечи структурата му${subjectName ? ` (предмет "${subjectName}")` : ''}.

ТЕКСТ:
${text}

ЗАДАЧА:
1. Извлечи всички теми от текста
2. Провери дали конспектът ВЕЧЕ Е РАЗДЕЛЕН на секции (напр. "Лекции:", "Теоретична част:", "Упражнения:", "Практикум:", "Семинари:" и т.н.)
3. Ако има такива секции - запази ги и маркирай типа:
   - "theoretical" = лекции, теория, теоретична част
   - "practical" = упражнения, практикум, семинари, практическа част
   - "mixed" = ако не е ясно обозначено
4. Ако НЯМА явни секции в текста - сложи всичко като "mixed"

НЕ ГАДАЙ! Само ако в текста ИЗРИЧНО пише "лекции", "упражнения" и т.н., тогава категоризирай.

ВЪРНИ САМО JSON (без markdown):
{
  "sections": [
    {
      "name": "Име на секция от текста (или null)",
      "topics": [
        {
          "number": 1,
          "name": "Име на тема",
          "type": "theoretical" | "practical" | "mixed"
        }
      ]
    }
  ],
  "summary": {
    "theoretical": брой,
    "practical": брой,
    "mixed": брой,
    "total": общо
  }
}

ВАЖНО:
- Запази ТОЧНО оригиналните имена на темите
- Номерирай последователно
- ИГНОРИРАЙ секции като "Препоръчана литература", "Литература:", "Библиография:", "Използвана литература", "Източници", "Учебници", "Помагала" и подобни - те НЕ СА теми за учене
- ИГНОРИРАЙ също имена на автори, издателства, ISBN номера, години на издаване
- Върни САМО JSON`
      }]
    });

    const textContent = message.content.find(block => block.type === 'text');
    const responseText = textContent?.text || '{}';

    // Clean and parse JSON
    let cleanedResponse = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '');

    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
    }

    cleanedResponse = cleanedResponse
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .trim();

    const parsed = JSON.parse(cleanedResponse);

    // Haiku pricing
    const cost = (message.usage.input_tokens * 0.0008 + message.usage.output_tokens * 0.004) / 1000;

    return NextResponse.json({
      sections: parsed.sections || [],
      summary: parsed.summary || { theoretical: 0, practical: 0, mixed: 0, total: 0 },
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    console.error('[ANALYZE-SYLLABUS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
