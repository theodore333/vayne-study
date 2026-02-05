'use client';

import { useState, useEffect, useMemo, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Plus, AlertTriangle, BookOpen, Target, Calendar, Layers, RefreshCw, Flame, Brain, BarChart3, Zap } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil, calculatePredictedGrade, getAlerts, getTopicsNeedingFSRSReview, getSubjectHealth, getNextExamReadiness } from '@/lib/algorithms';
import { getCurrentStreak, getLongestStreak, getAnalyticsSummary } from '@/lib/analytics';
import { STATUS_CONFIG } from '@/lib/constants';
import { Subject, TopicStatus } from '@/lib/types';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import Link from 'next/link';
import { checkAnkiConnect, getCollectionStats, CollectionStats, getSelectedDecks } from '@/lib/anki';

// Dashboard Widgets
import StudyStreakWidget from '@/components/dashboard/StudyStreakWidget';
const WeeklyBarChart = dynamic(() => import('@/components/dashboard/WeeklyBarChart'), {
  ssr: false,
  loading: () => <div className="h-40 bg-slate-800/30 rounded-lg animate-pulse" />
});
import GoalProgressRings from '@/components/dashboard/GoalProgressRings';
import ContinueStudyWidget from '@/components/dashboard/ContinueStudyWidget';
import QuickActionsRow from '@/components/dashboard/QuickActionsRow';
import AcademicEventsWidget from '@/components/dashboard/AcademicEventsWidget';
import SubjectHealthIndicator from '@/components/dashboard/SubjectHealthIndicator';
import ExamReadinessWidget from '@/components/dashboard/ExamReadinessWidget';
import DailyGoalsChecklist from '@/components/dashboard/DailyGoalsChecklist';

// Component prop types
interface StatsGridProps {
  subjects: Subject[];
  totalTopics: number;
  alertsCount: number;
}

interface StatCardProps {
  icon: ReactNode;
  bgColor: string;
  label: string;
  value: string | number;
  valueClass?: string;
}

interface StatusOverviewProps {
  statusCounts: Record<TopicStatus, number>;
  totalTopics: number;
}

interface SubjectsSectionProps {
  subjects: Subject[];
  onAddClick: () => void;
}

interface SubjectCardProps {
  subject: Subject;
}

interface Alert {
  type: 'critical' | 'warning' | 'info';
  message: string;
}

interface AlertsSectionProps {
  alerts: Alert[];
}

export default function Dashboard() {
  const { data, isLoading, addDailyGoal, toggleDailyGoal, deleteDailyGoal } = useApp();
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [ankiStats, setAnkiStats] = useState<CollectionStats | null>(null);
  const [ankiLoading, setAnkiLoading] = useState(false);

  // Fetch Anki stats if enabled
  useEffect(() => {
    const ankiEnabled = localStorage.getItem('anki-enabled');
    if (ankiEnabled === 'true') {
      refreshAnkiStats();
    }
  }, []);

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

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Skeleton header */}
        <div className="h-8 w-64 bg-slate-800/50 rounded animate-pulse" />
        {/* Skeleton top row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-800/30 rounded-xl animate-pulse" />
          ))}
        </div>
        {/* Skeleton middle row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" />
          <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" />
        </div>
        {/* Skeleton bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-slate-800/30 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Filter out archived and soft-deleted subjects
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  const alerts = getAlerts(activeSubjects, data.schedule, data.studyGoals);
  const totalTopics = activeSubjects.reduce((sum, s) => sum + s.topics.length, 0);
  const statusCounts = activeSubjects.reduce(
    (acc, subject) => {
      subject.topics.forEach(topic => { acc[topic.status]++; });
      return acc;
    },
    { green: 0, yellow: 0, orange: 0, gray: 0 }
  );

  // Analytics data
  const currentStreak = useMemo(() => getCurrentStreak(data.timerSessions), [data.timerSessions]);
  const longestStreak = useMemo(() => getLongestStreak(data.timerSessions), [data.timerSessions]);
  const fsrsReviews = useMemo(() => getTopicsNeedingFSRSReview(activeSubjects, data.studyGoals.fsrsMaxReviewsPerDay || 8, data.studyGoals), [activeSubjects, data.studyGoals]);
  const analyticsSummary = useMemo(() => getAnalyticsSummary(data.timerSessions, activeSubjects, data.userProgress), [data.timerSessions, activeSubjects, data.userProgress]);

  // New dashboard algorithms - wrapped in try-catch for safety
  const subjectHealthStatuses = useMemo(() => {
    try {
      return getSubjectHealth(activeSubjects);
    } catch (e) {
      console.error('getSubjectHealth error:', e);
      return [];
    }
  }, [activeSubjects]);

  const nextExamReadiness = useMemo(() => {
    try {
      return getNextExamReadiness(activeSubjects, data.questionBanks || []);
    } catch (e) {
      console.error('getNextExamReadiness error:', e);
      return null;
    }
  }, [activeSubjects, data.questionBanks]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader onAddClick={() => setShowAddSubject(true)} />

      {/* HERO ROW: Streak + Exam Readiness + Continue */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StudyStreakWidget currentStreak={currentStreak} longestStreak={longestStreak} />
        <ExamReadinessWidget readiness={nextExamReadiness} />
        <ContinueStudyWidget lastOpenedTopic={data.lastOpenedTopic} subjects={activeSubjects} />
      </div>

      {/* QUICK ACTIONS ROW */}
      <QuickActionsRow subjects={activeSubjects} />

      {/* PROGRESS ROW: Goal Rings + Weekly Bar Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GoalProgressRings
          timerSessions={data.timerSessions}
          studyGoals={data.studyGoals}
        />
        <WeeklyBarChart
          timerSessions={data.timerSessions}
          dailyGoal={data.studyGoals.dailyMinutes}
        />
      </div>

      {/* WIDGETS ROW: Academic Events + Subject Health + Daily Goals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AcademicEventsWidget
          events={data.academicEvents || []}
          subjects={activeSubjects}
          maxEvents={4}
        />
        <SubjectHealthIndicator
          healthStatuses={subjectHealthStatuses || []}
          maxItems={3}
        />
        <DailyGoalsChecklist
          goals={data.dailyGoals || []}
          onAddGoal={addDailyGoal}
          onToggleGoal={toggleDailyGoal}
          onDeleteGoal={deleteDailyGoal}
        />
      </div>

      <StatsGrid subjects={activeSubjects} totalTopics={totalTopics} alertsCount={alerts.length} />

      {/* Quick Analytics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickStatWidget
          icon={<Flame size={18} className="text-orange-400" />}
          label="Streak"
          value={`${currentStreak} дни`}
          subValue={`Рекорд: ${longestStreak}`}
          color="orange"
          href="/analytics"
        />
        <QuickStatWidget
          icon={<Brain size={18} className="text-purple-400" />}
          label="FSRS ревю"
          value={fsrsReviews.length.toString()}
          subValue="теми за преговор"
          color="purple"
          href="/today"
        />
        <QuickStatWidget
          icon={<Zap size={18} className="text-yellow-400" />}
          label="Ниво"
          value={`Lv. ${analyticsSummary.level}`}
          subValue={`${analyticsSummary.xpTotal} XP`}
          color="yellow"
          href="/analytics"
        />
        <QuickStatWidget
          icon={<BarChart3 size={18} className="text-blue-400" />}
          label="Тестове"
          value={analyticsSummary.totalQuizzes.toString()}
          subValue={`Ср: ${analyticsSummary.averageQuizScore}%`}
          color="blue"
          href="/analytics"
        />
      </div>

      {ankiStats && <AnkiWidget stats={ankiStats} onRefresh={refreshAnkiStats} loading={ankiLoading} />}
      <StatusOverview statusCounts={statusCounts} totalTopics={totalTopics} />
      <SubjectsSection subjects={activeSubjects} onAddClick={() => setShowAddSubject(true)} />
      {alerts.length > 0 && <AlertsSection alerts={alerts} />}
      {showAddSubject && <AddSubjectModal onClose={() => setShowAddSubject(false)} />}
    </div>
  );
}

function PageHeader({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 font-mono">Табло</h1>
        <p className="text-sm text-slate-500 font-mono mt-1">Общ преглед на прогреса</p>
      </div>
      <button onClick={onAddClick} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-mono text-sm">
        <Plus size={18} /> Нов предмет
      </button>
    </div>
  );
}

function StatsGrid({ subjects, totalTopics, alertsCount }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard icon={<BookOpen size={20} className="text-blue-400" />} bgColor="bg-blue-500/20" label="Предмети" value={subjects.length} />
      <StatCard icon={<Target size={20} className="text-purple-400" />} bgColor="bg-purple-500/20" label="Теми" value={totalTopics} />
      <StatCard icon={<AlertTriangle size={20} className="text-red-400" />} bgColor="bg-red-500/20" label="Известия" value={alertsCount} valueClass="text-red-400" />
    </div>
  );
}

function StatCard({ icon, bgColor, label, value, valueClass = "text-slate-100" }: StatCardProps) {
  return (
    <div className="p-5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
      <div className="flex items-center gap-3 mb-3">
        <div className={"p-2 rounded-lg " + bgColor}>{icon}</div>
        <span className="text-sm text-slate-400 font-mono">{label}</span>
      </div>
      <div className={"text-3xl font-bold font-mono " + valueClass}>{value}</div>
    </div>
  );
}

function StatusOverview({ statusCounts, totalTopics }: StatusOverviewProps) {
  return (
    <div className="p-6 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b]">
      <h2 className="text-lg font-semibold text-slate-100 font-mono mb-4">Разпределение по статус</h2>
      <div className="grid grid-cols-4 gap-4">
        {(['gray', 'orange', 'yellow', 'green'] as const).map((status) => {
          const count = statusCounts[status];
          const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
          const pct = totalTopics > 0 ? Math.round((count / totalTopics) * 100) : 0;
          return (
            <div key={status} className="text-center">
              <div className="text-4xl mb-2">{config.emoji}</div>
              <div className="text-2xl font-bold font-mono" style={{ color: config.text }}>{count}</div>
              <div className="text-xs text-slate-500 font-mono">{config.label} ({pct}%)</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AnkiWidgetProps {
  stats: CollectionStats;
  onRefresh: () => void;
  loading: boolean;
}

function AnkiWidget({ stats, onRefresh, loading }: AnkiWidgetProps) {
  return (
    <div className="p-5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-blue-500/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Layers size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100 font-mono">Anki</h3>
            <p className="text-xs text-slate-500 font-mono">Due карти днес</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          title="Обнови"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold font-mono text-blue-400">{stats.dueToday}</div>
          <div className="text-xs text-slate-500 font-mono">Due</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold font-mono text-cyan-400">{stats.newToday}</div>
          <div className="text-xs text-slate-500 font-mono">New</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold font-mono text-slate-400">{stats.totalCards.toLocaleString()}</div>
          <div className="text-xs text-slate-500 font-mono">Total</div>
        </div>
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

function AlertsSection({ alerts }: AlertsSectionProps) {
  return (
    <div className="p-6 rounded-xl bg-red-900/20 border border-red-800/30">
      <h2 className="text-lg font-semibold text-red-400 font-mono mb-4 flex items-center gap-2"><AlertTriangle size={20} />Внимание</h2>
      <ul className="space-y-2">
        {alerts.map((a, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className={"w-2 h-2 rounded-full " + (a.type === "critical" ? "bg-red-500" : a.type === "warning" ? "bg-orange-500" : "bg-blue-500")} />
            <span className="text-slate-300 font-mono text-sm">{a.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface QuickStatWidgetProps {
  icon: ReactNode;
  label: string;
  value: string;
  subValue: string;
  color: 'orange' | 'purple' | 'yellow' | 'blue' | 'green';
  href: string;
}

function QuickStatWidget({ icon, label, value, subValue, color, href }: QuickStatWidgetProps) {
  const colors = {
    orange: 'border-orange-500/30 hover:border-orange-500/50 bg-orange-500/10',
    purple: 'border-purple-500/30 hover:border-purple-500/50 bg-purple-500/10',
    yellow: 'border-yellow-500/30 hover:border-yellow-500/50 bg-yellow-500/10',
    blue: 'border-blue-500/30 hover:border-blue-500/50 bg-blue-500/10',
    green: 'border-green-500/30 hover:border-green-500/50 bg-green-500/10',
  };

  return (
    <Link
      href={href}
      className={`p-4 rounded-xl border ${colors[color]} transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400 font-mono">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-100 font-mono">{value}</div>
      <div className="text-xs text-slate-500 font-mono">{subValue}</div>
    </Link>
  );
}