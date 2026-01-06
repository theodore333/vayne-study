'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, Square, Clock, BookOpen, Target } from 'lucide-react';
import { useApp } from '@/lib/context';

export default function TimerPage() {
  const { data, startTimer, stopTimer } = useApp();
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showRating, setShowRating] = useState(false);

  // Find active session
  const activeSession = data.timerSessions.find(s => s.endTime === null);

  useEffect(() => {
    if (activeSession) {
      setIsRunning(true);
      setSelectedSubject(activeSession.subjectId);
      setSelectedTopic(activeSession.topicId);
    }
  }, [activeSession]);

  // Timer tick
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && activeSession) {
      interval = setInterval(() => {
        const start = new Date(activeSession.startTime).getTime();
        const now = new Date().getTime();
        setElapsed(Math.floor((now - start) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, activeSession]);

  const handleStart = () => {
    if (!selectedSubject) return;
    startTimer(selectedSubject, selectedTopic);
    setIsRunning(true);
    setElapsed(0);
  };

  const handleStop = () => {
    setShowRating(true);
  };

  const handleRatingSubmit = (rating: number | null) => {
    stopTimer(rating);
    setIsRunning(false);
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

  const selectedSubjectData = data.subjects.find(s => s.id === selectedSubject);
  const topics = selectedSubjectData?.topics || [];

  // Calculate today's study time
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = data.timerSessions.filter(s =>
    s.startTime.startsWith(today) && s.endTime !== null
  );
  const todayMinutes = todaySessions.reduce((acc, s) => acc + s.duration, 0);

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
            Проследявай времето за учене по предмети
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-400 font-mono">Днес:</div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">
            {Math.floor(todayMinutes / 60)}ч {todayMinutes % 60}мин
          </div>
        </div>
      </div>

      {/* Timer Display */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8">
        <div className="text-center">
          {/* Timer */}
          <div className={`text-7xl md:text-8xl font-mono font-bold mb-8 transition-colors ${
            isRunning ? 'text-cyan-400' : 'text-slate-500'
          }`}>
            {formatTime(elapsed)}
          </div>

          {/* Subject/Topic Selection */}
          {!isRunning && (
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
                  <option value="">Избери предмет</option>
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
                      <option key={t.id} value={t.id}>#{t.number} {t.name}</option>
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
                disabled={!selectedSubject}
                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-xl hover:from-cyan-500 hover:to-blue-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={24} />
                Започни
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-xl hover:from-red-500 hover:to-orange-500 transition-all font-mono"
              >
                <Square size={24} />
                Спри
              </button>
            )}
          </div>
        </div>
      </div>

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

      {/* Recent Sessions */}
      {todaySessions.length > 0 && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 font-mono">
            Днешни сесии
          </h2>
          <div className="space-y-2">
            {todaySessions.slice().reverse().map(session => {
              const subject = data.subjects.find(s => s.id === session.subjectId);
              const topic = subject?.topics.find(t => t.id === session.topicId);
              const startTime = new Date(session.startTime).toLocaleTimeString('bg-BG', {
                hour: '2-digit',
                minute: '2-digit'
              });

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
                    <span className="text-slate-400 font-mono text-sm">
                      {startTime}
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
          </div>
        </div>
      )}
    </div>
  );
}
