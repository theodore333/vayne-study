'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Calendar, AlertTriangle, CheckCircle2, Brain, Sparkles, Minus, Plus } from 'lucide-react';
import { useApp } from '@/lib/context';
import { WeeklyReviewData } from '@/lib/types';
import { getDaysSince } from '@/lib/algorithms';
import { NEW_MATERIAL_QUOTA } from '@/lib/constants';

interface Props {
  onClose: () => void;
}

const STORAGE_KEY = 'weekly-review-data';

export default function WeeklyReviewModal({ onClose }: Props) {
  const { data, incrementApiCalls } = useApp();
  const activeSubjects = useMemo(
    () => data.subjects.filter(s => !s.archived),
    [data.subjects]
  );

  // User feedback state
  const [overloaded, setOverloaded] = useState(false);
  const [tooMuchRepetition, setTooMuchRepetition] = useState(false);
  const [enoughNewMaterial, setEnoughNewMaterial] = useState(true);

  // Adjustments
  const [decayMultiplier, setDecayMultiplier] = useState(1.0);
  const [quotaAdjustment, setQuotaAdjustment] = useState(0);

  // AI advice state
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Load API key and previous settings
  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);

    // Load previous review data
    const reviewData = localStorage.getItem(STORAGE_KEY);
    if (reviewData) {
      try {
        const parsed: WeeklyReviewData = JSON.parse(reviewData);
        setDecayMultiplier(parsed.adjustments?.decayMultiplier || 1.0);
        setQuotaAdjustment(parsed.adjustments?.quotaAdjustment || 0);
      } catch (e) {
        console.error('Failed to parse weekly review data', e);
      }
    }
  }, []);

  // Calculate weekly statistics
  const weeklyStats = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    // Get sessions from last 7 days
    const weeklySessions = data.timerSessions.filter(s => {
      const sessionDate = s.startTime.split('T')[0];
      return sessionDate >= weekAgoStr;
    });

    // Days studied
    const studiedDates = new Set(weeklySessions.map(s => s.startTime.split('T')[0]));
    const daysStudied = studiedDates.size;
    const daysNotStudied = 7 - daysStudied;

    // Topics reviewed this week
    let topicsReviewedThisWeek = 0;
    let newTopicsStarted = 0;
    let reviewedTopics = 0;

    activeSubjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.lastReview && topic.lastReview >= weekAgoStr) {
          topicsReviewedThisWeek++;

          // Check if this was the first review (new material) or a repeat
          const reviewDays = getDaysSince(topic.lastReview);
          if (reviewDays <= 7) {
            // Check quiz count to determine if new
            if (topic.quizCount <= 1) {
              newTopicsStarted++;
            } else {
              reviewedTopics++;
            }
          }
        }
      });
    });

    // Total study time
    const totalMinutes = weeklySessions.reduce((sum, s) => sum + s.duration, 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    return {
      daysStudied,
      daysNotStudied,
      topicsReviewedThisWeek,
      newTopicsStarted,
      reviewedTopics,
      totalHours
    };
  }, [data.timerSessions, activeSubjects]);

  // Calculate decay analysis
  const decayAnalysis = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    let topicsDecayed = 0;
    let topicsAtRisk = 0;

    activeSubjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.status === 'gray') return;

        const daysSinceReview = getDaysSince(topic.lastReview);

        // Topics that might have decayed (based on status and time)
        if (daysSinceReview >= 14) {
          topicsDecayed++;
        } else if (daysSinceReview >= 7) {
          topicsAtRisk++;
        }
      });
    });

    return {
      topicsDecayed,
      topicsAtRisk
    };
  }, [activeSubjects]);

  // Check if user had 2+ consecutive days without studying
  const hadStudyBreak = useMemo(() => {
    const today = new Date();
    let maxConsecutiveDaysOff = 0;
    let currentStreak = 0;

    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      const studiedThisDay = data.timerSessions.some(s =>
        s.startTime.split('T')[0] === dateStr
      );

      if (!studiedThisDay) {
        currentStreak++;
        maxConsecutiveDaysOff = Math.max(maxConsecutiveDaysOff, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return maxConsecutiveDaysOff >= 2;
  }, [data.timerSessions]);

  // Fetch AI advice
  const fetchAiAdvice = async () => {
    if (!apiKey) {
      setAiAdvice('Добави API ключ в Settings за AI анализ.');
      return;
    }

    setLoadingAdvice(true);

    try {
      const response = await fetch('/api/ai-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: activeSubjects,
          userProgress: data.userProgress,
          timerSessions: data.timerSessions,
          dailyStatus: data.dailyStatus,
          studyGoals: data.studyGoals,
          weeklyStats,
          decayAnalysis,
          userFeedback: { overloaded, tooMuchRepetition, enoughNewMaterial },
          type: 'weekly-review',
          apiKey
        })
      });

      const result = await response.json();
      if (result.error) {
        setAiAdvice(`Грешка: ${result.error}`);
      } else if (result.advice) {
        setAiAdvice(result.advice);
        if (result.cost) {
          incrementApiCalls(result.cost);
        }
      }
    } catch (error) {
      console.error('Failed to fetch AI advice:', error);
      setAiAdvice('Грешка при свързване с AI.');
    } finally {
      setLoadingAdvice(false);
    }
  };

  // Dismiss without saving feedback (but still mark as reviewed)
  const handleDismiss = () => {
    localStorage.setItem('weekly-review-date', new Date().toISOString().split('T')[0]);
    onClose();
  };

  // Save and close
  const handleSave = () => {
    const reviewData: WeeklyReviewData = {
      lastReviewDate: new Date().toISOString().split('T')[0],
      userFeedback: {
        overloaded,
        tooMuchRepetition,
        enoughNewMaterial
      },
      adjustments: {
        decayMultiplier,
        quotaAdjustment
      }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewData));
    localStorage.setItem('weekly-review-date', reviewData.lastReviewDate);
    onClose();
  };

  const currentQuota = Math.round((NEW_MATERIAL_QUOTA + quotaAdjustment / 100) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleDismiss} />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-xl max-h-[90vh] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b] shrink-0">
          <div className="flex items-center gap-3">
            <Calendar size={24} className="text-purple-400" />
            <div>
              <h2 className="text-lg font-semibold text-slate-100 font-mono">
                Седмичен Review
              </h2>
              <p className="text-xs text-slate-500 font-mono">Анализ на последните 7 дни</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Study Break Warning */}
          {hadStudyBreak && (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-yellow-400 shrink-0" size={20} />
                <div>
                  <div className="text-sm font-semibold text-yellow-300 font-mono">
                    Забелязахме пауза в ученето
                  </div>
                  <div className="text-xs text-yellow-400/70 font-mono mt-1">
                    2+ последователни дни без учене. Decay интервалите могат да се удължат с 20%.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Weekly Statistics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-cyan-400 font-mono">{weeklyStats.daysStudied}</div>
              <div className="text-xs text-slate-500 font-mono">Дни учене</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-purple-400 font-mono">{weeklyStats.topicsReviewedThisWeek}</div>
              <div className="text-xs text-slate-500 font-mono">Теми</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-center">
              <div className="text-2xl font-bold text-green-400 font-mono">{weeklyStats.totalHours}ч</div>
              <div className="text-xs text-slate-500 font-mono">Общо време</div>
            </div>
          </div>

          {/* New vs Review Breakdown */}
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700">
            <div className="text-sm font-semibold text-slate-300 font-mono mb-3">Разпределение</div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-blue-400">Нов материал</span>
                  <span className="text-slate-400">{weeklyStats.newTopicsStarted}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: weeklyStats.topicsReviewedThisWeek > 0
                        ? `${(weeklyStats.newTopicsStarted / weeklyStats.topicsReviewedThisWeek) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-green-400">Преговор</span>
                  <span className="text-slate-400">{weeklyStats.reviewedTopics}</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: weeklyStats.topicsReviewedThisWeek > 0
                        ? `${(weeklyStats.reviewedTopics / weeklyStats.topicsReviewedThisWeek) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Decay Analysis */}
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700">
            <div className="text-sm font-semibold text-slate-300 font-mono mb-3">Decay анализ</div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="text-red-400" size={16} />
                <span className="text-sm font-mono text-slate-300">
                  <span className="text-red-400 font-bold">{decayAnalysis.topicsDecayed}</span> паднали теми
                </span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-yellow-400" size={16} />
                <span className="text-sm font-mono text-slate-300">
                  <span className="text-yellow-400 font-bold">{decayAnalysis.topicsAtRisk}</span> в риск
                </span>
              </div>
            </div>
          </div>

          {/* User Feedback Questions */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-300 font-mono">Как се чувстваш?</div>

            <button
              onClick={() => setOverloaded(!overloaded)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                overloaded
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-slate-800/30 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                overloaded ? 'bg-red-500 border-red-500' : 'border-slate-600'
              }`}>
                {overloaded && <CheckCircle2 size={12} className="text-white" />}
              </div>
              <span className="text-sm font-mono">Чувствам се претоварен/а</span>
            </button>

            <button
              onClick={() => setTooMuchRepetition(!tooMuchRepetition)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                tooMuchRepetition
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                  : 'bg-slate-800/30 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                tooMuchRepetition ? 'bg-yellow-500 border-yellow-500' : 'border-slate-600'
              }`}>
                {tooMuchRepetition && <CheckCircle2 size={12} className="text-white" />}
              </div>
              <span className="text-sm font-mono">Твърде много повторения</span>
            </button>

            <button
              onClick={() => setEnoughNewMaterial(!enoughNewMaterial)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                !enoughNewMaterial
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'bg-slate-800/30 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                !enoughNewMaterial ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
              }`}>
                {!enoughNewMaterial && <CheckCircle2 size={12} className="text-white" />}
              </div>
              <span className="text-sm font-mono">Искам повече нов материал</span>
            </button>
          </div>

          {/* Adjustments */}
          <div className="space-y-4">
            <div className="text-sm font-semibold text-slate-300 font-mono">Корекции</div>

            {/* Decay Multiplier */}
            <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-slate-400">Decay интервали</span>
                <span className="text-sm font-mono text-cyan-400">{Math.round(decayMultiplier * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDecayMultiplier(Math.max(0.8, decayMultiplier - 0.1))}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <div className="flex-1 h-2 bg-slate-700 rounded-full">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all"
                    style={{ width: `${((decayMultiplier - 0.8) / 0.4) * 100}%` }}
                  />
                </div>
                <button
                  onClick={() => setDecayMultiplier(Math.min(1.2, decayMultiplier + 0.1))}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-2">
                {decayMultiplier < 1 ? 'По-кратки интервали (по-чест преговор)' :
                 decayMultiplier > 1 ? 'По-дълги интервали (по-рядък преговор)' :
                 'Стандартни интервали'}
              </div>
            </div>

            {/* New Material Quota */}
            <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-slate-400">Квота за нов материал</span>
                <span className="text-sm font-mono text-purple-400">{currentQuota}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuotaAdjustment(Math.max(-15, quotaAdjustment - 5))}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <div className="flex-1 h-2 bg-slate-700 rounded-full">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${((quotaAdjustment + 15) / 30) * 100}%` }}
                  />
                </div>
                <button
                  onClick={() => setQuotaAdjustment(Math.min(15, quotaAdjustment + 5))}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-2">
                {quotaAdjustment < 0 ? 'По-малко нов материал, повече преговор' :
                 quotaAdjustment > 0 ? 'Повече нов материал, по-малко преговор' :
                 'Балансирано разпределение'}
              </div>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="text-purple-400" size={18} />
                <span className="text-sm font-semibold text-slate-300 font-mono">AI Анализ</span>
              </div>
              <button
                onClick={fetchAiAdvice}
                disabled={loadingAdvice}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white text-xs rounded-lg transition-colors font-mono"
              >
                {loadingAdvice ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Анализирам...
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    Генерирай
                  </>
                )}
              </button>
            </div>
            {aiAdvice ? (
              <div className="text-sm text-slate-300 font-mono whitespace-pre-wrap bg-slate-800/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                {aiAdvice}
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-mono text-center py-3">
                Натисни "Генерирай" за персонализиран AI анализ на седмицата
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b] shrink-0">
          <button
            onClick={handleSave}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-cyan-500 transition-all font-mono"
          >
            Запази и затвори
          </button>
        </div>
      </div>
    </div>
  );
}
