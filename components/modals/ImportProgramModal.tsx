'use client';

import React, { useState, useMemo } from 'react';
import { X, FileText, Search, Check, ChevronDown, ChevronUp, AlertTriangle, Loader2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { AcademicEventType } from '@/lib/types';
import { ACADEMIC_EVENT_CONFIG } from '@/lib/constants';

type EntryType = 'topic' | 'colloquium' | 'control_test' | 'exam';

interface ParsedEntry {
  weekNumber: number;
  date: string;
  topic: string;
  entryType: EntryType;
  matchedTopicIds: string[];
  matchedTopicNames: string[];
}

const ENTRY_TYPE_MAP: Record<EntryType, { label: string; icon: string; isEvent: boolean; eventType?: AcademicEventType }> = {
  topic: { label: 'Тема', icon: '📖', isEvent: false },
  colloquium: { label: 'Колоквиум', icon: '📋', isEvent: true, eventType: 'colloquium' },
  control_test: { label: 'Контролно', icon: '📝', isEvent: true, eventType: 'control_test' },
  exam: { label: 'Изпит', icon: '🎓', isEvent: true, eventType: 'practical_exam' },
};

export default function ImportProgramModal({ onClose }: { onClose: () => void }) {
  const { data, addAcademicEventsBatch, updateClass } = useApp();

  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  const [subjectId, setSubjectId] = useState(activeSubjects[0]?.id || '');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<ParsedEntry[] | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [usageCost, setUsageCost] = useState<number | null>(null);
  const [eventWeight, setEventWeight] = useState(1.0);

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

  // Check for existing events and weekly descriptions (dedup)
  const existingData = useMemo(() => {
    const eventDates = new Set(
      data.academicEvents
        .filter(e => e.subjectId === subjectId)
        .map(e => e.date)
    );
    const descDates = new Set(
      Object.keys(selectedClass?.weeklyTopics || {})
    );
    return { eventDates, descDates };
  }, [data.academicEvents, subjectId, selectedClass]);

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
        const isEvent = ENTRY_TYPE_MAP[entry.entryType]?.isEvent;
        const isDup = isEvent
          ? existingData.eventDates.has(entry.date)
          : existingData.descDates.has(entry.date);
        if (entry.date >= today && !isDup) {
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
    if (!entries || !selectedClass) return;

    const selected = entries.filter((_, i) => selectedEntries.has(i));

    // Split: regular topics → weeklyDescriptions, special → AcademicEvents
    const topicEntries = selected.filter(e => !ENTRY_TYPE_MAP[e.entryType]?.isEvent);
    const eventEntries = selected.filter(e => ENTRY_TYPE_MAP[e.entryType]?.isEvent);

    // Update class with weekly topics (description + matched topicIds)
    if (topicEntries.length > 0) {
      const existing = selectedClass.weeklyTopics || {};
      const merged = { ...existing };
      for (const entry of topicEntries) {
        merged[entry.date] = {
          description: entry.topic,
          topicIds: entry.matchedTopicIds.length > 0 ? entry.matchedTopicIds : undefined
        };
      }
      updateClass(selectedClass.id, { weeklyTopics: merged });
    }

    // Create academic events for colloquiums/exams
    if (eventEntries.length > 0) {
      const eventsToCreate = eventEntries.map(entry => {
        const mapping = ENTRY_TYPE_MAP[entry.entryType];
        return {
          type: (mapping.eventType || 'colloquium') as AcademicEventType,
          subjectId,
          date: entry.date,
          name: entry.topic,
          description: undefined as string | undefined,
          topicIds: entry.matchedTopicIds.length > 0 ? entry.matchedTopicIds : undefined,
          weight: eventWeight
        };
      });
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

  // Count topics vs events in selection
  const selectedTopicCount = entries
    ? entries.filter((e, i) => selectedEntries.has(i) && !ENTRY_TYPE_MAP[e.entryType]?.isEvent).length
    : 0;
  const selectedEventCount = entries
    ? entries.filter((e, i) => selectedEntries.has(i) && ENTRY_TYPE_MAP[e.entryType]?.isEvent).length
    : 0;

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
                <label className="block text-xs text-slate-500 mb-1 font-mono">
                  Тежест на събития (колоквиуми/контролни): {eventWeight.toFixed(1)}x
                </label>
                <input
                  type="range" min="0.5" max="1.5" step="0.1"
                  value={eventWeight}
                  onChange={e => setEventWeight(parseFloat(e.target.value))}
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
              placeholder={"Постави програмата тук...\n\nПример:\nСедмица 1: Въведение в предмета\nСедмица 2: Антихипертензивни средства\nСедмица 8: Колоквиум I"}
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

              {/* Legend */}
              <div className="flex items-center gap-3 mb-2 text-[10px] font-mono text-slate-600">
                <span>📖 Тема → описание на занятие</span>
                <span>📋 Колоквиум → събитие</span>
              </div>

              <div className="border border-slate-700 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                {entries.map((entry, i) => {
                  const isPast = entry.date < today;
                  const mapping = ENTRY_TYPE_MAP[entry.entryType] || ENTRY_TYPE_MAP.topic;
                  const isDuplicate = mapping.isEvent
                    ? existingData.eventDates.has(entry.date)
                    : existingData.descDates.has(entry.date);
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
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                            mapping.isEvent
                              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                              : 'bg-slate-800 text-slate-500'
                          }`}>
                            {mapping.icon} {mapping.label}
                          </span>
                          {isPast && (
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-800 px-1.5 rounded">минала</span>
                          )}
                          {isDuplicate && (
                            <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 rounded">вече съществува</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mt-0.5 truncate" title={entry.topic}>{entry.topic}</p>
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
          <div className="p-4 border-t border-[#1e293b]">
            {/* Summary of what will happen */}
            {selectedCount > 0 && (
              <div className="flex items-center gap-3 mb-3 text-[11px] font-mono text-slate-500">
                {selectedTopicCount > 0 && (
                  <span>📖 {selectedTopicCount} {selectedTopicCount === 1 ? 'тема' : 'теми'} → график</span>
                )}
                {selectedEventCount > 0 && (
                  <span>📋 {selectedEventCount} {selectedEventCount === 1 ? 'събитие' : 'събития'} → календар</span>
                )}
              </div>
            )}
            <div className="flex gap-3">
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
                Импортирай {selectedCount} записа
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
