import { createClient, RedisClientType } from 'redis';
import { NextRequest, NextResponse } from 'next/server';

const DATA_KEY = 'vayne-study-data';
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB

// Cached Redis client (reused across requests)
let cachedClient: RedisClientType | null = null;
let connectingPromise: Promise<RedisClientType | null> | null = null;

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }

  // Return cached client if connected
  if (cachedClient?.isOpen) {
    return cachedClient;
  }

  // If already connecting, wait for that
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', (err) => {
        console.error('[REDIS] Client error:', err);
        cachedClient = null;
      });
      await client.connect();
      cachedClient = client as RedisClientType;
      return cachedClient;
    } catch (error) {
      console.error('[REDIS] Connection failed:', error);
      cachedClient = null;
      return null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

function checkAuth(request: NextRequest): boolean {
  const token = process.env.SYNC_AUTH_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === 'production') return false;
    return true; // No token configured = open access (dev mode only)
  }

  const auth = request.headers.get('authorization');
  return auth === `Bearer ${token}`;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await getRedisClient();

    if (!client) {
      return NextResponse.json({ data: null, redisAvailable: false });
    }

    const data = await client.get(DATA_KEY);

    if (!data) {
      return NextResponse.json({ data: null, redisAvailable: true });
    }

    return NextResponse.json({ data: JSON.parse(data), redisAvailable: true });
  } catch (error) {
    console.error('[REDIS] Error loading data:', error);
    return NextResponse.json({ data: null, redisAvailable: false });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check content length before parsing
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  try {
    const body = await request.json();

    if (!body.data) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    const client = await getRedisClient();

    if (!client) {
      return NextResponse.json({ success: true, redisAvailable: false });
    }

    await client.set(DATA_KEY, JSON.stringify(body.data));

    return NextResponse.json({ success: true, redisAvailable: true });
  } catch (error) {
    console.error('[REDIS] Error saving data:', error);
    return NextResponse.json({ success: false, redisAvailable: false, error: 'Failed to save to cloud' });
  }
}
