'use client';

import { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, Circle, Zap, BookOpen, Flame, Thermometer, Palmtree, Calendar, Layers, RefreshCw, Wand2, Umbrella, TrendingUp, AlertTriangle, Rocket, Brain, ChevronDown, ChevronRight, Repeat, MessageSquare, X, Send } from 'lucide-react';
import { useApp } from '@/lib/context';
import { generateDailyPlan, detectCrunchMode, calculateDailyTopics, getTopicsNeedingFSRSReview, calculateRetrievability, getTodayString, toLocalDateStr, getOverallOnTrackStatus } from '@/lib/algorithms';
import { STATUS_CONFIG } from '@/lib/constants';
import DailyCheckinModal from '@/components/modals/DailyCheckinModal';
import EditDailyPlanModal from '@/components/modals/EditDailyPlanModal';
import WeeklyReviewModal from '@/components/modals/WeeklyReviewModal';
import Link from 'next/link';
import { DailyTask, ProjectModule, DevelopmentProject } from '@/lib/types';
import ModuleDetailModal from '@/components/modals/ModuleDetailModal';
import { checkAnkiConnect, getCollectionStats, CollectionStats, getSelectedDecks } from '@/lib/anki';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';

export default function TodayPage() {
  const { data, isLoading, incrementApiCalls, updateProjectModule, addTechniquePractice } = useApp();
  const [showCheckin, setShowCheckin] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const todayStr = getTodayString();
    const stored = localStorage.getItem(`completed-tasks-${todayStr}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const todayStr = getTodayString();
    const stored = localStorage.getItem(`completed-topics-${todayStr}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // API key state
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Custom plan state
  const [customPlan, setCustomPlan] = useState<DailyTask[] | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWeeklyReviewModal, setShowWeeklyReviewModal] = useState(false);
  const [planIsCustomized, setPlanIsCustomized] = useState(false);

  // AI plan generation state
  const [loadingAiPlan, setLoadingAiPlan] = useState(false);
  const [aiPlanReasoning, setAiPlanReasoning] = useState<string | null>(null);

  // Bonus plan state (when 100% complete)
  const [bonusPlanMode, setBonusPlanMode] = useState<'tomorrow' | 'review' | 'weak' | null>(null);
  const [loadingBonusPlan, setLoadingBonusPlan] = useState(false);

  // AI feedback state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [planFeedback, setPlanFeedback] = useState('');
  const [loadingFeedback, setLoadingFeedback] = useState(false);

  // Module detail modal state
  const [selectedModule, setSelectedModule] = useState<{ module: ProjectModule; project: DevelopmentProject } | null>(null);

  // Collapsible sections
  const [syllabusExpanded, setSyllabusExpanded] = useState(false);

  // Load API key
  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);
  }, []);

  // Load custom plan from localStorage
  useEffect(() => {
    const todayStr = getTodayString();
    const customPlanKey = `custom-daily-plan-${todayStr}`;
    const storedPlan = localStorage.getItem(customPlanKey);
    if (storedPlan) {
      try {
        const parsed = JSON.parse(storedPlan);
        setCustomPlan(parsed.tasks);
        setPlanIsCustomized(parsed.isCustomized);
      } catch (e) {
        console.error('Failed to parse custom plan', e);
      }
    }

    // Clean up old custom plans (keep only today's)
    const keys = Object.keys(localStorage).filter(k => k.startsWith('custom-daily-plan-') && k !== customPlanKey);
    keys.forEach(k => localStorage.removeItem(k));
  }, []);

  // Check for weekly review on Mondays
  useEffect(() => {
    const dayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday
    if (dayOfWeek === 1) { // Monday
      const lastReview = localStorage.getItem('weekly-review-date');
      if (lastReview) {
        const lastReviewDate = new Date(lastReview);
        const todayDate = new Date();
        const daysSinceReview = Math.floor((todayDate.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceReview >= 7) {
          setShowWeeklyReviewModal(true);
        }
      } else {
        // No review ever done, show the modal
        setShowWeeklyReviewModal(true);
      }
    }
  }, []);

  // Anki integration
  const [ankiStats, setAnkiStats] = useState<CollectionStats | null>(null);
  const [ankiLoading, setAnkiLoading] = useState(false);

  const refreshAnkiStats = async () => {
    setAnkiLoading(true);
    try {
      const connected = await checkAnkiConnect();
      if (connected) {
        const selectedDecks = getSelectedDecks();
        const stats = await getCollectionStats(selectedDecks.length > 0 ? selectedDecks : undefined);
        setAnkiStats(stats);
      } else {
        setAnkiStats(null);
      }
    } catch {
      setAnkiStats(null);
    }
    setAnkiLoading(false);
  };

  useEffect(() => {
    const ankiEnabled = localStorage.getItem('anki-enabled');
    if (ankiEnabled === 'true') {
      refreshAnkiStats();
    }
  }, []);

  // Check which topics have been reviewed today
  const today = getTodayString();

  // Save completed tasks/topics to localStorage
  useEffect(() => {
    localStorage.setItem(`completed-tasks-${today}`, JSON.stringify([...completedTasks]));
  }, [completedTasks, today]);

  useEffect(() => {
    localStorage.setItem(`completed-topics-${today}`, JSON.stringify([...completedTopics]));
  }, [completedTopics, today]);

  // Filter out archived and soft-deleted subjects
  const activeSubjects = useMemo(
    () => data.subjects.filter(s => !s.archived && !s.deletedAt),
    [data.subjects]
  );

  // Yesterday's completed topics for consolidation tier
  const yesterdayCompletedTopicIds = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterdayDate);
    const stored = localStorage.getItem(`completed-topics-${yesterdayStr}`);
    try {
      return stored ? JSON.parse(stored) as string[] : [];
    } catch {
      return [];
    }
  }, []); // Empty deps — yesterday doesn't change during session

  // Auto-mark topics that were reviewed today
  useEffect(() => {
    const reviewedToday = new Set<string>();
    activeSubjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.lastReview && topic.lastReview.startsWith(today)) {
          reviewedToday.add(topic.id);
        }
      });
    });
    setCompletedTopics(prev => {
      const merged = new Set(prev);
      reviewedToday.forEach(id => merged.add(id));
      return merged;
    });
  }, [activeSubjects, today]);

  // Detect crunch mode
  const crunchStatus = useMemo(
    () => detectCrunchMode(activeSubjects),
    [activeSubjects]
  );

  // Filter schedule by academic period (skip exercises before semester/cycle starts)
  const activeSchedule = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const semStart = data.academicPeriod?.semesterStart ? new Date(data.academicPeriod.semesterStart) : null;
    const semesterStarted = !semStart || semStart <= tomorrow;
    return semesterStarted ? data.schedule : data.schedule.filter(c => !!c.startDate);
  }, [data.schedule, data.academicPeriod?.semesterStart]);

  const dailyPlan = useMemo(
    () => generateDailyPlan(
      activeSubjects,
      activeSchedule,
      data.dailyStatus,
      data.studyGoals,
      ankiStats ? ankiStats.dueToday + ankiStats.newToday : undefined,
      data.developmentProjects,
      data.academicEvents,
      data.studyTechniques,
      data.techniquePractices,
      data.academicPeriod,
      data.questionBanks,
      yesterdayCompletedTopicIds
    ),
    [activeSubjects, activeSchedule, data.dailyStatus, data.studyGoals, ankiStats, data.developmentProjects, data.academicEvents, data.studyTechniques, data.techniquePractices, data.academicPeriod, data.questionBanks, yesterdayCompletedTopicIds]
  );

  // Calculate syllabus progress/workload
  const syllabusProgress = useMemo(
    () => calculateDailyTopics(activeSubjects, data.dailyStatus, data.studyGoals),
    [activeSubjects, data.dailyStatus, data.studyGoals]
  );

  // Overall on-track status
  const overallStatus = useMemo(() => {
    try { return getOverallOnTrackStatus(activeSubjects, data.questionBanks || []); }
    catch { return null; }
  }, [activeSubjects, data.questionBanks]);

  // FSRS scheduled reviews - topics that need review based on retrievability
  const fsrsReviews = useMemo(
    () => getTopicsNeedingFSRSReview(activeSubjects, data.studyGoals.fsrsMaxReviewsPerDay || 8, data.studyGoals),
    [activeSubjects, data.studyGoals]
  );

  // Calculate study streak
  const streak = useMemo(() => {
    const dates = new Set(
      data.timerSessions.filter(s => s.endTime !== null).map(s => toLocalDateStr(s.startTime))
    );
    let count = 0;
    const checkDate = new Date();
    while (true) {
      const dateStr = toLocalDateStr(checkDate);
      if (dates.has(dateStr)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (count === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        if (dates.has(toLocalDateStr(checkDate))) {
          count++;
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      } else break;
    }
    return count;
  }, [data.timerSessions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const spacingTechnique = useMemo(() =>
    (data.studyTechniques || []).find(t => t.slug === 'spacing'),
    [data.studyTechniques]
  );

  const toggleTask = (taskId: string, task?: DailyTask) => {
    const wasCompleted = completedTasks.has(taskId);
    setCompletedTasks(prev => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });

    // Auto-track Spacing practice when completing a review task
    if (!wasCompleted && task && spacingTechnique &&
        (task.typeLabel.includes('Review') || task.typeLabel.includes('Преговор'))) {
      const firstTopic = task.topics[0];
      if (firstTopic) {
        addTechniquePractice({
          techniqueId: spacingTechnique.id,
          topicId: firstTopic.id,
          subjectId: task.subjectId,
          effectiveness: null,
          aiPrompt: 'Auto-tracked: FSRS spaced repetition review',
          userReflection: null,
        });
      }
    }
  };

  const toggleTopic = (topicId: string) => {
    setCompletedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  // Save custom plan
  const handleSaveCustomPlan = (plan: DailyTask[]) => {
    const todayStr = getTodayString();
    const customPlanKey = `custom-daily-plan-${todayStr}`;
    localStorage.setItem(customPlanKey, JSON.stringify({
      date: todayStr,
      tasks: plan,
      isCustomized: true
    }));
    setCustomPlan(plan);
    setPlanIsCustomized(true);
  };

  // Strip materials from subjects to reduce payload size for AI plan
  const subjectsForPlan = useMemo(() => activeSubjects.map(s => ({
    ...s,
    topics: s.topics.map(t => ({
      id: t.id,
      number: t.number,
      name: t.name,
      status: t.status,
      avgGrade: t.avgGrade,
      quizHistory: t.quizHistory,
      quizCount: t.quizCount,
      lastReview: t.lastReview,
      size: t.size,
      hasMaterial: !!(t.material && t.material.trim().length > 0) || !!(t.materialImages && t.materialImages.length > 0),
    }))
  })), [activeSubjects]);

  // Generate bonus AI plan (when 100% complete)
  const handleGenerateBonusPlan = async (mode: 'tomorrow' | 'review' | 'weak') => {
    if (!apiKey) {
      alert('Добави API ключ в Settings за да използваш AI планиране.');
      return;
    }

    setBonusPlanMode(mode);
    setLoadingBonusPlan(true);

    try {
      const response = await fetchWithTimeout('/api/ai-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjectsForPlan,
          schedule: data.schedule,
          dailyStatus: data.dailyStatus,
          studyGoals: data.studyGoals,
          academicEvents: data.academicEvents,
          academicPeriod: data.academicPeriod,
          apiKey,
          bonusMode: mode, // Tell the API this is a bonus plan
          studyTechniques: data.studyTechniques?.filter(t => t.isActive).map(t => ({
            name: t.name, slug: t.slug, practiceCount: t.practiceCount,
            lastPracticedAt: t.lastPracticedAt, howToApply: t.howToApply.substring(0, 150)
          }))
        })
      });

      const result = await response.json();

      if (result.error) {
        alert(`Грешка: ${result.error}`);
      } else if (result.tasks) {
        // Save as custom plan (replaces current)
        const todayStr = getTodayString();
        const customPlanKey = `custom-daily-plan-${todayStr}`;
        localStorage.setItem(customPlanKey, JSON.stringify({
          date: todayStr,
          tasks: result.tasks,
          isCustomized: true
        }));
        setCustomPlan(result.tasks);
        setPlanIsCustomized(true);
        setAiPlanReasoning(result.reasoning || null);

        // Reset completed states for new plan
        setCompletedTasks(new Set());
        setCompletedTopics(new Set());

        if (result.cost) {
          incrementApiCalls(result.cost);
        }
      }
    } catch (error) {
      console.error('Failed to generate bonus plan:', error);
      alert(getFetchErrorMessage(error));
    } finally {
      setLoadingBonusPlan(false);
      setBonusPlanMode(null);
    }
  };

  // Generate AI plan
  const handleGenerateAiPlan = async () => {
    if (!apiKey) {
      alert('Добави API ключ в Settings за да използваш AI планиране.');
      return;
    }

    setLoadingAiPlan(true);
    setAiPlanReasoning(null);

    try {
      const response = await fetchWithTimeout('/api/ai-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjectsForPlan,
          schedule: data.schedule,
          dailyStatus: data.dailyStatus,
          studyGoals: data.studyGoals,
          academicEvents: data.academicEvents,
          academicPeriod: data.academicPeriod,
          apiKey,
          studyTechniques: data.studyTechniques?.filter(t => t.isActive).map(t => ({
            name: t.name, slug: t.slug, practiceCount: t.practiceCount,
            lastPracticedAt: t.lastPracticedAt, howToApply: t.howToApply.substring(0, 150)
          }))
        })
      });

      const result = await response.json();

      if (result.error) {
        alert(`Грешка: ${result.error}`);
      } else if (result.tasks) {
        // Save as custom plan
        const todayStr = getTodayString();
        const customPlanKey = `custom-daily-plan-${todayStr}`;
        localStorage.setItem(customPlanKey, JSON.stringify({
          date: todayStr,
          tasks: result.tasks,
          isCustomized: true
        }));
        setCustomPlan(result.tasks);
        setPlanIsCustomized(true);
        setAiPlanReasoning(result.reasoning || null);

        if (result.cost) {
          incrementApiCalls(result.cost);
        }
      }
    } catch (error) {
      console.error('Failed to generate AI plan:', error);
      alert(getFetchErrorMessage(error));
    } finally {
      setLoadingAiPlan(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!apiKey || !planFeedback.trim()) return;

    setLoadingFeedback(true);
    try {
      // Save feedback to localStorage for persistence
      const todayStr = getTodayString();
      localStorage.setItem(`plan-feedback-${todayStr}`, planFeedback.trim());

      const response = await fetchWithTimeout('/api/ai-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjectsForPlan,
          schedule: data.schedule,
          dailyStatus: data.dailyStatus,
          studyGoals: data.studyGoals,
          academicEvents: data.academicEvents,
          academicPeriod: data.academicPeriod,
          apiKey,
          userFeedback: planFeedback.trim(),
          studyTechniques: data.studyTechniques?.filter(t => t.isActive).map(t => ({
            name: t.name, slug: t.slug, practiceCount: t.practiceCount,
            lastPracticedAt: t.lastPracticedAt, howToApply: t.howToApply.substring(0, 150)
          }))
        })
      });

      const result = await response.json();

      if (result.error) {
        alert(`Грешка: ${result.error}`);
      } else if (result.tasks) {
        const customPlanKey = `custom-daily-plan-${todayStr}`;
        localStorage.setItem(customPlanKey, JSON.stringify({
          date: todayStr,
          tasks: result.tasks,
          isCustomized: true
        }));
        setCustomPlan(result.tasks);
        setPlanIsCustomized(true);
        setAiPlanReasoning(result.reasoning || null);
        setShowFeedbackModal(false);
        setPlanFeedback('');

        if (result.cost) {
          incrementApiCalls(result.cost);
        }
      }
    } catch (error) {
      console.error('Failed to generate AI plan with feedback:', error);
      alert(getFetchErrorMessage(error));
    } finally {
      setLoadingFeedback(false);
    }
  };

  // Use custom plan if available, otherwise use generated plan
  const activePlan = customPlan || dailyPlan;
  const allPlanTopics = activePlan.flatMap(task => task.topics);
  const completedTopicCount = allPlanTopics.filter(t => completedTopics.has(t.id)).length;
  const topicProgressPercent = allPlanTopics.length > 0
    ? Math.round((completedTopicCount / allPlanTopics.length) * 100) : 0;

  const typeColors = {
    setup: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    high: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
    normal: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    project: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
    technique: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400' }
  };

  const formatDate = () => {
    const d = new Date();
    const days = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
    const months = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
    return days[d.getDay()] + ", " + d.getDate() + " " + months[d.getMonth()];
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header with Streak & Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Streak */}
          {streak > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/30 rounded-xl">
              <Flame size={20} className="text-orange-400" />
              <div>
                <span className="text-lg font-bold text-orange-400 font-mono">{streak}</span>
                <span className="text-xs text-orange-400/70 font-mono ml-1">дни streak</span>
              </div>
            </div>
          )}
          {/* Vacation Mode Indicator */}
          {data.studyGoals.vacationMode && (
            <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-xl">
              <Umbrella size={20} className="text-cyan-400" />
              <div>
                <span className="text-sm font-bold text-cyan-400 font-mono">Vacation</span>
                <span className="text-xs text-cyan-400/70 font-mono ml-1">
                  {Math.round(data.studyGoals.vacationMultiplier * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Weekly Review */}
          <button
            onClick={() => setShowWeeklyReviewModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 rounded-lg transition-colors font-mono text-xs"
          >
            <Calendar size={14} />
            Седмичен преглед
          </button>
          {/* Status Button */}
          <button
            onClick={() => setShowCheckin(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
              data.dailyStatus.sick || data.dailyStatus.holiday
                ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {data.dailyStatus.sick ? <Thermometer size={16} /> :
             data.dailyStatus.holiday ? <Palmtree size={16} /> : <Zap size={16} />}
            <span className="text-xs font-mono">
              {data.dailyStatus.sick ? 'Болен' : data.dailyStatus.holiday ? 'Почивка' : 'Нормален'}
            </span>
          </button>
        </div>
      </div>

      {/* On-Track Status Banner */}
      {overallStatus && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          overallStatus.status === 'ready' ? 'bg-green-500/10 border-green-500/20' :
          overallStatus.status === 'on_track' ? 'bg-blue-500/10 border-blue-500/20' :
          overallStatus.status === 'at_risk' ? 'bg-orange-500/10 border-orange-500/20' :
          'bg-red-500/10 border-red-500/20'
        }`}>
          <span className={`text-lg ${
            overallStatus.status === 'ready' ? 'text-green-400' :
            overallStatus.status === 'on_track' ? 'text-blue-400' :
            overallStatus.status === 'at_risk' ? 'text-orange-400' :
            'text-red-400'
          }`}>
            {overallStatus.status === 'ready' ? <CheckCircle2 size={20} /> :
             overallStatus.status === 'on_track' ? <TrendingUp size={20} /> :
             <AlertTriangle size={20} />}
          </span>
          <div className="flex-1">
            <span className={`text-sm font-bold font-mono ${
              overallStatus.status === 'ready' ? 'text-green-400' :
              overallStatus.status === 'on_track' ? 'text-blue-400' :
              overallStatus.status === 'at_risk' ? 'text-orange-400' :
              'text-red-400'
            }`}>
              {overallStatus.label}
            </span>
            <span className="text-xs text-slate-500 font-mono ml-2">
              {overallStatus.avgReadiness}% готовност
              {overallStatus.subjectsBehind > 0 && ` · ${overallStatus.subjectsBehind} предмет${overallStatus.subjectsBehind > 1 ? 'а' : ''} изостава${overallStatus.subjectsBehind > 1 ? 'т' : ''}`}
              {overallStatus.subjectsAtRisk > 0 && overallStatus.subjectsBehind === 0 && ` · ${overallStatus.subjectsAtRisk} предмет${overallStatus.subjectsAtRisk > 1 ? 'а' : ''} под внимание`}
            </span>
          </div>
        </div>
      )}

      {/* Crunch Mode Indicator */}
      {crunchStatus.isActive && (
        <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="text-3xl animate-pulse">🔥</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-red-400 font-mono">CRUNCH MODE</span>
                  <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-mono">
                    {crunchStatus.reason}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono mt-1">
                  Стратегия за максимално покритие
                </div>
              </div>
            </div>
          </div>

          {/* Urgent Subjects */}
          {crunchStatus.urgentSubjects.length > 0 && (
            <div className="mb-3 flex gap-2 flex-wrap">
              {crunchStatus.urgentSubjects.map(s => (
                <span key={s.name} className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded font-mono">
                  {s.name}: {s.daysLeft}д / {s.workloadPerDay} теми/ден
                </span>
              ))}
            </div>
          )}

          {/* Tips */}
          <div className="space-y-1">
            {crunchStatus.tips.map((tip, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-300 font-mono">
                <span className="text-yellow-400">→</span>
                {tip}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anki Due Cards Widget - FIRST, before daily plan */}
      {ankiStats && (
        <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers size={24} className="text-blue-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-100 font-mono">Anki Flashcards</h3>
                <p className="text-xs text-slate-400 font-mono">Due за днес</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-blue-400">{ankiStats.dueToday}</div>
                <div className="text-xs text-slate-500 font-mono">Due</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-cyan-400">{ankiStats.newToday}</div>
                <div className="text-xs text-slate-500 font-mono">New</div>
              </div>
              <button
                onClick={refreshAnkiStats}
                disabled={ankiLoading}
                className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                title="Обнови"
              >
                <RefreshCw size={16} className={ankiLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {(ankiStats.dueToday + ankiStats.newToday) > 0 ? (
            <div className="mt-3 text-xs text-slate-400 font-mono">
              Препоръка: Направи Anki преди да започнеш нови теми (~{Math.round((ankiStats.dueToday + ankiStats.newToday) * 0.5)} мин)
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-400 font-mono">
              <CheckCircle2 size={14} />
              Всички карти за днес са готови!
            </div>
          )}
        </div>
      )}

      {/* Today's Schedule */}
      {(() => {
        const todayDayIndex = (new Date().getDay() + 6) % 7;
        const todayClasses = activeSchedule
          .filter(c => c.day === todayDayIndex)
          .sort((a, b) => a.time.localeCompare(b.time));
        if (todayClasses.length === 0) return null;
        return (
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-orange-400" />
              <span className="text-sm font-semibold text-slate-300 font-mono">Днешни занятия</span>
              <span className="text-xs text-slate-600 font-mono">{todayClasses.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {todayClasses.map(cls => {
                const subject = data.subjects.find(s => s.id === cls.subjectId);
                if (!subject) return null;
                return (
                  <Link
                    key={cls.id}
                    href={`/subjects?id=${subject.id}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all hover:brightness-125"
                    style={{ backgroundColor: subject.color + '15', borderColor: subject.color + '40' }}
                  >
                    <span className="text-xs font-mono font-semibold" style={{ color: subject.color }}>{cls.time}</span>
                    <span className="text-xs text-slate-200 font-medium">{subject.name}</span>
                    {cls.room && <span className="text-[10px] text-slate-500 font-mono">({cls.room})</span>}
                    {cls.description && <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">- {cls.description}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Daily Plan Tasks */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
        <div className="p-6 border-b border-[#1e293b]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
                <BookOpen size={20} />
                Днешен план
                {planIsCustomized && (
                  <span className="text-xs text-cyan-400 font-normal">(редактиран)</span>
                )}
              </h2>
              <p className="text-sm text-slate-500 font-mono mt-1">{formatDate()}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAiPlan}
                  disabled={loadingAiPlan}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg transition-all"
                  title="Генерирай план с Claude Opus за максимално качество"
                >
                  {loadingAiPlan ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      AI...
                    </>
                  ) : (
                    <>
                      <Wand2 size={12} />
                      AI план
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    // Load saved feedback if any
                    const saved = localStorage.getItem(`plan-feedback-${getTodayString()}`);
                    if (saved) setPlanFeedback(saved);
                    setShowFeedbackModal(true);
                  }}
                  disabled={!apiKey}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 rounded-lg transition-colors disabled:opacity-30"
                  title="Дай feedback и AI ще пренаправи плана"
                >
                  <MessageSquare size={12} />
                  Feedback
                </button>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-cyan-400 border border-slate-700 hover:border-cyan-500/50 rounded-lg transition-colors"
                >
                  Редактирай
                </button>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-400 font-mono">{topicProgressPercent}%</div>
                <div className="text-xs text-slate-500 font-mono">{completedTopicCount}/{allPlanTopics.length} теми</div>
              </div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
              style={{ width: topicProgressPercent + "%" }}
            />
          </div>
        </div>

        {/* AI Reasoning */}
        {aiPlanReasoning && planIsCustomized && (
          <div className="px-6 py-3 border-b border-[#1e293b] bg-gradient-to-r from-purple-900/20 to-cyan-900/20">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Wand2 size={12} className="text-purple-400" />
              <span className="text-purple-300">AI:</span>
              <span>{aiPlanReasoning}</span>
            </div>
          </div>
        )}

        {activePlan.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-slate-400 font-mono">Няма планирани задачи за днес</p>
            <p className="text-sm text-slate-500 font-mono mt-2">
              Добави предмети с изпитни дати за персонализиран план
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e293b]">
            {activePlan.map(task => {
              const isCompleted = completedTasks.has(task.id);
              const colors = typeColors[task.type];
              return (
                <div key={task.id} className={"p-5 transition-all " + (isCompleted ? "opacity-50" : "")}>
                  <div className="flex items-start gap-4">
                    <button onClick={() => toggleTask(task.id, task)} className="mt-1 transition-transform hover:scale-110">
                      {isCompleted ? (
                        <CheckCircle2 size={24} className="text-green-500" />
                      ) : (
                        <Circle size={24} className="text-slate-600 hover:text-slate-400" />
                      )}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={"text-xs font-mono px-2 py-1 rounded " + colors.bg + " " + colors.text + " border " + colors.border}>
                          {task.typeLabel}
                        </span>
                        {/* Cognitive Load Indicator */}
                        {(() => {
                          const grayCount = task.topics.filter(t => t.status === 'gray').length;
                          const yellowCount = task.topics.filter(t => t.status === 'yellow').length;
                          const totalTopics = task.topics.length;

                          if (totalTopics === 0) return null;

                          const grayRatio = grayCount / totalTopics;

                          if (grayRatio > 0.5 || task.type === 'critical') {
                            return (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30" title="Тежко - нов материал">
                                🔥 Тежко
                              </span>
                            );
                          } else if (grayRatio > 0 || yellowCount > 0) {
                            return (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" title="Умерено - преговор + ново">
                                ⚡ Умерено
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="Леко - консолидация">
                                💚 Леко
                              </span>
                            );
                          }
                        })()}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: task.subjectColor }} />
                        <Link
                          href={`/subjects?id=${task.subjectId}`}
                          className={"font-medium transition-colors " + (isCompleted ? "line-through text-slate-500" : "text-slate-200 hover:text-blue-400")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {task.subjectName}
                        </Link>
                      </div>
                      <p className={"text-sm mb-3 " + (isCompleted ? "text-slate-600" : "text-slate-400")}>
                        {task.description}
                      </p>
                      {/* Render topics for subject tasks */}
                      {task.topics.length > 0 && (
                        <div className="space-y-1.5">
                          {task.topics.map((topic) => {
                            const isTopicDone = completedTopics.has(topic.id);
                            const subject = activeSubjects.find(s => s.topics.some(t => t.id === topic.id));
                            return (
                              <div key={topic.id} className={`flex items-center gap-2 p-2 rounded-lg transition-all overflow-hidden ${
                                isTopicDone ? 'bg-green-500/10' : 'hover:bg-slate-800/50'
                              }`}>
                                <button onClick={(e) => { e.stopPropagation(); toggleTopic(topic.id); }} className="shrink-0">
                                  {isTopicDone ? (
                                    <CheckCircle2 size={18} className="text-green-500" />
                                  ) : (
                                    <Circle size={18} className="text-slate-600 hover:text-slate-400" />
                                  )}
                                </button>
                                <Link
                                  href={subject ? `/subjects/${subject.id}/topics/${topic.id}` : '#'}
                                  className={`flex-1 min-w-0 overflow-hidden text-xs font-mono group ${
                                    isTopicDone ? 'line-through text-slate-500' : 'text-slate-300 hover:text-blue-400'
                                  }`}
                                  title={`#${topic.number} ${topic.name}`}
                                >
                                  <span className="shrink-0 w-2 h-2 rounded-full inline-block mr-1.5"
                                    style={{ backgroundColor: STATUS_CONFIG[topic.status].text }} />
                                  <span className="group-hover:underline">
                                    #{topic.number} {topic.name.length > 45 ? topic.name.slice(0, 45) + '...' : topic.name}
                                  </span>
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Render modules for project tasks */}
                      {task.type === 'project' && task.projectModules && task.projectModules.length > 0 && (
                        <div className="space-y-1.5">
                          {task.projectModules.map((module) => {
                            const isModuleDone = module.status === 'completed';
                            return (
                              <div key={module.id} className={`flex items-center gap-2 p-2 rounded-lg transition-all overflow-hidden ${
                                isModuleDone ? 'bg-green-500/10' : 'hover:bg-slate-800/50'
                              }`}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (task.projectId) {
                                      updateProjectModule(task.projectId, module.id, {
                                        status: isModuleDone ? 'available' : 'completed'
                                      });
                                    }
                                  }}
                                  className="shrink-0"
                                >
                                  {isModuleDone ? (
                                    <CheckCircle2 size={18} className="text-green-500" />
                                  ) : (
                                    <Circle size={18} className="text-slate-600 hover:text-slate-400" />
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const project = data.developmentProjects.find(p => p.id === task.projectId);
                                    if (project) {
                                      // Find the full module from project (task.projectModules might be stale)
                                      const fullModule = project.modules.find(m => m.id === module.id) || module;
                                      setSelectedModule({ module: fullModule, project });
                                    }
                                  }}
                                  className={`flex-1 min-w-0 overflow-hidden text-left text-xs font-mono group ${
                                    isModuleDone ? 'line-through text-slate-500' : 'text-slate-300 hover:text-cyan-400'
                                  }`}
                                  title={module.title}
                                >
                                  <Rocket size={12} className="inline mr-1.5 text-cyan-400" />
                                  <span className="group-hover:underline">
                                    {module.title.length > 45 ? module.title.slice(0, 45) + '...' : module.title}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Drill Weakness link */}
                      {task.typeLabel.includes('Drill Weakness') && task.topics.length === 0 && (
                        <Link
                          href={`/quiz?subject=${task.subjectId}&topic=${
                            activeSubjects.find(s => s.id === task.subjectId)?.topics[0]?.id || ''
                          }`}
                          className="block p-2 rounded-lg bg-orange-500/5 hover:bg-orange-500/10 text-xs font-mono text-orange-400 transition-all"
                        >
                          <Repeat size={12} className="inline mr-1.5" />
                          Drill Weakness Quiz (cross-topic)
                        </Link>
                      )}
                      {/* Empty state for projects without modules */}
                      {task.type === 'project' && (!task.projectModules || task.projectModules.length === 0) && (
                        <Link
                          href="/projects"
                          className="block p-2 rounded-lg bg-cyan-500/5 hover:bg-cyan-500/10 text-xs font-mono text-cyan-400 transition-all"
                        >
                          <Rocket size={12} className="inline mr-1.5" />
                          Отвори проекта за повече детайли
                        </Link>
                      )}
                      {/* Technique "How to" expandable + link to techniques page (for standalone technique tasks) */}
                      {task.type === 'technique' && task.techniqueHowToApply && (
                        <details className="mt-2">
                          <summary className="text-xs text-violet-400 cursor-pointer hover:text-violet-300 transition-colors font-mono">
                            Как? (натисни за инструкции)
                          </summary>
                          <pre className="mt-2 text-[11px] text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-violet-500/5 rounded-lg p-3 border border-violet-500/10">
                            {task.techniqueHowToApply}
                          </pre>
                          <Link
                            href="/techniques"
                            className="inline-block mt-2 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            Виж всички техники →
                          </Link>
                        </details>
                      )}
                      {/* Embedded technique suggestion (inside regular task card) */}
                      {task.suggestedTechnique && (
                        <details className="mt-2 rounded-lg bg-violet-500/5 border border-violet-500/15">
                          <summary className="px-3 py-2 cursor-pointer hover:bg-violet-500/10 transition-colors rounded-lg flex items-center gap-2">
                            <span className="text-sm">{task.suggestedTechnique.icon}</span>
                            <span className="text-xs font-semibold text-violet-400">Приложи: {task.suggestedTechnique.name}</span>
                            <span className="text-[10px] text-violet-500 ml-auto">▾</span>
                          </summary>
                          <div className="px-3 pb-3 pt-1">
                            <p className="text-[11px] text-slate-400 mb-2">{task.suggestedTechnique.description}</p>
                            <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-[#1a1a2e] rounded-lg p-2.5">
                              {task.suggestedTechnique.howToApply}
                            </pre>
                            <Link
                              href="/techniques"
                              className="inline-block mt-2 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              Виж всички техники →
                            </Link>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* "Learn a new technique" hint - subtle banner, every 3 days */}
      {(() => {
        const techniques = data.studyTechniques || [];
        const activeCount = techniques.filter(t => t.isActive).length;
        const inactive = techniques.filter(t => !t.isActive);
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
        if (inactive.length > 0 && activeCount < 5 && dayOfYear % 3 === 0) {
          const next = inactive[dayOfYear % inactive.length];
          return (
            <Link
              href="/techniques"
              className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-violet-500/5 border border-violet-500/15 hover:bg-violet-500/10 transition-colors group"
            >
              <span className="text-lg">{next.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-violet-400 font-medium">Готов за нова техника?</span>
                <span className="text-xs text-slate-500 ml-1.5">Разгледай <span className="text-violet-300">{next.name}</span></span>
              </div>
              <ChevronRight size={14} className="text-violet-500 group-hover:text-violet-300 transition-colors shrink-0" />
            </Link>
          );
        }
        return null;
      })()}

      {/* Completion Message with Bonus Options */}
      {topicProgressPercent === 100 && activePlan.length > 0 && (
        <div className="p-6 rounded-xl bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/30">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-green-300 font-mono text-lg">Всички задачи за днес са завършени!</p>
          </div>

          {/* Bonus Plan Options */}
          <div className="mt-6 pt-4 border-t border-green-700/30">
            <p className="text-center text-slate-400 font-mono text-sm mb-4">Искаш ли да продължиш?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleGenerateBonusPlan('tomorrow')}
                disabled={loadingBonusPlan || !apiKey}
                className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingBonusPlan && bonusPlanMode === 'tomorrow' ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    <span className="text-blue-300 font-mono text-sm">Генерирам...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl mb-2">📅</div>
                    <div className="text-blue-300 font-mono text-sm font-medium">Утрешен материал</div>
                    <div className="text-slate-500 font-mono text-xs mt-1">Започни напред</div>
                  </>
                )}
              </button>

              <button
                onClick={() => handleGenerateBonusPlan('review')}
                disabled={loadingBonusPlan || !apiKey}
                className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingBonusPlan && bonusPlanMode === 'review' ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                    <span className="text-purple-300 font-mono text-sm">Генерирам...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl mb-2">🔄</div>
                    <div className="text-purple-300 font-mono text-sm font-medium">Екстра преговор</div>
                    <div className="text-slate-500 font-mono text-xs mt-1">Затвърди наученото</div>
                  </>
                )}
              </button>

              <button
                onClick={() => handleGenerateBonusPlan('weak')}
                disabled={loadingBonusPlan || !apiKey}
                className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingBonusPlan && bonusPlanMode === 'weak' ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                    <span className="text-orange-300 font-mono text-sm">Генерирам...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl mb-2">🎯</div>
                    <div className="text-orange-300 font-mono text-sm font-medium">Слаби теми</div>
                    <div className="text-slate-500 font-mono text-xs mt-1">Фокус върху gaps</div>
                  </>
                )}
              </button>
            </div>
            {!apiKey && (
              <p className="text-center text-slate-500 font-mono text-xs mt-3">
                Добави API ключ в Settings за AI планиране
              </p>
            )}
          </div>
        </div>
      )}

      {/* FSRS Scheduled Reviews */}
      {fsrsReviews.length > 0 && (
        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Brain size={20} className="text-purple-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-100 font-mono">FSRS Преговор</h3>
                <p className="text-xs text-slate-400 font-mono">{fsrsReviews.length} теми с ниска запаметеност</p>
              </div>
            </div>
            {fsrsReviews.length > 1 && (
              <Link
                href={`/quiz?multi=true&topics=${fsrsReviews.slice(0, 5).map(r => `${r.subject.id}:${r.topic.id}`).join(',')}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                <Brain size={12} />
                Mix Quiz ({Math.min(5, fsrsReviews.length)})
              </Link>
            )}
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {fsrsReviews.slice(0, 8).map(({ topic, subject, retrievability }) => (
              <div key={topic.id} className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg">
                <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 truncate">{topic.name}</div>
                  <div className="text-[10px] text-slate-500">{subject.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-mono font-bold ${
                    retrievability < 0.5 ? 'text-red-400' : retrievability < 0.7 ? 'text-orange-400' : 'text-yellow-400'
                  }`}>
                    {Math.round(retrievability * 100)}%
                  </div>
                  <Link
                    href={`/quiz?subject=${subject.id}&topic=${topic.id}`}
                    className="px-2 py-1 text-[10px] font-mono bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded transition-colors"
                  >
                    Quiz
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {fsrsReviews.length > 8 && (
            <div className="mt-2 text-center">
              <span className="text-xs text-slate-500 font-mono">+{fsrsReviews.length - 8} още теми</span>
            </div>
          )}
        </div>
      )}

      {/* Syllabus Progress Widget - Collapsible */}
      {syllabusProgress.bySubject.length > 0 && (
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
          <button
            onClick={() => setSyllabusExpanded(!syllabusExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-3">
              <TrendingUp size={20} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100 font-mono">Прогрес по конспект</h3>
              <span className="text-xs text-slate-500 font-mono">({syllabusProgress.bySubject.length} предмета)</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Compact summary when collapsed */}
              {!syllabusExpanded && (() => {
                const hasCritical = syllabusProgress.bySubject.some(s => s.urgency === 'critical');
                const hasWarning = syllabusProgress.bySubject.some(s => s.warning);
                return (
                  <>
                    {(hasCritical || hasWarning) && (
                      <span className="text-xs text-red-400 font-mono flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {hasWarning ? 'Изоставане' : 'Критично'}
                      </span>
                    )}
                    <div className="flex gap-1">
                      {syllabusProgress.bySubject.slice(0, 6).map(s => {
                        const subjectData = activeSubjects.find(sd => sd.id === s.subjectId);
                        const total = subjectData?.topics.length || 1;
                        const done = subjectData?.topics.filter(t => t.status === 'green').length || 0;
                        const pct = Math.round((done / total) * 100);
                        return (
                          <div key={s.subjectId} className="w-6 h-2 rounded-full bg-slate-700 overflow-hidden" title={`${s.subjectName}: ${pct}%`}>
                            <div className="h-full rounded-full" style={{
                              width: `${pct}%`,
                              backgroundColor: subjectData?.color || '#64748b'
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              <ChevronDown size={16} className={`text-slate-500 transition-transform ${syllabusExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {syllabusExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {syllabusProgress.bySubject.map(subject => {
                const subjectData = activeSubjects.find(s => s.id === subject.subjectId);
                const totalTopics = subjectData?.topics.length || 0;
                const greenTopics = subjectData?.topics.filter(t => t.status === 'green').length || 0;
                const progressPercent = totalTopics > 0 ? Math.round((greenTopics / totalTopics) * 100) : 0;

                return (
                  <div key={subject.subjectId} className="bg-slate-800/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subjectData?.color || '#64748b' }} />
                        <Link href={`/subjects?id=${subject.subjectId}`} className="text-sm font-medium text-slate-200 hover:text-blue-400 font-mono transition-colors">
                          {subject.subjectName}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        {subject.urgency === 'critical' && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                            <AlertTriangle size={10} /> Критично
                          </span>
                        )}
                        {subject.urgency === 'high' && (
                          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-mono">Спешно</span>
                        )}
                        {subject.warning && (
                          <span className="text-xs text-red-400 font-mono">{subject.warning}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full mb-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progressPercent}%`,
                          backgroundColor: progressPercent >= 80 ? '#22c55e' : progressPercent >= 50 ? '#eab308' : '#f97316'
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                      <span>{greenTopics}/{totalTopics} готови ({progressPercent}%)</span>
                      <span className="flex items-center gap-3">
                        <span>{subject.remaining} остават</span>
                        <span>{subject.daysLeft}д до изпит</span>
                        <span className={subject.topics > 5 ? 'text-red-400' : subject.topics > 3 ? 'text-yellow-400' : 'text-emerald-400'}>
                          {subject.topics} теми/ден
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Overall status */}
              <div className="pt-3 border-t border-slate-700/50">
                {(() => {
                  const avgTopicsPerDay = syllabusProgress.bySubject.reduce((sum, s) => sum + s.topics, 0) / Math.max(1, syllabusProgress.bySubject.length);
                  const hasCritical = syllabusProgress.bySubject.some(s => s.urgency === 'critical');
                  const hasWarnings = syllabusProgress.bySubject.some(s => s.warning);

                  if (hasWarnings) {
                    return (
                      <div className="flex items-center gap-2 text-red-400 text-sm font-mono">
                        <AlertTriangle size={16} />
                        <span>Изоставаш! Някои предмети имат нереалистичен workload.</span>
                      </div>
                    );
                  } else if (hasCritical) {
                    return (
                      <div className="flex items-center gap-2 text-orange-400 text-sm font-mono">
                        <Flame size={16} />
                        <span>Критични изпити наближават - фокусирай се!</span>
                      </div>
                    );
                  } else if (avgTopicsPerDay <= 3) {
                    return (
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono">
                        <CheckCircle2 size={16} />
                        <span>По график си! Средно {avgTopicsPerDay.toFixed(1)} теми/ден.</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="flex items-center gap-2 text-yellow-400 text-sm font-mono">
                        <TrendingUp size={16} />
                        <span>Малко натоварено ({avgTopicsPerDay.toFixed(1)} теми/ден), но изпълнимо.</span>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {showCheckin && <DailyCheckinModal onClose={() => setShowCheckin(false)} />}

      {showEditModal && (
        <EditDailyPlanModal
          onClose={() => setShowEditModal(false)}
          originalPlan={dailyPlan}
          customPlan={customPlan || []}
          onSave={handleSaveCustomPlan}
        />
      )}

      {showWeeklyReviewModal && (
        <WeeklyReviewModal onClose={() => setShowWeeklyReviewModal(false)} />
      )}

      {selectedModule && (
        <ModuleDetailModal
          module={selectedModule.module}
          project={selectedModule.project}
          onClose={() => setSelectedModule(null)}
        />
      )}

      {/* AI Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loadingFeedback && setShowFeedbackModal(false)} />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
              <h3 className="text-base font-semibold text-slate-100 font-mono flex items-center gap-2">
                <MessageSquare size={18} className="text-amber-400" />
                Feedback за плана
              </h3>
              <button
                onClick={() => !loadingFeedback && setShowFeedbackModal(false)}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400 font-mono">
                Напиши какво да промени AI в плана. Може да кажеш кои предмети са лесни/трудни, какъв фокус искаш, или друго.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeSubjects.slice(0, 8).map(s => (
                  <span key={s.id} className="text-[10px] px-2 py-1 rounded-full font-mono" style={{ backgroundColor: s.color + '30', color: s.color, border: `1px solid ${s.color}40` }}>
                    {s.name}
                    {s.examDifficulty && s.examDifficulty !== 'medium' && (
                      <span className="ml-1 opacity-70">
                        ({s.examDifficulty === 'easy' ? 'лесен' : 'труден'})
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <textarea
                value={planFeedback}
                onChange={(e) => setPlanFeedback(e.target.value.slice(0, 500))}
                placeholder="напр. Хирургия е лесен изпит, не ми трябва много подготовка. Патофизиология е убиец — фокусирай се повече там..."
                rows={4}
                maxLength={500}
                autoFocus
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowFeedbackModal(false);
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-600 font-mono">{planFeedback.length}/500</span>
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={loadingFeedback || !planFeedback.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-mono bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-lg transition-all"
                >
                  {loadingFeedback ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Генериране...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Пренаправи плана
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
