import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// Strip HTML while preserving block-level structure
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|details|summary)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Bloom Level 1 (Remember) prompt with full Wozniak 20 Rules ──────────
const materialSystemPrompt = `You are an expert at creating Anki flashcards from study material. You follow TWO frameworks strictly:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMEWORK 1: BLOOM'S TAXONOMY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bloom's Taxonomy has 6 cognitive levels:
1. REMEMBER (Запомняне) — recall facts, terms, definitions, lists, basic concepts
2. UNDERSTAND (Разбиране) — explain ideas, summarize, paraphrase, interpret
3. APPLY (Прилагане) — use knowledge in new situations, solve problems
4. ANALYZE (Анализиране) — break down, compare, contrast, find relationships
5. EVALUATE (Оценяване) — judge, critique, defend, justify decisions
6. CREATE (Създаване) — design, construct, plan, produce original work

⚠️ YOU MUST GENERATE CARDS ONLY FOR LEVEL 1 — REMEMBER ⚠️

Level 1 (Remember) cards test ONLY:
✅ Definitions: "What is X?" → "X is {{c1::definition}}"
✅ Terminology: medical terms, anatomical names, chemical names, abbreviations
✅ Key facts: numbers, dates, locations, classifications, categories
✅ Simple associations: "X is produced by {{c1::Y}}", "X is located in {{c1::Y}}"
✅ Normal values & reference ranges: "Normal pH is {{c1::7.35-7.45}}"
✅ Lists/enumerations broken into INDIVIDUAL cards

🚫 DO NOT create cards that require:
- Understanding (L2): explaining WHY or HOW something works
- Application (L3): clinical scenarios, problem-solving
- Analysis (L4): comparing mechanisms, differentiating conditions
- Evaluation (L5): judging treatment choices
- Creation (L6): designing protocols

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMEWORK 2: PETER WOZNIAK'S 20 RULES OF FORMULATING KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. DO NOT LEARN WHAT YOU DO NOT UNDERSTAND — only create cards for clearly stated facts in the material.
2. LEARN BEFORE YOU MEMORIZE — structure cards so the atomic fact is self-contained and doesn't require prior reading.
3. BUILD UPON THE BASICS — start with the most fundamental facts (definitions, names) before derived facts.
4. STICK TO THE MINIMUM INFORMATION PRINCIPLE — each card = ONE atomic fact. One cloze = one piece of knowledge.
5. CLOZE DELETION IS KING — use {{c1::answer}} syntax. Hide the KEY fact to remember.
6. USE IMAGERY — when the material describes anatomical locations or structures, add brief spatial context.
7. USE MNEMONIC TECHNIQUES — if a mnemonic exists in the material, incorporate it.
8. GRAPHIC DELETION IS AN OPTION — not applicable for text cards (skip).
9. AVOID SETS — NEVER put "A, B, and C are..." in one card. Break into separate cards for each item.
10. AVOID ENUMERATIONS — if the material lists items, create one card per item, each with distinguishing context.
11. COMBAT INTERFERENCE — add distinguishing context so similar cards (e.g., similar muscles, nerves, enzymes) don't confuse.
12. OPTIMIZE WORDING — shortest possible. No filler words. Direct factual statements.
13. REFER TO OTHER MEMORIES — connect new facts to the topic context to aid recall.
14. PERSONALIZE & PROVIDE EXAMPLES — use the same terminology as the source material.
15. RELY ON EMOTIONAL STATES — use vivid, concrete language when possible.
16. CONTEXT CUES SIMPLIFY WORDING — include just enough context for the cloze to be unambiguous.
17. REDUNDANCY IS OK — create 2+ cards for the SAME important fact from different angles.
18. PROVIDE SOURCES — not applicable for generated cards (skip).
19. PROVIDE DATE STAMPING — not applicable (skip).
20. PRIORITIZE — focus on the most exam-relevant and clinically important facts first.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Output ONLY a valid JSON array of strings
- Each string = one cloze card in QUESTION FORMAT: "Question? {{c1::answer}}"
- The card MUST be phrased as a QUESTION. The cloze {{c1::...}} contains the ANSWER.
- Use {{c1::...}} for the primary hidden answer. Use {{c2::...}} ONLY when a single question tests 2 related answers.
- Write in the SAME LANGUAGE as the input material
- NO markdown, NO extra text, NO commentary — JUST the JSON array
- Generate as many cards as the material warrants — cover ALL key facts, definitions, and terminology
- Prioritize: definitions → key terms → facts → associations → values/numbers

EXAMPLES:
Material: "Ацетилхолинът (ACh) е невротрансмитер в парасимпатиковата нервна система. Той се разгражда от ацетилхолинестераза (AChE). Рецепторите за ACh са два типа: мускаринови и никотинови."
→ [
  "Кой е главният невротрансмитер в парасимпатиковата нервна система? {{c1::Ацетилхолин (ACh)}}",
  "Кой ензим разгражда ацетилхолин? {{c1::Ацетилхолинестераза (AChE)}}",
  "Какво разгражда ацетилхолинестераза (AChE)? {{c1::Ацетилхолин (ACh)}}",
  "Кои са двата типа рецептори за ацетилхолин? {{c1::Мускаринови}} и {{c2::никотинови}}",
  "Мускариновите рецептори са тип рецептори за кой невротрансмитер? {{c1::Ацетилхолин (ACh)}}",
  "Никотиновите рецептори са тип рецептори за кой невротрансмитер? {{c1::Ацетилхолин (ACh)}}"
]`;

// ── Wrong-answers prompt (existing) ──────────────────────────────────────
const wrongAnswersSystemPrompt = `You are an expert at creating Anki flashcards following Peter Wozniak's 20 Rules of Formulating Knowledge. You create cloze deletion cards in the SAME LANGUAGE as the source material.

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

export async function POST(request: Request) {
  const body = await request.json();
  const { apiKey, topicName, mode } = body;

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });

  let systemPrompt: string;
  let userPrompt: string;
  let maxTokens: number;

  if (mode === 'from_material') {
    // ── Generate cards from topic material (Bloom L1) ──
    const { material } = body as { material: string };
    if (!material || typeof material !== 'string' || material.trim().length === 0) {
      return NextResponse.json({ error: 'No material provided' }, { status: 400 });
    }

    // Strip HTML and truncate
    let stripped = stripHtml(material);
    if (stripped.length > 12000) {
      stripped = stripped.substring(0, 12000) + '\n\n[... материалът е съкратен]';
    }

    systemPrompt = materialSystemPrompt;
    userPrompt = `Тема: ${topicName || 'General'}\n\nМатериал:\n\n${stripped}\n\nГенерирай Bloom Level 1 (Запомняне) cloze карти. САМО JSON array.`;
    maxTokens = 8000;
  } else {
    // ── Generate cards from wrong answers (existing behavior) ──
    const { wrongAnswers } = body;
    if (!wrongAnswers || !Array.isArray(wrongAnswers) || wrongAnswers.length === 0) {
      return NextResponse.json({ error: 'No wrong answers provided' }, { status: 400 });
    }

    const wrongAnswersText = wrongAnswers.map((wa: { question: string; userAnswer: string | null; correctAnswer: string; explanation?: string }, i: number) =>
      `${i + 1}. Въпрос: ${wa.question}\n   Грешен отговор на студента: ${wa.userAnswer || '(не е отговорил)'}\n   Правилен отговор: ${wa.correctAnswer}${wa.explanation ? `\n   Обяснение: ${wa.explanation}` : ''}`
    ).join('\n\n');

    systemPrompt = wrongAnswersSystemPrompt;
    userPrompt = `Тема: ${topicName || 'General'}\n\nГрешки на студента:\n\n${wrongAnswersText}\n\nГенерирай cloze карти. САМО JSON array.`;
    maxTokens = 2000;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse cards' }, { status: 500 });
    }

    const cards = JSON.parse(jsonMatch[0]) as string[];

    // Calculate cost (Opus pricing)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = (inputTokens * 0.015 + outputTokens * 0.075) / 1000;

    return NextResponse.json({ cards, cost });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate cards';
    console.error('Anki cards generation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
