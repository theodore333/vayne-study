'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Square, Clock, Minimize2, Maximize2, Brain, Coffee, X } from 'lucide-react';
import { useApp } from '@/lib/context';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';

interface PomodoroState {
  phase: PomodoroPhase;
  count: number;
  endTime: number | null;
  duration?: number;
  pendingRating?: boolean;
}

export default function FloatingTimer() {
  const { data, stopTimer } = useApp();
  const pathname = usePathname();
  const [elapsed, setElapsed] = useState(0);
  const [showRating, setShowRating] = useState(false);
  // User preferences - these reset when component unmounts (timer stops)
  const [userWantsMinimized, setUserWantsMinimized] = useState(false);
  const [userWantsHidden, setUserWantsHidden] = useState(false);

  // Pomodoro state from localStorage
  const [pomodoroState, setPomodoroState] = useState<PomodoroState | null>(null);
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(0);

  // Use ref instead of state to prevent race condition with multiple intervals
  const hasPlayedSoundRef = useRef(false);

  // Audio ref
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play notification sound
  // IMPORTANT: Check pathname directly to avoid race conditions during navigation
  const playSound = useCallback(() => {
    // Double-check we're not on timer page (race condition prevention)
    if (typeof window !== 'undefined' && window.location.pathname === '/timer') {
      return;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      // Pleasant chime: C5 -> E5 -> G5
      playTone(523.25, now, 0.3);
      playTone(659.25, now + 0.15, 0.3);
      playTone(783.99, now + 0.3, 0.5);
    } catch {
      // Audio not available - fail silently
    }
  }, []);

  // Show browser notification
  const showNotification = useCallback((title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'pomodoro-timer',
        requireInteraction: true
      });
    }
  }, []);

  // Find active normal session
  const activeSession = data.timerSessions.find(s => s.endTime === null);

  // Don't show on timer page
  const isTimerPage = pathname === '/timer';

  // Load pomodoro state from localStorage
  // IMPORTANT: Don't handle expiry on timer page - let the timer page handle it
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip everything if on timer page - check both React state and actual location
    // This prevents race conditions during navigation
    const actuallyOnTimerPage = isTimerPage || window.location.pathname === '/timer';

    const checkPomodoroState = () => {
      // Skip if on timer page - timer page handles its own state
      if (actuallyOnTimerPage) {
        setPomodoroState(null);
        hasPlayedSoundRef.current = false;
        return;
      }

      try {
        const saved = localStorage.getItem('pomodoro_state');
        if (saved) {
          const state = JSON.parse(saved) as PomodoroState;
          const now = Date.now();

          // Track running timers OR pending breaks OR pending rating
          const isPendingBreak = !state.endTime && state.phase !== 'work';
          const hasPendingRating = state.pendingRating === true;
          if (!state.endTime && !isPendingBreak && !hasPendingRating) {
            setPomodoroState(null);
            return;
          }

          setPomodoroState(state);
          const remaining = state.endTime ? Math.max(0, Math.ceil((state.endTime - now) / 1000)) : 0;
          setPomodoroTimeLeft(remaining);

          // If timer expired while on other pages, play sound (but NOT on timer page)
          if (state.endTime && state.endTime <= now && !hasPlayedSoundRef.current && !actuallyOnTimerPage) {
            playSound();
            hasPlayedSoundRef.current = true;

            const phaseLabel = state.phase === 'work'
              ? `Pomodoro #${state.count + 1} завърши!`
              : 'Почивката свърши!';
            const phaseBody = state.phase === 'work'
              ? 'Време за почивка!'
              : 'Време за работа!';

            showNotification(phaseLabel, phaseBody);

            // Don't clear localStorage - let timer page handle state transitions
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
  }, [playSound, showNotification, isTimerPage]);

  // Update pomodoro countdown
  useEffect(() => {
    if (!pomodoroState || isTimerPage) {
      hasPlayedSoundRef.current = false;
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = pomodoroState.endTime ? Math.max(0, Math.ceil((pomodoroState.endTime - now) / 1000)) : 0;
      setPomodoroTimeLeft(remaining);

      if (remaining <= 0 && pomodoroState.endTime && !hasPlayedSoundRef.current && !isTimerPage) {
        // Play sound and show notification when timer ends (not on timer page)
        playSound();
        hasPlayedSoundRef.current = true;

        const phaseLabel = pomodoroState.phase === 'work'
          ? `Pomodoro #${pomodoroState.count + 1} завърши!`
          : 'Почивката свърши!';
        const phaseBody = pomodoroState.phase === 'work'
          ? 'Време за почивка!'
          : 'Време за работа!';

        showNotification(phaseLabel, phaseBody);

        // DON'T clear state - mark as expired so user can see it ended
        // The timer page will handle the actual state transition
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [pomodoroState, playSound, showNotification, isTimerPage]);

  // Handle visibility change - play sound if timer expired while hidden (not on timer page)
  useEffect(() => {
    if (typeof window === 'undefined' || isTimerPage) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pomodoroState && !isTimerPage) {
        const now = Date.now();
        if (pomodoroState.endTime && pomodoroState.endTime <= now && !hasPlayedSoundRef.current) {
          playSound();
          hasPlayedSoundRef.current = true;

          const phaseLabel = pomodoroState.phase === 'work'
            ? `Pomodoro #${pomodoroState.count + 1} завърши!`
            : 'Почивката свърши!';
          showNotification(phaseLabel, 'Таймерът приключи докато беше минимизиран');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pomodoroState, playSound, showNotification, isTimerPage]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

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
  // Pomodoro states:
  // - Running: has endTime and time remaining > 0
  // - Expired: has endTime but time remaining = 0 (work finished, waiting to start break)
  // - Pending break: phase is break but no endTime (waiting to start break timer)
  // - Pending rating: pendingRating flag is true
  const isPendingBreak = pomodoroState !== null && pomodoroState.phase !== 'work' && !pomodoroState.endTime;
  const isPendingRating = pomodoroState !== null && pomodoroState.pendingRating === true;
  const isExpired = pomodoroState !== null && pomodoroState.endTime !== null && pomodoroTimeLeft <= 0;
  const hasPomodoro = pomodoroState !== null && (pomodoroTimeLeft > 0 || isPendingBreak || isPendingRating || isExpired);
  // Normal timer: must have active session AND have been running for at least 1 second
  const hasNormalTimer = activeSession !== null && elapsed > 0;

  // Derive actual visibility from user preference AND timer state
  // When timers stop, these naturally become false (no need for useEffect reset)
  const isMinimized = userWantsMinimized && (hasPomodoro || hasNormalTimer);
  const isHidden = userWantsHidden && (hasPomodoro || hasNormalTimer);

  // Don't show if nothing is actually running
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
          onClick={() => setUserWantsMinimized(false)}
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
          <span className="text-white font-mono font-bold">{isPendingRating ? 'Оценка!' : isPendingBreak ? 'Почивка!' : isExpired ? 'Свърши!' : formatTime(displayTime)}</span>
          <Maximize2 size={14} className="text-white/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        {/* Hide button */}
        <button
          onClick={() => setUserWantsHidden(true)}
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
            onClick={() => setUserWantsMinimized(true)}
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
          {isPendingRating ? (
            <div className="text-center mb-4">
              <div className="text-lg font-mono text-cyan-400 mb-2">
                🍅 Pomodoro завърши!
              </div>
              <div className="text-sm text-slate-400 font-mono">
                Оцени сесията в таймера
              </div>
            </div>
          ) : isPendingBreak ? (
            <div className="text-center mb-4">
              <div className="text-lg font-mono text-green-400 mb-2">
                Pomodoro #{pomodoroState!.count} завърши!
              </div>
              <div className="text-sm text-slate-400 font-mono">
                {pomodoroState!.phase === 'shortBreak' ? 'Кратка почивка' : 'Дълга почивка'}
              </div>
            </div>
          ) : isExpired && pomodoroState ? (
            <div className="text-center mb-4">
              <div className="text-lg font-mono text-amber-400 mb-2">
                {pomodoroState.phase === 'work' ? '🍅 Pomodoro завърши!' : '☕ Почивката свърши!'}
              </div>
              <div className="text-sm text-slate-400 font-mono">
                {pomodoroState.phase === 'work'
                  ? 'Оцени сесията и започни почивка'
                  : 'Време за нов pomodoro!'
                }
              </div>
            </div>
          ) : (
            <div className={`text-4xl font-mono font-bold text-center mb-4 ${
              isPomodoro
                ? phaseInfo!.color === 'cyan' ? 'text-cyan-400'
                : phaseInfo!.color === 'green' ? 'text-green-400' : 'text-purple-400'
                : 'text-cyan-400'
            }`}>
              {formatTime(displayTime)}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            <Link
              href="/timer"
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors font-mono text-sm ${
                isPendingRating || isExpired
                  ? 'bg-amber-600/80 hover:bg-amber-600 text-white'
                  : isPendingBreak
                    ? 'bg-green-600/80 hover:bg-green-600 text-white'
                    : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {isPendingRating ? (
                <>⭐ Оцени сесията</>
              ) : isPendingBreak ? (
                <>▶ Започни почивка</>
              ) : isExpired ? (
                <>🍅 Виж таймера</>
              ) : (
                <><Clock size={16} />Детайли</>
              )}
            </Link>
            {!isPendingBreak && !isPendingRating && !isExpired && (
              <button
                onClick={isPomodoro ? handleStopPomodoro : handleStop}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors font-mono text-sm"
              >
                <Square size={16} />
                Спри
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
