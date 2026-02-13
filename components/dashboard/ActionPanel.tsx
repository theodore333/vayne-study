'use client';

import { useState, useMemo } from 'react';
import { Timer, Brain, ListTodo, Zap, CheckCircle, Circle, Plus, Trash2, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { Subject, DailyGoal } from '@/lib/types';
import { getTodayString } from '@/lib/algorithms';

interface ActionPanelProps {
  subjects: Subject[];
  goals: DailyGoal[];
  onAddGoal: (text: string, type: 'daily' | 'weekly') => void;
  onToggleGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
}

export default function ActionPanel({ subjects, goals, onAddGoal, onToggleGoal, onDeleteGoal }: ActionPanelProps) {
  const [newGoalText, setNewGoalText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const randomWeakTopic = useMemo(() => {
    const weak = subjects
      .filter(s => !s.archived && !s.deletedAt)
      .flatMap(s => s.topics
        .filter(t => (t.status === 'orange' || t.status === 'yellow') && t.material)
        .map(t => ({ topic: t, subject: s }))
      )
      .slice(0, 5);
    return weak.length > 0 ? weak[Math.floor(Math.random() * weak.length)] : null;
  }, [subjects]);

  const today = getTodayString();
  const safeGoals = goals || [];
  const todayGoals = safeGoals.filter(g => g.date === today || g.type === 'weekly');
  const completedCount = todayGoals.filter(g => g.completed).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalText.trim()) {
      onAddGoal(newGoalText.trim(), 'daily');
      setNewGoalText('');
      setIsAdding(false);
    }
  };

  return (
    <div className="rounded-xl p-5 border bg-[rgba(20,20,35,0.8)] border-[#1e293b]">
      {/* Quick Actions */}
      <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-3">
        <Zap size={16} className="text-cyan-400" />
        Бързи действия
      </h3>
      <div className="flex gap-2 mb-4">
        <Link href="/timer?mode=pomodoro" className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group">
          <div className="p-1 bg-orange-500/20 rounded-md group-hover:bg-orange-500/30">
            <Timer size={14} className="text-orange-400" />
          </div>
          <span className="text-xs font-medium text-slate-300 font-mono">Помодоро</span>
        </Link>
        <Link href={randomWeakTopic ? `/quiz?subject=${randomWeakTopic.subject.id}&topic=${randomWeakTopic.topic.id}&preset=quick` : '/quiz'} className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group">
          <div className="p-1 bg-purple-500/20 rounded-md group-hover:bg-purple-500/30">
            <Brain size={14} className="text-purple-400" />
          </div>
          <span className="text-xs font-medium text-slate-300 font-mono">Бърз тест</span>
        </Link>
        <Link href="/today" className="flex-1 flex items-center gap-2 p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors group">
          <div className="p-1 bg-blue-500/20 rounded-md group-hover:bg-blue-500/30">
            <ListTodo size={14} className="text-blue-400" />
          </div>
          <span className="text-xs font-medium text-slate-300 font-mono">План</span>
        </Link>
      </div>

      {/* Daily Goals */}
      <div className="border-t border-slate-700/50 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-400 font-mono flex items-center gap-1.5">
            <ListChecks size={13} className="text-cyan-400" />
            Цели за днес
            {todayGoals.length > 0 && (
              <span className="text-slate-500 ml-1">{completedCount}/{todayGoals.length}</span>
            )}
          </h4>
          {!isAdding && (
            <button onClick={() => setIsAdding(true)} className="p-0.5 hover:bg-slate-700 rounded transition-colors">
              <Plus size={14} className="text-cyan-400" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {todayGoals.length > 0 && (
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-3">
            <div className="h-full bg-cyan-500 transition-all duration-300 rounded-full" style={{ width: `${(completedCount / todayGoals.length) * 100}%` }} />
          </div>
        )}

        {/* Add goal form */}
        {isAdding && (
          <form onSubmit={handleSubmit} className="mb-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                placeholder="Напр. Преговор на Анатомия..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                autoFocus
              />
              <button type="submit" disabled={!newGoalText.trim()} className="px-2.5 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-mono hover:bg-cyan-500 transition-colors disabled:opacity-50">
                +
              </button>
              <button type="button" onClick={() => { setIsAdding(false); setNewGoalText(''); }} className="px-2.5 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs font-mono hover:bg-slate-600 transition-colors">
                x
              </button>
            </div>
          </form>
        )}

        {/* Goals list */}
        {todayGoals.length === 0 ? (
          <p className="text-xs text-slate-500 font-mono py-1">
            Няма цели.{' '}
            <button onClick={() => setIsAdding(true)} className="text-cyan-400 hover:text-cyan-300">Добави</button>
          </p>
        ) : (
          <div className="space-y-1.5">
            {todayGoals.map((goal) => (
              <div key={goal.id} className={`flex items-center gap-2 p-2 rounded-lg transition-all group ${goal.completed ? 'bg-cyan-500/10' : 'bg-slate-800/50 hover:bg-slate-800'}`}>
                <button onClick={() => onToggleGoal(goal.id)} className="flex-shrink-0">
                  {goal.completed ? <CheckCircle size={16} className="text-cyan-400" /> : <Circle size={16} className="text-slate-500 hover:text-cyan-400 transition-colors" />}
                </button>
                <span className={`flex-1 text-xs font-mono ${goal.completed ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                  {goal.text}
                </span>
                {goal.type === 'weekly' && (
                  <span className="text-[9px] text-purple-400 font-mono px-1 py-0.5 bg-purple-500/20 rounded">седм.</span>
                )}
                <button onClick={() => onDeleteGoal(goal.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded transition-all">
                  <Trash2 size={12} className="text-slate-500 hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Completion */}
        {todayGoals.length > 0 && completedCount === todayGoals.length && (
          <div className="mt-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-center">
            <span className="text-xs text-cyan-400 font-mono">Всички цели изпълнени!</span>
          </div>
        )}
      </div>
    </div>
  );
}
