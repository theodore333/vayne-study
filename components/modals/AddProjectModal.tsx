'use client';

import { useState, useEffect } from 'react';
import { X, Rocket, Plus, Trash2, GripVertical, Sparkles } from 'lucide-react';
import { useApp } from '@/lib/context';
import { PROJECT_TYPE_CONFIG, PROJECT_CATEGORY_CONFIG } from '@/lib/constants';
import { DevelopmentProject, ProjectType, ProjectCategory, ProjectPriority, ProjectModule, TopicSize } from '@/lib/types';
import AIProjectPlannerModal from './AIProjectPlannerModal';

interface Props {
  onClose: () => void;
  editProject?: DevelopmentProject;
}

export default function AddProjectModal({ onClose, editProject }: Props) {
  const { addProject, updateProject, addProjectModule, deleteProjectModule, updateProjectModule } = useApp();

  const [name, setName] = useState(editProject?.name || '');
  const [description, setDescription] = useState(editProject?.description || '');
  const [type, setType] = useState<ProjectType>(editProject?.type || 'course');
  const [category, setCategory] = useState<ProjectCategory>(editProject?.category || 'meta-learning');
  const [priority, setPriority] = useState<ProjectPriority>(editProject?.priority || 'medium');
  const [startDate, setStartDate] = useState(editProject?.startDate?.split('T')[0] || '');
  const [targetDate, setTargetDate] = useState(editProject?.targetDate?.split('T')[0] || '');

  // Module management (for new projects)
  const [newModules, setNewModules] = useState<Array<{ title: string; order: number }>>([]);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [showAIPlanner, setShowAIPlanner] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editProject) {
      // Update existing project
      updateProject(editProject.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        category,
        priority,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined
      });
    } else {
      // Create new project
      addProject({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        category,
        priority,
        status: 'active',
        startDate: startDate || new Date().toISOString(),
        targetDate: targetDate || undefined,
        modules: newModules.map((m, i) => ({
          id: `temp-${i}`,
          title: m.title,
          order: i + 1,
          status: 'available' as const,
          // Learning infrastructure defaults
          material: '',
          materialImages: [],
          grades: [],
          avgGrade: null,
          quizCount: 0,
          quizHistory: [],
          currentBloomLevel: 1 as const,
          lastReview: null,
          wrongAnswers: [],
          readCount: 0,
          lastRead: null,
          size: null,
          sizeSetBy: null,
          highlights: []
        }))
      });
    }

    onClose();
  };

  const addNewModule = () => {
    if (!newModuleTitle.trim()) return;
    setNewModules([...newModules, { title: newModuleTitle.trim(), order: newModules.length + 1 }]);
    setNewModuleTitle('');
  };

  const removeNewModule = (index: number) => {
    setNewModules(newModules.filter((_, i) => i !== index));
  };

  const handleAddModuleToExisting = () => {
    if (!editProject || !newModuleTitle.trim()) return;
    addProjectModule(editProject.id, {
      title: newModuleTitle.trim(),
      order: editProject.modules.length + 1,
      status: 'available',
      // Learning infrastructure defaults
      material: '',
      materialImages: [],
      grades: [],
      avgGrade: null,
      quizCount: 0,
      quizHistory: [],
      currentBloomLevel: 1,
      lastReview: null,
      wrongAnswers: [],
      readCount: 0,
      lastRead: null,
      size: null,
      sizeSetBy: null,
      highlights: []
    });
    setNewModuleTitle('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-[#1e293b] bg-[rgba(20,20,35,0.98)]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <Rocket size={20} className="text-cyan-400" />
            {editProject ? 'Редактирай проект' : 'Нов проект'}
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
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Име на проекта *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              placeholder="напр. ICANSTUDY by Justin Sung"
              autoFocus
              maxLength={100}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Кратко описание..."
              rows={2}
              maxLength={500}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono text-sm resize-none"
            />
          </div>

          {/* Type & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
                Тип
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ProjectType)}
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-cyan-500"
              >
                {Object.entries(PROJECT_TYPE_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.icon} {config.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
                Категория
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-cyan-500"
              >
                {Object.entries(PROJECT_CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Приоритет
            </label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as ProjectPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 px-3 py-2 rounded-lg font-mono text-sm transition-all ${
                    priority === p
                      ? p === 'high' ? 'bg-red-600/30 text-red-300 border border-red-500/50' :
                        p === 'medium' ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50' :
                        'bg-slate-600/30 text-slate-300 border border-slate-500/50'
                      : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-700/50'
                  }`}
                >
                  {p === 'high' ? 'Висок' : p === 'medium' ? 'Среден' : 'Нисък'}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
                Начална дата
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
                Целева дата
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Modules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300 font-mono">
                Модули / Раздели
              </label>
              <button
                type="button"
                onClick={() => setShowAIPlanner(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg transition-colors text-xs font-mono"
              >
                <Sparkles size={13} />
                AI Планер
              </button>
            </div>

            {/* Existing modules (edit mode) */}
            {editProject && editProject.modules.length > 0 && (
              <div className="space-y-1 mb-3">
                {editProject.modules.sort((a, b) => a.order - b.order).map(module => (
                  <div
                    key={module.id}
                    className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg"
                  >
                    <GripVertical size={14} className="text-slate-600" />
                    <span className="flex-1 text-sm text-slate-300 font-mono">{module.title}</span>
                    <button
                      type="button"
                      onClick={() => deleteProjectModule(editProject.id, module.id)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* New modules (create mode) */}
            {!editProject && newModules.length > 0 && (
              <div className="space-y-1 mb-3">
                {newModules.map((module, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-lg"
                  >
                    <GripVertical size={14} className="text-slate-600" />
                    <span className="flex-1 text-sm text-slate-300 font-mono">{module.title}</span>
                    <button
                      type="button"
                      onClick={() => removeNewModule(index)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add module input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                placeholder="Добави модул..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    editProject ? handleAddModuleToExisting() : addNewModule();
                  }
                }}
                className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono text-sm"
              />
              <button
                type="button"
                onClick={editProject ? handleAddModuleToExisting : addNewModule}
                disabled={!newModuleTitle.trim()}
                className="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-1">
              Натисни Enter за бързо добавяне
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editProject ? 'Запази промените' : 'Създай проект'}
          </button>
        </form>
      </div>
      {/* AI Planner Modal */}
      {showAIPlanner && (
        <AIProjectPlannerModal
          onClose={() => setShowAIPlanner(false)}
          onConfirm={(modules) => {
            if (editProject) {
              // Add to existing project
              modules.forEach((mod, i) => {
                addProjectModule(editProject.id, {
                  title: mod.title,
                  order: editProject.modules.length + i + 1,
                  status: 'available',
                  material: '',
                  materialImages: [],
                  grades: [],
                  avgGrade: null,
                  quizCount: 0,
                  quizHistory: [],
                  currentBloomLevel: 1,
                  lastReview: null,
                  wrongAnswers: [],
                  readCount: 0,
                  lastRead: null,
                  size: mod.suggestedSize,
                  sizeSetBy: 'ai',
                  highlights: []
                });
              });
            } else {
              // Add to new modules list
              setNewModules(prev => [
                ...prev,
                ...modules.map((m, i) => ({ title: m.title, order: prev.length + i + 1 }))
              ]);
            }
          }}
          projectType={type}
          existingModules={editProject
            ? editProject.modules.map(m => m.title)
            : newModules.map(m => m.title)
          }
        />
      )}
    </div>
  );
}
