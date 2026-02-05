'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin } from 'lucide-react';
import { useApp } from '@/lib/context';
import { CLASS_TYPES, DAYS } from '@/lib/constants';

interface Props {
  onClose: () => void;
  defaultDay?: number;
}

export default function AddClassModal({ onClose, defaultDay = 0 }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const { data, addClass } = useApp();
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
  const [subjectId, setSubjectId] = useState(activeSubjects[0]?.id || '');
  const [day, setDay] = useState(defaultDay);
  const [time, setTime] = useState('09:00');
  const [room, setRoom] = useState('');

  const exerciseConfig = CLASS_TYPES.exercise;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) return;

    addClass({
      subjectId,
      day,
      time,
      type: 'exercise',
      room
    });
    onClose();
  };

  const selectedSubject = data.subjects.find(s => s.id === subjectId);

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
            <Calendar size={20} className="text-orange-400" />
            Добави упражнение
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Предмет
            </label>
            {activeSubjects.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono">
                Първо добави предмет
              </p>
            ) : (
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
              >
                {activeSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Day */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Ден
            </label>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((dayName, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDay(i)}
                  className={`py-2 text-xs rounded transition-all font-mono ${
                    day === i
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {dayName.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              <Clock size={14} className="inline mr-2" />
              Час
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              <MapPin size={14} className="inline mr-2" />
              Зала (незадължително)
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value.slice(0, 50))}
              placeholder="напр. 305"
              maxLength={50}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Preview */}
          {selectedSubject && (
            <div
              className="p-4 rounded-lg border"
              style={{
                backgroundColor: `${exerciseConfig.color}10`,
                borderColor: `${exerciseConfig.color}40`
              }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span>{exerciseConfig.icon}</span>
                <span style={{ color: selectedSubject.color }} className="font-medium">
                  {selectedSubject.name}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 font-mono">{DAYS[day]}</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 font-mono">{time}</span>
                {room && (
                  <>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 font-mono">{room}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!subjectId}
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-semibold rounded-lg hover:from-orange-500 hover:to-amber-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Добави упражнение
          </button>
        </form>
      </div>
    </div>
  );
}
