'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Plus, BookOpen, Calendar, Flame, Zap, BarChart3 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil, calculatePredictedGrade, getAlerts, getTopicsNeedingFSRSReview, getSubjectHealth, getNextExamReadiness } from '@/lib/algorithms';
import { getCurrentStreak, getLongestStreak, getAnalyticsSummary } from '@/lib/analytics';
import { STATUS_CONFIG } from '@/lib/constants';
import { Subject, TopicStatus } from '@/lib/types';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import Link from 'next/link';
import { checkAnkiConnect, getCollectionStats, type CollectionStats, getSelectedDecks } from '@/lib/anki';

// Dashboard Widgets
const WeeklyBarChart = dynamic(() => import('@/components/dashboard/WeeklyBarChart'), {
  ssr: false,
  loading: () => <div className="h-40 bg-slate-800/30 rounded-lg animate-pulse" />
});
import ContinueStudyWidget from '@/components/dashboard/ContinueStudyWidget';
import ExamReadinessWidget from '@/components/dashboard/ExamReadinessWidget';
import FSRSReviewWidget from '@/components/dashboard/FSRSReviewWidget';
import StudyProgressPanel from '@/components/dashboard/StudyProgressPanel';
import ActionPanel from '@/components/dashboard/ActionPanel';
import AttentionPanel from '@/components/dashboard/AttentionPanel';

interface SubjectsSectionProps {
  subjects: Subject[];
  onAddClick: () => void;
}

interface SubjectCardProps {
  subject: Subject;
}

export default function Dashboard() {
  const { data, isLoading, addDailyGoal, toggleDailyGoal, deleteDailyGoal } = useApp();
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [ankiStats, setAnkiStats] = useState<CollectionStats | null>(null);

  // Fetch Anki stats if enabled
  useEffect(() => {
    const ankiEnabled = localStorage.getItem('anki-enabled');
    if (ankiEnabled === 'true') {
      refreshAnkiStats();
    }
  }, []);

  const refreshAnkiStats = async () => {
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
  };

  // All hooks before any early return
  const activeSubjects = useMemo(() => data.subjects.filter(s => !s.archived && !s.deletedAt), [data.subjects]);
  const alerts = useMemo(() => getAlerts(activeSubjects, data.schedule, data.studyGoals), [activeSubjects, data.schedule, data.studyGoals]);
  const currentStreak = useMemo(() => getCurrentStreak(data.timerSessions), [data.timerSessions]);
  const longestStreak = useMemo(() => getLongestStreak(data.timerSessions), [data.timerSessions]);
  const fsrsReviews = useMemo(() => getTopicsNeedingFSRSReview(activeSubjects, data.studyGoals.fsrsMaxReviewsPerDay || 8, data.studyGoals), [activeSubjects, data.studyGoals]);
  const analyticsSummary = useMemo(() => getAnalyticsSummary(data.timerSessions, activeSubjects, data.userProgress), [data.timerSessions, activeSubjects, data.userProgress]);
  const subjectHealthStatuses = useMemo(() => {
    try { return getSubjectHealth(activeSubjects); }
    catch (e) { console.error('getSubjectHealth error:', e); return []; }
  }, [activeSubjects]);
  const nextExamReadiness = useMemo(() => {
    try { return getNextExamReadiness(activeSubjects, data.questionBanks || []); }
    catch (e) { console.error('getNextExamReadiness error:', e); return null; }
  }, [activeSubjects, data.questionBanks]);

  // Determine which adaptive cards to show
  const hasAttention = (subjectHealthStatuses?.length > 0) ||
    activeSubjects.some(s => s.topics.some(t => t.wrongAnswers?.length)) ||
    (data.academicEvents?.length > 0) ||
    alerts.length > 0;

  // Count adaptive cards for grid sizing
  const adaptiveCardCount = 1 + // ActionPanel always
    (nextExamReadiness ? 1 : 0) +
    (fsrsReviews.length > 0 ? 1 : 0) +
    (hasAttention ? 1 : 0);

  const gridCols = adaptiveCardCount <= 1 ? 'grid-cols-1'
    : adaptiveCardCount === 2 ? 'grid-cols-1 md:grid-cols-2'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="h-8 w-64 bg-slate-800/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" />
          <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-slate-800/30 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* ROW 0: Header */}
      <PageHeader
        onAddClick={() => setShowAddSubject(true)}
        currentStreak={currentStreak}
        level={analyticsSummary.level}
        totalQuizzes={analyticsSummary.totalQuizzes}
        avgScore={analyticsSummary.averageQuizScore}
      />

      {/* ROW 1: Continue Study (conditional) */}
      <ContinueStudyWidget lastOpenedTopic={data.lastOpenedTopic} subjects={activeSubjects} />

      {/* ROW 2: Study Progress */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7">
          <WeeklyBarChart
            timerSessions={data.timerSessions}
            dailyGoal={data.studyGoals.dailyMinutes}
            ankiStats={ankiStats}
          />
        </div>
        <div className="md:col-span-5">
          <StudyProgressPanel
            timerSessions={data.timerSessions}
            studyGoals={data.studyGoals}
            currentStreak={currentStreak}
            longestStreak={longestStreak}
          />
        </div>
      </div>

      {/* ROW 3: Adaptive grid — only renders widgets that have data */}
      <div className={`grid ${gridCols} gap-4`}>
        <ActionPanel
          subjects={activeSubjects}
          goals={data.dailyGoals || []}
          onAddGoal={addDailyGoal}
          onToggleGoal={toggleDailyGoal}
          onDeleteGoal={deleteDailyGoal}
        />
        <ExamReadinessWidget readiness={nextExamReadiness} />
        <FSRSReviewWidget reviews={fsrsReviews} />
        {hasAttention && (
          <AttentionPanel
            healthStatuses={subjectHealthStatuses || []}
            subjects={activeSubjects}
            events={data.academicEvents || []}
            alerts={alerts}
          />
        )}
      </div>

      {/* ROW 4: Subjects */}
      <SubjectsSection subjects={activeSubjects} onAddClick={() => setShowAddSubject(true)} />
      {showAddSubject && <AddSubjectModal onClose={() => setShowAddSubject(false)} />}
    </div>
  );
}

function PageHeader({ onAddClick, currentStreak, level, totalQuizzes, avgScore }: {
  onAddClick: () => void;
  currentStreak: number;
  level: number;
  totalQuizzes: number;
  avgScore: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 font-mono">Табло</h1>
        <p className="text-sm text-slate-500 font-mono mt-1">Общ преглед на прогреса</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2">
          {currentStreak > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 text-xs font-mono font-medium">
              <Flame size={13} fill={currentStreak >= 3 ? 'currentColor' : 'none'} />
              {currentStreak}д
            </span>
          )}
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-mono font-medium">
            <Zap size={13} />
            Lv.{level}
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-mono font-medium" title={`Ср: ${avgScore}%`}>
            <BarChart3 size={13} />
            {totalQuizzes}
          </span>
        </div>
        <button onClick={onAddClick} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-mono text-sm">
          <Plus size={18} /> Нов предмет
        </button>
      </div>
    </div>
  );
}

function SubjectsSection({ subjects, onAddClick }: SubjectsSectionProps) {
  if (subjects.length === 0) {
    return (
      <div className="p-12 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] text-center">
        <BookOpen size={48} className="text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 font-mono mb-4">Все още нямаш добавени предмети</p>
        <button onClick={onAddClick} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-mono text-sm">
          <Plus size={18} /> Добави първия си предмет
        </button>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 font-mono mb-4">Предмети</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s) => <SubjectCard key={s.id} subject={s} />)}
      </div>
    </div>
  );
}

function SubjectCard({ subject }: SubjectCardProps) {
  const { data } = useApp();
  const progress = getSubjectProgress(subject);
  const daysUntil = getDaysUntil(subject.examDate);
  const prediction = calculatePredictedGrade(subject, false, data.questionBanks || []);
  const daysClass = daysUntil <= 3 ? "text-red-400" : daysUntil <= 7 ? "text-orange-400" : "text-slate-400";
  const predClass = prediction.current >= 5 ? "text-green-400" : prediction.current >= 4 ? "text-yellow-400" : "text-orange-400";

  return (
    <Link href={"/subjects?id=" + subject.id} className="p-5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] hover:border-[#2e3b4e] transition-all group">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: subject.color }} />
        <span className="text-lg font-semibold text-slate-100 group-hover:text-white truncate">{subject.name}</span>
      </div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500 font-mono">{subject.topics.length} теми</span>
        {daysUntil !== Infinity && <span className={"text-sm font-mono flex items-center gap-1 " + daysClass}><Calendar size={14} />{daysUntil <= 0 ? "ДНЕС" : daysUntil + "д"}</span>}
      </div>
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 font-mono mb-1"><span>Прогрес</span><span>{progress.percentage}%</span></div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: progress.percentage + "%", backgroundColor: subject.color }} />
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div className="flex gap-2">{(Object.entries(progress.counts) as [TopicStatus, number][]).map(([st, cnt]) => cnt > 0 && <span key={st} className="text-sm font-mono" style={{ color: STATUS_CONFIG[st].text }}>{STATUS_CONFIG[st].emoji}{cnt}</span>)}</div>
        {subject.topics.length > 0 && <div className={"text-lg font-bold font-mono " + predClass}>{prediction.current.toFixed(2)}</div>}
      </div>
    </Link>
  );
}
