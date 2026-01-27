'use client';

import { useState, useEffect } from 'react';
import { X, BookOpen, Calendar, FileText, Beaker, Stethoscope, FlaskConical } from 'lucide-react';
import { useApp } from '@/lib/context';
import { PRESET_COLORS } from '@/lib/constants';
import { SubjectType, SUBJECT_TYPES } from '@/lib/types';

interface Props {
  onClose: () => void;
}

export default function AddSubjectModal({ onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const { addSubject } = useApp();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [subjectType, setSubjectType] = useState<SubjectType>('preclinical');
  const [examDate, setExamDate] = useState('');
  const [examFormat, setExamFormat] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addSubject(name.trim(), color, subjectType, examDate || null, examFormat.trim() || null);
    onClose();
  };

  const typeIcons = {
    preclinical: Beaker,
    clinical: Stethoscope,
    hybrid: FlaskConical
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
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              placeholder="напр. Анатомия"
              autoFocus
              maxLength={100}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            {name.length >= 90 && (
              <p className="text-xs text-amber-400 mt-1 font-mono">{100 - name.length} символа остават</p>
            )}
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

          {/* Subject Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Тип предмет
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SUBJECT_TYPES.map(st => {
                const Icon = typeIcons[st.type];
                return (
                  <button
                    key={st.type}
                    type="button"
                    onClick={() => setSubjectType(st.type)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      subjectType === st.type
                        ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Icon size={20} className="mx-auto mb-1" />
                    <span className="text-xs font-mono block">{st.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-mono">
              {SUBJECT_TYPES.find(st => st.type === subjectType)?.examples}
            </p>
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
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
            {examDate && new Date(examDate) < new Date(new Date().toDateString()) && (
              <p className="text-xs text-red-400 mt-1 font-mono">⚠️ Датата е в миналото</p>
            )}
          </div>

          {/* Exam Format */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              <FileText size={14} className="inline mr-2" />
              Формат на изпита (незадължително)
            </label>
            <textarea
              value={examFormat}
              onChange={(e) => setExamFormat(e.target.value.slice(0, 500))}
              placeholder="напр. 20 тестови въпроса, 2 казуса, 1 есе"
              rows={2}
              maxLength={500}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
            />
            <p className="text-xs text-slate-500 mt-1 font-mono">
              AI ще генерира quiz въпроси в този формат
              {examFormat.length >= 450 && <span className="text-amber-400 ml-2">({500 - examFormat.length} символа остават)</span>}
            </p>
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
