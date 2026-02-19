'use client';

import React, { useState, useMemo } from 'react';
import { X, FileText, Search, Check, ChevronDown, ChevronUp, AlertTriangle, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { AcademicEventType } from '@/lib/types';
import { ACADEMIC_EVENT_CONFIG } from '@/lib/constants';

interface ParsedEntry {
  weekNumber: number;
  date: string;
  topic: string;
  matchedTopicIds: string[];
  matchedTopicNames: string[];
}

export default function ImportProgramModal({ onClose }: { onClose: () => void }) {
  const { data, addAcademicEventsBatch } = useApp();

  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  const [subjectId, setSubjectId] = useState(activeSubjects[0]?.id || '');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [eventType, setEventType] = useState<AcademicEventType>('seminar');
  const [weight, setWeight] = useState(ACADEMIC_EVENT_CONFIG.seminar.defaultWeight);
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<ParsedEntry[] | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [usageCost, setUsageCost] = useState<number | null>(null);

  // Get schedule classes for selected subject
  const subjectClasses = useMemo(() => {
    return data.schedule.filter(c => c.subjectId === subjectId);
  }, [data.schedule, subjectId]);

  // Auto-select first class when subject changes
  const selectedClass = subjectClasses.find(c => c.id === selectedClassId) || subjectClasses[0];
  const classDay = selectedClass?.day ?? 0;

  const selectedSubject = activeSubjects.find(s => s.id === subjectId);
  const semesterStart = data.academicPeriod?.semesterStart;

  const DAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];
  const CLASS_TYPE_LABELS: Record<string, string> = {
    exercise: 'Упражнение',
    lecture: 'Лекция',
    seminar: 'Семинар',
    lab: 'Лаборатория',
  };

  // Check for existing events (dedup)
  const existingEventDates = useMemo(() => {
    return new Set(
      data.academicEvents
        .filter(e => e.subjectId === subjectId && e.type === eventType)
        .map(e => e.date)
    );
  }, [data.academicEvents, subjectId, eventType]);

  const handleSubjectChange = (newId: string) => {
    setSubjectId(newId);
    setSelectedClassId('');
    setEntries(null);
    setError('');
  };

  const handleScan = async () => {
    if (!text.trim() || !subjectId || !semesterStart) return;

    setScanning(true);
    setError('');
    setEntries(null);

    try {
      const apiKey = localStorage.getItem('claude-api-key');
      if (!apiKey) {
        setError('Няма API ключ. Добави го в Настройки.');
        setScanning(false);
        return;
      }

      const existingTopics = selectedSubject?.topics.map(t => ({
        id: t.id,
        name: t.name,
        number: t.number
      })) || [];

      const res = await fetch('/api/parse-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          apiKey,
          subjectName: selectedSubject?.name || '',
          existingTopics,
          classDay,
          semesterStart
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Грешка при парсване');
      }

      const result = await res.json();
      const parsed: ParsedEntry[] = result.entries || [];

      setEntries(parsed);
      setUsageCost(result.usage?.cost || null);

      // Auto-select: check all entries except past dates and duplicates
      const today = new Date().toISOString().split('T')[0];
      const autoSelected = new Set<number>();
      parsed.forEach((entry, i) => {
        if (entry.date >= today && !existingEventDates.has(entry.date)) {
          autoSelected.add(i);
        }
      });
      setSelectedEntries(autoSelected);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Неизвестна грешка');
    } finally {
      setScanning(false);
    }
  };

  const handleImport = () => {
    if (!entries) return;

    const eventsToCreate = entries
      .filter((_, i) => selectedEntries.has(i))
      .map(entry => ({
        type: eventType,
        subjectId,
        date: entry.date,
        name: `Седмица ${entry.weekNumber}`,
        description: entry.topic,
        topicIds: entry.matchedTopicIds.length > 0 ? entry.matchedTopicIds : undefined,
        weight
      }));

    if (eventsToCreate.length > 0) {
      addAcademicEventsBatch(eventsToCreate);
    }
    onClose();
  };

  const toggleEntry = (index: number) => {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (!entries) return;
    if (selectedEntries.size === entries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(entries.map((_, i) => i)));
    }
  };

  const selectedCount = selectedEntries.size;
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f0f1a] border border-[#1e293b] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <FileText className="text-cyan-400" size={20} />
            <h2 className="text-lg font-semibold text-slate-100 font-mono">
              Импортирай програма
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Subject selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Предмет
            </label>
            <select
              value={subjectId}
              onChange={e => handleSubjectChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:border-cyan-500"
            >
              {activeSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Schedule class selector */}
          {subjectClasses.length > 0 ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
                Занятие (определя деня на седмицата)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {subjectClasses.map(cls => {
                  const isSelected = cls.id === (selectedClass?.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-sm font-mono text-slate-200">
                        {DAYS[cls.day]}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {cls.time} • {CLASS_TYPE_LABELS[cls.type] || cls.type}
                        {cls.room ? ` • ${cls.room}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400 font-mono">
              <AlertTriangle size={14} className="inline mr-1" />
              Няма занятия за този предмет. Добави упражнение в графика първо.
            </div>
          )}

          {/* Semester start warning */}
          {!semesterStart && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 font-mono">
              <AlertTriangle size={14} className="inline mr-1" />
              Задай начална дата на семестъра в секция &quot;Академичен период&quot; горе на тази страница.
            </div>
          )}

          {/* Advanced settings */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-slate-500 font-mono hover:text-slate-400 transition-colors"
          >
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Настройки
          </button>
          {showAdvanced && (
            <div className="space-y-3 pl-3 border-l-2 border-slate-800">
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-mono">Тип събитие</label>
                <select
                  value={eventType}
                  onChange={e => {
                    const t = e.target.value as AcademicEventType;
                    setEventType(t);
                    setWeight(ACADEMIC_EVENT_CONFIG[t].defaultWeight);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm"
                >
                  {(Object.keys(ACADEMIC_EVENT_CONFIG) as AcademicEventType[]).map(t => (
                    <option key={t} value={t}>{ACADEMIC_EVENT_CONFIG[t].icon} {ACADEMIC_EVENT_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-mono">
                  Тежест: {weight.toFixed(1)}x
                </label>
                <input
                  type="range" min="0.5" max="1.5" step="0.1"
                  value={weight}
                  onChange={e => setWeight(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>
          )}

          {/* Text input */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
              Текст на програмата
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"Постави програмата тук...\n\nПример:\nСедмица 1: Въведение в предмета\nСедмица 2: Антихипертензивни средства\nСедмица 3: Диуретици"}
              rows={6}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:border-cyan-500 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Scan button */}
          {!entries && (
            <button
              onClick={handleScan}
              disabled={scanning || !text.trim() || !subjectId || !semesterStart || subjectClasses.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-600 text-white rounded-lg font-mono text-sm hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanning ? (
                <><Loader2 size={16} className="animate-spin" /> Сканиране...</>
              ) : (
                <><Search size={16} /> Сканирай програмата</>
              )}
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400 font-mono">
              {error}
            </div>
          )}

          {/* Preview table */}
          {entries && entries.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                  Намерени {entries.length} записа
                  {usageCost !== null && <span className="text-slate-600 normal-case ml-2">(${usageCost.toFixed(4)})</span>}
                </span>
                <button
                  onClick={toggleAll}
                  className="text-xs text-cyan-400 font-mono hover:text-cyan-300"
                >
                  {selectedEntries.size === entries.length ? 'Премахни всички' : 'Избери всички'}
                </button>
              </div>

              <div className="border border-slate-700 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                {entries.map((entry, i) => {
                  const isPast = entry.date < today;
                  const isDuplicate = existingEventDates.has(entry.date);
                  const isSelected = selectedEntries.has(i);

                  return (
                    <div
                      key={i}
                      onClick={() => toggleEntry(i)}
                      className={`flex items-start gap-3 px-3 py-2.5 border-b border-slate-800 last:border-b-0 cursor-pointer transition-all ${
                        isPast ? 'opacity-40' : isDuplicate ? 'opacity-50' : isSelected ? 'bg-cyan-500/5' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600'
                      }`}>
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500 shrink-0">
                            С{entry.weekNumber}
                          </span>
                          <span className="text-xs font-mono text-cyan-400 shrink-0">
                            {new Date(entry.date + 'T00:00:00').toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })}
                          </span>
                          {isPast && (
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-800 px-1.5 rounded">минала</span>
                          )}
                          {isDuplicate && (
                            <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 rounded">вече съществува</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mt-0.5 truncate">{entry.topic}</p>
                        {entry.matchedTopicNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {entry.matchedTopicNames.map((name, j) => (
                              <span key={j} className="text-[10px] font-mono bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {entries && entries.length === 0 && (
            <div className="text-center py-4 text-sm text-slate-500 font-mono">
              Не бяха намерени записи в текста.
            </div>
          )}
        </div>

        {/* Footer */}
        {entries && entries.length > 0 && (
          <div className="p-4 border-t border-[#1e293b] flex gap-3">
            <button
              onClick={() => { setEntries(null); setError(''); }}
              className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-700 transition-colors"
            >
              Обратно
            </button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="flex-1 py-2.5 bg-cyan-600 text-white rounded-lg font-mono text-sm hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Импортирай {selectedCount} {selectedCount === 1 ? 'събитие' : 'събития'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
