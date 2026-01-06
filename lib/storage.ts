'use client';

import { AppData, DailyStatus, GPAData, UsageData } from './types';
import { STORAGE_KEY } from './constants';
import { getTodayString, applyDecayToSubjects } from './algorithms';

const defaultDailyStatus: DailyStatus = {
  date: getTodayString(),
  sleep: 3,
  energy: 3,
  sick: false,
  availableHours: 4
};

const defaultGPAData: GPAData = {
  grades: [],
  targetGPA: 5.5
};

const defaultUsageData: UsageData = {
  dailyCalls: 0,
  monthlyCost: 0,
  monthlyBudget: 5,
  lastReset: getTodayString()
};

const defaultData: AppData = {
  subjects: [],
  schedule: [],
  dailyStatus: defaultDailyStatus,
  timerSessions: [],
  gpaData: defaultGPAData,
  usageData: defaultUsageData
};

export function loadData(): AppData {
  if (typeof window === 'undefined') return defaultData;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultData;

    const data = JSON.parse(stored);

    // Migrate old data - add missing fields
    if (!data.timerSessions) data.timerSessions = [];
    if (!data.gpaData) data.gpaData = defaultGPAData;
    if (!data.usageData) data.usageData = defaultUsageData;
    // Remove deprecated focusSession
    delete data.focusSession;

    // Migrate topics - add material fields if missing
    data.subjects = data.subjects.map((subject: any) => ({
      ...subject,
      topics: subject.topics.map((topic: any) => ({
        ...topic,
        material: topic.material || '',
        materialImages: topic.materialImages || []
      }))
    }));

    // Apply decay to all topics
    data.subjects = applyDecayToSubjects(data.subjects);

    // Reset daily status if it's a new day
    const today = getTodayString();
    if (data.dailyStatus.date !== today) {
      data.dailyStatus = {
        ...defaultDailyStatus,
        date: today
      };
    }

    // Reset usage data if new month
    const lastReset = new Date(data.usageData.lastReset);
    const now = new Date();
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      data.usageData = { ...defaultUsageData, lastReset: today };
    }

    return data as AppData;
  } catch (error) {
    console.error('Error loading data:', error);
    return defaultData;
  }
}

export function saveData(data: AppData): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

export function clearData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
