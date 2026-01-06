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
      text: `Analyze this ENTIRE document for "${subjectName}".

CRITICAL: You MUST process ALL pages of this document from start to finish. Do not stop early.

Extract EVERY topic/chapter/section from the ENTIRE document. For each topic provide:
1. Number (if present, or sequential number)
2. Name/title of the topic

Return ONLY a valid JSON array in this exact format, no other text:
[{"number": 1, "name": "Topic name"}, {"number": 2, "name": "Another topic"}]

If there are subtopics, use notation like "1.1", "1.2".

IMPORTANT RULES:
- Process ALL pages, not just the first few
- Include EVERY topic/section you find
- Return ONLY the JSON array, no markdown, no code blocks, no explanation
- If the document has 50+ topics, include ALL of them`
    });

    // Use Haiku for extraction tasks with streaming for large documents
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 65536,
      messages: [{ role: 'user', content }],
      stream: true // Enable streaming for long requests
    });

    // Collect streamed response
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of response) {
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

    // Check if we got a response
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
      // Try to find the complete JSON array in the response (greedy match)
      // Find the first [ and the last ] to get the full array
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
      console.error('Failed to parse Claude response:', responseText);
      console.error('Parse error:', parseError);
      return NextResponse.json({
        error: 'Claude не успя да извлече теми. Опитай с по-ясна снимка или PDF.',
        raw: responseText.substring(0, 500)
      }, { status: 500 });
    }

    // Calculate approximate cost (Claude Haiku pricing)
    // Haiku: $0.25/1M input, $1.25/1M output
    const cost = (inputTokens * 0.00025 + outputTokens * 0.00125) / 1000;

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
