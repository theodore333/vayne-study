'use client';

import React, { useState, Suspense } from 'react';
import { Rocket, Plus, Filter, Lightbulb, Search } from 'lucide-react';
import { useApp } from '@/lib/context';
import { DevelopmentProject, ProjectStatus, InsightType } from '@/lib/types';
import ProjectCard from '@/components/ProjectCard';
import AddProjectModal from '@/components/modals/AddProjectModal';

function LoadingFallback() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="animate-pulse">
        <div className="h-8 bg-slate-800 rounded w-64 mb-2"></div>
        <div className="h-4 bg-slate-800 rounded w-96 mb-8"></div>
        <div className="space-y-4">
          <div className="h-32 bg-slate-800 rounded-xl"></div>
          <div className="h-32 bg-slate-800 rounded-xl"></div>
        </div>
      </div>
    </div>
  );
}

function ProjectsContent() {
  const { data, isLoading, addProjectInsight } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProject, setEditProject] = useState<DevelopmentProject | null>(null);
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInsightModal, setShowInsightModal] = useState<string | null>(null);
  const [newInsight, setNewInsight] = useState('');
  const [insightType, setInsightType] = useState<InsightType>('principle');

  if (isLoading) {
    return <LoadingFallback />;
  }

  const projects = data.developmentProjects || [];

  // Filter projects
  const filteredProjects = projects
    .filter(p => filter === 'all' || p.status === filter)
    .filter(p => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(query) ||
             p.description?.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      // Active first, then by updated date
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const statusCounts = {
    all: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    paused: projects.filter(p => p.status === 'paused').length,
    completed: projects.filter(p => p.status === 'completed').length,
    abandoned: projects.filter(p => p.status === 'abandoned').length
  };

  const handleAddInsight = (projectId: string) => {
    if (!newInsight.trim()) return;
    addProjectInsight(projectId, {
      insight: newInsight.trim(),
      type: insightType,
      applied: false
    });
    setNewInsight('');
    setShowInsightModal(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
              <Rocket className="text-cyan-400" />
              Проекти за развитие
            </h1>
            <p className="text-sm text-slate-500 font-mono mt-1">
              Курсове, книги, умения и други проекти извън изпитите
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all font-mono text-sm"
          >
            <Plus size={18} />
            Нов проект
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Търси проект..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono text-sm"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          <Filter size={16} className="text-slate-500 mx-2" />
          {([['all', 'Всички'], ['active', 'Активни'], ['completed', 'Завършени'], ['paused', 'Паузирани']] as const).map(([status, label]) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-md font-mono text-sm transition-all ${
                filter === status
                  ? 'bg-slate-700 text-slate-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
              {statusCounts[status] > 0 && (
                <span className="ml-1 text-xs opacity-60">({statusCounts[status]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-12 text-center">
          {projects.length === 0 ? (
            <>
              <Rocket size={48} className="text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 font-mono mb-2">
                Няма проекти
              </h3>
              <p className="text-sm text-slate-500 font-mono mb-6 max-w-md mx-auto">
                Добави първия си проект за развитие - курс, книга, или умение което искаш да научиш
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg transition-colors font-mono text-sm"
              >
                <Plus size={18} />
                Създай първия проект
              </button>
            </>
          ) : (
            <>
              <Search size={48} className="text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 font-mono mb-2">
                Няма резултати
              </h3>
              <p className="text-sm text-slate-500 font-mono">
                Няма проекти, отговарящи на филтъра
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map(project => (
            <div key={project.id} className="relative">
              <ProjectCard
                project={project}
                onEdit={() => setEditProject(project)}
              />
              {/* Quick add insight button */}
              <button
                onClick={() => setShowInsightModal(project.id)}
                className="absolute top-4 right-28 p-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded-lg transition-colors"
                title="Добави инсайт"
              >
                <Lightbulb size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats summary */}
      {projects.length > 0 && (
        <div className="mt-8 p-4 bg-slate-800/30 rounded-xl">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-cyan-400 font-mono">{projects.length}</p>
              <p className="text-xs text-slate-500 font-mono">Общо проекти</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400 font-mono">
                {projects.filter(p => p.status === 'completed').length}
              </p>
              <p className="text-xs text-slate-500 font-mono">Завършени</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-400 font-mono">
                {projects.reduce((sum, p) => sum + p.insights.length, 0)}
              </p>
              <p className="text-xs text-slate-500 font-mono">Инсайти</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400 font-mono">
                {Math.round(projects.reduce((sum, p) => sum + p.timeInvested, 0) / 60)}ч
              </p>
              <p className="text-xs text-slate-500 font-mono">Инвестирано време</p>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Project Modal */}
      {(showAddModal || editProject) && (
        <AddProjectModal
          onClose={() => {
            setShowAddModal(false);
            setEditProject(null);
          }}
          editProject={editProject || undefined}
        />
      )}

      {/* Quick Add Insight Modal */}
      {showInsightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowInsightModal(null)}
          />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
              <h3 className="text-base font-semibold text-slate-100 font-mono flex items-center gap-2">
                <Lightbulb size={18} className="text-yellow-400" />
                Нов инсайт
              </h3>
              <button
                onClick={() => setShowInsightModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
              >
                <span className="text-lg">&times;</span>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-mono">Тип</label>
                <div className="flex gap-2">
                  {(['principle', 'technique', 'mindset', 'fact'] as InsightType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setInsightType(t)}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${
                        insightType === t
                          ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {t === 'principle' ? 'Принцип' :
                       t === 'technique' ? 'Техника' :
                       t === 'mindset' ? 'Mindset' : 'Факт'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-mono">Инсайт</label>
                <textarea
                  value={newInsight}
                  onChange={(e) => setNewInsight(e.target.value)}
                  placeholder="Какво научих..."
                  rows={3}
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-yellow-500 font-mono text-sm resize-none"
                />
              </div>
              <button
                onClick={() => handleAddInsight(showInsightModal)}
                disabled={!newInsight.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-semibold rounded-lg transition-all font-mono text-sm disabled:opacity-50"
              >
                Добави инсайт
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ProjectsContent />
    </Suspense>
  );
}
