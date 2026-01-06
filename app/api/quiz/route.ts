import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { apiKey, material, topicName, subjectName, questionCount } = await request.json();

    if (!apiKey || !material) {
      return NextResponse.json({ error: 'Missing API key or material' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Use Opus for high-quality educational quiz generation
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are an expert medical educator creating a quiz for a Bulgarian medical student.

Subject: ${subjectName}
Topic: ${topicName}

Study Material:
"""
${material}
"""

Generate exactly ${questionCount} high-quality quiz questions based on this material. Mix question types:
- Multiple choice (4 options, one correct)
- Open-ended questions requiring explanation

For each question, test understanding of key concepts, not just memorization.

Return ONLY a valid JSON array with this exact structure:
[
  {
    "type": "multiple_choice",
    "question": "Question text in Bulgarian",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "The correct option text exactly as written in options",
    "explanation": "Detailed explanation in Bulgarian why this is correct"
  },
  {
    "type": "open",
    "question": "Open question text in Bulgarian",
    "correctAnswer": "Expected key points for a good answer",
    "explanation": "Full explanation of the concept"
  }
]

IMPORTANT:
- Questions must be in Bulgarian
- Questions should test understanding, not just recall
- Explanations should be educational and detailed
- Return ONLY the JSON array, no other text`
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
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        questions = JSON.parse(responseText);
      }

      if (!Array.isArray(questions)) {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      console.error('Failed to parse quiz response:', responseText);
      return NextResponse.json({
        error: 'Failed to generate quiz questions',
        raw: responseText.substring(0, 500)
      }, { status: 500 });
    }

    // Calculate cost (Opus pricing: $15/1M input, $75/1M output)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = (inputTokens * 0.015 + outputTokens * 0.075) / 1000;

    return NextResponse.json({
      questions,
      usage: {
        inputTokens,
        outputTokens,
        cost: Math.round(cost * 10000) / 10000
      }
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
