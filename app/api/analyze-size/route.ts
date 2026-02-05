import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// See CLAUDE_MODELS.md for correct model IDs

const isDev = process.env.NODE_ENV === 'development';

export async function POST(request: NextRequest) {

  try {
    const { material, topicName, apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 400 });
    }

    if (!material || material.trim().length < 50) {
      return NextResponse.json({ error: 'Материалът е твърде кратък за анализ' }, { status: 400 });
    }

    if (isDev) console.log('[ANALYZE-SIZE] Topic:', topicName, 'Material length:', material.length);

    const anthropic = new Anthropic({ apiKey });

    // Smart sampling for long materials
    let materialSample: string;
    const totalLength = material.length;

    if (totalLength <= 6000) {
      // Short material - use all of it
      materialSample = material;
    } else {
      // Long material - take samples from beginning, middle, and end
      const sampleSize = 2000;
      const beginning = material.slice(0, sampleSize);
      const middleStart = Math.floor(totalLength / 2) - sampleSize / 2;
      const middle = material.slice(middleStart, middleStart + sampleSize);
      const end = material.slice(-sampleSize);

      materialSample = `[НАЧАЛО - първите ${sampleSize} символа]\n${beginning}\n\n[СРЕДАТА]\n${middle}\n\n[КРАЙ - последните ${sampleSize} символа]\n${end}`;
    }

    // Use Haiku for this simple classification task - fast and cheap
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Класифицирай размера на следния учебен материал по тема "${topicName || 'Неизвестна'}".

ОБЩА ДЪЛЖИНА: ${totalLength} символа (~${Math.round(totalLength / 5)} думи)

МАТЕРИАЛ:
${materialSample}

КЛАСИФИКАЦИЯ:
- "small": Кратки факти, 1-2 концепции, научава се за 15-20 минути
- "medium": Средно количество, няколко концепции, 30-45 минути
- "large": Обширен материал, много концепции, 60+ минути

ОТГОВОРИ САМО С ЕДНА ДУМА: small, medium, или large`
      }]
    });

    const textContent = message.content.find(block => block.type === 'text');
    const responseText = textContent?.text?.toLowerCase().trim() || '';

    // Extract size from response
    let size: 'small' | 'medium' | 'large' | null = null;
    if (responseText.includes('small')) size = 'small';
    else if (responseText.includes('medium')) size = 'medium';
    else if (responseText.includes('large')) size = 'large';

    if (!size) {
      console.error('[ANALYZE-SIZE] Could not determine size from:', responseText);
      return NextResponse.json({ error: 'Не успях да определя размера' }, { status: 500 });
    }

    // Haiku pricing: $0.80/1M input, $4/1M output
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const cost = (inputTokens * 0.0008 + outputTokens * 0.004) / 1000;

    if (isDev) console.log('[ANALYZE-SIZE] Size:', size, 'Tokens:', inputTokens + outputTokens);

    return NextResponse.json({
      size,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    console.error('[ANALYZE-SIZE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Грешка при анализ на размера' }, { status: 500 });
  }
}
