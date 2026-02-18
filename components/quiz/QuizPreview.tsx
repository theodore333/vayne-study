'use client';

import { Brain, Play, RefreshCw, ArrowLeft, AlertCircle, StopCircle, Repeat, Sparkles } from 'lucide-react';
import { QuizMode } from '@/lib/quiz-types';
import { BLOOM_LEVELS, BloomLevel } from '@/lib/types';

interface MultiTopicInfo {
  id: string;
  number?: number;
  name: string;
  currentBloomLevel?: number;
  subjectColor: string;
}

interface QuizPreviewProps {
  mode: QuizMode | null;
  customBloomLevel: BloomLevel;
  isMultiMode: boolean;
  multiTopics: MultiTopicInfo[];
  topicName: string | undefined;
  topicBloomLevel: number;
  previewQuestionCount: number;
  setPreviewQuestionCount: (count: number) => void;
  selectedModel: 'opus' | 'sonnet' | 'haiku';
  setSelectedModel: (model: 'opus' | 'sonnet' | 'haiku') => void;
  hasMaterial: boolean;
  isGenerating: boolean;
  elapsedSeconds: number;
  error: string | null;
  onBack: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}

export function QuizPreview({
  mode, customBloomLevel, isMultiMode, multiTopics,
  topicName, topicBloomLevel,
  previewQuestionCount, setPreviewQuestionCount,
  selectedModel, setSelectedModel,
  hasMaterial, isGenerating, elapsedSeconds, error,
  onBack, onGenerate, onCancel
}: QuizPreviewProps) {
  const getModeLabel = () => {
    switch (mode) {
      case 'assessment': return 'Mix / Assess';
      case 'lower_order': return 'Lower-Order (Remember/Understand)';
      case 'mid_order': return 'Mid-Order (Apply/Analyze)';
      case 'higher_order': return 'Higher-Order (Evaluate/Create)';
      case 'drill_weakness': return 'Drill Weakness';
      case 'custom': return `Custom (Bloom ${customBloomLevel})`;
      default: return 'Quiz';
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'assessment': return 'amber';
      case 'lower_order': return 'cyan';
      case 'mid_order': return 'blue';
      case 'higher_order': return 'pink';
      case 'drill_weakness': return 'orange';
      case 'custom': return 'purple';
      default: return 'slate';
    }
  };

  const colorClass: Record<string, string> = {
    amber: 'text-amber-400', cyan: 'text-cyan-400', blue: 'text-blue-400',
    pink: 'text-pink-400', red: 'text-red-400', orange: 'text-orange-400',
    purple: 'text-purple-400', slate: 'text-slate-400',
  };
  const color = getModeColor();
  const textColor = colorClass[color] || 'text-slate-400';

  return (
    <div className="min-h-screen p-6 space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm"
      >
        <ArrowLeft size={16} /> Обратно към настройки
      </button>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8 max-w-lg mx-auto">
        <div className="text-center mb-6">
          <Brain size={40} className={`mx-auto mb-3 ${textColor}`} />
          <h2 className="text-xl font-bold text-slate-100 font-mono">Преглед на Quiz</h2>
          <p className="text-sm text-slate-400 font-mono mt-1">Провери и коригирай преди старт</p>
        </div>

        {/* Summary */}
        <div className="space-y-3 mb-6">
          {isMultiMode && multiTopics.length > 0 ? (
            <>
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <span className="text-purple-300 font-mono text-sm font-semibold">
                  🔀 Mix Quiz: {multiTopics.length} теми
                </span>
                <div className="mt-2 space-y-1">
                  {multiTopics.slice(0, 5).map((t) => (
                    <div key={t.id} className="text-xs text-slate-400 font-mono flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.subjectColor }} />
                      #{t.number} {t.name.length > 30 ? t.name.slice(0, 30) + '...' : t.name}
                    </div>
                  ))}
                  {multiTopics.length > 5 && (
                    <div className="text-xs text-slate-500 font-mono">
                      +{multiTopics.length - 5} още...
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400 font-mono text-sm">Режим</span>
                <span className={`${textColor} font-mono text-sm`}>{getModeLabel()}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400 font-mono text-sm">Тема</span>
                <span className="text-slate-200 font-mono text-sm truncate max-w-[200px]" title={topicName}>
                  {topicName}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400 font-mono text-sm">Режим</span>
                <span className={`${textColor} font-mono text-sm`}>{getModeLabel()}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-400 font-mono text-sm">Текущо Bloom ниво</span>
                <span className="text-purple-400 font-mono text-sm">
                  {topicBloomLevel} - {BLOOM_LEVELS.find(b => b.level === topicBloomLevel)?.name}
                </span>
              </div>
              <div className={`flex justify-between items-center p-3 rounded-lg ${
                hasMaterial ? 'bg-green-500/10 border border-green-500/20' : 'bg-amber-500/10 border border-amber-500/20'
              }`}>
                <span className="text-slate-400 font-mono text-sm">Източник</span>
                <span className={`font-mono text-sm font-semibold ${hasMaterial ? 'text-green-400' : 'text-amber-400'}`}>
                  {hasMaterial ? 'От материала' : 'Общи знания'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Question Count Adjuster */}
        <div className="mb-6">
          <label className="block text-xs text-slate-500 mb-3 font-mono uppercase tracking-wider text-center">
            Брой въпроси
          </label>

          {/* AI/Manual toggle for assessment mode */}
          {mode === 'assessment' && (
            <div className="flex justify-center gap-2 mb-4">
              <button
                onClick={() => setPreviewQuestionCount(0)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${
                  previewQuestionCount === 0
                    ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Sparkles size={14} /> AI преценява
              </button>
              <button
                onClick={() => setPreviewQuestionCount(previewQuestionCount === 0 ? 12 : previewQuestionCount)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${
                  previewQuestionCount > 0
                    ? 'bg-purple-500/20 border border-purple-500/50 text-purple-300'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                Ръчно
              </button>
            </div>
          )}

          {/* AI decides message */}
          {mode === 'assessment' && previewQuestionCount === 0 ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <Sparkles size={18} className="text-purple-400" />
                <span className="text-purple-300 font-mono text-sm">Спрямо сложността на темата</span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-2">
                Всички 6 нива на Bloom — от основи до анализ
              </p>
            </div>
          ) : (
            <>
              {/* Manual count adjuster */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setPreviewQuestionCount(Math.max(3, previewQuestionCount - 5))}
                  disabled={previewQuestionCount <= 3}
                  className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xl hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  -5
                </button>
                <button
                  onClick={() => setPreviewQuestionCount(Math.max(3, previewQuestionCount - 1))}
                  disabled={previewQuestionCount <= 3}
                  className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 font-mono hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  -1
                </button>
                <div className="w-20 text-center">
                  <span className="text-4xl font-bold text-white font-mono">{previewQuestionCount}</span>
                </div>
                <button
                  onClick={() => setPreviewQuestionCount(Math.min(50, previewQuestionCount + 1))}
                  disabled={previewQuestionCount >= 50}
                  className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 font-mono hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  +1
                </button>
                <button
                  onClick={() => setPreviewQuestionCount(Math.min(50, previewQuestionCount + 5))}
                  disabled={previewQuestionCount >= 50}
                  className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xl hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  +5
                </button>
              </div>
              <p className="text-xs text-slate-500 font-mono text-center mt-2">
                мин: 3 | макс: 50
              </p>

              {/* Quick presets */}
              <div className="flex justify-center gap-2 mt-3">
                {[5, 10, 15, 20, 30].map(n => (
                  <button
                    key={n}
                    onClick={() => setPreviewQuestionCount(n)}
                    className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all ${
                      previewQuestionCount === n
                        ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
                        : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Model Selector */}
        <div className="mb-6">
          <label className="block text-xs text-slate-500 mb-3 font-mono uppercase tracking-wider text-center">
            AI Модел (цена/качество)
          </label>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setSelectedModel('haiku')}
              className={`flex-1 max-w-[140px] px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                selectedModel === 'haiku'
                  ? 'bg-green-500/20 border-2 border-green-500 text-green-300'
                  : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-semibold">Haiku</div>
              <div className="text-[10px] opacity-70">~$0.01/quiz</div>
              <div className="text-[10px] opacity-50">бърз, базов</div>
            </button>
            <button
              onClick={() => setSelectedModel('sonnet')}
              className={`flex-1 max-w-[140px] px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                selectedModel === 'sonnet'
                  ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                  : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-semibold">Sonnet</div>
              <div className="text-[10px] opacity-70">~$0.06/quiz</div>
              <div className="text-[10px] opacity-50">баланс</div>
            </button>
            <button
              onClick={() => setSelectedModel('opus')}
              className={`flex-1 max-w-[140px] px-3 py-2 rounded-lg font-mono text-xs transition-all ${
                selectedModel === 'opus'
                  ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-300'
                  : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-semibold">Opus</div>
              <div className="text-[10px] opacity-70">~$0.30/quiz</div>
              <div className="text-[10px] opacity-50">най-добър</div>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
              <AlertCircle size={16} /> {error}
            </div>
            <button
              onClick={onGenerate}
              className="mt-2 px-4 py-1.5 bg-amber-600/20 border border-amber-600/40 text-amber-300 rounded-lg font-mono text-xs hover:bg-amber-600/30 transition-colors"
            >
              <RefreshCw size={12} className="inline mr-1.5" /> Опитай отново
            </button>
          </div>
        )}

        {/* Generating state */}
        {isGenerating ? (
          <div className="space-y-3">
            <div className="w-full py-4 bg-slate-700/50 border border-slate-600/50 rounded-lg font-mono text-center">
              <div className="flex items-center justify-center gap-2 text-slate-200 mb-2">
                <RefreshCw size={20} className="animate-spin text-amber-400" />
                <span className="font-semibold">Генериране... ({elapsedSeconds}s)</span>
              </div>
              <p className="text-xs text-slate-400">Обикновено 30-120 секунди. По-дълги теми отнемат повече.</p>
              <div className="mt-3 mx-8 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full animate-pulse" style={{ width: `${Math.min(95, (elapsedSeconds / 120) * 100)}%`, transition: 'width 1s linear' }} />
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-full py-2 bg-slate-800/60 border border-slate-600/50 text-slate-400 hover:text-red-400 hover:border-red-600/40 rounded-lg font-mono text-sm flex items-center justify-center gap-2 transition-all"
            >
              <StopCircle size={16} /> Отмени
            </button>
          </div>
        ) : (
          <button
            onClick={onGenerate}
            disabled={!mode}
            className={`w-full py-4 font-semibold rounded-lg font-mono flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'drill_weakness'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-500 hover:to-amber-500'
                  : mode === 'mid_order'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500'
                    : mode === 'higher_order'
                      ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white hover:from-pink-500 hover:to-purple-500'
                      : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500'
            }`}
          >
            {!mode ? (
              <>Избери режим първо</>
            ) : mode === 'drill_weakness' ? (
              <><Repeat size={20} /> Drill Weakness ({previewQuestionCount} въпроса)</>
            ) : previewQuestionCount === 0 ? (
              <><Play size={20} /> Старт Quiz (AI брой)</>
            ) : (
              <><Play size={20} /> Старт Quiz ({previewQuestionCount} въпроса)</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
