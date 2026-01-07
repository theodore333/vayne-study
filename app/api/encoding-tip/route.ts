import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, context, apiKey } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Липсва текст' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Липсва API ключ' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', // Use Haiku for fast, cheap responses
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Ти си експерт по техники за запомняне. Дай КРАТЪК и ПРАКТИЧЕН съвет как да запомня следния текст. Използвай една от тези техники:
- Мнемоника (акроним, рима, фраза)
- Визуална асоциация (ментална картина)
- Връзка с нещо познато
- Chunking (групиране на информация)
- Story method (кратка история)

ТЕКСТ ЗА ЗАПОМНЯНЕ:
"${text}"

${context ? `КОНТЕКСТ (тема): ${context}` : ''}

Отговори на български. Бъди кратък (2-3 изречения макс). Дай конкретен, приложим съвет.`
        }
      ]
    });

    const tip = response.content[0].type === 'text' ? response.content[0].text : '';

    return NextResponse.json({ tip });
  } catch (error) {
    console.error('Encoding tip error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Грешка при генериране' },
      { status: 500 }
    );
  }
}
