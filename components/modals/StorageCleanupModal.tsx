'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Archive, Clock, FileText, AlertTriangle, CheckCircle, HardDrive, RefreshCw, Database } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getStorageUsage, getMaterial, setMaterial } from '@/lib/storage';
import { getIDBStorageUsage, isIndexedDBAvailable } from '@/lib/indexeddb-storage';

interface CleanupOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  estimatedSavings: number; // bytes
  itemCount: number;
  dangerous: boolean;
}

interface StorageCleanupModalProps {
  onClose: () => void;
}

export default function StorageCleanupModal({ onClose }: StorageCleanupModalProps) {
  const { data, updateTopic, cleanOldTimerSessions } = useApp();
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [savedBytes, setSavedBytes] = useState(0);
  const [idbUsage, setIdbUsage] = useState<{ used: number; available: number } | null>(null);

  const storageUsage = getStorageUsage();
  const hasIndexedDB = isIndexedDBAvailable();

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Load IndexedDB usage
  useEffect(() => {
    if (hasIndexedDB) {
      getIDBStorageUsage().then(setIdbUsage);
    }
  }, [hasIndexedDB]);

  // Calculate cleanup options with estimated savings
  const cleanupOptions = useMemo<CleanupOption[]>(() => {
    const options: CleanupOption[] = [];

    // 1. Old quiz history (keep only last 10 per topic)
    let oldQuizHistoryCount = 0;
    let oldQuizHistoryBytes = 0;
    data.subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.quizHistory && topic.quizHistory.length > 10) {
          const oldEntries = topic.quizHistory.slice(0, -10);
          oldQuizHistoryCount += oldEntries.length;
          oldQuizHistoryBytes += JSON.stringify(oldEntries).length * 2;
        }
      });
    });
    if (oldQuizHistoryCount > 0) {
      options.push({
        id: 'old_quiz_history',
        name: 'Стара quiz история',
        description: `Изтрий quiz резултати по-стари от последните 10 на тема (${oldQuizHistoryCount} записа)`,
        icon: <Clock className="w-5 h-5 text-blue-400" />,
        estimatedSavings: oldQuizHistoryBytes,
        itemCount: oldQuizHistoryCount,
        dangerous: false
      });
    }

    // 2. Wrong answers older than 30 days or drilled 3+ times
    let oldWrongAnswersCount = 0;
    let oldWrongAnswersBytes = 0;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    data.subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.wrongAnswers) {
          const old = topic.wrongAnswers.filter(wa =>
            new Date(wa.date) < thirtyDaysAgo || wa.drillCount >= 3
          );
          oldWrongAnswersCount += old.length;
          oldWrongAnswersBytes += JSON.stringify(old).length * 2;
        }
      });
    });
    if (oldWrongAnswersCount > 0) {
      options.push({
        id: 'old_wrong_answers',
        name: 'Стари грешни отговори',
        description: `Изтрий грешки преработени 3+ пъти или по-стари от 30 дни (${oldWrongAnswersCount} записа)`,
        icon: <Archive className="w-5 h-5 text-orange-400" />,
        estimatedSavings: oldWrongAnswersBytes,
        itemCount: oldWrongAnswersCount,
        dangerous: false
      });
    }

    // 3. Timer sessions older than 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const oldTimerSessions = data.timerSessions.filter(s =>
      new Date(s.startTime) < sixtyDaysAgo
    );
    if (oldTimerSessions.length > 0) {
      options.push({
        id: 'old_timer_sessions',
        name: 'Стари таймер сесии',
        description: `Изтрий timer сесии по-стари от 60 дни (${oldTimerSessions.length} записа)`,
        icon: <Clock className="w-5 h-5 text-purple-400" />,
        estimatedSavings: JSON.stringify(oldTimerSessions).length * 2,
        itemCount: oldTimerSessions.length,
        dangerous: false
      });
    }

    // 4. Materials from archived subjects
    let archivedMaterialsCount = 0;
    let archivedMaterialsBytes = 0;
    data.subjects.filter(s => s.archived).forEach(subject => {
      subject.topics.forEach(topic => {
        const material = getMaterial(topic.id);
        if (material) {
          archivedMaterialsCount++;
          archivedMaterialsBytes += material.length * 2;
        }
      });
    });
    if (archivedMaterialsCount > 0) {
      options.push({
        id: 'archived_materials',
        name: 'Материали от архивирани предмети',
        description: `Изтрий материалите от архивирани предмети (${archivedMaterialsCount} теми)`,
        icon: <FileText className="w-5 h-5 text-red-400" />,
        estimatedSavings: archivedMaterialsBytes,
        itemCount: archivedMaterialsCount,
        dangerous: true
      });
    }

    // 5. Highlights from green topics (already mastered)
    let greenHighlightsCount = 0;
    let greenHighlightsBytes = 0;
    data.subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        if (topic.status === 'green' && topic.highlights && topic.highlights.length > 0) {
          greenHighlightsCount += topic.highlights.length;
          greenHighlightsBytes += JSON.stringify(topic.highlights).length * 2;
        }
      });
    });
    if (greenHighlightsCount > 0) {
      options.push({
        id: 'green_highlights',
        name: 'Highlights от усвоени теми',
        description: `Изтрий highlights от зелени теми - вече ги знаеш (${greenHighlightsCount} highlights)`,
        icon: <CheckCircle className="w-5 h-5 text-green-400" />,
        estimatedSavings: greenHighlightsBytes,
        itemCount: greenHighlightsCount,
        dangerous: false
      });
    }

    return options;
  }, [data]);

  const totalEstimatedSavings = useMemo(() => {
    return Array.from(selectedOptions).reduce((total, optionId) => {
      const option = cleanupOptions.find(o => o.id === optionId);
      return total + (option?.estimatedSavings || 0);
    }, 0);
  }, [selectedOptions, cleanupOptions]);

  const toggleOption = (id: string) => {
    const newSelected = new Set(selectedOptions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedOptions(newSelected);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const performCleanup = async () => {
    setIsProcessing(true);
    let totalSaved = 0;

    try {
      // Process each selected option
      for (const optionId of selectedOptions) {
        switch (optionId) {
          case 'old_quiz_history':
            data.subjects.forEach(subject => {
              subject.topics.forEach(topic => {
                if (topic.quizHistory && topic.quizHistory.length > 10) {
                  const oldLength = JSON.stringify(topic.quizHistory).length;
                  const newHistory = topic.quizHistory.slice(-10);
                  updateTopic(subject.id, topic.id, { quizHistory: newHistory });
                  totalSaved += (oldLength - JSON.stringify(newHistory).length) * 2;
                }
              });
            });
            break;

          case 'old_wrong_answers':
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            data.subjects.forEach(subject => {
              subject.topics.forEach(topic => {
                if (topic.wrongAnswers && topic.wrongAnswers.length > 0) {
                  const oldLength = JSON.stringify(topic.wrongAnswers).length;
                  const newWrongAnswers = topic.wrongAnswers.filter(wa =>
                    new Date(wa.date) >= thirtyDaysAgo && wa.drillCount < 3
                  );
                  if (newWrongAnswers.length !== topic.wrongAnswers.length) {
                    updateTopic(subject.id, topic.id, { wrongAnswers: newWrongAnswers });
                    totalSaved += (oldLength - JSON.stringify(newWrongAnswers).length) * 2;
                  }
                }
              });
            });
            break;

          case 'archived_materials':
            data.subjects.filter(s => s.archived).forEach(subject => {
              subject.topics.forEach(topic => {
                const material = getMaterial(topic.id);
                if (material) {
                  totalSaved += material.length * 2;
                  setMaterial(topic.id, '');
                }
              });
            });
            break;

          case 'green_highlights':
            data.subjects.forEach(subject => {
              subject.topics.forEach(topic => {
                if (topic.status === 'green' && topic.highlights && topic.highlights.length > 0) {
                  totalSaved += JSON.stringify(topic.highlights).length * 2;
                  updateTopic(subject.id, topic.id, { highlights: [] });
                }
              });
            });
            break;

          case 'old_timer_sessions':
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 60);
            const oldSessions = data.timerSessions.filter(s => new Date(s.startTime) < cutoffDate);
            totalSaved += JSON.stringify(oldSessions).length * 2;
            cleanOldTimerSessions(cutoffDate);
            break;
        }
      }

      setSavedBytes(totalSaved);
      setCompleted(true);
    } catch (error) {
      console.error('Cleanup error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <HardDrive className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-white font-mono">Управление на паметта</h2>
              <div className="flex items-center gap-4 text-sm text-slate-400 font-mono">
                <span>localStorage: {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.total)}</span>
                {hasIndexedDB && idbUsage && (
                  <span className="flex items-center gap-1">
                    <Database className="w-3 h-3 text-green-400" />
                    Материали: {formatBytes(idbUsage.used)} / {formatBytes(idbUsage.available)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* IndexedDB info banner */}
        {hasIndexedDB && (
          <div className="mx-6 mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-300 font-mono">
                Материалите се записват в IndexedDB - имаш много повече място от преди!
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {completed ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Изчистването завърши!</h3>
              <p className="text-slate-400 font-mono">
                Освободени: <span className="text-green-400">{formatBytes(savedBytes)}</span>
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono rounded-lg transition-colors"
              >
                Затвори
              </button>
            </div>
          ) : cleanupOptions.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Всичко е наред!</h3>
              <p className="text-slate-400 font-mono">Няма какво да се изчисти в момента.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-4 font-mono">
                Избери кои данни да изтриеш за да освободиш място:
              </p>

              <div className="space-y-3">
                {cleanupOptions.map(option => (
                  <button
                    key={option.id}
                    onClick={() => toggleOption(option.id)}
                    disabled={isProcessing}
                    className={`w-full p-4 rounded-lg border transition-all text-left ${
                      selectedOptions.has(option.id)
                        ? option.dangerous
                          ? 'bg-red-900/30 border-red-500'
                          : 'bg-cyan-900/30 border-cyan-500'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedOptions.has(option.id)
                          ? option.dangerous ? 'bg-red-900/50' : 'bg-cyan-900/50'
                          : 'bg-slate-800'
                      }`}>
                        {option.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{option.name}</span>
                          {option.dangerous && (
                            <span className="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded font-mono">
                              НЕОБРАТИМО
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 mt-1">{option.description}</p>
                        <p className="text-xs text-slate-500 mt-2 font-mono">
                          Ще освободи: ~{formatBytes(option.estimatedSavings)}
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedOptions.has(option.id)
                          ? option.dangerous ? 'bg-red-500 border-red-500' : 'bg-cyan-500 border-cyan-500'
                          : 'border-slate-600'
                      }`}>
                        {selectedOptions.has(option.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedOptions.size > 0 && (
                <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400 font-mono">Общо ще се освободят:</p>
                      <p className="text-xl font-bold text-cyan-400 font-mono">{formatBytes(totalEstimatedSavings)}</p>
                    </div>
                    <button
                      onClick={performCleanup}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-mono rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Изчистване...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Изчисти избраните
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
