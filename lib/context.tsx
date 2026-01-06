'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppData, Subject, Topic, ScheduleClass, DailyStatus, TopicStatus, TimerSession, SemesterGrade, GPAData, UsageData, BloomLevel, QuizResult } from './types';
import { loadData, saveData } from './storage';
import { loadFromCloud, debouncedSaveToCloud } from './cloud-sync';
import { generateId, getTodayString, gradeToStatus } from './algorithms';

interface AppContextType {
  data: AppData;
  isLoading: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  syncNow: () => Promise<void>;

  // Subject operations
  addSubject: (name: string, color: string, examDate: string | null, examFormat: string | null) => void;
  updateSubject: (id: string, updates: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;

  // Topic operations
  addTopics: (subjectId: string, topics: Omit<Topic, 'id'>[]) => void;
  updateTopic: (subjectId: string, topicId: string, updates: Partial<Topic>) => void;
  deleteTopic: (subjectId: string, topicId: string) => void;
  setTopicStatus: (subjectId: string, topicId: string, status: TopicStatus) => void;
  addGrade: (subjectId: string, topicId: string, grade: number) => void;
  updateTopicMaterial: (subjectId: string, topicId: string, material: string) => void;

  // Schedule operations
  addClass: (scheduleClass: Omit<ScheduleClass, 'id'>) => void;
  updateClass: (id: string, updates: Partial<ScheduleClass>) => void;
  deleteClass: (id: string) => void;

  // Daily status
  updateDailyStatus: (status: Partial<DailyStatus>) => void;

  // Timer operations
  startTimer: (subjectId: string, topicId: string | null) => void;
  stopTimer: (rating: number | null) => void;

  // GPA operations
  addSemesterGrade: (grade: Omit<SemesterGrade, 'id'>) => void;
  updateSemesterGrade: (id: string, updates: Partial<SemesterGrade>) => void;
  deleteSemesterGrade: (id: string) => void;
  setTargetGPA: (target: number) => void;

  // Usage tracking
  incrementApiCalls: (cost: number) => void;
  updateUsageBudget: (budget: number) => void;
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>({
    subjects: [],
    schedule: [],
    dailyStatus: {
      date: getTodayString(),
      sleep: 3,
      energy: 3,
      sick: false,
      availableHours: 4
    },
    timerSessions: [],
    gpaData: defaultGPAData,
    usageData: defaultUsageData
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

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
  const addSubject = useCallback((name: string, color: string, examDate: string | null, examFormat: string | null) => {
    updateData(prev => ({
      ...prev,
      subjects: [...prev.subjects, {
        id: generateId(),
        name,
        color,
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
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s.id !== id),
      schedule: prev.schedule.filter(c => c.subjectId !== id)
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
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        const filtered = s.topics.filter(t => t.id !== topicId);
        return {
          ...s,
          topics: filtered.map((t, i) => ({ ...t, number: i + 1 }))
        };
      })
    }));
  }, [updateData]);

  const setTopicStatus = useCallback((subjectId: string, topicId: string, status: TopicStatus) => {
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
              status,
              lastReview: status !== 'gray' ? new Date().toISOString() : t.lastReview
            };
          })
        };
      })
    }));
  }, [updateData]);

  const addGrade = useCallback((subjectId: string, topicId: string, grade: number) => {
    updateData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => {
        if (s.id !== subjectId) return s;
        return {
          ...s,
          topics: s.topics.map(t => {
            if (t.id !== topicId) return t;
            const newGrades = [...t.grades, grade];
            const avgGrade = newGrades.reduce((a, b) => a + b, 0) / newGrades.length;
            return {
              ...t,
              grades: newGrades,
              avgGrade: Math.round(avgGrade * 100) / 100,
              quizCount: t.quizCount + 1,
              status: gradeToStatus(avgGrade),
              lastReview: new Date().toISOString()
            };
          })
        };
      })
    }));
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

  // GPA operations
  const addSemesterGrade = useCallback((grade: Omit<SemesterGrade, 'id'>) => {
    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        grades: [...prev.gpaData.grades, { ...grade, id: generateId() }]
      }
    }));
  }, [updateData]);

  const updateSemesterGrade = useCallback((id: string, updates: Partial<SemesterGrade>) => {
    updateData(prev => ({
      ...prev,
      gpaData: {
        ...prev.gpaData,
        grades: prev.gpaData.grades.map(g => g.id === id ? { ...g, ...updates } : g)
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
    updateData(prev => ({
      ...prev,
      usageData: {
        ...prev.usageData,
        dailyCalls: prev.usageData.dailyCalls + 1,
        monthlyCost: Math.round((prev.usageData.monthlyCost + cost) * 1000000) / 1000000
      }
    }));
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
      addTopics,
      updateTopic,
      deleteTopic,
      setTopicStatus,
      addGrade,
      updateTopicMaterial,
      addClass,
      updateClass,
      deleteClass,
      updateDailyStatus,
      startTimer,
      stopTimer,
      addSemesterGrade,
      updateSemesterGrade,
      deleteSemesterGrade,
      setTargetGPA,
      incrementApiCalls,
      updateUsageBudget
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
