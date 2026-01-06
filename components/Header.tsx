'use client';

import { useState } from 'react';
import { Battery, Moon, Thermometer, DollarSign, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useApp } from '@/lib/context';
import { calculateEffectiveHours } from '@/lib/algorithms';
import { STATUS_CONFIG } from '@/lib/constants';
import DailyCheckinModal from './modals/DailyCheckinModal';

export default function Header() {
  const [showCheckin, setShowCheckin] = useState(false);
  const { data, isLoading, isSyncing, lastSynced, syncNow } = useApp();

  if (isLoading) {
    return (
      <header className="sticky top-0 z-30 bg-[rgba(10,10,15,0.9)] backdrop-blur-sm border-b border-[#1e293b] px-6 py-4">
        <div className="animate-pulse h-8 bg-slate-800 rounded w-48" />
      </header>
    );
  }

  const effectiveHours = calculateEffectiveHours(data.dailyStatus);

  // Calculate total status counts across all subjects
  const statusCounts = data.subjects.reduce(
    (acc, subject) => {
      subject.topics.forEach(topic => {
        acc[topic.status]++;
      });
      return acc;
    },
    { green: 0, yellow: 0, orange: 0, gray: 0 }
  );

  return (
    <>
      <header className="sticky top-0 z-30 bg-[rgba(10,10,15,0.9)] backdrop-blur-sm border-b border-[#1e293b] px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Daily Status Button */}
          <button
            onClick={() => setShowCheckin(true)}
            className="flex items-center gap-4 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all group"
          >
            <div className="flex items-center gap-2">
              <Moon size={16} className="text-blue-400" />
              <span className="text-sm font-mono text-slate-400">
                Сън: {data.dailyStatus.sleep}/5
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Battery size={16} className="text-yellow-400" />
              <span className="text-sm font-mono text-slate-400">
                Енергия: {data.dailyStatus.energy}/5
              </span>
            </div>
            {data.dailyStatus.sick && (
              <div className="flex items-center gap-2">
                <Thermometer size={16} className="text-red-400" />
                <span className="text-sm font-mono text-red-400">Болен</span>
              </div>
            )}
            <div className="flex items-center gap-2 pl-4 border-l border-slate-700">
              <span className="text-sm font-mono text-slate-400">
                Ефективни часове:
              </span>
              <span className={`text-lg font-bold font-mono ${
                effectiveHours >= 4 ? 'text-green-400' :
                effectiveHours >= 2 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {effectiveHours}ч
              </span>
            </div>
          </button>

          {/* API Usage */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/30 border border-slate-800">
            <DollarSign size={14} className="text-emerald-400" />
            <span className="text-xs font-mono text-slate-400">
              ${data.usageData.monthlyCost.toFixed(3)} / ${data.usageData.monthlyBudget}$
            </span>
          </div>

          {/* Cloud Sync */}
          <button
            onClick={syncNow}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/30 border border-slate-800 hover:border-slate-600 transition-all disabled:opacity-50"
            title={lastSynced ? `Последна синхронизация: ${lastSynced.toLocaleTimeString('bg-BG')}` : 'Не е синхронизирано'}
          >
            {isSyncing ? (
              <RefreshCw size={14} className="text-blue-400 animate-spin" />
            ) : lastSynced ? (
              <Cloud size={14} className="text-green-400" />
            ) : (
              <CloudOff size={14} className="text-slate-500" />
            )}
            <span className="text-xs font-mono text-slate-400">
              {isSyncing ? 'Синхр...' : lastSynced ? 'Sync' : 'Offline'}
            </span>
          </button>

          {/* Status Overview */}
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-slate-800/30 border border-slate-800">
            <span className="text-xs text-slate-500 font-mono uppercase">Общ статус:</span>
            <div className="flex items-center gap-3">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="flex items-center gap-1">
                  <span>{STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].emoji}</span>
                  <span
                    className="font-mono text-sm font-medium"
                    style={{ color: STATUS_CONFIG[status as keyof typeof STATUS_CONFIG].text }}
                  >
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {showCheckin && <DailyCheckinModal onClose={() => setShowCheckin(false)} />}
    </>
  );
}
