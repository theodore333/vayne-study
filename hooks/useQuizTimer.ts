import { useState, useEffect, useCallback } from 'react';

export function useQuizTimer(isQuizActive: boolean, showResult: boolean) {
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);

  // Auto-start timer when quiz becomes active
  useEffect(() => {
    if (isQuizActive && !showResult && !quizStartTime) {
      const now = Date.now();
      setQuizStartTime(now);
      setQuestionStartTime(now);
    }
  }, [isQuizActive, showResult, quizStartTime]);

  // Timer tick
  useEffect(() => {
    if (!quizStartTime || showResult) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - quizStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [quizStartTime, showResult]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const recordQuestionTime = useCallback((questionIndex: number) => {
    if (questionStartTime) {
      const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
      setQuestionTimes(prev => {
        const newTimes = [...prev];
        newTimes[questionIndex] = timeSpent;
        return newTimes;
      });
    }
    setQuestionStartTime(Date.now());
  }, [questionStartTime]);

  const initQuestionTimes = useCallback((count: number) => {
    setQuestionTimes(new Array(count).fill(0));
    setQuestionStartTime(Date.now());
  }, []);

  const reset = useCallback(() => {
    setQuizStartTime(null);
    setElapsedTime(0);
    setQuestionStartTime(null);
    setQuestionTimes([]);
  }, []);

  return {
    elapsedTime,
    questionTimes,
    questionStartTime,
    formatTime,
    recordQuestionTime,
    initQuestionTimes,
    reset,
  };
}
