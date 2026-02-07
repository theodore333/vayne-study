'use client';

import { Brain, Play, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Topic, Subject } from '@/lib/types';

interface ReviewItem {
  topic: Topic;
  subject: Subject;
  urgency: number;
  retrievability: number;
}

interface FSRSReviewWidgetProps {
  reviews: ReviewItem[];
}

export default function FSRSReviewWidget({ reviews }: FSRSReviewWidgetProps) {
  if (reviews.length === 0) return null;

  const shown = reviews.slice(0, 5);
  const remaining = reviews.length - 5;

  return (
    <div className="rounded-xl p-5 border transition-all bg-gradient-to-br from-purple-900/20 to-slate-900/80 border-purple-500/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-purple-400" />
          <span className="text-sm font-semibold text-slate-300 font-mono">FSRS Преговор</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-mono font-bold">
          {reviews.length}
        </span>
      </div>

      {/* Topic list */}
      <div className="space-y-1.5">
        {shown.map(({ topic, subject, retrievability }) => (
          <Link
            key={`${subject.id}-${topic.id}`}
            href={`/quiz?subject=${subject.id}&topic=${topic.id}`}
            className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: subject.color }}
            />
            <span className="flex-1 text-xs font-mono text-slate-300 truncate group-hover:text-cyan-400 transition-colors">
              {topic.name}
            </span>
            <span className={`text-[10px] font-mono shrink-0 ${
              retrievability < 0.5 ? 'text-red-400' :
              retrievability < 0.7 ? 'text-orange-400' :
              'text-yellow-400'
            }`}>
              {Math.round(retrievability * 100)}%
            </span>
            <Play size={12} className="text-slate-500 group-hover:text-purple-400 shrink-0 transition-colors" />
          </Link>
        ))}
      </div>

      {/* See all link */}
      {remaining > 0 && (
        <Link
          href="/today"
          className="flex items-center justify-center gap-1 mt-3 py-1.5 text-xs text-purple-400 hover:text-purple-300 font-mono transition-colors"
        >
          + {remaining} още
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}
