'use client';

import { AppData } from './types';
import { fetchWithTimeout, isAbortOrTimeoutError } from './fetch-utils';

const API_URL = '/api/data';
const CLOUD_TIMEOUT = 10000; // 10 seconds

function getAuthHeaders(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_SYNC_AUTH_TOKEN;
  if (token) return { 'Authorization': `Bearer ${token}` };
  return {};
}

export async function loadFromCloud(): Promise<AppData | null> {
  try {
    const response = await fetchWithTimeout(API_URL, {
      headers: getAuthHeaders(),
      timeout: CLOUD_TIMEOUT,
    });
    if (!response.ok) {
      throw new Error('Failed to load from cloud');
    }
    const result = await response.json();
    return result.data || null;
  } catch (error) {
    if (!isAbortOrTimeoutError(error)) {
      console.error('Cloud load error:', error);
    }
    return null;
  }
}

export async function saveToCloud(data: AppData): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ data }),
      timeout: CLOUD_TIMEOUT,
    });

    if (!response.ok) {
      throw new Error('Failed to save to cloud');
    }

    return true;
  } catch (error) {
    if (!isAbortOrTimeoutError(error)) {
      console.error('Cloud save error:', error);
    }
    return false;
  }
}

// Debounced save to prevent too many API calls
let saveTimeout: NodeJS.Timeout | null = null;

export function debouncedSaveToCloud(data: AppData, delay: number = 2000): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveToCloud(data);
  }, delay);
}
