import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'No API key provided' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    // Simple test request
    await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error('API key test error:', error);
    const message = error instanceof Error ? error.message : '';

    if (message.includes('invalid_api_key') || message.includes('authentication')) {
      return NextResponse.json({ error: 'Невалиден API ключ' }, { status: 401 });
    }
    if (message.includes('rate_limit')) {
      return NextResponse.json({ error: 'Rate limit - опитай отново след малко' }, { status: 429 });
    }
    if (message.includes('overloaded')) {
      return NextResponse.json({ error: 'API сървърът е претоварен - опитай отново' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Невалиден API ключ или проблем с връзката' }, { status: 401 });
  }
}
