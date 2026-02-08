'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Plus, RotateCcw, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useApp } from '@/lib/context';
import { DailyTask, Topic, Subject } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';
import { generateId } from '@/lib/algorithms';

interface Props {
  onClose: () => void;
  originalPlan: DailyTask[];
  customPlan: DailyTask[];
  onSave: (plan: DailyTask[]) => void;
}

export default function EditDailyPlanModal({ onClose, originalPlan, customPlan, onSave }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const { data } = useApp();
  const activeSubjects = useMemo(
    () => data.subjects.filter(s => !s.archived && !s.deletedAt),
    [data.subjects]
  );

  const [editedPlan, setEditedPlan] = useState<DailyTask[]>(
    customPlan.length > 0 ? JSON.parse(JSON.stringify(customPlan)) : JSON.parse(JSON.stringify(originalPlan))
  );
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showAddTopicFor, setShowAddTopicFor] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);

  // Get topics that are already in the plan
  const topicsInPlan = useMemo(() => {
    return new Set(editedPlan.flatMap(t => t.topics.map(topic => topic.id)));
  }, [editedPlan]);

  // Handle removing a topic from a task
  const handleRemoveTopic = (taskId: string, topicId: string) => {
    setEditedPlan(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const newTopics = task.topics.filter(t => t.id !== topicId);
      return {
        ...task,
        topics: newTopics,
        estimatedMinutes: newTopics.length * 20
      };
    }).filter(task => task.topics.length > 0)); // Remove tasks with no topics
  };

  // Handle removing entire task
  const handleRemoveTask = (taskId: string) => {
    setEditedPlan(prev => prev.filter(t => t.id !== taskId));
  };

  // Handle adding a topic to a task
  const handleAddTopicToTask = (taskId: string, topic: Topic, subject: Subject) => {
    setEditedPlan(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        topics: [...task.topics, topic],
        estimatedMinutes: (task.topics.length + 1) * 20
      };
    }));
    setShowAddTopicFor(null);
  };

  // Handle adding a new task
  const handleAddTask = (subject: Subject, topics: Topic[]) => {
    const newTask: DailyTask = {
      id: generateId(),
      subjectId: subject.id,
      subjectName: subject.name,
      subjectColor: subject.color,
      type: 'normal',
      typeLabel: '📝 Добавена ръчно',
      description: 'Ръчно добавена задача',
      topics: topics,
      estimatedMinutes: topics.length * 20,
      completed: false
    };
    setEditedPlan(prev => [...prev, newTask]);
    setShowAddTask(false);
  };

  // Reset to original generated plan
  const handleReset = () => {
    setEditedPlan(JSON.parse(JSON.stringify(originalPlan)));
  };

  // Save the plan
  const handleSave = () => {
    onSave(editedPlan);
    onClose();
  };

  // Get available topics for adding (not already in plan)
  const getAvailableTopics = (subjectId: string) => {
    const subject = activeSubjects.find(s => s.id === subjectId);
    if (!subject) return [];
    return subject.topics.filter(t => !topicsInPlan.has(t.id));
  };

  const typeColors: Record<DailyTask['type'], { bg: string; border: string; text: string }> = {
    setup: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    high: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
    normal: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    project: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
    technique: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400' }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b] shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 font-mono">
            Редактирай днешния план
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {editedPlan.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 font-mono">Няма задачи в плана</p>
            </div>
          ) : (
            editedPlan.map(task => {
              const colors = typeColors[task.type];
              const isExpanded = expandedTask === task.id;
              const availableTopics = getAvailableTopics(task.subjectId);

              return (
                <div
                  key={task.id}
                  className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}
                >
                  {/* Task Header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer"
                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: task.subjectColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${colors.text} bg-black/20`}>
                          {task.typeLabel}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-200 font-mono mt-1 truncate">
                        {task.subjectName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{task.topics.length} теми</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveTask(task.id); }}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                      title="Премахни задачата"
                    >
                      <Trash2 size={16} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>

                  {/* Topics (expanded) */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-2">
                      {task.topics.map(topic => (
                        <div
                          key={topic.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 group"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: STATUS_CONFIG[topic.status].text }}
                          />
                          <span className="flex-1 text-xs font-mono text-slate-300 truncate">
                            #{topic.number} {topic.name}
                          </span>
                          <button
                            onClick={() => handleRemoveTopic(task.id, topic.id)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                            title="Премахни темата"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {/* Add Topic Button */}
                      {showAddTopicFor === task.id ? (
                        <div className="mt-2 space-y-2">
                          <div className="text-xs text-slate-500 font-mono">Избери тема за добавяне:</div>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {availableTopics.length === 0 ? (
                              <div className="text-xs text-slate-600 font-mono text-center py-2">
                                Няма налични теми от този предмет
                              </div>
                            ) : (
                              availableTopics.slice(0, 10).map(topic => {
                                const subject = activeSubjects.find(s => s.id === task.subjectId)!;
                                return (
                                  <button
                                    key={topic.id}
                                    onClick={() => handleAddTopicToTask(task.id, topic, subject)}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800/30 hover:bg-slate-700/50 transition-colors text-left"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: STATUS_CONFIG[topic.status].text }}
                                    />
                                    <span className="flex-1 text-xs font-mono text-slate-300 truncate">
                                      #{topic.number} {topic.name}
                                    </span>
                                    <Plus size={12} className="text-slate-500" />
                                  </button>
                                );
                              })
                            )}
                          </div>
                          <button
                            onClick={() => setShowAddTopicFor(null)}
                            className="text-xs text-slate-500 hover:text-slate-300 font-mono"
                          >
                            Затвори
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowAddTopicFor(task.id)}
                          className="flex items-center gap-2 text-xs text-slate-500 hover:text-cyan-400 font-mono transition-colors mt-2"
                        >
                          <Plus size={14} />
                          Добави тема
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Add New Task */}
          {showAddTask ? (
            <AddTaskPanel
              subjects={activeSubjects}
              topicsInPlan={topicsInPlan}
              onAdd={handleAddTask}
              onCancel={() => setShowAddTask(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddTask(true)}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/50 font-mono transition-colors"
            >
              <Plus size={16} />
              Добави задача от друг предмет
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b] flex items-center justify-between shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 font-mono transition-colors"
          >
            <RotateCcw size={16} />
            Нулирай към генериран
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono"
          >
            <Check size={16} />
            Запази
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component for adding a new task
function AddTaskPanel({
  subjects,
  topicsInPlan,
  onAdd,
  onCancel
}: {
  subjects: Subject[];
  topicsInPlan: Set<string>;
  onAdd: (subject: Subject, topics: Topic[]) => void;
  onCancel: () => void;
}) {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  const availableTopics = useMemo(() => {
    if (!selectedSubject) return [];
    return selectedSubject.topics.filter(t => !topicsInPlan.has(t.id));
  }, [selectedSubject, topicsInPlan]);

  const handleToggleTopic = (topicId: string) => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (!selectedSubject || selectedTopics.size === 0) return;
    const topics = selectedSubject.topics.filter(t => selectedTopics.has(t.id));
    onAdd(selectedSubject, topics);
  };

  return (
    <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-4">
      <div className="text-sm font-semibold text-slate-200 font-mono">Добави нова задача</div>

      {/* Subject Selection */}
      <div>
        <label className="text-xs text-slate-500 font-mono block mb-2">Избери предмет:</label>
        <div className="flex flex-wrap gap-2">
          {subjects.map(subject => (
            <button
              key={subject.id}
              onClick={() => { setSelectedSubject(subject); setSelectedTopics(new Set()); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                selectedSubject?.id === subject.id
                  ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: subject.color }} />
              {subject.name}
            </button>
          ))}
        </div>
      </div>

      {/* Topic Selection */}
      {selectedSubject && (
        <div>
          <label className="text-xs text-slate-500 font-mono block mb-2">
            Избери теми ({selectedTopics.size} избрани):
          </label>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {availableTopics.length === 0 ? (
              <div className="text-xs text-slate-600 font-mono text-center py-2">
                Всички теми от този предмет са вече в плана
              </div>
            ) : (
              availableTopics.map(topic => (
                <button
                  key={topic.id}
                  onClick={() => handleToggleTopic(topic.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left ${
                    selectedTopics.has(topic.id)
                      ? 'bg-cyan-500/20 border border-cyan-500/50'
                      : 'bg-slate-800/30 hover:bg-slate-700/50 border border-transparent'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_CONFIG[topic.status].text }}
                  />
                  <span className="flex-1 text-xs font-mono text-slate-300 truncate">
                    #{topic.number} {topic.name}
                  </span>
                  {selectedTopics.has(topic.id) && <Check size={12} className="text-cyan-400" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-slate-200 font-mono text-sm transition-colors"
        >
          Отказ
        </button>
        <button
          onClick={handleAdd}
          disabled={!selectedSubject || selectedTopics.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-mono text-sm transition-colors"
        >
          <Plus size={14} />
          Добави
        </button>
      </div>
    </div>
  );
}
