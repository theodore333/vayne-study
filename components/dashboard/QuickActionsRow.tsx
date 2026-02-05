'use client';

import { Timer, Brain, ListTodo } from 'lucide-react';
import Link from 'next/link';
import { Subject, Topic } from '@/lib/types';

interface QuickActionsRowProps {
  subjects: Subject[];
}

export default function QuickActionsRow({ subjects }: QuickActionsRowProps) {
  // Find weak topics for quick quiz (orange or gray topics with some material)
  const weakTopicsForQuiz = subjects
    .filter(s => !s.archived && !s.deletedAt)
    .flatMap(s =>
      s.topics
        .filter(t => (t.status === 'orange' || t.status === 'yellow') && t.material)
        .map(t => ({ topic: t, subject: s }))
    )
    .slice(0, 5);

  // Pick a random weak topic for quick quiz
  const randomWeakTopic = weakTopicsForQuiz.length > 0
    ? weakTopicsForQuiz[Math.floor(Math.random() * weakTopicsForQuiz.length)]
    : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Pomodoro Quick Start */}
      <Link
        href="/timer?mode=pomodoro"
        className="flex items-center gap-3 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl hover:border-orange-500/50 transition-all group"
      >
        <div className="p-2 bg-orange-500/20 rounded-lg group-hover:bg-orange-500/30 transition-colors">
          <Timer size={20} className="text-orange-400" />
        </div>
        <div>
          <span className="text-sm font-semibold text-slate-200 font-mono block">
            Pomodoro
          </span>
          <span className="text-xs text-slate-500 font-mono">
            25 мин фокус
          </span>
        </div>
      </Link>

      {/* Quick Quiz */}
      {randomWeakTopic ? (
        <Link
          href={`/quiz?subjectId=${randomWeakTopic.subject.id}&topicId=${randomWeakTopic.topic.id}&preset=quick`}
          className="flex items-center gap-3 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl hover:border-purple-500/50 transition-all group"
        >
          <div className="p-2 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
            <Brain size={20} className="text-purple-400" />
          </div>
          <div className="overflow-hidden">
            <span className="text-sm font-semibold text-slate-200 font-mono block">
              Бърз тест
            </span>
            <span className="text-xs text-slate-500 font-mono truncate block">
              {randomWeakTopic.topic.name.slice(0, 20)}...
            </span>
          </div>
        </Link>
      ) : (
        <Link
          href="/quiz"
          className="flex items-center gap-3 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl hover:border-purple-500/50 transition-all group"
        >
          <div className="p-2 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
            <Brain size={20} className="text-purple-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-200 font-mono block">
              Бърз тест
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Избери тема
            </span>
          </div>
        </Link>
      )}

      {/* Today's Plan */}
      <Link
        href="/today"
        className="flex items-center gap-3 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl hover:border-blue-500/50 transition-all group"
      >
        <div className="p-2 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/30 transition-colors">
          <ListTodo size={20} className="text-blue-400" />
        </div>
        <div>
          <span className="text-sm font-semibold text-slate-200 font-mono block">
            Днешен план
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Виж задачите
          </span>
        </div>
      </Link>
    </div>
  );
}
