'use client';

import { useState, useEffect } from 'react';
import { Eye, X } from 'lucide-react';
import SubjectHealthIndicator from './SubjectHealthIndicator';
import WeaknessWidget from './WeaknessWidget';
import AcademicEventsWidget from './AcademicEventsWidget';
import { SubjectHealthStatus } from '@/lib/algorithms';
import { AcademicEvent, Subject } from '@/lib/types';

interface Alert {
  type: 'critical' | 'warning' | 'info';
  message: string;
}

interface AttentionPanelProps {
  healthStatuses: SubjectHealthStatus[];
  subjects: Subject[];
  events: AcademicEvent[];
  alerts?: Alert[];
}

const DISMISSED_KEY = 'vayne-dismissed-alerts';

function getDismissedAlerts(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
  } catch { return {}; }
}

function setDismissedAlerts(dismissed: Record<string, string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
}

export default function AttentionPanel({ healthStatuses, subjects, events, alerts = [] }: AttentionPanelProps) {
  const [dismissed, setDismissed] = useState<Record<string, string>>({});

  useEffect(() => {
    const stored = getDismissedAlerts();
    // Clean up dismissals older than 24h
    const now = Date.now();
    const cleaned: Record<string, string> = {};
    for (const [key, ts] of Object.entries(stored)) {
      if (now - new Date(ts).getTime() < 24 * 60 * 60 * 1000) {
        cleaned[key] = ts;
      }
    }
    if (Object.keys(cleaned).length !== Object.keys(stored).length) {
      setDismissedAlerts(cleaned);
    }
    setDismissed(cleaned);
  }, []);

  const dismissAlert = (alertKey: string) => {
    const updated = { ...dismissed, [alertKey]: new Date().toISOString() };
    setDismissed(updated);
    setDismissedAlerts(updated);
  };

  // Filter out dismissed alerts; critical alerts CANNOT be dismissed
  const visibleAlerts = alerts.filter(a => {
    if (a.type === 'critical') return true;
    return !dismissed[a.message];
  });

  const hasHealth = healthStatuses.length > 0;
  const hasWeaknesses = subjects.some(s => s.topics.some(t => t.wrongAnswers?.length));
  const hasEvents = events.length > 0;
  const hasAlerts = visibleAlerts.length > 0;
  const hasAnything = hasHealth || hasWeaknesses || hasEvents || hasAlerts;

  if (!hasAnything) return null;

  const sections: React.ReactNode[] = [];

  if (hasAlerts) {
    sections.push(
      <div key="alerts" className="space-y-1.5">
        {visibleAlerts.map((a, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 group">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              a.type === 'critical' ? 'bg-red-500' : a.type === 'warning' ? 'bg-orange-500' : 'bg-blue-500'
            }`} />
            <span className="flex-1 text-xs text-slate-300 font-mono">{a.message}</span>
            {a.type !== 'critical' && (
              <button
                onClick={() => dismissAlert(a.message)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded transition-all"
                title="Скрий за 24ч"
              >
                <X size={12} className="text-slate-500 hover:text-slate-300" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (hasHealth) {
    sections.push(
      <SubjectHealthIndicator key="health" healthStatuses={healthStatuses} maxItems={2} compact />
    );
  }

  if (hasWeaknesses) {
    sections.push(
      <WeaknessWidget key="weakness" subjects={subjects} maxItems={3} compact />
    );
  }

  if (hasEvents) {
    sections.push(
      <AcademicEventsWidget key="events" events={events} subjects={subjects} maxEvents={3} compact />
    );
  }

  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
      <div className="flex items-center gap-2 mb-4">
        <Eye size={18} className={hasAlerts ? 'text-red-400' : 'text-orange-400'} />
        <span className="text-sm font-semibold text-slate-300 font-mono">Внимание</span>
        {hasAlerts && (
          <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-mono">
            {visibleAlerts.length}
          </span>
        )}
      </div>
      <div className="space-y-4">
        {sections.map((section, i) => (
          <div key={i}>
            {i > 0 && <div className="border-t border-slate-700/50 mb-4" />}
            {section}
          </div>
        ))}
      </div>
    </div>
  );
}
