'use client';

import { useMemo } from 'react';
import { AlertCircle, Play } from 'lucide-react';
import Link from 'next/link';
import { Subject } from '@/lib/types';

interface WeaknessWidgetProps {
  subjects: Subject[];
}

interface ConceptFailure {
  concept: string;
  count: number;
  subjectId: string;
  topicId: string;
  subjectColor: string;
  subjectName: string;
}

export default function WeaknessWidget({ subjects }: WeaknessWidgetProps) {
  const topWeaknesses = useMemo(() => {
    const conceptMap = new Map<string, ConceptFailure>();

    for (const subject of subjects) {
      for (const topic of subject.topics) {
        if (!topic.wrongAnswers?.length) continue;
        for (const wa of topic.wrongAnswers) {
          const key = wa.concept.toLowerCase().trim();
          if (!key) continue;
          const existing = conceptMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            conceptMap.set(key, {
              concept: wa.concept,
              count: 1,
              subjectId: subject.id,
              topicId: topic.id,
              subjectColor: subject.color,
              subjectName: subject.name
            });
          }
        }
      }
    }

    return Array.from(conceptMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [subjects]);

  const hasWeaknesses = topWeaknesses.length > 0;

  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={18} className={hasWeaknesses ? 'text-red-400' : 'text-slate-500'} />
        <span className="text-sm font-semibold text-slate-300 font-mono">Слаби места</span>
      </div>

      {!hasWeaknesses ? (
        <div className="py-4 text-center">
          <AlertCircle size={32} className="text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-mono">Няма грешки от тестове</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {topWeaknesses.map((w, i) => (
            <Link
              key={i}
              href={`/quiz?subject=${w.subjectId}&topic=${w.topicId}`}
              className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: w.subjectColor }}
              />
              <span className="flex-1 text-xs font-mono text-slate-300 truncate group-hover:text-cyan-400 transition-colors">
                {w.concept}
              </span>
              <span className="text-[10px] font-mono text-red-400 shrink-0">
                {w.count}x
              </span>
              <Play size={12} className="text-slate-500 group-hover:text-red-400 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
