import Anthropic from '@anthropic-ai/sdk';

// See CLAUDE_MODELS.md for correct model IDs

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const apiKey = formData.get('apiKey') as string;
    const subjectName = formData.get('subjectName') as string;
    const topicNames = formData.get('topicNames') as string; // JSON array of topic names

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

    // Parse topic names for auto-linking
    let topics: string[] = [];
    try {
      topics = JSON.parse(topicNames || '[]');
    } catch {
      topics = [];
    }

    const topicListForPrompt = topics.length > 0
      ? `\n\nТЕМИ ЗА СВЪРЗВАНЕ (избери най-подходящата за всеки въпрос):\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : '';

    content.push({
      type: 'text',
      text: `Извлечи ВСИЧКИ въпроси от този сборник по "${subjectName}".

ТИПОВЕ ВЪПРОСИ:
1. "mcq" - Multiple choice (A/B/C/D/E)
2. "open" - Отворен въпрос (напиши отговор)
3. "case_study" - Клиничен казус (описание на пациент + въпроси)

ИНСТРУКЦИИ:
- Извлечи ВСЕКИ въпрос от документа
- За MCQ: включи всички опции и верния отговор
- За казуси: групирай въпросите под описанието на случая
- Ако има обяснение/rationale - включи го
${topicListForPrompt}

ФОРМАТ - Върни САМО този JSON, без markdown:
{
  "questions": [
    {
      "type": "mcq",
      "text": "Текст на въпроса",
      "options": ["A. Опция 1", "B. Опция 2", "C. Опция 3", "D. Опция 4"],
      "correctAnswer": "B",
      "explanation": "Обяснение защо B е вярно (ако има)",
      "linkedTopicIndex": 5,
      "caseId": null
    },
    {
      "type": "case_study",
      "text": "Въпрос към казуса",
      "options": ["A. Опция 1", "B. Опция 2"],
      "correctAnswer": "A",
      "explanation": "",
      "linkedTopicIndex": 3,
      "caseId": "case_1"
    },
    {
      "type": "open",
      "text": "Опишете патогенезата на...",
      "options": null,
      "correctAnswer": "Очакван отговор или ключови точки",
      "explanation": "",
      "linkedTopicIndex": 7,
      "caseId": null
    }
  ],
  "cases": [
    {
      "id": "case_1",
      "description": "65-годишен мъж с болка в гърдите..."
    }
  ]
}

ПРАВИЛА:
- linkedTopicIndex е индексът от списъка с теми (1-based), или null ако не може да се определи
- caseId свързва въпрос към казус (null ако не е част от казус)
- Не пропускай въпроси!
- Върни САМО JSON, без \`\`\`json markers`
    });

    console.log('[EXTRACT-Q] Starting Claude API call...');
    console.log('[EXTRACT-Q] File type:', file.type);
    console.log('[EXTRACT-Q] File size:', Math.round(base64.length / 1024), 'KB (base64)');

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 - good for extraction
      max_tokens: 32000, // More tokens for large question banks
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

    console.log('[EXTRACT-Q] ========== FULL RAW RESPONSE ==========');
    console.log(fullText.substring(0, 2000) + (fullText.length > 2000 ? '...' : ''));
    console.log('[EXTRACT-Q] ========== END RAW RESPONSE ==========');
    console.log('[EXTRACT-Q] Tokens - Input:', inputTokens, 'Output:', outputTokens);

    if (!fullText) {
      console.error('[EXTRACT-Q] ERROR: Empty response from Claude');
      return new Response(JSON.stringify({
        error: 'No response from Claude',
        debug: { inputTokens, outputTokens }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let responseText = fullText.trim();
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Parse the JSON response
    let result;
    try {
      // Try to find JSON object
      const startIdx = responseText.indexOf('{');
      const endIdx = responseText.lastIndexOf('}');

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        result = JSON.parse(responseText.substring(startIdx, endIdx + 1));
      } else {
        result = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('[EXTRACT-Q] JSON parse error:', parseError);

      // Try to salvage partial response
      const questionsMatch = responseText.match(/"questions"\s*:\s*\[([\s\S]*?)\]/);
      const casesMatch = responseText.match(/"cases"\s*:\s*\[([\s\S]*?)\]/);

      if (questionsMatch) {
        try {
          // Extract individual question objects
          const questionRegex = /\{\s*"type"\s*:\s*"[^"]+"\s*,\s*"text"\s*:\s*"[^"]*"[\s\S]*?"linkedTopicIndex"\s*:\s*(?:\d+|null)\s*,\s*"caseId"\s*:\s*(?:"[^"]*"|null)\s*\}/g;
          const questionMatches = responseText.match(questionRegex);

          if (questionMatches && questionMatches.length > 0) {
            result = {
              questions: JSON.parse('[' + questionMatches.join(',') + ']'),
              cases: casesMatch ? JSON.parse('[' + casesMatch[1] + ']') : []
            };
            console.log('[EXTRACT-Q] Salvaged', result.questions.length, 'questions from partial response');
          } else {
            throw new Error('Could not extract questions');
          }
        } catch {
          return new Response(JSON.stringify({
            error: 'JSON parsing failed',
            raw: responseText.substring(0, 2000)
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        return new Response(JSON.stringify({
          error: 'No valid JSON found in response',
          raw: responseText.substring(0, 2000)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Transform questions to match our BankQuestion type
    const questions = (result.questions || []).map((q: any) => ({
      type: q.type || 'mcq',
      text: q.text || '',
      options: q.options || null,
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation || '',
      linkedTopicIds: q.linkedTopicIndex && topics[q.linkedTopicIndex - 1]
        ? [topics[q.linkedTopicIndex - 1]]
        : [],
      caseId: q.caseId || null,
      stats: { attempts: 0, correct: 0 }
    }));

    const cases = (result.cases || []).map((c: any) => ({
      id: c.id || '',
      description: c.description || '',
      questionIds: [] // Will be populated when adding to bank
    }));

    // Sonnet pricing: $3/1M input, $15/1M output
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return new Response(JSON.stringify({
      questions,
      cases,
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
    console.error('[EXTRACT-Q] Error:', error);
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
