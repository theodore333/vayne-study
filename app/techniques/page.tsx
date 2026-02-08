'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '@/lib/context';
import { TECHNIQUE_CATEGORY_CONFIG } from '@/lib/constants';
import { StudyTechnique, TechniqueCategory, TechniquePractice } from '@/lib/types';
import { BookOpen, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Star, Clock, X, Save, Brain, Eye, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import MaterialEditor from '@/components/MaterialEditor';

function TechniqueCard({
  technique,
  practices,
  onEdit,
  onToggle,
  onDelete,
  onPractice,
  expanded,
  onToggleExpand
}: {
  technique: StudyTechnique;
  practices: TechniquePractice[];
  onPractice: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const categoryConfig = TECHNIQUE_CATEGORY_CONFIG[technique.category] || TECHNIQUE_CATEGORY_CONFIG.encoding;
  const avgEffectiveness = practices.length > 0
    ? practices.filter(p => p.effectiveness !== null).reduce((sum, p) => sum + (p.effectiveness ?? 0), 0) /
      (practices.filter(p => p.effectiveness !== null).length || 1)
    : null;

  const daysSinceLastPractice = technique.lastPracticedAt
    ? Math.floor((Date.now() - new Date(technique.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className={`rounded-xl border transition-all ${technique.isActive ? 'border-[#2a2a3a] bg-[#0f0f1a]' : 'border-[#1a1a2a] bg-[#0a0a12] opacity-60'}`}>
      <div className="p-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">{technique.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-white text-sm">{technique.name}</h3>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ color: categoryConfig.color, backgroundColor: categoryConfig.bgColor }}
              >
                {categoryConfig.label}
              </span>
              {!technique.isActive && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">Изключена</span>
              )}
            </div>
            <p className="text-xs text-slate-400 line-clamp-2">{technique.description}</p>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <Star size={10} />
                {avgEffectiveness !== null ? `${avgEffectiveness.toFixed(1)}/5` : 'Няма оценка'}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {technique.practiceCount}x практикувано
              </span>
              {daysSinceLastPractice !== null && (
                <span className={daysSinceLastPractice > 7 ? 'text-orange-400' : ''}>
                  Последно: преди {daysSinceLastPractice}д
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {expanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1e293b] pt-3 space-y-3">
          <div>
            <h4 className="text-xs font-semibold text-violet-400 mb-1">Как да приложиш</h4>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-[#1a1a2e] rounded-lg p-3">
              {technique.howToApply}
            </pre>
          </div>

          {technique.notes && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-400 mb-1">Твои бележки</h4>
              <div className="text-xs text-slate-300 bg-[#1a1a2e] rounded-lg p-3" dangerouslySetInnerHTML={{ __html: technique.notes }} />
            </div>
          )}

          {practices.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-blue-400 mb-1">Последни практики</h4>
              <div className="space-y-1">
                {practices.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>{new Date(p.date).toLocaleDateString('bg-BG')}</span>
                    {p.effectiveness !== null && (
                      <span className="text-yellow-400">{'★'.repeat(p.effectiveness)}{'☆'.repeat(5 - p.effectiveness)}</span>
                    )}
                    {p.userReflection && <span className="text-slate-500 truncate max-w-[200px]">{p.userReflection}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button onClick={onPractice} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1">
              <Brain size={12} /> Active Recall
            </button>
            <button onClick={onEdit} className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors flex items-center gap-1">
              <Pencil size={12} /> Редактирай
            </button>
            <button onClick={onToggle} className="text-xs px-3 py-1.5 rounded-lg bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 transition-colors flex items-center gap-1">
              {technique.isActive ? <><ToggleRight size={12} /> Изключи</> : <><ToggleLeft size={12} /> Включи</>}
            </button>
            <button onClick={onDelete} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1">
              <Trash2 size={12} /> Изтрий
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditTechniqueModal({
  technique,
  onSave,
  onClose,
  isNew
}: {
  technique: Partial<StudyTechnique> | null;
  onSave: (data: Partial<StudyTechnique>) => void;
  onClose: () => void;
  isNew: boolean;
}) {
  const [name, setName] = useState(technique?.name || '');
  const [description, setDescription] = useState(technique?.description || '');
  const [howToApply, setHowToApply] = useState(technique?.howToApply || '');
  const [notes, setNotes] = useState(technique?.notes || '');
  const [icon, setIcon] = useState(technique?.icon || '📝');
  const [category, setCategory] = useState<TechniqueCategory>(technique?.category || 'encoding');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      howToApply: howToApply.trim(),
      notes: notes.trim(),
      icon,
      category,
      slug: name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, ''),
      isBuiltIn: technique?.isBuiltIn ?? false,
      isActive: technique?.isActive ?? true
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#0f0f1a] rounded-2xl border border-[#2a2a3a] w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
          <h2 className="text-lg font-bold text-white">{isNew ? 'Нова техника' : 'Редактирай техника'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-3">
            <div className="shrink-0">
              <label className="text-xs text-slate-400 block mb-1">Икона</label>
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                className="w-14 h-10 text-center text-xl bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white"
                maxLength={2}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Име</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white text-sm"
                placeholder="Име на техниката"
              />
            </div>
            <div className="w-36">
              <label className="text-xs text-slate-400 block mb-1">Категория</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as TechniqueCategory)}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white text-sm"
              >
                {Object.entries(TECHNIQUE_CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Описание (кратко)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white text-sm h-16 resize-none"
              placeholder="Кратко описание на техниката..."
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Как да приложиш (практически стъпки)</label>
            <textarea
              value={howToApply}
              onChange={e => setHowToApply(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white text-sm h-40 resize-y font-mono"
              placeholder="Стъпка по стъпка как да приложиш техниката..."
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Твои бележки (от курса, лични наблюдения)</label>
            <MaterialEditor
              value={notes}
              onChange={setNotes}
              placeholder="Бележки от IcanStudy курса, лични наблюдения, примери..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[#1e293b]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
            Отказ
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Save size={14} /> {isNew ? 'Добави' : 'Запази'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AIEvaluation {
  score: number;
  grade: number;
  bloomLevel: number;
  covered: Array<{ concept: string; accuracy: string; detail: string }>;
  missing: Array<{ concept: string; importance: string }>;
  feedback: string;
  suggestedNextStep: string;
}

function PracticeModal({
  technique,
  onComplete,
  onClose,
  onIncrementCost
}: {
  technique: StudyTechnique;
  onComplete: (effectiveness: number, reflection: string) => void;
  onClose: () => void;
  onIncrementCost: (cost: number) => void;
}) {
  const [phase, setPhase] = useState<'recall' | 'evaluating' | 'results' | 'rate'>('recall');
  const [recallText, setRecallText] = useState('');
  const [rating, setRating] = useState(3);
  const [reflection, setReflection] = useState('');
  const [evaluation, setEvaluation] = useState<AIEvaluation | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup fetch on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Build the "correct answer" from technique data
  const fullMaterial = [
    technique.description,
    technique.howToApply,
    technique.notes
  ].filter(Boolean).join('\n\n');

  const handleEvaluate = async () => {
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('claude-api-key') : null;

    if (!apiKey || !fullMaterial.trim()) {
      // No API key or no material → skip AI, go straight to manual compare
      setPhase('results');
      return;
    }

    setPhase('evaluating');
    setEvalError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey,
          mode: 'free_recall',
          material: fullMaterial,
          topicName: technique.name,
          subjectName: 'IcanStudy - Учебни техники',
          userRecall: recallText
        })
      });

      const result = await response.json();

      if (result.evaluation) {
        setEvaluation(result.evaluation);
        // Pre-fill rating based on AI score
        const aiScore = result.evaluation.score || 0;
        setRating(aiScore >= 90 ? 5 : aiScore >= 70 ? 4 : aiScore >= 50 ? 3 : aiScore >= 25 ? 2 : 1);
        if (result.usage?.cost) onIncrementCost(result.usage.cost);
      } else if (result.error) {
        setEvalError(result.error);
      }
      setPhase('results');
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Грешка при оценката');
      setPhase('results');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#0f0f1a] rounded-2xl border border-[#2a2a3a] w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-2">
            <span className="text-xl">{technique.icon}</span>
            <h2 className="text-lg font-bold text-white">Active Recall: {technique.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Phase 1: Write recall */}
          {phase === 'recall' && (
            <>
              <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
                <p className="text-sm text-violet-300 font-semibold mb-1">Какво помниш за тази техника?</p>
                <p className="text-xs text-violet-400">Опиши: какво е, защо работи, как се прилага, кога да я ползваш. Без да гледаш!</p>
              </div>
              <textarea
                value={recallText}
                onChange={e => setRecallText(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white text-sm h-48 resize-y focus:border-violet-500/50 focus:outline-none"
                placeholder="Напиши всичко което помниш за тази техника..."
                autoFocus
              />
              <div className="flex justify-end">
                <button
                  onClick={handleEvaluate}
                  disabled={!recallText.trim()}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <Brain size={14} /> Оцени
                </button>
              </div>
            </>
          )}

          {/* Phase 2: AI evaluating */}
          {phase === 'evaluating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full mb-4" />
              <p className="text-sm text-slate-400">AI оценява recall-а ти...</p>
            </div>
          )}

          {/* Phase 3: Results */}
          {phase === 'results' && (
            <>
              {/* AI Evaluation Results */}
              {evaluation && (
                <div className="space-y-3">
                  {/* Score header */}
                  <div className="flex items-center gap-4 bg-[#1a1a2e] rounded-xl p-4">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${evaluation.score >= 70 ? 'text-emerald-400' : evaluation.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {evaluation.score}%
                      </div>
                      <div className="text-[10px] text-slate-500">Покритие</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-400">{evaluation.bloomLevel}/6</div>
                      <div className="text-[10px] text-slate-500">Bloom ниво</div>
                    </div>
                    <div className="flex-1 text-sm text-slate-300">{evaluation.feedback}</div>
                  </div>

                  {/* Covered concepts */}
                  {evaluation.covered && evaluation.covered.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-emerald-400 mb-1">Покрити концепции</h4>
                      <div className="space-y-1">
                        {evaluation.covered.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 ${c.accuracy === 'correct' ? 'text-emerald-400' : c.accuracy === 'partial' ? 'text-yellow-400' : 'text-red-400'}`}>
                              {c.accuracy === 'correct' ? '✓' : c.accuracy === 'partial' ? '~' : '✗'}
                            </span>
                            <span className="text-slate-300"><strong className="text-white">{c.concept}</strong> - {c.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing concepts */}
                  {evaluation.missing && evaluation.missing.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-red-400 mb-1">Пропуснати</h4>
                      <div className="space-y-1">
                        {evaluation.missing.map((m, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 ${m.importance === 'critical' ? 'text-red-400' : m.importance === 'important' ? 'text-orange-400' : 'text-slate-500'}`}>
                              {m.importance === 'critical' ? '!!' : m.importance === 'important' ? '!' : '·'}
                            </span>
                            <span className="text-slate-400">{m.concept}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Next step */}
                  {evaluation.suggestedNextStep && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <p className="text-xs text-blue-300">{evaluation.suggestedNextStep}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Error fallback */}
              {evalError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs text-red-400">AI оценка неуспешна: {evalError}</p>
                </div>
              )}

              {/* Side-by-side compare (always shown) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-blue-400 mb-2">Твоят отговор</h4>
                  <div className="text-sm text-slate-300 bg-[#1a1a2e] rounded-lg p-3 whitespace-pre-wrap min-h-[80px] max-h-[200px] overflow-y-auto">
                    {recallText}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-emerald-400 mb-2">Пълен материал</h4>
                  <div className="text-sm text-slate-300 bg-[#1a1a2e] rounded-lg p-3 whitespace-pre-wrap min-h-[80px] max-h-[200px] overflow-y-auto">
                    {fullMaterial || 'Няма добавен материал за тази техника.'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setPhase('rate')}
                  className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors flex items-center gap-1"
                >
                  <Star size={14} /> Оцени се
                </button>
              </div>
            </>
          )}

          {/* Phase 4: Self-rate */}
          {phase === 'rate' && (
            <>
              <div className="text-center">
                <p className="text-sm text-slate-300 mb-3">
                  {evaluation ? `AI оценка: ${evaluation.score}% (Bloom ${evaluation.bloomLevel}/6). Ти как се оценяваш?` : 'Колко добре си спомни материала?'}
                </p>
                <div className="flex justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      className={`w-12 h-12 rounded-xl text-lg font-bold transition-all ${
                        rating === n
                          ? 'bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500/50 scale-110'
                          : 'bg-[#1a1a2e] text-slate-500 border border-[#2a2a3a] hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 px-2 mb-4">
                  <span>Нищо не помня</span>
                  <span>Перфектно</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Рефлексия (незадължително)</label>
                <textarea
                  value={reflection}
                  onChange={e => setReflection(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg text-white text-sm h-20 resize-none"
                  placeholder="Какво трябва да преговоря? Какво ме затрудни?"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => onComplete(rating, reflection.trim())}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors flex items-center gap-1"
                >
                  <Save size={14} /> Готово
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TechniquesPage() {
  const { data, addTechnique, updateTechnique, deleteTechnique, addTechniquePractice, rateTechniquePractice, incrementApiCalls } = useApp();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTechnique, setEditingTechnique] = useState<StudyTechnique | null>(null);
  const [practicingTechnique, setPracticingTechnique] = useState<StudyTechnique | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [filterCategory, setFilterCategory] = useState<TechniqueCategory | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);

  const techniques = data.studyTechniques || [];
  const practices = data.techniquePractices || [];

  const filteredTechniques = useMemo(() => {
    return techniques.filter(t => {
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (!showInactive && !t.isActive) return false;
      return true;
    });
  }, [techniques, filterCategory, showInactive]);

  const practicesByTechnique = useMemo(() => {
    const map: Record<string, TechniquePractice[]> = {};
    for (const p of practices) {
      if (!map[p.techniqueId]) map[p.techniqueId] = [];
      map[p.techniqueId].push(p);
    }
    // Sort each by date descending
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return map;
  }, [practices]);

  const stats = useMemo(() => {
    const active = techniques.filter(t => t.isActive).length;
    const totalPractices = practices.length;
    const avgEffectiveness = practices.filter(p => p.effectiveness !== null).length > 0
      ? practices.filter(p => p.effectiveness !== null).reduce((s, p) => s + (p.effectiveness ?? 0), 0) /
        practices.filter(p => p.effectiveness !== null).length
      : null;
    const stale = techniques.filter(t => {
      if (!t.isActive) return false;
      if (!t.lastPracticedAt) return false; // Never practiced = new, not stale
      return (Date.now() - new Date(t.lastPracticedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { active, totalPractices, avgEffectiveness, stale };
  }, [techniques, practices]);

  const handleSaveEdit = (updates: Partial<StudyTechnique>) => {
    if (editingTechnique) {
      updateTechnique(editingTechnique.id, updates);
      setEditingTechnique(null);
    }
  };

  const handleSaveNew = (data: Partial<StudyTechnique>) => {
    addTechnique({
      name: data.name || '',
      slug: data.slug || '',
      category: data.category || 'encoding',
      description: data.description || '',
      notes: data.notes || '',
      howToApply: data.howToApply || '',
      icon: data.icon || '📝',
      isBuiltIn: false,
      isActive: true
    });
    setIsAddingNew(false);
  };

  const handlePracticeComplete = (technique: StudyTechnique, effectiveness: number, reflection: string) => {
    addTechniquePractice({
      techniqueId: technique.id,
      topicId: '',
      subjectId: '',
      effectiveness,
      aiPrompt: 'Active Recall на техниката',
      userReflection: reflection || null
    });
    setPracticingTechnique(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Изтрий тази техника? Историята на практикуване също ще бъде изтрита.')) {
      deleteTechnique(id);
    }
  };

  return (
    <div className="min-h-screen bg-[#030306] text-white">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">Табло</Link>
              <span className="text-slate-600">/</span>
              <span className="text-white text-sm font-semibold">Техники за учене</span>
            </div>
            <h1 className="text-2xl font-bold">
              <span className="flex items-center gap-2">
                <BookOpen size={24} className="text-violet-400" />
                Техники за учене
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">IcanStudy HUDLE Framework - управлявай и практикувай study техники</p>
          </div>
          <button
            onClick={() => setIsAddingNew(true)}
            className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500 transition-colors flex items-center gap-1"
          >
            <Plus size={16} /> Нова техника
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-[#0f0f1a] rounded-xl border border-[#2a2a3a] p-3 text-center">
            <div className="text-xl font-bold text-violet-400">{stats.active}</div>
            <div className="text-[10px] text-slate-500">Активни техники</div>
          </div>
          <div className="bg-[#0f0f1a] rounded-xl border border-[#2a2a3a] p-3 text-center">
            <div className="text-xl font-bold text-blue-400">{stats.totalPractices}</div>
            <div className="text-[10px] text-slate-500">Общо практики</div>
          </div>
          <div className="bg-[#0f0f1a] rounded-xl border border-[#2a2a3a] p-3 text-center">
            <div className="text-xl font-bold text-yellow-400">
              {stats.avgEffectiveness !== null ? `${stats.avgEffectiveness.toFixed(1)}/5` : '-'}
            </div>
            <div className="text-[10px] text-slate-500">Средна ефективност</div>
          </div>
          <div className="bg-[#0f0f1a] rounded-xl border border-[#2a2a3a] p-3 text-center">
            <div className="text-xl font-bold text-orange-400">{stats.stale}</div>
            <div className="text-[10px] text-slate-500">Непрактикувани 7д+</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilterCategory('all')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filterCategory === 'all' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-[#1a1a2e] text-slate-400 border border-[#2a2a3a] hover:text-white'}`}
          >
            Всички
          </button>
          {Object.entries(TECHNIQUE_CATEGORY_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setFilterCategory(key as TechniqueCategory)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filterCategory === key ? 'border' : 'bg-[#1a1a2e] border border-[#2a2a3a] hover:text-white'}`}
              style={filterCategory === key ? { color: config.color, backgroundColor: config.bgColor, borderColor: config.color + '50' } : { color: '#94a3b8' }}
            >
              {config.label}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#1a1a2e] text-slate-400 border border-[#2a2a3a] hover:text-white transition-colors"
            >
              {showInactive ? 'Скрий изключени' : 'Покажи изключени'}
            </button>
          </div>
        </div>

        {/* Technique Cards */}
        <div className="space-y-3">
          {filteredTechniques.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Няма техники в тази категория</p>
            </div>
          ) : (
            filteredTechniques.map(technique => (
              <TechniqueCard
                key={technique.id}
                technique={technique}
                practices={practicesByTechnique[technique.id] || []}
                onEdit={() => setEditingTechnique(technique)}
                onToggle={() => updateTechnique(technique.id, { isActive: !technique.isActive })}
                onDelete={() => handleDelete(technique.id)}
                onPractice={() => setPracticingTechnique(technique)}
                expanded={expandedId === technique.id}
                onToggleExpand={() => setExpandedId(expandedId === technique.id ? null : technique.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingTechnique && (
        <EditTechniqueModal
          technique={editingTechnique}
          onSave={handleSaveEdit}
          onClose={() => setEditingTechnique(null)}
          isNew={false}
        />
      )}

      {/* Add New Modal */}
      {isAddingNew && (
        <EditTechniqueModal
          technique={null}
          onSave={handleSaveNew}
          onClose={() => setIsAddingNew(false)}
          isNew={true}
        />
      )}

      {/* Practice Modal */}
      {practicingTechnique && (
        <PracticeModal
          technique={practicingTechnique}
          onComplete={(eff, refl) => handlePracticeComplete(practicingTechnique, eff, refl)}
          onClose={() => setPracticingTechnique(null)}
          onIncrementCost={(cost) => incrementApiCalls(cost)}
        />
      )}
    </div>
  );
}
