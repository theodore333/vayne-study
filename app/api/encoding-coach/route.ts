import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { material, topicName, subjectName, apiKey } = await request.json();

    if (!material || !topicName) {
      return NextResponse.json({ error: 'Липсва материал или име на тема' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Липсва API ключ' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Ти си study coach. Дай КРАТКА стратегия как да уча тази тема. НЕ обяснявай материала - само КАК да го уча.

ТЕМА: ${topicName}
ПРЕДМЕТ: ${subjectName || 'Не е посочен'}

МАТЕРИАЛ (първите 2000 символа):
${material.slice(0, 2000)}

Дай максимум 3-4 точки:
1. На какво да фокусирам вниманието си (ключови концепции)
2. Една конкретна техника за запомняне (подходяща за ТОЗИ материал)
3. Възможни връзки с други теми (ако има)

ВАЖНО:
- Бъди КРАТЪК (макс 150 думи)
- НЕ обяснявай материала
- НЕ давай дефиниции
- Само СТРАТЕГИЯ за учене
- На български`
        }
      ]
    });

    const strategy = response.content[0].type === 'text' ? response.content[0].text : '';

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error('Encoding coach error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Грешка при генериране' },
      { status: 500 }
    );
  }
}
