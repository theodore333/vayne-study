'use client';

import { useMemo } from 'react';
import { GraduationCap, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { NextExamReadiness } from '@/lib/algorithms';

interface ExamReadinessWidgetProps {
  readiness: NextExamReadiness | null;
}

export default function ExamReadinessWidget({ readiness }: ExamReadinessWidgetProps) {
  // useMemo MUST be called before any early return (Rules of Hooks)
  const { statusConfig, progressColor } = useMemo(() => {
    const configs = {
      ready: { label: 'Готов', color: 'text-green-400', bg: 'bg-green-500', icon: '✅' },
      on_track: { label: 'На път', color: 'text-blue-400', bg: 'bg-blue-500', icon: '📈' },
      at_risk: { label: 'В риск', color: 'text-yellow-400', bg: 'bg-yellow-500', icon: '⚠️' },
      behind: { label: 'Зад графика', color: 'text-red-400', bg: 'bg-red-500', icon: '🚨' }
    };
    const status = readiness?.status || 'on_track';
    return {
      statusConfig: configs[status],
      progressColor: configs[status].bg
    };
  }, [readiness?.status]);

  if (!readiness) {
    return (
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <GraduationCap size={16} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-300 font-mono">Следващ изпит</h3>
        </div>
        <p className="text-sm text-slate-500 font-mono">
          Няма предстоящи изпити
        </p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
  };

  return (
    <Link href={`/subjects?id=${readiness.subjectId}`}>
      <div className={`bg-[rgba(20,20,35,0.8)] border rounded-xl p-5 transition-all hover:border-purple-500/50 ${
        readiness.status === 'behind' || readiness.status === 'at_risk'
          ? 'border-red-500/30'
          : 'border-[#1e293b]'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} className="text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-300 font-mono">Следващ изпит</h3>
          </div>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${
            readiness.status === 'ready' ? 'bg-green-500/20' :
            readiness.status === 'on_track' ? 'bg-blue-500/20' :
            readiness.status === 'at_risk' ? 'bg-yellow-500/20' : 'bg-red-500/20'
          }`}>
            <span className="text-xs">{statusConfig.icon}</span>
            <span className={`text-xs font-mono ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: readiness.subjectColor }}
          />
          <span className="text-lg font-semibold text-slate-200 truncate">
            {readiness.subjectName}
          </span>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-2 mb-4">
          <Clock size={14} className="text-slate-500" />
          <span className="text-sm text-slate-400 font-mono">
            {formatDate(readiness.examDate)}
          </span>
          <span className={`text-sm font-bold font-mono ${
            readiness.daysUntil <= 3 ? 'text-red-400' :
            readiness.daysUntil <= 7 ? 'text-yellow-400' : 'text-slate-300'
          }`}>
            ({readiness.daysUntil === 0 ? 'ДНЕС!' :
              readiness.daysUntil === 1 ? 'УТРЕ!' :
              `след ${readiness.daysUntil}д`})
          </span>
          {readiness.daysUntil <= 3 && (
            <AlertTriangle size={14} className="text-red-400" />
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 font-mono">Готовност</span>
            <span className={`text-lg font-bold font-mono ${statusConfig.color}`}>
              {readiness.readinessPercent}%
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.min(100, readiness.readinessPercent)}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-3 text-xs font-mono">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Покритие:</span>
            <span className="text-slate-400">{readiness.coverage}%</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp size={12} className="text-slate-500" />
            <span className="text-slate-500">Прогноза:</span>
            <span className={`font-semibold ${
              readiness.predictedGrade >= 5 ? 'text-green-400' :
              readiness.predictedGrade >= 4 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {readiness.predictedGrade.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
