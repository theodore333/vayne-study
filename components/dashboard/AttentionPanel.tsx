'use client';

import { CheckCircle, Eye } from 'lucide-react';
import SubjectHealthIndicator from './SubjectHealthIndicator';
import WeaknessWidget from './WeaknessWidget';
import AcademicEventsWidget from './AcademicEventsWidget';
import { SubjectHealthStatus } from '@/lib/algorithms';
import { AcademicEvent, Subject } from '@/lib/types';

interface AttentionPanelProps {
  healthStatuses: SubjectHealthStatus[];
  subjects: Subject[];
  events: AcademicEvent[];
}

export default function AttentionPanel({ healthStatuses, subjects, events }: AttentionPanelProps) {
  const hasHealth = healthStatuses.length > 0;
  const hasWeaknesses = subjects.some(s => s.topics.some(t => t.wrongAnswers?.length));
  const hasEvents = events.length > 0;
  const hasAnything = hasHealth || hasWeaknesses || hasEvents;

  if (!hasAnything) {
    return (
      <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
        <div className="flex items-center gap-2 mb-3">
          <Eye size={18} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-300 font-mono">Внимание</span>
        </div>
        <div className="py-6 text-center">
          <CheckCircle size={32} className="text-green-500/50 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-mono">Всичко е наред!</p>
        </div>
      </div>
    );
  }

  const sections: React.ReactNode[] = [];

  if (hasHealth) {
    sections.push(
      <SubjectHealthIndicator
        key="health"
        healthStatuses={healthStatuses}
        maxItems={2}
        compact
      />
    );
  }

  if (hasWeaknesses) {
    sections.push(
      <WeaknessWidget
        key="weakness"
        subjects={subjects}
        maxItems={3}
        compact
      />
    );
  }

  if (hasEvents) {
    sections.push(
      <AcademicEventsWidget
        key="events"
        events={events}
        subjects={subjects}
        maxEvents={3}
        compact
      />
    );
  }

  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
      <div className="flex items-center gap-2 mb-4">
        <Eye size={18} className="text-orange-400" />
        <span className="text-sm font-semibold text-slate-300 font-mono">Внимание</span>
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
