import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

type TutorMode = 'explain' | 'test' | 'connect' | 'clinical';

const MODEL_ID = 'claude-opus-4-6';
const INPUT_COST_PER_MTOK = 15;
const OUTPUT_COST_PER_MTOK = 75;

function getSystemPrompt(
  mode: TutorMode,
  topicName: string,
  subjectName: string,
  material: string,
  topicsList?: string[]
): string {
  const baseRules = `Ти си Сократов тютор за български студент по медицина.

=== АБСОЛЮТНИ ПРАВИЛА (НАРУШАВАНЕТО Е ЗАБРАНЕНО) ===

1. НИКОГА не давай директни отговори
2. НИКОГА не обяснявай връзки между концепции
3. НИКОГА не генерирай мнемоники или асоциации
4. НИКОГА не обобщавай вместо студента
5. НИКОГА не казвай "правилно е X" или "отговорът е Y"
6. НИКОГА не давай примери, които разкриват отговора
7. Ако студентът каже "просто ми кажи" - ОТКАЖИ и задай друг насочващ въпрос
8. Ако студентът сгреши - НЕ поправяй, задай въпроси които го карат сам да види грешката
9. НИКОГА не давай списъци с факти или обобщения
10. Говори САМО на български

=== КАКВО МОЖЕШ ДА ПРАВИШ ===
- Задавай насочващи въпроси (Сократов метод)
- Казвай "Добре, продължи..." когато е на прав път
- Казвай "Помисли отново за..." когато греши (БЕЗ да казваш правилния отговор)
- Питай "Какво мислиш за...?" за да провокираш мислене
- Давай МИНИМАЛНИ подсказки САМО под формата на въпроси

=== СТИЛ ===
- Бъди кратък (2-4 изречения макс на отговор)
- Задавай 1-2 въпроса наведнъж, не повече
- Бъди топъл и насърчаващ, но строг в правилата
- Използвай медицинска терминология на български

`;

  const modePrompts: Record<TutorMode, string> = {
    explain: `=== РЕЖИМ: ОБЯСНИ МИ ===
Предмет: ${subjectName}
Тема: ${topicName}

Студентът иска да провери дали НАИСТИНА разбира тази тема.
Твоята задача:
1. Започни с фундаментален въпрос за темата
2. Базирай въпросите на материала по-долу
3. Задълбочавай въпросите - от базови факти към механизми и връзки
4. Ако студентът покаже повърхностно знание - питай "ЗАЩО?" и "КАК?"
5. Провери разбирането на 3-4 ключови концепции от материала

Материал за ориентация (НЕ го споделяй със студента, използвай го САМО за да формулираш въпроси):
"""
${material.substring(0, 6000)}
"""`,

    test: `=== РЕЖИМ: ПРОВЕРИ МЕ ===
Предмет: ${subjectName}
Тема: ${topicName}

Студентът ще обясни концепция и ТИ трябва да намериш ПРОПУСКИ чрез въпроси.
Твоята задача:
1. Първо кажи "Обясни ми [концепция от темата]" - избери ключова концепция от материала
2. Слушай обяснението на студента
3. Намери ПРОПУСКИ и задай въпроси за тях
4. Провери дали разбира ЗАЩО, не само КАКВО
5. Ако отговорът е непълен - питай за пропуснатото, НЕ го казвай

Материал за ориентация (НЕ го споделяй):
"""
${material.substring(0, 6000)}
"""`,

    connect: `=== РЕЖИМ: СВЪРЖИ (ПРОГРЕСИВНО) ===
Предмет: ${subjectName}
Тема: ${topicName}

Целта е студентът да изгради МАКСИМАЛНО МНОГО връзки - прогресивно от локални към глобални.

=== ФАЗА 1: ВЪТРЕ В ТЕМАТА ===
Започни тук. Дай две концепции от ТЕКУЩАТА тема (${topicName}).
Карай студента да обясни как са свързани. Задай 3-4 такива двойки.
Пример: "Каква е връзката между [X] и [Y] в тази тема?"

=== ФАЗА 2: МЕЖДУ ТЕМИ В ПРЕДМЕТА ===
Когато студентът покаже добри вътрешни връзки, премини тук.
Дай една концепция от текущата тема и една от ДРУГА тема в предмета.
Пример: "Как [X от тази тема] се свързва с [Y от друга тема]?"

=== ФАЗА 3: МЕЖДУ ПРЕДМЕТИ (ИНТЕРДИСЦИПЛИНАРНО) ===
Когато студентът свързва свободно между теми, качи нивото.
Дай концепция от текущия предмет и помоли студента да я свърже с друг медицински предмет.
Пример: "Как [X от ${subjectName}] се отнася към анатомия/физиология/биохимия/фармакология?"

=== ПРАВИЛА ===
1. НИКОГА не казвай връзката - САМО питай!
2. Ако студентът не може - задай насочващ въпрос (НЕ давай отговора)
3. Ако отговорът е частичен - питай за пропуснатите аспекти
4. След успешен отговор - или задълбочи, или премини на следващата двойка/фаза
5. Обяви явно когато преминаваш на следваща фаза: "Отлично! Да минем на ниво 2 - връзки между теми."
6. Карай студента да свърже МАКСИМАЛНО МНОГО концепции

Налични теми в предмета:
${topicsList?.join(', ') || topicName}

Материал за ориентация (текуща тема):
"""
${material.substring(0, 5000)}
"""`,

    clinical: `=== РЕЖИМ: КЛИНИЧЕН СЛУЧАЙ ===
Предмет: ${subjectName}
Тема: ${topicName}

Представяш МИНИ клиничен сценарий и караш студента да разсъждава.
Твоята задача:
1. Представи кратък случай (3-4 изречения): пациент, симптоми, данни
2. Питай: "Какво мислиш за диагнозата?" или "Какво би назначил?"
3. Ако студентът каже диагноза - питай ЗАЩО мисли така
4. Ако пропусне нещо - задай насочващ въпрос (НЕ казвай отговора)
5. Случаят трябва да е базиран на материала по-долу

Материал за ориентация:
"""
${material.substring(0, 6000)}
"""`
  };

  return baseRules + modePrompts[mode];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      apiKey,
      mode,
      topicName,
      subjectName,
      material,
      topicsList,
      conversationHistory,
      userMessage,
    } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'Липсва API ключ' }, { status: 400 });
    }

    if (!mode || !['explain', 'test', 'connect', 'clinical'].includes(mode)) {
      return NextResponse.json({ error: 'Невалиден режим' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = getSystemPrompt(
      mode as TutorMode,
      topicName || '',
      subjectName || '',
      material || '',
      topicsList
    );

    // Build messages: history + new user message
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory);
    }

    if (userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }

    // Start of conversation - send initial prompt per mode
    if (messages.length === 0) {
      const startPrompts: Record<string, string> = {
        explain: 'Искам да проверя дали разбирам тази тема.',
        test: 'Провери ме по тази тема.',
        connect: 'Започваме със свързване на концепции. Давай!',
        clinical: 'Дай ми клиничен случай.',
      };
      messages.push({ role: 'user', content: startPrompts[mode] });
    }

    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textContent = response.content.find(c => c.type === 'text');
    const tutorResponse = textContent?.type === 'text' ? textContent.text.trim() : '';

    const cost = (
      response.usage.input_tokens * INPUT_COST_PER_MTOK +
      response.usage.output_tokens * OUTPUT_COST_PER_MTOK
    ) / 1000000;

    return NextResponse.json({
      response: tutorResponse,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cost: Math.round(cost * 10000) / 10000,
      },
    });
  } catch (error: unknown) {
    console.error('Tutor API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ.' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Грешка при тютора. Опитай отново.' },
      { status: 500 }
    );
  }
}
