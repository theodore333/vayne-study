'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Plus, RotateCcw, ChevronDown, ChevronUp, Check, Brain, Loader2, RefreshCw } from 'lucide-react';
import { useApp } from '@/lib/context';
import { DailyTask, Topic, Subject, DevelopmentProject } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';
import { generateId, getTopicsNeedingFSRSReview } from '@/lib/algorithms';

interface Props {
  onClose: () => void;
  originalPlan: DailyTask[];
  customPlan: DailyTask[];
  onSave: (plan: DailyTask[]) => void;
  startEmpty?: boolean;
  onRequestAiReview?: (plan: DailyTask[]) => void;
  isLoadingAiReview?: boolean;
}

export default function EditDailyPlanModal({ onClose, originalPlan, customPlan, onSave, startEmpty = false, onRequestAiReview, isLoadingAiReview }: Props) {
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
    startEmpty ? [] : (customPlan.length > 0 ? JSON.parse(JSON.stringify(customPlan)) : JSON.parse(JSON.stringify(originalPlan)))
  );
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showAddTopicFor, setShowAddTopicFor] = useState<string | null>(null);
  const [topicSearch, setTopicSearch] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);

  // Get topics that are already in the plan
  const topicsInPlan = useMemo(() => {
    return new Set(editedPlan.flatMap(t => t.topics.map(topic => topic.id)));
  }, [editedPlan]);

  // Compute FSRS due reviews (not already in plan)
  const fsrsDueReviews = useMemo(() => {
    return getTopicsNeedingFSRSReview(activeSubjects, Infinity, data.studyGoals)
      .filter(item => !topicsInPlan.has(item.topic.id));
  }, [activeSubjects, data.studyGoals, topicsInPlan]);

  const fsrsDueTopicIds = useMemo(
    () => new Set(fsrsDueReviews.map(r => r.topic.id)),
    [fsrsDueReviews]
  );

  // Group due reviews by subject for quick-add
  const dueBySubject = useMemo(() => {
    const map = new Map<string, { subject: Subject; items: typeof fsrsDueReviews }>();
    for (const item of fsrsDueReviews) {
      const existing = map.get(item.subject.id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.subject.id, { subject: item.subject, items: [item] });
      }
    }
    return map;
  }, [fsrsDueReviews]);

  // Quick-add all due reviews for a subject
  const handleAddReviewsForSubject = (subjectId: string) => {
    const entry = dueBySubject.get(subjectId);
    if (!entry) return;
    const newTask: DailyTask = {
      id: generateId(),
      subjectId: entry.subject.id,
      subjectName: entry.subject.name,
      subjectColor: entry.subject.color,
      type: 'normal',
      typeLabel: '🔄 FSRS Преговор',
      description: `${entry.items.length} теми за преговор`,
      topics: entry.items.map(i => i.topic),
      estimatedMinutes: entry.items.length * 20,
      completed: false
    };
    setEditedPlan(prev => [...prev, newTask]);
  };

  // Quick-add ALL due reviews (all subjects)
  const handleAddAllReviews = () => {
    for (const [subjectId, entry] of dueBySubject) {
      const alreadyHasReview = editedPlan.some(t => t.subjectId === subjectId && t.typeLabel === '🔄 FSRS Преговор');
      if (alreadyHasReview) continue;
      const newTask: DailyTask = {
        id: generateId(),
        subjectId: entry.subject.id,
        subjectName: entry.subject.name,
        subjectColor: entry.subject.color,
        type: 'normal',
        typeLabel: '🔄 FSRS Преговор',
        description: `${entry.items.length} теми за преговор`,
        topics: entry.items.map(i => i.topic),
        estimatedMinutes: entry.items.length * 20,
        completed: false
      };
      setEditedPlan(prev => [...prev, newTask]);
    }
  };

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

  // Handle adding a new task (subject-based)
  const handleAddTask = (subject: Subject, topics: Topic[], customDescription?: string) => {
    const newTask: DailyTask = {
      id: generateId(),
      subjectId: subject.id,
      subjectName: subject.name,
      subjectColor: subject.color,
      type: 'normal',
      typeLabel: '📝 Добавена ръчно',
      description: customDescription || 'Ръчно добавена задача',
      topics: topics,
      estimatedMinutes: topics.length * 20,
      completed: false
    };
    setEditedPlan(prev => [...prev, newTask]);
    setShowAddTask(false);
  };

  // Handle adding a project task
  const handleAddProjectTask = (project: DevelopmentProject, description?: string) => {
    const incompleteModules = project.modules
      .filter(m => m.status !== 'completed')
      .sort((a, b) => a.order - b.order)
      .slice(0, 3);
    const newTask: DailyTask = {
      id: generateId(),
      subjectId: '',
      subjectName: project.name,
      subjectColor: '#06b6d4',
      type: 'project',
      typeLabel: '🚀 Проект',
      description: description || project.description || 'Продължи',
      topics: [],
      estimatedMinutes: project.weeklyGoalMinutes ? Math.round(project.weeklyGoalMinutes / 7) : 30,
      completed: false,
      projectId: project.id,
      projectName: project.name,
      projectModules: incompleteModules
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
            {startEmpty ? 'Създай ръчен план' : 'Редактирай днешния план'}
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
          {/* Due Reviews Banner */}
          {fsrsDueReviews.length > 0 && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <RefreshCw size={14} className="text-amber-400" />
                  <span className="text-sm font-mono text-amber-300">
                    {fsrsDueReviews.length} {fsrsDueReviews.length === 1 ? 'тема чака' : 'теми чакат'} преговор
                  </span>
                </div>
                <button
                  onClick={handleAddAllReviews}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/40 rounded-lg text-xs font-mono text-amber-300 transition-colors"
                >
                  <Plus size={12} />
                  Добави всички
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(dueBySubject.entries()).map(([subjectId, entry]) => (
                  <button
                    key={subjectId}
                    onClick={() => handleAddReviewsForSubject(subjectId)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700 transition-colors group"
                    title={`Добави ${entry.items.length} теми от ${entry.subject.name}`}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.subject.color }} />
                    <span className="text-[11px] font-mono text-slate-300 group-hover:text-slate-100">
                      {entry.subject.name}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400/80">
                      {entry.items.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {editedPlan.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 font-mono mb-2">{startEmpty ? 'Добави теми за днешния ден' : 'Няма задачи в плана'}</p>
              {startEmpty && <p className="text-xs text-slate-600 font-mono">Избери предмет и теми, после натисни &quot;AI: Допълни&quot; за предложения</p>}
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
                      {task.description && task.description !== 'Ръчно добавена задача' && (
                        <div className="text-xs text-cyan-400/80 font-mono mt-0.5 truncate">{task.description}</div>
                      )}
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
                          <input
                            type="text"
                            placeholder="Търси тема..."
                            value={topicSearch}
                            onChange={e => setTopicSearch(e.target.value)}
                            autoFocus
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                          />
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {(() => {
                              const query = topicSearch.toLowerCase().trim();
                              const filtered = query
                                ? availableTopics.filter(t =>
                                    t.name.toLowerCase().includes(query) ||
                                    `#${t.number}`.includes(query)
                                  )
                                : availableTopics;
                              if (filtered.length === 0) {
                                return (
                                  <div className="text-xs text-slate-600 font-mono text-center py-2">
                                    {availableTopics.length === 0 ? 'Няма налични теми от този предмет' : 'Няма съвпадения'}
                                  </div>
                                );
                              }
                              return filtered.map(topic => {
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
                                    <span className="flex-1 text-xs font-mono text-slate-300 leading-relaxed" title={`#${topic.number} ${topic.name}`}>
                                      #{topic.number} {topic.name}
                                    </span>
                                    <Plus size={12} className="text-slate-500 shrink-0" />
                                  </button>
                                );
                              });
                            })()}
                          </div>
                          <button
                            onClick={() => { setShowAddTopicFor(null); setTopicSearch(''); }}
                            className="text-xs text-slate-500 hover:text-slate-300 font-mono"
                          >
                            Затвори
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowAddTopicFor(task.id); setTopicSearch(''); }}
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
              projects={data.developmentProjects.filter(p => p.status === 'active')}
              topicsInPlan={topicsInPlan}
              fsrsDueTopicIds={fsrsDueTopicIds}
              onAdd={handleAddTask}
              onAddProject={handleAddProjectTask}
              onCancel={() => setShowAddTask(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddTask(true)}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/50 font-mono transition-colors"
            >
              <Plus size={16} />
              Добави задача
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {!startEmpty && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 font-mono transition-colors"
              >
                <RotateCcw size={16} />
                Нулирай
              </button>
            )}
            {onRequestAiReview && editedPlan.length > 0 && (
              <button
                onClick={() => onRequestAiReview(editedPlan)}
                disabled={isLoadingAiReview}
                className="flex items-center gap-2 px-4 py-2 text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-500/50 rounded-lg font-mono transition-colors text-sm disabled:opacity-50"
              >
                {isLoadingAiReview ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                AI: Допълни
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={editedPlan.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50"
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
  projects,
  topicsInPlan,
  fsrsDueTopicIds,
  onAdd,
  onAddProject,
  onCancel
}: {
  subjects: Subject[];
  projects: DevelopmentProject[];
  topicsInPlan: Set<string>;
  fsrsDueTopicIds: Set<string>;
  onAdd: (subject: Subject, topics: Topic[], description?: string) => void;
  onAddProject: (project: DevelopmentProject, description?: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'subject' | 'project'>('subject');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [taskDescription, setTaskDescription] = useState('');
  const [newTaskSearch, setNewTaskSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<DevelopmentProject | null>(null);
  const [projectDescription, setProjectDescription] = useState('');

  const availableTopics = useMemo(() => {
    if (!selectedSubject) return [];
    return selectedSubject.topics.filter(t => !topicsInPlan.has(t.id));
  }, [selectedSubject, topicsInPlan]);

  const filteredTopics = useMemo(() => {
    const query = newTaskSearch.toLowerCase().trim();
    const filtered = query
      ? availableTopics.filter(t =>
          t.name.toLowerCase().includes(query) || String(t.number).includes(query)
        )
      : availableTopics;
    // Sort: due for review first, then by topic number
    return [...filtered].sort((a, b) => {
      const aDue = fsrsDueTopicIds.has(a.id) ? 0 : 1;
      const bDue = fsrsDueTopicIds.has(b.id) ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return a.number - b.number;
    });
  }, [availableTopics, newTaskSearch, fsrsDueTopicIds]);

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
    onAdd(selectedSubject, topics, taskDescription.trim() || undefined);
  };

  const handleAddProject = () => {
    if (!selectedProject) return;
    onAddProject(selectedProject, projectDescription.trim() || undefined);
  };

  return (
    <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-4">
      <div className="text-sm font-semibold text-slate-200 font-mono">Добави нова задача</div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('subject')}
          className={`flex-1 py-2 rounded-lg font-mono text-xs transition-all ${
            mode === 'subject'
              ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
              : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
          }`}
        >
          📚 Предмет
        </button>
        {projects.length > 0 && (
          <button
            onClick={() => setMode('project')}
            className={`flex-1 py-2 rounded-lg font-mono text-xs transition-all ${
              mode === 'project'
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            🚀 Проект
          </button>
        )}
      </div>

      {mode === 'subject' ? (
        <>
          {/* Subject Selection */}
          <div>
            <label className="text-xs text-slate-500 font-mono block mb-2">Избери предмет:</label>
            <div className="flex flex-wrap gap-2">
              {subjects.map(subject => (
                <button
                  key={subject.id}
                  onClick={() => { setSelectedSubject(subject); setSelectedTopics(new Set()); setNewTaskSearch(''); }}
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
              {(() => {
                const dueCount = availableTopics.filter(t => fsrsDueTopicIds.has(t.id)).length;
                return (
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-500 font-mono">
                      Избери теми ({selectedTopics.size} избрани):
                    </label>
                    {dueCount > 0 && (
                      <button
                        onClick={() => {
                          const dueIds = availableTopics.filter(t => fsrsDueTopicIds.has(t.id)).map(t => t.id);
                          setSelectedTopics(prev => {
                            const next = new Set(prev);
                            for (const id of dueIds) next.add(id);
                            return next;
                          });
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded transition-colors"
                      >
                        <RefreshCw size={10} />
                        Избери {dueCount} за преговор
                      </button>
                    )}
                  </div>
                );
              })()}
              {availableTopics.length > 5 && (
                <input
                  type="text"
                  placeholder="Търси тема..."
                  value={newTaskSearch}
                  onChange={e => setNewTaskSearch(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 mb-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                />
              )}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableTopics.length === 0 ? (
                  <div className="text-xs text-slate-600 font-mono text-center py-2">
                    Всички теми от този предмет са вече в плана
                  </div>
                ) : filteredTopics.length === 0 ? (
                  <div className="text-xs text-slate-600 font-mono text-center py-2">
                    Няма теми за &ldquo;{newTaskSearch}&rdquo;
                  </div>
                ) : (
                  filteredTopics.map(topic => {
                    const isDue = fsrsDueTopicIds.has(topic.id);
                    return (
                      <button
                        key={topic.id}
                        onClick={() => handleToggleTopic(topic.id)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left ${
                          selectedTopics.has(topic.id)
                            ? 'bg-cyan-500/20 border border-cyan-500/50'
                            : isDue
                            ? 'bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20'
                            : 'bg-slate-800/30 hover:bg-slate-700/50 border border-transparent'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: STATUS_CONFIG[topic.status].text }}
                        />
                        <span className="flex-1 text-xs font-mono text-slate-300 leading-relaxed" title={`#${topic.number} ${topic.name}`}>
                          #{topic.number} {topic.name}
                        </span>
                        {isDue && !selectedTopics.has(topic.id) && (
                          <span className="text-[9px] font-mono text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">
                            🔄 due
                          </span>
                        )}
                        {selectedTopics.has(topic.id) && <Check size={12} className="text-cyan-400 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Task Description */}
          {selectedTopics.size > 0 && (
            <div>
              <label className="text-xs text-slate-500 font-mono block mb-2">
                Какво ще правиш с тях? (по избор):
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="напр. прочети, направи quiz, преговори, резюме..."
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none"
                rows={2}
              />
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
        </>
      ) : (
        <>
          {/* Project Selection */}
          <div>
            <label className="text-xs text-slate-500 font-mono block mb-2">Избери проект:</label>
            <div className="space-y-2">
              {projects.map(project => {
                const incompleteModules = project.modules.filter(m => m.status !== 'completed').length;
                const goalLabel = project.weeklyGoalMinutes
                  ? `${project.weeklyGoalMinutes >= 60 ? `${Math.round(project.weeklyGoalMinutes / 60)}ч` : `${project.weeklyGoalMinutes}м`}/седмица`
                  : null;
                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      selectedProject?.id === project.id
                        ? 'bg-cyan-500/20 border border-cyan-500/50'
                        : 'bg-slate-800/30 hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full bg-cyan-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-slate-200 truncate">{project.name}</div>
                      <div className="text-xs font-mono text-slate-500">
                        {incompleteModules > 0 && `${incompleteModules} модула`}
                        {goalLabel && (incompleteModules > 0 ? ` • ${goalLabel}` : goalLabel)}
                        {!incompleteModules && !goalLabel && (project.description || 'Без модули')}
                      </div>
                    </div>
                    {selectedProject?.id === project.id && <Check size={14} className="text-cyan-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Project Task Description */}
          {selectedProject && (
            <div>
              <label className="text-xs text-slate-500 font-mono block mb-2">
                Какво ще правиш? (по избор):
              </label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="напр. следващ модул, бележки, преговор..."
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none resize-none"
                rows={2}
              />
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
              onClick={handleAddProject}
              disabled={!selectedProject}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-mono text-sm transition-colors"
            >
              <Plus size={14} />
              Добави
            </button>
          </div>
        </>
      )}
    </div>
  );
}
