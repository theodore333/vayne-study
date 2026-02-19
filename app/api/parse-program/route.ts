import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

interface ExistingTopic {
  id: string;
  name: string;
  number: number;
}

interface ParsedEntry {
  weekNumber: number;
  topic: string;
  matchedTopicIds: string[];
  entryType: 'topic' | 'colloquium' | 'control_test' | 'exam';
}

/**
 * Calculate the absolute date for a given week number.
 * Week 1 = first occurrence of classDay on or after semesterStart.
 */
function calculateDateForWeek(semesterStart: string, classDay: number, weekNumber: number): string {
  const start = new Date(semesterStart);
  start.setHours(0, 0, 0, 0);

  // Convert JS day (0=Sun) to our system (0=Mon)
  const startDow = (start.getDay() + 6) % 7;

  // Days from semester start to first occurrence of classDay
  let daysToFirstClass = classDay - startDow;
  if (daysToFirstClass < 0) daysToFirstClass += 7;

  // Week 1 = first occurrence, Week N = first + (N-1) * 7
  const totalDays = daysToFirstClass + (weekNumber - 1) * 7;

  const result = new Date(start);
  result.setDate(result.getDate() + totalDays);

  // Use local date (NOT toISOString which converts to UTC and loses a day in UTC+2)
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, '0');
  const day = String(result.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  try {
    const {
      text,
      apiKey,
      subjectName,
      existingTopics,
      classDay,
      semesterStart
    } = await request.json() as {
      text: string;
      apiKey: string;
      subjectName: string;
      existingTopics: ExistingTopic[];
      classDay: number;
      semesterStart: string;
    };

    if (!text || !apiKey) {
      return NextResponse.json({ error: 'Липсва текст или API ключ' }, { status: 400 });
    }

    if (!semesterStart) {
      return NextResponse.json({ error: 'Задай начална дата на семестъра в настройките' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Build existing topics list for matching
    const topicsList = existingTopics && existingTopics.length > 0
      ? existingTopics.map(t => `${t.number}. ${t.name} [id:${t.id}]`).join('\n')
      : '(няма създадени теми)';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Анализирай тази учебна програма за предмета "${subjectName}".

ТЕКСТ НА ПРОГРАМАТА:
${text}

ЗАДАЧА:
1. Извлечи всяка седмица/занятие и темата за нея
2. Ако има номерация (Седмица 1, Week 1, I, II, 1., 2., №1) — използвай нея
3. Ако няма номерация — номерирай последователно (1, 2, 3...)
4. Ако за една седмица има повече от една тема — обедини ги в един запис
5. КЛАСИФИЦИРАЙ всеки запис:
   - "topic" = обикновена учебна тема (лекция, упражнение, семинар)
   - "colloquium" = колоквиум, тест, входящ тест, текущ контрол, проверка на знания
   - "control_test" = контролно, писмено контролно, класно
   - "exam" = изпит, финален изпит, практически изпит
   ВАЖНО: Всяко "тест", "колоквиум", "контролно", "изпит" е ВИНАГИ специално събитие, НИКОГА "topic"!

СЪЩЕСТВУВАЩИ ТЕМИ НА ПРЕДМЕТА (за съпоставка):
${topicsList}

Ако тема от програмата съвпада ПО СМИСЪЛ с някоя от съществуващите — сложи нейното id в matchedTopicIds.
Съпоставяй САМО при ясно съвпадение по съдържание, НЕ по номер.

ВЪРНИ САМО JSON (без markdown):
{
  "entries": [
    {
      "weekNumber": 1,
      "topic": "Точният текст от програмата",
      "entryType": "topic",
      "matchedTopicIds": ["id1"] или []
    },
    {
      "weekNumber": 8,
      "topic": "Колоквиум I - теми 1-7",
      "entryType": "colloquium",
      "matchedTopicIds": []
    }
  ]
}

ВАЖНО:
- Запази ТОЧНО оригиналния текст на всяка тема
- Не добавяй теми от собствени познания
- НЕ пропускай колоквиуми/контролни — те са СПЕЦИАЛНИ събития
- Колоквиум/контролно ВИНАГИ е "colloquium" или "control_test", НИКОГА "topic"
- Ако не си сигурен за съвпадение — остави matchedTopicIds празен масив`
      }]
    });

    const textContent = message.content.find(block => block.type === 'text');
    const responseText = textContent?.text || '{}';

    // Clean and parse JSON (same pattern as analyze-syllabus)
    let cleanedResponse = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '');

    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
    }

    cleanedResponse = cleanedResponse
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .trim();

    const parsed = JSON.parse(cleanedResponse);
    const entries: ParsedEntry[] = parsed.entries || [];

    // Calculate absolute dates and resolve topic names
    const topicMap = new Map(existingTopics?.map(t => [t.id, t.name]) || []);

    const validTypes = new Set(['topic', 'colloquium', 'control_test', 'exam']);

    const enrichedEntries = entries.map(entry => ({
      weekNumber: entry.weekNumber,
      date: calculateDateForWeek(semesterStart, classDay, entry.weekNumber),
      topic: entry.topic,
      entryType: validTypes.has(entry.entryType) ? entry.entryType : 'topic',
      matchedTopicIds: entry.matchedTopicIds || [],
      matchedTopicNames: (entry.matchedTopicIds || [])
        .map(id => topicMap.get(id))
        .filter(Boolean) as string[],
    }));

    // Sonnet pricing: $3/1M input, $15/1M output
    const cost = (message.usage.input_tokens * 3 + message.usage.output_tokens * 15) / 1_000_000;

    return NextResponse.json({
      entries: enrichedEntries,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cost: Math.round(cost * 1000000) / 1000000
      }
    });

  } catch (error: unknown) {
    console.error('[PARSE-PROGRAM] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
