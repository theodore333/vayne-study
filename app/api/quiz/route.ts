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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      apiKey,
      material,
      topicName,
      subjectName,
      examFormat,
      bloomLevel,
      mode, // 'assessment' | 'free_recall' | 'gap_analysis' | 'mid_order' | 'higher_order' | 'custom'
      questionCount, // Only used in custom mode
      matchExamFormat, // boolean - whether to match exam format
      // Free recall specific
      userRecall,
      requestHint,
      hintContext,
      // Gap analysis specific
      quizHistory,
      currentBloomLevel
    } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Handle different modes
    if (mode === 'free_recall' && requestHint) {
      // Free Recall Hint Request
      return handleFreeRecallHint(anthropic, material, topicName, userRecall, hintContext);
    }

    if (mode === 'free_recall' && userRecall) {
      // Free Recall Evaluation
      return handleFreeRecallEvaluation(anthropic, material, topicName, subjectName, userRecall);
    }

    if (mode === 'gap_analysis') {
      // Gap Analysis mode
      return handleGapAnalysis(anthropic, material, topicName, subjectName, examFormat, quizHistory, currentBloomLevel);
    }

    if (!material) {
      return NextResponse.json({ error: 'Missing material' }, { status: 400 });
    }

    // Standard quiz generation (assessment, mid_order, higher_order, custom)
    return handleStandardQuiz(anthropic, {
      material,
      topicName,
      subjectName,
      examFormat,
      bloomLevel,
      mode,
      questionCount,
      currentBloomLevel,
      matchExamFormat
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
    model: 'claude-3-5-haiku-20241022', // Use Haiku for hints (cheaper)
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

  const cost = (response.usage.input_tokens * 0.00025 + response.usage.output_tokens * 0.00125) / 1000;

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
  userRecall: string
) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
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
  "suggestedNextStep": "specific recommendation for what to study next"
}

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

  const cost = (response.usage.input_tokens * 0.015 + response.usage.output_tokens * 0.075) / 1000;

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
  currentBloomLevel: number
) {
  // Analyze quiz history to find weak areas
  const historyAnalysis = quizHistory?.length
    ? `Previous quiz performance: ${quizHistory.map(q => `Level ${q.bloomLevel}: ${q.score}%`).join(', ')}`
    : 'No previous quiz history.';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 6144,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator performing a gap analysis for a Bulgarian medical student.

Subject: ${subjectName}
Topic: ${topicName}
Current Bloom Level: ${currentBloomLevel}
${examFormat ? `Exam Format: ${examFormat}` : ''}
${historyAnalysis}

Study Material:
"""
${material}
"""

Perform a comprehensive gap analysis:
1. Identify the most critical concepts that would be tested in an exam
2. Generate targeted questions to probe potential knowledge gaps
3. Focus on areas where students typically struggle

Return ONLY a valid JSON object:
{
  "criticalConcepts": [
    {"concept": "name", "importance": "critical|high|medium", "examLikelihood": "very_likely|likely|possible"}
  ],
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Question in Bulgarian",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "correct option text",
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

  const cost = (response.usage.input_tokens * 0.015 + response.usage.output_tokens * 0.075) / 1000;

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

async function handleStandardQuiz(
  anthropic: Anthropic,
  params: {
    material: string;
    topicName: string;
    subjectName: string;
    examFormat: string | null;
    bloomLevel: number | null;
    mode: string;
    questionCount: number | null;
    currentBloomLevel: number;
    matchExamFormat?: boolean;
  }
) {
  const { material, topicName, subjectName, examFormat, bloomLevel, mode, questionCount, matchExamFormat } = params;

  // AI ALWAYS determines question count based on material complexity
  // Only custom mode with explicit count overrides this
  let targetQuestionCount: string;
  if (mode === 'custom' && questionCount) {
    targetQuestionCount = `exactly ${questionCount}`;
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
Mark each question with its bloomLevel (5 or 6).`;
  } else if (bloomLevel && BLOOM_PROMPTS[bloomLevel]) {
    bloomInstructions = `\nBLOOM'S TAXONOMY LEVEL:\n${BLOOM_PROMPTS[bloomLevel]}`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `You are an expert medical educator creating a quiz for a Bulgarian medical student.

Subject: ${subjectName}
Topic: ${topicName}
${examFormatInstructions}
${bloomInstructions}

Study Material:
"""
${material}
"""

Generate ${targetQuestionCount} high-quality quiz questions. Intelligently select:
- The most important concepts to test
- Mix of question types (multiple choice, open-ended, case studies)
- Questions that efficiently assess understanding

Return ONLY a valid JSON array:
[
  {
    "type": "multiple_choice" | "open" | "case_study",
    "question": "Question in Bulgarian",
    "options": ["A", "B", "C", "D"], // only for multiple_choice/case_study
    "correctAnswer": "correct answer",
    "explanation": "detailed explanation in Bulgarian",
    "bloomLevel": 1-6,
    "concept": "main concept being tested"
  }
]

IMPORTANT:
- Questions must be in Bulgarian
- Focus on clinically relevant concepts
- Explanations should be educational
- Return ONLY the JSON array`
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

  const cost = (response.usage.input_tokens * 0.015 + response.usage.output_tokens * 0.075) / 1000;

  return NextResponse.json({
    questions,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}
