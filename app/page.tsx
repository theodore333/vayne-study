'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Plus, BookOpen, Calendar, Flame, Download, X, GraduationCap } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil, getAlerts, getTopicsNeedingFSRSReview, getSubjectHealth, getNextExamReadiness } from '@/lib/algorithms';
import { getCurrentStreak } from '@/lib/analytics';
import { Subject } from '@/lib/types';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import Link from 'next/link';
import { checkAnkiConnect, getCollectionStats, type CollectionStats, getSelectedDecks } from '@/lib/anki';
import GoalProgressRings from '@/components/dashboard/GoalProgressRings';

// Dashboard Widgets
const WeeklyBarChart = dynamic(() => import('@/components/dashboard/WeeklyBarChart'), {
  ssr: false,
  loading: () => <div className="h-40 bg-slate-800/30 rounded-lg animate-pulse" />
});
import ContinueStudyWidget from '@/components/dashboard/ContinueStudyWidget';
import FSRSReviewWidget from '@/components/dashboard/FSRSReviewWidget';
import ActionPanel from '@/components/dashboard/ActionPanel';
import AttentionPanel from '@/components/dashboard/AttentionPanel';

export default function Dashboard() {
  const { data, isLoading, addDailyGoal, toggleDailyGoal, deleteDailyGoal } = useApp();
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [ankiStats, setAnkiStats] = useState<CollectionStats | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);

  useEffect(() => {
    if (data.subjects.length === 0) return;
    const lastBackup = localStorage.getItem('vayne-last-backup');
    if (!lastBackup) { setShowBackupReminder(true); return; }
    const daysSince = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) setShowBackupReminder(true);
  }, [data.subjects.length]);

  useEffect(() => {
    const ankiEnabled = localStorage.getItem('anki-enabled');
    if (ankiEnabled === 'true') refreshAnkiStats();
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

  const activeSubjects = useMemo(() => data.subjects.filter(s => !s.archived && !s.deletedAt), [data.subjects]);
  const alerts = useMemo(() => getAlerts(activeSubjects, data.schedule, data.studyGoals), [activeSubjects, data.schedule, data.studyGoals]);
  const currentStreak = useMemo(() => getCurrentStreak(data.timerSessions), [data.timerSessions]);
  const fsrsReviews = useMemo(() => getTopicsNeedingFSRSReview(activeSubjects, data.studyGoals.fsrsMaxReviewsPerDay || 8, data.studyGoals), [activeSubjects, data.studyGoals]);
  const subjectHealthStatuses = useMemo(() => {
    try { return getSubjectHealth(activeSubjects); }
    catch (e) { console.error('getSubjectHealth error:', e); return []; }
  }, [activeSubjects]);
  const nextExamReadiness = useMemo(() => {
    try { return getNextExamReadiness(activeSubjects, data.questionBanks || []); }
    catch (e) { console.error('getNextExamReadiness error:', e); return null; }
  }, [activeSubjects, data.questionBanks]);

  const hasAttention = (subjectHealthStatuses?.length > 0) ||
    activeSubjects.some(s => s.topics.some(t => t.wrongAnswers?.length)) ||
    (data.academicEvents?.length > 0) ||
    alerts.length > 0;

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="h-20 bg-slate-800/30 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-800/30 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-40 bg-slate-800/30 rounded-xl animate-pulse" />
      </div>
    );
  }

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Добро утро' : hour < 18 ? 'Добър ден' : 'Добър вечер';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* ROW 0: Hero Strip */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-100 font-mono">{greeting}!</h1>
              {currentStreak > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 text-xs font-mono font-medium">
                  <Flame size={13} fill={currentStreak >= 3 ? 'currentColor' : 'none'} />
                  {currentStreak}д
                </span>
              )}
              {nextExamReadiness && (
                <Link
                  href={`/subjects?id=${nextExamReadiness.subjectId}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 text-xs font-mono font-medium transition-colors"
                >
                  <GraduationCap size={13} />
                  <span className="hidden sm:inline">{nextExamReadiness.subjectName}:</span>
                  <span className={nextExamReadiness.daysUntil <= 3 ? 'text-red-400 font-bold' : ''}>
                    {nextExamReadiness.daysUntil <= 0 ? 'ДНЕС!' : nextExamReadiness.daysUntil + 'д'}
                  </span>
                </Link>
              )}
            </div>
            <GoalProgressRings
              timerSessions={data.timerSessions}
              studyGoals={data.studyGoals}
              inline
            />
          </div>
          <button
            onClick={() => setShowAddSubject(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-mono text-sm self-start md:self-center"
          >
            <Plus size={18} /> Нов предмет
          </button>
        </div>
      </div>

      {/* Backup reminder */}
      {showBackupReminder && (
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Download size={16} className="text-amber-400 shrink-0" />
          <span className="flex-1 text-xs text-amber-300 font-mono">
            Не си свалял backup повече от 7 дни.
          </span>
          <button
            onClick={async () => {
              try {
                const { getMaterialsCache } = await import('@/lib/storage');
                const materials = getMaterialsCache();
                const backup = { version: 2, exportedAt: new Date().toISOString(), appData: data, materials };
                const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vayne-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                localStorage.setItem('vayne-last-backup', new Date().toISOString());
                setShowBackupReminder(false);
              } catch (e) { console.error('Backup failed:', e); }
            }}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-mono transition-colors"
          >
            Свали
          </button>
          <button onClick={() => setShowBackupReminder(false)} className="p-0.5 hover:bg-slate-700 rounded transition-colors">
            <X size={14} className="text-slate-500" />
          </button>
        </div>
      )}

      {/* ROW 1: Continue Study (conditional) */}
      <ContinueStudyWidget lastOpenedTopic={data.lastOpenedTopic} subjects={activeSubjects} />

      {/* ROW 2: Compact Subjects */}
      <SubjectsSection subjects={activeSubjects} onAddClick={() => setShowAddSubject(true)} />

      {/* ROW 3: Weekly Chart (full width) */}
      <WeeklyBarChart
        timerSessions={data.timerSessions}
        dailyGoal={data.studyGoals.dailyMinutes}
        ankiStats={ankiStats}
      />

      {/* ROW 4: Actions + FSRS Reviews (2 cols) */}
      <div className={`grid gap-4 ${fsrsReviews.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        <ActionPanel
          subjects={activeSubjects}
          goals={data.dailyGoals || []}
          onAddGoal={addDailyGoal}
          onToggleGoal={toggleDailyGoal}
          onDeleteGoal={deleteDailyGoal}
        />
        <FSRSReviewWidget reviews={fsrsReviews} />
      </div>

      {/* ROW 5: Attention (conditional) */}
      {hasAttention && (
        <AttentionPanel
          healthStatuses={subjectHealthStatuses || []}
          subjects={activeSubjects}
          events={data.academicEvents || []}
          alerts={alerts}
        />
      )}

      {showAddSubject && <AddSubjectModal onClose={() => setShowAddSubject(false)} />}
    </div>
  );
}

function SubjectsSection({ subjects, onAddClick }: { subjects: Subject[]; onAddClick: () => void }) {
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {subjects.map((s) => <CompactSubjectCard key={s.id} subject={s} />)}
    </div>
  );
}

function CompactSubjectCard({ subject }: { subject: Subject }) {
  const progress = getSubjectProgress(subject);
  const daysUntil = getDaysUntil(subject.examDate);
  const daysClass = daysUntil <= 3 ? 'text-red-400' : daysUntil <= 7 ? 'text-orange-400' : 'text-slate-500';

  return (
    <Link
      href={'/subjects?id=' + subject.id}
      className="flex items-center gap-3 p-3.5 rounded-xl bg-[rgba(20,20,35,0.8)] border border-[#1e293b] hover:border-[#2e3b4e] transition-all group"
    >
      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-sm font-semibold text-slate-200 group-hover:text-white truncate">{subject.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500 font-mono">{subject.topics.length} теми</span>
            {daysUntil !== Infinity && (
              <span className={'text-xs font-mono flex items-center gap-0.5 ' + daysClass}>
                <Calendar size={11} />
                {daysUntil <= 0 ? 'ДНЕС' : daysUntil + 'д'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: progress.percentage + '%', backgroundColor: subject.color }} />
          </div>
          <span className="text-xs text-slate-400 font-mono w-8 text-right">{progress.percentage}%</span>
        </div>
      </div>
    </Link>
  );
}
