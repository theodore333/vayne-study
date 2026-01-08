import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: `Форматирай следния текст. ВАЖНО:
- НЕ променяй съдържанието - само подобри форматирането
- Раздели на логически параграфи
- Премахни странни line breaks от копиране
- Запази всички факти, числа, имена точно както са
- Ако има списъци, форматирай ги като bullet points
- Ако има заглавия/секции, маркирай ги с ## или ###
- Не добавяй нова информация
- Не съкращавай нищо

Текст за форматиране:
${text}

Върни САМО форматирания текст, без обяснения.`
        }
      ]
    });

    const formattedText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    return NextResponse.json({
      formattedText,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens
    });

  } catch (error) {
    console.error('Format text error:', error);

    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to format text' },
      { status: 500 }
    );
  }
}
