'use client';

import { useMemo } from 'react';
import { Calendar, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { AcademicEvent, Subject } from '@/lib/types';
import { ACADEMIC_EVENT_CONFIG } from '@/lib/constants';

interface AcademicEventsWidgetProps {
  events: AcademicEvent[];
  subjects: Subject[];
  maxEvents?: number;
}

export default function AcademicEventsWidget({ events, subjects, maxEvents = 4 }: AcademicEventsWidgetProps) {
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return events
      .map(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const subject = subjects.find(s => s.id === event.subjectId);
        const config = ACADEMIC_EVENT_CONFIG[event.type];

        let urgency: 'high' | 'medium' | 'low' = 'low';
        if (daysUntil <= config.urgencyDays.high) urgency = 'high';
        else if (daysUntil <= config.urgencyDays.medium) urgency = 'medium';

        return { event, daysUntil, subject, config, urgency };
      })
      .filter(e => e.daysUntil >= 0 && e.subject && !e.subject.archived && !e.subject.deletedAt)
      .sort((a, b) => {
        // Sort by urgency first, then by days until
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return a.daysUntil - b.daysUntil;
      })
      .slice(0, maxEvents);
  }, [events, subjects, maxEvents]);

  if (upcomingEvents.length === 0) {
    return null;
  }

  const formatDaysUntil = (days: number) => {
    if (days === 0) return 'ДНЕС!';
    if (days === 1) return 'УТРЕ!';
    return `след ${days}д`;
  };

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
          <Calendar size={16} className="text-purple-400" />
          Предстоящи събития
        </h3>
        <Link
          href="/schedule"
          className="text-xs text-purple-400 hover:text-purple-300 font-mono transition-colors"
        >
          Виж всички
        </Link>
      </div>

      <div className="space-y-2">
        {upcomingEvents.map(({ event, daysUntil, subject, config, urgency }) => (
          <div
            key={event.id}
            className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              urgency === 'high'
                ? 'bg-red-500/10 border border-red-500/30'
                : urgency === 'medium'
                ? 'bg-yellow-500/10 border border-yellow-500/30'
                : 'bg-slate-800/50 border border-transparent'
            }`}
          >
            <span className="text-xl flex-shrink-0">{config.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200 truncate">
                  {event.name || config.label}
                </span>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: subject?.color }}
                />
              </div>
              <span className="text-xs text-slate-500 font-mono truncate block">
                {subject?.name}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {urgency === 'high' && (
                <AlertTriangle size={14} className="text-red-400" />
              )}
              <span className={`text-xs font-mono font-semibold ${
                urgency === 'high'
                  ? 'text-red-400'
                  : urgency === 'medium'
                  ? 'text-yellow-400'
                  : 'text-slate-400'
              }`}>
                {formatDaysUntil(daysUntil)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
