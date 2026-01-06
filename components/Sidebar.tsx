'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Calendar, Target, TrendingUp, AlertTriangle, Clock, GraduationCap, Brain } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getDaysUntil, getSubjectProgress, getAlerts } from '@/lib/algorithms';
import { STATUS_CONFIG } from '@/lib/constants';

const icons = {
  LayoutDashboard,
  BookOpen,
  Calendar,
  Target,
  TrendingUp,
  Clock,
  GraduationCap,
  Brain
};

const NAV_ITEMS = [
  { href: '/', label: 'Табло', icon: 'LayoutDashboard' },
  { href: '/subjects', label: 'Предмети', icon: 'BookOpen' },
  { href: '/schedule', label: 'Седмичен график', icon: 'Calendar' },
  { href: '/today', label: 'Днешен план', icon: 'Target' },
  { href: '/timer', label: 'Таймер', icon: 'Clock' },
  { href: '/quiz', label: 'AI Тест', icon: 'Brain' },
  { href: '/gpa', label: 'GPA Калкулатор', icon: 'GraduationCap' },
  { href: '/prediction', label: 'Прогноза', icon: 'TrendingUp' }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data, isLoading } = useApp();

  if (isLoading) {
    return (
      <aside className="fixed left-0 top-0 h-screen w-[280px] bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col">
        <div className="p-6 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              VAYNE
            </span>
          </div>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="animate-pulse text-slate-500">Зареждане...</div>
        </div>
      </aside>
    );
  }

  const alerts = getAlerts(data.subjects, data.schedule).slice(0, 2);

  return (
    <aside className="fixed left-0 top-0 h-screen w-[280px] bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-[#1e293b]">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="text-2xl group-hover:animate-pulse">⚡</span>
          <span className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            VAYNE
          </span>
        </Link>
        <p className="text-xs text-slate-500 mt-1 font-mono">Study Command Center</p>
      </div>

      {/* Navigation */}
      <nav className="p-4 border-b border-[#1e293b]">
        <ul className="space-y-1">
          {NAV_ITEMS.map(item => {
            const Icon = icons[item.icon as keyof typeof icons];
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all font-mono text-sm ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Subject List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-mono">
          Предмети
        </h3>
        {data.subjects.length === 0 ? (
          <p className="text-sm text-slate-600 font-mono">Няма добавени предмети</p>
        ) : (
          <ul className="space-y-3">
            {data.subjects.map(subject => {
              const progress = getSubjectProgress(subject);
              const daysUntil = getDaysUntil(subject.examDate);
              return (
                <li key={subject.id}>
                  <Link
                    href={`/subjects?id=${subject.id}`}
                    className="block p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <span className="text-sm text-slate-200 font-medium truncate flex-1">
                        {subject.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress.percentage}%`,
                            backgroundColor: subject.color
                          }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 font-mono">
                        {progress.percentage}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <div className="flex gap-1">
                        {Object.entries(progress.counts).map(([status, count]) => (
                          count > 0 && (
                            <span key={status} className="font-mono" style={{ color: STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].text }}>
                              {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].emoji}{count}
                            </span>
                          )
                        ))}
                      </div>
                      {daysUntil !== Infinity && (
                        <span className={`font-mono ${daysUntil <= 7 ? 'text-red-400' : 'text-slate-500'}`}>
                          {daysUntil <= 0 ? 'ДНЕС' : `${daysUntil}д`}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="p-4 border-t border-[#1e293b]">
          <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-xs font-semibold text-red-400 uppercase font-mono">
                Внимание
              </span>
            </div>
            <ul className="space-y-1">
              {alerts.map((alert, i) => (
                <li key={i} className="text-xs text-red-300 font-mono">
                  {alert.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
}
