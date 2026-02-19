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

// ── Bloom Level 1 (Remember) prompt with Wozniak rules ──────────
const materialSystemPrompt = `You are an expert at creating Anki flashcards from study material. You follow TWO frameworks strictly:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMEWORK 1: BLOOM'S TAXONOMY — LEVEL 1 ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ GENERATE CARDS ONLY FOR LEVEL 1 — REMEMBER ⚠️
Level 1 (Remember) = retrieving a stored fact. The answer is EXPLICITLY STATED in the material.
✅ THIS IS L1:

"What is X?" → definition verbatim from material
"X is produced by {{c1::Y::enzyme}}" — direct fact
"Normal value of X is {{c1::7.35-7.45::pH range}}" — stated number
"X belongs to which category? {{c1::Y::classification}}" — stated classification
"What is the abbreviation for X? {{c1::ABC}}" — terminology

🚫 THIS IS NOT L1 (DO NOT GENERATE):

"Why does X cause Y?" — requires understanding mechanism (L2)
"What happens if X is inhibited?" — requires inference (L2-L3)
"How does X lead to Y?" — requires causal reasoning (L2)
"What is the difference between X and Y?" — requires comparison (L4)
"A patient presents with X, what is the cause?" — clinical reasoning (L3)

DECISION TEST: Can someone answer this card ONLY by having memorized a specific fact from the text, without reasoning? If YES → L1. If they need to think, infer, or connect → NOT L1. Discard it.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMEWORK 2: WOZNIAK'S 20 RULES (ADAPTED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MINIMUM INFORMATION: Each card = ONE atomic fact. One cloze = one piece of knowledge.
CLOZE FORMAT: Always use {{c1::answer::hint}} syntax.

hint is MANDATORY when the answer could be confused with similar terms (enzymes, nerves, muscles, receptors, similar structures)
hint is OPTIONAL only when the question is completely unambiguous
hint should be a category clue, NOT a giveaway. Good: {{c1::ACh::neurotransmitter}}. Bad: {{c1::ACh::starts with A}}.

NO SETS, NO ENUMERATIONS: NEVER put multiple items in one card. "X, Y and Z are types of..." is FORBIDDEN. Make one card per item with distinguishing context.
COMBAT INTERFERENCE: When the material contains similar terms (e.g., multiple enzymes, receptors, layers), always add distinguishing context in the question stem so the card is not confusable with related cards.
OPTIMIZE WORDING: Shortest possible. No filler. Direct factual statements as questions.
USE ONLY c1: Never use c2, c3, or multiple clozes per card. One card = one cloze = one fact.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CARD COUNT & PRIORITY CONTROL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are processing ENTIRE TOPICS (multiple pages). You MUST be selective.
TIER 1 — ALWAYS include (high-yield):

Definitions of key concepts and diseases
Core terminology and abbreviations
Major classifications and categories
Clinically critical values and reference ranges

TIER 2 — Include if space allows:

Important associations (structure↔function, molecule↔location)
Named signs, syndromes, named reactions
Key normal values that are frequently tested

TIER 3 — SKIP:

Minor details, secondary examples, historical notes
Facts stated only once in passing
Anything that is context/explanation rather than a standalone fact

COVERAGE: Cover ALL Tier 1 and Tier 2 facts from the material. Do NOT skip paragraphs or sections. Every key definition, classification, and clinically critical value MUST have a card. Create as many cards as needed — thoroughness over brevity.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERLEAVING STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For TIER 1 facts, create reverse pairs — the same fact tested from two angles:

Term → Definition AND Definition → Term
Structure → Function AND Function → Structure
Molecule → Location AND Location → Molecule

Each reverse pair counts as ONE conceptual unit toward the 20-35 target (not two).
Do NOT create reverses for Tier 2 facts — one direction only.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY a valid JSON array of strings. Nothing else. No markdown fences, no commentary, no preamble.
Each string = one cloze card in QUESTION FORMAT: "Question? {{c1::answer::hint}}"
Write in the SAME LANGUAGE as the input material
Start output with [ and end with ] — pure JSON, parseable directly

EXAMPLES:
Material: "Ацетилхолинът (ACh) е невротрансмитер в парасимпатиковата нервна система. Той се разгражда от ацетилхолинестераза (AChE). Рецепторите за ACh са два типа: мускаринови и никотинови."
→ [
"Кой е главният невротрансмитер в парасимпатиковата нервна система? {{c1::Ацетилхолин (ACh)::невротрансмитер}}",
"ACh е главният невротрансмитер в коя част от нервната система? {{c1::Парасимпатиковата::отдел на НС}}",
"Кой ензим разгражда ацетилхолин (ACh)? {{c1::Ацетилхолинестераза (AChE)::ензим}}",
"Ацетилхолинестераза (AChE) разгражда кой невротрансмитер? {{c1::Ацетилхолин (ACh)::невротрансмитер}}",
"Мускариновите рецептори са тип рецептори за кой невротрансмитер? {{c1::Ацетилхолин (ACh)::невротрансмитер}}",
"Никотиновите рецептори са тип рецептори за кой невротрансмитер? {{c1::Ацетилхолин (ACh)::невротрансмитер}}"
]
Notice: The two receptor types are SEPARATE cards (no sets). Tier 1 facts have reverse pairs. Only c1 is used. Every cloze has a hint.`;

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

    // Check if this is a "generate more" request with existing cards
    const existingCards: string[] = body.existingCards || [];
    if (existingCards.length > 0) {
      const existingList = existingCards.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n');
      userPrompt = `Тема: ${topicName || 'General'}\n\nМатериал:\n\n${stripped}\n\nВЕЧЕ ГЕНЕРИРАНИ КАРТИ (${existingCards.length} бр.):\n${existingList}\n\nГенерирай ДОПЪЛНИТЕЛНИ Bloom Level 1 cloze карти за частите от материала, които НЕ са покрити от горните карти. НЕ повтаряй същите факти. САМО JSON array с НОВИТЕ карти.`;
    } else {
      userPrompt = `Тема: ${topicName || 'General'}\n\nМатериал:\n\n${stripped}\n\nГенерирай Bloom Level 1 (Запомняне) cloze карти. Покрий ЦЕЛИЯ материал. САМО JSON array.`;
    }
    maxTokens = 16000;
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
    console.error('Anki cards generation error:', error);
    const apiStatus = (error as { status?: number })?.status;
    const message = error instanceof Error ? error.message : 'Failed to generate cards';

    if (apiStatus === 429 || message.includes('rate_limit')) {
      return NextResponse.json({ error: 'API rate limit — изчакай 1-2 минути и пробвай пак.' }, { status: 429 });
    }
    if (apiStatus === 529 || message.includes('overloaded')) {
      return NextResponse.json({ error: 'Claude е претоварен — пробвай пак след минута.' }, { status: 529 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
