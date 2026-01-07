'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, Clock, BookOpen, Target, Settings, RotateCcw, Coffee, Brain, TrendingUp, Calendar, ChevronDown, ChevronUp, Volume2, VolumeX, History } from 'lucide-react';
import { useApp } from '@/lib/context';
import { PomodoroSettings } from '@/lib/types';

type TimerMode = 'normal' | 'pomodoro';
type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';

export default function TimerPage() {
  const { data, startTimer, stopTimer, updatePomodoroSettings, updateStudyGoals } = useApp();

  // Timer state
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showRating, setShowRating] = useState(false);

  // Mode state
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(0);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(true);

  // Audio context for notification sound
  const audioContextRef = useRef<AudioContext | null>(null);

  const settings = data.pomodoroSettings;
  const goals = data.studyGoals;

  // Find active session
  const activeSession = data.timerSessions.find(s => s.endTime === null);

  // Initialize pomodoro time
  useEffect(() => {
    if (timerMode === 'pomodoro' && !isRunning) {
      const duration = pomodoroPhase === 'work'
        ? settings.workDuration
        : pomodoroPhase === 'shortBreak'
          ? settings.shortBreakDuration
          : settings.longBreakDuration;
      setPomodoroTimeLeft(duration * 60);
    }
  }, [timerMode, pomodoroPhase, settings, isRunning]);

  // Restore active session
  useEffect(() => {
    if (activeSession) {
      setIsRunning(true);
      setSelectedSubject(activeSession.subjectId);
      setSelectedTopic(activeSession.topicId);
    }
  }, [activeSession]);

  // Normal timer tick
  useEffect(() => {
    if (!isRunning || timerMode !== 'normal' || !activeSession) return;

    const interval = setInterval(() => {
      const start = new Date(activeSession.startTime).getTime();
      const now = new Date().getTime();
      setElapsed(Math.floor((now - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timerMode, activeSession]);

  // Pomodoro timer tick
  useEffect(() => {
    if (!isRunning || timerMode !== 'pomodoro') return;

    const interval = setInterval(() => {
      setPomodoroTimeLeft(prev => {
        if (prev <= 1) {
          // Timer finished
          handlePomodoroComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timerMode]);

  const playSound = useCallback(() => {
    if (!settings.soundEnabled) return;

    try {
      // Create or reuse audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;

      // Create a pleasant chime sound
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.value = freq;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      // Play a pleasant three-tone chime
      playTone(523.25, now, 0.3);        // C5
      playTone(659.25, now + 0.15, 0.3); // E5
      playTone(783.99, now + 0.3, 0.4);  // G5
    } catch (e) {
      console.log('Audio not supported');
    }
  }, [settings.soundEnabled]);

  const handlePomodoroComplete = useCallback(() => {
    playSound();
    setIsRunning(false);

    if (pomodoroPhase === 'work') {
      const newCount = pomodoroCount + 1;
      setPomodoroCount(newCount);

      // Determine next break type
      if (newCount % settings.longBreakAfter === 0) {
        setPomodoroPhase('longBreak');
        setPomodoroTimeLeft(settings.longBreakDuration * 60);
      } else {
        setPomodoroPhase('shortBreak');
        setPomodoroTimeLeft(settings.shortBreakDuration * 60);
      }

      // Auto-start break if enabled
      if (settings.autoStartBreaks) {
        setIsRunning(true);
      }
    } else {
      // Break finished, back to work
      setPomodoroPhase('work');
      setPomodoroTimeLeft(settings.workDuration * 60);

      // Auto-start work if enabled
      if (settings.autoStartWork) {
        setIsRunning(true);
      }
    }
  }, [pomodoroPhase, pomodoroCount, settings, playSound]);

  const handleStart = () => {
    if (timerMode === 'normal') {
      if (!selectedSubject) return;
      startTimer(selectedSubject, selectedTopic);
    }
    setIsRunning(true);
    setElapsed(0);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleResume = () => {
    setIsRunning(true);
  };

  const handleStop = () => {
    if (timerMode === 'normal') {
      setShowRating(true);
    } else {
      // For pomodoro, just stop and reset
      setIsRunning(false);
      setPomodoroPhase('work');
      setPomodoroTimeLeft(settings.workDuration * 60);
      setPomodoroCount(0);
    }
  };

  const handleRatingSubmit = (rating: number | null) => {
    stopTimer(rating);
    setIsRunning(false);
    setShowRating(false);
    setElapsed(0);
  };

  const handleSkipBreak = () => {
    setPomodoroPhase('work');
    setPomodoroTimeLeft(settings.workDuration * 60);
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setPomodoroPhase('work');
    setPomodoroTimeLeft(settings.workDuration * 60);
    setPomodoroCount(0);
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

  const selectedSubjectData = data.subjects.find(s => s.id === selectedSubject);
  const topics = selectedSubjectData?.topics || [];

  // Calculate statistics
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = data.timerSessions.filter(s =>
    s.startTime.startsWith(today) && s.endTime !== null
  );
  const todayMinutes = todaySessions.reduce((acc, s) => acc + s.duration, 0);

  // Weekly stats
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekSessions = data.timerSessions.filter(s => {
    const sessionDate = new Date(s.startTime);
    return sessionDate >= weekStart && s.endTime !== null;
  });
  const weekMinutes = weekSessions.reduce((acc, s) => acc + s.duration, 0);

  // Study streak calculation
  const calculateStreak = () => {
    const dates = new Set(
      data.timerSessions
        .filter(s => s.endTime !== null)
        .map(s => s.startTime.split('T')[0])
    );

    let streak = 0;
    const checkDate = new Date();

    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (streak === 0) {
        // Check if today hasn't been counted yet
        checkDate.setDate(checkDate.getDate() - 1);
        const yesterdayStr = checkDate.toISOString().split('T')[0];
        if (dates.has(yesterdayStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      } else {
        break;
      }
    }
    return streak;
  };

  const streak = calculateStreak();
  const dailyProgress = Math.min(100, (todayMinutes / goals.dailyMinutes) * 100);
  const weeklyProgress = Math.min(100, (weekMinutes / goals.weeklyMinutes) * 100);

  // Get phase color and label
  const getPhaseConfig = () => {
    switch (pomodoroPhase) {
      case 'work':
        return { color: 'cyan', label: 'Работа', icon: Brain };
      case 'shortBreak':
        return { color: 'green', label: 'Кратка почивка', icon: Coffee };
      case 'longBreak':
        return { color: 'purple', label: 'Дълга почивка', icon: Coffee };
    }
  };

  const phaseConfig = getPhaseConfig();

  return (
    <div className="min-h-screen p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
            <Clock className="text-cyan-400" />
            Таймер за учене
          </h1>
          <p className="text-slate-400 mt-1 font-mono text-sm">
            {timerMode === 'pomodoro' ? 'Pomodoro техника' : 'Свободен режим'}
          </p>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => { setTimerMode('pomodoro'); handleReset(); }}
          className={`flex-1 py-3 px-4 rounded-xl font-mono text-sm transition-all ${
            timerMode === 'pomodoro'
              ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-400'
              : 'bg-slate-800/50 border-2 border-slate-700 text-slate-400 hover:border-slate-600'
          }`}
        >
          <Brain size={18} className="inline mr-2" />
          Pomodoro
        </button>
        <button
          onClick={() => { setTimerMode('normal'); handleReset(); }}
          className={`flex-1 py-3 px-4 rounded-xl font-mono text-sm transition-all ${
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
              <input
                type="number"
                value={settings.workDuration}
                onChange={(e) => updatePomodoroSettings({ workDuration: parseInt(e.target.value) || 25 })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                min="1"
                max="120"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-2 font-mono">Кратка почивка</label>
              <input
                type="number"
                value={settings.shortBreakDuration}
                onChange={(e) => updatePomodoroSettings({ shortBreakDuration: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                min="1"
                max="30"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-2 font-mono">Дълга почивка</label>
              <input
                type="number"
                value={settings.longBreakDuration}
                onChange={(e) => updatePomodoroSettings({ longBreakDuration: parseInt(e.target.value) || 15 })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                min="1"
                max="60"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-2 font-mono">Дълга след # цикъла</label>
              <input
                type="number"
                value={settings.longBreakAfter}
                onChange={(e) => updatePomodoroSettings({ longBreakAfter: parseInt(e.target.value) || 4 })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                min="1"
                max="10"
              />
            </div>
          </div>

          {/* Toggle Settings */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => updatePomodoroSettings({ soundEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
              />
              <span className="text-sm text-slate-300 font-mono flex items-center gap-1">
                {settings.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                Звук
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoStartBreaks}
                onChange={(e) => updatePomodoroSettings({ autoStartBreaks: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
              />
              <span className="text-sm text-slate-300 font-mono">Авто почивка</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoStartWork}
                onChange={(e) => updatePomodoroSettings({ autoStartWork: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
              />
              <span className="text-sm text-slate-300 font-mono">Авто работа</span>
            </label>
          </div>

          {/* Goals Settings */}
          <div className="border-t border-slate-700 pt-4">
            <h4 className="text-sm font-semibold text-slate-300 font-mono mb-3 flex items-center gap-2">
              <Target size={16} />
              Цели
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono">Дневна цел (часове)</label>
                <input
                  type="number"
                  value={Math.round(goals.dailyMinutes / 60)}
                  onChange={(e) => updateStudyGoals({ dailyMinutes: (parseInt(e.target.value) || 4) * 60 })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                  min="1"
                  max="16"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-2 font-mono">Седмична цел (часове)</label>
                <input
                  type="number"
                  value={Math.round(goals.weeklyMinutes / 60)}
                  onChange={(e) => updateStudyGoals({ weeklyMinutes: (parseInt(e.target.value) || 20) * 60 })}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-center"
                  min="1"
                  max="100"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Timer Display */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8">
        <div className="text-center">
          {/* Pomodoro Phase Indicator */}
          {timerMode === 'pomodoro' && (
            <div className="mb-6">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm bg-${phaseConfig.color}-500/20 text-${phaseConfig.color}-400 border border-${phaseConfig.color}-500/30`}>
                <phaseConfig.icon size={16} />
                {phaseConfig.label}
                {pomodoroPhase === 'work' && (
                  <span className="ml-2 px-2 py-0.5 bg-slate-800 rounded text-xs">
                    #{pomodoroCount + 1}
                  </span>
                )}
              </div>

              {/* Pomodoro dots */}
              <div className="flex justify-center gap-2 mt-3">
                {Array.from({ length: settings.longBreakAfter }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full transition-all ${
                      i < (pomodoroCount % settings.longBreakAfter)
                        ? 'bg-cyan-400'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Timer */}
          <div className={`text-7xl md:text-8xl font-mono font-bold mb-8 transition-colors ${
            isRunning
              ? timerMode === 'pomodoro'
                ? pomodoroPhase === 'work' ? 'text-cyan-400' : 'text-green-400'
                : 'text-purple-400'
              : 'text-slate-500'
          }`}>
            {timerMode === 'pomodoro' ? formatTime(pomodoroTimeLeft) : formatTime(elapsed)}
          </div>

          {/* Subject/Topic Selection (Normal mode only, or Pomodoro when not running) */}
          {(timerMode === 'normal' || !isRunning) && !isRunning && (
            <div className="max-w-md mx-auto space-y-4 mb-8">
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-mono">
                  <BookOpen size={14} className="inline mr-2" />
                  Предмет
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => {
                    setSelectedSubject(e.target.value);
                    setSelectedTopic(null);
                  }}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="">Избери предмет (незадължително)</option>
                  {data.subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {selectedSubject && topics.length > 0 && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2 font-mono">
                    <Target size={14} className="inline mr-2" />
                    Тема (незадължително)
                  </label>
                  <select
                    value={selectedTopic || ''}
                    onChange={(e) => setSelectedTopic(e.target.value || null)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="">Общо за предмета</option>
                    {topics.map(t => (
                      <option key={t.id} value={t.id} className="truncate">
                        #{t.number} {t.name.length > 50 ? t.name.slice(0, 50) + '...' : t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Active Session Info */}
          {isRunning && selectedSubjectData && (
            <div className="mb-8">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-mono"
                style={{ backgroundColor: `${selectedSubjectData.color}30`, color: selectedSubjectData.color }}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                {selectedSubjectData.name}
                {selectedTopic && topics.find(t => t.id === selectedTopic) && (
                  <span className="text-slate-400">
                    • #{topics.find(t => t.id === selectedTopic)?.number}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={timerMode === 'normal' && !selectedSubject}
                className={`flex items-center gap-3 px-8 py-4 text-white font-semibold rounded-xl transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed ${
                  timerMode === 'pomodoro'
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500'
                }`}
              >
                <Play size={24} />
                {pomodoroPhase !== 'work' ? 'Почивка' : 'Започни'}
              </button>
            ) : (
              <>
                <button
                  onClick={handlePause}
                  className="flex items-center gap-3 px-6 py-4 bg-slate-700 text-slate-200 font-semibold rounded-xl hover:bg-slate-600 transition-all font-mono"
                >
                  <Pause size={24} />
                  Пауза
                </button>
                {pomodoroPhase !== 'work' && timerMode === 'pomodoro' && (
                  <button
                    onClick={handleSkipBreak}
                    className="flex items-center gap-2 px-4 py-4 bg-slate-800 text-slate-400 font-semibold rounded-xl hover:bg-slate-700 hover:text-slate-200 transition-all font-mono text-sm"
                  >
                    Пропусни
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-xl hover:from-red-500 hover:to-orange-500 transition-all font-mono"
                >
                  <Square size={24} />
                  Спри
                </button>
              </>
            )}
            {(pomodoroCount > 0 || elapsed > 0) && !isRunning && (
              <button
                onClick={handleReset}
                className="p-4 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 hover:text-slate-200 transition-all"
              >
                <RotateCcw size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Daily Progress */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={16} className="text-cyan-400" />
              <span className="text-xs text-slate-500 font-mono">Днес</span>
            </div>
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              {Math.floor(todayMinutes / 60)}ч {todayMinutes % 60}м
            </div>
            <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                style={{ width: `${dailyProgress}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 font-mono mt-1">
              {Math.round(dailyProgress)}% от {Math.round(goals.dailyMinutes / 60)}ч цел
            </div>
          </div>

          {/* Weekly Progress */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-purple-400" />
              <span className="text-xs text-slate-500 font-mono">Седмица</span>
            </div>
            <div className="text-2xl font-bold text-purple-400 font-mono">
              {Math.floor(weekMinutes / 60)}ч {weekMinutes % 60}м
            </div>
            <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: `${weeklyProgress}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 font-mono mt-1">
              {Math.round(weeklyProgress)}% от {Math.round(goals.weeklyMinutes / 60)}ч цел
            </div>
          </div>

          {/* Streak */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔥</span>
              <span className="text-xs text-slate-500 font-mono">Streak</span>
            </div>
            <div className="text-2xl font-bold text-orange-400 font-mono">
              {streak} {streak === 1 ? 'ден' : 'дни'}
            </div>
            <div className="text-xs text-slate-500 font-mono mt-3">
              Поредни дни с учене
            </div>
          </div>

          {/* Pomodoros Today */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={16} className="text-green-400" />
              <span className="text-xs text-slate-500 font-mono">Pomodoros</span>
            </div>
            <div className="text-2xl font-bold text-green-400 font-mono">
              {pomodoroCount}
            </div>
            <div className="text-xs text-slate-500 font-mono mt-3">
              Завършени днес
            </div>
          </div>
        </div>
      )}

      {/* Session History */}
      {showHistory && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 font-mono flex items-center gap-2">
            <History size={18} className="text-slate-400" />
            История на сесиите
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data.timerSessions
              .filter(s => s.endTime !== null)
              .slice()
              .reverse()
              .slice(0, 50)
              .map(session => {
                const subject = data.subjects.find(s => s.id === session.subjectId);
                const topic = subject?.topics.find(t => t.id === session.topicId);
                const sessionDate = new Date(session.startTime);
                const isToday = session.startTime.startsWith(today);
                const dateStr = isToday
                  ? sessionDate.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
                  : sessionDate.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });

                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: subject?.color || '#666' }}
                      />
                      <div>
                        <span className="text-slate-200 font-mono text-sm">
                          {subject?.name || 'Неизвестен'}
                        </span>
                        {topic && (
                          <span className="text-slate-500 font-mono text-sm">
                            {' '}• #{topic.number}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500 font-mono text-sm">
                        {dateStr}
                      </span>
                      <span className="text-cyan-400 font-mono font-semibold">
                        {session.duration} мин
                      </span>
                      {session.rating && (
                        <span>
                          {session.rating === 1 ? '😴' : session.rating === 2 ? '😕' : session.rating === 3 ? '😐' : session.rating === 4 ? '😊' : '🔥'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            {data.timerSessions.filter(s => s.endTime !== null).length === 0 && (
              <p className="text-slate-500 font-mono text-sm text-center py-8">
                Няма записани сесии
              </p>
            )}
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 font-mono text-center">
              Как мина сесията?
            </h3>
            <p className="text-sm text-slate-400 mb-4 text-center font-mono">
              Време: {formatTime(elapsed)} ({Math.round(elapsed / 60)} мин)
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
      )}
    </div>
  );
}
