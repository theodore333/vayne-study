'use client';

import { AppData, DailyStatus, GPAData, UsageData, PomodoroSettings, StudyGoals, AcademicPeriod } from './types';
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

const defaultPomodoroSettings: PomodoroSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakAfter: 4,
  autoStartBreaks: false,
  autoStartWork: false,
  soundEnabled: true
};

const defaultStudyGoals: StudyGoals = {
  dailyMinutes: 240,
  weeklyMinutes: 1200,
  monthlyMinutes: 4800
};

const defaultAcademicPeriod: AcademicPeriod = {
  semesterStart: null,
  semesterEnd: null,
  sessionStart: null,
  sessionEnd: null
};

const defaultData: AppData = {
  subjects: [],
  schedule: [],
  dailyStatus: defaultDailyStatus,
  timerSessions: [],
  gpaData: defaultGPAData,
  usageData: defaultUsageData,
  questionBanks: [],
  pomodoroSettings: defaultPomodoroSettings,
  studyGoals: defaultStudyGoals,
  academicPeriod: defaultAcademicPeriod
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
    if (!data.questionBanks) data.questionBanks = [];
    if (!data.pomodoroSettings) data.pomodoroSettings = defaultPomodoroSettings;
    if (!data.studyGoals) data.studyGoals = defaultStudyGoals;
    if (!data.studyGoals.monthlyMinutes) data.studyGoals.monthlyMinutes = 4800;
    if (!data.academicPeriod) data.academicPeriod = defaultAcademicPeriod;
    // Remove deprecated focusSession
    delete data.focusSession;

    // Migrate subjects and topics - add missing fields
    data.subjects = data.subjects.map((subject: any) => ({
      ...subject,
      subjectType: subject.subjectType ?? 'preclinical', // Default to preclinical
      examFormat: subject.examFormat ?? null, // Add exam format field
      topics: subject.topics.map((topic: any) => ({
        ...topic,
        material: topic.material || '',
        materialImages: topic.materialImages || [],
        // Bloom's Taxonomy tracking
        currentBloomLevel: topic.currentBloomLevel || 1,
        // Migrate quiz history to include weight
        quizHistory: (topic.quizHistory || []).map((qr: any) => ({
          ...qr,
          weight: qr.weight ?? 1.0 // Default to standard weight for existing results
        }))
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
