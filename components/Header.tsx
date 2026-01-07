'use client';

import { useState } from 'react';
import { Thermometer, Palmtree, Zap, DollarSign, Cloud, CloudOff, RefreshCw, Star } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getLevelInfo, getXpForNextLevel } from '@/lib/gamification';
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

  const progress = data.userProgress;
  const levelInfo = getLevelInfo(progress?.level || 1);
  const xpProgress = getXpForNextLevel(progress?.xp || 0);

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
          {/* Level & XP */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/20">
            <span className="text-xl">{levelInfo.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white font-mono">{levelInfo.name}</span>
                <span className="text-xs text-purple-300 font-mono">Lv.{progress?.level || 1}</span>
              </div>
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-cyan-500"
                  style={{ width: `${xpProgress.progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Daily Status Button */}
          <button
            onClick={() => setShowCheckin(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border hover:border-slate-600 transition-all ${
              data.dailyStatus.sick || data.dailyStatus.holiday
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-slate-800/50 border-slate-700'
            }`}
          >
            {data.dailyStatus.sick ? (
              <>
                <Thermometer size={16} className="text-red-400" />
                <span className="text-sm font-mono text-red-400">Болен</span>
              </>
            ) : data.dailyStatus.holiday ? (
              <>
                <Palmtree size={16} className="text-green-400" />
                <span className="text-sm font-mono text-green-400">Почивка</span>
              </>
            ) : (
              <>
                <Zap size={16} className="text-cyan-400" />
                <span className="text-sm font-mono text-slate-400">Нормален</span>
              </>
            )}
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
            <span className="text-xs text-slate-500 font-mono uppercase">Статус:</span>
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
