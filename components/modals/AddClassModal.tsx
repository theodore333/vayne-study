'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, MapPin, CheckSquare, Square, Search } from 'lucide-react';
import { useApp } from '@/lib/context';
import { CLASS_TYPES, DAYS } from '@/lib/constants';

interface EditClassData {
  id: string;
  subjectId: string;
  day: number;
  time: string;
  endTime?: string;
  room: string;
  description?: string;
  topicIds?: string[];
  startDate?: string;
  overrides?: Record<string, { time?: string; endTime?: string; room?: string; description?: string }>;
}

interface Props {
  onClose: () => void;
  defaultDay?: number;
  editClass?: EditClassData;
  overrideDate?: string; // ISO date — if set, edit only this specific date
}

export default function AddClassModal({ onClose, defaultDay = 0, editClass, overrideDate }: Props) {
  const isOverrideMode = !!overrideDate && !!editClass;

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const { data, addClass, updateClass, overrideClassForDate } = useApp();
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
  // In override mode, init from existing override or base class values
  const existingOverride = isOverrideMode ? (editClass as any)?.overrides?.[overrideDate!] : null;
  const [subjectId, setSubjectId] = useState(editClass?.subjectId || activeSubjects[0]?.id || '');
  const [day, setDay] = useState(editClass?.day ?? defaultDay);
  const [time, setTime] = useState(existingOverride?.time || editClass?.time || '09:00');
  const [endTime, setEndTime] = useState(existingOverride?.endTime || editClass?.endTime || '11:00');
  const [room, setRoom] = useState(existingOverride?.room ?? editClass?.room ?? '');
  const [description, setDescription] = useState(existingOverride?.description ?? editClass?.description ?? '');
  const [startDate, setStartDate] = useState(editClass?.startDate || '');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set(editClass?.topicIds || []));
  const [showTopics, setShowTopics] = useState(!!(editClass?.topicIds && editClass.topicIds.length > 0));
  const [topicSearch, setTopicSearch] = useState('');

  const selectedSubject = data.subjects.find(s => s.id === subjectId);
  const exerciseConfig = CLASS_TYPES.exercise;

  const subjectTopics = useMemo(() => {
    if (!selectedSubject) return [];
    return selectedSubject.topics;
  }, [selectedSubject]);

  const filteredTopics = useMemo(() => {
    if (!topicSearch.trim()) return subjectTopics;
    const q = topicSearch.toLowerCase();
    return subjectTopics.filter(t =>
      t.name.toLowerCase().includes(q) || String(t.number).includes(q)
    );
  }, [subjectTopics, topicSearch]);

  const handleSubjectChange = (newId: string) => {
    setSubjectId(newId);
    setSelectedTopicIds(new Set());
    setShowTopics(false);
    setTopicSearch('');
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isOverrideMode) {
      overrideClassForDate(editClass!.id, overrideDate!, {
        time,
        endTime: endTime || undefined,
        room,
        description: description.trim() || undefined,
      });
      onClose();
      return;
    }

    if (!subjectId) return;

    const classData = {
      subjectId,
      day,
      time,
      endTime: endTime || undefined,
      type: 'exercise' as const,
      room,
      description: description.trim() || undefined,
      topicIds: selectedTopicIds.size > 0 ? Array.from(selectedTopicIds) : undefined,
      startDate: startDate || undefined
    };

    if (editClass) {
      updateClass(editClass.id, classData);
    } else {
      addClass(classData);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <Calendar size={20} className="text-orange-400" />
            {isOverrideMode ? `Промяна за ${new Date(overrideDate! + 'T12:00').toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })}` : editClass ? 'Редактирай упражнение' : 'Добави упражнение'}
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
          {/* Override mode: show which class this is for */}
          {isOverrideMode && selectedSubject && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedSubject.color }} />
              <span className="text-sm font-medium" style={{ color: selectedSubject.color }}>{selectedSubject.name}</span>
              <span className="text-xs text-slate-500 font-mono">• само за тази дата</span>
            </div>
          )}

          {/* Subject — hide in override mode */}
          {!isOverrideMode && (
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
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
              >
                {activeSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          )}

          {/* Day — hide in override mode */}
          {!isOverrideMode && (
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
          )}

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              <Clock size={14} className="inline mr-2" />
              Час
            </label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
              />
              <span className="text-slate-500 font-mono text-sm">—</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
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

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Тема на упражнението (незадължително)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 100))}
              placeholder="напр. Мускули на горен крайник"
              maxLength={100}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Topic Selection — hide in override mode */}
          {!isOverrideMode && selectedSubject && subjectTopics.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowTopics(!showTopics)}
                className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-2 font-mono hover:text-slate-200 transition-colors"
              >
                <span>{showTopics ? '▾' : '▸'} Конкретни теми ({selectedTopicIds.size > 0 ? `${selectedTopicIds.size} избрани` : 'незадължително'})</span>
              </button>
              {showTopics && (
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                  {subjectTopics.length > 8 && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800/30">
                      <Search size={13} className="text-slate-500 shrink-0" />
                      <input
                        type="text"
                        value={topicSearch}
                        onChange={e => setTopicSearch(e.target.value)}
                        placeholder="Търси тема..."
                        className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none font-mono"
                      />
                    </div>
                  )}
                  <div className="max-h-60 overflow-y-auto">
                  {filteredTopics.map(topic => {
                    const isSelected = selectedTopicIds.has(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleTopic(topic.id)}
                        className={`w-full flex items-start gap-2 px-3 py-2 text-left text-xs font-mono transition-colors ${
                          isSelected
                            ? 'bg-orange-500/10 text-orange-300'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
                        }`}
                      >
                        {isSelected
                          ? <CheckSquare size={13} className="shrink-0 mt-0.5 text-orange-400" />
                          : <Square size={13} className="shrink-0 mt-0.5 text-slate-600" />
                        }
                        <span>{topic.number}. {topic.name}</span>
                      </button>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview — hide in override mode */}
          {!isOverrideMode && selectedSubject && (
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
            {isOverrideMode ? 'Запази за тази дата' : editClass ? 'Запази промените' : 'Добави упражнение'}
          </button>
        </form>
      </div>
    </div>
  );
}
