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
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error('API key test error:', error);
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }
}
