import { createClient } from 'redis';
import { NextResponse } from 'next/server';

const DATA_KEY = 'vayne-study-data';

async function getRedisClient() {
  const client = createClient({
    url: process.env.REDIS_URL
  });
  await client.connect();
  return client;
}

export async function GET() {
  let client;
  try {
    client = await getRedisClient();
    const data = await client.get(DATA_KEY);

    if (!data) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: JSON.parse(data) });
  } catch (error) {
    console.error('Error loading data from Redis:', error);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  } finally {
    if (client) await client.disconnect();
  }
}

export async function POST(request: Request) {
  let client;
  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    client = await getRedisClient();
    await client.set(DATA_KEY, JSON.stringify(body.data));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving data to Redis:', error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  } finally {
    if (client) await client.disconnect();
  }
}
