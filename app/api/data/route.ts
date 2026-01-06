import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

const DATA_KEY = 'vayne-study-data';

export async function GET() {
  try {
    const data = await kv.get(DATA_KEY);

    if (!data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error loading data from KV:', error);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    await kv.set(DATA_KEY, body.data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving data to KV:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}
