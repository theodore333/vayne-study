'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Clock, Minimize2, Maximize2, Brain, Coffee, Pause, X } from 'lucide-react';
import { useApp } from '@/lib/context';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';

interface PomodoroState {
  phase: PomodoroPhase;
  count: number;
  endTime: number;
}

export default function FloatingTimer() {
  const { data, stopTimer } = useApp();
  const pathname = usePathname();
  const [elapsed, setElapsed] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // Pomodoro state from localStorage
  const [pomodoroState, setPomodoroState] = useState<PomodoroState | null>(null);
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(0);

  // Find active normal session
  const activeSession = data.timerSessions.find(s => s.endTime === null);

  // Don't show on timer page
  const isTimerPage = pathname === '/timer';

  // Load pomodoro state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkPomodoroState = () => {
      try {
        const saved = localStorage.getItem('pomodoro_state');
        if (saved) {
          const state = JSON.parse(saved) as PomodoroState;
          const now = Date.now();
          if (state.endTime && state.endTime > now) {
            setPomodoroState(state);
            setPomodoroTimeLeft(Math.ceil((state.endTime - now) / 1000));
          } else {
            setPomodoroState(null);
          }
        } else {
          setPomodoroState(null);
        }
      } catch (e) {
        setPomodoroState(null);
      }
    };

    checkPomodoroState();
    // Check every 500ms for changes
    const interval = setInterval(checkPomodoroState, 500);
    return () => clearInterval(interval);
  }, []);

  // Update pomodoro countdown
  useEffect(() => {
    if (!pomodoroState) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((pomodoroState.endTime - now) / 1000));
      setPomodoroTimeLeft(remaining);

      if (remaining <= 0) {
        setPomodoroState(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [pomodoroState]);

  // Normal timer tick
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

  const handleStopPomodoro = () => {
    localStorage.removeItem('pomodoro_state');
    setPomodoroState(null);
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
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Don't render if no active timer or on timer page
  const hasPomodoro = pomodoroState !== null;
  const hasNormalTimer = activeSession !== null;

  // Reset hidden state when timer stops
  useEffect(() => {
    if (!hasPomodoro && !hasNormalTimer) {
      setIsHidden(false);
    }
  }, [hasPomodoro, hasNormalTimer]);

  if (isTimerPage || isHidden || (!hasPomodoro && !hasNormalTimer)) return null;

  const subject = activeSession ? data.subjects.find(s => s.id === activeSession.subjectId) : null;
  const topic = subject?.topics.find(t => t.id === activeSession?.topicId);

  const getPhaseInfo = (phase: PomodoroPhase) => {
    switch (phase) {
      case 'work': return { label: 'Работа', icon: Brain, color: 'cyan' };
      case 'shortBreak': return { label: 'Почивка', icon: Coffee, color: 'green' };
      case 'longBreak': return { label: 'Дълга почивка', icon: Coffee, color: 'purple' };
    }
  };

  // Rating Modal (for normal timer)
  if (showRating && activeSession) {
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

  // Determine which timer to show (pomodoro takes priority)
  const isPomodoro = hasPomodoro;
  const phaseInfo = isPomodoro ? getPhaseInfo(pomodoroState!.phase) : null;
  const displayTime = isPomodoro ? pomodoroTimeLeft : elapsed;
  const timerColor = isPomodoro ? phaseInfo!.color : 'cyan';

  // Minimized view
  if (isMinimized) {
    const PhaseIcon = isPomodoro ? phaseInfo!.icon : null;
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
        <button
          onClick={() => setIsMinimized(false)}
          className={`flex items-center gap-2 px-4 py-2 backdrop-blur border rounded-full shadow-lg transition-all group ${
            isPomodoro
              ? phaseInfo!.color === 'cyan' ? 'bg-cyan-600/90 border-cyan-500/50 shadow-cyan-500/20'
              : phaseInfo!.color === 'green' ? 'bg-green-600/90 border-green-500/50 shadow-green-500/20'
              : 'bg-purple-600/90 border-purple-500/50 shadow-purple-500/20'
              : 'bg-cyan-600/90 border-cyan-500/50 shadow-cyan-500/20'
          } hover:scale-105`}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          {PhaseIcon && <PhaseIcon size={14} className="text-white/80" />}
          <span className="text-white font-mono font-bold">{formatTime(displayTime)}</span>
          <Maximize2 size={14} className="text-white/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        {/* Hide button */}
        <button
          onClick={() => setIsHidden(true)}
          className="p-2 bg-slate-800/90 hover:bg-red-600/80 border border-slate-600/50 hover:border-red-500/50 rounded-full shadow-lg transition-all text-slate-400 hover:text-white"
          title="Скрий (таймерът продължава)"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Full floating timer
  const PhaseIcon = isPomodoro ? phaseInfo!.icon : null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className={`backdrop-blur border rounded-2xl shadow-2xl overflow-hidden w-72 ${
        isPomodoro
          ? phaseInfo!.color === 'cyan' ? 'bg-[rgba(15,15,25,0.95)] border-cyan-500/30 shadow-cyan-500/10'
          : phaseInfo!.color === 'green' ? 'bg-[rgba(15,25,15,0.95)] border-green-500/30 shadow-green-500/10'
          : 'bg-[rgba(20,15,25,0.95)] border-purple-500/30 shadow-purple-500/10'
          : 'bg-[rgba(15,15,25,0.95)] border-cyan-500/30 shadow-cyan-500/10'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-2 border-b ${
          isPomodoro
            ? phaseInfo!.color === 'cyan' ? 'bg-cyan-500/10 border-cyan-500/20'
            : phaseInfo!.color === 'green' ? 'bg-green-500/10 border-green-500/20'
            : 'bg-purple-500/10 border-purple-500/20'
            : 'bg-cyan-500/10 border-cyan-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {isPomodoro && PhaseIcon ? (
              <>
                <PhaseIcon size={14} className={
                  phaseInfo!.color === 'cyan' ? 'text-cyan-400' :
                  phaseInfo!.color === 'green' ? 'text-green-400' : 'text-purple-400'
                } />
                <span className={`text-xs font-mono uppercase tracking-wider ${
                  phaseInfo!.color === 'cyan' ? 'text-cyan-400' :
                  phaseInfo!.color === 'green' ? 'text-green-400' : 'text-purple-400'
                }`}>
                  {phaseInfo!.label} #{pomodoroState!.count + 1}
                </span>
              </>
            ) : (
              <>
                <Clock size={14} className="text-cyan-400" />
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">Таймер</span>
              </>
            )}
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-slate-700/50 rounded transition-colors text-slate-400 hover:text-slate-200"
          >
            <Minimize2 size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Subject/Topic for normal timer */}
          {!isPomodoro && subject && (
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: subject.color }}
              />
              <span className="text-sm font-mono text-slate-200 truncate">
                {subject.name}
              </span>
              {topic && (
                <span className="text-xs font-mono text-slate-500">
                  #{topic.number}
                </span>
              )}
            </div>
          )}

          {/* Timer Display */}
          <div className={`text-4xl font-mono font-bold text-center mb-4 ${
            isPomodoro
              ? phaseInfo!.color === 'cyan' ? 'text-cyan-400'
              : phaseInfo!.color === 'green' ? 'text-green-400' : 'text-purple-400'
              : 'text-cyan-400'
          }`}>
            {formatTime(displayTime)}
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
              onClick={isPomodoro ? handleStopPomodoro : handleStop}
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
