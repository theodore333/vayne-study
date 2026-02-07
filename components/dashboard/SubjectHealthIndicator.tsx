'use client';

import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { SubjectHealthStatus } from '@/lib/algorithms';

interface SubjectHealthIndicatorProps {
  healthStatuses: SubjectHealthStatus[];
  maxItems?: number;
  compact?: boolean;
}

export default function SubjectHealthIndicator({ healthStatuses, maxItems = 3, compact }: SubjectHealthIndicatorProps) {
  const displayStatuses = healthStatuses.slice(0, maxItems);

  if (displayStatuses.length === 0) {
    if (compact) return null;
    return (
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle size={16} className="text-green-400" />
          <h3 className="text-sm font-semibold text-slate-300 font-mono">Здраве на предметите</h3>
        </div>
        <p className="text-sm text-slate-500 font-mono">
          Всички предмети са в добро състояние!
        </p>
      </div>
    );
  }

  const content = (
    <div className="space-y-2">
      {displayStatuses.map((status) => (
        <Link
          key={status.subjectId}
          href={`/subjects?id=${status.subjectId}`}
          className={`block p-2.5 rounded-lg transition-all ${
            status.health === 'critical'
              ? 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/20'
              : 'bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {status.health === 'critical' ? (
              <AlertTriangle size={14} className="text-red-400" />
            ) : (
              <AlertCircle size={14} className="text-yellow-400" />
            )}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: status.subjectColor }}
            />
            <span className="text-sm font-medium text-slate-200 truncate">
              {status.subjectName}
            </span>
          </div>
          <div className="space-y-0.5">
            {status.issues.map((issue, idx) => (
              <p key={idx} className={`text-xs font-mono ${
                status.health === 'critical' ? 'text-red-300/80' : 'text-yellow-300/80'
              }`}>
                {issue}
              </p>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] font-mono text-slate-500">
            <span>Покритие: {status.coverage}%</span>
            {status.decayingTopicsCount > 0 && (
              <span>{status.decayingTopicsCount} за преговор</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );

  if (compact) {
    return (
      <>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-400 font-mono flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-orange-400" />
            Предмети в риск
          </h4>
          <span className="text-[10px] text-slate-600 font-mono">{healthStatuses.length}</span>
        </div>
        {content}
      </>
    );
  }

  return (
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-400" />
          Нужда от внимание
        </h3>
        <span className="text-xs text-slate-500 font-mono">
          {healthStatuses.length} предмет{healthStatuses.length === 1 ? '' : 'а'}
        </span>
      </div>
      {content}
    </div>
  );
}
