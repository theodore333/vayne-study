import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';

// See CLAUDE_MODELS.md for correct model IDs

// Repair truncated JSON by extracting complete question objects
function repairTruncatedJSON(text: string): { questions: any[]; cases: any[] } | null {
  try {
    // Find all complete question objects using regex
    const questionRegex = /\{\s*"type"\s*:\s*"(mcq|open|case_study)"\s*,\s*"text"\s*:\s*"([^"\\]|\\.)*"\s*,\s*"options"\s*:\s*(?:\[(?:[^\[\]]*|\[(?:[^\[\]]*|\[[^\[\]]*\])*\])*\]|null)\s*,\s*"correctAnswer"\s*:\s*"([^"\\]|\\.)*"\s*,\s*"explanation"\s*:\s*(?:"([^"\\]|\\.)*"|null)\s*,\s*"linkedTopicIndex"\s*:\s*(?:\d+|null)\s*,\s*"caseId"\s*:\s*(?:"[^"]*"|null)\s*\}/g;

    const questions: any[] = [];
    let match;

    while ((match = questionRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        questions.push(parsed);
      } catch {
        // Skip malformed questions
      }
    }

    // Also try simpler extraction if regex fails
    if (questions.length === 0) {
      // Find the questions array start
      const questionsStart = text.indexOf('"questions"');
      if (questionsStart !== -1) {
        const arrayStart = text.indexOf('[', questionsStart);
        if (arrayStart !== -1) {
          // Extract individual objects by finding balanced braces
          let depth = 0;
          let objStart = -1;

          for (let i = arrayStart; i < text.length; i++) {
            if (text[i] === '{') {
              if (depth === 0) objStart = i;
              depth++;
            } else if (text[i] === '}') {
              depth--;
              if (depth === 0 && objStart !== -1) {
                try {
                  const obj = JSON.parse(text.substring(objStart, i + 1));
                  if (obj.type && obj.text) {
                    questions.push(obj);
                  }
                } catch {
                  // Skip malformed
                }
                objStart = -1;
              }
            }
          }
        }
      }
    }

    // Extract cases if present
    const cases: any[] = [];
    const casesMatch = text.match(/"cases"\s*:\s*\[([\s\S]*?)\]/);
    if (casesMatch) {
      try {
        const casesArray = JSON.parse('[' + casesMatch[1] + ']');
        cases.push(...casesArray);
      } catch {
        // Cases parsing failed, continue without
      }
    }

    if (questions.length > 0) {
      console.log(`[EXTRACT-Q] Repaired truncated JSON: extracted ${questions.length} complete questions`);
      return { questions, cases };
    }

    return null;
  } catch (e) {
    console.error('[EXTRACT-Q] JSON repair failed:', e);
    return null;
  }
}

interface PDFAnalysis {
  isScanned: boolean;
  textLength: number;
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
  textByPage?: string[]; // Text content per page (for chunking)
}

const PAGES_PER_CHUNK = 12; // Process 12 pages at a time

async function analyzePDF(buffer: Buffer, extractPageText = false): Promise<PDFAnalysis> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
    const doc = await parser.load();
    const textResult = await parser.getText();
    const fullText = textResult.text as string;
    const textLength = fullText.replace(/\s+/g, ' ').trim().length;
    const pageCount = doc.numPages as number;

    // Extract text per page if requested (for chunking)
    let textByPage: string[] | undefined;
    if (extractPageText && pageCount > 1) {
      textByPage = [];
      for (let i = 1; i <= pageCount; i++) {
        try {
          const pageText = await parser.getPageText({ pageNumber: i });
          textByPage.push(pageText.text || '');
        } catch {
          textByPage.push('');
        }
      }
    }

    await parser.destroy();

    // Heuristic: scanned PDFs have very little extractable text
    const charsPerPage = textLength / Math.max(pageCount, 1);
    const isScanned = charsPerPage < 100;

    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (charsPerPage >= 50 && charsPerPage < 200) {
      confidence = 'medium';
    } else if (charsPerPage < 50) {
      confidence = 'high';
    } else if (charsPerPage > 500) {
      confidence = 'high';
    }

    return { isScanned, textLength, pageCount, confidence, textByPage };
  } catch {
    return { isScanned: true, textLength: 0, pageCount: 1, confidence: 'low' };
  }
}

// Process a single chunk of text and extract questions
async function extractQuestionsFromText(
  anthropic: Anthropic,
  text: string,
  subjectName: string,
  topics: string[],
  chunkInfo: string
): Promise<{ questions: any[]; cases: any[]; inputTokens: number; outputTokens: number }> {
  const topicListForPrompt = topics.length > 0
    ? `\n\nТЕМИ ЗА СВЪРЗВАНЕ:\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';

  const prompt = `Извлечи ВСИЧКИ въпроси от този текст (${chunkInfo}) по "${subjectName}".

ТЕКСТ:
${text}

ТИПОВЕ ВЪПРОСИ:
1. "mcq" - Multiple choice (A/Б/В/Г или A/B/C/D)
2. "open" - Отворен въпрос
3. "case_study" - Клиничен казус

АВТОМАТИЧНО РАЗПОЗНАВАНЕ НА ФОРМАТ за MCQ:
ФОРМАТ А - Стандартен: Въпрос + директни буквени отговори → "text"=въпрос, "options"=отговори
ФОРМАТ Б - Твърдения: Въпрос + номерирани твърдения (1. 2. 3.) + буквени комбинации (А.1,2,3 Б.Всички) → "text"=въпрос+твърдения, "options"=само буквените комбинации

Разпознай кой формат е ВСЕКИ въпрос!
${topicListForPrompt}

ФОРМАТ - Върни САМО JSON:
{"questions": [{"type": "mcq", "text": "...", "options": ["А. ...", "Б. ..."], "correctAnswer": "А", "explanation": null, "linkedTopicIndex": null, "caseId": null}], "cases": []}

ПРАВИЛА:
- linkedTopicIndex е 1-based индекс или null
- Върни САМО валиден JSON`;

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
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

  // Parse response
  let result: { questions: any[]; cases: any[] } = { questions: [], cases: [] };
  try {
    const cleaned = fullText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      result = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
    }
  } catch {
    const repaired = repairTruncatedJSON(fullText);
    if (repaired) result = repaired;
  }

  return { ...result, inputTokens, outputTokens };
}

export async function POST(request: Request) {
  console.log('[EXTRACT-Q] === REQUEST STARTED ===');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const apiKey = formData.get('apiKey') as string;
    const subjectName = formData.get('subjectName') as string;
    const topicNames = formData.get('topicNames') as string;

    console.log('[EXTRACT-Q] File:', file?.name, 'Size:', file?.size, 'Type:', file?.type);

    if (!file || !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing file or API key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[EXTRACT-Q] Creating Anthropic client...');
    const anthropic = new Anthropic({ apiKey });

    console.log('[EXTRACT-Q] Reading file buffer...');
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);
    const base64 = buffer.toString('base64');
    console.log('[EXTRACT-Q] Base64 size:', Math.round(base64.length / 1024), 'KB');

    const isPDF = file.type === 'application/pdf';

    // Parse topic names
    let topics: string[] = [];
    try {
      topics = JSON.parse(topicNames || '[]');
    } catch {
      topics = [];
    }

    // Analyze PDF - check if we should use chunking
    let pdfAnalysis: PDFAnalysis | null = null;
    const shouldChunk = isPDF;

    if (isPDF) {
      console.log('[EXTRACT-Q] Analyzing PDF...');
      try {
        // For large text-based PDFs, extract page text for chunking
        pdfAnalysis = await analyzePDF(buffer, shouldChunk);
      } catch (pdfError) {
        console.error('[EXTRACT-Q] PDF Analysis FAILED:', pdfError);
        // Continue without analysis - will use standard extraction
        pdfAnalysis = { isScanned: true, textLength: 0, pageCount: 1, confidence: 'low' };
      }
      console.log('[EXTRACT-Q] PDF Analysis:', {
        isScanned: pdfAnalysis.isScanned,
        pageCount: pdfAnalysis.pageCount,
        textLength: pdfAnalysis.textLength,
        hasPageText: !!pdfAnalysis.textByPage
      });

      // Use chunking for text-based PDFs with more than PAGES_PER_CHUNK pages
      if (!pdfAnalysis.isScanned && pdfAnalysis.pageCount > PAGES_PER_CHUNK && pdfAnalysis.textByPage) {
        console.log(`[EXTRACT-Q] Using CHUNKED extraction for ${pdfAnalysis.pageCount} pages`);

        const allQuestions: any[] = [];
        const allCases: any[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const numChunks = Math.ceil(pdfAnalysis.pageCount / PAGES_PER_CHUNK);

        for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
          const startPage = chunkIdx * PAGES_PER_CHUNK;
          const endPage = Math.min(startPage + PAGES_PER_CHUNK, pdfAnalysis.pageCount);
          const chunkText = pdfAnalysis.textByPage.slice(startPage, endPage).join('\n\n--- СТРАНИЦА ---\n\n');

          console.log(`[EXTRACT-Q] Processing chunk ${chunkIdx + 1}/${numChunks} (pages ${startPage + 1}-${endPage})`);

          const chunkResult = await extractQuestionsFromText(
            anthropic,
            chunkText,
            subjectName,
            topics,
            `страници ${startPage + 1}-${endPage} от ${pdfAnalysis.pageCount}`
          );

          allQuestions.push(...(chunkResult.questions || []));
          allCases.push(...(chunkResult.cases || []));
          totalInputTokens += chunkResult.inputTokens;
          totalOutputTokens += chunkResult.outputTokens;

          console.log(`[EXTRACT-Q] Chunk ${chunkIdx + 1} extracted ${chunkResult.questions?.length || 0} questions`);
        }

        // Transform and return chunked results
        const questions = allQuestions.map((q: any) => ({
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

        const cost = (totalInputTokens * 0.003 + totalOutputTokens * 0.015) / 1000;

        console.log(`[EXTRACT-Q] CHUNKED extraction complete: ${questions.length} total questions from ${numChunks} chunks`);

        return new Response(JSON.stringify({
          questions,
          cases: allCases,
          pdfAnalysis: {
            isScanned: pdfAnalysis.isScanned,
            pageCount: pdfAnalysis.pageCount,
            confidence: pdfAnalysis.confidence
          },
          wasChunked: true,
          numChunks,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cost: Math.round(cost * 1000000) / 1000000
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Standard extraction (for scanned PDFs, images, or small text PDFs)
    console.log('[EXTRACT-Q] Using STANDARD extraction');

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

    const topicListForPrompt = topics.length > 0
      ? `\n\nТЕМИ ЗА СВЪРЗВАНЕ (избери най-подходящата за всеки въпрос):\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : '';

    const scannedPdfNote = pdfAnalysis?.isScanned
      ? `\n\nВАЖНО: Този документ е СКАНИРАН (изображение). Прочети внимателно всеки текст от изображението.`
      : '';

    content.push({
      type: 'text',
      text: `Извлечи ВСИЧКИ въпроси от този сборник по "${subjectName}".${scannedPdfNote}

ТИПОВЕ ВЪПРОСИ:
1. "mcq" - Multiple choice (A/Б/В/Г/Д)
2. "open" - Отворен въпрос (напиши отговор)
3. "case_study" - Клиничен казус (описание на пациент + въпроси)

АВТОМАТИЧНО РАЗПОЗНАВАНЕ НА ФОРМАТ:
Документът може да съдържа РАЗЛИЧНИ формати въпроси. Разпознай формата за ВСЕКИ въпрос:

ФОРМАТ А - Стандартен MCQ:
- Въпрос с директни буквени отговори (А/Б/В/Г или A/B/C/D)
- "text" = само въпросът
- "options" = буквените отговори с текст

ФОРМАТ Б - Твърдения + Комбинации (често в български мед. тестове):
- Въпрос + Номерирани твърдения (1. 2. 3. 4. 5.)
- Буквени отговори са КОМБИНАЦИИ от числата (А. 1,2,3 / Б. 1,2,4 / В. Всички / Г. Никои)
- "text" = въпросът + ВСИЧКИ твърдения (1. 2. 3. ...)
- "options" = САМО буквените комбинации (А. Б. В. Г.)

ПРИМЕР - ФОРМАТ А (стандартен):
ДОКУМЕНТ: "Коя е столицата на България? А. Варна Б. Пловдив В. София Г. Бургас"
РЕЗУЛТАТ: {"text": "Коя е столицата на България?", "options": ["А. Варна", "Б. Пловдив", "В. София", "Г. Бургас"], "correctAnswer": "В"}

ПРИМЕР - ФОРМАТ Б (твърдения):
ДОКУМЕНТ: "Кои са верни за таласемия? 1.Ежемесечни трансфузии 2.Хелатираща терапия 3.Генна терапия 4.Спленектомия. А.1,2,3 Б.1,2,4 В.1,3,4 Г.Всички"
РЕЗУЛТАТ: {"text": "Кои са верни за таласемия?\n1. Ежемесечни трансфузии\n2. Хелатираща терапия\n3. Генна терапия\n4. Спленектомия", "options": ["А. Само 1, 2 и 3", "Б. Само 1, 2 и 4", "В. Само 1, 3 и 4", "Г. Всички"], "correctAnswer": "Г"}

КАК ДА РАЗПОЗНАЕШ ФОРМАТА:
- Ако отговорите (А. Б. В.) съдържат комбинации от числа (1,2,3 / само 2 и 4 / всички) → ФОРМАТ Б
- Ако отговорите са директен текст → ФОРМАТ А
- Прилагай ПРАВИЛНИЯ формат за ВСЕКИ въпрос поотделно!

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
      "text": "Текст на въпроса (включително твърдения ако има)",
      "options": ["А. Опция 1", "Б. Опция 2", "В. Опция 3", "Г. Опция 4"],
      "correctAnswer": "Б",
      "explanation": "Обяснение защо Б е вярно (ако има)",
      "linkedTopicIndex": 5,
      "caseId": null
    },
    {
      "type": "case_study",
      "text": "Въпрос към казуса",
      "options": ["А. Опция 1", "Б. Опция 2"],
      "correctAnswer": "А",
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
- Разпознай формата на ВСЕКИ въпрос поотделно (Формат А или Б)
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
    let wasRepaired = false;
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
      console.error('[EXTRACT-Q] JSON parse error, attempting repair:', parseError);

      // Try to repair truncated JSON
      const repaired = repairTruncatedJSON(responseText);

      if (repaired && repaired.questions.length > 0) {
        result = repaired;
        wasRepaired = true;
        console.log(`[EXTRACT-Q] Successfully repaired: ${result.questions.length} questions recovered`);
      } else {
        // Return partial result with warning
        return new Response(JSON.stringify({
          error: 'JSON отрязан - извлечени са частични данни',
          raw: responseText.substring(0, 2000),
          hint: 'PDF-ът може да съдържа твърде много въпроси. Опитай с по-малък файл.'
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
      pdfAnalysis: pdfAnalysis ? {
        isScanned: pdfAnalysis.isScanned,
        pageCount: pdfAnalysis.pageCount,
        confidence: pdfAnalysis.confidence
      } : null,
      wasRepaired, // True if JSON was truncated and repaired
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
