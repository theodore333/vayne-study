'use client';

import { useState } from 'react';
import { X, BookOpen, Calendar } from 'lucide-react';
import { useApp } from '@/lib/context';
import { PRESET_COLORS } from '@/lib/constants';

interface Props {
  onClose: () => void;
}

export default function AddSubjectModal({ onClose }: Props) {
  const { addSubject } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [examDate, setExamDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addSubject(name.trim(), color, examDate || null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <BookOpen size={20} className="text-blue-400" />
            Нов предмет
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Име на предмета
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="напр. Анатомия"
              autoFocus
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Цвят
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-10 h-10 rounded-lg border-2 transition-all ${
                    color === c
                      ? 'border-white scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Exam Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              <Calendar size={14} className="inline mr-2" />
              Дата на изпит (незадължително)
            </label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Preview */}
          <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-slate-200 font-medium">
                {name || 'Име на предмета'}
              </span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Добави предмет
          </button>
        </form>
      </div>
    </div>
  );
}
