'use client';

import { useState } from 'react';
import { X, Moon, Zap, Thermometer, Clock } from 'lucide-react';
import { useApp } from '@/lib/context';

interface Props {
  onClose: () => void;
}

export default function DailyCheckinModal({ onClose }: Props) {
  const { data, updateDailyStatus } = useApp();
  const [sleep, setSleep] = useState(data.dailyStatus.sleep);
  const [energy, setEnergy] = useState(data.dailyStatus.energy);
  const [sick, setSick] = useState(data.dailyStatus.sick);
  const [availableHours, setAvailableHours] = useState(data.dailyStatus.availableHours);

  const handleSave = () => {
    updateDailyStatus({ sleep, energy, sick, availableHours });
    onClose();
  };

  const sleepEmojis = ['😵', '😴', '😐', '🙂', '😊'];
  const energyEmojis = ['🪫', '😴', '⚡', '💪', '🔥'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono">
            📊 Дневен Check-in
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Sleep Rating */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3 font-mono">
              <Moon size={16} className="text-blue-400" />
              Качество на съня
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  onClick={() => setSleep(value)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-2xl ${
                    sleep === value
                      ? 'bg-blue-500/20 border-blue-500 scale-110'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {sleepEmojis[value - 1]}
                </button>
              ))}
            </div>
          </div>

          {/* Energy Rating */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3 font-mono">
              <Zap size={16} className="text-yellow-400" />
              Ниво на енергия
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  onClick={() => setEnergy(value)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-2xl ${
                    energy === value
                      ? 'bg-yellow-500/20 border-yellow-500 scale-110'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {energyEmojis[value - 1]}
                </button>
              ))}
            </div>
          </div>

          {/* Sick Toggle */}
          <div>
            <button
              onClick={() => setSick(!sick)}
              className={`w-full flex items-center justify-center gap-3 py-3 rounded-lg border transition-all font-mono ${
                sick
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Thermometer size={18} />
              <span>{sick ? 'Болен съм 🤒' : 'Здрав съм ✓'}</span>
            </button>
          </div>

          {/* Available Hours */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3 font-mono">
              <Clock size={16} className="text-green-400" />
              Налични часове за учене
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={availableHours}
                onChange={(e) => setAvailableHours(parseFloat(e.target.value))}
                className="flex-1 accent-green-500"
              />
              <span className="text-xl font-bold text-green-400 font-mono w-16 text-center">
                {availableHours}ч
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b]">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono"
          >
            Запази ✓
          </button>
        </div>
      </div>
    </div>
  );
}
