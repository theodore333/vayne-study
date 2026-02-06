'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppData, Subject, Topic, ScheduleClass, DailyStatus, TopicStatus, TimerSession, SemesterGrade, GPAData, UsageData, SubjectType, BankQuestion, ClinicalCase, PomodoroSettings, StudyGoals, AcademicPeriod, Achievement, UserProgress, TopicSize, ClinicalCaseSession, DevelopmentProject, ProjectModule, ProjectInsight, CareerProfile, WrongAnswer, TextHighlight, BloomLevel, QuizResult, AcademicEvent, LastOpenedTopic, DailyGoal } from './types';
import { loadData, saveData, migrateData, setStorageErrorCallback, StorageError, getStorageUsage, initMaterialsCache } from './storage';
import { loadFromCloud, debouncedSaveToCloud } from './cloud-sync';
import { generateId, getTodayString, gradeToStatus, initializeFSRS, updateFSRS } from './algorithms';
import { calculateTopicXp, calculateQuizXp, calculateLevel, updateCombo, getComboMultiplier, checkAchievements, defaultUserProgress } from './gamification';

// Full sanitizer - runs ONLY at load time (not on mutations = no perf impact)
// Ensures EVERY field that React might render is the correct primitive type
function sanitizeLoadedData(data: AppData): AppData {
  try {
    const issues: string[] = [];
    const s = (v: unknown, fb = '', field = ''): string => {
      if (typeof v === 'string') return v;
      if (v !== undefined && v !== null && v !== '') issues.push(`${field}: expected string, got ${typeof v} (${JSON.stringify(v)?.slice(0,50)})`);
      return fb;
    };
    const n = (v: unknown, fb = 0, field = ''): number => {
      if (typeof v === 'number' && !isNaN(v)) return v;
      if (v !== undefined && v !== null && v !== 0) issues.push(`${field}: expected number, got ${typeof v} (${JSON.stringify(v)?.slice(0,50)})`);
      return fb;
    };
    const b = (v: unknown, fb = false): boolean => typeof v === 'boolean' ? v : fb;
    const a = (v: unknown, field = ''): any[] => {
      if (Array.isArray(v)) return v;
      if (v !== undefined && v !== null) issues.push(`${field}: expected array, got ${typeof v}`);
      return [];
    };
    const o = (v: unknown, fb: any): any => (v && typeof v === 'object' && !Array.isArray(v)) ? v : fb;
    const sn = (v: unknown): string | null => typeof v === 'string' ? v : null;

    const d = (data || {}) as any;

    // userProgress
    const rp = o(d.userProgress, {});
    const userProgress = {
      ...defaultUserProgress,
      ...rp,
      xp: n(rp.xp, 0, 'userProgress.xp'),
      level: n(rp.level, 1, 'userProgress.level'),
      totalXpEarned: n(rp.totalXpEarned, 0, 'userProgress.totalXpEarned'),
      achievements: a(rp.achievements, 'userProgress.achievements'),
      combo: {
        count: n(rp.combo?.count),
        lastActionTime: sn(rp.combo?.lastActionTime),
      },
      stats: {
        topicsCompleted: n(rp.stats?.topicsCompleted),
        quizzesTaken: n(rp.stats?.quizzesTaken),
        perfectQuizzes: n(rp.stats?.perfectQuizzes),
        greenTopics: n(rp.stats?.greenTopics),
        longestStreak: n(rp.stats?.longestStreak),
      },
    };

    // studyGoals
    const rg = o(d.studyGoals, {});
    const studyGoals = {
      dailyMinutes: n(rg.dailyMinutes, 480),
      weeklyMinutes: n(rg.weeklyMinutes, 2880),
      monthlyMinutes: n(rg.monthlyMinutes, 12480),
      weekendDailyMinutes: n(rg.weekendDailyMinutes, 240),
      useWeekendHours: b(rg.useWeekendHours, true),
      vacationMode: b(rg.vacationMode),
      vacationMultiplier: n(rg.vacationMultiplier, 0.4),
      ...(rg.fsrsEnabled !== undefined ? { fsrsEnabled: b(rg.fsrsEnabled) } : {}),
      ...(rg.fsrsTargetRetention !== undefined ? { fsrsTargetRetention: n(rg.fsrsTargetRetention, 0.85) } : {}),
      ...(rg.fsrsMaxReviewsPerDay !== undefined ? { fsrsMaxReviewsPerDay: n(rg.fsrsMaxReviewsPerDay, 20) } : {}),
      ...(rg.fsrsMaxInterval !== undefined ? { fsrsMaxInterval: n(rg.fsrsMaxInterval, 365) } : {}),
    };

    // usageData
    const ru = o(d.usageData, {});
    const usageData = {
      dailyCalls: n(ru.dailyCalls, 0, 'usageData.dailyCalls'),
      monthlyCost: n(ru.monthlyCost, 0, 'usageData.monthlyCost'),
      monthlyBudget: n(ru.monthlyBudget, 5, 'usageData.monthlyBudget'),
      lastReset: s(ru.lastReset, getTodayString(), 'usageData.lastReset'),
    };

    // dailyStatus
    const rd = o(d.dailyStatus, {});
    const dailyStatus = {
      date: s(rd.date, getTodayString()),
      sick: b(rd.sick),
      holiday: b(rd.holiday),
    };

    // pomodoroSettings
    const rpm = o(d.pomodoroSettings, {});
    const pomodoroSettings = {
      workDuration: n(rpm.workDuration, 25),
      shortBreakDuration: n(rpm.shortBreakDuration, 5),
      longBreakDuration: n(rpm.longBreakDuration, 15),
      longBreakAfter: n(rpm.longBreakAfter, 4),
      autoStartBreaks: b(rpm.autoStartBreaks),
      autoStartWork: b(rpm.autoStartWork),
      soundEnabled: b(rpm.soundEnabled, true),
    };

    // academicPeriod
    const rap = o(d.academicPeriod, {});
    const academicPeriod = {
      semesterStart: sn(rap.semesterStart),
      semesterEnd: sn(rap.semesterEnd),
      sessionStart: sn(rap.sessionStart),
      sessionEnd: sn(rap.sessionEnd),
    };

    // gpaData
    const rgpa = o(d.gpaData, {});
    const gpaData = {
      grades: a(rgpa.grades),
      targetGPA: n(rgpa.targetGPA, 5.5),
      stateExams: a(rgpa.stateExams),
    };

    // clinicalCaseSessions
    const rcc = o(d.clinicalCaseSessions, {});
    const clinicalCaseSessions = {
      activeCaseId: sn(rcc.activeCaseId),
      cases: a(rcc.cases),
      totalCasesCompleted: n(rcc.totalCasesCompleted),
      averageScore: n(rcc.averageScore),
    };

    // orRoomSessions
    const ror = o(d.orRoomSessions, {});
    const orRoomSessions = {
      activeCaseId: sn(ror.activeCaseId),
      cases: a(ror.cases),
      totalCasesCompleted: n(ror.totalCasesCompleted),
      averageScore: n(ror.averageScore),
    };

    // subjects + topics
    const subjects = a(d.subjects, 'subjects').map((subj: any) => ({
      ...subj,
      id: s(subj.id, generateId(), `subject[${subj.id}].id`),
      name: s(subj.name, 'Без име', `subject[${subj.id}].name`),
      color: s(subj.color, '#6366f1', `subject[${subj.id}].color`),
      subjectType: s(subj.subjectType, 'preclinical', `subject[${subj.id}].subjectType`),
      examDate: sn(subj.examDate),
      examFormat: sn(subj.examFormat),
      semester: typeof subj.semester === 'string' ? subj.semester : undefined,
      archived: b(subj.archived),
      deletedAt: sn(subj.deletedAt),
      createdAt: s(subj.createdAt, new Date().toISOString(), `subject[${subj.id}].createdAt`),
      topics: a(subj.topics, `subject[${subj.id}].topics`).map((t: any) => ({
        ...t,
        id: s(t.id, generateId(), `topic.id`),
        name: s(t.name, 'Без име', `topic[${t.id}].name`),
        number: n(t.number, 1, `topic[${t.id}].number`),
        status: s(t.status, 'gray', `topic[${t.id}].status`),
        material: s(t.material, '', `topic[${t.id}].material`),
        materialImages: a(t.materialImages, `topic[${t.id}].materialImages`),
        grades: a(t.grades, `topic[${t.id}].grades`).filter((g: any) => typeof g === 'number'),
        avgGrade: typeof t.avgGrade === 'number' ? t.avgGrade : null,
        quizCount: n(t.quizCount, 0, `topic[${t.id}].quizCount`),
        quizHistory: a(t.quizHistory, `topic[${t.id}].quizHistory`),
        lastReview: sn(t.lastReview),
        currentBloomLevel: n(t.currentBloomLevel, 1, `topic[${t.id}].currentBloomLevel`),
        readCount: n(t.readCount, 0, `topic[${t.id}].readCount`),
        lastRead: sn(t.lastRead),
        size: (t.size === 'small' || t.size === 'medium' || t.size === 'large') ? t.size : null,
        sizeSetBy: (t.sizeSetBy === 'ai' || t.sizeSetBy === 'user') ? t.sizeSetBy : null,
        section: (t.section === 'theoretical' || t.section === 'practical') ? t.section : undefined,
        wrongAnswers: a(t.wrongAnswers),
        highlights: a(t.highlights),
      })),
    }));

    // Log any issues found (helps diagnose error #310)
    if (issues.length > 0) {
      console.warn('[SANITIZE] Fixed', issues.length, 'field(s):', issues);
    }

    return {
      ...d,
      subjects,
      schedule: a(d.schedule, 'schedule'),
      dailyStatus,
      timerSessions: a(d.timerSessions, 'timerSessions'),
      gpaData,
      usageData,
      questionBanks: a(d.questionBanks, 'questionBanks'),
      pomodoroSettings,
      studyGoals,
      academicPeriod,
      userProgress,
      clinicalCaseSessions,
      orRoomSessions,
      developmentProjects: a(d.developmentProjects, 'developmentProjects'),
      careerProfile: d.careerProfile === null || (typeof d.careerProfile === 'object' && d.careerProfile !== null) ? d.careerProfile : null,
      academicEvents: a(d.academicEvents, 'academicEvents'),
      lastOpenedTopic: d.lastOpenedTopic === null || (typeof d.lastOpenedTopic === 'object' && d.lastOpenedTopic !== null) ? d.lastOpenedTopic : null,
      dailyGoals: a(d.dailyGoals, 'dailyGoals'),
    } as AppData;
  } catch (e) {
    console.error('[SANITIZE] Failed:', e);
    return data;
  }
}

interface AppContextType {
  data: AppData;
  isLoading: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  syncNow: () => Promise<void>;

  // Subject operations
  addSubject: (name: string, color: string, subjectType: SubjectType, examDate: string | null, examFormat: string | null) => void;
  updateSubject: (id: string, updates: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;
  archiveSubject: (id: string) => void;
  unarchiveSubject: (id: string) => void;
  duplicateSubject: (id: string, newName?: string) => void;
  exportSubjectToJSON: (id: string) => string | null;
  importSubjectFromJSON: (json: string) => boolean;
  // Soft delete operations
  softDeleteSubject: (id: string) => void;
  restoreSubject: (id: string) => void;
  permanentlyDeleteSubject: (id: string) => void;
  emptyTrash: () => void;

  // Topic operations
  addTopics: (subjectId: string, topics: Omit<Topic, 'id'>[]) => void;
  updateTopic: (subjectId: string, topicId: string, updates: Partial<Topic>) => void;
  deleteTopic: (subjectId: string, topicId: string) => void;
  setTopicStatus: (subjectId: string, topicId: string, status: TopicStatus) => void;
  addGrade: (subjectId: string, topicId: string, grade: number, quizMeta?: { bloomLevel?: number; questionsCount?: number; correctAnswers?: number; weight?: number }) => void;
  updateTopicMaterial: (subjectId: string, topicId: string, material: string) => void;
  trackTopicRead: (subjectId: string, topicId: string) => void;
  // Smart Scheduling operations
  updateTopicSize: (subjectId: string, topicId: string, size: TopicSize | null, setBy: 'ai' | 'user') => void;

  // Schedule operations
  addClass: (scheduleClass: Omit<ScheduleClass, 'id'>) => void;
  updateClass: (id: string, updates: Partial<ScheduleClass>) => void;
  deleteClass: (id: string) => void;

  // Daily status
  updateDailyStatus: (status: Partial<DailyStatus>) => void;

  // Timer operations
  startTimer: (subjectId: string, topicId: string | null) => void;
  stopTimer: (rating: number | null) => void;
  addPomodoroSession: (durationMinutes: number, subjectId?: string, topicId?: string | null, note?: string, rating?: number | null) => void;

  // GPA operations
  addSemesterGrade: (grade: Omit<SemesterGrade, 'id'>) => void;
  updateSemesterGrade: (id: string, updates: Partial<SemesterGrade>) => void;
  deleteSemesterGrade: (id: string) => void;
  setTargetGPA: (target: number) => void;
  addStateExam: (exam: { name: string; grade: number }) => void;
  deleteStateExam: (index: number) => void;

  // Usage tracking
  incrementApiCalls: (cost: number) => void;
  updateUsageBudget: (budget: number) => void;

  // Question Bank operations
  addQuestionBank: (subjectId: string, name: string) => string;
  addQuestionsToBank: (bankId: string, questions: Omit<BankQuestion, 'id'>[], cases: Omit<ClinicalCase, 'id'>[]) => void;
  updateQuestionStats: (bankId: string, questionId: string, correct: boolean) => void;
  deleteQuestionBank: (bankId: string) => void;
  deleteQuestion: (bankId: string, questionId: string) => void;

  // Pomodoro & Goals operations
  updatePomodoroSettings: (settings: Partial<PomodoroSettings>) => void;
  updateStudyGoals: (goals: Partial<StudyGoals>) => void;
  updateAcademicPeriod: (period: Partial<AcademicPeriod>) => void;
  cleanOldTimerSessions: (cutoffDate: Date) => void;

  // Timer with distraction note
  stopTimerWithNote: (rating: number | null, distractionNote?: string) => void;

  // Gamification
  earnXp: (amount: number, reason: string) => void;
  newAchievements: Achievement[];
  clearNewAchievements: () => void;

  // UI State
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Storage
  storageError: { error: StorageError; message?: string } | null;
  clearStorageError: () => void;
  getStorageUsage: () => { used: number; total: number; percentage: number };

  // Development Projects (Phase 1: Vayne Doctor)
  addProject: (project: Omit<DevelopmentProject, 'id' | 'createdAt' | 'updatedAt' | 'progressPercent' | 'timeInvested' | 'insights'>) => void;
  updateProject: (id: string, updates: Partial<DevelopmentProject>) => void;
  deleteProject: (id: string) => void;
  addProjectModule: (projectId: string, module: Omit<ProjectModule, 'id'>) => void;
  updateProjectModule: (projectId: string, moduleId: string, updates: Partial<ProjectModule>) => void;
  deleteProjectModule: (projectId: string, moduleId: string) => void;
  addProjectInsight: (projectId: string, insight: Omit<ProjectInsight, 'id' | 'date'>) => void;
  toggleInsightApplied: (projectId: string, insightId: string) => void;
  deleteProjectInsight: (projectId: string, insightId: string) => void;

  // Module Learning Operations (Phase 2: Projects 2.0)
  addModuleGrade: (projectId: string, moduleId: string, grade: number, quizMeta?: { bloomLevel?: number; questionsCount?: number; correctAnswers?: number; weight?: number }) => void;
  updateModuleMaterial: (projectId: string, moduleId: string, material: string, images?: string[]) => void;
  trackModuleRead: (projectId: string, moduleId: string) => void;
  updateModuleSize: (projectId: string, moduleId: string, size: TopicSize | null, setBy: 'ai' | 'user') => void;
  addModuleWrongAnswer: (projectId: string, moduleId: string, wrongAnswer: WrongAnswer) => void;
  updateModuleHighlights: (projectId: string, moduleId: string, highlights: TextHighlight[]) => void;

  // Career Profile (Phase 1: Vayne Doctor)
  updateCareerProfile: (profile: Partial<CareerProfile>) => void;

  // Academic Events (Колоквиуми, Контролни)
  addAcademicEvent: (event: Omit<AcademicEvent, 'id' | 'createdAt'>) => void;
  updateAcademicEvent: (id: string, updates: Partial<AcademicEvent>) => void;
  deleteAcademicEvent: (id: string) => void;

  // Dashboard Features
  setLastOpenedTopic: (subjectId: string, topicId: string) => void;
  addDailyGoal: (text: string, type: 'daily' | 'weekly') => void;
  toggleDailyGoal: (id: string) => void;
  deleteDailyGoal: (id: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// Helper function to calculate study streak from timer sessions
function getLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calculateStudyStreak(sessions: TimerSession[]): number {
  const dates = new Set(
    sessions.filter(s => s.endTime !== null).map(s => {
      const d = new Date(s.startTime);
      return getLocalDateStr(d);
    })
  );
  let count = 0;
  const checkDate = new Date();
  while (true) {
    const dateStr = getLocalDateStr(checkDate);
    if (dates.has(dateStr)) {
      count++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (count === 0) {
      // Allow skipping today if no session yet
      checkDate.setDate(checkDate.getDate() - 1);
      if (dates.has(getLocalDateStr(checkDate))) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      break;
    } else break;
  }
  return count;
}

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
  dailyMinutes: 480,   // 8 hours (weekdays)
  weeklyMinutes: 2880, // auto: 8*5 + 4*2 = 48 hours
  monthlyMinutes: 12480, // auto: ~4.3 weeks
  weekendDailyMinutes: 240, // 4 hours (weekends)
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>({
    subjects: [],
    schedule: [],
    dailyStatus: {
      date: getTodayString(),
      sick: false,
      holiday: false
    },
    timerSessions: [],
    gpaData: defaultGPAData,
    usageData: defaultUsageData,
    questionBanks: [],
    pomodoroSettings: defaultPomodoroSettings,
    studyGoals: defaultStudyGoals,
    academicPeriod: defaultAcademicPeriod,
    userProgress: defaultUserProgress,
    clinicalCaseSessions: {
      activeCaseId: null,
      cases: [],
      totalCasesCompleted: 0,
      averageScore: 0
    },
    orRoomSessions: {
      activeCaseId: null,
      cases: [],
      totalCasesCompleted: 0,
      averageScore: 0
    },
    // Phase 1: Vayne Doctor
    developmentProjects: [],
    careerProfile: null,
    // Academic Events
    academicEvents: [],
    // Dashboard Features
    lastOpenedTopic: null,
    dailyGoals: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [newAchievements, setNewAchievements] = useState<Achievement[]>([]);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [storageError, setStorageError] = useState<{ error: StorageError; message?: string } | null>(null);

  // Set up storage error callback
  useEffect(() => {
    setStorageErrorCallback((error, message) => {
      if (error) {
        setStorageError({ error, message });
      }
    });
    return () => setStorageErrorCallback(null);
  }, []);

  const clearStorageError = useCallback(() => {
    setStorageError(null);
  }, []);

  // Load sidebar state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebar-collapsed');
      if (saved === 'true') setSidebarCollapsedState(true);
    } catch { /* localStorage unavailable */ }
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try { localStorage.setItem('sidebar-collapsed', String(collapsed)); } catch { /* quota/access error */ }
  }, []);

  useEffect(() => {
    const initData = async () => {
      if (process.env.NODE_ENV === 'development') console.log('[CONTEXT] Starting data initialization...');

      // Initialize materials cache from IndexedDB (handles migration from localStorage)
      await initMaterialsCache();

      // First load from localStorage for instant display
      const localData = loadData();

      // Log what we loaded (dev only)
      if (process.env.NODE_ENV === 'development') {
        const topicsWithMaterial = localData.subjects.flatMap(s => s.topics.filter(t => t.material && t.material.length > 0));
        console.log('[CONTEXT] Loaded', topicsWithMaterial.length, 'topics with material');
      }

      setData(sanitizeLoadedData(localData));

      // Then try to load from cloud
      try {
        const cloudData = await loadFromCloud();
        if (cloudData) {
          // Merge: use cloud data but keep local if newer
          const localTime = new Date(localData.dailyStatus.date).getTime();
          const cloudTime = new Date((cloudData as any).dailyStatus?.date || '2000-01-01').getTime();

          if (cloudTime >= localTime) {
            // CRITICAL FIX: Cloud data must go through the SAME migration pipeline as local data.
            const migratedCloud = migrateData(cloudData);

            // SAFETY: Never let cloud data wipe out local data
            // If local has more subjects or topics, local wins
            const localTopicCount = localData.subjects.reduce((sum, s) => sum + s.topics.length, 0);
            const cloudTopicCount = migratedCloud.subjects.reduce((sum, s) => sum + s.topics.length, 0);
            const localBankCount = (localData.questionBanks || []).length;
            const cloudBankCount = (migratedCloud.questionBanks || []).length;

            if (migratedCloud.subjects.length < localData.subjects.length ||
                cloudTopicCount < localTopicCount * 0.5 ||
                cloudBankCount < localBankCount) {
              console.warn('[CONTEXT] Cloud data has LESS content than local - keeping local data.',
                `Local: ${localData.subjects.length} subjects, ${localTopicCount} topics, ${localBankCount} banks.`,
                `Cloud: ${migratedCloud.subjects.length} subjects, ${cloudTopicCount} topics, ${cloudBankCount} banks.`
              );
              // Push local data TO cloud instead (local is richer)
              debouncedSaveToCloud(localData);
            } else {
              // Cloud is safe to use - merge materials from local IndexedDB cache
              const { getMaterialsCache } = await import('./storage');
              const materialsCache = getMaterialsCache();
              migratedCloud.subjects = migratedCloud.subjects.map(subject => ({
                ...subject,
                topics: subject.topics.map(topic => ({
                  ...topic,
                  material: materialsCache[topic.id] || topic.material || ''
                }))
              }));

              setData(sanitizeLoadedData(migratedCloud));
              saveData(migratedCloud);
            }
          }
          setLastSynced(new Date());
        }
      } catch (error) {
        console.error('Failed to load from cloud:', error);
      }

      setIsLoading(false);
    };

    initData();
  }, []);

  const updateData = useCallback((updater: (prev: AppData) => AppData) => {
    setData(prev => {
      const newData = updater(prev);
      saveData(newData);
      debouncedSaveToCloud(newData);
      return newData;
    });
  }, []);

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { saveToCloud } = await import('./cloud-sync');
      await saveToCloud(data);
      setLastSynced(new Date());
    } catch (error) {
      console.error('Sync failed:', error);
    }
    setIsSyncing(false);
  }, [data]);

  // Subject operations
  const addSubject = useCallback((name: string, color: string, subjectType: SubjectType, examDate: string | null, examFormat: string | null) => {
    updateData(prev => ({
      ...prev,
      subjects: [...prev.subjects, {
        id: generateId(),
        name,
        color,
        subjectType,
        examDate,
        examFormat,
        topics: [],
        createdAt: new Date().toISOString()
      }]
    }));
  }, [updateData]);

  const updateSubject = useCallback((id: string, updates: Partial<Subject>) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  }, [updateData]);

  const deleteSubject = useCallback((id: string) => {
    updateData(prev => {
      // Find the subject to calculate stats to decrement
      const subjectToDelete = prev.subjects.find(s => s.id === id);
      let statsDecrements = { topicsCompleted: 0, greenTopics: 0, quizzesTaken: 0 };

      if (subjectToDelete) {
        subjectToDelete.topics.forEach(topic => {
          if (topic.status !== 'gray') statsDecrements.topicsCompleted++;
          if (topic.status === 'green') statsDecrements.greenTopics++;
          statsDecrements.quizzesTaken += topic.quizCount || 0;
        });
      }

      const currentStats = prev.userProgress?.stats || {
        topicsCompleted: 0, quizzesTaken: 0, perfectQuizzes: 0, greenTopics: 0, longestStreak: 0
      };

      return {
        ...prev,
        subjects: prev.subjects.filter(s => s.id !== id),
        schedule: prev.schedule.filter(c => c.subjectId !== id),
        // Cascade delete: remove orphaned academic events
        academicEvents: prev.academicEvents.filter(e => e.subjectId !== id),
        // Cascade delete: remove orphaned question banks
        questionBanks: prev.questionBanks.filter(b => b.subjectId !== id),
        userProgress: {
          ...prev.userProgress,
          stats: {
            ...currentStats,
            topicsCompleted: Math.max(0, currentStats.topicsCompleted - statsDecrements.topicsCompleted),
            greenTopics: Math.max(0, currentStats.greenTopics - statsDecrements.greenTopics),
            quizzesTaken: Math.max(0, currentStats.quizzesTaken - statsDecrements.quizzesTaken)
          }
        }
      };
    });
  }, [updateData]);

  const archiveSubject = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === id ? { ...s, archived: true } : s)
    }));
  }, [updateData]);

  const unarchiveSubject = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => s.id === id ? { ...s, archived: false } : s)
    }));
  }, [updateData]);

  const duplicateSubject = useCallback((id: string, newName?: string) => {
    updateData(prev => {
      const original = prev.subjects.find(s => s.id === id);
      if (!original) return prev;

      const duplicated: Subject = {
        ...original,
        id: generateId(),
        name: newName || `${original.name} (копие)`,
        createdAt: new Date().toISOString(),
        archived: false,
        topics: original.topics.map(t => ({
          ...t,
          id: generateId(),
          // Reset progress for duplicated topics
          status: 'gray' as TopicStatus,
          grades: [],
          avgGrade: null,
          quizCount: 0,
          quizHistory: [],
          lastReview: null,
          readCount: 0,
          lastRead: null,
          wrongAnswers: [],
          highlights: [],
          fsrs: undefined
        }))
      };

      return {
        ...prev,
        subjects: [...prev.subjects, duplicated]
      };
    });
  }, [updateData]);

  const exportSubjectToJSON = useCallback((id: string): string | null => {
    const subject = data.subjects.find(s => s.id === id);
    if (!subject) return null;

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      subject: {
        ...subject,
        // Remove IDs as they'll be regenerated on import
        id: undefined,
        topics: subject.topics.map(t => ({
          ...t,
          id: undefined
        }))
      }
    };

    return JSON.stringify(exportData, null, 2);
  }, [data.subjects]);

  const importSubjectFromJSON = useCallback((json: string): boolean => {
    try {
      const importData = JSON.parse(json);
      if (!importData.version || !importData.subject) {
        console.error('Invalid import format');
        return false;
      }

      const src = importData.subject;
      const importedSubject: Subject = {
        id: generateId(),
        name: typeof src.name === 'string' ? src.name : 'Внесен предмет',
        color: typeof src.color === 'string' ? src.color : '#6366f1',
        subjectType: typeof src.subjectType === 'string' ? src.subjectType as SubjectType : 'preclinical',
        examDate: typeof src.examDate === 'string' ? src.examDate : null,
        examFormat: typeof src.examFormat === 'string' ? src.examFormat : null,
        semester: typeof src.semester === 'string' ? src.semester : undefined,
        createdAt: new Date().toISOString(),
        archived: false,
        topics: (Array.isArray(src.topics) ? src.topics : []).map((t: any) => ({
          id: generateId(),
          name: typeof t.name === 'string' ? t.name : 'Без име',
          number: typeof t.number === 'number' ? t.number : 1,
          material: typeof t.material === 'string' ? t.material : '',
          materialImages: Array.isArray(t.materialImages) ? t.materialImages : [],
          section: (t.section === 'theoretical' || t.section === 'practical') ? t.section : undefined,
          size: (t.size === 'small' || t.size === 'medium' || t.size === 'large') ? t.size : null,
          sizeSetBy: (t.sizeSetBy === 'ai' || t.sizeSetBy === 'user') ? t.sizeSetBy : null,
          currentBloomLevel: typeof t.currentBloomLevel === 'number' ? t.currentBloomLevel : 1,
          // Reset progress
          status: 'gray' as TopicStatus,
          grades: [],
          avgGrade: null,
          quizCount: 0,
          quizHistory: [],
          lastReview: null,
          readCount: 0,
          lastRead: null,
          wrongAnswers: [],
          highlights: [],
          fsrs: undefined
        }))
      };

      updateData(prev => ({
        ...prev,
        subjects: [...prev.subjects, importedSubject]
      }));

      return true;
    } catch (error) {
      console.error('Import error:', error);
      return false;
    }
  }, [updateData]);

  // Soft delete operations
  const softDeleteSubject = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s =>
        s.id === id ? { ...s, deletedAt: new Date().toISOString() } : s
      )
    }));
  }, [updateData]);

  const restoreSubject = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s =>
        s.id === id ? { ...s, deletedAt: null } : s
      )
    }));
  }, [updateData]);

  const permanentlyDeleteSubject = useCallback((id: string) => {
    updateData(prev => {
      // Find the subject to calculate stats to decrement
      const subjectToDelete = prev.subjects.find(s => s.id === id);
      let statsDecrements = { topicsCompleted: 0, greenTopics: 0, quizzesTaken: 0 };

      if (subjectToDelete) {
        subjectToDelete.topics.forEach(topic => {
          if (topic.status !== 'gray') statsDecrements.topicsCompleted++;
          if (topic.status === 'green') statsDecrements.greenTopics++;
          statsDecrements.quizzesTaken += topic.quizCount || 0;
        });
      }

      const currentStats = prev.userProgress?.stats || {
        topicsCompleted: 0, quizzesTaken: 0, perfectQuizzes: 0, greenTopics: 0, longestStreak: 0
      };

      return {
        ...prev,
        subjects: prev.subjects.filter(s => s.id !== id),
        schedule: prev.schedule.filter(c => c.subjectId !== id),
        academicEvents: prev.academicEvents.filter(e => e.subjectId !== id),
        questionBanks: prev.questionBanks.filter(b => b.subjectId !== id),
        userProgress: {
          ...prev.userProgress,
          stats: {
            ...currentStats,
            topicsCompleted: Math.max(0, currentStats.topicsCompleted - statsDecrements.topicsCompleted),
            greenTopics: Math.max(0, currentStats.greenTopics - statsDecrements.greenTopics),
            quizzesTaken: Math.max(0, currentStats.quizzesTaken - statsDecrements.quizzesTaken)
          }
        }
      };
    });
  }, [updateData]);

  const emptyTrash = useCallback(() => {
    updateData(prev => {
      const trashedSubjects = prev.subjects.filter(s => s.deletedAt);
      let totalDecrements = { topicsCompleted: 0, greenTopics: 0, quizzesTaken: 0 };

      trashedSubjects.forEach(subject => {
        subject.topics.forEach(topic => {
          if (topic.status !== 'gray') totalDecrements.topicsCompleted++;
          if (topic.status === 'green') totalDecrements.greenTopics++;
          totalDecrements.quizzesTaken += topic.quizCount || 0;
        });
      });

      const trashedIds = new Set(trashedSubjects.map(s => s.id));
      const currentStats = prev.userProgress?.stats || {
        topicsCompleted: 0, quizzesTaken: 0, perfectQuizzes: 0, greenTopics: 0, longestStreak: 0
      };

      return {
        ...prev,
        subjects: prev.subjects.filter(s => !s.deletedAt),
        schedule: prev.schedule.filter(c => !trashedIds.has(c.subjectId)),
        academicEvents: prev.academicEvents.filter(e => !trashedIds.has(e.subjectId)),
        questionBanks: prev.questionBanks.filter(b => !trashedIds.has(b.subjectId)),
        userProgress: {
          ...prev.userProgress,
          stats: {
            ...currentStats,
            topicsCompleted: Math.max(0, currentStats.topicsCompleted - totalDecrements.topicsCompleted),
            greenTopics: Math.max(0, currentStats.greenTopics - totalDecrements.greenTopics),
            quizzesTaken: Math.max(0, currentStats.quizzesTaken - totalDecrements.quizzesTaken)
          }
        }
      };
    });
  }, [updateData]);

  // Topic operations
  const addTopics = useCallback((subjectId: string, topics: Omit<Topic, 'id'>[]) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        const existingCount = s.topics.length;
        const newTopics = topics.map((t, i) => ({
          ...t,
          id: generateId(),
          number: existingCount + i + 1
        }));
        return { ...s, topics: [...s.topics, ...newTopics] };
      })
    }));
  }, [updateData]);

  const updateTopic = useCallback((subjectId: string, topicId: string, updates: Partial<Topic>) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => t.id === topicId ? { ...t, ...updates } : t)
        };
      })
    }));
  }, [updateData]);

  const deleteTopic = useCallback((subjectId: string, topicId: string) => {
    updateData(prev => {
      // Find the topic to calculate stats to decrement
      const subject = prev.subjects.find(s => s.id === subjectId);
      const topicToDelete = subject?.topics.find(t => t.id === topicId);
      let statsDecrements = { topicsCompleted: 0, greenTopics: 0, quizzesTaken: 0 };

      if (topicToDelete) {
        if (topicToDelete.status !== 'gray') statsDecrements.topicsCompleted = 1;
        if (topicToDelete.status === 'green') statsDecrements.greenTopics = 1;
        statsDecrements.quizzesTaken = topicToDelete.quizCount || 0;
      }

      const currentStats = prev.userProgress?.stats || {
        topicsCompleted: 0, quizzesTaken: 0, perfectQuizzes: 0, greenTopics: 0, longestStreak: 0
      };

      return {
        ...prev,
        subjects: prev.subjects.map(s => {
          if (s.id !== subjectId) return s;
          const filtered = s.topics.filter(t => t.id !== topicId);
          return {
            ...s,
            topics: filtered.map((t, i) => ({ ...t, number: i + 1 }))
          };
        }),
        userProgress: {
          ...prev.userProgress,
          stats: {
            ...currentStats,
            topicsCompleted: Math.max(0, currentStats.topicsCompleted - statsDecrements.topicsCompleted),
            greenTopics: Math.max(0, currentStats.greenTopics - statsDecrements.greenTopics),
            quizzesTaken: Math.max(0, currentStats.quizzesTaken - statsDecrements.quizzesTaken)
          }
        }
      };
    });
  }, [updateData]);

  const setTopicStatus = useCallback((subjectId: string, topicId: string, status: TopicStatus) => {
    updateData(prev => {
      // Find old status for XP calculation
      let oldStatus: TopicStatus = 'gray';
      const subject = prev.subjects.find(s => s.id === subjectId);
      if (subject) {
        const topic = subject.topics.find(t => t.id === topicId);
        if (topic) oldStatus = topic.status;
      }

      // Update combo FIRST to get correct multiplier
      const progress = prev.userProgress || defaultUserProgress;
      const newCombo = updateCombo(progress.combo.lastActionTime, progress.combo.count);
      // Use the NEW combo count for multiplier (after checking if it expired)
      const comboMultiplier = getComboMultiplier(newCombo.count);
      const xpEarned = calculateTopicXp(oldStatus, status, comboMultiplier);

      // Keep original combo if no XP earned (status didn't improve)
      const finalCombo = xpEarned > 0 ? newCombo : progress.combo;
      const newXp = progress.xp + xpEarned;
      const newLevel = calculateLevel(newXp);

      // Update stats (both increment on upgrade and decrement on downgrade)
      const newStats = { ...progress.stats };
      if (status !== 'gray' && oldStatus === 'gray') {
        newStats.topicsCompleted = (newStats.topicsCompleted || 0) + 1;
      } else if (status === 'gray' && oldStatus !== 'gray') {
        newStats.topicsCompleted = Math.max(0, (newStats.topicsCompleted || 0) - 1);
      }
      if (status === 'green' && oldStatus !== 'green') {
        newStats.greenTopics = (newStats.greenTopics || 0) + 1;
      } else if (oldStatus === 'green' && status !== 'green') {
        newStats.greenTopics = Math.max(0, (newStats.greenTopics || 0) - 1);
      }

      const newProgress: UserProgress = {
        ...progress,
        xp: newXp,
        level: newLevel,
        totalXpEarned: progress.totalXpEarned + xpEarned,
        combo: finalCombo,
        stats: newStats
      };

      // Check achievements
      const streak = calculateStudyStreak(prev.timerSessions);
      const newSubjects = prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => {
            if (t.id !== topicId) return t;
            return {
              ...t,
              status,
              lastReview: status !== 'gray' ? new Date().toISOString() : t.lastReview
            };
          })
        };
      });

      const unlocked = checkAchievements(newProgress, newSubjects, streak);
      if (unlocked.length > 0) {
        newProgress.achievements = [...newProgress.achievements, ...unlocked];
        setNewAchievements(prev => [...prev, ...unlocked]);
      }

      return {
        ...prev,
        subjects: newSubjects,
        userProgress: newProgress
      };
    });
  }, [updateData]);

  const addGrade = useCallback((
    subjectId: string,
    topicId: string,
    grade: number,
    quizMeta?: { bloomLevel?: number; questionsCount?: number; correctAnswers?: number; weight?: number }
  ) => {
    // Validate grade is in Bulgarian scale (2-6), handle NaN/Infinity
    if (!Number.isFinite(grade)) {
      console.warn(`Invalid grade ${grade}, using default 2`);
      grade = 2;
    }
    const validGrade = Math.max(2, Math.min(6, grade));

    updateData(prev => {
      // Find old status and current Bloom level for quiz history
      let oldStatus: TopicStatus = 'gray';
      let currentBloom = 1;
      const subject = prev.subjects.find(s => s.id === subjectId);
      if (subject) {
        const topic = subject.topics.find(t => t.id === topicId);
        if (topic) {
          oldStatus = topic.status;
          currentBloom = topic.currentBloomLevel || 1;
        }
      }

      // Update combo FIRST to get correct multiplier
      const progress = prev.userProgress || defaultUserProgress;
      const newCombo = updateCombo(progress.combo.lastActionTime, progress.combo.count);
      const comboMultiplier = getComboMultiplier(newCombo.count);

      // Calculate quiz XP (convert grade 2-6 to score 0-100)
      const score = Math.round(((validGrade - 2) / 4) * 100);

      // Create quiz result for history
      const quizResult = {
        date: new Date().toISOString(),
        bloomLevel: (quizMeta?.bloomLevel || currentBloom) as 1 | 2 | 3 | 4 | 5 | 6,
        score: score,
        questionsCount: quizMeta?.questionsCount || 5,
        correctAnswers: quizMeta?.correctAnswers || Math.round(score / 20),
        weight: quizMeta?.weight || 1.0
      };
      const quizXp = calculateQuizXp(score, comboMultiplier);

      // Update subjects
      const newSubjects = prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => {
            if (t.id !== topicId) return t;
            const newGrades = [...t.grades, validGrade];
            const avgGrade = newGrades.reduce((a, b) => a + b, 0) / newGrades.length;
            const newQuizCount = t.quizCount + 1;

            // Calculate new Bloom level based on performance
            // Advance ONLY if: 2+ quizzes AT CURRENT LEVEL with score >= 70%
            // Bloom levels: 1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create
            let newBloomLevel = t.currentBloomLevel || 1;

            // Count quizzes AT the current Bloom level with good scores (>= 70%)
            // Include the current quiz in the check (it will be added to history below)
            const quizHistory = [...(t.quizHistory || []), quizResult];
            const quizzesAtCurrentLevel = quizHistory.filter(
              q => q.bloomLevel === newBloomLevel && q.score >= 70
            );

            // Need at least 2 successful quizzes at current level to advance
            // AND the average score at this level must be >= 75%
            if (quizzesAtCurrentLevel.length >= 2 && newBloomLevel < 6) {
              const avgScoreAtLevel = quizzesAtCurrentLevel.reduce((sum, q) => sum + q.score, 0) / quizzesAtCurrentLevel.length;
              if (avgScoreAtLevel >= 75) {
                newBloomLevel = Math.min(6, newBloomLevel + 1) as 1 | 2 | 3 | 4 | 5 | 6;
              }
            }

            // Update or initialize FSRS state
            const newFsrs = t.fsrs
              ? updateFSRS(t.fsrs, score)  // Existing FSRS state - update
              : initializeFSRS(score);     // First quiz - initialize

            return {
              ...t,
              grades: newGrades,
              avgGrade: Math.round(avgGrade * 100) / 100,
              quizCount: newQuizCount,
              status: gradeToStatus(avgGrade),
              lastReview: new Date().toISOString(),
              currentBloomLevel: newBloomLevel,
              quizHistory: [...(t.quizHistory || []), quizResult],
              fsrs: newFsrs  // FSRS spaced repetition state
            };
          })
        };
      });

      // Calculate topic status change XP
      const newTopic = newSubjects.find(s => s.id === subjectId)?.topics.find(t => t.id === topicId);
      const newStatus = newTopic?.status || oldStatus;
      const topicXp = calculateTopicXp(oldStatus, newStatus, comboMultiplier);

      const totalXp = quizXp + topicXp;

      // XP calculation (combo already updated at top of function)
      const newXp = progress.xp + totalXp;
      const newLevel = calculateLevel(newXp);

      // Update stats
      const newStats = { ...progress.stats };
      newStats.quizzesTaken = (newStats.quizzesTaken || 0) + 1;
      if (score === 100) {
        newStats.perfectQuizzes = (newStats.perfectQuizzes || 0) + 1;
      }
      if (newStatus !== 'gray' && oldStatus === 'gray') {
        newStats.topicsCompleted = (newStats.topicsCompleted || 0) + 1;
      }
      if (newStatus === 'green' && oldStatus !== 'green') {
        newStats.greenTopics = (newStats.greenTopics || 0) + 1;
      }

      const newProgress: UserProgress = {
        ...progress,
        xp: newXp,
        level: newLevel,
        totalXpEarned: progress.totalXpEarned + totalXp,
        combo: newCombo,
        stats: newStats
      };

      // Check achievements
      const streak = calculateStudyStreak(prev.timerSessions);
      const unlocked = checkAchievements(newProgress, newSubjects, streak);
      if (unlocked.length > 0) {
        newProgress.achievements = [...newProgress.achievements, ...unlocked];
        setNewAchievements(prev => [...prev, ...unlocked]);
      }

      return {
        ...prev,
        subjects: newSubjects,
        userProgress: newProgress
      };
    });
  }, [updateData]);

  const updateTopicMaterial = useCallback((subjectId: string, topicId: string, material: string) => {
    if (process.env.NODE_ENV === 'development') console.log('[CONTEXT] updateTopicMaterial:', topicId, 'length:', material?.length || 0);
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => t.id === topicId ? { ...t, material } : t)
        };
      })
    }));
  }, [updateData]);

  const trackTopicRead = useCallback((subjectId: string, topicId: string) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => {
            if (t.id !== topicId) return t;
            return {
              ...t,
              readCount: (t.readCount || 0) + 1,
              lastRead: new Date().toISOString()
            };
          })
        };
      })
    }));
  }, [updateData]);

  // Smart Scheduling: Update topic size
  const updateTopicSize = useCallback((subjectId: string, topicId: string, size: TopicSize | null, setBy: 'ai' | 'user') => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => t.id === topicId ? { ...t, size, sizeSetBy: setBy } : t)
        };
      })
    }));
  }, [updateData]);

  // Schedule operations
  const addClass = useCallback((scheduleClass: Omit<ScheduleClass, 'id'>) => {
    updateData(prev => ({
      ...prev,
      schedule: [...prev.schedule, { ...scheduleClass, id: generateId() }]
    }));
  }, [updateData]);

  const updateClass = useCallback((id: string, updates: Partial<ScheduleClass>) => {
    updateData(prev => ({
      ...prev,
      schedule: prev.schedule.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  }, [updateData]);

  const deleteClass = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      schedule: prev.schedule.filter(c => c.id !== id)
    }));
  }, [updateData]);

  // Daily status
  const updateDailyStatus = useCallback((status: Partial<DailyStatus>) => {
    updateData(prev => ({
      ...prev,
      dailyStatus: { ...prev.dailyStatus, ...status }
    }));
  }, [updateData]);

  // Timer operations
  const startTimer = useCallback((subjectId: string, topicId: string | null) => {
    const session: TimerSession = {
      id: generateId(),
      subjectId,
      topicId,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      rating: null
    };
    updateData(prev => {
      // Auto-stop any existing active session to prevent orphans
      const sessions = prev.timerSessions.map(s => {
        if (s.endTime === null) {
          const endTime = new Date().toISOString();
          const duration = Math.round((new Date(endTime).getTime() - new Date(s.startTime).getTime()) / 1000 / 60);
          return { ...s, endTime, duration: Math.max(0, duration), rating: null };
        }
        return s;
      });
      return { ...prev, timerSessions: [...sessions, session] };
    });
  }, [updateData]);

  const stopTimerWithNote = useCallback((rating: number | null, distractionNote?: string) => {
    updateData(prev => {
      const sessions = [...prev.timerSessions];
      const activeIndex = sessions.findIndex(s => s.endTime === null);
      if (activeIndex === -1) return prev;

      const endTime = new Date().toISOString();
      const startTime = new Date(sessions[activeIndex].startTime);
      const duration = Math.round((new Date(endTime).getTime() - startTime.getTime()) / 1000 / 60);

      sessions[activeIndex] = {
        ...sessions[activeIndex],
        endTime,
        duration,
        rating,
        distractionNote: distractionNote || undefined
      };

      return { ...prev, timerSessions: sessions };
    });
  }, [updateData]);

  const stopTimer = useCallback((rating: number | null) => {
    stopTimerWithNote(rating, undefined);
  }, [stopTimerWithNote]);

  // Add completed Pomodoro session directly
  const addPomodoroSession = useCallback((durationMinutes: number, subjectId?: string, topicId?: string | null, note?: string, rating?: number | null) => {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - durationMinutes * 60 * 1000);

    const session: TimerSession = {
      id: generateId(),
      subjectId: subjectId || 'pomodoro', // Use 'pomodoro' as fallback
      topicId: topicId || null,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: durationMinutes,
      rating: rating ?? null,
      distractionNote: note || undefined
    };

    updateData(prev => ({
      ...prev,
      timerSessions: [...prev.timerSessions, session]
    }));
  }, [updateData]);

  // GPA operations
  const addSemesterGrade = useCallback((grade: Omit<SemesterGrade, 'id'>) => {
    // Validate grade is in Bulgarian scale (2-6)
    const validGrade = Math.max(2, Math.min(6, grade.grade));
    if (grade.grade !== validGrade) {
      console.warn(`Invalid semester grade ${grade.grade} clamped to ${validGrade}`);
    }

    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        grades: [...prev.gpaData.grades, { ...grade, grade: validGrade, id: generateId() }]
      }
    }));
  }, [updateData]);

  const updateSemesterGrade = useCallback((id: string, updates: Partial<SemesterGrade>) => {
    // Validate grade if it's being updated
    const validUpdates = { ...updates };
    if (updates.grade !== undefined) {
      validUpdates.grade = Math.max(2, Math.min(6, updates.grade));
    }

    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        grades: prev.gpaData.grades.map(g => g.id === id ? { ...g, ...validUpdates } : g)
      }
    }));
  }, [updateData]);

  const deleteSemesterGrade = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        grades: prev.gpaData.grades.filter(g => g.id !== id)
      }
    }));
  }, [updateData]);

  const setTargetGPA = useCallback((target: number) => {
    updateData(prev => ({
      ...prev,
      gpaData: { ...prev.gpaData, targetGPA: target }
    }));
  }, [updateData]);

  const addStateExam = useCallback((exam: { name: string; grade: number }) => {
    // Validate grade is between 2-6
    const validGrade = Math.max(2, Math.min(6, exam.grade));
    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        stateExams: [...(prev.gpaData.stateExams || []), { ...exam, grade: validGrade }]
      }
    }));
  }, [updateData]);

  const deleteStateExam = useCallback((index: number) => {
    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        stateExams: (prev.gpaData.stateExams || []).filter((_, i) => i !== index)
      }
    }));
  }, [updateData]);

  // Usage tracking
  const incrementApiCalls = useCallback((cost: number) => {
    updateData(prev => {
      const today = getTodayString();
      const lastReset = prev.usageData.lastReset;
      const lastResetDate = new Date(lastReset);
      const todayDate = new Date(today);

      // Check if we need to reset (new month or new day for daily calls)
      const isNewMonth = lastResetDate.getMonth() !== todayDate.getMonth() ||
                         lastResetDate.getFullYear() !== todayDate.getFullYear();
      const isNewDay = lastReset !== today;

      return {
        ...prev,
        usageData: {
          ...prev.usageData,
          dailyCalls: isNewDay ? 1 : prev.usageData.dailyCalls + 1,
          monthlyCost: isNewMonth ? cost : Math.round((prev.usageData.monthlyCost + cost) * 1000000) / 1000000,
          lastReset: today
        }
      };
    });
  }, [updateData]);

  const updateUsageBudget = useCallback((budget: number) => {
    updateData(prev => ({
      ...prev,
      usageData: {
        ...prev.usageData,
        monthlyBudget: budget
      }
    }));
  }, [updateData]);

  // Question Bank operations
  const addQuestionBank = useCallback((subjectId: string, name: string): string => {
    const bankId = generateId();
    updateData(prev => ({
      ...prev,
      questionBanks: [...(prev.questionBanks || []), {
        id: bankId,
        subjectId,
        name,
        questions: [],
        cases: [],
        uploadedAt: new Date().toISOString()
      }]
    }));
    return bankId;
  }, [updateData]);

  const addQuestionsToBank = useCallback((bankId: string, questions: Omit<BankQuestion, 'id'>[], cases: Omit<ClinicalCase, 'id'>[]) => {
    updateData(prev => ({
      ...prev,
      questionBanks: (prev.questionBanks || []).map(bank => {
        if (bank.id !== bankId) return bank;
        const newQuestions = questions.map(q => ({
          ...q,
          id: generateId()
        }));
        const newCases = cases.map(c => ({
          ...c,
          id: generateId()
        }));
        return {
          ...bank,
          questions: [...bank.questions, ...newQuestions],
          cases: [...bank.cases, ...newCases]
        };
      })
    }));
  }, [updateData]);

  const updateQuestionStats = useCallback((bankId: string, questionId: string, correct: boolean) => {
    updateData(prev => ({
      ...prev,
      questionBanks: (prev.questionBanks || []).map(bank => {
        if (bank.id !== bankId) return bank;
        return {
          ...bank,
          questions: bank.questions.map(q => {
            if (q.id !== questionId) return q;
            return {
              ...q,
              stats: {
                attempts: q.stats.attempts + 1,
                correct: q.stats.correct + (correct ? 1 : 0),
                lastAttempt: new Date().toISOString()
              }
            };
          })
        };
      })
    }));
  }, [updateData]);

  const deleteQuestionBank = useCallback((bankId: string) => {
    updateData(prev => ({
      ...prev,
      questionBanks: (prev.questionBanks || []).filter(bank => bank.id !== bankId)
    }));
  }, [updateData]);

  const deleteQuestion = useCallback((bankId: string, questionId: string) => {
    updateData(prev => ({
      ...prev,
      questionBanks: (prev.questionBanks || []).map(bank => {
        if (bank.id !== bankId) return bank;
        return {
          ...bank,
          questions: bank.questions.filter(q => q.id !== questionId),
          cases: bank.cases.map(c => ({
            ...c,
            questionIds: c.questionIds.filter(id => id !== questionId)
          }))
        };
      })
    }));
  }, [updateData]);

  const updatePomodoroSettings = useCallback((settings: Partial<PomodoroSettings>) => {
    updateData(prev => ({
      ...prev,
      pomodoroSettings: { ...(prev.pomodoroSettings || defaultPomodoroSettings), ...settings }
    }));
  }, [updateData]);

  const updateStudyGoals = useCallback((goals: Partial<StudyGoals>) => {
    updateData(prev => ({
      ...prev,
      studyGoals: { ...(prev.studyGoals || defaultStudyGoals), ...goals }
    }));
  }, [updateData]);

  const updateAcademicPeriod = useCallback((period: Partial<AcademicPeriod>) => {
    updateData(prev => ({
      ...prev,
      academicPeriod: { ...(prev.academicPeriod || defaultAcademicPeriod), ...period }
    }));
  }, [updateData]);

  // Clean old timer sessions (for storage cleanup)
  const cleanOldTimerSessions = useCallback((cutoffDate: Date) => {
    updateData(prev => ({
      ...prev,
      timerSessions: prev.timerSessions.filter(s => new Date(s.startTime) >= cutoffDate)
    }));
  }, [updateData]);

  // ================ Development Projects (Phase 1: Vayne Doctor) ================

  const addProject = useCallback((project: Omit<DevelopmentProject, 'id' | 'createdAt' | 'updatedAt' | 'progressPercent' | 'timeInvested' | 'insights'>) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: [...prev.developmentProjects, {
        ...project,
        id: generateId(),
        progressPercent: 0,
        timeInvested: 0,
        insights: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    }));
  }, [updateData]);

  const updateProject = useCallback((id: string, updates: Partial<DevelopmentProject>) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      )
    }));
  }, [updateData]);

  const deleteProject = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.filter(p => p.id !== id)
    }));
  }, [updateData]);

  const addProjectModule = useCallback((projectId: string, module: Omit<ProjectModule, 'id'>) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        const newModules = [...p.modules, { ...module, id: generateId() }];
        return { ...p, modules: newModules, updatedAt: new Date().toISOString() };
      })
    }));
  }, [updateData]);

  const updateProjectModule = useCallback((projectId: string, moduleId: string, updates: Partial<ProjectModule>) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        const newModules = p.modules.map(m => {
          if (m.id !== moduleId) return m;
          // If marking as completed, set completedAt
          if (updates.status === 'completed' && m.status !== 'completed') {
            return { ...m, ...updates, completedAt: new Date().toISOString() };
          }
          return { ...m, ...updates };
        });
        // Auto-calculate progress
        const completedCount = newModules.filter(m => m.status === 'completed').length;
        const progressPercent = newModules.length > 0
          ? Math.round((completedCount / newModules.length) * 100)
          : 0;
        return { ...p, modules: newModules, progressPercent, updatedAt: new Date().toISOString() };
      })
    }));
  }, [updateData]);

  const deleteProjectModule = useCallback((projectId: string, moduleId: string) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        const newModules = p.modules.filter(m => m.id !== moduleId)
          .map((m, i) => ({ ...m, order: i + 1 }));
        const completedCount = newModules.filter(m => m.status === 'completed').length;
        const progressPercent = newModules.length > 0
          ? Math.round((completedCount / newModules.length) * 100)
          : 0;
        return { ...p, modules: newModules, progressPercent, updatedAt: new Date().toISOString() };
      })
    }));
  }, [updateData]);

  const addProjectInsight = useCallback((projectId: string, insight: Omit<ProjectInsight, 'id' | 'date'>) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        const newInsight: ProjectInsight = {
          ...insight,
          id: generateId(),
          date: new Date().toISOString()
        };
        return { ...p, insights: [...p.insights, newInsight], updatedAt: new Date().toISOString() };
      })
    }));
  }, [updateData]);

  const toggleInsightApplied = useCallback((projectId: string, insightId: string) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        const newInsights = p.insights.map(i =>
          i.id === insightId ? { ...i, applied: !i.applied } : i
        );
        return { ...p, insights: newInsights, updatedAt: new Date().toISOString() };
      })
    }));
  }, [updateData]);

  const deleteProjectInsight = useCallback((projectId: string, insightId: string) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        return { ...p, insights: p.insights.filter(i => i.id !== insightId), updatedAt: new Date().toISOString() };
      })
    }));
  }, [updateData]);

  // ================ Module Learning Operations (Phase 2: Projects 2.0) ================

  const addModuleGrade = useCallback((
    projectId: string,
    moduleId: string,
    grade: number,
    quizMeta?: { bloomLevel?: number; questionsCount?: number; correctAnswers?: number; weight?: number }
  ) => {
    const validGrade = Math.max(2, Math.min(6, grade));

    updateData(prev => {
      const project = prev.developmentProjects.find(p => p.id === projectId);
      const module = project?.modules.find(m => m.id === moduleId);
      if (!project || !module) return prev;

      // Convert grade (2-6) to score (0-100)
      const score = Math.round(((validGrade - 2) / 4) * 100);

      // Create quiz result
      const quizResult: QuizResult = {
        date: new Date().toISOString(),
        bloomLevel: (quizMeta?.bloomLevel || module.currentBloomLevel || 1) as BloomLevel,
        score,
        questionsCount: quizMeta?.questionsCount || 5,
        correctAnswers: quizMeta?.correctAnswers || Math.round(score / 20),
        weight: quizMeta?.weight || 1.0
      };

      // Update FSRS state
      const newFsrs = module.fsrs
        ? updateFSRS(module.fsrs, score)
        : initializeFSRS(score);

      // Update grades
      const newGrades = [...(module.grades || []), validGrade];
      const avgGrade = newGrades.reduce((a, b) => a + b, 0) / newGrades.length;

      // Bloom level advancement logic (same as topics - requires score >= 70)
      let newBloomLevel = (module.currentBloomLevel || 1) as BloomLevel;
      const currentLevelQuizzes = [...(module.quizHistory || []), quizResult]
        .filter(q => q.bloomLevel === newBloomLevel && q.score >= 70);

      if (currentLevelQuizzes.length >= 2 && newBloomLevel < 6) {
        const currentLevelAvg = currentLevelQuizzes.reduce((sum, q) => sum + q.score, 0) / currentLevelQuizzes.length;
        if (currentLevelAvg >= 75) {
          newBloomLevel = (newBloomLevel + 1) as BloomLevel;
        }
      }

      // Update module
      const newModules = project.modules.map(m => {
        if (m.id !== moduleId) return m;
        return {
          ...m,
          grades: newGrades,
          avgGrade: Math.round(avgGrade * 100) / 100,
          quizCount: (m.quizCount || 0) + 1,
          quizHistory: [...(m.quizHistory || []), quizResult],
          currentBloomLevel: newBloomLevel,
          fsrs: newFsrs,
          lastReview: new Date().toISOString(),
          // Update status based on grade
          status: avgGrade >= 4.5 ? 'completed' as const : avgGrade >= 3.5 ? 'in_progress' as const : m.status,
          completedAt: avgGrade >= 4.5 && m.status !== 'completed' ? new Date().toISOString() : m.completedAt
        };
      });

      // Recalculate project progress
      const completedCount = newModules.filter(m => m.status === 'completed').length;
      const progressPercent = newModules.length > 0
        ? Math.round((completedCount / newModules.length) * 100)
        : 0;

      // Update combo FIRST to get correct multiplier (check if expired)
      const progress = prev.userProgress || defaultUserProgress;
      const newCombo = updateCombo(progress.combo.lastActionTime, progress.combo.count);
      const comboMultiplier = getComboMultiplier(newCombo.count);

      // Calculate XP (same as quiz XP)
      const xpEarned = calculateQuizXp(score, comboMultiplier);
      const newXp = progress.xp + xpEarned;

      const newProgress: UserProgress = {
        ...progress,
        xp: newXp,
        level: calculateLevel(newXp),
        totalXpEarned: progress.totalXpEarned + xpEarned,
        combo: newCombo,
        stats: {
          ...progress.stats,
          quizzesTaken: progress.stats.quizzesTaken + 1
        }
      };

      // Check achievements
      const streak = calculateStudyStreak(prev.timerSessions);
      const unlocked = checkAchievements(newProgress, prev.subjects, streak);
      if (unlocked.length > 0) {
        newProgress.achievements = [...newProgress.achievements, ...unlocked];
        setNewAchievements(prev => [...prev, ...unlocked]);
      }

      return {
        ...prev,
        developmentProjects: prev.developmentProjects.map(p => {
          if (p.id !== projectId) return p;
          return { ...p, modules: newModules, progressPercent, updatedAt: new Date().toISOString() };
        }),
        userProgress: newProgress
      };
    });
  }, [updateData]);

  const updateModuleMaterial = useCallback((projectId: string, moduleId: string, material: string, images?: string[]) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          modules: p.modules.map(m => {
            if (m.id !== moduleId) return m;
            return {
              ...m,
              material,
              materialImages: images !== undefined ? images : m.materialImages,
            };
          }),
          updatedAt: new Date().toISOString()
        };
      })
    }));
  }, [updateData]);

  const trackModuleRead = useCallback((projectId: string, moduleId: string) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          modules: p.modules.map(m => {
            if (m.id !== moduleId) return m;
            return {
              ...m,
              readCount: (m.readCount || 0) + 1,
              lastRead: new Date().toISOString()
            };
          }),
          updatedAt: new Date().toISOString()
        };
      })
    }));
  }, [updateData]);

  const updateModuleSize = useCallback((projectId: string, moduleId: string, size: TopicSize | null, setBy: 'ai' | 'user') => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          modules: p.modules.map(m => {
            if (m.id !== moduleId) return m;
            return { ...m, size, sizeSetBy: setBy };
          }),
          updatedAt: new Date().toISOString()
        };
      })
    }));
  }, [updateData]);

  const addModuleWrongAnswer = useCallback((projectId: string, moduleId: string, wrongAnswer: WrongAnswer) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          modules: p.modules.map(m => {
            if (m.id !== moduleId) return m;
            return {
              ...m,
              wrongAnswers: [...(m.wrongAnswers || []), wrongAnswer]
            };
          }),
          updatedAt: new Date().toISOString()
        };
      })
    }));
  }, [updateData]);

  const updateModuleHighlights = useCallback((projectId: string, moduleId: string, highlights: TextHighlight[]) => {
    updateData(prev => ({
      ...prev,
      developmentProjects: prev.developmentProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          modules: p.modules.map(m => {
            if (m.id !== moduleId) return m;
            return { ...m, highlights };
          }),
          updatedAt: new Date().toISOString()
        };
      })
    }));
  }, [updateData]);

  // ================ Career Profile (Phase 1: Vayne Doctor) ================

  const updateCareerProfile = useCallback((profile: Partial<CareerProfile>) => {
    updateData(prev => ({
      ...prev,
      careerProfile: prev.careerProfile
        ? { ...prev.careerProfile, ...profile, updatedAt: new Date().toISOString() }
        : {
            currentYear: 1,
            stage: 'preclinical' as const,
            interestedSpecialties: [],
            academicInterests: [],
            shortTermGoals: [],
            longTermGoals: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...profile
          }
    }));
  }, [updateData]);

  // ================ Academic Events (Колоквиуми, Контролни) ================

  const addAcademicEvent = useCallback((event: Omit<AcademicEvent, 'id' | 'createdAt'>) => {
    updateData(prev => ({
      ...prev,
      academicEvents: [...prev.academicEvents, {
        ...event,
        id: generateId(),
        createdAt: new Date().toISOString()
      }]
    }));
  }, [updateData]);

  const updateAcademicEvent = useCallback((id: string, updates: Partial<AcademicEvent>) => {
    updateData(prev => ({
      ...prev,
      academicEvents: prev.academicEvents.map(e =>
        e.id === id ? { ...e, ...updates } : e
      )
    }));
  }, [updateData]);

  const deleteAcademicEvent = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      academicEvents: prev.academicEvents.filter(e => e.id !== id)
    }));
  }, [updateData]);

  // ================ Dashboard Features ================

  const setLastOpenedTopic = useCallback((subjectId: string, topicId: string) => {
    updateData(prev => ({
      ...prev,
      lastOpenedTopic: {
        subjectId,
        topicId,
        timestamp: new Date().toISOString()
      }
    }));
  }, [updateData]);

  const addDailyGoal = useCallback((text: string, type: 'daily' | 'weekly') => {
    updateData(prev => ({
      ...prev,
      dailyGoals: [...prev.dailyGoals, {
        id: generateId(),
        text,
        completed: false,
        date: getTodayString(),
        type,
        createdAt: new Date().toISOString()
      }]
    }));
  }, [updateData]);

  const toggleDailyGoal = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      dailyGoals: prev.dailyGoals.map(goal =>
        goal.id === id ? { ...goal, completed: !goal.completed } : goal
      )
    }));
  }, [updateData]);

  const deleteDailyGoal = useCallback((id: string) => {
    updateData(prev => ({
      ...prev,
      dailyGoals: prev.dailyGoals.filter(goal => goal.id !== id)
    }));
  }, [updateData]);

  // Calculate streak for achievement checking (uses helper function)
  const calculateStreak = useCallback((sessions: TimerSession[]) => {
    return calculateStudyStreak(sessions);
  }, []);

  // Gamification: Earn XP
  const earnXp = useCallback((amount: number, _reason: string) => {
    updateData(prev => {
      const progress = prev.userProgress || defaultUserProgress;
      const newCombo = updateCombo(progress.combo.lastActionTime, progress.combo.count);
      const newXp = progress.xp + amount;
      const newLevel = calculateLevel(newXp);

      // Update user progress
      const newProgress: UserProgress = {
        ...progress,
        xp: newXp,
        level: newLevel,
        totalXpEarned: progress.totalXpEarned + amount,
        combo: newCombo
      };

      // Check for new achievements
      const streak = calculateStreak(prev.timerSessions);
      const unlocked = checkAchievements(newProgress, prev.subjects, streak);
      if (unlocked.length > 0) {
        newProgress.achievements = [...newProgress.achievements, ...unlocked];
        // Update longest streak stat if needed (create new stats object to avoid mutating previous state)
        if (streak > newProgress.stats.longestStreak) {
          newProgress.stats = { ...newProgress.stats, longestStreak: streak };
        }
        setNewAchievements(existing => [...existing, ...unlocked]);
      }

      return { ...prev, userProgress: newProgress };
    });
  }, [updateData, calculateStreak]);

  const clearNewAchievements = useCallback(() => {
    setNewAchievements([]);
  }, []);

  const contextValue = useMemo(() => ({
    data,
    isLoading,
    isSyncing,
    lastSynced,
    syncNow,
    addSubject,
    updateSubject,
    deleteSubject,
    archiveSubject,
    unarchiveSubject,
    duplicateSubject,
    exportSubjectToJSON,
    importSubjectFromJSON,
    softDeleteSubject,
    restoreSubject,
    permanentlyDeleteSubject,
    emptyTrash,
    addTopics,
    updateTopic,
    deleteTopic,
    setTopicStatus,
    addGrade,
    updateTopicMaterial,
    trackTopicRead,
    updateTopicSize,
    addClass,
    updateClass,
    deleteClass,
    updateDailyStatus,
    startTimer,
    stopTimer,
    addPomodoroSession,
    addSemesterGrade,
    updateSemesterGrade,
    deleteSemesterGrade,
    setTargetGPA,
    addStateExam,
    deleteStateExam,
    incrementApiCalls,
    updateUsageBudget,
    addQuestionBank,
    addQuestionsToBank,
    updateQuestionStats,
    deleteQuestionBank,
    deleteQuestion,
    updatePomodoroSettings,
    updateStudyGoals,
    updateAcademicPeriod,
    cleanOldTimerSessions,
    stopTimerWithNote,
    earnXp,
    newAchievements,
    clearNewAchievements,
    sidebarCollapsed,
    setSidebarCollapsed,
    storageError,
    clearStorageError,
    getStorageUsage,
    addProject,
    updateProject,
    deleteProject,
    addProjectModule,
    updateProjectModule,
    deleteProjectModule,
    addProjectInsight,
    toggleInsightApplied,
    deleteProjectInsight,
    addModuleGrade,
    updateModuleMaterial,
    trackModuleRead,
    updateModuleSize,
    addModuleWrongAnswer,
    updateModuleHighlights,
    updateCareerProfile,
    addAcademicEvent,
    updateAcademicEvent,
    deleteAcademicEvent,
    setLastOpenedTopic,
    addDailyGoal,
    toggleDailyGoal,
    deleteDailyGoal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, isLoading, isSyncing, lastSynced, newAchievements, sidebarCollapsed, storageError]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
