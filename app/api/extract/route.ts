import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const apiKey = formData.get('apiKey') as string;
    const subjectName = formData.get('subjectName') as string;

    if (!file || !apiKey) {
      return NextResponse.json({ error: 'Missing file or API key' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    const fileBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(fileBuffer).toString('base64');

    // Determine media type
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf' = 'image/jpeg';
    if (file.type === 'image/png') mediaType = 'image/png';
    else if (file.type === 'image/gif') mediaType = 'image/gif';
    else if (file.type === 'image/webp') mediaType = 'image/webp';
    else if (file.type === 'application/pdf') mediaType = 'application/pdf';

    const isPDF = file.type === 'application/pdf';

    // Build the message content
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    if (isPDF) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64
        }
      });
    } else {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: base64
        }
      });
    }

    content.push({
      type: 'text',
      text: `Това е конспект/учебен материал по "${subjectName}".

Моля, извлечи ВСИЧКИ теми от документа. За всяка тема дай:
1. Номер на темата (ако има)
2. Име/заглавие на темата

Върни резултата САМО като JSON масив в следния формат (без никакъв друг текст):
[
  {"number": 1, "name": "Име на първата тема"},
  {"number": 2, "name": "Име на втората тема"}
]

Ако има подтеми, включи ги като отделни теми с номерация като "1.1", "1.2" и т.н.
Ако няма ясна номерация, използвай последователни числа.
ВАЖНО: Върни САМО JSON масива, без markdown форматиране или друг текст.`
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content }]
    });

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
    }

    // Parse the JSON response
    let topics;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        topics = JSON.parse(jsonMatch[0]);
      } else {
        topics = JSON.parse(textContent.text);
      }
    } catch {
      console.error('Failed to parse Claude response:', textContent.text);
      return NextResponse.json({
        error: 'Failed to parse topics',
        raw: textContent.text
      }, { status: 500 });
    }

    // Calculate approximate cost (Claude Sonnet pricing)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return NextResponse.json({
      topics,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 10000) / 10000
      }
    });

  } catch (error: unknown) {
    console.error('Extract error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
