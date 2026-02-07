'use client';

import { AppData, DailyStatus, GPAData, UsageData, PomodoroSettings, StudyGoals, AcademicPeriod, Subject, Topic, TopicStatus, SubjectType, QuizResult, TopicSize, BloomLevel, ClinicalCaseSession, DevelopmentProject, ProjectModule } from './types';
import { STORAGE_KEY } from './constants';
import { getTodayString, applyDecayToSubjects } from './algorithms';
import { defaultUserProgress } from './gamification';
import LZString from 'lz-string';
import { getMaterialFromIDB, setMaterialInIDB, getAllMaterialsFromIDB, migrateFromLocalStorage, isIndexedDBAvailable, saveBackupSnapshot } from './indexeddb-storage';

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
const IDB_MIGRATED_KEY = 'vayne-idb-migrated';

// In-memory cache for materials (loaded from IndexedDB at startup)
let materialsCache: Record<string, string> = {};
let materialsCacheLoaded = false;
let materialsCachePromise: Promise<void> | null = null;

/**
 * Get the current materials cache (for merging with cloud data)
 */
export function getMaterialsCache(): Record<string, string> {
  return materialsCache;
}

const defaultDailyStatus: DailyStatus = {
  date: getTodayString(),
  sick: false,
  holiday: false
};

const defaultGPAData: GPAData = {
  grades: [],
  targetGPA: 5.5,
  stateExams: []
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
  useWeekendHours: true,
  vacationMode: false,
  vacationMultiplier: 0.4
};

const defaultAcademicPeriod: AcademicPeriod = {
  semesterStart: null,
  semesterEnd: null,
  sessionStart: null,
  sessionEnd: null
};

const defaultClinicalCaseSessions: ClinicalCaseSession = {
  activeCaseId: null,
  cases: [],
  totalCasesCompleted: 0,
  averageScore: 0
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
  userProgress: defaultUserProgress,
  clinicalCaseSessions: defaultClinicalCaseSessions,
  orRoomSessions: { activeCaseId: null, cases: [], totalCasesCompleted: 0, averageScore: 0 },
  // Phase 1: Vayne Doctor
  developmentProjects: [],
  careerProfile: null,
  // Academic Events
  academicEvents: [],
  // Dashboard Features
  lastOpenedTopic: null,
  dailyGoals: []
};

// Materials storage helpers - now using IndexedDB with in-memory cache

/**
 * Initialize materials cache from IndexedDB AND localStorage (merge both)
 * Call this once at app startup
 */
export async function initMaterialsCache(): Promise<void> {
  if (materialsCacheLoaded) return;
  if (materialsCachePromise) return materialsCachePromise;

  materialsCachePromise = (async () => {
    if (typeof window === 'undefined') return;

    try {
      const lsMaterials = loadMaterialsFromLocalStorage();

      let idbMaterials: Record<string, string> = {};
      if (isIndexedDBAvailable()) {
        try {
          idbMaterials = await getAllMaterialsFromIDB();
        } catch (error) {
          console.error('[LOAD] IndexedDB load failed:', error);
        }
      }

      // Merge: prefer IndexedDB (newer), fallback to localStorage
      materialsCache = { ...lsMaterials };
      for (const [topicId, content] of Object.entries(idbMaterials)) {
        if (content && content.length > 0) {
          materialsCache[topicId] = content;
        }
      }

      materialsCacheLoaded = true;
    } catch (error) {
      console.error('[LOAD] Error initializing materials cache:', error);
      materialsCache = loadMaterialsFromLocalStorage();
      materialsCacheLoaded = true;
    }
  })();

  return materialsCachePromise;
}

// Legacy localStorage functions (for fallback and migration)
function loadMaterialsFromLocalStorage(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(MATERIALS_KEY);
    if (!stored) return {};
    const decompressed = LZString.decompress(stored);
    return decompressed ? JSON.parse(decompressed) : {};
  } catch (error) {
    console.error('[LS] Error loading materials from localStorage:', error);
    return {};
  }
}

function saveMaterialsToLocalStorage(materials: Record<string, string>): StorageError {
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

/**
 * Get material - synchronous from cache
 */
export function getMaterial(topicId: string): string {
  // Return from cache (initialized at startup)
  return materialsCache[topicId] || '';
}

/**
 * Set material - updates cache and persists to BOTH IndexedDB AND localStorage
 */
export function setMaterial(topicId: string, material: string): void {
  // Update cache immediately
  if (material) {
    materialsCache[topicId] = material;
  } else {
    delete materialsCache[topicId];
  }

  // Save to localStorage as backup (synchronous, reliable)
  saveMaterialsToLocalStorage(materialsCache);

  // Also save to IndexedDB (async, larger capacity)
  if (isIndexedDBAvailable()) {
    setMaterialInIDB(topicId, material).catch(error => {
      console.error('[SAVE] IndexedDB error:', error);
    });
  }
}

/**
 * Migrate raw data (from any source: localStorage, cloud, etc.) to current AppData schema.
 * This is the SINGLE source of truth for all data migrations.
 * Both localStorage and cloud data MUST go through this function.
 */
export function migrateData(rawData: any): AppData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = { ...rawData };

  // Ensure subjects array exists
  if (!Array.isArray(data.subjects)) data.subjects = [];
  if (!Array.isArray(data.schedule)) data.schedule = [];

  // Migrate old data - add missing fields with defaults
  if (!data.timerSessions) data.timerSessions = [];
  if (!data.gpaData) data.gpaData = defaultGPAData;
  if (!data.usageData) data.usageData = defaultUsageData;
  if (!data.questionBanks) data.questionBanks = [];
  if (!data.pomodoroSettings) data.pomodoroSettings = defaultPomodoroSettings;
  if (!data.studyGoals) data.studyGoals = defaultStudyGoals;
  if (!data.studyGoals.monthlyMinutes) data.studyGoals.monthlyMinutes = 4800;
  if (data.studyGoals.vacationMode === undefined) data.studyGoals.vacationMode = false;
  if (data.studyGoals.vacationMultiplier === undefined) data.studyGoals.vacationMultiplier = 0.4;
  if (!data.academicPeriod) data.academicPeriod = defaultAcademicPeriod;
  if (!data.userProgress) data.userProgress = defaultUserProgress;
  if (!data.clinicalCaseSessions) data.clinicalCaseSessions = defaultClinicalCaseSessions;
  if (!data.orRoomSessions) data.orRoomSessions = { activeCaseId: null, cases: [], totalCasesCompleted: 0, averageScore: 0 };

  // Phase 1: Vayne Doctor migrations
  if (!data.developmentProjects) data.developmentProjects = [];
  if (data.careerProfile === undefined) data.careerProfile = null;

  // Academic Events migration
  if (!data.academicEvents) data.academicEvents = [];

  // Dashboard widgets migration
  if (data.lastOpenedTopic === undefined) data.lastOpenedTopic = null;
  if (!data.dailyGoals) data.dailyGoals = [];

  // Sync metadata migration - stamp lastModified if missing
  if (!data.lastModified) data.lastModified = new Date().toISOString();

  // Phase 2: Migrate ProjectModule to have learning infrastructure
  if (data.developmentProjects && data.developmentProjects.length > 0) {
    data.developmentProjects = data.developmentProjects.map((project: DevelopmentProject) => ({
      ...project,
      modules: (project.modules || []).map((module: ProjectModule) => ({
        ...module,
        material: module.material ?? '',
        materialImages: module.materialImages ?? [],
        grades: module.grades ?? [],
        avgGrade: module.avgGrade ?? null,
        quizCount: module.quizCount ?? 0,
        quizHistory: module.quizHistory ?? [],
        currentBloomLevel: module.currentBloomLevel ?? 1,
        lastReview: module.lastReview ?? null,
        wrongAnswers: module.wrongAnswers ?? [],
        readCount: module.readCount ?? 0,
        lastRead: module.lastRead ?? null,
        size: module.size ?? null,
        sizeSetBy: module.sizeSetBy ?? null,
        highlights: module.highlights ?? [],
      }))
    }));
  }

  // Migrate: Calculate stats from existing data
  if (data.userProgress && data.subjects) {
    let topicsCompleted = 0;
    let greenTopics = 0;
    let quizzesTaken = 0;

    (data.subjects as LegacySubject[]).forEach((subject) => {
      (subject.topics || []).forEach((topic) => {
        if (topic.status !== 'gray') topicsCompleted++;
        if (topic.status === 'green') greenTopics++;
        quizzesTaken += topic.quizCount || 0;
      });
    });

    if (!data.userProgress.stats) {
      data.userProgress.stats = {
        topicsCompleted: 0,
        quizzesTaken: 0,
        perfectQuizzes: 0,
        greenTopics: 0,
        longestStreak: 0
      };
    }
    data.userProgress.stats.topicsCompleted = topicsCompleted;
    data.userProgress.stats.greenTopics = greenTopics;
    data.userProgress.stats.quizzesTaken = quizzesTaken;
  }

  // Remove deprecated focusSession
  delete data.focusSession;

  // Migrate subjects and topics - add missing fields
  data.subjects = (data.subjects as LegacySubject[]).map((subject): Subject => ({
    ...subject,
    subjectType: subject.subjectType ?? 'preclinical',
    examFormat: subject.examFormat ?? null,
    topics: (subject.topics || []).map((topic): Topic => ({
      ...topic,
      material: topic.material || '',
      materialImages: topic.materialImages || [],
      currentBloomLevel: (topic.currentBloomLevel || 1) as BloomLevel,
      quizHistory: (topic.quizHistory || []).map((qr) => ({
        ...qr,
        weight: qr.weight ?? 1.0
      })),
      readCount: topic.readCount ?? 0,
      lastRead: topic.lastRead ?? null,
      size: topic.size ?? null,
      sizeSetBy: topic.sizeSetBy ?? null,
      wrongAnswers: topic.wrongAnswers ?? [],
      highlights: topic.highlights ?? []
    }))
  }));

  // Migrate dailyStatus - remove old fields, add holiday
  if (!data.dailyStatus) {
    data.dailyStatus = { date: getTodayString(), sick: false, holiday: false };
  }
  const today = getTodayString();
  if (data.dailyStatus.date !== today || data.dailyStatus.holiday === undefined) {
    data.dailyStatus = {
      date: today,
      sick: data.dailyStatus.sick ?? false,
      holiday: data.dailyStatus.holiday ?? false
    };
  }
  delete data.dailyStatus.sleep;
  delete data.dailyStatus.energy;
  delete data.dailyStatus.availableHours;

  // Reset usage data if new month
  if (data.usageData?.lastReset) {
    const lastReset = new Date(data.usageData.lastReset);
    const now = new Date();
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      data.usageData = { ...defaultUsageData, lastReset: today };
    }
  }

  return data as AppData;
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
        // Decompression failed - try to parse as uncompressed JSON (recovery attempt)
        console.warn('Decompression failed, attempting to parse as raw JSON');
        try {
          JSON.parse(stored); // Test if it's valid JSON
          // If we get here, stored is valid JSON - compression flag was incorrect
          localStorage.setItem(COMPRESSED_FLAG, 'false');
        } catch {
          console.error('Data recovery failed - backing up corrupted data');
          // Save corrupted data as backup before returning defaults
          try {
            localStorage.setItem('vayne-study-backup-corrupted', stored);
            console.warn('Corrupted data backed up to vayne-study-backup-corrupted');
          } catch { /* ignore backup failure */ }
          return defaultData;
        }
      } else {
        stored = decompressed;
      }
    }

    const data = JSON.parse(stored);

    // Run through the shared migration pipeline
    const migrated = migrateData(data);

    // Apply decay to all topics - only once per day (localStorage-specific)
    const lastDecayDate = localStorage.getItem('vayne-last-decay-date');
    const today = getTodayString();
    if (lastDecayDate !== today) {
      migrated.subjects = applyDecayToSubjects(migrated.subjects);
      localStorage.setItem('vayne-last-decay-date', today);
    }

    // Load materials from cache (initialized from IndexedDB at startup) and merge into topics
    migrated.subjects = migrated.subjects.map((subject: Subject) => ({
      ...subject,
      topics: subject.topics.map((topic: Topic) => ({
        ...topic,
        material: materialsCache[topic.id] || topic.material || ''
      }))
    }));

    return migrated;
  } catch (error) {
    console.error('Error loading data:', error);
    return defaultData;
  }
}

export function saveData(data: AppData): StorageError {
  if (typeof window === 'undefined') return null;

  try {
    // Extract materials from topics and save to IndexedDB (via cache)
    // Create a copy of data without materials in topics (to reduce main storage size)
    const dataToSave = {
      ...data,
      subjects: data.subjects.map(subject => ({
        ...subject,
        topics: subject.topics.map(topic => {
          // If topic has material, save it to IndexedDB via setMaterial
          if (topic.material && topic.material.length > 0) {
            // Update cache and persist asynchronously
            if (materialsCache[topic.id] !== topic.material) {
              setMaterial(topic.id, topic.material);
            }
          } else if (materialsCache[topic.id]) {
            // Material was cleared - remove from cache and IndexedDB
            setMaterial(topic.id, '');
          }
          // Return topic without material (material is loaded lazily from IndexedDB)
          return {
            ...topic,
            material: '', // Don't store in main data
            materialImages: topic.materialImages || []
          };
        })
      }))
    };

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

    // Auto-backup to IndexedDB (debounced - max once per 60s)
    debouncedBackupSnapshot(data);

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

// Debounced auto-backup: saves snapshot to IndexedDB max once per 60s
let backupTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedBackupSnapshot(data: AppData): void {
  if (backupTimeout) return; // Already scheduled
  backupTimeout = setTimeout(() => {
    backupTimeout = null;
    saveBackupSnapshot(data, 'auto').catch(() => {});
  }, 60000);
}

export async function clearData(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Pre-backup before clearing: save current data to IndexedDB as safety net
  try {
    const currentData = loadData();
    if (currentData.subjects.length > 0) {
      await saveBackupSnapshot(currentData, 'pre-clear');
      console.log('[STORAGE] Pre-clear backup saved to IndexedDB');
    }
  } catch { /* best effort */ }

  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MATERIALS_KEY);
  localStorage.removeItem(COMPRESSED_FLAG);
  localStorage.removeItem('vayne-last-decay-date');
  localStorage.removeItem('vayne-last-backup');
  localStorage.removeItem('vayne-dismissed-alerts');
  localStorage.removeItem('vayne-sidebar-expanded');
  localStorage.removeItem('vayne-study-backup-corrupted');
  localStorage.removeItem('vayne-idb-migrated');
  // Note: claude-api-key and anki-* are intentionally kept (user config)

  // Reset in-memory materials cache
  materialsCache = {};
  materialsCacheLoaded = false;
  materialsCachePromise = null;

  // Clear IndexedDB materials ONLY (keep backups store)
  try {
    const { clearMaterialsStore } = await import('./indexeddb-storage');
    await clearMaterialsStore();
  } catch {
    // IndexedDB not available
  }
}
