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

      const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      const base64Data = match[2];

      // Check if it's an image
      if (mediaType.startsWith('image/')) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data
          }
        });
      }
      // For PDFs, we'd need different handling - for now, just note it
      // PDF support would require pdf-parse or similar
    }

    // Add the extraction prompt
    content.push({
      type: 'text',
      text: `Извлечи списък с теми от ${files.length > 1 ? 'тези снимки на конспект' : 'тази снимка на конспект'}${subjectName ? ` по ${subjectName}` : ''}.

МНОГО ВАЖНО:
- Извлечи ВСИЧКИ теми които виждаш
- Запази ОРИГИНАЛНАТА номерация точно както е в документа
- Ако има секции/раздели (напр. "Практичен изпит", "Теоритичен изпит"), ЗАДЪЛЖИТЕЛНО ги маркирай с ##
- За всяка секция, запази оригиналната номерация (ако теоритичният започва от 1, запази го като 1)
- Не пропускай нищо
- Не добавяй теми които не виждаш

Формат:
## ПРАКТИЧЕН ИЗПИТ
1. Тема 1
2. Тема 2
...
40. Тема 40

## ТЕОРИТИЧЕН ИЗПИТ
1. Тема 1 (номерацията започва отново от 1!)
2. Тема 2
...

Върни САМО списъка с теми със секциите, без допълнителни обяснения.`
    });

    const message = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    });

    const extractedText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    return NextResponse.json({
      text: extractedText,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens
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
