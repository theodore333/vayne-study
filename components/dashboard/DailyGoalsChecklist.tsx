'use client';

import { useState } from 'react';
import { CheckCircle, Circle, Plus, Trash2, ListChecks } from 'lucide-react';
import { DailyGoal } from '@/lib/types';

interface DailyGoalsChecklistProps {
  goals: DailyGoal[];
  onAddGoal: (text: string, type: 'daily' | 'weekly') => void;
  onToggleGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
}

export default function DailyGoalsChecklist({
  goals,
  onAddGoal,
  onToggleGoal,
  onDeleteGoal
}: DailyGoalsChecklistProps) {
  const [newGoalText, setNewGoalText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Filter goals for today (handle undefined/null gracefully)
  const today = new Date().toISOString().split('T')[0];
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
    <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2">
          <ListChecks size={16} className="text-cyan-400" />
          Цели за днес
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono">
            {completedCount}/{todayGoals.length}
          </span>
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
              title="Добави цел"
            >
              <Plus size={16} className="text-cyan-400" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {todayGoals.length > 0 && (
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-cyan-500 transition-all duration-300 rounded-full"
            style={{ width: `${(completedCount / todayGoals.length) * 100}%` }}
          />
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
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
              autoFocus
            />
            <button
              type="submit"
              disabled={!newGoalText.trim()}
              className="px-3 py-2 bg-cyan-600 text-white rounded-lg text-sm font-mono hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Добави
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewGoalText('');
              }}
              className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm font-mono hover:bg-slate-600 transition-colors"
            >
              Откажи
            </button>
          </div>
        </form>
      )}

      {/* Goals list */}
      <div className="space-y-2">
        {todayGoals.length === 0 ? (
          <p className="text-sm text-slate-500 font-mono text-center py-4">
            Няма цели за днес. Добави една! 🎯
          </p>
        ) : (
          todayGoals.map((goal) => (
            <div
              key={goal.id}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all group ${
                goal.completed
                  ? 'bg-cyan-500/10 border border-cyan-500/20'
                  : 'bg-slate-800/50 hover:bg-slate-800'
              }`}
            >
              <button
                onClick={() => onToggleGoal(goal.id)}
                className="flex-shrink-0"
              >
                {goal.completed ? (
                  <CheckCircle size={20} className="text-cyan-400" />
                ) : (
                  <Circle size={20} className="text-slate-500 hover:text-cyan-400 transition-colors" />
                )}
              </button>
              <span className={`flex-1 text-sm font-mono ${
                goal.completed ? 'text-slate-400 line-through' : 'text-slate-200'
              }`}>
                {goal.text}
              </span>
              {goal.type === 'weekly' && (
                <span className="text-[10px] text-purple-400 font-mono px-1.5 py-0.5 bg-purple-500/20 rounded">
                  седмична
                </span>
              )}
              <button
                onClick={() => onDeleteGoal(goal.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-all"
              >
                <Trash2 size={14} className="text-slate-500 hover:text-red-400" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Completion message */}
      {todayGoals.length > 0 && completedCount === todayGoals.length && (
        <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-center">
          <span className="text-sm text-cyan-400 font-mono">
            🎉 Всички цели изпълнени! Браво!
          </span>
        </div>
      )}
    </div>
  );
}
