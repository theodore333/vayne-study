'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Square, Clock, BookOpen, Target, Settings, RotateCcw, Coffee, Brain, TrendingUp, Calendar, Volume2, VolumeX, History, BarChart3, GraduationCap, FileText, Plus, X } from 'lucide-react';
import { useApp } from '@/lib/context';

type TimerMode = 'normal' | 'pomodoro';
type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';
type TabType = 'timer' | 'stats';

export default function TimerPage() {
  const { data, startTimer, stopTimerWithNote, addPomodoroSession, updatePomodoroSettings, updateStudyGoals, updateAcademicPeriod } = useApp();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('timer');

  // Timer state
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [distractionNote, setDistractionNote] = useState('');
  const [normalTimerPausedAt, setNormalTimerPausedAt] = useState<number | null>(null); // For normal timer pause
  const [showStopConfirm, setShowStopConfirm] = useState(false); // Confirmation before stopping pomodoro

  // Mode state
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(0);
  const [pomodoroEndTime, setPomodoroEndTime] = useState<number | null>(null); // When current phase ends

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Manual time entry
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualHours, setManualHours] = useState(0);
  const [manualMinutes, setManualMinutes] = useState(30);
  const [manualSubject, setManualSubject] = useState('');
  const [manualNote, setManualNote] = useState('');

  // Audio context
  const audioContextRef = useRef<AudioContext | null>(null);

  const settings = data.pomodoroSettings;
  const goals = data.studyGoals;
  const academicPeriod = data.academicPeriod;

  // Find active session
  const activeSession = data.timerSessions.find(s => s.endTime === null);

  // Track if we need to complete a missed pomodoro (expired while tab closed)
  const [pendingCompletion, setPendingCompletion] = useState<{ phase: PomodoroPhase; count: number; duration: number } | null>(null);
  const [isPaused, setIsPaused] = useState(false); // Track if timer is paused vs stopped

  // Restore Pomodoro state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem('pomodoro_state');
      if (saved) {
        const state = JSON.parse(saved);
        const now = Date.now();

        // Always restore count and phase (even if paused)
        setPomodoroPhase(state.phase || 'work');
        setPomodoroCount(state.count || 0);
        setTimerMode('pomodoro');

        // Add 1 second margin to avoid race conditions with nearly-expired timers
        // If timer has less than 1 second left, treat it as expired
        const EXPIRY_MARGIN = 1000; // 1 second

        if (state.endTime && state.endTime > now + EXPIRY_MARGIN) {
          // Timer is still running with enough time left
          setPomodoroEndTime(state.endTime);
          setIsRunning(true);
        } else if (state.endTime && state.endTime <= now + EXPIRY_MARGIN) {
          // Timer expired (or nearly expired) while tab was closed - mark for completion (no sound)
          // Use saved duration if available, otherwise fall back to current settings
          const duration = state.duration || (state.phase === 'work' ? 25 : state.phase === 'shortBreak' ? 5 : 15);
          setPendingCompletion({ phase: state.phase, count: state.count || 0, duration });
          setPomodoroEndTime(null);
          setIsRunning(false);
        } else if (state.pausedTimeLeft && state.pausedTimeLeft > 0) {
          // Timer was paused - restore the remaining time
          setPomodoroTimeLeft(state.pausedTimeLeft);
          setIsPaused(true);
          setIsRunning(false);
        }
        // If no endTime and no pausedTimeLeft, timer was stopped - just restore count/phase
      }
    } catch (e) {
      console.error('Failed to restore pomodoro state:', e);
    }
    setInitialized(true);
  }, []);

  // Save Pomodoro state to localStorage (persist count even when paused)
  useEffect(() => {
    if (!initialized || typeof window === 'undefined') return;

    if (timerMode === 'pomodoro') {
      // Calculate duration based on phase
      const phaseDuration = pomodoroPhase === 'work'
        ? settings.workDuration
        : pomodoroPhase === 'shortBreak'
          ? settings.shortBreakDuration
          : settings.longBreakDuration;

      const state = {
        phase: pomodoroPhase,
        count: pomodoroCount,
        endTime: isRunning ? pomodoroEndTime : null, // Only save endTime if running
        pausedTimeLeft: isPaused ? pomodoroTimeLeft : null, // Save remaining time if paused
        duration: phaseDuration, // Save the duration so we know what was recorded
        savedAt: Date.now()
      };
      localStorage.setItem('pomodoro_state', JSON.stringify(state));
    }
  }, [isRunning, timerMode, pomodoroPhase, pomodoroCount, pomodoroEndTime, pomodoroTimeLeft, isPaused, initialized, settings]);

  // Initialize pomodoro time (only if not restored from localStorage and not paused)
  useEffect(() => {
    if (!initialized) return;
    // Don't reset time if paused - we want to preserve the remaining time
    if (timerMode === 'pomodoro' && !isRunning && !pomodoroEndTime && !pendingCompletion && !isPaused) {
      const duration = pomodoroPhase === 'work'
        ? settings.workDuration
        : pomodoroPhase === 'shortBreak'
          ? settings.shortBreakDuration
          : settings.longBreakDuration;
      setPomodoroTimeLeft(duration * 60);
    }
  }, [timerMode, pomodoroPhase, settings, isRunning, pomodoroEndTime, initialized, pendingCompletion, isPaused]);

  // Restore active session - if there's an active session, switch to normal mode and restore it
  useEffect(() => {
    if (activeSession) {
      // If there's an active normal timer session, switch to normal mode and restore
      if (timerMode !== 'normal') {
        setTimerMode('normal');
      }
      setIsRunning(true);
      setSelectedSubject(activeSession.subjectId);
      setSelectedTopic(activeSession.topicId || null);
      // Calculate and set elapsed time immediately
      const start = new Date(activeSession.startTime).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    }
  }, [activeSession]); // Removed timerMode from deps to avoid loop

  // Normal timer tick
  useEffect(() => {
    if (!initialized || !isRunning || timerMode !== 'normal' || !activeSession) return;

    // Update elapsed immediately
    const updateElapsed = () => {
      const start = new Date(activeSession.startTime).getTime();
      const now = new Date().getTime();
      setElapsed(Math.floor((now - start) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [initialized, isRunning, timerMode, activeSession]);

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      // Space: Start/Pause
      if (e.code === 'Space' && !showRating && !showManualEntry && !showStopConfirm && activeTab === 'timer') {
        e.preventDefault();
        if (isRunning) {
          handlePause();
        } else {
          handleStart();
        }
      }

      // Escape: Close modals or stop timer
      if (e.code === 'Escape') {
        if (showStopConfirm) {
          setShowStopConfirm(false);
        } else if (showManualEntry) {
          setShowManualEntry(false);
        } else if (showRating) {
          // Don't close rating modal with Escape - user must choose
        }
      }

      // R: Reset (only when not running)
      if (e.code === 'KeyR' && !isRunning && !showRating && !showManualEntry && activeTab === 'timer') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, showRating, showManualEntry, showStopConfirm, activeTab]);

  const showNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined') return;

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/icon-192.png',
          tag: 'pomodoro-timer',
          requireInteraction: true
        });
      } catch (e) {
        console.error('Notification error:', e);
      }
    }
  }, []);

  // Handle pending completion (timer expired while tab was closed)
  useEffect(() => {
    if (!initialized || !pendingCompletion) return;

    // Complete the missed pomodoro
    if (pendingCompletion.phase === 'work') {
      // Record the completed work session with the SAVED duration (not current settings)
      addPomodoroSession(pendingCompletion.duration, selectedSubject || undefined, selectedTopic);

      const newCount = pendingCompletion.count + 1;
      setPomodoroCount(newCount);

      // Long break after every N pomodoros
      const isLongBreak = newCount % settings.longBreakAfter === 0;
      const nextPhase: PomodoroPhase = isLongBreak ? 'longBreak' : 'shortBreak';
      const breakDuration = isLongBreak ? settings.longBreakDuration : settings.shortBreakDuration;

      console.log(`[Pending] Work complete. Count: ${newCount}, isLongBreak: ${isLongBreak}, nextPhase: ${nextPhase}, duration: ${pendingCompletion.duration}m`);

      setPomodoroPhase(nextPhase);
      setPomodoroTimeLeft(breakDuration * 60);
      setIsPaused(false);

      // Show notification that we recorded the missed pomodoro
      showNotification(
        `Pomodoro #${newCount} записан! (${pendingCompletion.duration}м)`,
        isLongBreak ? 'Време за ДЪЛГА почивка!' : 'Таймерът изтече докато беше в друг таб'
      );
    } else {
      // Break ended
      setPomodoroPhase('work');
      setPomodoroTimeLeft(settings.workDuration * 60);
      setIsPaused(false);
    }

    setPendingCompletion(null);
  }, [initialized, pendingCompletion, settings, addPomodoroSession, selectedSubject, selectedTopic, showNotification]);

  const playSound = useCallback(async () => {
    if (!settings.soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
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
      playTone(523.25, now, 0.3);
      playTone(659.25, now + 0.15, 0.3);
      playTone(783.99, now + 0.3, 0.4);
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  }, [settings.soundEnabled]);

  const handlePomodoroComplete = useCallback(() => {
    playSound();
    setPomodoroEndTime(null);
    setIsRunning(false);
    setIsPaused(false); // Clear paused state on completion

    if (pomodoroPhase === 'work') {
      // Record completed work session
      addPomodoroSession(settings.workDuration, selectedSubject || undefined, selectedTopic);

      const newCount = pomodoroCount + 1;
      setPomodoroCount(newCount);

      // Long break after every N pomodoros (e.g., 4th, 8th, 12th...)
      const isLongBreak = newCount % settings.longBreakAfter === 0;
      const nextPhase: PomodoroPhase = isLongBreak ? 'longBreak' : 'shortBreak';
      const breakDuration = isLongBreak ? settings.longBreakDuration : settings.shortBreakDuration;

      console.log(`[Pomodoro] Work complete. Count: ${newCount}, isLongBreak: ${isLongBreak}, nextPhase: ${nextPhase}`);

      // Show notification
      showNotification(
        `Pomodoro #${newCount} завърши!`,
        isLongBreak ? `Време за ДЪЛГА почивка (${breakDuration} мин)` : `Време за почивка (${breakDuration} мин)`
      );

      // Set next phase and time
      setPomodoroPhase(nextPhase);
      setPomodoroTimeLeft(breakDuration * 60);

      if (settings.autoStartBreaks) {
        setTimeout(() => {
          setPomodoroEndTime(Date.now() + breakDuration * 60 * 1000);
          setIsRunning(true);
        }, 100);
      }
    } else {
      // Show notification for break end
      showNotification('Почивката свърши!', 'Време е за работа');

      setPomodoroPhase('work');
      setPomodoroTimeLeft(settings.workDuration * 60);

      if (settings.autoStartWork) {
        setTimeout(() => {
          setPomodoroEndTime(Date.now() + settings.workDuration * 60 * 1000);
          setIsRunning(true);
        }, 100);
      }
    }
  }, [pomodoroPhase, pomodoroCount, settings, playSound, showNotification, addPomodoroSession, selectedSubject, selectedTopic]);

  // Handle visibility change - catch expired timers when tab becomes visible
  // Only run after initialization to prevent double-handling of expired timers
  useEffect(() => {
    if (typeof window === 'undefined' || !initialized) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pomodoroEndTime && timerMode === 'pomodoro' && isRunning) {
        const now = Date.now();
        if (pomodoroEndTime <= now) {
          // Timer expired while tab was hidden - trigger completion
          handlePomodoroComplete();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [initialized, pomodoroEndTime, timerMode, isRunning, handlePomodoroComplete]);

  // Pomodoro timer tick - uses actual time to survive background throttling
  // IMPORTANT: Only run after initialization to prevent sound on page load for expired timers
  useEffect(() => {
    if (!initialized || !isRunning || timerMode !== 'pomodoro' || !pomodoroEndTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((pomodoroEndTime - now) / 1000));
      setPomodoroTimeLeft(remaining);

      if (remaining <= 0) {
        handlePomodoroComplete();
      }
    };

    // Update immediately
    updateTimer();

    // Then update every 100ms for smoother display (catches up when tab becomes active)
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [initialized, isRunning, timerMode, pomodoroEndTime, handlePomodoroComplete]);

  const handleStart = () => {
    if (timerMode === 'normal') {
      // If resuming from pause (activeSession exists), just continue
      if (activeSession && isPaused) {
        setIsPaused(false);
        setNormalTimerPausedAt(null);
      } else if (!activeSession) {
        // Start new session - subject is optional, use 'general' as fallback
        startTimer(selectedSubject || 'general', selectedTopic);
        setElapsed(0);
      }
    }
    if (timerMode === 'pomodoro') {
      // Set end time based on current remaining time
      const duration = pomodoroTimeLeft > 0 ? pomodoroTimeLeft : (
        pomodoroPhase === 'work' ? settings.workDuration * 60 :
        pomodoroPhase === 'shortBreak' ? settings.shortBreakDuration * 60 :
        settings.longBreakDuration * 60
      );
      setPomodoroEndTime(Date.now() + duration * 1000);
      setIsPaused(false); // Clear paused state when starting
    }
    setIsRunning(true);
  };

  const handlePause = () => {
    if (timerMode === 'pomodoro') {
      // pomodoroTimeLeft is already updated by the timer tick, so just stop
      setPomodoroEndTime(null);
      setIsRunning(false);
      setIsPaused(true); // Mark as paused to preserve remaining time
    } else {
      // Normal timer pause - store the current elapsed time
      setNormalTimerPausedAt(elapsed);
      setIsRunning(false);
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    if (timerMode === 'normal') {
      setNormalTimerPausedAt(null);
      setIsPaused(false);
      setShowRating(true);
    } else {
      // Show confirmation for pomodoro if timer has been running for more than 30 seconds
      const fullDuration = pomodoroPhase === 'work'
        ? settings.workDuration * 60
        : pomodoroPhase === 'shortBreak'
          ? settings.shortBreakDuration * 60
          : settings.longBreakDuration * 60;

      let actualRemaining = pomodoroTimeLeft;
      if (isRunning && pomodoroEndTime) {
        actualRemaining = Math.max(0, Math.ceil((pomodoroEndTime - Date.now()) / 1000));
      }

      const timeWorked = fullDuration - actualRemaining;
      if (timeWorked > 30 && pomodoroPhase === 'work') {
        setShowStopConfirm(true);
      } else {
        confirmPomodoroStop();
      }
    }
  };

  const confirmPomodoroStop = () => {
    // Calculate time worked before stopping
    const fullDuration = pomodoroPhase === 'work'
      ? settings.workDuration * 60
      : pomodoroPhase === 'shortBreak'
        ? settings.shortBreakDuration * 60
        : settings.longBreakDuration * 60;

    // Get actual remaining time - if timer is running, calculate from endTime
    let actualRemaining = pomodoroTimeLeft;
    if (isRunning && pomodoroEndTime) {
      actualRemaining = Math.max(0, Math.ceil((pomodoroEndTime - Date.now()) / 1000));
    }

    const timeWorked = fullDuration - actualRemaining;
    const minutesWorked = Math.floor(timeWorked / 60);

    console.log(`[Pomodoro Stop] Phase: ${pomodoroPhase}, Full: ${fullDuration}s, Remaining: ${actualRemaining}s, Worked: ${timeWorked}s (${minutesWorked}m)`);

    // Record partial pomodoro if it was a work phase and at least 1 minute worked
    if (pomodoroPhase === 'work' && minutesWorked >= 1) {
      addPomodoroSession(minutesWorked, selectedSubject || undefined, selectedTopic);
      console.log(`[Pomodoro Stop] Recorded ${minutesWorked} minutes`);
    }

    setIsRunning(false);
    setPomodoroEndTime(null);
    setIsPaused(false);
    setPomodoroPhase('work');
    setPomodoroTimeLeft(settings.workDuration * 60);
    setShowStopConfirm(false);
    // Don't reset pomodoroCount - keep the completed count
  };

  const handleRatingSubmit = (rating: number | null) => {
    stopTimerWithNote(rating, distractionNote.trim() || undefined);
    setIsRunning(false);
    setShowRating(false);
    setElapsed(0);
    setDistractionNote('');
  };

  const handleSkipBreak = () => {
    setPomodoroPhase('work');
    setPomodoroTimeLeft(settings.workDuration * 60);
    setPomodoroEndTime(null);
    setIsRunning(false);
    setIsPaused(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setPomodoroEndTime(null);
    setIsPaused(false);
    setPomodoroPhase('work');
    setPomodoroTimeLeft(settings.workDuration * 60);
    setPomodoroCount(0);
    setElapsed(0);
    setNormalTimerPausedAt(null);
    setSelectedTopic(null); // Reset topic on mode change/reset
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedSubjectData = data.subjects.find(s => s.id === selectedSubject);
  const topics = selectedSubjectData?.topics || [];

  // Statistics calculations
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Today
    const todaySessions = data.timerSessions.filter(s => s.startTime.startsWith(today) && s.endTime !== null);
    const todayMinutes = todaySessions.reduce((acc, s) => acc + s.duration, 0);

    // This week (Monday start)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekSessions = data.timerSessions.filter(s => {
      const d = new Date(s.startTime);
      return d >= weekStart && s.endTime !== null;
    });
    const weekMinutes = weekSessions.reduce((acc, s) => acc + s.duration, 0);

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSessions = data.timerSessions.filter(s => {
      const d = new Date(s.startTime);
      return d >= monthStart && s.endTime !== null;
    });
    const monthMinutes = monthSessions.reduce((acc, s) => acc + s.duration, 0);

    // Semester stats
    let semesterMinutes = 0;
    let semesterDays = 0;
    if (academicPeriod.semesterStart && academicPeriod.semesterEnd) {
      const semStart = new Date(academicPeriod.semesterStart);
      const semEnd = new Date(academicPeriod.semesterEnd);
      semesterDays = Math.ceil((Math.min(now.getTime(), semEnd.getTime()) - semStart.getTime()) / (1000 * 60 * 60 * 24));
      const semSessions = data.timerSessions.filter(s => {
        const d = new Date(s.startTime);
        return d >= semStart && d <= semEnd && s.endTime !== null;
      });
      semesterMinutes = semSessions.reduce((acc, s) => acc + s.duration, 0);
    }

    // Session (exam) stats
    let sessionMinutes = 0;
    let sessionDays = 0;
    let isInSession = false;
    if (academicPeriod.sessionStart && academicPeriod.sessionEnd) {
      const sessStart = new Date(academicPeriod.sessionStart);
      const sessEnd = new Date(academicPeriod.sessionEnd);
      isInSession = now >= sessStart && now <= sessEnd;
      sessionDays = Math.ceil((Math.min(now.getTime(), sessEnd.getTime()) - sessStart.getTime()) / (1000 * 60 * 60 * 24));
      const sessSessions = data.timerSessions.filter(s => {
        const d = new Date(s.startTime);
        return d >= sessStart && d <= sessEnd && s.endTime !== null;
      });
      sessionMinutes = sessSessions.reduce((acc, s) => acc + s.duration, 0);
    }

    // Streak - count consecutive days with study sessions
    const dates = new Set(data.timerSessions.filter(s => s.endTime !== null).map(s => s.startTime.split('T')[0]));
    let streak = 0;
    const checkDate = new Date();

    // First check today
    const todayStr = checkDate.toISOString().split('T')[0];
    if (dates.has(todayStr)) {
      streak = 1;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // If no session today, check if yesterday had a session (streak can still continue)
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayStr = checkDate.toISOString().split('T')[0];
      if (!dates.has(yesterdayStr)) {
        // No session today or yesterday - streak is 0
        streak = 0;
      } else {
        streak = 1;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    // Count backwards from the starting point
    if (streak > 0) {
      while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (dates.has(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // By subject this month
    const bySubject: Record<string, number> = {};
    monthSessions.forEach(s => {
      bySubject[s.subjectId] = (bySubject[s.subjectId] || 0) + s.duration;
    });

    // Distractions
    const distractions = data.timerSessions
      .filter(s => s.distractionNote && s.distractionNote.trim())
      .slice(-20)
      .reverse();

    return {
      today, todayMinutes, weekMinutes, monthMinutes,
      semesterMinutes, semesterDays, sessionMinutes, sessionDays, isInSession,
      streak, bySubject, distractions
    };
  }, [data.timerSessions, academicPeriod]);

  const dailyProgress = Math.min(100, (stats.todayMinutes / goals.dailyMinutes) * 100);
  const weeklyProgress = Math.min(100, (stats.weekMinutes / goals.weeklyMinutes) * 100);
  const monthlyProgress = Math.min(100, (stats.monthMinutes / goals.monthlyMinutes) * 100);

  const getPhaseConfig = () => {
    switch (pomodoroPhase) {
      case 'work': return { color: 'cyan', label: 'Работа', icon: Brain };
      case 'shortBreak': return { color: 'green', label: 'Кратка почивка', icon: Coffee };
      case 'longBreak': return { color: 'purple', label: 'Дълга почивка', icon: Coffee };
    }
  };
  const phaseConfig = getPhaseConfig();

  const formatMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}ч ${m}м` : `${m}м`;
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
            <Clock className="text-cyan-400" />
            Таймер
          </h1>
          <div className="flex bg-slate-800/50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('timer')}
              className={`px-4 py-2 rounded-md font-mono text-sm transition-all ${
                activeTab === 'timer' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock size={16} className="inline mr-2" />
              Таймер
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-md font-mono text-sm transition-all ${
                activeTab === 'stats' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 size={16} className="inline mr-2" />
              Статистики
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'timer' && (
            <>
              <button
                onClick={() => setShowManualEntry(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors font-mono text-sm"
                title="Добави време ръчно"
              >
                <Plus size={16} />
                Ръчно
              </button>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-slate-700 text-slate-200' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}
              >
                <History size={20} />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-slate-700 text-slate-200' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}
              >
                <Settings size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'timer' ? (
        <>
          {/* Mode Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Stop active normal session if switching to pomodoro
                if (activeSession && timerMode === 'normal') {
                  stopTimerWithNote(null, 'Превключих на Pomodoro');
                }
                setTimerMode('pomodoro');
                handleReset();
              }}
              disabled={isRunning && timerMode === 'pomodoro'}
              className={`flex-1 py-3 px-4 rounded-xl font-mono text-sm transition-all disabled:opacity-50 ${
                timerMode === 'pomodoro'
                  ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-400'
                  : 'bg-slate-800/50 border-2 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Brain size={18} className="inline mr-2" />
              Pomodoro
            </button>
            <button
              onClick={() => {
                // Don't switch if pomodoro timer is running
                if (isRunning && timerMode === 'pomodoro') return;
                setTimerMode('normal');
                handleReset();
              }}
              disabled={isRunning && timerMode === 'pomodoro'}
              className={`flex-1 py-3 px-4 rounded-xl font-mono text-sm transition-all disabled:opacity-50 ${
                timerMode === 'normal'
                  ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-400'
                  : 'bg-slate-800/50 border-2 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Clock size={18} className="inline mr-2" />
              Свободен
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6 space-y-6">
              <h3 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
                <Settings size={18} className="text-slate-400" />
                Настройки
              </h3>

              {/* Pomodoro Settings */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-2 font-mono">Работа (мин)</label>
                  <input type="number" value={settings.workDuration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 120) updatePomodoroSettings({ workDuration: val });
                    }}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center" min="1" max="120" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-2 font-mono">Кратка почивка</label>
                  <input type="number" value={settings.shortBreakDuration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 30) updatePomodoroSettings({ shortBreakDuration: val });
                    }}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center" min="1" max="30" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-2 font-mono">Дълга почивка</label>
                  <input type="number" value={settings.longBreakDuration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 60) updatePomodoroSettings({ longBreakDuration: val });
                    }}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center" min="1" max="60" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-2 font-mono">Дълга след # цикъла</label>
                  <input type="number" value={settings.longBreakAfter}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 10) updatePomodoroSettings({ longBreakAfter: val });
                    }}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center" min="1" max="10" />
                </div>
              </div>

              {/* Toggle Settings */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.soundEnabled}
                    onChange={(e) => updatePomodoroSettings({ soundEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500" />
                  <span className="text-sm text-slate-300 font-mono flex items-center gap-1">
                    {settings.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />} Звук
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.autoStartBreaks}
                    onChange={(e) => updatePomodoroSettings({ autoStartBreaks: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500" />
                  <span className="text-sm text-slate-300 font-mono">Авто почивка</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.autoStartWork}
                    onChange={(e) => updatePomodoroSettings({ autoStartWork: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500" />
                  <span className="text-sm text-slate-300 font-mono">Авто работа</span>
                </label>
              </div>

              {/* Goals Settings */}
              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-semibold text-slate-300 font-mono mb-3 flex items-center gap-2">
                  <Target size={16} /> Цели
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Делничен ден (ч)</label>
                    <input type="number" value={Math.round(goals.dailyMinutes / 60)}
                      onChange={(e) => {
                        const daily = (parseInt(e.target.value) || 8) * 60;
                        const weekend = goals.useWeekendHours ? (goals.weekendDailyMinutes || daily) : daily;
                        const weekly = daily * 5 + weekend * 2;
                        const monthly = Math.round(weekly * 4.33);
                        updateStudyGoals({ dailyMinutes: daily, weeklyMinutes: weekly, monthlyMinutes: monthly });
                      }}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center" min="1" max="16" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Уикенд (ч)</label>
                    <input type="number" value={Math.round((goals.weekendDailyMinutes || goals.dailyMinutes) / 60)}
                      onChange={(e) => {
                        const weekend = (parseInt(e.target.value) || 4) * 60;
                        const daily = goals.dailyMinutes;
                        const weekly = daily * 5 + weekend * 2;
                        const monthly = Math.round(weekly * 4.33);
                        updateStudyGoals({ weekendDailyMinutes: weekend, useWeekendHours: true, weeklyMinutes: weekly, monthlyMinutes: monthly });
                      }}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center" min="0" max="16" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Седмица (авто)</label>
                    <div className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-400 font-mono text-center">
                      {Math.round(goals.weeklyMinutes / 60)}ч
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Месец (авто)</label>
                    <div className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-400 font-mono text-center">
                      {Math.round(goals.monthlyMinutes / 60)}ч
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-2">
                  Седмица = {Math.round(goals.dailyMinutes / 60)}ч × 5 + {Math.round((goals.weekendDailyMinutes || goals.dailyMinutes) / 60)}ч × 2 = {Math.round(goals.weeklyMinutes / 60)}ч
                </p>
              </div>

              {/* Academic Period Settings */}
              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm font-semibold text-slate-300 font-mono mb-3 flex items-center gap-2">
                  <GraduationCap size={16} /> Академичен период
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Семестър от</label>
                    <input type="date" value={academicPeriod.semesterStart || ''}
                      onChange={(e) => updateAcademicPeriod({ semesterStart: e.target.value || null })}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Семестър до</label>
                    <input type="date" value={academicPeriod.semesterEnd || ''}
                      onChange={(e) => updateAcademicPeriod({ semesterEnd: e.target.value || null })}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Сесия от</label>
                    <input type="date" value={academicPeriod.sessionStart || ''}
                      onChange={(e) => updateAcademicPeriod({ sessionStart: e.target.value || null })}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-2 font-mono">Сесия до</label>
                    <input type="date" value={academicPeriod.sessionEnd || ''}
                      onChange={(e) => updateAcademicPeriod({ sessionEnd: e.target.value || null })}
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Timer Display */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8">
            <div className="text-center">
              {timerMode === 'pomodoro' && (
                <div className="mb-6">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm ${
                    pomodoroPhase === 'work' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                    pomodoroPhase === 'shortBreak' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  }`}>
                    <phaseConfig.icon size={16} />
                    {phaseConfig.label}
                    {pomodoroPhase === 'work' && <span className="ml-2 px-2 py-0.5 bg-slate-800 rounded text-xs">#{pomodoroCount + 1}</span>}
                  </div>
                  <div className="flex justify-center gap-2 mt-3">
                    {Array.from({ length: settings.longBreakAfter }).map((_, i) => (
                      <div key={i} className={`w-3 h-3 rounded-full transition-all ${i < (pomodoroCount % settings.longBreakAfter) ? 'bg-cyan-400' : 'bg-slate-700'}`} />
                    ))}
                  </div>
                </div>
              )}

              <div className={`text-7xl md:text-8xl font-mono font-bold mb-8 transition-colors ${
                isRunning ? (timerMode === 'pomodoro' ? (pomodoroPhase === 'work' ? 'text-cyan-400' : 'text-green-400') : 'text-purple-400') : 'text-slate-500'
              }`}>
                {timerMode === 'pomodoro' ? formatTime(pomodoroTimeLeft) : formatTime(elapsed)}
              </div>

              {(timerMode === 'normal' || !isRunning) && !isRunning && (
                <div className="max-w-md mx-auto space-y-4 mb-8">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2 font-mono">
                      <BookOpen size={14} className="inline mr-2" />Предмет
                    </label>
                    <select value={selectedSubject}
                      onChange={(e) => { setSelectedSubject(e.target.value); setSelectedTopic(null); }}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-mono">
                      <option value="">Избери предмет (незадължително)</option>
                      {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  {selectedSubject && topics.length > 0 && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2 font-mono">
                        <Target size={14} className="inline mr-2" />Тема (незадължително)
                      </label>
                      <select value={selectedTopic || ''}
                        onChange={(e) => setSelectedTopic(e.target.value || null)}
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-mono">
                        <option value="">Общо за предмета</option>
                        {topics.map(t => <option key={t.id} value={t.id}>#{t.number} {t.name.length > 50 ? t.name.slice(0, 50) + '...' : t.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {isRunning && selectedSubjectData && (
                <div className="mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-mono"
                    style={{ backgroundColor: `${selectedSubjectData.color}30`, color: selectedSubjectData.color }}>
                    <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                    {selectedSubjectData.name}
                    {selectedTopic && topics.find(t => t.id === selectedTopic) && (
                      <span className="text-slate-400">• #{topics.find(t => t.id === selectedTopic)?.number}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                {!isRunning ? (
                  <button onClick={handleStart}
                    className={`flex items-center gap-3 px-8 py-4 text-white font-semibold rounded-xl transition-all font-mono ${
                      timerMode === 'pomodoro' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
                    }`}>
                    <Play size={24} />
                    {isPaused ? 'Продължи' :
                     pomodoroPhase === 'shortBreak' ? 'Кратка почивка' :
                     pomodoroPhase === 'longBreak' ? 'Дълга почивка' : 'Започни'}
                  </button>
                ) : (
                  <>
                    <button onClick={handlePause}
                      className="flex items-center gap-3 px-6 py-4 bg-slate-700 text-slate-200 font-semibold rounded-xl hover:bg-slate-600 transition-all font-mono">
                      <Pause size={24} />Пауза
                    </button>
                    {pomodoroPhase !== 'work' && timerMode === 'pomodoro' && (
                      <button onClick={handleSkipBreak}
                        className="flex items-center gap-2 px-4 py-4 bg-slate-800 text-slate-400 font-semibold rounded-xl hover:bg-slate-700 hover:text-slate-200 transition-all font-mono text-sm">
                        Пропусни
                      </button>
                    )}
                    <button onClick={handleStop}
                      className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-xl hover:from-red-500 hover:to-orange-500 transition-all font-mono">
                      <Square size={24} />Спри
                    </button>
                  </>
                )}
                {(pomodoroCount > 0 || elapsed > 0) && !isRunning && (
                  <button onClick={handleReset} className="p-4 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 hover:text-slate-200 transition-all" title="Нулирай (R)">
                    <RotateCcw size={20} />
                  </button>
                )}
              </div>
              {/* Keyboard shortcut hint */}
              <p className="text-xs text-slate-600 font-mono mt-4 text-center">
                Space: старт/пауза • R: нулирай • Esc: затвори
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={16} className="text-cyan-400" />
                <span className="text-xs text-slate-500 font-mono">Днес</span>
              </div>
              <div className="text-2xl font-bold text-cyan-400 font-mono">{formatMinutes(stats.todayMinutes)}</div>
              <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${dailyProgress}%` }} />
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">{Math.round(dailyProgress)}%</div>
            </div>
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-purple-400" />
                <span className="text-xs text-slate-500 font-mono">Седмица</span>
              </div>
              <div className="text-2xl font-bold text-purple-400 font-mono">{formatMinutes(stats.weekMinutes)}</div>
              <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${weeklyProgress}%` }} />
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">{Math.round(weeklyProgress)}%</div>
            </div>
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🔥</span>
                <span className="text-xs text-slate-500 font-mono">Streak</span>
              </div>
              <div className="text-2xl font-bold text-orange-400 font-mono">{stats.streak} {stats.streak === 1 ? 'ден' : 'дни'}</div>
            </div>
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} className="text-green-400" />
                <span className="text-xs text-slate-500 font-mono">Pomodoros</span>
              </div>
              <div className="text-2xl font-bold text-green-400 font-mono">{pomodoroCount}</div>
            </div>
          </div>

          {/* History */}
          {showHistory && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-100 mb-4 font-mono flex items-center gap-2">
                <History size={18} className="text-slate-400" />История
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.timerSessions.filter(s => s.endTime !== null).slice().reverse().slice(0, 50).map(session => {
                  const subject = data.subjects.find(s => s.id === session.subjectId);
                  // Handle special subject IDs
                  const getSubjectDisplay = () => {
                    if (subject) return { name: subject.name, color: subject.color };
                    switch (session.subjectId) {
                      case 'general': return { name: 'Общо учене', color: '#6366f1' };
                      case 'manual': return { name: 'Ръчно добавено', color: '#22c55e' };
                      case 'pomodoro': return { name: 'Pomodoro', color: '#06b6d4' };
                      default: return { name: 'Неизвестен', color: '#666' };
                    }
                  };
                  const subjectDisplay = getSubjectDisplay();
                  const sessionDate = new Date(session.startTime);
                  const isToday = session.startTime.startsWith(stats.today);
                  const dateStr = isToday ? sessionDate.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
                    : sessionDate.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
                  return (
                    <div key={session.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subjectDisplay.color }} />
                        <div>
                          <span className="text-slate-200 font-mono text-sm">{subjectDisplay.name}</span>
                          {session.distractionNote && (
                            <p className="text-xs text-slate-500 font-mono mt-0.5 max-w-xs truncate" title={session.distractionNote}>
                              💭 {session.distractionNote}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-slate-500 font-mono text-sm">{dateStr}</span>
                        <span className="text-cyan-400 font-mono font-semibold">{session.duration}м</span>
                        {session.rating && <span>{['😴','😕','😐','😊','🔥'][session.rating-1]}</span>}
                      </div>
                    </div>
                  );
                })}
                {data.timerSessions.filter(s => s.endTime !== null).length === 0 && (
                  <p className="text-slate-500 font-mono text-sm text-center py-8">Няма записани сесии</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Statistics Tab */
        <div className="space-y-6">
          {/* Period Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={18} className="text-cyan-400" />
                <span className="text-sm text-slate-400 font-mono">Този месец</span>
              </div>
              <div className="text-3xl font-bold text-cyan-400 font-mono mb-2">{formatMinutes(stats.monthMinutes)}</div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${monthlyProgress}%` }} />
              </div>
              <div className="text-xs text-slate-500 font-mono mt-2">{Math.round(monthlyProgress)}% от {Math.round(goals.monthlyMinutes / 60)}ч цел</div>
            </div>

            {academicPeriod.semesterStart && (
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <GraduationCap size={18} className="text-purple-400" />
                  <span className="text-sm text-slate-400 font-mono">Семестър</span>
                </div>
                <div className="text-3xl font-bold text-purple-400 font-mono mb-2">{formatMinutes(stats.semesterMinutes)}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {stats.semesterDays > 0 && `~${Math.round(stats.semesterMinutes / stats.semesterDays)}м/ден средно`}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  {new Date(academicPeriod.semesterStart).toLocaleDateString('bg-BG')} - {academicPeriod.semesterEnd ? new Date(academicPeriod.semesterEnd).toLocaleDateString('bg-BG') : '...'}
                </div>
              </div>
            )}

            {academicPeriod.sessionStart && (
              <div className={`bg-slate-800/30 border rounded-xl p-5 ${stats.isInSession ? 'border-orange-500/50' : 'border-slate-700/50'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={18} className={stats.isInSession ? 'text-orange-400' : 'text-slate-400'} />
                  <span className="text-sm text-slate-400 font-mono">Сесия {stats.isInSession && '(активна)'}</span>
                </div>
                <div className={`text-3xl font-bold font-mono mb-2 ${stats.isInSession ? 'text-orange-400' : 'text-slate-400'}`}>
                  {formatMinutes(stats.sessionMinutes)}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {stats.sessionDays > 0 && `~${Math.round(stats.sessionMinutes / Math.max(1, stats.sessionDays))}м/ден средно`}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  {new Date(academicPeriod.sessionStart).toLocaleDateString('bg-BG')} - {academicPeriod.sessionEnd ? new Date(academicPeriod.sessionEnd).toLocaleDateString('bg-BG') : '...'}
                </div>
              </div>
            )}
          </div>

          {/* By Subject */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
              <BookOpen size={18} className="text-slate-400" />
              По предмети (този месец)
            </h3>
            <div className="space-y-3">
              {Object.entries(stats.bySubject)
                .sort((a, b) => b[1] - a[1])
                .map(([subjectId, minutes]) => {
                  const subject = data.subjects.find(s => s.id === subjectId);
                  // Handle special subject IDs
                  const getSubjectDisplay = () => {
                    if (subject) return { name: subject.name, color: subject.color };
                    switch (subjectId) {
                      case 'general': return { name: 'Общо учене', color: '#6366f1' };
                      case 'manual': return { name: 'Ръчно добавено', color: '#22c55e' };
                      case 'pomodoro': return { name: 'Pomodoro', color: '#06b6d4' };
                      default: return { name: 'Неизвестен', color: '#666' };
                    }
                  };
                  const subjectDisplay = getSubjectDisplay();
                  const percentage = stats.monthMinutes > 0 ? (minutes / stats.monthMinutes) * 100 : 0;
                  return (
                    <div key={subjectId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subjectDisplay.color }} />
                          <span className="text-sm text-slate-300 font-mono">{subjectDisplay.name}</span>
                        </div>
                        <span className="text-sm text-slate-400 font-mono">{formatMinutes(minutes)}</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, backgroundColor: subjectDisplay.color }} />
                      </div>
                    </div>
                  );
                })}
              {Object.keys(stats.bySubject).length === 0 && (
                <p className="text-slate-500 font-mono text-sm text-center py-4">Няма данни за този месец</p>
              )}
            </div>
          </div>

          {/* Distractions Log */}
          {stats.distractions.length > 0 && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
                💭 Разсейвания
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.distractions.map(s => (
                  <div key={s.id} className="p-3 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(s.startTime).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{s.duration}м</span>
                    </div>
                    <p className="text-sm text-slate-300 font-mono">{s.distractionNote}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rating Modal */}
      {showRating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-100 mb-2 font-mono text-center">Как мина сесията?</h3>
            <p className="text-sm text-slate-400 mb-4 text-center font-mono">
              {formatTime(elapsed)} ({Math.round(elapsed / 60)} мин)
            </p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(rating => (
                <button key={rating} onClick={() => handleRatingSubmit(rating)}
                  className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-cyan-500 hover:bg-cyan-500/10 transition-all text-2xl">
                  {['😴','😕','😐','😊','🔥'][rating-1]}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2 font-mono">💭 Какво те разсея? (незадължително)</label>
              <textarea
                value={distractionNote}
                onChange={(e) => setDistractionNote(e.target.value)}
                placeholder="Телефон, социални мрежи, умора..."
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm resize-none h-20 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button onClick={() => handleRatingSubmit(null)}
              className="w-full py-2 text-slate-400 hover:text-slate-200 transition-colors font-mono text-sm">
              Пропусни оценката
            </button>
          </div>
        </div>
      )}

      {/* Manual Time Entry Modal */}
      {showManualEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowManualEntry(false)} />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md">
            <button
              onClick={() => setShowManualEntry(false)}
              className="absolute top-4 right-4 p-1 text-slate-500 hover:text-slate-300"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold text-slate-100 mb-4 font-mono flex items-center gap-2">
              <Plus size={20} className="text-green-400" />
              Добави време ръчно
            </h3>
            <p className="text-sm text-slate-500 mb-4 font-mono">
              За учене извън приложението (Anki, книга, лекции...)
            </p>

            <div className="space-y-4">
              {/* Duration */}
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-mono">Продължителност</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={manualHours}
                      onChange={(e) => setManualHours(Math.max(0, parseInt(e.target.value) || 0))}
                      min="0"
                      max="12"
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                    />
                    <span className="text-xs text-slate-500 font-mono block text-center mt-1">часа</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      min="0"
                      max="59"
                      className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                    />
                    <span className="text-xs text-slate-500 font-mono block text-center mt-1">минути</span>
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-mono">Предмет (незадължително)</label>
                <select
                  value={manualSubject}
                  onChange={(e) => setManualSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono"
                >
                  <option value="">Общо учене</option>
                  {data.subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-mono">Бележка (незадължително)</label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Anki, лекции, учебник..."
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm"
                />
              </div>

              {/* Submit */}
              <button
                onClick={() => {
                  const totalMinutes = manualHours * 60 + manualMinutes;
                  if (totalMinutes > 0) {
                    addPomodoroSession(totalMinutes, manualSubject || 'manual', null, manualNote.trim() || undefined);
                    setShowManualEntry(false);
                    setManualHours(0);
                    setManualMinutes(30);
                    setManualSubject('');
                    setManualNote('');
                  }
                }}
                disabled={manualHours * 60 + manualMinutes === 0}
                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Добави {manualHours > 0 ? `${manualHours}ч ` : ''}{manualMinutes}м
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirmation Modal */}
      {showStopConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowStopConfirm(false)} />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-slate-100 mb-2 font-mono text-center">Спри Pomodoro?</h3>
            <p className="text-sm text-slate-400 mb-4 text-center font-mono">
              Имаш {Math.floor((settings.workDuration * 60 - pomodoroTimeLeft) / 60)} минути работа.
              {Math.floor((settings.workDuration * 60 - pomodoroTimeLeft) / 60) >= 1 && ' Ще бъдат записани.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl transition-colors font-mono"
              >
                Отказ
              </button>
              <button
                onClick={confirmPomodoroStop}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl transition-colors font-mono"
              >
                Спри
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
