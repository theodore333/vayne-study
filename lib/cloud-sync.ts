'use client';

import { AppData } from './types';
import { fetchWithTimeout, isAbortOrTimeoutError } from './fetch-utils';

const API_URL = '/api/data';
const CLOUD_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

function getAuthHeaders(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_SYNC_AUTH_TOKEN;
  if (token) return { 'Authorization': `Bearer ${token}` };
  return {};
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function loadFromCloud(): Promise<AppData | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(API_URL, {
        headers: getAuthHeaders(),
        timeout: CLOUD_TIMEOUT,
      });

      // Don't retry auth errors
      if (response.status === 401) {
        console.error('Cloud load: unauthorized (check NEXT_PUBLIC_SYNC_AUTH_TOKEN)');
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to load from cloud (${response.status})`);
      }

      const result = await response.json();
      return result.data || null;
    } catch (error) {
      if (isAbortOrTimeoutError(error)) return null;

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Cloud load attempt ${attempt + 1}/${MAX_RETRIES} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        console.error('Cloud load failed after all retries:', error);
      }
    }
  }
  return null;
}

export async function saveToCloud(data: AppData): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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

      // Don't retry auth errors
      if (response.status === 401) {
        console.error('Cloud save: unauthorized (check NEXT_PUBLIC_SYNC_AUTH_TOKEN)');
        return false;
      }

      if (!response.ok) {
        throw new Error(`Failed to save to cloud (${response.status})`);
      }

      return true;
    } catch (error) {
      if (isAbortOrTimeoutError(error)) return false;

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Cloud save attempt ${attempt + 1}/${MAX_RETRIES} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        console.error('Cloud save failed after all retries:', error);
      }
    }
  }
  return false;
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
