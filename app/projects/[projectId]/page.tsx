'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft, Play, Brain, Star, Zap, BookOpen, Save, AlertCircle,
  Lightbulb, Plus, Trash2, Check, X, ChevronDown, ChevronUp,
  Sparkles, Edit2, MoreVertical, Pause, CheckCircle, Lock
} from 'lucide-react';
import { useApp } from '@/lib/context';
import { ProjectModule, ModuleStatus, TopicSize, BLOOM_LEVELS, TextHighlight, DevelopmentProject, ProjectStatus, InsightType } from '@/lib/types';
import { calculateRetrievability, getDaysUntilReview } from '@/lib/algorithms';
import { TOPIC_SIZE_CONFIG } from '@/lib/constants';
import { PROJECT_TYPE_CONFIG, PROJECT_CATEGORY_CONFIG, PROJECT_PRIORITY_CONFIG } from '@/lib/constants';
import { setMaterial as saveMaterialToStorage } from '@/lib/storage';
import KanbanBoard from '@/components/KanbanBoard';
import ReaderMode from '@/components/ReaderMode';
import AIProjectPlannerModal from '@/components/modals/AIProjectPlannerModal';

const MaterialEditor = dynamic(() => import('@/components/MaterialEditor'), {
  ssr: false,
  loading: () => <div className="h-40 bg-slate-800/50 rounded-lg animate-pulse" />,
});

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const {
    data, isLoading,
    updateProject, deleteProject,
    updateProjectModule, addProjectModule, deleteProjectModule,
    updateModuleMaterial, trackModuleRead, updateModuleSize,
    updateModuleHighlights,
    addProjectInsight, toggleInsightApplied, deleteProjectInsight,
  } = useApp();

  const project = data.developmentProjects.find(p => p.id === projectId);

  // Selected module state
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [material, setMaterial] = useState('');
  const [materialSaved, setMaterialSaved] = useState(true);
  const [showReaderMode, setShowReaderMode] = useState(false);

  // Project actions
  const [showMenu, setShowMenu] = useState(false);
  const [showAIPlanner, setShowAIPlanner] = useState(false);

  // Insight add
  const [showInsightForm, setShowInsightForm] = useState(false);
  const [newInsight, setNewInsight] = useState('');
  const [insightType, setInsightType] = useState<InsightType>('principle');

  const selectedModule = project?.modules.find(m => m.id === selectedModuleId) || null;

  // Load material when module changes
  useEffect(() => {
    if (selectedModule) {
      let loadedMaterial = selectedModule.material || '';
      try {
        const key = `material-module-${selectedModule.id}`;
        const directSaved = localStorage.getItem(key);
        if (directSaved && directSaved.length > 0) {
          loadedMaterial = directSaved;
        }
      } catch {}
      setMaterial(loadedMaterial);
      setMaterialSaved(true);
    }
  }, [selectedModule?.id, selectedModule?.material]);

  // Sync material to context periodically
  const contextSyncRef = useRef(false);
  const materialRef = useRef(material);
  materialRef.current = material;

  useEffect(() => {
    if (!selectedModuleId || !projectId) return;
    const interval = setInterval(() => {
      if (contextSyncRef.current) {
        updateModuleMaterial(projectId, selectedModuleId, materialRef.current);
        contextSyncRef.current = false;
      }
    }, 10000);
    return () => {
      clearInterval(interval);
      if (contextSyncRef.current && selectedModuleId) {
        updateModuleMaterial(projectId, selectedModuleId, materialRef.current);
      }
    };
  }, [projectId, selectedModuleId, updateModuleMaterial]);

  const handleMaterialChange = useCallback((newMaterial: string) => {
    setMaterial(newMaterial);
    setMaterialSaved(false);
    try {
      if (selectedModuleId) {
        localStorage.setItem(`material-module-${selectedModuleId}`, newMaterial);
      }
    } catch {}
    contextSyncRef.current = true;
  }, [selectedModuleId]);

  const handleSaveMaterial = () => {
    if (!selectedModuleId) return;
    updateModuleMaterial(projectId, selectedModuleId, material);
    // Also save to storage layer (IDB + localStorage)
    saveMaterialToStorage(`module-${selectedModuleId}`, material);
    setMaterialSaved(true);
    contextSyncRef.current = false;
  };

  const handleSaveMaterialFromReader = useCallback((newMaterial: string) => {
    setMaterial(newMaterial);
    if (selectedModuleId) {
      saveMaterialToStorage(`module-${selectedModuleId}`, newMaterial);
      try { localStorage.setItem(`material-module-${selectedModuleId}`, newMaterial); } catch {}
      contextSyncRef.current = true;
    }
  }, [selectedModuleId]);

  const handleModuleClick = (mod: ProjectModule) => {
    // Save current material first if needed
    if (contextSyncRef.current && selectedModuleId) {
      updateModuleMaterial(projectId, selectedModuleId, materialRef.current);
      contextSyncRef.current = false;
    }
    setSelectedModuleId(mod.id);
  };

  const handleModuleStatusChange = (moduleId: string, newStatus: ModuleStatus) => {
    updateProjectModule(projectId, moduleId, { status: newStatus });
  };

  const handleStatusChange = (newStatus: ProjectStatus) => {
    const updates: Partial<DevelopmentProject> = { status: newStatus };
    if (newStatus === 'completed') updates.completedDate = new Date().toISOString();
    updateProject(projectId, updates);
    setShowMenu(false);
  };

  const handleDelete = () => {
    if (confirm('Сигурен ли си, че искаш да изтриеш проекта?')) {
      deleteProject(projectId);
      router.push('/projects');
    }
  };

  const handleAIModules = (modules: Array<{ title: string; suggestedSize: TopicSize }>) => {
    modules.forEach((mod, i) => {
      addProjectModule(projectId, {
        title: mod.title,
        order: (project?.modules.length || 0) + i + 1,
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
  };

  const handleAddInsight = () => {
    if (!newInsight.trim()) return;
    addProjectInsight(projectId, {
      insight: newInsight.trim(),
      type: insightType,
      applied: false,
      moduleId: selectedModuleId || undefined
    });
    setNewInsight('');
    setShowInsightForm(false);
  };

  // Construct a Topic-compatible object for ReaderMode
  const topicForReader = selectedModule ? {
    id: selectedModule.id,
    number: selectedModule.order,
    name: selectedModule.title,
    status: 'green' as const,
    lastReview: selectedModule.lastReview,
    grades: selectedModule.grades,
    avgGrade: selectedModule.avgGrade,
    quizCount: selectedModule.quizCount,
    material,
    materialImages: selectedModule.materialImages,
    currentBloomLevel: selectedModule.currentBloomLevel,
    quizHistory: selectedModule.quizHistory,
    readCount: selectedModule.readCount,
    lastRead: selectedModule.lastRead,
    size: selectedModule.size,
    sizeSetBy: selectedModule.sizeSetBy,
    wrongAnswers: selectedModule.wrongAnswers,
    highlights: selectedModule.highlights || [],
    fsrs: selectedModule.fsrs,
  } : null;

  const handleSaveHighlights = (highlights: TextHighlight[]) => {
    if (selectedModuleId) {
      updateModuleHighlights(projectId, selectedModuleId, highlights);
    }
  };

  const openReaderMode = () => {
    if (!selectedModule?.material && !material.trim()) return;
    if (selectedModuleId) trackModuleRead(projectId, selectedModuleId);
    setShowReaderMode(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <h2 className="text-xl font-bold text-slate-300 font-mono mb-4">Проектът не е намерен</h2>
        <Link href="/projects" className="text-cyan-400 hover:text-cyan-300 font-mono text-sm">
          Обратно към проекти
        </Link>
      </div>
    );
  }

  const typeConfig = PROJECT_TYPE_CONFIG[project.type];
  const hasMaterial = material.trim().length > 0;
  const bloomInfo = selectedModule
    ? (BLOOM_LEVELS[(selectedModule.currentBloomLevel || 1) - 1] || BLOOM_LEVELS[0])
    : null;
  const retrievability = selectedModule?.fsrs ? calculateRetrievability(selectedModule.fsrs) : null;
  const daysUntilReview = selectedModule?.fsrs ? getDaysUntilReview(selectedModule.fsrs) : null;

  return (
    <>
      {/* Reader Mode Overlay */}
      {showReaderMode && topicForReader && (
        <ReaderMode
          topic={topicForReader}
          subjectName={project.name}
          onClose={() => setShowReaderMode(false)}
          onSaveHighlights={handleSaveHighlights}
          onSaveMaterial={handleSaveMaterialFromReader}
        />
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/projects"
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm mb-3 w-fit"
          >
            <ArrowLeft size={16} />
            Проекти
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{typeConfig.icon}</span>
                <h1 className="text-2xl font-bold text-slate-100 font-mono truncate">
                  {project.name}
                </h1>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <p className="text-sm text-slate-400 font-mono mb-3">{project.description}</p>
              )}
              {/* Progress bar */}
              <div className="flex items-center gap-3 max-w-md">
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${project.progressPercent}%`, backgroundColor: typeConfig.color }}
                  />
                </div>
                <span className="text-sm font-mono text-slate-300">{project.progressPercent}%</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAIPlanner(true)}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg transition-colors font-mono text-sm"
              >
                <Sparkles size={16} />
                AI Планер
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"
                >
                  <MoreVertical size={18} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                      {project.status === 'active' && (
                        <button onClick={() => handleStatusChange('paused')} className="w-full px-3 py-2 text-left text-sm text-yellow-400 hover:bg-slate-700 flex items-center gap-2 font-mono">
                          <Pause size={14} /> Паузирай
                        </button>
                      )}
                      {project.status === 'paused' && (
                        <button onClick={() => handleStatusChange('active')} className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-slate-700 flex items-center gap-2 font-mono">
                          <Play size={14} /> Продължи
                        </button>
                      )}
                      {project.status !== 'completed' && (
                        <button onClick={() => handleStatusChange('completed')} className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-slate-700 flex items-center gap-2 font-mono">
                          <CheckCircle size={14} /> Завърши
                        </button>
                      )}
                      <div className="border-t border-slate-700 my-1" />
                      <button onClick={handleDelete} className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2 font-mono">
                        <Trash2 size={14} /> Изтрий
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
            Модули ({project.modules.length})
          </h2>
          {project.modules.length > 0 ? (
            <KanbanBoard
              modules={project.modules}
              onModuleClick={handleModuleClick}
              onModuleStatusChange={handleModuleStatusChange}
            />
          ) : (
            <div className="bg-slate-800/20 border border-[#1e293b] rounded-xl p-8 text-center">
              <BookOpen size={32} className="text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-mono mb-4">Няма модули. Добави ръчно или използвай AI Планер.</p>
              <button
                onClick={() => setShowAIPlanner(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg transition-colors font-mono text-sm"
              >
                <Sparkles size={16} />
                AI Планер
              </button>
            </div>
          )}
        </div>

        {/* Two-column layout: Module Detail + Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Module Detail Panel */}
          <div className="lg:col-span-2">
            {selectedModule ? (
              <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
                {/* Module header */}
                <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <ModuleStatusIcon status={selectedModule.status} />
                    <h3 className="text-base font-semibold text-slate-100 font-mono truncate">
                      {selectedModule.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasMaterial && (
                      <button
                        onClick={openReaderMode}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors font-mono text-xs"
                      >
                        <BookOpen size={14} />
                        Четене
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!hasMaterial) { alert('Добави материал преди тест'); return; }
                        router.push(`/quiz?project=${projectId}&module=${selectedModule.id}`);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                        hasMaterial
                          ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-400'
                          : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Play size={14} />
                      Тест
                    </button>
                    <button
                      onClick={() => { setSelectedModuleId(null); setMaterial(''); }}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Module content */}
                <div className="p-4 space-y-4">
                  {/* FSRS + Bloom + Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Bloom Level */}
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                      <Zap size={14} className="text-amber-400 mx-auto mb-1" />
                      <div className="text-sm font-medium text-slate-300 font-mono">
                        {bloomInfo?.name || 'Запомняне'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Ниво {selectedModule.currentBloomLevel || 1}
                      </div>
                    </div>

                    {/* FSRS Memory */}
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                      <Brain size={14} className="text-purple-400 mx-auto mb-1" />
                      {retrievability !== null ? (
                        <>
                          <div className={`text-sm font-bold font-mono ${
                            retrievability >= 0.85 ? 'text-green-400' :
                            retrievability >= 0.6 ? 'text-yellow-400' :
                            'text-orange-400'
                          }`}>
                            {Math.round(retrievability * 100)}%
                          </div>
                          <div className="text-xs text-slate-500 font-mono">Памет</div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-slate-500 font-mono">---</div>
                          <div className="text-xs text-slate-500 font-mono">Няма данни</div>
                        </>
                      )}
                    </div>

                    {/* Quiz count */}
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                      <Star size={14} className="text-yellow-400 mx-auto mb-1" />
                      <div className="text-sm font-bold text-slate-300 font-mono">
                        {selectedModule.avgGrade?.toFixed(1) || '---'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {selectedModule.quizCount} теста
                      </div>
                    </div>

                    {/* Review countdown */}
                    <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                      <BookOpen size={14} className="text-cyan-400 mx-auto mb-1" />
                      <div className="text-sm font-bold text-slate-300 font-mono">
                        {daysUntilReview !== null
                          ? daysUntilReview === 0 ? 'Сега!' : `${daysUntilReview}д`
                          : '---'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">До преговор</div>
                    </div>
                  </div>

                  {/* Size selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">Размер:</span>
                    {(['small', 'medium', 'large'] as TopicSize[]).map(size => (
                      <button
                        key={size}
                        onClick={() => updateModuleSize(projectId, selectedModule.id, size, 'user')}
                        className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                          selectedModule.size === size
                            ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                            : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {TOPIC_SIZE_CONFIG[size].label}
                      </button>
                    ))}
                  </div>

                  {/* Material Editor */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider font-mono">
                        Материал
                      </h4>
                      {!materialSaved && (
                        <button
                          onClick={handleSaveMaterial}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 transition-colors font-mono"
                        >
                          <Save size={12} />
                          Запази
                        </button>
                      )}
                    </div>
                    <MaterialEditor
                      value={material}
                      onChange={handleMaterialChange}
                      placeholder="Добави бележки, ключови концепции, или съдържание на модула..."
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-500 font-mono">
                        {material.length} символа
                        {selectedModule.readCount > 0 && ` | Прочетен ${selectedModule.readCount}x`}
                      </span>
                      {!materialSaved && (
                        <button
                          onClick={handleSaveMaterial}
                          className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                        >
                          Запази (Ctrl+S)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Grade history */}
                  {selectedModule.grades && selectedModule.grades.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 font-mono">
                        Оценки ({selectedModule.grades.length})
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedModule.grades.map((grade, i) => (
                          <span
                            key={i}
                            className={`px-2 py-1 rounded text-xs font-medium font-mono ${
                              grade >= 5 ? 'bg-green-500/20 text-green-400' :
                              grade >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {grade}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Wrong answers */}
                  {selectedModule.wrongAnswers && selectedModule.wrongAnswers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
                        <AlertCircle size={12} className="text-red-400" />
                        Слаби места ({selectedModule.wrongAnswers.length})
                      </h4>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {selectedModule.wrongAnswers.slice(0, 5).map((wa, i) => (
                          <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs">
                            <div className="text-red-300 font-medium font-mono line-clamp-1">{wa.question}</div>
                            <div className="text-slate-500 font-mono mt-1">Концепция: {wa.concept}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Module actions */}
                  <div className="flex gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        const newStatus: ModuleStatus = selectedModule.status === 'completed' ? 'available' : 'completed';
                        updateProjectModule(projectId, selectedModule.id, { status: newStatus });
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-mono transition-all ${
                        selectedModule.status === 'completed'
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      }`}
                    >
                      {selectedModule.status === 'completed' ? 'Маркирай като незавършен' : 'Маркирай като завършен'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Изтрий модула?')) {
                          deleteProjectModule(projectId, selectedModule.id);
                          setSelectedModuleId(null);
                        }
                      }}
                      className="px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-12 text-center">
                <BookOpen size={32} className="text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500 font-mono">
                  Кликни на модул от дъската за да го отвориш тук
                </p>
              </div>
            )}
          </div>

          {/* Insights Panel */}
          <div className="lg:col-span-1">
            <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
              <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Lightbulb size={14} className="text-yellow-400" />
                  Инсайти ({project.insights.length})
                </h3>
                <button
                  onClick={() => setShowInsightForm(!showInsightForm)}
                  className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-yellow-400 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
                {/* Add insight form */}
                {showInsightForm && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
                    <div className="flex gap-1">
                      {(['principle', 'technique', 'mindset', 'fact'] as InsightType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => setInsightType(t)}
                          className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                            insightType === t
                              ? 'bg-yellow-600/30 text-yellow-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {t === 'principle' ? 'Принцип' :
                           t === 'technique' ? 'Техника' :
                           t === 'mindset' ? 'Mindset' : 'Факт'}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={newInsight}
                      onChange={(e) => setNewInsight(e.target.value)}
                      placeholder="Какво научих..."
                      rows={2}
                      autoFocus
                      className="w-full px-2 py-1.5 bg-slate-800/50 border border-slate-700 rounded text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-yellow-500 font-mono resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddInsight}
                        disabled={!newInsight.trim()}
                        className="flex-1 py-1.5 bg-yellow-600/30 hover:bg-yellow-600/40 text-yellow-400 rounded text-xs font-mono disabled:opacity-50 transition-colors"
                      >
                        Добави
                      </button>
                      <button
                        onClick={() => { setShowInsightForm(false); setNewInsight(''); }}
                        className="px-3 py-1.5 bg-slate-700 text-slate-400 rounded text-xs font-mono"
                      >
                        Отказ
                      </button>
                    </div>
                  </div>
                )}

                {/* Insights list */}
                {project.insights.length === 0 && !showInsightForm && (
                  <p className="text-xs text-slate-600 font-mono text-center py-4">
                    Няма инсайти
                  </p>
                )}
                {project.insights.map(insight => (
                  <div
                    key={insight.id}
                    className={`p-2.5 rounded-lg text-sm font-mono ${
                      insight.applied
                        ? 'bg-purple-900/20 border border-purple-800/30'
                        : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Lightbulb size={12} className={`mt-0.5 shrink-0 ${insight.applied ? 'text-purple-400' : 'text-yellow-400'}`} />
                      <p className="flex-1 text-slate-300 text-xs">{insight.insight}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-slate-600 font-mono">
                        {insight.type === 'principle' ? 'Принцип' :
                         insight.type === 'technique' ? 'Техника' :
                         insight.type === 'mindset' ? 'Mindset' : 'Факт'}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleInsightApplied(projectId, insight.id)}
                          className={`p-1 rounded hover:bg-slate-700 ${
                            insight.applied ? 'text-purple-400' : 'text-slate-500'
                          }`}
                          title={insight.applied ? 'Неприложен' : 'Приложен'}
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => deleteProjectInsight(projectId, insight.id)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Planner Modal */}
      {showAIPlanner && (
        <AIProjectPlannerModal
          onClose={() => setShowAIPlanner(false)}
          onConfirm={handleAIModules}
          projectType={project.type}
          existingModules={project.modules.map(m => m.title)}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = {
    active: { label: 'Активен', bg: 'bg-green-500/20', text: 'text-green-400' },
    paused: { label: 'Паузиран', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    completed: { label: 'Завършен', bg: 'bg-blue-500/20', text: 'text-blue-400' },
    abandoned: { label: 'Изоставен', bg: 'bg-slate-500/20', text: 'text-slate-400' },
  };
  const c = config[status];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function ModuleStatusIcon({ status }: { status: ModuleStatus }) {
  switch (status) {
    case 'locked': return <Lock size={16} className="text-slate-500" />;
    case 'available': return <BookOpen size={16} className="text-blue-400" />;
    case 'in_progress': return <Play size={16} className="text-yellow-400" />;
    case 'completed': return <CheckCircle size={16} className="text-green-400" />;
  }
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    }>
      <ProjectDetailContent />
    </Suspense>
  );
}
