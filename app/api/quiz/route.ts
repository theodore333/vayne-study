import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// Bloom's Taxonomy level descriptions
const BLOOM_PROMPTS: Record<number, string> = {
  1: `Level 1 - REMEMBER (Запомняне): Focus on recall of facts, terms, and basic concepts.
     Use question types: definitions, lists, matching, true/false, fill-in-the-blank.`,
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
      mode, // 'assessment' | 'free_recall' | 'gap_analysis' | 'mid_order' | 'higher_order' | 'custom'
      questionCount, // Only used in custom mode
      matchExamFormat, // boolean - whether to match exam format
      model, // 'opus' | 'sonnet' | 'haiku' - user-selected model for cost control
      // Free recall specific
      userRecall,
      requestHint,
      hintContext,
      // Gap analysis specific
      quizHistory,
      currentBloomLevel,
      // Mastery context for smarter quiz generation
      masteryContext,
      // Study techniques for recommendations
      studyTechniques
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
      return handleFreeRecallEvaluation(anthropic, material, topicName, subjectName, userRecall, studyTechniques);
    }

    if (mode === 'gap_analysis') {
      // Gap Analysis mode - now includes wrongAnswers for smarter analysis
      const { wrongAnswers } = body;
      return handleGapAnalysis(anthropic, material, topicName, subjectName, examFormat, quizHistory, currentBloomLevel, wrongAnswers);
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

    if (mode === 'analyze_mistakes') {
      // Analyze wrong answers pattern and provide study recommendations
      const { mistakes, topicName: topic, subjectName: subject } = body;
      return handleAnalyzeMistakes(anthropic, mistakes, topic, subject, studyTechniques);
    }

    if (mode === 'open_hint') {
      // Generate structural hint for open questions (what to include, not the answer)
      const { question, bloomLevel: qBloomLevel, concept } = body;
      return handleOpenHint(anthropic, question, qBloomLevel || 3, concept);
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
      masteryContext
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
  studyTechniques?: Array<{ name: string; slug: string; howToApply: string }> | null
) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator evaluating a Bulgarian medical student's free recall.

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
  "suggestedTechnique": "КОНКРЕТНА учебна техника от списъка по-долу, подходяща за подобрение"` : ''}
}
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

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse evaluation', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 0.015 + response.usage.output_tokens * 0.075) / 1000000;

  return NextResponse.json({
    evaluation,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

async function handleGapAnalysis(
  anthropic: Anthropic,
  material: string,
  topicName: string,
  subjectName: string,
  examFormat: string | null,
  quizHistory: Array<{ bloomLevel: number; score: number }> | null,
  currentBloomLevel: number,
  wrongAnswers?: WrongAnswerInput[] | null
) {
  // Analyze quiz history to find weak areas
  const historyAnalysis = quizHistory?.length
    ? `Previous quiz performance: ${quizHistory.map(q => `Level ${q.bloomLevel}: ${q.score}%`).join(', ')}`
    : 'No previous quiz history.';

  // Analyze wrong answers to identify weak concepts
  let wrongAnswersAnalysis = '';
  if (wrongAnswers && wrongAnswers.length > 0) {
    // Group by concept and count
    const conceptCounts: Record<string, { count: number; drillCount: number }> = {};
    wrongAnswers.forEach(wa => {
      if (!conceptCounts[wa.concept]) {
        conceptCounts[wa.concept] = { count: 0, drillCount: 0 };
      }
      conceptCounts[wa.concept].count++;
      conceptCounts[wa.concept].drillCount += (wa as WrongAnswerInput & { drillCount?: number }).drillCount || 0;
    });

    const weakConcepts = Object.entries(conceptCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([concept, data]) => `${concept}: ${data.count} грешки${data.drillCount > 0 ? ` (drilled ${data.drillCount}x)` : ''}`);

    wrongAnswersAnalysis = `
KNOWN WEAK AREAS (from previous quiz mistakes):
${weakConcepts.join('\n')}

PRIORITY: Focus questions heavily on these weak concepts! The student has demonstrably struggled with them.`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 6144,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator performing a gap analysis for a Bulgarian medical student.

Subject: ${subjectName}
Topic: ${topicName}
Current Bloom Level: ${currentBloomLevel}
${examFormat ? `Exam Format: ${examFormat}` : ''}
${historyAnalysis}
${wrongAnswersAnalysis}

${material?.trim() ? `Study Material:\n"""\n${material}\n"""` : `No study material provided. Use standard medical curriculum knowledge for "${topicName}" (${subjectName}).`}

Perform a comprehensive gap analysis:
1. Identify the most critical concepts that would be tested in an exam
2. Generate targeted questions to probe potential knowledge gaps
3. ${wrongAnswers?.length ? 'PRIORITIZE weak concepts from the wrong answers list above!' : 'Focus on areas where students typically struggle'}

Return ONLY a valid JSON object:
{
  "criticalConcepts": [
    {"concept": "name", "importance": "critical|high|medium", "examLikelihood": "very_likely|likely|possible"}
  ],
  "questions": [
    {
      "type": "multiple_choice" | "open" | "case_study",
      "question": "Question in Bulgarian",
      "options": ["A", "B", "C", "D"], // only for multiple_choice/case_study
      "correctAnswer": "correct answer (за open: примерен пълен отговор 3-5 изречения)",
      "explanation": "explanation in Bulgarian",
      "bloomLevel": 1-6,
      "targetConcept": "which concept this tests",
      "commonMistake": "what students often get wrong here"
    }
  ],
  "weakAreaPrediction": [
    {"area": "predicted weak area", "reason": "why this might be weak", "priority": "high|medium|low"}
  ],
  "studyRecommendation": "personalized study recommendation in Bulgarian"
}

QUESTION TYPE DISTRIBUTION:
- ПРЕДПОЧИТАЙ "open" (60%) - изискват писане, показват истинско разбиране
- "case_study" (25%) - клинични сценарии
- "multiple_choice" (15%) - само за бързи фактологични проверки

Generate 8-12 strategically chosen questions that efficiently probe for gaps.
Mix Bloom levels but focus on levels ${Math.max(1, currentBloomLevel - 1)} to ${Math.min(6, currentBloomLevel + 1)}.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'No response from Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let analysis;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Failed to parse gap analysis', raw: responseText.substring(0, 500) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * 0.015 + response.usage.output_tokens * 0.075) / 1000000;

  return NextResponse.json({
    analysis,
    questions: analysis.questions,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
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
      cost: Math.round(cost * 10000) / 10000
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

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Ти си справедлив медицински преподавател. Оцени отговора на студента.

ВЪПРОС: ${question}

ПРАВИЛЕН ОТГОВОР (reference):
${correctAnswer}

ОТГОВОР НА СТУДЕНТА:
${userAnswer}

${strictnessGuide}

ВАЖНО - КАЛИБРИРАНЕ НА ОЦЕНКАТА:
${isShortExpected
  ? `Reference отговорът е КРАТЪК (${refSentences} изречения). Това означава, че се очаква кратък отговор. НЕ наказвай студента за кратък отговор когато reference-ът също е кратък!`
  : `Reference отговорът е подробен (${refSentences} изречения). Очаквай повече детайли от студента.`}

КРИТЕРИИ ЗА ОЦЕНКА:
- Сравнявай СЪДЪРЖАТЕЛНО с reference отговора - покрива ли ключовите точки?
- Ако студентът покрива ОСНОВНИТЕ ключови точки от reference = 0.7+
- Ако студентът покрива ВСИЧКИ ключови точки = 0.85+
- Ако покрива всички точки + добавя разбиране = 0.95+
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
      cost: Math.round(cost * 10000) / 10000
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
  }
) {
  const { material, topicName, subjectName, subjectType, examFormat, bloomLevel, mode, questionCount, matchExamFormat, model = 'sonnet', masteryContext } = params;

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
${material}
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

  const response = await anthropic.messages.create({
    model: modelConfig.id,
    max_tokens: 8192,
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

Generate ${targetQuestionCount}.

IMPORTANT QUESTION COUNT REQUIREMENT:
${questionCount ? `You MUST generate EXACTLY ${questionCount} questions. Count them carefully before responding. If you generate fewer or more, you have FAILED the task.` : hasMaterial ? 'Intelligently select the number based on material complexity.' : 'Intelligently select the number based on topic breadth and complexity.'}

Intelligently select:
- The most important concepts to test
- Questions that efficiently assess deep understanding

QUESTION TYPE DISTRIBUTION (ВАЖНО!):
- ПРЕДПОЧИТАЙ "open" въпроси (60-70%) - изискват писане и показват истинско разбиране
- Използвай "case_study" за клинични сценарии (20-30%) - пациентски случаи с решения
- ИЗБЯГВАЙ "multiple_choice" (макс 10-20%) - само за фактологични въпроси на ниски Bloom нива

Причина: Студентът има Question Bank за MCQ практика. Този Quiz трябва да тества ДЪЛБОКО разбиране!

Return ONLY a valid JSON array:
[
  {
    "type": "multiple_choice" | "open" | "case_study",
    "question": "Question in Bulgarian",
    "options": ["A", "B", "C", "D"], // only for multiple_choice/case_study
    "correctAnswer": "correct answer (за open: примерен пълен отговор)",
    "explanation": "detailed explanation in Bulgarian",
    "bloomLevel": 1-6,
    "concept": "main concept being tested"
  }
]

IMPORTANT:
- Questions must be in Bulgarian
- Focus on clinically relevant concepts
- CRITICAL: For "open" questions, correctAnswer MUST MATCH the length the student sees:
  * Bloom 1-2: EXACTLY 2-3 sentences (this is what student sees as recommended)
  * Bloom 3-4: EXACTLY 3-5 sentences (this is what student sees as recommended)
  * Bloom 5-6: EXACTLY 5-8 sentences (this is what student sees as recommended)
  DO NOT exceed these limits! The student sees "Препоръчително: X изречения" and your answer must match.
  If your answer is longer, the student feels inadequate. COUNT YOUR SENTENCES!
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
      cost: Math.round(cost * 10000) / 10000
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
  studyTechniques?: Array<{ name: string; slug: string; howToApply: string }> | null
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
    analysis = JSON.parse(responseText);
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
