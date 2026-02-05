'use client';

import { useState, useEffect } from 'react';
import { Thermometer, Palmtree, Zap, DollarSign, Cloud, CloudOff, RefreshCw, HardDrive, AlertTriangle, X } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getLevelInfo, getXpForNextLevel } from '@/lib/gamification';
import { STATUS_CONFIG } from '@/lib/constants';
import DailyCheckinModal from './modals/DailyCheckinModal';
import StorageCleanupModal from './modals/StorageCleanupModal';

export default function Header() {
  const [showCheckin, setShowCheckin] = useState(false);
  const [showStorageCleanup, setShowStorageCleanup] = useState(false);
  const [storageWarningDismissed, setStorageWarningDismissed] = useState(false);
  const { data, isLoading, isSyncing, lastSynced, syncNow, getStorageUsage: getUsage, storageError, clearStorageError } = useApp();

  // Get storage usage
  const storageUsage = getUsage();
  const isStorageCritical = storageUsage.percentage >= 90;
  const isStorageWarning = storageUsage.percentage >= 70;

  // Reset dismissed state on new session or when storage gets worse
  useEffect(() => {
    if (isStorageCritical) {
      setStorageWarningDismissed(false);
    }
  }, [isStorageCritical]);

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
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
  const statusCounts = activeSubjects.reduce(
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
      {/* Storage Warning Banner */}
      {(isStorageWarning || storageError) && !storageWarningDismissed && (
        <div className={`sticky top-0 z-40 px-4 py-2 flex items-center justify-between ${
          isStorageCritical || storageError
            ? 'bg-red-900/90 border-b border-red-500/50'
            : 'bg-yellow-900/90 border-b border-yellow-500/50'
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className={isStorageCritical || storageError ? 'text-red-400' : 'text-yellow-400'} />
            <span className="text-sm font-mono">
              {storageError ? (
                <span className="text-red-300">{storageError.message || 'Грешка при запазване - паметта е пълна!'}</span>
              ) : isStorageCritical ? (
                <span className="text-red-300">Критично ниво на паметта ({storageUsage.percentage}%)! Изчисти стари данни.</span>
              ) : (
                <span className="text-yellow-300">Паметта е над 70% ({storageUsage.percentage}%). Препоръчително е да изчистиш стари данни.</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStorageCleanup(true)}
              className="px-3 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors"
            >
              Изчисти
            </button>
            {!isStorageCritical && (
              <button
                onClick={() => {
                  setStorageWarningDismissed(true);
                  if (storageError) clearStorageError();
                }}
                className="p-1 hover:bg-slate-800 rounded"
                aria-label="Затвори предупреждението"
              >
                <X size={14} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>
      )}

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

          {/* Storage Usage */}
          <button
            onClick={() => setShowStorageCleanup(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
              isStorageCritical
                ? 'bg-red-900/30 border-red-500/50 hover:border-red-400'
                : isStorageWarning
                ? 'bg-yellow-900/30 border-yellow-500/50 hover:border-yellow-400'
                : 'bg-slate-800/30 border-slate-800 hover:border-slate-600'
            }`}
            title={`Памет: ${(storageUsage.used / 1024 / 1024).toFixed(1)}MB от ${(storageUsage.total / 1024 / 1024).toFixed(0)}MB`}
          >
            <HardDrive size={14} className={
              isStorageCritical ? 'text-red-400' :
              isStorageWarning ? 'text-yellow-400' : 'text-slate-400'
            } />
            <span className={`text-xs font-mono ${
              isStorageCritical ? 'text-red-400' :
              isStorageWarning ? 'text-yellow-400' : 'text-slate-400'
            }`}>
              {storageUsage.percentage}%
            </span>
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
            title={isSyncing ? 'Синхронизиране...' : lastSynced ? `Последна синхронизация: ${lastSynced.toLocaleTimeString('bg-BG')}` : 'Не е синхронизирано'}
            aria-label="Синхронизирай с облака"
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
      {showStorageCleanup && <StorageCleanupModal onClose={() => setShowStorageCleanup(false)} />}
    </>
  );
}
