import Anthropic from '@anthropic-ai/sdk';

// See CLAUDE_MODELS.md for correct model IDs

const isDev = process.env.NODE_ENV === 'development';

export async function POST(request: Request) {

  try {
    const contentType = request.headers.get('content-type') || '';
    let apiKey: string;
    let topicName: string;
    let subjectName: string;
    let existingMaterial: string = '';
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    // Handle JSON body (pasted images) or FormData (file upload)
    if (contentType.includes('application/json')) {
      // Pasted images as base64
      const body = await request.json();
      apiKey = body.apiKey;
      topicName = body.topicName;
      subjectName = body.subjectName;
      existingMaterial = body.existingMaterial || '';
      const images: string[] = body.images || [];

      if (isDev) console.log('[EXTRACT-MATERIAL] Pasted images count:', images.length);

      if (!images.length || !apiKey) {
        return new Response(JSON.stringify({ error: 'Missing images or API key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Add each image to content
      for (const imgData of images) {
        // Extract base64 data and media type from data URL
        const match = imgData.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) continue;

        const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        const base64 = match[2];

        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64
          }
        });
      }
    } else {
      // FormData - file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      apiKey = formData.get('apiKey') as string;
      topicName = formData.get('topicName') as string;
      subjectName = formData.get('subjectName') as string;
      existingMaterial = formData.get('existingMaterial') as string || '';

      if (isDev) console.log('[EXTRACT-MATERIAL] File:', file?.name, 'Size:', file?.size, 'Type:', file?.type);

      if (!file || !apiKey) {
        return new Response(JSON.stringify({ error: 'Missing file or API key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);
      const base64 = buffer.toString('base64');

      if (isDev) console.log('[EXTRACT-MATERIAL] Base64 size:', Math.round(base64.length / 1024), 'KB');

      const isPDF = file.type === 'application/pdf';

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
    }

    const anthropic = new Anthropic({ apiKey });

    const appendMode = existingMaterial.trim().length > 0;

    content.push({
      type: 'text',
      text: `Извлечи ЦЕЛИЯ учебен материал от този документ за темата "${topicName}" по предмет "${subjectName}".

${appendMode ? `ВАЖНО: Вече има съществуващ материал. Извлечи САМО НОВАТА информация от документа, която НЕ се повтаря.` : ''}

ЗАДАЧА:
1. Извлечи ЦЕЛИЯ текст от документа - лекции, учебници, слайдове
2. За ДИАГРАМИ и СХЕМИ - опиши подробно какво показват:
   - Какви елементи има
   - Как са свързани
   - Какво илюстрират
3. За ТАБЛИЦИ - преобразувай в четим текстов формат
4. За ФОРМУЛИ - напиши ги разбираемо
5. Запази логическата структура (заглавия, подточки)
6. КЛАСИФИЦИРАЙ РАЗМЕРА на темата:
   - "small": Малко съдържание, 1-2 концепции, лесно за запомняне (15-20 мин учене)
   - "medium": Умерено съдържание, 3-5 концепции, нужен е преговор (30-45 мин)
   - "large": Много съдържание, 6+ концепции, сложни взаимовръзки (60+ мин)

ФОРМАТ НА ОТГОВОРА (ЗАДЪЛЖИТЕЛНО):
<size>small|medium|large</size>
<material>
[Тук сложи извлечения материал - чист текст, добре форматиран]
</material>

ПРАВИЛА:
- Използвай заглавия с === или ---
- Използвай точки (•) за списъци
- НЕ добавяй коментари от себе си
- НЕ добавяй информация, която НЕ присъства в документа
- НЕ перифразирай и НЕ разширявай - копирай ТОЧНИЯ текст от документа
- Ако нещо е нечетливо, напиши [нечетливо] вместо да гадаеш
- За диаграми: опиши САМО видимите елементи и надписи, НЕ добавяй обяснения от себе си
- НЕ оставяй повече от 1 празен ред между параграфи
- Започни директно с материала вътре в <material> тага

ПРИМЕР:
<size>medium</size>
<material>
=== Схема на сърцето ===
Сърцето има 4 кухини:
• Дясно предсърдие - приема венозна кръв от v. cava superior и inferior
• Дясно камера - изпомпва кръв към белите дробове през a. pulmonalis
• Ляво предсърдие - приема оксигенирана кръв от vv. pulmonales
• Ляво камера - изпомпва кръв към тялото през aorta

Клапи: трикуспидална (дясно), митрална (ляво), аортна, пулмонална
</material>`
    });

    if (isDev) console.log('[EXTRACT-MATERIAL] Starting Claude API call...');

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
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
      console.log('[EXTRACT-MATERIAL] Tokens - Input:', inputTokens, 'Output:', outputTokens);
      console.log('[EXTRACT-MATERIAL] Extracted text length:', fullText.length);
    }

    if (!fullText.trim()) {
      return new Response(JSON.stringify({
        error: 'Не успях да извлека текст от документа'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse size and material from response
    let extractedText = fullText.trim();
    let detectedSize: 'small' | 'medium' | 'large' | null = null;

    // Extract size from <size> tag
    const sizeMatch = extractedText.match(/<size>(small|medium|large)<\/size>/i);
    if (sizeMatch) {
      detectedSize = sizeMatch[1].toLowerCase() as 'small' | 'medium' | 'large';
      extractedText = extractedText.replace(/<size>.*?<\/size>/i, '').trim();
    }

    // Extract material from <material> tag
    const materialMatch = extractedText.match(/<material>([\s\S]*?)<\/material>/i);
    if (materialMatch) {
      extractedText = materialMatch[1].trim();
    }

    // Remove common prefixes Claude might add (fallback cleanup)
    const prefixesToRemove = [
      /^Ето извлечения материал:?\s*/i,
      /^Извлечен материал:?\s*/i,
      /^Материал:?\s*/i,
      /^Here is the extracted material:?\s*/i,
    ];

    for (const prefix of prefixesToRemove) {
      extractedText = extractedText.replace(prefix, '');
    }

    // Clean up excessive empty lines (max 2 consecutive newlines)
    extractedText = extractedText.replace(/\n{3,}/g, '\n\n');
    // Remove trailing whitespace on each line
    extractedText = extractedText.replace(/[ \t]+$/gm, '');

    if (isDev) console.log('[EXTRACT-MATERIAL] Detected size:', detectedSize);

    // Opus pricing: $15/1M input, $75/1M output
    const cost = (inputTokens * 0.015 + outputTokens * 0.075) / 1000;

    return new Response(JSON.stringify({
      text: extractedText,
      size: detectedSize,
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
    console.error('[EXTRACT-MATERIAL] Error:', error);
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

    return new Response(JSON.stringify({ error: 'Грешка при обработка на документа. Опитай отново.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
