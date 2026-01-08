'use client';

import { AppData, DailyStatus, GPAData, UsageData, PomodoroSettings, StudyGoals, AcademicPeriod, Subject, Topic, TopicStatus, SubjectType, QuizResult, TopicSize, BloomLevel } from './types';
import { STORAGE_KEY } from './constants';
import { getTodayString, applyDecayToSubjects } from './algorithms';
import { defaultUserProgress } from './gamification';
import LZString from 'lz-string';

// Storage error types
export type StorageError = 'quota_exceeded' | 'unknown_error' | null;

// Callback for storage errors - can be set by context
let storageErrorCallback: ((error: StorageError, details?: string) => void) | null = null;

export function setStorageErrorCallback(callback: ((error: StorageError, details?: string) => void) | null): void {
  storageErrorCallback = callback;
}

// Check if error is quota exceeded
function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    // Different browsers use different names
    return error.name === 'QuotaExceededError' ||
           error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
           error.code === 22; // Legacy code
  }
  return false;
}

// Estimate current localStorage usage in bytes
export function getStorageUsage(): { used: number; total: number; percentage: number } {
  if (typeof window === 'undefined') return { used: 0, total: 5 * 1024 * 1024, percentage: 0 };

  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        total += key.length + value.length;
      }
    }
  }

  // Convert to bytes (UTF-16 = 2 bytes per char)
  const usedBytes = total * 2;
  const totalBytes = 5 * 1024 * 1024; // ~5MB typical limit

  return {
    used: usedBytes,
    total: totalBytes,
    percentage: Math.round((usedBytes / totalBytes) * 100)
  };
}

// Migration types for loading potentially incomplete/old data from localStorage
interface LegacyTopic {
  id: string;
  name: string;
  number: number;
  status: TopicStatus;
  grades: number[];
  avgGrade: number;
  quizCount: number;
  lastReview: string | null;
  material?: string;
  materialImages?: string[];
  currentBloomLevel?: number;
  quizHistory?: Array<QuizResult & { weight?: number }>;
  readCount?: number;
  lastRead?: string | null;
  size?: TopicSize | null;
  sizeSetBy?: 'ai' | 'user' | null;
  wrongAnswers?: Array<{ question: string; userAnswer: string | null; correctAnswer: string; concept: string; bloomLevel: number; date: string; drillCount: number }>;
  highlights?: Array<{ id: string; text: string; startOffset: number; endOffset: number; color: 'yellow' | 'green' | 'blue' | 'pink'; createdAt: string }>;
}

interface LegacySubject {
  id: string;
  name: string;
  color: string;
  subjectType?: SubjectType;
  examDate: string | null;
  examFormat?: string | null;
  topics: LegacyTopic[];
  createdAt: string;
}

// Separate storage keys for optimization
const MATERIALS_KEY = 'vayne-materials';
const COMPRESSED_FLAG = 'vayne-compressed';

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
  dailyMinutes: 480,
  weeklyMinutes: 2880,
  monthlyMinutes: 12480,
  weekendDailyMinutes: 240,
  useWeekendHours: true
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

// Materials storage helpers
function loadMaterials(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(MATERIALS_KEY);
    if (!stored) return {};
    // Materials are always compressed
    const decompressed = LZString.decompress(stored);
    return decompressed ? JSON.parse(decompressed) : {};
  } catch {
    return {};
  }
}

function saveMaterials(materials: Record<string, string>): StorageError {
  if (typeof window === 'undefined') return null;
  try {
    const compressed = LZString.compress(JSON.stringify(materials));
    localStorage.setItem(MATERIALS_KEY, compressed);
    return null;
  } catch (error) {
    console.error('Error saving materials:', error);
    if (isQuotaExceededError(error)) {
      storageErrorCallback?.('quota_exceeded', 'Материалите не могат да бъдат запазени - паметта е пълна');
      return 'quota_exceeded';
    }
    storageErrorCallback?.('unknown_error', 'Грешка при запазване на материалите');
    return 'unknown_error';
  }
}

export function getMaterial(topicId: string): string {
  const materials = loadMaterials();
  return materials[topicId] || '';
}

export function setMaterial(topicId: string, material: string): void {
  const materials = loadMaterials();
  if (material) {
    materials[topicId] = material;
  } else {
    delete materials[topicId];
  }
  saveMaterials(materials);
}

export function loadData(): AppData {
  if (typeof window === 'undefined') return defaultData;

  try {
    let stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultData;

    // Check if data is compressed
    const isCompressed = localStorage.getItem(COMPRESSED_FLAG) === 'true';
    if (isCompressed) {
      const decompressed = LZString.decompress(stored);
      if (!decompressed) {
        console.error('Failed to decompress data');
        return defaultData;
      }
      stored = decompressed;
    }

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

      (data.subjects as LegacySubject[]).forEach((subject) => {
        subject.topics.forEach((topic) => {
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
    data.subjects = (data.subjects as LegacySubject[]).map((subject): Subject => ({
      ...subject,
      subjectType: subject.subjectType ?? 'preclinical', // Default to preclinical
      examFormat: subject.examFormat ?? null, // Add exam format field
      topics: subject.topics.map((topic): Topic => ({
        ...topic,
        material: topic.material || '',
        materialImages: topic.materialImages || [],
        // Bloom's Taxonomy tracking
        currentBloomLevel: (topic.currentBloomLevel || 1) as BloomLevel,
        // Migrate quiz history to include weight
        quizHistory: (topic.quizHistory || []).map((qr) => ({
          ...qr,
          weight: qr.weight ?? 1.0 // Default to standard weight for existing results
        })),
        // Reading tracking
        readCount: topic.readCount ?? 0,
        lastRead: topic.lastRead ?? null,
        // Smart Scheduling: Size classification
        size: topic.size ?? null,
        sizeSetBy: topic.sizeSetBy ?? null,
        // Gap Analysis: Track wrong answers
        wrongAnswers: topic.wrongAnswers ?? [],
        // Reader Mode: Highlights
        highlights: topic.highlights ?? []
      }))
    }));

    // Apply decay to all topics - but only once per day
    const lastDecayDate = localStorage.getItem('vayne-last-decay-date');
    const today = getTodayString();
    if (lastDecayDate !== today) {
      data.subjects = applyDecayToSubjects(data.subjects);
      localStorage.setItem('vayne-last-decay-date', today);
    }

    // Load materials from separate storage and merge into topics
    const materials = loadMaterials();
    data.subjects = data.subjects.map((subject: Subject) => ({
      ...subject,
      topics: subject.topics.map((topic: Topic) => ({
        ...topic,
        // Load material from separate storage if available, fallback to topic.material (for migration)
        material: materials[topic.id] || topic.material || ''
      }))
    }));

    // Migrate dailyStatus - remove old fields, add holiday
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

export function saveData(data: AppData): StorageError {
  if (typeof window === 'undefined') return null;

  try {
    // Extract materials from topics and save separately
    const materials: Record<string, string> = loadMaterials();

    // Create a copy of data without materials in topics (to reduce main storage size)
    const dataToSave = {
      ...data,
      subjects: data.subjects.map(subject => ({
        ...subject,
        topics: subject.topics.map(topic => {
          // If topic has material, save it separately
          if (topic.material && topic.material.length > 0) {
            materials[topic.id] = topic.material;
          }
          // Return topic without material (material is loaded lazily)
          return {
            ...topic,
            material: '', // Don't store in main data
            materialImages: topic.materialImages || []
          };
        })
      }))
    };

    // Save materials separately (always compressed)
    const materialsError = saveMaterials(materials);
    if (materialsError) {
      return materialsError;
    }

    // Compress and save main data
    const jsonString = JSON.stringify(dataToSave);
    const compressed = LZString.compress(jsonString);

    // Only use compression if it actually saves space
    if (compressed && compressed.length < jsonString.length) {
      localStorage.setItem(STORAGE_KEY, compressed);
      localStorage.setItem(COMPRESSED_FLAG, 'true');
    } else {
      localStorage.setItem(STORAGE_KEY, jsonString);
      localStorage.setItem(COMPRESSED_FLAG, 'false');
    }

    return null;
  } catch (error) {
    console.error('Error saving data:', error);
    if (isQuotaExceededError(error)) {
      storageErrorCallback?.('quota_exceeded', 'Данните не могат да бъдат запазени - паметта е пълна. Опитай да изтриеш неизползвани материали.');
      return 'quota_exceeded';
    }
    storageErrorCallback?.('unknown_error', 'Грешка при запазване на данните');
    return 'unknown_error';
  }
}

export function clearData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MATERIALS_KEY);
  localStorage.removeItem(COMPRESSED_FLAG);
  localStorage.removeItem('vayne-last-decay-date');
}
