import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { files, apiKey, subjectName } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    // Build content array with all images/files
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    for (const file of files) {
      // file is base64 data URL
      const match = file.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) continue;

      const mediaType = match[1];
      const base64Data = match[2];

      if (mediaType === 'application/pdf') {
        // Claude API supports PDF natively via document type
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf' as const,
            data: base64Data
          }
        } as any);
      } else if (mediaType.startsWith('image/')) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64Data
          }
        });
      }
    }

    // Add the extraction prompt
    content.push({
      type: 'text',
      text: `Ти си OCR система. Твоята единствена задача е да ТРАНСКРИБИРАШ текста от ${files.length > 1 ? 'тези документи' : 'този документ'}.

КРИТИЧНО ВАЖНИ ПРАВИЛА:
1. САМО ТРАНСКРИБИРАЙ - копирай ДОСЛОВНО текста който виждаш
2. НЕ ИЗМИСЛЯЙ нищо - ако не можеш да прочетеш дума, напиши [нечетливо]
3. НЕ ДОБАВЯЙ теми от собствени познания - само това което е НАПИСАНО в изображението
4. НЕ ДОПЪЛВАЙ непълни теми - остави ги както са
5. Ако документът е размазан или нечетлив, кажи "Документът е нечетлив"

Ако има секции (напр. "Практичен изпит", "Теоритичен изпит"), маркирай ги с ##

Формат:
## СЕКЦИЯ (ако има)
1. [Точният текст както е написан]
2. [Точният текст както е написан]
...

${subjectName ? `Предметът е: ${subjectName}` : ''}

ПОМНИ: По-добре да пропуснеш тема която не виждаш ясно, отколкото да измислиш такава!

Върни САМО транскрипцията, без обяснения.`
    });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    });

    const extractedText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Haiku pricing: $0.80/1M input, $4/1M output
    const cost = (message.usage.input_tokens * 0.8 + message.usage.output_tokens * 4) / 1000000;

    return NextResponse.json({
      text: extractedText,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    });

  } catch (error) {
    console.error('Extract syllabus error:', error);

    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to extract syllabus' },
      { status: 500 }
    );
  }
}
