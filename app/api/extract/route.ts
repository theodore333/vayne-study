import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const maxDuration = 60; // Allow up to 60 seconds for large PDFs

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
      text: `Extract ALL topics from this "${subjectName}" document.

TASK: Create a numbered list of EVERY topic/chapter/section in this document.

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE document from first page to last page
2. Extract EVERY single topic - do NOT skip any
3. If there are 65 topics, list all 65. If there are 100, list all 100.
4. Continue until you reach the very last topic

OUTPUT FORMAT - Return ONLY this JSON array, nothing else:
[{"number": 1, "name": "First topic name"}, {"number": 2, "name": "Second topic name"}, ...]

RULES:
- NO markdown code blocks
- NO explanatory text before or after
- JUST the raw JSON array
- Include subtopics as "1.1", "1.2" etc if present
- Do NOT truncate - list EVERY topic to the end`
    });

    // Use streaming to capture full response
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16384,
      messages: [{ role: 'user', content }],
      stream: true
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
      }
      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }

    if (!fullText) {
      return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
    }

    let responseText = fullText.trim();

    // Clean up the response - remove markdown code blocks if present
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    responseText = responseText.trim();

    // Parse the JSON response
    let topics;
    try {
      // Find the JSON array in the response
      const startIdx = responseText.indexOf('[');
      const endIdx = responseText.lastIndexOf(']');

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        topics = JSON.parse(responseText.substring(startIdx, endIdx + 1));
      } else {
        topics = JSON.parse(responseText);
      }

      // Validate that topics is an array
      if (!Array.isArray(topics)) {
        throw new Error('Response is not an array');
      }

      // Validate and clean topic objects
      topics = topics.map((t: { number?: number | string; name?: string }, i: number) => ({
        number: t.number ?? i + 1,
        name: String(t.name || `Topic ${i + 1}`).trim()
      }));

    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText.substring(0, 1000));
      console.error('Parse error:', parseError);

      // Try to salvage partial response
      const partialMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*,?/);
      if (partialMatch) {
        try {
          // Try to fix truncated JSON by closing the array
          let fixedJson = partialMatch[0];
          // Remove trailing comma if present
          fixedJson = fixedJson.replace(/,\s*$/, '');
          // Close the array
          if (!fixedJson.endsWith(']')) {
            fixedJson += ']';
          }
          topics = JSON.parse(fixedJson);
          console.log('Salvaged', topics.length, 'topics from partial response');
        } catch {
          return NextResponse.json({
            error: 'Claude не успя да извлече теми. Опитай с по-ясна снимка или PDF.',
            raw: responseText.substring(0, 500)
          }, { status: 500 });
        }
      } else {
        return NextResponse.json({
          error: 'Claude не успя да извлече теми. Опитай с по-ясна снимка или PDF.',
          raw: responseText.substring(0, 500)
        }, { status: 500 });
      }
    }

    // Calculate approximate cost (Sonnet 4.5 pricing: $3/1M input, $15/1M output)
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return NextResponse.json({
      topics,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    console.error('Extract error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Better error messages
    if (message.includes('Could not process image')) {
      return NextResponse.json({ error: 'Не мога да прочета изображението. Опитай с друг формат или по-ясна снимка.' }, { status: 400 });
    }
    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ. Провери настройките.' }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
