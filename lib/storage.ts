'use client';

import { AppData, DailyStatus, GPAData, UsageData, PomodoroSettings, StudyGoals, AcademicPeriod, UserProgress } from './types';
import { STORAGE_KEY } from './constants';
import { getTodayString, applyDecayToSubjects } from './algorithms';
import { defaultUserProgress } from './gamification';

const defaultDailyStatus: DailyStatus = {
  date: getTodayString(),
  sick: false,
  holiday: false
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
  academicPeriod: defaultAcademicPeriod,
  userProgress: defaultUserProgress
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
    if (!data.userProgress) data.userProgress = defaultUserProgress;

    // Migrate: Calculate stats from existing data
    if (data.userProgress && data.subjects) {
      let topicsCompleted = 0;
      let greenTopics = 0;
      let quizzesTaken = 0;

      data.subjects.forEach((subject: any) => {
        subject.topics.forEach((topic: any) => {
          if (topic.status !== 'gray') topicsCompleted++;
          if (topic.status === 'green') greenTopics++;
          quizzesTaken += topic.quizCount || 0;
        });
      });

      // Only update if current stats are lower (don't overwrite progress)
      if (!data.userProgress.stats) {
        data.userProgress.stats = {
          topicsCompleted: 0,
          quizzesTaken: 0,
          perfectQuizzes: 0,
          greenTopics: 0,
          longestStreak: 0
        };
      }
      data.userProgress.stats.topicsCompleted = Math.max(data.userProgress.stats.topicsCompleted || 0, topicsCompleted);
      data.userProgress.stats.greenTopics = Math.max(data.userProgress.stats.greenTopics || 0, greenTopics);
      data.userProgress.stats.quizzesTaken = Math.max(data.userProgress.stats.quizzesTaken || 0, quizzesTaken);
    }
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

    // Migrate dailyStatus - remove old fields, add holiday
    const today = getTodayString();
    if (data.dailyStatus.date !== today || data.dailyStatus.holiday === undefined) {
      data.dailyStatus = {
        date: today,
        sick: data.dailyStatus.sick ?? false,
        holiday: data.dailyStatus.holiday ?? false
      };
    }
    // Remove deprecated fields
    delete data.dailyStatus.sleep;
    delete data.dailyStatus.energy;
    delete data.dailyStatus.availableHours;

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
