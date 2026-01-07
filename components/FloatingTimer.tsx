'use client';

import { useState, useEffect } from 'react';
import { Play, Square, Clock, X, Minimize2, Maximize2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import Link from 'next/link';

export default function FloatingTimer() {
  const { data, stopTimer } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Find active session
  const activeSession = data.timerSessions.find(s => s.endTime === null);

  // Timer tick
  useEffect(() => {
    if (!activeSession) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      const start = new Date(activeSession.startTime).getTime();
      const now = new Date().getTime();
      setElapsed(Math.floor((now - start) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const handleStop = () => {
    setShowRating(true);
  };

  const handleRatingSubmit = (rating: number | null) => {
    stopTimer(rating);
    setShowRating(false);
    setElapsed(0);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Don't render if no active session
  if (!activeSession) return null;

  const subject = data.subjects.find(s => s.id === activeSession.subjectId);
  const topic = subject?.topics.find(t => t.id === activeSession.topicId);

  // Rating Modal
  if (showRating) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-sm">
          <h3 className="text-lg font-semibold text-slate-100 mb-4 font-mono text-center">
            Как мина сесията?
          </h3>
          <p className="text-sm text-slate-400 mb-2 text-center font-mono">
            {subject?.name} {topic && `• #${topic.number}`}
          </p>
          <p className="text-lg text-cyan-400 mb-4 text-center font-mono font-bold">
            {formatTime(elapsed)} ({Math.round(elapsed / 60)} мин)
          </p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {[1, 2, 3, 4, 5].map(rating => (
              <button
                key={rating}
                onClick={() => handleRatingSubmit(rating)}
                className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-cyan-500 hover:bg-cyan-500/10 transition-all text-2xl"
              >
                {rating === 1 ? '😴' : rating === 2 ? '😕' : rating === 3 ? '😐' : rating === 4 ? '😊' : '🔥'}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleRatingSubmit(null)}
            className="w-full py-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm"
          >
            Пропусни оценката
          </button>
        </div>
      </div>
    );
  }

  // Minimized view - just a small floating pill
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600/90 backdrop-blur border border-cyan-500/50 rounded-full shadow-lg shadow-cyan-500/20 hover:bg-cyan-500/90 transition-all group"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-white font-mono font-bold">{formatTime(elapsed)}</span>
          <Maximize2 size={14} className="text-cyan-200 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    );
  }

  // Full floating timer
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="bg-[rgba(15,15,25,0.95)] backdrop-blur border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden w-72">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-cyan-400" />
            <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">Таймер активен</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 hover:bg-slate-700/50 rounded transition-colors text-slate-400 hover:text-slate-200"
            >
              <Minimize2 size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Subject/Topic */}
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: subject?.color || '#06b6d4' }}
            />
            <span className="text-sm font-mono text-slate-200 truncate">
              {subject?.name || 'Учене'}
            </span>
            {topic && (
              <span className="text-xs font-mono text-slate-500">
                #{topic.number}
              </span>
            )}
          </div>

          {/* Timer Display */}
          <div className="text-4xl font-mono font-bold text-cyan-400 text-center mb-4">
            {formatTime(elapsed)}
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <Link
              href="/timer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors font-mono text-sm"
            >
              <Clock size={16} />
              Детайли
            </Link>
            <button
              onClick={handleStop}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors font-mono text-sm"
            >
              <Square size={16} />
              Спри
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
