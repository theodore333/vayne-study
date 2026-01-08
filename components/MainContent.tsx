'use client';

import { useApp } from '@/lib/context';
import Header from './Header';
import { AlertTriangle, X } from 'lucide-react';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, storageError, clearStorageError, getStorageUsage } = useApp();

  const usage = storageError ? getStorageUsage() : null;

  return (
    <div className={`flex-1 transition-all duration-200 ${sidebarCollapsed ? 'ml-[60px]' : 'ml-[280px]'}`}>
      <Header />

      {/* Storage Error Banner */}
      {storageError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-3">
          <div className="flex items-start gap-3 max-w-4xl mx-auto">
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-200 font-mono font-semibold">
                {storageError.error === 'quota_exceeded' ? 'Паметта е пълна!' : 'Грешка при запазване'}
              </p>
              <p className="text-xs text-red-300/80 font-mono mt-1">
                {storageError.message || 'Данните може да не са запазени. Опитай да изтриеш неизползвани материали.'}
              </p>
              {usage && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden max-w-xs">
                    <div
                      className={`h-full ${usage.percentage >= 90 ? 'bg-red-500' : usage.percentage >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, usage.percentage)}%` }}
                    />
                  </div>
                  <span className="text-xs text-red-300 font-mono">
                    {(usage.used / (1024 * 1024)).toFixed(2)}MB / {(usage.total / (1024 * 1024)).toFixed(0)}MB ({usage.percentage}%)
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={clearStorageError}
              className="p-1 text-red-400 hover:text-red-300 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
