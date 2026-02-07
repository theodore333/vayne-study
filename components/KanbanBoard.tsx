'use client';

import React, { useState } from 'react';
import { Brain, Star, Play, Lock, BookOpen, CheckCircle, GripVertical } from 'lucide-react';
import { ProjectModule, ModuleStatus, BLOOM_LEVELS } from '@/lib/types';
import { calculateRetrievability } from '@/lib/algorithms';

interface KanbanBoardProps {
  modules: ProjectModule[];
  onModuleClick: (module: ProjectModule) => void;
  onModuleStatusChange: (moduleId: string, newStatus: ModuleStatus) => void;
}

const COLUMNS: { status: ModuleStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { status: 'locked', label: 'Заключен', icon: <Lock size={14} />, color: '#64748b' },
  { status: 'available', label: 'Наличен', icon: <BookOpen size={14} />, color: '#3b82f6' },
  { status: 'in_progress', label: 'В процес', icon: <Play size={14} />, color: '#f59e0b' },
  { status: 'completed', label: 'Завършен', icon: <CheckCircle size={14} />, color: '#22c55e' },
];

export default function KanbanBoard({ modules, onModuleClick, onModuleStatusChange }: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<ModuleStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, moduleId: string) => {
    e.dataTransfer.setData('text/plain', moduleId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(moduleId);
  };

  const handleDragOver = (e: React.DragEvent, status: ModuleStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: ModuleStatus) => {
    e.preventDefault();
    const moduleId = e.dataTransfer.getData('text/plain');
    if (moduleId) {
      onModuleStatusChange(moduleId, newStatus);
    }
    setDragOverColumn(null);
    setDraggingId(null);
  };

  const handleDragEnd = () => {
    setDragOverColumn(null);
    setDraggingId(null);
  };

  return (
    <div className="grid grid-cols-4 gap-3 min-h-[200px]">
      {COLUMNS.map(col => {
        const columnModules = modules
          .filter(m => m.status === col.status)
          .sort((a, b) => a.order - b.order);
        const isOver = dragOverColumn === col.status;

        return (
          <div
            key={col.status}
            className={`rounded-xl border transition-all ${
              isOver
                ? 'border-cyan-500/50 bg-cyan-500/5'
                : 'border-[#1e293b] bg-slate-800/20'
            }`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1e293b]">
              <span style={{ color: col.color }}>{col.icon}</span>
              <span className="text-xs font-medium font-mono" style={{ color: col.color }}>
                {col.label}
              </span>
              <span className="ml-auto text-xs text-slate-600 font-mono">
                {columnModules.length}
              </span>
            </div>

            {/* Module cards */}
            <div className="p-2 space-y-2 min-h-[100px]">
              {columnModules.map(mod => (
                <ModuleCard
                  key={mod.id}
                  module={mod}
                  isDragging={draggingId === mod.id}
                  onClick={() => onModuleClick(mod)}
                  onDragStart={(e) => handleDragStart(e, mod.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
              {columnModules.length === 0 && (
                <div className="text-xs text-slate-600 font-mono text-center py-4">
                  {isOver ? 'Пусни тук' : 'Няма модули'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModuleCard({
  module,
  isDragging,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  module: ProjectModule;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const retrievability = module.fsrs ? calculateRetrievability(module.fsrs) : null;
  const bloomInfo = BLOOM_LEVELS[(module.currentBloomLevel || 1) - 1] || BLOOM_LEVELS[0];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group p-2.5 rounded-lg border cursor-pointer transition-all ${
        isDragging
          ? 'opacity-40 border-cyan-500/50'
          : 'border-slate-700/50 hover:border-slate-600 bg-[rgba(20,20,35,0.6)] hover:bg-[rgba(20,20,35,0.8)]'
      }`}
    >
      {/* Title with drag handle */}
      <div className="flex items-start gap-1.5">
        <GripVertical size={14} className="text-slate-600 opacity-0 group-hover:opacity-100 mt-0.5 shrink-0 cursor-grab" />
        <span className="text-sm font-mono text-slate-300 line-clamp-2 flex-1">
          {module.title}
        </span>
      </div>

      {/* Indicators row */}
      <div className="flex items-center gap-2 mt-2">
        {/* FSRS dot */}
        {retrievability !== null && (
          <div className="flex items-center gap-1" title={`Памет: ${Math.round(retrievability * 100)}%`}>
            <Brain size={11} className={
              retrievability >= 0.85 ? 'text-green-400' :
              retrievability >= 0.6 ? 'text-yellow-400' :
              'text-orange-400'
            } />
            <span className="text-[10px] font-mono text-slate-500">{Math.round(retrievability * 100)}%</span>
          </div>
        )}

        {/* Bloom badge */}
        {(module.currentBloomLevel || 1) > 1 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            B{module.currentBloomLevel}
          </span>
        )}

        {/* Avg grade */}
        {module.avgGrade && (
          <div className="flex items-center gap-0.5 ml-auto">
            <Star size={10} className="text-yellow-400" />
            <span className="text-[10px] font-mono text-slate-400">{module.avgGrade.toFixed(1)}</span>
          </div>
        )}

        {/* Material indicator */}
        {module.material && (
          <span className="ml-auto" title="Има материал">
            <BookOpen size={10} className="text-slate-500" />
          </span>
        )}
      </div>
    </div>
  );
}
