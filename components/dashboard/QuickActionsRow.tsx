'use client';

import { useMemo } from 'react';
import { Timer, Brain, ListTodo, Zap } from 'lucide-react';
import Link from 'next/link';
import { Subject, Topic } from '@/lib/types';

interface QuickActionsRowProps {
  subjects: Subject[];
}

export default function QuickActionsRow({ subjects }: QuickActionsRowProps) {
  // Find weak topics for quick quiz (orange or gray topics with some material)
  const weakTopicsForQuiz = useMemo(() => subjects
    .filter(s => !s.archived && !s.deletedAt)
    .flatMap(s =>
      s.topics
        .filter(t => (t.status === 'orange' || t.status === 'yellow') && t.material)
        .map(t => ({ topic: t, subject: s }))
    )
    .slice(0, 5), [subjects]);

  // Pick a stable random weak topic (only changes when weakTopicsForQuiz changes)
  const randomWeakTopic = useMemo(() => weakTopicsForQuiz.length > 0
    ? weakTopicsForQuiz[Math.floor(Math.random() * weakTopicsForQuiz.length)]
    : null, [weakTopicsForQuiz]);

  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
      <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-3">
        <Zap size={16} className="text-cyan-400" />
        Бързи действия
      </h3>
      <div className="space-y-2">
        {/* Pomodoro */}
        <Link
          href="/timer?mode=pomodoro"
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
        >
          <div className="p-1.5 bg-orange-500/20 rounded-md group-hover:bg-orange-500/30 transition-colors">
            <Timer size={16} className="text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-200 font-mono block">Pomodoro</span>
            <span className="text-[11px] text-slate-500 font-mono">25 мин фокус</span>
          </div>
        </Link>

        {/* Quick Quiz */}
        <Link
          href={randomWeakTopic
            ? `/quiz?subject=${randomWeakTopic.subject.id}&topic=${randomWeakTopic.topic.id}&preset=quick`
            : '/quiz'}
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
        >
          <div className="p-1.5 bg-purple-500/20 rounded-md group-hover:bg-purple-500/30 transition-colors">
            <Brain size={16} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-200 font-mono block">Бърз тест</span>
            <span className="text-[11px] text-slate-500 font-mono truncate block">
              {randomWeakTopic
                ? (randomWeakTopic.topic.name.length > 25 ? randomWeakTopic.topic.name.slice(0, 25) + '...' : randomWeakTopic.topic.name)
                : 'Избери тема'}
            </span>
          </div>
        </Link>

        {/* Today's Plan */}
        <Link
          href="/today"
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group"
        >
          <div className="p-1.5 bg-blue-500/20 rounded-md group-hover:bg-blue-500/30 transition-colors">
            <ListTodo size={16} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-200 font-mono block">Днешен план</span>
            <span className="text-[11px] text-slate-500 font-mono">Виж задачите</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
