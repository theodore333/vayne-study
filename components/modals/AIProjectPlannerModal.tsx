'use client';

import { useState } from 'react';
import { X, Sparkles, Loader2, Trash2, GripVertical, Check, AlertCircle } from 'lucide-react';
import { TopicSize } from '@/lib/types';
import { TOPIC_SIZE_CONFIG } from '@/lib/constants';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';

interface GeneratedModule {
  title: string;
  order: number;
  suggestedSize: string;
}

interface Props {
  onClose: () => void;
  onConfirm: (modules: Array<{ title: string; suggestedSize: TopicSize }>) => void;
  projectType?: string;
  existingModules?: string[];
}

export default function AIProjectPlannerModal({ onClose, onConfirm, projectType, existingModules }: Props) {
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<GeneratedModule[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleGenerate = async () => {
    if (!description.trim()) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      setError('Няма API ключ. Добави го в настройките.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setModules([]);

    try {
      const res = await fetchWithTimeout('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          description: description.trim(),
          projectType: projectType || 'course',
          existingModules: existingModules || []
        }),
        timeout: 30000
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'API error');
      }

      setModules(data.modules || []);
    } catch (err) {
      setError(getFetchErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const removeModule = (index: number) => {
    setModules(prev => prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i + 1 })));
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditTitle(modules[index].title);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editTitle.trim()) return;
    setModules(prev => prev.map((m, i) =>
      i === editingIndex ? { ...m, title: editTitle.trim() } : m
    ));
    setEditingIndex(null);
    setEditTitle('');
  };

  const handleConfirm = () => {
    const result = modules.map(m => ({
      title: m.title,
      suggestedSize: (['small', 'medium', 'large'].includes(m.suggestedSize) ? m.suggestedSize : 'medium') as TopicSize
    }));
    onConfirm(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1e293b]">
          <h3 className="text-base font-semibold text-slate-100 font-mono flex items-center gap-2">
            <Sparkles size={18} className="text-purple-400" />
            AI Планер на модули
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Description input */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-mono">
              Опиши проекта или курса
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="напр. ICANSTUDY курс за метаучене от Justin Sung, 8 модула за ефективно учене, mind mapping, encoding..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono text-sm resize-none"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !description.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition-all font-mono text-sm disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Генериране...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {modules.length > 0 ? 'Генерирай отново' : 'Генерирай модули'}
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 font-mono">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Generated modules */}
          {modules.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider font-mono">
                  Генерирани модули ({modules.length})
                </h4>
              </div>
              <div className="space-y-1.5">
                {modules.map((mod, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2.5 bg-slate-800/50 rounded-lg group"
                  >
                    <GripVertical size={14} className="text-slate-600 shrink-0" />
                    <span className="text-xs text-slate-500 font-mono w-5 shrink-0">{mod.order}.</span>

                    {editingIndex === index ? (
                      <div className="flex-1 flex gap-1">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingIndex(null); }}
                          autoFocus
                          className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                        />
                        <button onClick={saveEdit} className="p-1 text-green-400 hover:bg-green-500/10 rounded">
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => startEdit(index)}
                        className="flex-1 text-sm text-slate-300 font-mono cursor-pointer hover:text-cyan-400 transition-colors"
                      >
                        {mod.title}
                      </span>
                    )}

                    {/* Size badge */}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 shrink-0">
                      {TOPIC_SIZE_CONFIG[mod.suggestedSize as TopicSize]?.label || 'M'}
                    </span>

                    {/* Remove */}
                    <button
                      onClick={() => removeModule(index)}
                      className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer - confirm button */}
        {modules.length > 0 && (
          <div className="p-4 border-t border-[#1e293b]">
            <button
              onClick={handleConfirm}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all font-mono text-sm"
            >
              Добави {modules.length} модула
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
