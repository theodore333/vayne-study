import Anthropic from '@anthropic-ai/sdk';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

const isDev = process.env.NODE_ENV === 'development';

// See CLAUDE_CONTEXT.md for correct model IDs

// Types for extracted questions
interface ExtractedQuestion {
  type: string;
  text: string;
  options?: string[] | null;
  correctAnswer: string;
  explanation?: string | null;
  linkedTopicIndex?: number | null;
  bloomLevel?: number | null;
  caseId?: string | null;
}

interface ExtractedCase {
  id: string;
  description: string;
  questionIds?: string[];
}

interface ExtractionResult {
  questions: ExtractedQuestion[];
  cases: ExtractedCase[];
}

// Repair truncated JSON by extracting complete question objects
function repairTruncatedJSON(text: string): ExtractionResult | null {
  try {
    const questions: ExtractedQuestion[] = [];
    const cases: ExtractedCase[] = [];

    // Method 1: Extract individual question objects by balanced braces
    const questionsStart = text.indexOf('"questions"');
    if (questionsStart !== -1) {
      const arrayStart = text.indexOf('[', questionsStart);
      if (arrayStart !== -1) {
        let depth = 0;
        let objStart = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = arrayStart; i < text.length; i++) {
          const char = text[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }

          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '{') {
            if (depth === 0) objStart = i;
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0 && objStart !== -1) {
              const objStr = text.substring(objStart, i + 1);
              try {
                const obj = JSON.parse(objStr);
                if (obj.type && obj.text) {
                  questions.push(obj);
                }
              } catch {
                // Try to fix common issues
                try {
                  // Replace newlines in strings
                  const fixed = objStr
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
                  const obj = JSON.parse(fixed);
                  if (obj.type && obj.text) {
                    questions.push(obj);
                  }
                } catch {
                  // Skip malformed
                  if (isDev) console.log(`[EXTRACT-Q] Skipped malformed object at position ${objStart}`);
                }
              }
              objStart = -1;
            }
          }
        }
      }
    }

    // Method 2: Extract cases if present
    const casesStart = text.indexOf('"cases"');
    if (casesStart !== -1) {
      const casesArrayStart = text.indexOf('[', casesStart);
      if (casesArrayStart !== -1) {
        let depth = 0;
        let objStart = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = casesArrayStart; i < text.length; i++) {
          const char = text[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }

          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '{') {
            if (depth === 0) objStart = i;
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0 && objStart !== -1) {
              try {
                const obj = JSON.parse(text.substring(objStart, i + 1));
                if (obj.id && obj.description) {
                  cases.push(obj);
                }
              } catch {
                // Skip malformed cases
              }
              objStart = -1;
            }
          } else if (char === ']' && depth === 0) {
            break; // End of cases array
          }
        }
      }
    }

    if (questions.length > 0) {
      if (isDev) console.log(`[EXTRACT-Q] Repaired truncated JSON: extracted ${questions.length} questions, ${cases.length} cases`);
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
): Promise<{ questions: ExtractedQuestion[]; cases: ExtractedCase[]; inputTokens: number; outputTokens: number }> {
  const topicListForPrompt = topics.length > 0
    ? `\n\nТЕМИ ЗА СВЪРЗВАНЕ:\n${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : '';

  const prompt = `Извлечи ВСИЧКИ въпроси от този текст (${chunkInfo}) по "${subjectName}".

ТЕКСТ:
${text}
${topicListForPrompt}

=== ТИПОВЕ ВЪПРОСИ ===

MCQ (type: "mcq") - въпрос с готови отговори:
ФОРМАТ А: Въпрос + буквени отговори → text=въпрос, options=отговори
ФОРМАТ Б: Твърдения (1.2.3.) + комбинации (А.1,2,3) → text=въпрос+твърдения, options=комбинации

ОТВОРЕН (type: "open") - въпрос без готови отговори:
- Въпроси като "Опишете...", "Какво е...", "Обяснете...", "Избройте...", "Дефинирайте..."
- correctAnswer = кратък модерен отговор (2-4 изречения)
- options = НЕ се попълва (null)

JSON: {"questions": [
  {"type": "mcq", "text": "...", "options": ["А...", "Б..."], "correctAnswer": "А", "explanation": "...", "linkedTopicIndex": null, "bloomLevel": 1},
  {"type": "open", "text": "...", "options": null, "correctAnswer": "Кратък отговор...", "explanation": null, "linkedTopicIndex": null, "bloomLevel": 4}
]}

bloomLevel = 1-6 по Bloom's taxonomy (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create).
ВАЖНО ЗА explanation: Напиши кратко (1-2 изречения) обяснение. Ако не знаеш със сигурност, напиши null.
linkedTopicIndex = 1-based или null. ПРОПУСКАЙ казуси (клинични случаи). Върни САМО JSON.`;

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 32000,
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
  let result: ExtractionResult = { questions: [], cases: [] };
  try {
    const cleaned = fullText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      result = JSON.parse(cleaned.substring(startIdx, endIdx + 1)) as ExtractionResult;
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
    const topicIdsRaw = formData.get('topicIds') as string;

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

    // Parse topic names and IDs
    let topics: string[] = [];
    let topicIds: string[] = [];
    try {
      topics = JSON.parse(topicNames || '[]');
      topicIds = JSON.parse(topicIdsRaw || '[]');
    } catch {
      topics = [];
      topicIds = [];
    }

    // Check for DOCX files
    const isDOCX = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                   file.type === 'application/msword' ||
                   file.name.endsWith('.docx') ||
                   file.name.endsWith('.doc');

    // Handle DOCX files - extract text first, then process with Claude
    if (isDOCX) {
      console.log('[EXTRACT-Q] Processing DOCX file...');
      console.log('[EXTRACT-Q] Buffer size:', buffer.length, 'bytes');
      try {
        // Use Node.js Buffer instead of ArrayBuffer for better compatibility
        const result = await mammoth.extractRawText({ buffer: buffer });
        const docxText = result.value;
        console.log('[EXTRACT-Q] DOCX text extracted, length:', docxText.length);
        if (result.messages && result.messages.length > 0) {
          console.log('[EXTRACT-Q] DOCX warnings:', result.messages);
        }

        if (!docxText || docxText.trim().length < 50) {
          return new Response(JSON.stringify({
            error: 'Word документът е празен или съдържа само изображения. Опитай с PDF.',
            details: 'mammoth не може да извлече текст от документи с вградени изображения'
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Use the text extraction function (same as chunked PDF)
        const extractionResult = await extractQuestionsFromText(
          anthropic,
          docxText,
          subjectName,
          topics,
          `Word документ: ${file.name}`
        );

        // Transform results - use topic IDs instead of names
        const questions = (extractionResult.questions || []).map((q) => ({
          type: q.type || 'mcq',
          text: q.text || '',
          options: q.options || null,
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || '',
          linkedTopicIds: q.linkedTopicIndex && topicIds[q.linkedTopicIndex - 1]
            ? [topicIds[q.linkedTopicIndex - 1]]
            : [],
          bloomLevel: (q.bloomLevel && q.bloomLevel >= 1 && q.bloomLevel <= 6) ? q.bloomLevel : undefined,
          caseId: q.caseId || null,
          stats: { attempts: 0, correct: 0 }
        }));

        const cost = (extractionResult.inputTokens * 0.003 + extractionResult.outputTokens * 0.015) / 1000000;

        if (isDev) console.log(`[EXTRACT-Q] DOCX extraction complete: ${questions.length} questions`);

        return new Response(JSON.stringify({
          questions,
          cases: extractionResult.cases || [],
          wasDocx: true,
          usage: {
            inputTokens: extractionResult.inputTokens,
            outputTokens: extractionResult.outputTokens,
            cost: Math.round(cost * 1000000) / 1000000
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (docxError) {
        console.error('[EXTRACT-Q] DOCX extraction failed:', docxError);
        const errorMsg = docxError instanceof Error ? docxError.message : String(docxError);

        // Provide helpful error messages based on common issues
        let userMessage = 'Грешка при обработка на Word документа';
        if (errorMsg.includes('Could not find file')) {
          userMessage = 'Файлът не е валиден Word документ (.docx)';
        } else if (errorMsg.includes('End of data')) {
          userMessage = 'Файлът е повреден или е стар .doc формат. Запази като .docx и опитай отново.';
        } else if (errorMsg.includes('encrypted')) {
          userMessage = 'Файлът е защитен с парола. Премахни защитата и опитай отново.';
        }

        return new Response(JSON.stringify({
          error: userMessage,
          details: errorMsg
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
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
        if (isDev) console.log(`[EXTRACT-Q] Using CHUNKED extraction for ${pdfAnalysis.pageCount} pages`);

        const allQuestions: ExtractedQuestion[] = [];
        const allCases: ExtractedCase[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const numChunks = Math.ceil(pdfAnalysis.pageCount / PAGES_PER_CHUNK);

        for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
          const startPage = chunkIdx * PAGES_PER_CHUNK;
          const endPage = Math.min(startPage + PAGES_PER_CHUNK, pdfAnalysis.pageCount);
          const chunkText = pdfAnalysis.textByPage.slice(startPage, endPage).join('\n\n--- СТРАНИЦА ---\n\n');

          if (isDev) console.log(`[EXTRACT-Q] Processing chunk ${chunkIdx + 1}/${numChunks} (pages ${startPage + 1}-${endPage})`);

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

          if (isDev) console.log(`[EXTRACT-Q] Chunk ${chunkIdx + 1} extracted ${chunkResult.questions?.length || 0} questions`);
        }

        // Transform and return chunked results - use topic IDs instead of names
        const questions = allQuestions.map((q) => ({
          type: q.type || 'mcq',
          text: q.text || '',
          options: q.options || null,
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || '',
          linkedTopicIds: q.linkedTopicIndex && topicIds[q.linkedTopicIndex - 1]
            ? [topicIds[q.linkedTopicIndex - 1]]
            : [],
          bloomLevel: (q.bloomLevel && q.bloomLevel >= 1 && q.bloomLevel <= 6) ? q.bloomLevel : undefined,
          caseId: q.caseId || null,
          stats: { attempts: 0, correct: 0 }
        }));

        const cost = (totalInputTokens * 0.003 + totalOutputTokens * 0.015) / 1000000;

        if (isDev) console.log(`[EXTRACT-Q] CHUNKED extraction complete: ${questions.length} total questions from ${numChunks} chunks`);

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

=== ТИПОВЕ ВЪПРОСИ ===

1. MCQ (type: "mcq") - въпрос с готови отговори:

ФОРМАТ А - Стандартен MCQ:
- Въпрос + буквени отговори (А/Б/В/Г или A/B/C/D)
- "text" = само въпросът, "options" = отговорите

ФОРМАТ Б - Твърдения + Комбинации (често в български мед. тестове):
- Въпрос + Номерирани твърдения (1. 2. 3. 4.)
- Буквени отговори = комбинации (А.1,2,3 / Б.Всички / В.Никои)
- "text" = въпросът + ВСИЧКИ твърдения, "options" = САМО буквените комбинации

2. ОТВОРЕН (type: "open") - въпрос без готови отговори:
- "Опишете...", "Какво е...", "Обяснете...", "Избройте...", "Дефинирайте..."
- correctAnswer = кратък модерен отговор (2-4 изречения)
- options = null (НЯМА опции)

ПРИМЕР MCQ:
"Коя е столицата?" → {"type": "mcq", "text": "Коя е столицата?", "options": ["А. Варна", "Б. София"], "correctAnswer": "Б", "explanation": "...", "linkedTopicIndex": null}

ПРИМЕР OPEN:
"Дефинирайте хомеостаза." → {"type": "open", "text": "Дефинирайте хомеостаза.", "options": null, "correctAnswer": "Хомеостазата е способността на организма да поддържа стабилна вътрешна среда чрез регулаторни механизми.", "explanation": null, "linkedTopicIndex": null}
${topicListForPrompt}

=== JSON ФОРМАТ ===

{
  "questions": [
    {
      "type": "mcq",
      "text": "Текст на въпроса",
      "options": ["А. ...", "Б. ...", "В. ...", "Г. ..."],
      "correctAnswer": "Б",
      "explanation": "Кратко обяснение (1-2 изречения)",
      "linkedTopicIndex": 5,
      "bloomLevel": 1
    },
    {
      "type": "open",
      "text": "Дефинирайте...",
      "options": null,
      "correctAnswer": "Кратък модерен отговор (2-4 изречения)",
      "explanation": null,
      "linkedTopicIndex": 3,
      "bloomLevel": 4
    }
  ]
}

=== ПРАВИЛА ===
- type е "mcq" или "open"
- linkedTopicIndex = 1-based индекс от темите, или null
- bloomLevel = 1-6 по Bloom's taxonomy (1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create)
- explanation = кратко обяснение (1-2 изречения). Ако не знаеш със сигурност, напиши null.
- ПРОПУСКАЙ казуси (клинични случаи)
- Върни САМО JSON, без markdown`
    });

    console.log('[EXTRACT-Q] Starting Claude API call...');
    console.log('[EXTRACT-Q] File type:', file.type);
    console.log('[EXTRACT-Q] File size:', Math.round(base64.length / 1024), 'KB (base64)');

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 - good for extraction
      max_tokens: 64000, // More tokens for large question banks
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
    let result: ExtractionResult = { questions: [], cases: [] };
    let wasRepaired = false;
    try {
      // Try to find JSON object
      const startIdx = responseText.indexOf('{');
      const endIdx = responseText.lastIndexOf('}');

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        result = JSON.parse(responseText.substring(startIdx, endIdx + 1)) as ExtractionResult;
      } else {
        result = JSON.parse(responseText) as ExtractionResult;
      }
    } catch (parseError) {
      console.error('[EXTRACT-Q] JSON parse error, attempting repair:', parseError);

      // Try to repair truncated JSON
      const repaired = repairTruncatedJSON(responseText);

      if (repaired && repaired.questions.length > 0) {
        result = repaired;
        wasRepaired = true;
        if (isDev) console.log(`[EXTRACT-Q] Successfully repaired: ${result.questions.length} questions recovered`);
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

    // Transform questions to match our BankQuestion type - use topic IDs
    const questions = (result.questions || []).map((q) => ({
      type: q.type || 'mcq',
      text: q.text || '',
      options: q.options || null,
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation || '',
      linkedTopicIds: q.linkedTopicIndex && topicIds[q.linkedTopicIndex - 1]
        ? [topicIds[q.linkedTopicIndex - 1]]
        : [],
      bloomLevel: (q.bloomLevel && q.bloomLevel >= 1 && q.bloomLevel <= 6) ? q.bloomLevel : undefined,
      caseId: q.caseId || null,
      stats: { attempts: 0, correct: 0 }
    }));

    const cases = (result.cases || []).map((c) => ({
      id: c.id || '',
      description: c.description || '',
      questionIds: [] as string[] // Will be populated when adding to bank
    }));

    // Sonnet pricing: $3/1M input, $15/1M output
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000000;

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

    return new Response(JSON.stringify({ error: 'Грешка при извличане на въпроси. Опитай отново.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
