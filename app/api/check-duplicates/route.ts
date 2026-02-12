import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { apiKey, newQuestions, existingQuestions } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }

    if (!newQuestions?.length || !existingQuestions?.length) {
      return NextResponse.json({ duplicateIndices: [], usage: { cost: 0 } });
    }

    const client = new Anthropic({ apiKey });

    // Build prompt
    const existingList = existingQuestions
      .map((q: string, i: number) => `E${i + 1}: ${q}`)
      .join('\n');

    const newList = newQuestions
      .map((q: string, i: number) => `N${i + 1}: ${q}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a duplicate question detector. Compare each NEW question against the EXISTING questions and identify semantic duplicates — questions that ask essentially the same thing even if worded differently.

EXISTING QUESTIONS:
${existingList}

NEW QUESTIONS:
${newList}

Return ONLY a JSON array of indices (0-based) of NEW questions that are semantic duplicates of any existing question. If no duplicates, return [].

Example: [0, 3, 5]

IMPORTANT: Only flag TRUE semantic duplicates — questions asking the same concept/fact. Different questions about the same topic are NOT duplicates.`
      }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the response
    let duplicateIndices: number[] = [];
    try {
      const match = text.match(/\[[\d,\s]*\]/);
      if (match) {
        duplicateIndices = JSON.parse(match[0]).filter(
          (n: unknown) => typeof n === 'number' && n >= 0 && n < newQuestions.length
        );
      }
    } catch {
      // If parsing fails, return empty
    }

    // Calculate cost (Haiku: $0.80/M input, $4/M output)
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const cost = (inputTokens * 0.80 + outputTokens * 4) / 1_000_000;

    return NextResponse.json({
      duplicateIndices,
      usage: { cost, inputTokens, outputTokens }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
