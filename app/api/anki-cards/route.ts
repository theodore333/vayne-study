import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const { wrongAnswers, topicName } = await request.json();
  if (!wrongAnswers || !Array.isArray(wrongAnswers) || wrongAnswers.length === 0) {
    return NextResponse.json({ error: 'No wrong answers provided' }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });

  const wrongAnswersText = wrongAnswers.map((wa: { question: string; userAnswer: string | null; correctAnswer: string; explanation?: string }, i: number) =>
    `${i + 1}. Въпрос: ${wa.question}\n   Грешен отговор на студента: ${wa.userAnswer || '(не е отговорил)'}\n   Правилен отговор: ${wa.correctAnswer}${wa.explanation ? `\n   Обяснение: ${wa.explanation}` : ''}`
  ).join('\n\n');

  const systemPrompt = `You are an expert at creating Anki flashcards following Peter Wozniak's 20 Rules of Formulating Knowledge. You create cloze deletion cards in the SAME LANGUAGE as the source material.

CRITICAL RULES (Wozniak's 20 Rules):
1. MINIMUM INFORMATION: Each card = ONE atomic fact. If a wrong answer covers multiple facts, create separate cards.
2. CLOZE DELETION: Use {{c1::answer}} syntax. Hide the KEY piece the student got wrong.
3. OPTIMIZE WORDING: Shortest possible. No filler words. Direct statements.
4. NO SETS/ENUMERATIONS: Never "A, B, and C are...". Break into individual cards.
5. COMBAT INTERFERENCE: Add distinguishing context so similar cards don't confuse.
6. CONTEXT: Enough context so the cloze is unambiguous, but not more.
7. USE THE STUDENT'S MISTAKE: Focus the cloze on what the student actually got wrong. If they confused concept A with B, make sure the card highlights the distinction.

FORMAT:
- Output ONLY a JSON array of strings
- Each string = one cloze card with {{c1::...}} deletion(s)
- 1-3 cards per wrong answer (more if the mistake involves multiple facts)
- SAME LANGUAGE as the input content
- NO markdown, NO extra text, JUST the JSON array

EXAMPLES:
Wrong: "Кой е главният невротрансмитер в парасимпатиковата нервна система?" Student: "Норадреналин" Correct: "Ацетилхолин"
→ ["Главният невротрансмитер в {{c1::парасимпатиковата}} нервна система е {{c2::ацетилхолин}}.", "{{c1::Норадреналин}} е невротрансмитер на симпатиковата, НЕ на парасимпатиковата нервна система."]

Wrong: "What are the phases of mitosis?" Student: "Prophase, Anaphase, Telophase" Correct: "Prophase, Metaphase, Anaphase, Telophase"
→ ["The phase of mitosis between prophase and anaphase is {{c1::metaphase}}, where chromosomes align at the metaphase plate.", "The correct order of mitosis: prophase → {{c1::metaphase}} → anaphase → telophase."]`;

  const userPrompt = `Тема: ${topicName || 'General'}

Грешки на студента:

${wrongAnswersText}

Генерирай cloze карти. САМО JSON array.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse cards' }, { status: 500 });
    }

    const cards = JSON.parse(jsonMatch[0]) as string[];

    return NextResponse.json({ cards });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate cards';
    console.error('Anki cards generation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
