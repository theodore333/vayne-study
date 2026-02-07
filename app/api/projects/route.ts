import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
  try {
    const { apiKey, description, projectType, existingModules } = await request.json();

    if (!apiKey || !description) {
      return new Response(JSON.stringify({ error: 'Missing API key or description' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const client = new Anthropic({ apiKey });

    const existingContext = existingModules?.length
      ? `\n\nВече съществуващи модули (НЕ ги повтаряй):\n${existingModules.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n')}`
      : '';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Ти си учебен планер. Създай структуриран план с модули за следния проект:

Тип: ${projectType || 'course'}
Описание: ${description}${existingContext}

Генерирай списък от модули, подредени по логичен ред на изучаване. Всеки модул трябва да е конкретна тема или раздел.

ВАЖНО: Отговори САМО с валиден JSON масив. Без обяснения.

Формат:
[
  { "title": "Име на модул", "suggestedSize": "small|medium|large" },
  ...
]

Правила:
- Между 4 и 15 модула
- Имената да са конкретни и кратки (до 60 символа)
- suggestedSize: small = <30 мин, medium = 30-60 мин, large = >60 мин
- Подреди логично (основи → напреднали)
- Ако описанието е на български, имената да са на български`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'AI did not return valid JSON' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const modules = JSON.parse(jsonMatch[0]) as Array<{ title: string; suggestedSize: string }>;

    // Validate and sanitize
    const sanitized = modules
      .filter(m => m.title && typeof m.title === 'string')
      .slice(0, 20)
      .map((m, i) => ({
        title: m.title.slice(0, 100),
        order: i + 1,
        suggestedSize: ['small', 'medium', 'large'].includes(m.suggestedSize) ? m.suggestedSize : 'medium'
      }));

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const cost = (inputTokens * 3 + outputTokens * 15) / 1000000;

    return new Response(JSON.stringify({ modules: sanitized, cost }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Project planner error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
