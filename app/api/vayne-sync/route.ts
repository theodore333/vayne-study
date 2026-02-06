/**
 * VAYNE OS Sync Proxy
 *
 * Server-side proxy to sync study data to VAYNE OS.
 * This keeps the API key secure on the server.
 */

import { NextRequest, NextResponse } from 'next/server';

const VAYNE_OS_API_URL = process.env.VAYNE_OS_API_URL || 'https://vayne-os-production.up.railway.app';
const VAYNE_OS_SYNC_KEY = process.env.VAYNE_OS_SYNC_KEY;
const VAYNE_OS_USER_ID = process.env.VAYNE_OS_USER_ID;

export async function POST(request: NextRequest) {
  try {
    // Check if sync is configured
    if (!VAYNE_OS_SYNC_KEY || !VAYNE_OS_USER_ID) {
      return NextResponse.json({
        success: false,
        error: 'VAYNE OS sync not configured (missing VAYNE_OS_SYNC_KEY or VAYNE_OS_USER_ID)',
        configured: false
      });
    }

    const body = await request.json();

    if (!body.type || !body.data) {
      return NextResponse.json({
        success: false,
        error: 'Missing type or data'
      }, { status: 400 });
    }

    // Forward to VAYNE OS
    const response = await fetch(`${VAYNE_OS_API_URL}/api/study-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VAYNE_OS_SYNC_KEY,
        'x-user-id': VAYNE_OS_USER_ID,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[VAYNE-SYNC] VAYNE OS error:', error);
      return NextResponse.json({
        success: false,
        error: error.error || 'Sync failed'
      }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('[VAYNE-SYNC] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: (VAYNE_OS_SYNC_KEY && VAYNE_OS_USER_ID) ? 'configured' : 'not_configured',
    endpoint: `${VAYNE_OS_API_URL}/api/study-sync`,
    supportedTypes: ['session', 'topic_progress', 'quiz', 'exam_date']
  });
}
