import { createClient, RedisClientType } from 'redis';
import { NextResponse } from 'next/server';

const DATA_KEY = 'vayne-study-data';

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) {
    console.log('[REDIS] No REDIS_URL configured, using localStorage only');
    return null;
  }

  try {
    const client = createClient({
      url: process.env.REDIS_URL
    });
    await client.connect();
    return client as RedisClientType;
  } catch (error) {
    console.error('[REDIS] Connection failed:', error);
    return null;
  }
}

export async function GET() {
  let client: RedisClientType | null = null;
  try {
    client = await getRedisClient();

    if (!client) {
      // Redis not available, client will use localStorage
      return NextResponse.json({ data: null, redisAvailable: false });
    }

    const data = await client.get(DATA_KEY);

    if (!data) {
      return NextResponse.json({ data: null, redisAvailable: true });
    }

    return NextResponse.json({ data: JSON.parse(data), redisAvailable: true });
  } catch (error) {
    console.error('[REDIS] Error loading data:', error);
    // Return null data instead of error - client will use localStorage
    return NextResponse.json({ data: null, redisAvailable: false });
  } finally {
    if (client) await client.disconnect();
  }
}

export async function POST(request: Request) {
  let client: RedisClientType | null = null;
  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    client = await getRedisClient();

    if (!client) {
      // Redis not available, but that's OK - client uses localStorage
      console.log('[REDIS] Skipping save - Redis not available');
      return NextResponse.json({ success: true, redisAvailable: false });
    }

    await client.set(DATA_KEY, JSON.stringify(body.data));

    return NextResponse.json({ success: true, redisAvailable: true });
  } catch (error) {
    console.error('[REDIS] Error saving data:', error);
    // Return failure so client knows cloud save failed
    return NextResponse.json({ success: false, redisAvailable: false, error: 'Failed to save to cloud' });
  } finally {
    if (client) await client.disconnect();
  }
}
