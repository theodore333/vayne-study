/**
 * VAYNE OS Integration (Client-side)
 *
 * Syncs study data to VAYNE OS for unified XP tracking and activity logging.
 * Call these functions when study sessions complete, topics progress, etc.
 *
 * Uses the local /api/vayne-sync proxy endpoint to keep API keys secure.
 *
 * Setup (in .env):
 * - VAYNE_OS_API_URL - VAYNE OS production URL
 * - VAYNE_OS_SYNC_KEY - Same as STUDY_SYNC_API_KEY in VAYNE OS
 * - VAYNE_OS_USER_ID - Your Supabase user ID
 */

'use client';

interface SyncResult {
  success: boolean;
  xpAwarded?: number;
  error?: string;
  configured?: boolean;
}

// Generic sync function - uses local proxy
async function syncToVayneOS(type: string, data: unknown): Promise<SyncResult> {
  try {
    const response = await fetch('/api/vayne-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, data }),
    });

    const result = await response.json();

    if (!result.success) {
      // Check if sync is not configured (not an error, just disabled)
      if (result.configured === false) {
        return { success: false, error: 'Not configured' };
      }
      console.error('[VAYNE-OS-SYNC] Failed:', result.error);
      return { success: false, error: result.error || 'Sync failed' };
    }

    return {
      success: true,
      xpAwarded: result.xpAwarded,
    };
  } catch (error) {
    console.error('[VAYNE-OS-SYNC] Error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Sync a completed study session
 */
export async function syncStudySession(session: {
  id: string;
  subjectId: string;
  subjectName: string;
  topicId?: string;
  topicName?: string;
  duration: number;          // Minutes
  pomodorosCompleted?: number;
  rating?: number;           // 1-5
  sessionType?: 'normal' | 'pomodoro';
}): Promise<SyncResult> {
  return syncToVayneOS('session', {
    ...session,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Sync topic status change (especially when reaching 'green')
 */
export async function syncTopicProgress(progress: {
  topicId: string;
  topicName: string;
  subjectName: string;
  newStatus: 'gray' | 'orange' | 'yellow' | 'green';
  previousStatus?: string;
}): Promise<SyncResult> {
  return syncToVayneOS('topic_progress', progress);
}

/**
 * Sync quiz completion
 */
export async function syncQuizResult(quiz: {
  topicId: string;
  topicName: string;
  subjectName: string;
  score: number;             // 0-100
  bloomLevel: number;        // 1-6
  questionsCount: number;
}): Promise<SyncResult> {
  return syncToVayneOS('quiz', quiz);
}

/**
 * Sync exam date as a goal in VAYNE OS
 */
export async function syncExamDate(exam: {
  subjectName: string;
  examDate: string;          // ISO date
}): Promise<SyncResult> {
  return syncToVayneOS('exam_date', exam);
}

/**
 * Sync all exams from subjects
 * Call this when subjects are loaded or exam dates change
 */
export async function syncAllExamDates(subjects: Array<{
  name: string;
  examDate: string | null;
}>): Promise<void> {
  for (const subject of subjects) {
    if (subject.examDate) {
      await syncExamDate({
        subjectName: subject.name,
        examDate: subject.examDate,
      });
    }
  }
}
