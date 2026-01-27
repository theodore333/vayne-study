'use client';

import { useState, useEffect } from 'react';
import { X, Thermometer, Palmtree } from 'lucide-react';
import { useApp } from '@/lib/context';

interface Props {
  onClose: () => void;
}

export default function DailyCheckinModal({ onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const { data, updateDailyStatus } = useApp();
  const [sick, setSick] = useState(data.dailyStatus.sick);
  const [holiday, setHoliday] = useState(data.dailyStatus.holiday);

  const handleSave = () => {
    updateDailyStatus({ sick, holiday });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono">
            Режим на деня
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Sick Toggle */}
          <button
            onClick={() => setSick(!sick)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all font-mono ${
              sick
                ? 'bg-red-500/20 border-red-500 text-red-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className={`p-3 rounded-lg ${sick ? 'bg-red-500/20' : 'bg-slate-700/50'}`}>
              <Thermometer size={24} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-slate-200">Болен 🤒</div>
              <div className="text-xs text-slate-500">Reduced workload: 2ч вместо 4ч</div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 ${sick ? 'bg-red-500 border-red-500' : 'border-slate-600'}`} />
          </button>

          {/* Holiday Toggle */}
          <button
            onClick={() => setHoliday(!holiday)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all font-mono ${
              holiday
                ? 'bg-green-500/20 border-green-500 text-green-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className={`p-3 rounded-lg ${holiday ? 'bg-green-500/20' : 'bg-slate-700/50'}`}>
              <Palmtree size={24} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-slate-200">Почивка 🏖️</div>
              <div className="text-xs text-slate-500">Reduced workload: 2ч вместо 4ч</div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 ${holiday ? 'bg-green-500 border-green-500' : 'border-slate-600'}`} />
          </button>

          {/* Info */}
          {(sick || holiday) && (
            <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
              <p className="text-xs text-slate-400 font-mono text-center">
                {sick && holiday ? '⚡ Минимален режим: 1ч' : '⚡ Reduced workload активен'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b]">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono"
          >
            Запази
          </button>
        </div>
      </div>
    </div>
  );
}
