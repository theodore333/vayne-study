'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, BookOpen, FileText, HelpCircle, FileQuestion } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getMaterialsCache } from '@/lib/storage';

interface SearchResult {
  type: 'topic' | 'subject' | 'question' | 'material';
  title: string;
  breadcrumb: string;
  snippet?: string;
  href: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

const TYPE_CONFIG = {
  subject: { icon: BookOpen, label: 'Предмет', color: 'text-blue-400' },
  topic: { icon: FileText, label: 'Тема', color: 'text-green-400' },
  question: { icon: HelpCircle, label: 'Въпрос', color: 'text-amber-400' },
  material: { icon: FileQuestion, label: 'Материал', color: 'text-purple-400' },
};

const MAX_PER_CATEGORY = 5;

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const { data } = useApp();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Get active subjects
  const activeSubjects = useMemo(
    () => data.subjects.filter(s => !s.archived && !s.deletedAt),
    [data.subjects]
  );

  // Search logic — debounced via useMemo on query
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const out: SearchResult[] = [];

    // 1. Search subjects
    let subjectCount = 0;
    for (const s of activeSubjects) {
      if (subjectCount >= MAX_PER_CATEGORY) break;
      if (s.name.toLowerCase().includes(q)) {
        out.push({
          type: 'subject',
          title: s.name,
          breadcrumb: `${s.topics.length} теми`,
          href: `/subjects?id=${s.id}`,
        });
        subjectCount++;
      }
    }

    // 2. Search topics
    let topicCount = 0;
    for (const s of activeSubjects) {
      if (topicCount >= MAX_PER_CATEGORY) break;
      for (const t of s.topics) {
        if (topicCount >= MAX_PER_CATEGORY) break;
        const nameStr = `${t.number}. ${t.name}`.toLowerCase();
        if (nameStr.includes(q) || t.name.toLowerCase().includes(q)) {
          out.push({
            type: 'topic',
            title: `${t.number}. ${t.name}`,
            breadcrumb: s.name,
            href: `/subjects/${s.id}/topics/${t.id}`,
          });
          topicCount++;
        }
      }
    }

    // 3. Search questions
    let questionCount = 0;
    if (data.questionBanks) {
      for (const bank of data.questionBanks) {
        if (questionCount >= MAX_PER_CATEGORY) break;
        const subject = activeSubjects.find(s => s.id === bank.subjectId);
        for (const question of bank.questions) {
          if (questionCount >= MAX_PER_CATEGORY) break;
          if (question.text.toLowerCase().includes(q)) {
            const snippet = question.text.length > 80
              ? question.text.substring(0, 80) + '...'
              : question.text;
            out.push({
              type: 'question',
              title: snippet,
              breadcrumb: `${subject?.name || 'Сборник'} > ${bank.name}`,
              href: `/question-bank?bank=${bank.id}`,
            });
            questionCount++;
          }
        }
      }
    }

    // 4. Search materials (HTML stripped to text)
    let materialCount = 0;
    const materials = getMaterialsCache();
    for (const [topicId, html] of Object.entries(materials)) {
      if (materialCount >= MAX_PER_CATEGORY) break;
      if (!html || html.length === 0) continue;
      const text = stripHtml(html).toLowerCase();
      const idx = text.indexOf(q);
      if (idx === -1) continue;

      // Find the subject and topic
      let foundSubject = '';
      let foundTopicName = '';
      let href = '';
      for (const s of activeSubjects) {
        const t = s.topics.find(t => t.id === topicId);
        if (t) {
          foundSubject = s.name;
          foundTopicName = `${t.number}. ${t.name}`;
          href = `/subjects/${s.id}/topics/${t.id}`;
          break;
        }
      }
      if (!href) continue;

      // Extract snippet around match
      const plainText = stripHtml(html);
      const matchIdx = plainText.toLowerCase().indexOf(q);
      const start = Math.max(0, matchIdx - 40);
      const end = Math.min(plainText.length, matchIdx + q.length + 40);
      const snippet = (start > 0 ? '...' : '') +
        plainText.substring(start, end) +
        (end < plainText.length ? '...' : '');

      out.push({
        type: 'material',
        title: foundTopicName,
        breadcrumb: foundSubject,
        snippet,
        href,
      });
      materialCount++;
    }

    return out;
  }, [query, activeSubjects, data.questionBanks]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Navigate to result
  const navigateTo = useCallback((result: SearchResult) => {
    onClose();
    router.push(result.href);
  }, [onClose, router]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigateTo(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [results, selectedIndex, navigateTo, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const el = container.children[selectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Highlight matching text
  const highlight = (text: string) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.substring(0, idx)}
        <mark className="bg-purple-500/30 text-purple-200 rounded-sm px-0.5">{text.substring(idx, idx + q.length)}</mark>
        {text.substring(idx + q.length)}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-xl bg-[#0f0f1a] border border-[#2e3b4e] rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e293b]">
          <Search size={18} className="text-purple-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Търси теми, предмети, въпроси, материал..."
            className="flex-1 bg-transparent text-slate-200 text-sm font-mono placeholder:text-slate-600 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-500 font-mono border border-slate-700">
            ESC
          </kbd>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-6 text-center text-slate-600 text-xs font-mono">
              Въведи поне 2 символа за търсене
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-xs font-mono">
              Няма резултати за &quot;{query}&quot;
            </div>
          ) : (
            results.map((result, i) => {
              const config = TYPE_CONFIG[result.type];
              const Icon = config.icon;
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={`${result.type}-${result.href}-${i}`}
                  onClick={() => navigateTo(result)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-purple-500/10' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <Icon size={16} className={`${config.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono ${config.color} opacity-60`}>{config.label}</span>
                      <span className="text-[10px] text-slate-600 font-mono truncate">{result.breadcrumb}</span>
                    </div>
                    <div className="text-sm text-slate-200 font-mono truncate mt-0.5">
                      {highlight(result.title)}
                    </div>
                    {result.snippet && (
                      <div className="text-xs text-slate-500 font-mono truncate mt-0.5">
                        {highlight(result.snippet)}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <kbd className="hidden sm:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-500 font-mono border border-slate-700 mt-1">
                      Enter
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-[#1e293b] text-[10px] text-slate-600 font-mono">
            <span>{results.length} резултат{results.length !== 1 ? 'а' : ''}</span>
            <span className="hidden sm:inline">
              <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700">↑↓</kbd> навигация
            </span>
            <span className="hidden sm:inline">
              <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700">Enter</kbd> отвори
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
