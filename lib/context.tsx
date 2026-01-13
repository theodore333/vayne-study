'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppData, Subject, Topic, ScheduleClass, DailyStatus, TopicStatus, TimerSession, SemesterGrade, GPAData, UsageData, SubjectType, BankQuestion, ClinicalCase, PomodoroSettings, StudyGoals, AcademicPeriod, Achievement, UserProgress, TopicSize, ClinicalCaseSession } from './types';
import { loadData, saveData, setStorageErrorCallback, StorageError, getStorageUsage } from './storage';
import { loadFromCloud, debouncedSaveToCloud } from './cloud-sync';
import { generateId, getTodayString, gradeToStatus } from './algorithms';
import { calculateTopicXp, calculateQuizXp, calculateLevel, updateCombo, getComboMultiplier, checkAchievements, defaultUserProgress } from './gamification';

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

  // Topic operations
  addTopics: (subjectId: string, topics: Omit<Topic, 'id'>[]) => void;
  updateTopic: (subjectId: string, topicId: string, updates: Partial<Topic>) => void;
  deleteTopic: (subjectId: string, topicId: string) => void;
  setTopicStatus: (subjectId: string, topicId: string, status: TopicStatus) => void;
  addGrade: (subjectId: string, topicId: string, grade: number) => void;
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
}

const AppContext = createContext<AppContextType | null>(null);

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
  dailyMinutes: 480,   // 8 hours (weekdays)
  weeklyMinutes: 2880, // auto: 8*5 + 4*2 = 48 hours
  monthlyMinutes: 12480, // auto: ~4.3 weeks
  weekendDailyMinutes: 240, // 4 hours (weekends)
  useWeekendHours: true
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
    }
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
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setSidebarCollapsedState(true);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, []);

  useEffect(() => {
    const initData = async () => {
      // First load from localStorage for instant display
      const localData = loadData();
      setData(localData);

      // Then try to load from cloud
      try {
        const cloudData = await loadFromCloud();
        if (cloudData) {
          // Merge: use cloud data but keep local if newer
          const localTime = new Date(localData.dailyStatus.date).getTime();
          const cloudTime = new Date(cloudData.dailyStatus.date).getTime();

          if (cloudTime >= localTime) {
            setData(cloudData);
            saveData(cloudData); // Update localStorage
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
      // Sync to cloud with debounce (2 second delay)
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

      // Update stats
      const newStats = { ...progress.stats };
      if (status !== 'gray' && oldStatus === 'gray') {
        newStats.topicsCompleted = (newStats.topicsCompleted || 0) + 1;
      }
      if (status === 'green' && oldStatus !== 'green') {
        newStats.greenTopics = (newStats.greenTopics || 0) + 1;
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
      const streak = prev.timerSessions.filter(s => s.endTime !== null).length > 0 ? 1 : 0;
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

  const addGrade = useCallback((subjectId: string, topicId: string, grade: number) => {
    // Validate grade is in Bulgarian scale (2-6)
    const validGrade = Math.max(2, Math.min(6, grade));
    if (grade !== validGrade) {
      console.warn(`Invalid grade ${grade} clamped to ${validGrade}`);
    }

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
      const comboMultiplier = getComboMultiplier(newCombo.count);

      // Calculate quiz XP (convert grade 2-6 to score 0-100)
      const score = Math.round(((validGrade - 2) / 4) * 100);
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
            const quizHistory = t.quizHistory || [];
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

            return {
              ...t,
              grades: newGrades,
              avgGrade: Math.round(avgGrade * 100) / 100,
              quizCount: newQuizCount,
              status: gradeToStatus(avgGrade),
              lastReview: new Date().toISOString(),
              currentBloomLevel: newBloomLevel
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
      const streak = prev.timerSessions.filter(s => s.endTime !== null).length > 0 ? 1 : 0;
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
    updateData(prev => ({
      ...prev,
      timerSessions: [...prev.timerSessions, session]
    }));
  }, [updateData]);

  const stopTimer = useCallback((rating: number | null) => {
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
        rating
      };

      return { ...prev, timerSessions: sessions };
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
      rating: rating || null,
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

  // Calculate streak for achievement checking
  const calculateStreak = useCallback((sessions: TimerSession[]) => {
    const dates = new Set(
      sessions.filter(s => s.endTime !== null).map(s => s.startTime.split('T')[0])
    );
    let count = 0;
    const checkDate = new Date();
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (count === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        if (dates.has(checkDate.toISOString().split('T')[0])) {
          count++;
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      } else break;
    }
    return count;
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
        // Update longest streak stat if needed
        if (streak > newProgress.stats.longestStreak) {
          newProgress.stats.longestStreak = streak;
        }
        setNewAchievements(prev => [...prev, ...unlocked]);
      }

      return { ...prev, userProgress: newProgress };
    });
  }, [updateData, calculateStreak]);

  const clearNewAchievements = useCallback(() => {
    setNewAchievements([]);
  }, []);

  return (
    <AppContext.Provider value={{
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
      stopTimerWithNote,
      earnXp,
      newAchievements,
      clearNewAchievements,
      sidebarCollapsed,
      setSidebarCollapsed,
      storageError,
      clearStorageError,
      getStorageUsage
    }}>
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
