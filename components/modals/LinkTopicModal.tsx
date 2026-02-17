'use client';

import { useState, useMemo } from 'react';
import { X, Search, Link2, ChevronRight } from 'lucide-react';
import { useApp } from '@/lib/context';

interface LinkTopicModalProps {
  subjectId: string;
  topicId: string;
  topicName: string;
  existingLinkedIds: string[];
  onClose: () => void;
}

export default function LinkTopicModal({ subjectId, topicId, topicName, existingLinkedIds, onClose }: LinkTopicModalProps) {
  const { data, updateTopic } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const otherSubjects = useMemo(() =>
    data.subjects.filter(s => !s.archived && !s.deletedAt && s.topics.length > 0),
    [data.subjects]
  );

  const selectedSubject = otherSubjects.find(s => s.id === selectedSubjectId);

  const filteredTopics = useMemo(() => {
    if (!selectedSubject) return [];
    const excludeIds = new Set([topicId, ...existingLinkedIds]);
    return selectedSubject.topics
      .filter(t => !excludeIds.has(t.id))
      .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));
  }, [selectedSubject, search, topicId, existingLinkedIds]);

  const handleLink = (targetTopicId: string) => {
    // Bidirectional: add target to source's linkedTopicIds AND source to target's linkedTopicIds
    const targetSubject = otherSubjects.find(s => s.topics.some(t => t.id === targetTopicId));
    if (!targetSubject) return;

    const targetTopic = targetSubject.topics.find(t => t.id === targetTopicId);
    if (!targetTopic) return;

    // Update source topic
    updateTopic(subjectId, topicId, {
      linkedTopicIds: [...existingLinkedIds, targetTopicId]
    });

    // Update target topic (add source to its linked list)
    const targetLinked = targetTopic.linkedTopicIds || [];
    updateTopic(targetSubject.id, targetTopicId, {
      linkedTopicIds: [...targetLinked, topicId]
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0f1729] border border-[#1e293b] rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 font-mono flex items-center gap-2">
              <Link2 size={16} className="text-blue-400" />
              Свържи с подобна тема
            </h2>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{topicName}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedSubjectId ? (
            /* Step 1: Pick subject */
            <div className="space-y-2">
              <p className="text-xs text-slate-400 font-mono mb-3">Избери предмет:</p>
              {otherSubjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSubjectId(s.id)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 border border-slate-700/30 hover:border-slate-600/50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-slate-200 font-mono">{s.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{s.topics.length} теми</span>
                  </div>
                  <ChevronRight size={14} className="text-slate-500" />
                </button>
              ))}
            </div>
          ) : (
            /* Step 2: Pick topic */
            <div className="space-y-2">
              <button
                onClick={() => { setSelectedSubjectId(null); setSearch(''); }}
                className="text-xs text-blue-400 hover:text-blue-300 font-mono mb-2"
              >
                ← Назад към предмети
              </button>

              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Търси тема..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                  autoFocus
                />
              </div>

              {filteredTopics.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono text-center py-4">Няма налични теми за свързване</p>
              ) : (
                filteredTopics.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleLink(t.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-blue-500/10 border border-slate-700/30 hover:border-blue-500/30 transition-all text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-slate-500 font-mono shrink-0">{t.number}.</span>
                      <span className="text-sm text-slate-200 font-mono truncate">{t.name}</span>
                    </div>
                    <Link2 size={14} className="text-blue-400 shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
