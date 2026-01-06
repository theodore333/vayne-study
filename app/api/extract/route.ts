import Anthropic from '@anthropic-ai/sdk';

// Railway: No edge runtime needed, Node.js supports longer timeouts

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const apiKey = formData.get('apiKey') as string;
    const subjectName = formData.get('subjectName') as string;

    if (!file || !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing file or API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic({ apiKey });

    const fileBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(fileBuffer).toString('base64');

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
      let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
      if (file.type === 'image/png') mediaType = 'image/png';
      else if (file.type === 'image/gif') mediaType = 'image/gif';
      else if (file.type === 'image/webp') mediaType = 'image/webp';

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
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

    // Streaming with full logging
    console.log('[EXTRACT] Starting Claude API call...');
    console.log('[EXTRACT] File type:', file.type);
    console.log('[EXTRACT] File size:', Math.round(base64.length / 1024), 'KB (base64)');

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Claude Sonnet 4
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

    // === FULL RAW RESPONSE LOG ===
    console.log('[EXTRACT] ========== FULL RAW RESPONSE ==========');
    console.log(fullText);
    console.log('[EXTRACT] ========== END RAW RESPONSE ==========');
    console.log('[EXTRACT] Tokens - Input:', inputTokens, 'Output:', outputTokens);

    if (!fullText) {
      console.error('[EXTRACT] ERROR: Empty response from Claude');
      return new Response(JSON.stringify({
        error: 'No response from Claude',
        debug: { inputTokens, outputTokens }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let responseText = fullText.trim();

    // Check if Claude returned an error message
    if (responseText.toLowerCase().startsWith('an error') ||
        responseText.toLowerCase().startsWith('i cannot') ||
        responseText.toLowerCase().startsWith('i\'m sorry') ||
        responseText.toLowerCase().startsWith('sorry')) {
      return new Response(JSON.stringify({
        error: 'Claude не може да обработи файла',
        raw: responseText
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Parse the JSON response
    let topics;
    try {
      const startIdx = responseText.indexOf('[');
      const endIdx = responseText.lastIndexOf(']');

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        topics = JSON.parse(responseText.substring(startIdx, endIdx + 1));
      } else {
        topics = JSON.parse(responseText);
      }

      if (!Array.isArray(topics)) {
        throw new Error('Response is not an array');
      }

      topics = topics.map((t: { number?: number | string; name?: string }, i: number) => ({
        number: t.number ?? i + 1,
        name: String(t.name || `Topic ${i + 1}`).trim()
      }));

    } catch (parseError) {
      // Check if Claude returned text instead of JSON
      if (!responseText.includes('[')) {
        return new Response(JSON.stringify({
          error: `Claude отговори с текст: "${responseText.substring(0, 200)}..."`,
          raw: responseText.substring(0, 1000)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Try to salvage partial JSON
      const partialMatch = responseText.match(/\[\s*\{[\s\S]*\}/);
      if (partialMatch) {
        try {
          let fixedJson = partialMatch[0].replace(/,\s*$/, '') + ']';
          topics = JSON.parse(fixedJson);
        } catch {
          return new Response(JSON.stringify({
            error: 'JSON parsing failed',
            raw: responseText.substring(0, 1000)
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        return new Response(JSON.stringify({
          error: 'No JSON found in response',
          raw: responseText.substring(0, 1000)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return new Response(JSON.stringify({
      topics,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Extract error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Could not process image')) {
      return new Response(JSON.stringify({ error: 'Не мога да прочета файла. Опитай с друг формат.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (message.includes('invalid_api_key')) {
      return new Response(JSON.stringify({ error: 'Невалиден API ключ.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
