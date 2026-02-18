'use client';

import { useState, useEffect } from 'react';
import { X, Save, Brain, BookOpen, Star, AlertCircle, Zap, ChevronRight, Play } from 'lucide-react';
import { ProjectModule, DevelopmentProject, TopicSize, BLOOM_LEVELS } from '@/lib/types';
import { useApp } from '@/lib/context';
import { calculateRetrievability, getDaysUntilReview } from '@/lib/algorithms';
import { TOPIC_SIZE_CONFIG } from '@/lib/constants';
import { useRouter } from 'next/navigation';

interface Props {
  module: ProjectModule;
  project: DevelopmentProject;
  onClose: () => void;
}

const MODULE_STATUS_CONFIG = {
  locked: { label: 'Заключен', color: '#64748b', emoji: '🔒' },
  available: { label: 'Наличен', color: '#3b82f6', emoji: '📘' },
  in_progress: { label: 'В процес', color: '#f59e0b', emoji: '📖' },
  completed: { label: 'Завършен', color: '#22c55e', emoji: '✅' }
};

export default function ModuleDetailModal({ module, project, onClose }: Props) {
  const router = useRouter();
  const {
    updateProjectModule,
    updateModuleMaterial,
    trackModuleRead,
    updateModuleSize,
    deleteProjectModule
  } = useApp();

  const [material, setMaterial] = useState(module.material || '');
  const [isSaved, setIsSaved] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [gradeInput, setGradeInput] = useState<number | null>(null);

  useEffect(() => {
    setMaterial(module.material || '');
    setIsSaved(true);
  }, [module.id, module.material]);

  const handleSave = () => {
    updateModuleMaterial(project.id, module.id, material);
    setIsSaved(true);
  };

  const handleStatusChange = (status: ProjectModule['status']) => {
    updateProjectModule(project.id, module.id, { status });
  };

  const handleSizeChange = (size: TopicSize | null) => {
    updateModuleSize(project.id, module.id, size, 'user');
  };

  const handleDelete = () => {
    deleteProjectModule(project.id, module.id);
    onClose();
  };

  const handleStartQuiz = (quizMode?: string) => {
    if (!material.trim()) {
      alert('Добави материал преди да стартираш тест');
      return;
    }
    const base = `/quiz?project=${project.id}&module=${module.id}`;
    router.push(quizMode ? `${base}&mode=${quizMode}` : base);
    onClose();
  };

  // FSRS calculations
  const retrievability = module.fsrs ? calculateRetrievability(module.fsrs) : null;
  const daysUntilReview = module.fsrs ? getDaysUntilReview(module.fsrs) : null;

  // Bloom level info (array index is level - 1)
  const bloomInfo = BLOOM_LEVELS[(module.currentBloomLevel || 1) - 1] || BLOOM_LEVELS[0];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:right-4 md:top-4 md:bottom-4 md:w-[500px] bg-[rgba(15,15,25,0.98)] border border-[#1e293b] rounded-2xl z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#1e293b] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                  {project.name}
                </span>
                <span className="text-lg">{MODULE_STATUS_CONFIG[module.status].emoji}</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-100 line-clamp-2">
                {module.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Status selector */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Статус</h3>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(MODULE_STATUS_CONFIG) as Array<keyof typeof MODULE_STATUS_CONFIG>).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    module.status === status
                      ? 'ring-2 ring-offset-2 ring-offset-[#0f0f19]'
                      : 'hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: `${MODULE_STATUS_CONFIG[status].color}20`,
                    color: MODULE_STATUS_CONFIG[status].color,
                    ...(module.status === status ? { ringColor: MODULE_STATUS_CONFIG[status].color } : {})
                  }}
                >
                  {MODULE_STATUS_CONFIG[status].emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Size selector */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Размер</h3>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as TopicSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handleSizeChange(size)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    module.size === size
                      ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {TOPIC_SIZE_CONFIG[size].label} ({TOPIC_SIZE_CONFIG[size].minutes}м)
                </button>
              ))}
            </div>
          </div>

          {/* FSRS Memory Indicator */}
          {module.fsrs && retrievability !== null && (
            <div className="bg-slate-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={16} className="text-purple-400" />
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Памет (FSRS)</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${
                    retrievability >= 0.9 ? 'text-green-400' :
                    retrievability >= 0.7 ? 'text-yellow-400' :
                    'text-orange-400'
                  }`}>
                    {Math.round(retrievability * 100)}%
                  </div>
                  <div className="text-xs text-slate-500">Запаметяване</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-300">
                    {Math.round(module.fsrs.stability)}д
                  </div>
                  <div className="text-xs text-slate-500">Стабилност</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${
                    daysUntilReview === 0 ? 'text-red-400' :
                    daysUntilReview! <= 2 ? 'text-orange-400' :
                    'text-green-400'
                  }`}>
                    {daysUntilReview === 0 ? 'Сега!' : `${daysUntilReview}д`}
                  </div>
                  <div className="text-xs text-slate-500">До преговор</div>
                </div>
              </div>
            </div>
          )}

          {/* Bloom Level & Quiz Stats */}
          <div className="bg-slate-800/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-amber-400" />
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Прогрес</h3>
              </div>
              {module.avgGrade && (
                <div className="flex items-center gap-1">
                  <Star size={14} className="text-yellow-400" />
                  <span className="text-sm font-medium text-slate-300">
                    {module.avgGrade.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm text-slate-300 mb-1">
                  Ниво {module.currentBloomLevel || 1}: {bloomInfo.name}
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all bg-gradient-to-r from-cyan-500 to-purple-500"
                    style={{
                      width: `${((module.currentBloomLevel || 1) / 6) * 100}%`
                    }}
                  />
                </div>
              </div>
              <div className="text-center px-3">
                <div className="text-lg font-bold text-slate-300">{module.quizCount}</div>
                <div className="text-xs text-slate-500">Теста</div>
              </div>
            </div>
          </div>

          {/* Material Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <BookOpen size={14} />
                Материал
              </h3>
              {!isSaved && (
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 transition-colors"
                >
                  <Save size={12} />
                  Запази
                </button>
              )}
            </div>
            <textarea
              value={material}
              onChange={(e) => {
                setMaterial(e.target.value);
                setIsSaved(false);
              }}
              placeholder="Добави бележки, ключови концепции, или съдържание на модула..."
              className="w-full h-40 bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 resize-none"
            />
            <div className="text-xs text-slate-500 mt-1">
              {material.length} символа {module.readCount > 0 && `• Прочетен ${module.readCount}x`}
            </div>
          </div>

          {/* Wrong Answers */}
          {module.wrongAnswers && module.wrongAnswers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={14} className="text-red-400" />
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Слаби места ({module.wrongAnswers.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {module.wrongAnswers.slice(0, 5).map((wa, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs">
                    <div className="text-red-300 font-medium line-clamp-1">{wa.question}</div>
                    <div className="text-slate-500 mt-1">Концепция: {wa.concept}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quiz Grades */}
          {module.grades && module.grades.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Оценки ({module.grades.length})
              </h3>
              <div className="flex flex-wrap gap-1">
                {module.grades.map((grade, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded text-xs font-medium ${
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

          {/* Start Quiz Buttons */}
          <div className="space-y-2">
            <button
              onClick={() => handleStartQuiz()}
              disabled={!material.trim()}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                material.trim()
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-90'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play size={18} />
              Тест (всички режими)
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => handleStartQuiz('free_recall')}
              disabled={!material.trim()}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-all ${
                material.trim()
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Brain size={16} />
              Free Recall
            </button>
          </div>

          {/* Delete Section */}
          <div className="pt-4 border-t border-slate-800">
            {showDeleteConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  Потвърди изтриване
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm font-medium hover:bg-slate-700 transition-colors"
                >
                  Отказ
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-2 rounded-lg text-slate-500 text-sm hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Изтрий модула
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
