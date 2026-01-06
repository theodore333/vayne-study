'use client';

import { AppData } from './types';

const API_URL = '/api/data';

export async function loadFromCloud(): Promise<AppData | null> {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error('Failed to load from cloud');
    }
    const result = await response.json();
    return result.data || null;
  } catch (error) {
    console.error('Cloud load error:', error);
    return null;
  }
}

export async function saveToCloud(data: AppData): Promise<boolean> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      throw new Error('Failed to save to cloud');
    }

    return true;
  } catch (error) {
    console.error('Cloud save error:', error);
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
