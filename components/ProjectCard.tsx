'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Check, Circle, Clock, Lightbulb, MoreVertical, Trash2, Edit2, Pause, Play, CheckCircle, Brain, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { DevelopmentProject, ProjectModule, ProjectStatus } from '@/lib/types';
import { PROJECT_TYPE_CONFIG, PROJECT_CATEGORY_CONFIG, PROJECT_PRIORITY_CONFIG } from '@/lib/constants';
import { useApp } from '@/lib/context';
import { calculateRetrievability } from '@/lib/algorithms';
import ModuleDetailModal from './modals/ModuleDetailModal';

interface ProjectCardProps {
  project: DevelopmentProject;
  onEdit: () => void;
}

export default function ProjectCard({ project, onEdit }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ProjectModule | null>(null);
  const { updateProject, updateProjectModule, deleteProject, toggleInsightApplied, deleteProjectInsight } = useApp();

  const typeConfig = PROJECT_TYPE_CONFIG[project.type];
  const categoryConfig = PROJECT_CATEGORY_CONFIG[project.category];
  const priorityConfig = PROJECT_PRIORITY_CONFIG[project.priority];

  const handleStatusChange = (newStatus: ProjectStatus) => {
    const updates: Partial<DevelopmentProject> = { status: newStatus };
    if (newStatus === 'completed') {
      updates.completedDate = new Date().toISOString();
    }
    updateProject(project.id, updates);
    setShowMenu(false);
  };

  const handleModuleToggle = (module: ProjectModule) => {
    const newStatus = module.status === 'completed' ? 'available' : 'completed';
    updateProjectModule(project.id, module.id, { status: newStatus });
  };

  const formatTimeInvested = (minutes: number) => {
    if (minutes < 60) return `${minutes}м`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`;
  };

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'active': return <Play size={12} className="text-green-400" />;
      case 'paused': return <Pause size={12} className="text-yellow-400" />;
      case 'completed': return <CheckCircle size={12} className="text-blue-400" />;
      case 'abandoned': return <Circle size={12} className="text-slate-500" />;
    }
  };

  const getStatusLabel = (status: ProjectStatus) => {
    switch (status) {
      case 'active': return 'Активен';
      case 'paused': return 'Паузиран';
      case 'completed': return 'Завършен';
      case 'abandoned': return 'Изоставен';
    }
  };

  return (
    <div className={`bg-[rgba(20,20,35,0.8)] border rounded-xl transition-all ${
      project.status === 'completed' ? 'border-blue-500/30' :
      project.status === 'paused' ? 'border-yellow-500/30' :
      'border-[#1e293b] hover:border-slate-600'
    }`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{typeConfig.icon}</span>
              <Link
                href={`/projects/${project.id}`}
                className="text-base font-semibold text-slate-100 font-mono truncate hover:text-cyan-400 transition-colors"
              >
                {project.name}
              </Link>
              <Link href={`/projects/${project.id}`} className="text-slate-500 hover:text-cyan-400 transition-colors shrink-0">
                <ExternalLink size={14} />
              </Link>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span
                className="px-2 py-0.5 text-xs rounded font-mono"
                style={{ backgroundColor: `${typeConfig.color}20`, color: typeConfig.color }}
              >
                {typeConfig.label}
              </span>
              <span
                className="px-2 py-0.5 text-xs rounded font-mono"
                style={{ backgroundColor: `${categoryConfig.color}20`, color: categoryConfig.color }}
              >
                {categoryConfig.label}
              </span>
              <span
                className="px-2 py-0.5 text-xs rounded font-mono flex items-center gap-1"
                style={{ backgroundColor: priorityConfig.bgColor, color: priorityConfig.color }}
              >
                {priorityConfig.label}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${project.progressPercent}%`,
                    backgroundColor: project.status === 'completed' ? '#3b82f6' : typeConfig.color
                  }}
                />
              </div>
              <span className="text-sm font-mono text-slate-300">{project.progressPercent}%</span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-mono">
              <span className="flex items-center gap-1">
                {getStatusIcon(project.status)}
                {getStatusLabel(project.status)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimeInvested(project.timeInvested)}
              </span>
              {project.modules.length > 0 && (
                <span>
                  {project.modules.filter(m => m.status === 'completed').length}/{project.modules.length} модула
                </span>
              )}
              {project.insights.length > 0 && (
                <span className="flex items-center gap-1">
                  <Lightbulb size={12} />
                  {project.insights.length}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                <MoreVertical size={18} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                    <button
                      onClick={() => { onEdit(); setShowMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 font-mono"
                    >
                      <Edit2 size={14} /> Редактирай
                    </button>
                    {project.status === 'active' && (
                      <button
                        onClick={() => handleStatusChange('paused')}
                        className="w-full px-3 py-2 text-left text-sm text-yellow-400 hover:bg-slate-700 flex items-center gap-2 font-mono"
                      >
                        <Pause size={14} /> Паузирай
                      </button>
                    )}
                    {project.status === 'paused' && (
                      <button
                        onClick={() => handleStatusChange('active')}
                        className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-slate-700 flex items-center gap-2 font-mono"
                      >
                        <Play size={14} /> Продължи
                      </button>
                    )}
                    {project.status !== 'completed' && (
                      <button
                        onClick={() => handleStatusChange('completed')}
                        className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-slate-700 flex items-center gap-2 font-mono"
                      >
                        <CheckCircle size={14} /> Завърши
                      </button>
                    )}
                    <div className="border-t border-slate-700 my-1" />
                    <button
                      onClick={() => { deleteProject(project.id); setShowMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2 font-mono"
                    >
                      <Trash2 size={14} /> Изтрий
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-[#1e293b] p-4 space-y-4">
          {/* Description */}
          {project.description && (
            <p className="text-sm text-slate-400 font-mono">{project.description}</p>
          )}

          {/* Modules */}
          {project.modules.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
                Модули
              </h4>
              <div className="space-y-1">
                {project.modules.sort((a, b) => a.order - b.order).map(module => {
                  const retrievability = module.fsrs ? calculateRetrievability(module.fsrs) : null;
                  const needsReview = retrievability !== null && retrievability < 0.85;

                  return (
                    <div
                      key={module.id}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                        module.status === 'completed'
                          ? 'bg-green-900/20'
                          : 'bg-slate-800/50 hover:bg-slate-700/50'
                      }`}
                    >
                      {/* Toggle checkbox */}
                      <button
                        onClick={() => handleModuleToggle(module)}
                        className="shrink-0"
                      >
                        {module.status === 'completed' ? (
                          <Check size={16} className="text-green-400" />
                        ) : (
                          <Circle size={16} className="text-slate-500 hover:text-slate-400" />
                        )}
                      </button>

                      {/* Module title - clickable to open modal */}
                      <button
                        onClick={() => setSelectedModule(module)}
                        className={`flex-1 text-left text-sm font-mono truncate ${
                          module.status === 'completed' ? 'text-green-300' : 'text-slate-300 hover:text-cyan-400'
                        }`}
                      >
                        {module.title}
                      </button>

                      {/* FSRS indicator */}
                      {retrievability !== null && (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono ${
                          needsReview ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          <Brain size={12} />
                          {Math.round(retrievability * 100)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Insights */}
          {project.insights.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-mono">
                Инсайти ({project.insights.length})
              </h4>
              <div className="space-y-2">
                {project.insights.slice(0, 5).map(insight => (
                  <div
                    key={insight.id}
                    className={`p-2 rounded-lg text-sm font-mono ${
                      insight.applied
                        ? 'bg-purple-900/20 border border-purple-800/30'
                        : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Lightbulb size={14} className={insight.applied ? 'text-purple-400' : 'text-yellow-400'} />
                      <p className="flex-1 text-slate-300">{insight.insight}</p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleInsightApplied(project.id, insight.id)}
                          className={`p-1 rounded hover:bg-slate-700 ${
                            insight.applied ? 'text-purple-400' : 'text-slate-500'
                          }`}
                          title={insight.applied ? 'Маркирай като неприложен' : 'Маркирай като приложен'}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => deleteProjectInsight(project.id, insight.id)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400"
                          title="Изтрий"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {project.insights.length > 5 && (
                  <p className="text-xs text-slate-500 font-mono text-center">
                    + {project.insights.length - 5} още
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="flex gap-4 text-xs text-slate-500 font-mono pt-2 border-t border-slate-800">
            {project.startDate && (
              <span>Старт: {new Date(project.startDate).toLocaleDateString('bg-BG')}</span>
            )}
            {project.targetDate && (
              <span>Цел: {new Date(project.targetDate).toLocaleDateString('bg-BG')}</span>
            )}
            {project.completedDate && (
              <span className="text-blue-400">Завършен: {new Date(project.completedDate).toLocaleDateString('bg-BG')}</span>
            )}
          </div>
        </div>
      )}

      {/* Module Detail Modal */}
      {selectedModule && (
        <ModuleDetailModal
          module={selectedModule}
          project={project}
          onClose={() => setSelectedModule(null)}
        />
      )}
    </div>
  );
}
