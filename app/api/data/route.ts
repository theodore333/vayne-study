import { createClient, RedisClientType } from 'redis';
import { NextRequest, NextResponse } from 'next/server';

const DATA_KEY = 'vayne-study-data';
const BACKUP_INDEX_KEY = 'vayne-study-backup-index';
const BACKUP_PREFIX = 'vayne-study-backup:';
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CLOUD_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

/**
 * Auto-save a cloud backup snapshot if 6+ hours since last one
 */
async function maybeCreateCloudBackup(client: RedisClientType, dataStr: string, data: any): Promise<void> {
  try {
    // Check when the last backup was created
    const latest = await client.zRange(BACKUP_INDEX_KEY, -1, -1);
    if (latest.length > 0) {
      try {
        const lastEntry = JSON.parse(latest[0]);
        if (Date.now() - lastEntry.ts < BACKUP_INTERVAL_MS) return; // Too soon
      } catch { /* continue to create backup */ }
    }

    const ts = Date.now();
    const subjects = Array.isArray(data?.subjects) ? data.subjects : [];
    const topicCount = subjects.reduce((sum: number, s: any) => sum + (Array.isArray(s?.topics) ? s.topics.length : 0), 0);

    // Save backup data with 30-day TTL
    await client.set(`${BACKUP_PREFIX}${ts}`, dataStr, { EX: 30 * 24 * 60 * 60 });

    // Add to index (sorted set, score = timestamp)
    const meta = JSON.stringify({ ts, subjectCount: subjects.length, topicCount });
    await client.zAdd(BACKUP_INDEX_KEY, { score: ts, value: meta });

    // Prune: keep only MAX_CLOUD_BACKUPS most recent
    const totalBackups = await client.zCard(BACKUP_INDEX_KEY);
    if (totalBackups > MAX_CLOUD_BACKUPS) {
      const toRemove = await client.zRange(BACKUP_INDEX_KEY, 0, totalBackups - MAX_CLOUD_BACKUPS - 1);
      for (const entry of toRemove) {
        try {
          const parsed = JSON.parse(entry);
          await client.del(`${BACKUP_PREFIX}${parsed.ts}`);
        } catch { /* skip malformed entries */ }
      }
      await client.zRemRangeByRank(BACKUP_INDEX_KEY, 0, totalBackups - MAX_CLOUD_BACKUPS - 1);
    }
  } catch (error) {
    console.error('[REDIS] Cloud backup error (non-critical):', error);
  }
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const client = await getRedisClient();

    if (!client) {
      return NextResponse.json({ data: null, redisAvailable: false });
    }

    // List cloud backup history
    if (action === 'list-backups') {
      const entries = await client.zRange(BACKUP_INDEX_KEY, 0, -1, { REV: true });
      const backups = entries.map(e => {
        try { return JSON.parse(e); } catch { return null; }
      }).filter(Boolean);
      return NextResponse.json({ backups, redisAvailable: true });
    }

    // Restore a specific cloud backup
    if (action === 'restore-backup') {
      const ts = searchParams.get('ts');
      if (!ts) {
        return NextResponse.json({ error: 'Missing ts parameter' }, { status: 400 });
      }
      const backupData = await client.get(`${BACKUP_PREFIX}${ts}`);
      if (!backupData) {
        return NextResponse.json({ error: 'Backup not found or expired' }, { status: 404 });
      }
      return NextResponse.json({ data: JSON.parse(backupData), redisAvailable: true });
    }

    // Default: load current data
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

    const dataStr = JSON.stringify(body.data);
    await client.set(DATA_KEY, dataStr);

    // Auto-create cloud backup every 6 hours
    await maybeCreateCloudBackup(client, dataStr, body.data);

    return NextResponse.json({ success: true, redisAvailable: true });
  } catch (error) {
    console.error('[REDIS] Error saving data:', error);
    return NextResponse.json({ success: false, redisAvailable: false, error: 'Failed to save to cloud' });
  }
}
