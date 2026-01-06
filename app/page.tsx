'use client';

import { useState } from 'react';
import { Plus, TrendingUp, AlertTriangle, BookOpen, Target, Calendar } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil, calculatePredictedGrade, getAlerts, calculateEffectiveHours } from '@/lib/algorithms';
import { STATUS_CONFIG } from '@/lib/constants';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import Link from 'next/link';

export default function Dashboard() {
  const { data, isLoading } = useApp();
  const [showAddSubject, setShowAddSubject] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const alerts = getAlerts(data.subjects, data.schedule);
  const effectiveHours = calculateEffectiveHours(data.dailyStatus);
  const totalTopics = data.subjects.reduce((sum, s) => sum + s.topics.length, 0);
  const statusCounts = data.subjects.reduce(
    (acc, subject) => {
      subject.topics.forEach(topic => { acc[topic.status]++; });
      return acc;
    },
    { green: 0, yellow: 0, orange: 0, gray: 0 }
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader onAddClick={() => setShowAddSubject(true)} />
      <StatsGrid subjects={data.subjects} totalTopics={totalTopics} effectiveHours={effectiveHours} alertsCount={alerts.length} />
      <StatusOverview statusCounts={statusCounts} totalTopics={totalTopics} />
      <SubjectsSection subjects={data.subjects} onAddClick={() => setShowAddSubject(true)} />
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

function StatsGrid({ subjects, totalTopics, effectiveHours, alertsCount }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard icon={<BookOpen size={20} className="text-blue-400" />} bgColor="bg-blue-500/20" label="Предмети" value={subjects.length} />
      <StatCard icon={<Target size={20} className="text-purple-400" />} bgColor="bg-purple-500/20" label="Теми" value={totalTopics} />
      <StatCard icon={<TrendingUp size={20} className="text-green-400" />} bgColor="bg-green-500/20" label="Ефективни часове" value={effectiveHours + "ч"} valueClass="text-green-400" />
      <StatCard icon={<AlertTriangle size={20} className="text-red-400" />} bgColor="bg-red-500/20" label="Известия" value={alertsCount} valueClass="text-red-400" />
    </div>
  );
}

function StatCard({ icon, bgColor, label, value, valueClass = "text-slate-100" }: any) {
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

function StatusOverview({ statusCounts, totalTopics }: any) {
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

function SubjectsSection({ subjects, onAddClick }: any) {
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
        {subjects.map((s: any) => <SubjectCard key={s.id} subject={s} />)}
      </div>
    </div>
  );
}

function SubjectCard({ subject }: any) {
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
        <div className="flex gap-2">{Object.entries(progress.counts).map(([st, cnt]: [string, any]) => cnt > 0 && <span key={st} className="text-sm font-mono" style={{ color: STATUS_CONFIG[st as keyof typeof STATUS_CONFIG].text }}>{STATUS_CONFIG[st as keyof typeof STATUS_CONFIG].emoji}{cnt}</span>)}</div>
        {subject.topics.length > 0 && <div className={"text-lg font-bold font-mono " + predClass}>{prediction.current.toFixed(2)}</div>}
      </div>
    </Link>
  );
}

function AlertsSection({ alerts }: any) {
  return (
    <div className="p-6 rounded-xl bg-red-900/20 border border-red-800/30">
      <h2 className="text-lg font-semibold text-red-400 font-mono mb-4 flex items-center gap-2"><AlertTriangle size={20} />Внимание</h2>
      <ul className="space-y-2">
        {alerts.map((a: any, i: number) => (
          <li key={i} className="flex items-center gap-3">
            <span className={"w-2 h-2 rounded-full " + (a.type === "critical" ? "bg-red-500" : a.type === "warning" ? "bg-orange-500" : "bg-blue-500")} />
            <span className="text-slate-300 font-mono text-sm">{a.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}