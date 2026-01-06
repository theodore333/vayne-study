'use client';

import { useState } from 'react';
import { X, FileText, Upload } from 'lucide-react';
import { useApp } from '@/lib/context';
import { parseTopicsFromText } from '@/lib/algorithms';

interface Props {
  subjectId: string;
  onClose: () => void;
}

export default function ImportTopicsModal({ subjectId, onClose }: Props) {
  const { addTopics } = useApp();
  const [text, setText] = useState('');

  const parsedTopics = parseTopicsFromText(text);

  const handleImport = () => {
    if (parsedTopics.length === 0) return;
    addTopics(subjectId, parsedTopics);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <FileText size={20} className="text-purple-400" />
            Импортирай теми
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Постави конспект (всяка тема на нов ред)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`1. Клетъчна структура
2. ДНК репликация
3. Протеинов синтез
...или просто:
Клетъчна структура
ДНК репликация
Протеинов синтез`}
              rows={10}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono text-sm resize-none"
            />
          </div>

          {/* Preview */}
          {parsedTopics.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-300 font-mono">
                  Преглед ({parsedTopics.length} теми)
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto bg-slate-800/30 rounded-lg border border-slate-700 divide-y divide-slate-700/50">
                {parsedTopics.slice(0, 20).map((topic, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500 w-8">
                      #{topic.number}
                    </span>
                    <span className="text-sm text-slate-300">{topic.name}</span>
                    <span className="ml-auto text-xs">⬜</span>
                  </div>
                ))}
                {parsedTopics.length > 20 && (
                  <div className="px-4 py-2 text-center text-sm text-slate-500 font-mono">
                    ... и още {parsedTopics.length - 20} теми
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b]">
          <button
            onClick={handleImport}
            disabled={parsedTopics.length === 0}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            Импортирай {parsedTopics.length} {parsedTopics.length === 1 ? 'тема' : 'теми'}
          </button>
        </div>
      </div>
    </div>
  );
}
