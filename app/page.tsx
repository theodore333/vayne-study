'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, BookOpen, Calendar, Flame, GraduationCap, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil, getNextExamReadiness, getOverallOnTrackStatus, calculateDailyTopics } from '@/lib/algorithms';
import { getActivityStreak } from '@/lib/analytics';
import { Subject } from '@/lib/types';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import Link from 'next/link';
import GoalProgressRings from '@/components/dashboard/GoalProgressRings';

// Dashboard Widgets
const WeeklyBarChart = dynamic(() => import('@/components/dashboard/WeeklyBarChart'), {
  ssr: false,
  loading: () => <div className="h-40 bg-slate-800/30 rounded-lg animate-pulse" />
});

export default function Dashboard() {
  const { data, isLoading } = useApp();
  const [showAddSubject, setShowAddSubject] = useState(false);

  const [ankiStats, setAnkiStats] = useState<{ dueToday: number; newToday: number; totalCards: number } | null>(null);
  const activeSubjects = useMemo(() => data.subjects.filter(s => !s.archived && !s.deletedAt), [data.subjects]);
  const currentStreak = useMemo(() => getActivityStreak(data.timerSessions, data.subjects, data.questionBanks), [data.timerSessions, data.subjects, data.questionBanks]);
  const dailyTopicGoal = useMemo(() => {
    try {
      const result = calculateDailyTopics(activeSubjects, data.dailyStatus, data.studyGoals);
      return result.total || 5;
    } catch { return 5; }
  }, [activeSubjects, data.dailyStatus, data.studyGoals]);
  const nextExamReadiness = useMemo(() => {
    try { return getNextExamReadiness(activeSubjects, data.questionBanks || []); }
    catch (e) { console.error('getNextExamReadiness error:', e); return null; }
  }, [activeSubjects, data.questionBanks]);
  const overallStatus = useMemo(() => {
    try { return getOverallOnTrackStatus(activeSubjects, data.questionBanks || []); }
    catch (e) { console.error('getOverallOnTrackStatus error:', e); return null; }
  }, [activeSubjects, data.questionBanks]);

  // Fetch Anki stats for WeeklyBarChart footer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('anki-enabled') !== 'true') return;
    (async () => {
      try {
        const { getCollectionStats, getSelectedDecks } = await import('@/lib/anki');
        const selectedDecks = getSelectedDecks();
        const stats = await getCollectionStats(selectedDecks.length > 0 ? selectedDecks : undefined);
        setAnkiStats({ dueToday: stats.dueToday, newToday: stats.newToday, totalCards: stats.totalCards });
      } catch { /* AnkiConnect not available */ }
    })();
  }, []);

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
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-100 font-mono">{greeting}!</h1>
              {currentStreak > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 text-xs font-mono font-medium">
                  <Flame size={13} fill={currentStreak >= 3 ? 'currentColor' : 'none'} />
                  {currentStreak}д
                </span>
              )}
              {overallStatus && (
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium ${
                  overallStatus.status === 'ready' ? 'bg-green-500/15 text-green-400' :
                  overallStatus.status === 'on_track' ? 'bg-blue-500/15 text-blue-400' :
                  overallStatus.status === 'at_risk' ? 'bg-orange-500/15 text-orange-400' :
                  'bg-red-500/15 text-red-400'
                }`}>
                  {overallStatus.status === 'ready' ? <CheckCircle2 size={13} /> :
                   overallStatus.status === 'on_track' ? <TrendingUp size={13} /> :
                   <AlertTriangle size={13} />}
                  {overallStatus.label}
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
              subjects={activeSubjects}
              questionBanks={data.questionBanks || []}
              dailyTopicGoal={dailyTopicGoal}
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

      {/* ROW 0.5: Today's Schedule Strip */}
      {(() => {
        const todayDayIndex = (new Date().getDay() + 6) % 7;
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const semStart = data.academicPeriod?.semesterStart ? new Date(data.academicPeriod.semesterStart) : null;
        const semesterStarted = !semStart || semStart <= todayDate;
        const todayClasses = data.schedule
          .filter(c => {
            if (c.day !== todayDayIndex) return false;
            if (!semesterStarted && !c.startDate) return false;
            if (c.startDate && new Date(c.startDate) > todayDate) return false;
            return true;
          })
          .sort((a, b) => a.time.localeCompare(b.time));
        if (todayClasses.length === 0) return null;
        return (
          <Link
            href="/schedule"
            className="flex items-center gap-3 px-4 py-2.5 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl hover:border-[#2e3b4e] transition-all"
          >
            <Calendar size={15} className="text-orange-400 shrink-0" />
            <div className="flex items-center gap-3 overflow-x-auto text-xs font-mono">
              {todayClasses.map((cls, i) => {
                const subject = data.subjects.find(s => s.id === cls.subjectId);
                if (!subject) return null;
                return (
                  <span key={cls.id} className="flex items-center gap-1.5 shrink-0">
                    {i > 0 && <span className="text-slate-700">|</span>}
                    <span className="font-semibold" style={{ color: subject.color }}>{cls.time}</span>
                    <span className="text-slate-300">{subject.name}</span>
                    {cls.room && <span className="text-slate-600">({cls.room})</span>}
                  </span>
                );
              })}
            </div>
          </Link>
        );
      })()}

      {/* ROW 1: Compact Subjects */}
      <SubjectsSection subjects={activeSubjects} onAddClick={() => setShowAddSubject(true)} />

      {/* ROW 2: Weekly Chart (full width) */}
      <WeeklyBarChart
        subjects={activeSubjects}
        dailyGoal={dailyTopicGoal}
        ankiStats={ankiStats}
      />

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
