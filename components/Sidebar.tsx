'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, Calendar, Target, TrendingUp, AlertTriangle,
  Clock, GraduationCap, Settings, FileQuestion, PanelLeftClose, PanelLeft,
  Stethoscope, Rocket, ChevronDown, ChevronRight, BarChart3
} from 'lucide-react';
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
  Settings,
  FileQuestion,
  Stethoscope,
  Rocket,
  BarChart3
};

// Grouped navigation structure
const NAV_GROUPS = [
  {
    id: 'dashboard',
    label: 'Табло',
    icon: 'LayoutDashboard',
    href: '/', // Direct link, no children
  },
  {
    id: 'planning',
    label: 'Планиране',
    icon: 'Calendar',
    children: [
      { href: '/today', label: 'Днешен план', icon: 'Target' },
      { href: '/schedule', label: 'График', icon: 'Calendar' },
    ]
  },
  {
    id: 'learning',
    label: 'Учене',
    icon: 'BookOpen',
    children: [
      { href: '/subjects', label: 'Предмети', icon: 'BookOpen' },
      { href: '/projects', label: 'Проекти', icon: 'Rocket' },
      { href: '/question-bank', label: 'Сборници', icon: 'FileQuestion' },
      { href: '/cases', label: 'Клинични случаи', icon: 'Stethoscope' },
      { href: '/analytics', label: 'Статистики', icon: 'BarChart3' },
    ]
  },
  {
    id: 'analytics',
    label: 'Анализи',
    icon: 'BarChart3',
    children: [
      { href: '/prediction', label: 'Прогноза', icon: 'TrendingUp' },
      { href: '/gpa', label: 'GPA', icon: 'GraduationCap' },
    ]
  },
  {
    id: 'tools',
    label: 'Инструменти',
    icon: 'Settings',
    children: [
      { href: '/timer', label: 'Таймер', icon: 'Clock' },
      { href: '/settings', label: 'Настройки', icon: 'Settings' },
    ]
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data, isLoading, sidebarCollapsed, setSidebarCollapsed } = useApp();

  // Track which groups are expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Initialize from localStorage or default to all expanded
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vayne-sidebar-expanded');
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    }
    return new Set(['learning', 'planning']); // Default expanded
  });

  // Auto-expand group containing current page
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if (group.children) {
        const isInGroup = group.children.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));
        if (isInGroup && !expandedGroups.has(group.id)) {
          setExpandedGroups(prev => new Set([...prev, group.id]));
        }
      }
    }
  }, [pathname]);

  // Save expanded state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vayne-sidebar-expanded', JSON.stringify([...expandedGroups]));
    }
  }, [expandedGroups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <aside className={`fixed left-0 top-0 h-screen ${sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'} bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col transition-all duration-200`}>
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

  // Filter out archived and soft-deleted subjects
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  // Wrap in try-catch to prevent sidebar crash if algorithm fails
  let alerts: ReturnType<typeof getAlerts> = [];
  try {
    alerts = getAlerts(activeSubjects, data.schedule, data.studyGoals).slice(0, 2);
  } catch (e) {
    console.error('Failed to get alerts:', e);
  }

  // Sort subjects by exam date (nearest first)
  const sortedSubjects = [...activeSubjects].sort((a, b) => {
    const daysA = getDaysUntil(a.examDate);
    const daysB = getDaysUntil(b.examDate);
    if (daysA === Infinity && daysB === Infinity) return 0;
    if (daysA === Infinity) return 1;
    if (daysB === Infinity) return -1;
    return daysA - daysB;
  });

  // Check if a nav item is active
  const isItemActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

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

        {/* Navigation Icons - show group icons */}
        <nav className="p-2 border-b border-[#1e293b]">
          <ul className="space-y-1">
            {NAV_GROUPS.map(group => {
              const Icon = icons[group.icon as keyof typeof icons];
              const isActive = group.href
                ? isItemActive(group.href)
                : group.children?.some(item => isItemActive(item.href));
              return (
                <li key={group.id}>
                  <Link
                    href={group.href || group.children?.[0]?.href || '/'}
                    className={`flex items-center justify-center p-2.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                    title={group.label}
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
          {sortedSubjects.slice(0, 6).map(subject => (
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
    <aside className="fixed left-0 top-0 h-screen w-[260px] bg-[rgba(20,20,35,0.95)] border-r border-[#1e293b] flex flex-col z-40 transition-all duration-200">
      {/* Logo */}
      <div className="p-5 border-b border-[#1e293b]">
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
      </div>

      {/* Grouped Navigation */}
      <nav className="p-3 border-b border-[#1e293b] flex-shrink-0">
        <ul className="space-y-0.5">
          {NAV_GROUPS.map(group => {
            const GroupIcon = icons[group.icon as keyof typeof icons];
            const isExpanded = expandedGroups.has(group.id);
            const hasChildren = group.children && group.children.length > 0;
            const isGroupActive = group.href
              ? isItemActive(group.href)
              : group.children?.some(item => isItemActive(item.href));

            // Direct link (no children)
            if (group.href) {
              return (
                <li key={group.id}>
                  <Link
                    href={group.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all font-mono text-sm ${
                      isGroupActive
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <GroupIcon size={18} />
                    {group.label}
                  </Link>
                </li>
              );
            }

            // Expandable group
            return (
              <li key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all font-mono text-sm ${
                    isGroupActive
                      ? 'text-blue-400'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <GroupIcon size={18} />
                  <span className="flex-1 text-left">{group.label}</span>
                  {hasChildren && (
                    isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                  )}
                </button>

                {/* Children */}
                {hasChildren && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-700/50 pl-3">
                    {group.children.map(item => {
                      const ItemIcon = icons[item.icon as keyof typeof icons];
                      const isActive = isItemActive(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all font-mono text-xs ${
                              isActive
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                            }`}
                          >
                            <ItemIcon size={14} />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Subject List */}
      <div className="flex-1 overflow-y-auto p-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono px-1">
          Предмети ({sortedSubjects.length})
        </h3>
        {sortedSubjects.length === 0 ? (
          <p className="text-xs text-slate-600 font-mono px-1">Няма добавени</p>
        ) : (
          <ul className="space-y-1.5">
            {sortedSubjects.map(subject => {
              const progress = getSubjectProgress(subject);
              const daysUntil = getDaysUntil(subject.examDate);
              return (
                <li key={subject.id}>
                  <Link
                    href={`/subjects?id=${subject.id}`}
                    className="block p-2 rounded-lg bg-slate-800/20 hover:bg-slate-800/40 transition-all border border-transparent hover:border-slate-700/50"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: subject.color }}
                      />
                      <span className="text-xs text-slate-200 font-medium truncate flex-1">
                        {subject.name}
                      </span>
                      {daysUntil !== Infinity && (
                        <span className={`text-[10px] font-mono flex-shrink-0 ${daysUntil <= 7 ? 'text-red-400' : 'text-slate-500'}`}>
                          {daysUntil <= 0 ? 'ДНЕС' : `${daysUntil}д`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress.percentage}%`,
                            backgroundColor: subject.color
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono w-7 text-right">
                        {progress.percentage}%
                      </span>
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
        <div className="p-3 border-t border-[#1e293b]">
          <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-2">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={12} className="text-red-400" />
              <span className="text-[10px] font-semibold text-red-400 uppercase font-mono">
                Внимание
              </span>
            </div>
            <ul className="space-y-0.5">
              {alerts.map((alert, i) => (
                <li key={i} className="text-[10px] text-red-300 font-mono leading-tight">
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
