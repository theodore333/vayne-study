import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';

const isDev = process.env.NODE_ENV === 'development';

// Railway: No edge runtime needed, Node.js supports longer timeouts

interface PDFAnalysis {
  isScanned: boolean;
  textLength: number;
  pageCount: number;
}

async function analyzePDF(buffer: Buffer): Promise<PDFAnalysis> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
    const doc = await parser.load();
    const textResult = await parser.getText();
    const textLength = (textResult.text as string).replace(/\s+/g, ' ').trim().length;
    const pageCount = doc.numPages as number;
    await parser.destroy();
    const charsPerPage = textLength / Math.max(pageCount, 1);
    const isScanned = charsPerPage < 100;
    return { isScanned, textLength, pageCount };
  } catch {
    return { isScanned: true, textLength: 0, pageCount: 1 };
  }
}

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
    const buffer = Buffer.from(fileBuffer);
    const base64 = buffer.toString('base64');

    const isPDF = file.type === 'application/pdf';

    // Analyze PDF type
    let pdfAnalysis: PDFAnalysis | null = null;
    if (isPDF) {
      pdfAnalysis = await analyzePDF(buffer);
      if (isDev) console.log('[EXTRACT] PDF Analysis:', pdfAnalysis);
    }

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

    // Add extra instructions for scanned PDFs
    const scannedNote = pdfAnalysis?.isScanned
      ? `\n\nNOTE: This is a SCANNED document (image-based). Read each page carefully as an image. If some text is unclear, use context to determine the correct words.`
      : '';

    content.push({
      type: 'text',
      text: `Extract ALL topics from this "${subjectName}" document.${scannedNote}

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
    if (isDev) {
      console.log('[EXTRACT] Starting Claude API call...');
      console.log('[EXTRACT] File type:', file.type);
      console.log('[EXTRACT] File size:', Math.round(base64.length / 1024), 'KB (base64)');
    }

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5
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

    if (isDev) {
      console.log('[EXTRACT] Response length:', fullText.length, 'Tokens:', inputTokens, '+', outputTokens);
    }

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

      // Try to salvage partial JSON - find all complete objects
      if (isDev) console.log('[EXTRACT] Attempting to salvage partial JSON...');

      // Find the opening bracket
      const startIdx = responseText.indexOf('[');
      if (startIdx === -1) {
        return new Response(JSON.stringify({
          error: 'No JSON array found',
          raw: responseText.substring(0, 1000)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Extract all complete {"number": X, "name": "Y"} objects
      const objectRegex = /\{\s*"number"\s*:\s*(?:"[^"]*"|\d+(?:\.\d+)?)\s*,\s*"name"\s*:\s*"[^"]*"\s*\}/g;
      const matches = responseText.match(objectRegex);

      if (matches && matches.length > 0) {
        try {
          const fixedJson = '[' + matches.join(',') + ']';
          topics = JSON.parse(fixedJson);
          if (isDev) console.log('[EXTRACT] Salvaged', topics.length, 'topics from partial response');
        } catch {
          return new Response(JSON.stringify({
            error: 'JSON parsing failed after salvage attempt',
            raw: responseText.substring(0, 1000)
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        return new Response(JSON.stringify({
          error: 'No complete JSON objects found',
          raw: responseText.substring(0, 1000)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000000;

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

    return new Response(JSON.stringify({ error: 'Грешка при извличане на теми. Опитай отново.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
