'use client';

import React, { useState } from 'react';
import { X, Calendar, BookOpen } from 'lucide-react';
import { AcademicEventType, Subject } from '@/lib/types';
import { ACADEMIC_EVENT_CONFIG } from '@/lib/constants';
import { useApp } from '@/lib/context';

interface AddAcademicEventModalProps {
  onClose: () => void;
  preselectedSubjectId?: string;
}

export default function AddAcademicEventModal({
  onClose,
  preselectedSubjectId
}: AddAcademicEventModalProps) {
  const { data, addAcademicEvent } = useApp();

  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  const [eventType, setEventType] = useState<AcademicEventType>('colloquium');
  const [subjectId, setSubjectId] = useState(preselectedSubjectId || activeSubjects[0]?.id || '');
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState(ACADEMIC_EVENT_CONFIG.colloquium.defaultWeight);

  const handleTypeChange = (type: AcademicEventType) => {
    setEventType(type);
    setWeight(ACADEMIC_EVENT_CONFIG[type].defaultWeight);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!subjectId || !date) return;

    addAcademicEvent({
      type: eventType,
      subjectId,
      date,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      weight
    });

    onClose();
  };

  const selectedSubject = activeSubjects.find(s => s.id === subjectId);
  const config = ACADEMIC_EVENT_CONFIG[eventType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f0f1a] border border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <Calendar className="text-purple-400" size={20} />
            <h2 className="text-lg font-semibold text-slate-100 font-mono">
              Добави събитие
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Event Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Тип събитие
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ACADEMIC_EVENT_CONFIG) as AcademicEventType[]).map(type => {
                const cfg = ACADEMIC_EVENT_CONFIG[type];
                const isSelected = eventType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cfg.icon}</span>
                      <span className={`text-sm font-mono ${isSelected ? 'text-purple-300' : 'text-slate-300'}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Предмет
            </label>
            <div className="relative">
              <BookOpen size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-10 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500"
                required
              >
                <option value="">Избери предмет...</option>
                {activeSubjects.map(subject => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              {selectedSubject && (
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                  style={{ backgroundColor: selectedSubject.color }}
                />
              )}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Дата
            </label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-10 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500"
                required
              />
            </div>
          </div>

          {/* Name (optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Име (незадължително)
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`${config.label} 1`}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500 placeholder:text-slate-600"
            />
          </div>

          {/* Weight */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Тежест: {weight.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={weight}
              onChange={e => setWeight(parseFloat(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-xs text-slate-500 font-mono mt-1">
              <span>Лек</span>
              <span>Нормален</span>
              <span>Важен</span>
            </div>
          </div>

          {/* Description (optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Бележки (незадължително)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Допълнителна информация..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-700 transition-colors"
            >
              Отказ
            </button>
            <button
              type="submit"
              disabled={!subjectId || !date}
              className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-mono text-sm hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {config.icon} Добави
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
