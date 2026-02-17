import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

function repairTruncatedJson(text: string): string {
  text = text.replace(/,\s*"[^"]*$/, '');
  text = text.replace(/:\s*"[^"]*$/, ': ""');
  const opens: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') opens.push(ch);
    if (ch === '}' || ch === ']') opens.pop();
  }
  while (opens.length > 0) {
    const last = opens.pop();
    text += last === '{' ? '}' : ']';
  }
  return text;
}

// Bloom's Taxonomy level descriptions
const BLOOM_PROMPTS: Record<number, string> = {
  1: `Level 1 - REMEMBER (Запомняне): Focus on recall of facts, terms, and basic concepts.
     Use question types: definitions, lists, fill-in-the-blank.`,
  2: `Level 2 - UNDERSTAND (Разбиране): Focus on explaining ideas and concepts.
     Use question types: explain, describe, compare, summarize, interpret.`,
  3: `Level 3 - APPLY (Прилагане): Focus on using information in new situations.
     Use question types: case studies, problem-solving, calculations, procedures.`,
  4: `Level 4 - ANALYZE (Анализиране): Focus on drawing connections and relationships.
     Use question types: compare/contrast, cause-effect, differentiate, categorize.`,
  5: `Level 5 - EVALUATE (Оценяване): Focus on justifying decisions and judgments.
     Use question types: critique, justify, argue, defend, evaluate treatment options.`,
  6: `Level 6 - CREATE (Създаване): Focus on producing new or original work.
     Use question types: design treatment plans, propose solutions, develop protocols.`
};

// Subject type specific instructions
const SUBJECT_TYPE_PROMPTS: Record<string, string> = {
  preclinical: `PRECLINICAL SUBJECT - Focus on:
- Anatomical structures, locations, relationships
- Biochemical pathways, enzymes, reactions
- Physiological mechanisms and processes
- Histological features and cell types
- Theoretical foundations and scientific basis
Question style: Precise, factual, mechanism-based. Include diagrams/structure questions.`,

  clinical: `CLINICAL SUBJECT - Focus on:
- Patient presentation and symptoms
- Differential diagnosis
- Diagnostic workup and interpretation
- Treatment protocols and management
- Prognosis and complications
Question style: Case-based scenarios, clinical decision-making, patient management.`,

  hybrid: `HYBRID SUBJECT (Theory + Clinical Application) - Focus on:
- Pathophysiological mechanisms behind diseases
- Drug mechanisms of action and pharmacokinetics
- How basic science translates to clinical findings
- Laboratory values and their significance
- Both mechanism AND clinical application
Question style: Mix of mechanistic questions and clinical scenarios showing application.`
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      apiKey,
      material,
      topicName,
      subjectName,
      subjectType, // 'preclinical' | 'clinical' | 'hybrid'
      examFormat,
      bloomLevel,
      mode, // 'assessment' | 'free_recall' | 'mid_order' | 'higher_order' | 'custom' | 'drill_weakness'
      questionCount, // Only used in custom mode
      matchExamFormat, // boolean - whether to match exam format
      model, // 'opus' | 'sonnet' | 'haiku' - user-selected model for cost control
      // Free recall specific
      userRecall,
      requestHint,
      hintContext,
      currentBloomLevel,
      // Mastery context for smarter quiz generation
      masteryContext,
      // Study techniques for recommendations
      studyTechniques,
      // Custom questions from instructor/exercises
      customQuestions,
      // Previous questions to avoid repetition
      previousQuestions
    } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Handle different modes
    if (mode === 'free_recall' && requestHint) {
      if (!material) return NextResponse.json({ error: 'Няма материал за тази тема' }, { status: 400 });
      return handleFreeRecallHint(anthropic, material, topicName, userRecall, hintContext);
    }

    if (mode === 'free_recall' && userRecall !== undefined && !requestHint) {
      if (!userRecall.trim()) {
        return NextResponse.json({ error: 'Напиши нещо преди да оцениш' }, { status: 400 });
      }
      if (!material) return NextResponse.json({ error: 'Няма материал за тази тема' }, { status: 400 });
      return handleFreeRecallEvaluation(anthropic, material, topicName, subjectName, userRecall, studyTechniques, body.examSimulation);
    }

    if (mode === 'drill_weakness') {
      // Drill Weakness mode - rephrase wrong answers
      const { wrongAnswers } = body;
      return handleDrillWeakness(anthropic, material, topicName, subjectName, wrongAnswers, questionCount);
    }

    if (mode === 'evaluate_open') {
      // Evaluate an open answer against the correct answer
      const { userAnswer, correctAnswer, question, bloomLevel: qBloomLevel } = body;
      return handleEvaluateOpen(anthropic, question, userAnswer, correctAnswer, qBloomLevel || 3);
    }

    if (mode === 're_evaluate_open') {
      // Re-evaluate with student feedback about the evaluation
      const { userAnswer, correctAnswer, question, bloomLevel: qBloomLevel, previousEvaluation, studentFeedback } = body;
      return handleReEvaluateOpen(anthropic, question, userAnswer, correctAnswer, qBloomLevel || 3, previousEvaluation, studentFeedback);
    }

    if (mode === 'analyze_mistakes') {
      // Analyze wrong answers pattern and provide study recommendations
      const { mistakes, topicName: topic, subjectName: subject, selfReflection, errorTypes } = body;
      return handleAnalyzeMistakes(anthropic, mistakes, topic, subject, studyTechniques, selfReflection, errorTypes);
    }

    if (mode === 'open_hint') {
      // Generate structural hint for open questions (what to include, not the answer)
      const { question, bloomLevel: qBloomLevel, concept } = body;
      return handleOpenHint(anthropic, question, qBloomLevel || 3, concept);
    }


    if (mode === 'exam_prep_diagnostic') {
      const { topics, subjectName: subjName } = body;
      return handleExamPrepDiagnostic(anthropic, topics, subjName || subjectName);
    }

    if (mode === 'exam_prep_evaluate') {
      const { answers } = body;
      return handleExamPrepEvaluate(anthropic, answers);
    }

    if (mode === 'exam_prep_followup_eval') {
      const { followUps } = body;
      return handleExamPrepFollowUpEval(anthropic, followUps);
    }

    if (mode === 'enrich_custom_questions') {
      const { questions, topicName: tName, subjectName: sName, material: mat } = body;
      return handleEnrichCustomQuestions(anthropic, questions, tName || topicName, sName || subjectName, mat || material || '');
    }

    if (mode === 'analyze_overlap') {
      const { materialA, materialB, topicNameA, topicNameB, subjectNameA, subjectNameB } = body;
      return handleAnalyzeOverlap(anthropic, materialA, materialB, topicNameA, topicNameB, subjectNameA, subjectNameB);
    }

    if (mode === 'specimen_quiz') {
      const { specimens } = body;
      return handleSpecimenQuiz(anthropic, specimens || [], topicName, subjectName, material || '');
    }

    // Standard quiz generation (assessment, mid_order, higher_order, custom)
    // material can be empty — generates from general medical knowledge
    return handleStandardQuiz(anthropic, {
      material: material || '',
      topicName,
      subjectName,
      subjectType,
      examFormat,
      bloomLevel,
      mode,
      questionCount,
      currentBloomLevel,
      matchExamFormat,
      model,
      masteryContext,
      customQuestions,
      overlapContext: body.overlapContext,
      specimens: body.specimens,
      previousQuestions
    });

  } catch (error: unknown) {
    console.error('Quiz generation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ' }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleFreeRecallHint(
  anthropic: Anthropic,
  material: string,
  topicName: string,
  userRecall: string,
  hintContext: string
) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are a study assistant helping a Bulgarian medical student recall information.

Topic: ${topicName}

The student is trying to recall information about this topic. Here's what they've written so far:
"""
${userRecall || '(nothing yet)'}
"""

${hintContext ? `They're stuck on: "${hintContext}"` : 'They need a general hint to continue.'}

Study Material (for reference - DO NOT reveal directly):
"""
${material.substring(0, 2000)}...
"""

Give a SHORT, SUBTLE hint in Bulgarian that helps them remember WITHOUT giving away the answer directly.
The hint should:
- Be a leading question or association
- Trigger their memory without being too obvious
- Be 1-2 sentences maximum

Respond ONLY with the hint in Bulgarian, no other text.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  const hint = textContent?.type === 'text' ? textContent.text.trim() : '';

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    hint,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

async function handleFreeRecallEvaluation(
  anthropic: Anthropic,
  material: string,
  topicName: string,
  subjectName: string,
  userRecall: string,
  studyTechniques?: Array<{ name: string; slug: string; howToApply: string }> | null,
  examSimulation?: boolean
) {
  const followUpField = examSimulation ? `,
  "followUpQuestions": [
    {"question": "<follow-up въпрос базиран на пропуснато>", "correctAnswer": "<верен отговор 2-3 изречения>"}
  ]` : '';

  const followUpInstruction = examSimulation ? `
IMPORTANT: Generate exactly 2-3 follow-up questions in "followUpQuestions" that a professor would ask based on what the student MISSED or explained poorly. Questions should dig deeper into the missing concepts. Questions in Bulgarian.` : '';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: examSimulation ? 6144 : 4096,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator evaluating a Bulgarian medical student's free recall.${examSimulation ? ' This is an EXAM SIMULATION - you are playing the role of an examining professor.' : ''}

Subject: ${subjectName}
Topic: ${topicName}

Complete Study Material:
"""
${material}
"""

Student's Free Recall:
"""
${userRecall}
"""

Evaluate the student's recall and provide a detailed analysis in Bulgarian.

Return ONLY a valid JSON object with this structure:
{
  "score": <0-100 percentage of material covered>,
  "grade": <2-6 Bulgarian grade>,
  "bloomLevel": <1-6 demonstrated cognitive level>,
  "covered": [
    {"concept": "concept name", "accuracy": "correct|partial|incorrect", "detail": "brief feedback"}
  ],
  "missing": [
    {"concept": "important concept they missed", "importance": "critical|important|nice_to_know"}
  ],
  "feedback": "Overall feedback in Bulgarian - what they did well and what to focus on",
  "suggestedNextStep": "specific recommendation for what to study next"${studyTechniques && studyTechniques.length > 0 ? `,
  "suggestedTechnique": "КОНКРЕТНА учебна техника от списъка по-долу, подходяща за подобрение"` : ''}${followUpField}
}
${followUpInstruction}
${studyTechniques && studyTechniques.length > 0 ? `
Студентът практикува тези учебни техники: ${studyTechniques.map(t => t.name).join(', ')}
В "suggestedTechnique" ЗАДЪЛЖИТЕЛНО препоръчай конкретна техника, базирана на представянето:
- Ако пропуска много → "Chunking" или "Non-linear Note-taking"
- Ако знае факти но не връзки → "Modified Inquiry-Based Learning"
- Ако recall е слаб → "Spacing" или "Priming"
` : ''}
Be encouraging but honest. Focus on medical accuracy.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  if (response.stop_reason === 'max_tokens') {
    responseText = repairTruncatedJson(responseText);
  }

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse evaluation', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    evaluation,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

interface WrongAnswerInput {
  question: string;
  userAnswer: string | null;
  correctAnswer: string;
  concept: string;
  bloomLevel: number;
}

async function handleDrillWeakness(
  anthropic: Anthropic,
  material: string,
  topicName: string,
  subjectName: string,
  wrongAnswers: WrongAnswerInput[] | null,
  questionCount: number | null
) {
  if (!wrongAnswers || wrongAnswers.length === 0) {
    return NextResponse.json({ error: 'Няма грешни въпроси за drill' }, { status: 400 });
  }

  const targetCount = questionCount || Math.min(wrongAnswers.length, 10);

  // Format wrong answers for the prompt
  const wrongAnswersText = wrongAnswers.slice(0, 15).map((wa, i) => `
${i + 1}. Оригинален въпрос: "${wa.question}"
   Грешен отговор на студента: "${wa.userAnswer || 'Без отговор'}"
   Верен отговор: "${wa.correctAnswer}"
   Концепция: ${wa.concept}
   Bloom ниво: ${wa.bloomLevel}
`).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 6144,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator creating REPHRASED questions for a Bulgarian medical student.

The student previously answered these questions INCORRECTLY. Your task is to create NEW questions that test the SAME concepts but are phrased DIFFERENTLY.

Subject: ${subjectName}
Topic: ${topicName}

Study Material (for reference):
"""
${material?.substring(0, 3000) || 'No material provided'}
"""

WRONG ANSWERS TO DRILL:
${wrongAnswersText}

Generate EXACTLY ${targetCount} NEW questions that:
1. Test the SAME concepts as the wrong answers above
2. Are phrased COMPLETELY DIFFERENTLY (different wording, different angle)
3. Help the student understand WHY they got it wrong
4. Mix question types: prefer "open" (60%) and "case_study" (30%), few "multiple_choice" (10%)
5. Include helpful explanations that address common misconceptions

IMPORTANT:
- Do NOT copy the original questions - REPHRASE them completely
- Ask from a different angle or perspective
- Make the student THINK about the concept, not just memorize

Return ONLY a valid JSON array:
[
  {
    "type": "multiple_choice" | "open" | "case_study",
    "question": "Rephrased question in Bulgarian",
    "options": ["A", "B", "C", "D"], // only for multiple_choice/case_study
    "correctAnswer": "correct answer",
    "explanation": "explanation addressing WHY students often get this wrong",
    "bloomLevel": 1-6,
    "concept": "the concept being tested",
    "originalQuestion": "brief reference to what original question this drills"
  }
]

Questions must be in Bulgarian.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let questions;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    questions = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    if (!Array.isArray(questions)) throw new Error('Not an array');
  } catch {
    return NextResponse.json({ error: 'Failed to generate drill questions', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    questions,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

async function handleEvaluateOpen(
  anthropic: Anthropic,
  question: string,
  userAnswer: string,
  correctAnswer: string,
  bloomLevel: number
) {
  if (!userAnswer || !userAnswer.trim()) {
    return NextResponse.json({
      evaluation: {
        score: 0,
        isCorrect: false,
        feedback: 'Не е даден отговор.',
        keyPointsMissed: [],
        keyPointsCovered: []
      },
      usage: { inputTokens: 0, outputTokens: 0, cost: 0 }
    });
  }

  // All evaluations use Opus for quality
  const modelId = 'claude-opus-4-6';

  // Count reference answer key points to calibrate expectations
  const refSentences = correctAnswer.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
  const refLength = correctAnswer.length;
  const isShortExpected = refSentences <= 3 || refLength < 300;

  // Determine strictness based on Bloom level
  const strictnessGuide = bloomLevel >= 5
    ? `Ниво на оценка: Bloom ${bloomLevel} (Evaluate/Create)
       - Търси критичен анализ и обосновка, не само факти
       - Оценявай спрямо ДЪЛБОЧИНАТА на reference отговора`
    : bloomLevel === 4
      ? `Ниво на оценка: Bloom 4 (Analyze)
         - Търси анализ на връзки и причинно-следствени зависимости
         - Оценявай спрямо ДЪЛБОЧИНАТА на reference отговора`
      : bloomLevel === 3
        ? `Ниво на оценка: Bloom 3 (Apply)
           - Търси правилно приложение на концепцията
           - Оценявай спрямо reference отговора`
        : `Ниво на оценка: Bloom ${bloomLevel} (Remember/Understand)
           - Проверявай основните факти и дефиниции
           - По-толерантен към формулировката`;

  const hasReference = correctAnswer && correctAnswer.trim().length > 0;

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Ти си справедлив медицински преподавател. Оцени отговора на студента.

ВЪПРОС: ${question}
${hasReference ? `
ПРАВИЛЕН ОТГОВОР (reference):
${correctAnswer}` : `
ЗАБЕЛЕЖКА: Няма предоставен reference отговор. Оцени САМО на базата на медицинските ти познания и коректността на отговора спрямо въпроса.`}

ОТГОВОР НА СТУДЕНТА:
${userAnswer}

${strictnessGuide}
${hasReference ? `
ВАЖНО - КАЛИБРИРАНЕ НА ОЦЕНКАТА:
${isShortExpected
  ? `Reference отговорът е КРАТЪК (${refSentences} изречения). Това означава, че се очаква кратък отговор. НЕ наказвай студента за кратък отговор когато reference-ът също е кратък!`
  : `Reference отговорът е подробен (${refSentences} изречения). Очаквай повече детайли от студента.`}` : ''}

КРИТЕРИИ ЗА ОЦЕНКА:
${hasReference ? `- Сравнявай СЪДЪРЖАТЕЛНО с reference отговора - покрива ли ключовите точки?
- Ако студентът покрива ОСНОВНИТЕ ключови точки от reference = 0.7+
- Ако студентът покрива ВСИЧКИ ключови точки = 0.85+
- Ако покрива всички точки + добавя разбиране = 0.95+` : `- Оцени дали отговорът е медицински КОРЕКТЕН спрямо въпроса
- Верен и пълен отговор = 0.85+
- Верен но непълен = 0.5-0.7
- Частично верен = 0.3-0.5`}
- Медицински ГРЕШКИ (неточни факти) = сериозно намаляване
- Правописни грешки и формулировка = НЕ наказвай
- Кратък но верен отговор е ПО-ДОБРЕ от дълъг грешен

Върни САМО валиден JSON:
{
  "score": <0.0-1.0 с точност 0.1>,
  "isCorrect": <true ако score >= 0.7>,
  "feedback": "<кратка обратна връзка на български - какво е добре и какво липсва>",
  "keyPointsCovered": ["<покрити ключови точки>"],
  "keyPointsMissed": ["<пропуснати ключови точки>"]
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    // Fallback - be lenient if parsing fails
    evaluation = {
      score: 0.5,
      isCorrect: false,
      feedback: 'Не успях да оценя отговора автоматично. Сравни с правилния отговор.',
      keyPointsCovered: [],
      keyPointsMissed: []
    };
  }

  // Cost calculation - all evaluations use Opus ($15/$75 per MTok)
  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    evaluation,
    model: 'opus',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// Re-evaluate an open answer considering student feedback about the previous evaluation
async function handleReEvaluateOpen(
  anthropic: Anthropic,
  question: string,
  userAnswer: string,
  correctAnswer: string,
  bloomLevel: number,
  previousEvaluation: { score: number; feedback: string; keyPointsCovered: string[]; keyPointsMissed: string[] },
  studentFeedback: string
) {
  const modelId = 'claude-opus-4-6';

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Ти си справедлив медицински преподавател. Преоцени отговора на студента, като вземеш предвид неговата обратна връзка.

ВЪПРОС: ${question}

ПРАВИЛЕН ОТГОВОР (reference):
${correctAnswer}

ОТГОВОР НА СТУДЕНТА:
${userAnswer}

ПРЕДИШНА ОЦЕНКА:
- Score: ${previousEvaluation.score}
- Feedback: ${previousEvaluation.feedback}
- Покрити точки: ${Array.isArray(previousEvaluation.keyPointsCovered) ? previousEvaluation.keyPointsCovered.join(', ') : String(previousEvaluation.keyPointsCovered || '')}
- Пропуснати точки: ${Array.isArray(previousEvaluation.keyPointsMissed) ? previousEvaluation.keyPointsMissed.join(', ') : String(previousEvaluation.keyPointsMissed || '')}

ОБРАТНА ВРЪЗКА ОТ СТУДЕНТА:
${studentFeedback}

ИНСТРУКЦИИ:
- Внимателно прочети обратната връзка на студента
- Ако студентът има ПРАВО (напр. въпросът пита за конкретна помпа, а ти наказваш за друга) — коригирай оценката НАГОРЕ
- Ако студентът ГРЕШИ — запази оценката и обясни ЗАЩО
- Бъди ЧЕСТЕН и СПРАВЕДЛИВ — оценявай САМО спрямо ОБХВАТА на въпроса
- Ако въпросът пита за конкретен механизъм/структура, НЕ наказвай за неспоменаване на други механизми/структури

Върни САМО валиден JSON:
{
  "score": <0.0-1.0>,
  "isCorrect": <true ако score >= 0.7>,
  "feedback": "<нова обратна връзка, обяснявайки какво е променено и защо>",
  "keyPointsCovered": ["<покрити ключови точки>"],
  "keyPointsMissed": ["<наистина пропуснати ключови точки спрямо ОБХВАТА на въпроса>"]
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    evaluation = {
      score: previousEvaluation.score,
      isCorrect: previousEvaluation.score >= 0.7,
      feedback: 'Не успях да преоценя. Запазена е предишната оценка.',
      keyPointsCovered: previousEvaluation.keyPointsCovered,
      keyPointsMissed: previousEvaluation.keyPointsMissed
    };
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    evaluation,
    model: 'opus',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// Enrich custom questions — classify Bloom level + generate answers using Haiku (cost-efficient)
async function handleEnrichCustomQuestions(
  anthropic: Anthropic,
  questions: Array<{ question: string; answer: string }>,
  topicName: string,
  subjectName: string,
  material: string
) {
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'Няма въпроси за обогатяване' }, { status: 400 });
  }

  const materialContext = material
    ? `\nМатериал на студента (използвай за контекст при отговорите):\n${material.substring(0, 8000)}`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Ти си медицински преподавател. Трябва да обогатиш тези въпроси на студент по "${topicName}" (предмет: ${subjectName}).

За ВСЕКИ въпрос:
1. Определи Bloom ниво (1-6): 1=Запомняне, 2=Разбиране, 3=Прилагане, 4=Анализ, 5=Оценка, 6=Създаване
2. Напиши подробен отговор (2-4 изречения, на български)
3. Напиши кратко обяснение защо е важно (1-2 изречения)
${materialContext}

Въпроси:
${questions.map((q, i) => `${i + 1}. ${q.question}${q.answer ? `\n   Отговор на студента: ${q.answer}` : ''}`).join('\n')}

Върни САМО валиден JSON масив:
[
  {
    "index": 0,
    "bloomLevel": 1-6,
    "enrichedAnswer": "подробен отговор на български",
    "explanation": "защо е важно / клинична значимост"
  }
]

ВАЖНО: index започва от 0, трябва да има запис за ВСЕКИ въпрос.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let enrichments;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    enrichments = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    if (!Array.isArray(enrichments)) throw new Error('Not an array');
  } catch {
    return NextResponse.json({ error: 'Failed to parse enrichment response', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  // Sonnet 4.6 pricing: $3/$15 per MTok
  const cost = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1000000;

  return NextResponse.json({
    enrichments,
    model: 'sonnet',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// Model mapping - Opus for all quiz modes (quality is priority)
const MODEL_MAP: Record<string, { id: string; inputCost: number; outputCost: number }> = {
  opus: { id: 'claude-opus-4-6', inputCost: 15, outputCost: 75 },
  sonnet: { id: 'claude-opus-4-6', inputCost: 15, outputCost: 75 },
  haiku: { id: 'claude-opus-4-6', inputCost: 15, outputCost: 75 }
};

async function handleStandardQuiz(
  anthropic: Anthropic,
  params: {
    material: string;
    topicName: string;
    subjectName: string;
    subjectType?: string;
    examFormat: string | null;
    bloomLevel: number | null;
    mode: string;
    questionCount: number | null;
    currentBloomLevel: number;
    matchExamFormat?: boolean;
    model?: 'opus' | 'sonnet' | 'haiku';
    masteryContext?: {
      topicStatus: string;
      bloomLevel: number;
      avgGrade: number | null;
      quizCount: number;
      readCount: number;
      lastReview: string | null;
      recentQuizzes: Array<{ date: string; score: number; bloomLevel: number }>;
      masteredConcepts: string[];
      weakConcepts: Array<{ concept: string; drillCount: number }>;
    };
    customQuestions?: Array<{ question: string; answer: string }>;
    overlapContext?: {
      sharedConcepts: string[];
      uniqueConcepts: string[];
      overlapPercent: number;
      linkedTopicName: string;
    };
    specimens?: string[];
    previousQuestions?: string[];
  }
) {
  const { material, topicName, subjectName, subjectType, examFormat, bloomLevel, mode, questionCount, matchExamFormat, model = 'sonnet', masteryContext, customQuestions, overlapContext, specimens, previousQuestions } = params;

  // Get selected model config
  const modelConfig = MODEL_MAP[model] || MODEL_MAP.sonnet;

  // Get subject type specific instructions
  const subjectTypeInstructions = subjectType && SUBJECT_TYPE_PROMPTS[subjectType]
    ? `\n${SUBJECT_TYPE_PROMPTS[subjectType]}`
    : '';

  // ALWAYS use the user-specified question count if provided
  // This ensures the preview screen's count is respected
  let targetQuestionCount: string;
  if (questionCount && questionCount > 0) {
    // User specified exact count - MUST generate this many
    targetQuestionCount = `EXACTLY ${questionCount} questions. This is a STRICT requirement - generate precisely ${questionCount} questions, no more, no less. The user explicitly requested this count.`;
  } else {
    // AI decides based on material - NO FIXED LIMITS
    targetQuestionCount = `an appropriate number based on the material's complexity, depth, and how many distinct concepts need testing.
    Consider: topic breadth, number of sub-concepts, clinical relevance.
    Aim for comprehensive coverage - could be 5 for simple topics or 20+ for complex ones.`;
  }

  // Build exam format instructions - only if checkbox is checked
  const examFormatInstructions = matchExamFormat && examFormat
    ? `\nEXAM FORMAT: "${examFormat}" - You MUST adapt question types to match this exam format exactly.`
    : '';

  // Build Bloom instructions based on mode
  let bloomInstructions = '';
  if (mode === 'assessment') {
    bloomInstructions = `
ASSESSMENT MODE: Generate questions spanning ALL 6 Bloom's Taxonomy levels to assess the student's true level.
Include questions from each level (1-6), with more questions for harder levels.
AI decides the total number based on topic complexity - NO FIXED COUNT.
Mark each question with its bloomLevel (1-6).`;
  } else if (mode === 'lower_order') {
    bloomInstructions = `
LOWER-ORDER THINKING MODE: Focus on Bloom's Taxonomy levels 1 and 2.
${BLOOM_PROMPTS[1]}
${BLOOM_PROMPTS[2]}
Generate questions that test RECALL of facts and UNDERSTANDING of concepts.
These are foundational questions - definitions, explanations, comparisons, summaries.
Ideal for initial learning or reviewing basics before an exam.
Mark each question with its bloomLevel (1 or 2).`;
  } else if (mode === 'mid_order') {
    bloomInstructions = `
MID-ORDER THINKING MODE: Focus on Bloom's Taxonomy levels 3 and 4.
${BLOOM_PROMPTS[3]}
${BLOOM_PROMPTS[4]}
Generate questions that require APPLYING knowledge to new situations and ANALYZING relationships.
Mark each question with its bloomLevel (3 or 4).`;
  } else if (mode === 'higher_order') {
    bloomInstructions = `
HIGHER-ORDER THINKING MODE: Focus on Bloom's Taxonomy levels 5 and 6.
${BLOOM_PROMPTS[5]}
${BLOOM_PROMPTS[6]}
Generate challenging questions that require EVALUATING and CREATING.
These are the hardest types - clinical judgment, treatment planning, critiquing approaches.
Mark each question with its bloomLevel (5 or 6).

CRITICAL REQUIREMENT FOR HIGHER-ORDER QUESTIONS:
- Use ONLY "open" type questions (90%+) - NO multiple choice for evaluation/creation!
- For correctAnswer: Provide DETAILED model answers of 5-8 sentences minimum
- Questions should require: critical analysis, comparing approaches, designing protocols, justifying decisions
- Include questions like: "Защо би избрал X вместо Y?", "Критикувай този подход", "Предложи алтернативен план"
- Each answer should demonstrate synthesis of multiple concepts`;
  } else if (bloomLevel && BLOOM_PROMPTS[bloomLevel]) {
    bloomInstructions = `\nBLOOM'S TAXONOMY LEVEL:\n${BLOOM_PROMPTS[bloomLevel]}`;
  }

  // Build mastery context instructions for smarter quiz generation
  let masteryInstructions = '';
  if (masteryContext) {
    const { topicStatus, bloomLevel: masteryBloom, avgGrade, quizCount, recentQuizzes, masteredConcepts, weakConcepts } = masteryContext;

    // Determine quiz trend from recent scores
    let trend = 'stable';
    if (recentQuizzes.length >= 2) {
      const recent = recentQuizzes.slice(-3);
      const avgRecent = recent.reduce((s, q) => s + q.score, 0) / recent.length;
      const older = recentQuizzes.slice(0, -3);
      if (older.length > 0) {
        const avgOlder = older.reduce((s, q) => s + q.score, 0) / older.length;
        if (avgRecent > avgOlder + 5) trend = 'improving';
        else if (avgRecent < avgOlder - 5) trend = 'declining';
      }
    }

    masteryInstructions = `
STUDENT MASTERY CONTEXT (use this to generate smarter, more targeted questions):
- Topic status: ${topicStatus} | Bloom level: ${masteryBloom}/6 | Avg grade: ${avgGrade !== null ? `${avgGrade}/6` : 'no quizzes yet'} | Total quizzes: ${quizCount}
- Performance trend: ${trend}${recentQuizzes.length > 0 ? ` (last ${recentQuizzes.length} quizzes: ${recentQuizzes.map(q => `${q.score}%`).join(', ')})` : ''}
${masteredConcepts.length > 0 ? `- MASTERED concepts (student already drilled 3+ times, AVOID unless testing at HIGHER Bloom levels): ${masteredConcepts.join(', ')}` : ''}
${weakConcepts.length > 0 ? `- WEAK concepts (PRIORITIZE these, student struggles with them): ${weakConcepts.map(wc => `${wc.concept} (drilled ${wc.drillCount}x)`).join(', ')}` : ''}

ADAPTIVE INSTRUCTIONS:
${topicStatus === 'gray' || topicStatus === 'orange' ? '- Student is still LEARNING this topic. Focus on foundational concepts, definitions, and basic understanding. Be encouraging.' : ''}
${topicStatus === 'green' ? '- Student has GOOD mastery. Focus on edge cases, integration with other concepts, and higher-order thinking.' : ''}
${weakConcepts.length > 0 ? '- At least 40-50% of questions should target the WEAK concepts listed above.' : ''}
${masteredConcepts.length > 0 ? '- Do NOT repeat basic questions about mastered concepts. If you must include them, test at a HIGHER Bloom level than before.' : ''}
${trend === 'declining' ? '- Student performance is DECLINING. Include some easier questions to rebuild confidence, then gradually increase difficulty.' : ''}
${trend === 'improving' ? '- Student is IMPROVING. Challenge them with slightly harder questions than their current level.' : ''}`;
  }

  // Determine material mode
  const hasMaterial = material && material.trim().length > 0;

  const materialSection = hasMaterial
    ? `Study Material (PROVIDED BY STUDENT):
"""
${material.length > 12000 ? material.substring(0, 12000) + '\n[... материалът е съкратен поради дължина]' : material}
"""

CRITICAL RULE — STRICT MATERIAL MODE:
You MUST generate questions ONLY from the study material above. Do NOT add questions from your own medical knowledge.
Every question must be directly answerable from the provided text. If the material is short, generate fewer but precise questions rather than inventing content.
If a concept is mentioned but not explained in the material, you may ask about it at Bloom level 1-2 only (recall/understand).`
    : `GENERAL KNOWLEDGE MODE:
No study material was provided. Generate questions based on standard medical curriculum knowledge for this topic.
The student is a Bulgarian medical student testing their general knowledge of "${topicName}" (subject: ${subjectName}).
Use established medical textbook knowledge. Focus on core concepts, key mechanisms, clinical relevance.
Questions should be appropriate for a university-level medical education exam.`;

  // Overlap context — when linked topics exist, focus on unique content
  const overlapSection = overlapContext && overlapContext.uniqueConcepts.length > 0
    ? `\n\nOVERLAP CONTEXT — FOCUS ON UNIQUE CONTENT:
This topic overlaps ${overlapContext.overlapPercent}% with "${overlapContext.linkedTopicName}".
The student has already studied the shared concepts. Focus your questions PRIMARILY on the unique concepts below:
UNIQUE to this topic: ${overlapContext.uniqueConcepts.join(', ')}
Shared (student already knows): ${overlapContext.sharedConcepts.slice(0, 10).join(', ')}
Generate mostly questions about the UNIQUE concepts. You may include 1-2 questions about shared concepts for reinforcement.`
    : '';

  // Custom questions added by the student
  const customQuestionsSection = customQuestions && customQuestions.length > 0
    ? `\n\nCUSTOM QUESTIONS (added by student — MUST BE INCLUDED):
The student has added these questions manually. You MUST include them in the quiz (rephrase slightly if needed, but keep the core question intact). If an answer is provided, use it as the correct answer basis.
${customQuestions.map((q, i) => `${i + 1}. Q: ${q.question}${q.answer ? `\n   A: ${q.answer}` : ''}`).join('\n')}`
    : '';

  // Pathology specimens — include at least 1 specimen identification question (always open type)
  const specimensSection = specimens && specimens.length > 0
    ? `\n\nПРЕПАРАТИ (темата включва тези патологични препарати):
Препарати: ${specimens.join(', ')}
Включи поне 1 въпрос тип "open" за идентификация на препарат — опиши микроскопски находки (при конкретно увеличение: 4x, 10x или 40x) и попитай кой е препаратът. ВАЖНО: НЕ споменавай името на органа или диагнозата в описанието — описвай само морфология!`
    : '';

  // Previous questions — avoid repetition and prioritize uncovered material
  const previousQuestionsSection = previousQuestions && previousQuestions.length > 0
    ? `\n\nPREVIOUS QUESTIONS (student has already seen these — DO NOT REPEAT):
The student has answered ${previousQuestions.length} questions on this topic before. Generate NEW, DIFFERENT questions that:
1. Cover DIFFERENT aspects/concepts from the material than the ones below
2. Ask about the SAME concept from a DIFFERENT angle or Bloom level if needed
3. NEVER copy or closely paraphrase any question below

Previously asked questions:
${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

PRIORITY: Focus on parts of the material NOT covered by the questions above. If all major concepts are covered, ask at HIGHER Bloom levels or test deeper understanding.`
    : '';

  const response = await anthropic.messages.create({
    model: modelConfig.id,
    max_tokens: 12000,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator creating a quiz for a Bulgarian medical student.

Subject: ${subjectName}
Topic: ${topicName}
${subjectTypeInstructions}
${examFormatInstructions}
${bloomInstructions}
${masteryInstructions}

${materialSection}
${overlapSection}
${customQuestionsSection}
${specimensSection}
${previousQuestionsSection}

Generate ${targetQuestionCount}.

IMPORTANT QUESTION COUNT REQUIREMENT:
${questionCount ? `You MUST generate EXACTLY ${questionCount} questions. Count them carefully before responding. If you generate fewer or more, you have FAILED the task.` : hasMaterial ? 'Intelligently select the number based on material complexity.' : 'Intelligently select the number based on topic breadth and complexity.'}

Intelligently select:
- The most important concepts to test
- Questions that efficiently assess deep understanding

QUESTION TYPE DISTRIBUTION (ВАЖНО — 5 ТИПА!):
Use a DIVERSE mix of question types. The student benefits from varied testing formats:
- "open" (35-45%) — free text, tests deep understanding and RECALL (Bloom 3-6). За механизми, процеси, каскади ВИНАГИ използвай open — "Обясни механизма..." тества recall, не recognition!
- "short_answer" (15-20%) — кратък отговор, 1-3 sentences (Bloom 2-4)
- "fill_blank" (10-15%) — попълни липсващия термин/факт (Bloom 1-3)
- "multiple_choice" (15-20%) — 4 опции, фактологични въпроси (Bloom 1-3)
- "case_study" (10-15%) — клинични сценарии с опции (Bloom 4-6)

Return ONLY a valid JSON array. Each question object MUST match one of these schemas:

FOR "multiple_choice" and "case_study":
{ "type": "multiple_choice", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correctAnswer": "A) ...", "explanation": "...", "bloomLevel": 1-6, "concept": "..." }

FOR "open":
{ "type": "open", "question": "...", "correctAnswer": "примерен пълен отговор", "explanation": "...", "bloomLevel": 1-6, "concept": "..." }

FOR "short_answer":
{ "type": "short_answer", "question": "Кратък въпрос?", "correctAnswer": "кратък отговор (1-3 изречения)", "explanation": "...", "bloomLevel": 1-6, "concept": "..." }

FOR "fill_blank":
{ "type": "fill_blank", "question": "Текст с ____ на мястото на липсващия термин", "correctAnswer": "липсващият термин", "acceptableAnswers": ["алтернатива1", "алтернатива2"], "explanation": "...", "bloomLevel": 1-6, "concept": "..." }

IMPORTANT:
- Questions must be in Bulgarian
- Focus on clinically relevant concepts
- "fill_blank" question MUST contain exactly one ____ (4 underscores) for the blank
- "fill_blank" acceptableAnswers MUST include common spelling variants: with/without hyphens, spaces, dashes (e.g. if correctAnswer is "мастни киселини", add "мастни-киселини")
- For "open" questions, correctAnswer MUST MATCH the length the student sees:
  * Bloom 1-2: EXACTLY 2-3 sentences
  * Bloom 3-4: EXACTLY 3-5 sentences
  * Bloom 5-6: EXACTLY 5-8 sentences
- For "short_answer", correctAnswer should be 1-3 sentences max
- Explanations should be educational
- Return ONLY the JSON array
${questionCount ? `
FINAL VERIFICATION (CRITICAL):
Before responding, COUNT your questions. You MUST have EXACTLY ${questionCount} questions in your array.
If you have fewer than ${questionCount}, ADD more questions until you reach ${questionCount}.
If you have more than ${questionCount}, REMOVE questions until you have exactly ${questionCount}.
This is NON-NEGOTIABLE. The student requested ${questionCount} questions and MUST receive exactly ${questionCount}.` : ''}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Handle truncated JSON when response was cut off at token limit
  if (response.stop_reason === 'max_tokens') {
    responseText = repairTruncatedJson(responseText);
  }

  let questions;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    questions = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    if (!Array.isArray(questions)) throw new Error('Not an array');
  } catch {
    return NextResponse.json({ error: 'Failed to generate quiz', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  // Cost calculation using selected model's pricing (per MTok)
  const cost = (response.usage.input_tokens * modelConfig.inputCost + response.usage.output_tokens * modelConfig.outputCost) / 1000000;

  // Validate question count and generate warning if mismatch
  let countWarning: string | null = null;
  if (questionCount && questionCount > 0 && questions.length !== questionCount) {
    const diff = questionCount - questions.length;
    if (diff > 0) {
      countWarning = `Заявени: ${questionCount}, генерирани: ${questions.length}. AI генерира ${diff} по-малко въпроса - вероятно материалът не съдържа достатъчно различни концепции за ${questionCount} уникални въпроса.`;
    } else {
      countWarning = `Заявени: ${questionCount}, генерирани: ${questions.length}. AI генерира ${-diff} повече въпроса.`;
    }
  }

  return NextResponse.json({
    questions,
    countWarning,
    requestedCount: questionCount,
    actualCount: questions.length,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

interface MistakeForAnalysis {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  concept?: string;
  bloomLevel?: number;
}

async function handleAnalyzeMistakes(
  anthropic: Anthropic,
  mistakes: MistakeForAnalysis[],
  topicName: string,
  subjectName: string,
  studyTechniques?: Array<{ name: string; slug: string; howToApply: string }> | null,
  selfReflection?: string,
  errorTypes?: string[]
) {
  if (!mistakes || mistakes.length === 0) {
    return NextResponse.json({
      analysis: {
        summary: 'Няма грешки за анализ - отлично представяне!',
        weakConcepts: [],
        patterns: [],
        recommendations: [],
        priorityFocus: null
      },
      usage: { inputTokens: 0, outputTokens: 0, cost: 0 }
    });
  }

  const mistakesText = mistakes.map((m, i) => `
Грешка ${i + 1}:
- Въпрос: ${m.question}
- Твой отговор: ${m.userAnswer || '(празен)'}
- Правилен отговор: ${m.correctAnswer}
- Концепция: ${m.concept || 'Обща'}
- Bloom ниво: ${m.bloomLevel || 'N/A'}
`).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Ти си експерт по медицинско образование. Анализирай грешките на студент от тест по "${topicName}" (${subjectName}).

ГРЕШКИ:
${mistakesText}
${selfReflection ? `
САМООЦЕНКА НА СТУДЕНТА:
"${selfReflection}"
${errorTypes && errorTypes.length > 0 ? `Типове грешки (self-identified): ${errorTypes.join(', ')}` : ''}

ВАЖНО: Студентът вече е помислил за грешките си. В анализа:
- Ако самооценката е ТОЧНА — потвърди и допълни с конкретни стъпки
- Ако студентът ПРОПУСКА важен проблем — посочи го деликатно
- Ако самооценката е ГРЕШНА — коригирай учтиво и обясни защо
- Дай КРЕДИТ за правилната саморефлексия — това е ценно умение
` : ''}
Анализирай pattern-ите в грешките и дай КОНКРЕТНИ, ДЕЙСТВАЩИ съвети.

Отговори САМО с валиден JSON (без markdown, без \`\`\`, без текст преди/след JSON):
{
  "summary": "Кратко обобщение на проблемните области (1-2 изречения)",
  "weakConcepts": ["концепция1", "концепция2"],
  "patterns": [
    {
      "type": "pattern_type",
      "description": "Описание на грешката",
      "frequency": "честота"
    }
  ],
  "recommendations": [
    {
      "priority": "high/medium/low",
      "action": "Конкретно действие за подобрение",
      "reason": "Защо това ще помогне"
    }
  ],
  "priorityFocus": "Най-критичната област за незабавен фокус"
}

Pattern types: "conceptual_gap" (не разбира концепция), "detail_miss" (пропуска детайли), "confusion" (бърка подобни неща), "application_error" (не може да приложи), "recall_failure" (не помни)
${studyTechniques && studyTechniques.length > 0 ? `
УЧЕБНИ ТЕХНИКИ (IcanStudy):
Студентът практикува: ${studyTechniques.map(t => t.name).join(', ')}
В "recommendations" ЗАДЪЛЖИТЕЛНО включи поне 1 препоръка за КОНКРЕТНА техника, базирана на типа грешки:
- conceptual_gap → "Chunking" (групиране на концепции) или "Non-linear Note-taking" (mind map)
- detail_miss → "Rote-Memorisation Management" (разграничи какво трябва да се наизусти)
- confusion → "Interleaving" (смесване на подобни теми за разграничаване)
- application_error → "Modified Inquiry-Based Learning" (задавай "защо/как" въпроси)
- recall_failure → "Spacing" (по-чести кратки повторения) или "Priming" (бегъл преглед преди учене)
` : ''}
ВАЖНО: Бъди КОНКРЕТЕН - използвай имената на концепциите от грешките, не общи съвети! Отговори САМО с JSON.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  // Clean up markdown code blocks and other formatting
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Remove any text before the first { and after the last }
  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    responseText = responseText.substring(firstBrace, lastBrace + 1);
  }
  // Fix common JSON issues
  responseText = responseText
    .replace(/,\s*}/g, '}')  // Remove trailing commas before }
    .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
    .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\t' || ch === '\r' ? ch : ' '); // Remove control chars but keep newlines/tabs

  // Handle truncated JSON (if response was cut off)
  if (response.stop_reason === 'max_tokens') {
    // Try to close open JSON structures
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (const ch of responseText) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;
    }
    // If we're inside a string, close it
    if (inString) responseText += '"';
    // Close any open arrays/brackets
    // Trim trailing partial values (after last comma)
    responseText = responseText.replace(/,\s*"[^"]*$/, '');
    responseText = responseText.replace(/,\s*$/, '');
    // Re-count depth after trimming
    depth = 0; inString = false; escaped = false;
    for (const ch of responseText) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;
    }
    while (depth > 0) {
      // Check what needs closing — find last opener
      const lastOpen = Math.max(responseText.lastIndexOf('{'), responseText.lastIndexOf('['));
      const lastClose = Math.max(responseText.lastIndexOf('}'), responseText.lastIndexOf(']'));
      if (lastOpen > lastClose) {
        responseText += responseText[lastOpen] === '{' ? '}' : ']';
      } else {
        responseText += '}';
      }
      depth--;
    }
  }

  let analysis;
  try {
    // Extract JSON object from response (handles markdown wrapping, explanatory text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    // Validate required fields exist
    if (!analysis.summary || !analysis.weakConcepts) {
      throw new Error('Missing required fields');
    }
  } catch (parseError) {
    console.error('JSON parse error in analyze_mistakes:', parseError);
    console.error('Raw response (first 500 chars):', responseText.substring(0, 500));
    // Build a more helpful fallback using the raw response
    const extractedConcepts = mistakes.map(m => m.concept || 'Обща концепция').filter((v, i, a) => a.indexOf(v) === i);
    analysis = {
      summary: 'AI анализът не можа да се парсне. Основни проблемни области: ' + extractedConcepts.slice(0, 3).join(', '),
      weakConcepts: extractedConcepts,
      patterns: [{
        type: 'review_needed',
        description: 'Прегледай грешките ръчно за по-добро разбиране',
        frequency: 'N/A'
      }],
      recommendations: [
        { priority: 'high', action: 'Прегледай отделните грешки по-горе', reason: 'Всяка грешка показва конкретен пропуск' },
        { priority: 'medium', action: 'Фокусирай се върху: ' + extractedConcepts[0], reason: 'Тази концепция се среща в грешките' }
      ],
      priorityFocus: extractedConcepts[0] || 'Преговор на материала'
    };
  }


  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    analysis,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}


async function handleOpenHint(
  anthropic: Anthropic,
  question: string,
  bloomLevel: number,
  concept?: string
) {
  const bloomGuidance: Record<number, string> = {
    1: 'Кажи какви ФАКТИ трябва да включи (определения, термини)',
    2: 'Кажи какви КОНЦЕПЦИИ трябва да обясни (връзки, значения)',
    3: 'Кажи какво ПРИЛОЖЕНИЕ да покаже (стъпки, процедури)',
    4: 'Кажи какъв АНАЛИЗ да направи (сравнения, причинно-следствени връзки)',
    5: 'Кажи какво да ОЦЕНИ/КРИТИКУВА (аргументи за/против, съждения)',
    6: 'Кажи какво да СЪЗДАДЕ/ПРЕДЛОЖИ (нов план, протокол, решение)'
  };

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Ти си помощник на студент по медицина. Студентът вижда този отворен въпрос и иска НАСОКА какво да включи в отговора, БЕЗ да му даваш самия отговор.

ВЪПРОС: ${question}
${concept ? `КОНЦЕПЦИЯ: ${concept}` : ''}
BLOOM НИВО: ${bloomLevel} - ${bloomGuidance[bloomLevel] || bloomGuidance[3]}

Дай СТРУКТУРНА НАСОКА (не отговор!):
- Какви АСПЕКТИ да покрие? (3-5 точки)
- Как да СТРУКТУРИРА отговора?
- Какво НЕ трябва да пропуска?

ВАЖНО:
- НЕ давай самия отговор!
- НЕ давай конкретни факти/дефиниции
- Само ОРИЕНТИРАЙ какво да включи
- Отговори на български
- Бъди кратък (макс 4-5 реда)

Формат:
"Включи: [аспект1], [аспект2], [аспект3]
Структура: [препоръка]
Не забравяй: [важен елемент]"`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  const hint = textContent?.type === 'text' ? textContent.text.trim() : '';

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    hint,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// --- Exam Prep Handlers ---

interface ExamPrepTopic {
  topicId: string;
  topicName: string;
  material: string;
  bloomLevel?: number;
}

async function handleExamPrepDiagnostic(
  anthropic: Anthropic,
  topics: ExamPrepTopic[],
  subjectName: string
) {
  if (!topics || topics.length === 0) {
    return NextResponse.json({ error: 'Няма теми за диагностика' }, { status: 400 });
  }

  const topicList = topics.map((t, i) => {
    const mat = (t.material || '').substring(0, 2000);
    return `--- ТЕМА ${i + 1}: ${t.topicName} (ID: ${t.topicId}) ---
Bloom ниво: ${t.bloomLevel || 2}
Материал:
${mat}${(t.material || '').length > 2000 ? '\n[... съкратено]' : ''}`;
  }).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Ти си медицински преподавател. Генерирай диагностични въпроси за изпитна подготовка.

Предмет: ${subjectName}
Брой теми: ${topics.length}

${topicList}

ЗАДАЧА: За ВСЯКА тема генерирай 2-3 отворени въпроса които тестват разбирането на студента.
- Въпросите трябва да покриват КЛЮЧОВИТЕ концепции от материала
- Bloom ниво: подходящо за темата (1-2 за дефиниции, 3-4 за приложение, 5-6 за анализ)
- correctAnswer: примерен верен отговор (2-4 изречения, колкото се очаква от студента)
- Въпроси на БЪЛГАРСКИ

Върни САМО валиден JSON:
{
  "topicQuestions": [
    {
      "topicId": "<ID на темата>",
      "topicName": "<име на темата>",
      "questions": [
        {
          "question": "<въпрос на български>",
          "correctAnswer": "<примерен верен отговор 2-4 изречения>",
          "bloomLevel": <1-6>,
          "concept": "<тествана концепция>"
        }
      ]
    }
  ]
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  if (response.stop_reason === 'max_tokens') {
    responseText = repairTruncatedJson(responseText);
  }

  let result;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse diagnostic questions', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    ...result,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

interface ExamPrepAnswer {
  topicId: string;
  topicName: string;
  question: string;
  correctAnswer: string;
  userAnswer: string;
  bloomLevel?: number;
}

async function handleExamPrepEvaluate(
  anthropic: Anthropic,
  answers: ExamPrepAnswer[]
) {
  if (!answers || answers.length === 0) {
    return NextResponse.json({ error: 'Няма отговори за оценка' }, { status: 400 });
  }

  const byTopic = new Map<string, ExamPrepAnswer[]>();
  for (const a of answers) {
    if (!byTopic.has(a.topicId)) byTopic.set(a.topicId, []);
    byTopic.get(a.topicId)!.push(a);
  }

  const answerList = Array.from(byTopic.entries()).map(([topicId, topicAnswers]) => {
    const topicName = topicAnswers[0].topicName;
    const qaPairs = topicAnswers.map((a, i) => `  В${i + 1}: ${a.question}
  Верен отговор: ${a.correctAnswer}
  Студент: ${a.userAnswer || '(без отговор)'}`).join('\n\n');

    return `--- ${topicName} (ID: ${topicId}) ---\n${qaPairs}`;
  }).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Ти си справедлив медицински преподавател. Оцени отговорите на студента по теми.

${answerList}

КРИТЕРИИ:
- Сравнявай СЪДЪРЖАТЕЛНО с верния отговор - покрива ли ключовите точки?
- Кратък но верен = добра оценка. Грешни факти = ниска оценка.
- Ако reference отговорът е кратък, НЕ наказвай за краткост.
- score е 0-100 (процент покритие на ключови точки + точност)

Върни САМО валиден JSON:
{
  "topicScores": [
    {
      "topicId": "<ID>",
      "topicName": "<име>",
      "score": <0-100>,
      "feedback": "<1-2 изречения обратна връзка>",
      "missing": ["<пропусната концепция 1>", "<пропусната концепция 2>"]
    }
  ]
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  if (response.stop_reason === 'max_tokens') {
    responseText = repairTruncatedJson(responseText);
  }

  let result;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse evaluation', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    ...result,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

async function handleExamPrepFollowUpEval(
  anthropic: Anthropic,
  followUps: Array<{ question: string; correctAnswer: string; userAnswer: string }>
) {
  if (!followUps || followUps.length === 0) {
    return NextResponse.json({ error: 'Няма follow-up отговори' }, { status: 400 });
  }

  const qaPairs = followUps.map((f, i) =>
    `В${i + 1}: ${f.question}\nВерен отговор: ${f.correctAnswer}\nСтудент: ${f.userAnswer || '(без отговор)'}`
  ).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Оцени follow-up отговорите на студента от устен изпит.

${qaPairs}

КРИТЕРИИ: Справедлива оценка. Сравни съдържателно с верния отговор. Кратък верен = добра оценка.

Върни САМО валиден JSON:
{
  "evaluations": [
    {
      "score": <0.0-1.0>,
      "isCorrect": <true ако score >= 0.7>,
      "feedback": "<кратка обратна връзка>"
    }
  ],
  "overallScore": <0.0-1.0 средна>,
  "summary": "<обобщена обратна връзка на български>"
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  if (response.stop_reason === 'max_tokens') {
    responseText = repairTruncatedJson(responseText);
  }

  let result;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse follow-up evaluation', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    ...result,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// Analyze overlap between two linked topics' materials
async function handleAnalyzeOverlap(
  anthropic: Anthropic,
  materialA: string,
  materialB: string,
  topicNameA: string,
  topicNameB: string,
  subjectNameA: string,
  subjectNameB: string
) {
  if (!materialA || !materialB) {
    return NextResponse.json({ error: 'И двете теми трябва да имат материал за анализ.' }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Анализирай припокриването между тези две теми от различни предмети.

## Тема А: "${topicNameA}" (${subjectNameA})
${materialA.substring(0, 6000)}

## Тема Б: "${topicNameB}" (${subjectNameB})
${materialB.substring(0, 6000)}

Анализирай подробно:
1. Кои концепции са ОБЩИ (припокриващи се)?
2. Кои концепции са УНИКАЛНИ за тема А?
3. Кои концепции са УНИКАЛНИ за тема Б?
4. Какъв процент от съдържанието се припокрива?

Върни САМО валиден JSON:
{
  "overlapPercent": <число 0-100>,
  "sharedConcepts": ["концепция 1", "концепция 2", ...],
  "uniqueToA": ["уникална за А 1", ...],
  "uniqueToB": ["уникална за Б 1", ...],
  "summary": "Кратко обяснение на припокриването на български"
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let result;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse overlap analysis', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const overlapCost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    overlapPercent: result.overlapPercent || 0,
    sharedConcepts: result.sharedConcepts || [],
    uniqueToA: result.uniqueToA || [],
    uniqueToB: result.uniqueToB || [],
    summary: result.summary || '',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(overlapCost * 1000000) / 1000000
    }
  });
}

async function handleSpecimenQuiz(
  anthropic: Anthropic,
  specimens: string[],
  topicName: string,
  subjectName: string,
  material: string
) {
  if (!specimens.length) {
    return NextResponse.json({ error: 'Няма добавени препарати' }, { status: 400 });
  }

  const materialContext = material
    ? `\nМатериал на студента (за контекст):\n${material.substring(0, 6000)}`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Ти си патологоанатом-преподавател. Създай quiz по микроскопски препарати за студент по "${topicName}" (${subjectName}).

НАЛИЧНИ ПРЕПАРАТИ: ${specimens.join(', ')}
${materialContext}

Генерирай въпроси (1-2 на препарат, максимум ${Math.min(specimens.length * 2, 20)} общо).

ВСИЧКИ ВЪПРОСИ СА type: "open" — НИКОГА не използвай multiple_choice за препарати!

ДВА ТИПА ВЪПРОСИ:

ТИП 1 — "Идентифицирай препарата" (describe→identify) — ОСНОВЕН ТИП (70-80% от въпросите):
- Опиши микроскопската картина на конкретно увеличение (4x, 10x или 40x)
- Включи: тъканна архитектура, клетъчен тип, оцветяване с H&E, характерни находки
- Започни с "При микроскопско изследване (увеличение Xx) се наблюдава..."
- Студентът трябва да НАПИШЕ кой препарат е (свободен текст, НЕ избор)
- correctAnswer = латинското име на препарата
- ⚠️ КРИТИЧНО: НЕ СПОМЕНАВАЙ в описанието името на органа, диагнозата, или думи които директно подсказват отговора!
  * ГРЕШНО: "сърдечна торбичка с фибринозни налепи по перикарда" → подсказва Pericarditis
  * ПРАВИЛНО: "серозна мембрана с дебели розово-белезникави нишковидни налепи по повърхността, подредени мрежовидно"
  * ГРЕШНО: "чернодробна тъкан с некроза" → подсказва хепатит
  * ПРАВИЛНО: "паренхимен орган с полигонални клетки, организирани в лобули, с огнищна коагулационна некроза"
- Описвай морфологично (какво ВИЖДАШ), не диагностично (какво Е)

ТИП 2 — "Опиши препарата" (identify→describe) — 20-30% от въпросите:
- Дай името на препарата
- Питай: "Какво очакваш да видиш на 10x увеличение?" или "Опиши характерните хистологични находки"
- correctAnswer = подробно описание на микроскопската картина (3-5 изречения)

ВАЖНО:
- Бъди клинично точен — описвай реални хистологични находки
- Споменавай специфични клетъчни типове, структури, оцветяване
- Разнообразявай увеличенията (4x за обзор, 10x за детайли, 40x за клетъчно ниво)
- Всеки отговор трябва да е достатъчно детайлен за fair оценяване
- НИКОГА не давай отговора в самия въпрос — описвай само морфология!

Върни JSON масив:
[{
  "question": "При микроскопско изследване (увеличение 10x) се наблюдава: серозна мембрана с дебели нишковидни еозинофилни налепи по повърхността. Кой е препаратът?",
  "type": "open",
  "correctAnswer": "Pericarditis fibrinosa",
  "explanation": "Характерни находки при фибринозен перикардит: ..."
}]`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  if (response.stop_reason === 'max_tokens') {
    responseText = repairTruncatedJson(responseText);
  }

  let questions;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    questions = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    if (!Array.isArray(questions)) throw new Error('Not an array');
  } catch {
    return NextResponse.json({ error: 'Failed to parse specimen questions', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 15 + response.usage.output_tokens * 75) / 1000000;

  return NextResponse.json({
    questions: questions.map((q: Record<string, unknown>) => ({
      question: q.question || '',
      type: 'open',
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation || '',
      options: [],
    })),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}
