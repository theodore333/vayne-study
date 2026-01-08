'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Calendar, Target, TrendingUp, AlertTriangle, Clock, GraduationCap, Brain, Settings, FileQuestion, PanelLeftClose, PanelLeft } from 'lucide-react';
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
  Brain,
  Settings,
  FileQuestion
};

const NAV_ITEMS = [
  { href: '/', label: 'Табло', icon: 'LayoutDashboard' },
  { href: '/today', label: 'Днешен план', icon: 'Target' },
  { href: '/schedule', label: 'Седмичен график', icon: 'Calendar' },
  { href: '/subjects', label: 'Предмети', icon: 'BookOpen' },
  { href: '/question-bank', label: 'Question Bank', icon: 'FileQuestion' },
  { href: '/timer', label: 'Таймер', icon: 'Clock' },
  { href: '/prediction', label: 'Прогноза', icon: 'TrendingUp' },
  { href: '/gpa', label: 'GPA Калкулатор', icon: 'GraduationCap' },
  { href: '/settings', label: 'Настройки', icon: 'Settings' }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data, isLoading, sidebarCollapsed, setSidebarCollapsed } = useApp();

  if (isLoading) {
    return (
      <aside className={`fixed left-0 top-0 h-screen ${sidebarCollapsed ? 'w-[60px]' : 'w-[280px]'} bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col transition-all duration-200`}>
        <div className="p-6 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            {!sidebarCollapsed && (
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                VAYNE
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="animate-pulse text-slate-500">{sidebarCollapsed ? '...' : 'Зареждане...'}</div>
        </div>
      </aside>
    );
  }

  const alerts = getAlerts(data.subjects, data.schedule).slice(0, 2);

  // Sort subjects by exam date (nearest first) - matches default sorting in subjects page
  const sortedSubjects = [...data.subjects].sort((a, b) => {
    const daysA = getDaysUntil(a.examDate);
    const daysB = getDaysUntil(b.examDate);
    // Put subjects without exam dates at the end
    if (daysA === Infinity && daysB === Infinity) return 0;
    if (daysA === Infinity) return 1;
    if (daysB === Infinity) return -1;
    return daysA - daysB;
  });

  // Collapsed sidebar
  if (sidebarCollapsed) {
    return (
      <aside className="fixed left-0 top-0 h-screen w-[60px] bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col z-40 transition-all duration-200">
        {/* Logo */}
        <div className="p-3 border-b border-[#1e293b] flex flex-col items-center">
          <Link href="/" className="group">
            <span className="text-2xl group-hover:animate-pulse">⚡</span>
          </Link>
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="mt-2 p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
            title="Покажи меню"
          >
            <PanelLeft size={18} />
          </button>
        </div>

        {/* Navigation Icons */}
        <nav className="p-2 border-b border-[#1e293b]">
          <ul className="space-y-1">
            {NAV_ITEMS.map(item => {
              const Icon = icons[item.icon as keyof typeof icons];
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-center p-2.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                    title={item.label}
                  >
                    <Icon size={18} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Subject colors */}
        <div className="flex-1 overflow-y-auto p-2">
          {sortedSubjects.map(subject => (
            <Link
              key={subject.id}
              href={`/subjects?id=${subject.id}`}
              className="block p-2 mb-1 rounded-lg hover:bg-slate-800/50 transition-all"
              title={subject.name}
            >
              <div
                className="w-6 h-6 rounded-full mx-auto"
                style={{ backgroundColor: subject.color }}
              />
            </Link>
          ))}
        </div>

        {/* Alert indicator */}
        {alerts.length > 0 && (
          <div className="p-2 border-t border-[#1e293b]">
            <div className="flex justify-center">
              <AlertTriangle size={18} className="text-red-400" />
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-[280px] bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col z-40 transition-all duration-200">
      {/* Logo */}
      <div className="p-6 border-b border-[#1e293b]">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="text-2xl group-hover:animate-pulse">⚡</span>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              VAYNE
            </span>
          </Link>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
            title="Скрий меню"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
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
        {sortedSubjects.length === 0 ? (
          <p className="text-sm text-slate-600 font-mono">Няма добавени предмети</p>
        ) : (
          <ul className="space-y-3">
            {sortedSubjects.map(subject => {
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
