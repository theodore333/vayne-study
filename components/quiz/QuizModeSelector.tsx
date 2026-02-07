'use client';

import { TrendingUp, Lightbulb, Zap, Brain, Target, FileText, Repeat, Settings } from 'lucide-react';
import { QuizMode } from '@/lib/quiz-types';
import { BLOOM_LEVELS, BloomLevel, QuizLengthPreset, QUIZ_LENGTH_PRESETS, WrongAnswer } from '@/lib/types';

interface QuizModeSelectorProps {
  mode: QuizMode | null;
  setMode: (mode: QuizMode) => void;
  isMultiMode: boolean;
  quizLength: QuizLengthPreset;
  setQuizLength: (preset: QuizLengthPreset) => void;
  showCustomOptions: boolean;
  setShowCustomOptions: (show: boolean) => void;
  customBloomLevel: BloomLevel;
  setCustomBloomLevel: (level: BloomLevel) => void;
  customQuestionCount: number;
  setCustomQuestionCount: (count: number) => void;
  crossTopicDrill: boolean;
  setCrossTopicDrill: (drill: boolean) => void;
  subjectWeaknessStats: { total: number; unmastered: number; mastered: number } | null;
  topicWrongAnswers: WrongAnswer[] | undefined;
  examFormat: string | null | undefined;
  matchExamFormat: boolean;
  setMatchExamFormat: (match: boolean) => void;
  isGenerating: boolean;
  hasMaterial: boolean;
  onOpenPreview: () => void;
}

export function QuizModeSelector({
  mode, setMode, isMultiMode,
  quizLength, setQuizLength,
  showCustomOptions, setShowCustomOptions,
  customBloomLevel, setCustomBloomLevel,
  customQuestionCount, setCustomQuestionCount,
  crossTopicDrill, setCrossTopicDrill,
  subjectWeaknessStats, topicWrongAnswers,
  examFormat, matchExamFormat, setMatchExamFormat,
  isGenerating, hasMaterial, onOpenPreview
}: QuizModeSelectorProps) {
  return (
    <>
      {/* Mode Selection */}
      <div className="mb-6">
        <label className="block text-xs text-slate-500 mb-3 font-mono uppercase tracking-wider">Избери режим</label>

        <div className="grid grid-cols-2 gap-3">
          {/* Assess My Level */}
          <button
            onClick={() => { setMode('assessment'); setShowCustomOptions(false); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'assessment' ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}
          >
            <TrendingUp size={20} className={mode === 'assessment' ? 'text-amber-400' : 'text-slate-400'} />
            <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'assessment' ? 'text-amber-400' : 'text-slate-300'}`}>
              Assess My Level
            </span>
            <span className="text-xs text-slate-500 font-mono">Всички Bloom нива</span>
          </button>

          {/* Free Recall - only for single topic */}
          {!isMultiMode && (
            <button
              onClick={() => { setMode('free_recall'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'free_recall' ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <FileText size={20} className={mode === 'free_recall' ? 'text-emerald-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'free_recall' ? 'text-emerald-400' : 'text-slate-300'}`}>
                Free Recall
              </span>
              <span className="text-xs text-slate-500 font-mono">Пиши → AI оценява</span>
            </button>
          )}

          {/* Lower-Order */}
          <button
            onClick={() => { setMode('lower_order'); setShowCustomOptions(false); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'lower_order' ? 'bg-cyan-500/20 border-cyan-500 ring-2 ring-cyan-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Lightbulb size={20} className={mode === 'lower_order' ? 'text-cyan-400' : 'text-slate-400'} />
            <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'lower_order' ? 'text-cyan-400' : 'text-slate-300'}`}>
              Lower-Order
            </span>
            <span className="text-xs text-slate-500 font-mono">Bloom 1-2: Remember, Understand</span>
          </button>

          {/* Mid-Order */}
          <button
            onClick={() => { setMode('mid_order'); setShowCustomOptions(false); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'mid_order' ? 'bg-blue-500/20 border-blue-500 ring-2 ring-blue-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Zap size={20} className={mode === 'mid_order' ? 'text-blue-400' : 'text-slate-400'} />
            <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'mid_order' ? 'text-blue-400' : 'text-slate-300'}`}>
              Mid-Order
            </span>
            <span className="text-xs text-slate-500 font-mono">Bloom 3-4: Apply, Analyze</span>
          </button>

          {/* Higher-Order */}
          <button
            onClick={() => { setMode('higher_order'); setShowCustomOptions(false); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'higher_order' ? 'bg-pink-500/20 border-pink-500 ring-2 ring-pink-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Brain size={20} className={mode === 'higher_order' ? 'text-pink-400' : 'text-slate-400'} />
            <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'higher_order' ? 'text-pink-400' : 'text-slate-300'}`}>
              Higher-Order
            </span>
            <span className="text-xs text-slate-500 font-mono">Bloom 5-6: Evaluate, Create</span>
          </button>

          {/* Gap Analysis */}
          <button
            onClick={() => { setMode('gap_analysis'); setShowCustomOptions(false); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              mode === 'gap_analysis' ? 'bg-red-500/20 border-red-500 ring-2 ring-red-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Target size={20} className={mode === 'gap_analysis' ? 'text-red-400' : 'text-slate-400'} />
            <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'gap_analysis' ? 'text-red-400' : 'text-slate-300'}`}>
              Gap Analysis
            </span>
            <span className="text-xs text-slate-500 font-mono">Открий слаби места</span>
          </button>

          {/* Drill Weakness */}
          {!isMultiMode && ((topicWrongAnswers && topicWrongAnswers.length > 0) || (subjectWeaknessStats && subjectWeaknessStats.unmastered > 0)) && (
            <button
              onClick={() => { setMode('drill_weakness'); setShowCustomOptions(false); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === 'drill_weakness' ? 'bg-orange-500/20 border-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <Repeat size={20} className={mode === 'drill_weakness' ? 'text-orange-400' : 'text-slate-400'} />
              <span className={`block font-mono text-sm font-semibold mt-2 ${mode === 'drill_weakness' ? 'text-orange-400' : 'text-slate-300'}`}>
                Drill Weakness
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {topicWrongAnswers?.length || 0} грешки (тема)
                {subjectWeaknessStats && subjectWeaknessStats.unmastered > 0 && (
                  <> · {subjectWeaknessStats.unmastered} (предмет)</>
                )}
              </span>
            </button>
          )}
        </div>

        {/* Cross-topic drill toggle + stats */}
        {mode === 'drill_weakness' && subjectWeaknessStats && subjectWeaknessStats.total > 0 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300 font-mono">Обхват на drill:</span>
              <div className="flex bg-slate-900/60 rounded-lg p-0.5">
                <button
                  onClick={() => setCrossTopicDrill(false)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
                    !crossTopicDrill ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Тази тема
                </button>
                <button
                  onClick={() => setCrossTopicDrill(true)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
                    crossTopicDrill ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Целия предмет
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-4">
                <span className="text-red-400">
                  {crossTopicDrill ? subjectWeaknessStats.unmastered : (topicWrongAnswers?.filter(w => w.drillCount < 3).length || 0)} неупражнявани
                </span>
                <span className="text-green-400">
                  {crossTopicDrill ? subjectWeaknessStats.mastered : (topicWrongAnswers?.filter(w => w.drillCount >= 3).length || 0)} адресирани
                </span>
                <span className="text-slate-500">
                  {crossTopicDrill ? subjectWeaknessStats.total : (topicWrongAnswers?.length || 0)} общо
                </span>
              </div>
              {crossTopicDrill && (
                <span className="text-slate-500">max 30 за quiz</span>
              )}
            </div>
          </div>
        )}

        {/* Quiz Length Dropdown */}
        {mode && mode !== 'free_recall' && mode !== 'custom' && mode !== 'drill_weakness' && (
          <div className="mt-4">
            <label className="block text-xs text-slate-500 mb-2 font-mono uppercase tracking-wider">
              Дължина на теста
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(QUIZ_LENGTH_PRESETS) as QuizLengthPreset[]).map(preset => {
                const config = QUIZ_LENGTH_PRESETS[preset];
                const isSelected = quizLength === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => setQuizLength(preset)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-purple-500/20 border-purple-500 ring-1 ring-purple-500/30'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className={`block font-mono text-sm font-medium ${
                      isSelected ? 'text-purple-300' : 'text-slate-300'
                    }`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {config.description}
                    </span>
                    <span className={`block text-xs mt-1 font-mono ${
                      config.weight >= 1.5 ? 'text-green-400' :
                      config.weight <= 0.5 ? 'text-amber-400' : 'text-slate-500'
                    }`}>
                      {config.weight}x тежест
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Match Exam Format Checkbox */}
        {examFormat && (
          <label className="flex items-center gap-3 mt-4 p-3 bg-slate-800/30 rounded-lg cursor-pointer hover:bg-slate-800/50 transition-colors">
            <input
              type="checkbox"
              checked={matchExamFormat}
              onChange={(e) => setMatchExamFormat(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
            />
            <div>
              <span className="text-sm text-slate-300 font-mono">Match Exam Format</span>
              <p className="text-xs text-slate-500 font-mono">{examFormat}</p>
            </div>
          </label>
        )}

        {/* Custom Override */}
        <button
          onClick={() => { setShowCustomOptions(!showCustomOptions); if (!showCustomOptions) setMode('custom'); }}
          className="mt-3 text-xs text-slate-500 hover:text-slate-400 font-mono"
        >
          {showCustomOptions ? '▼ Скрий custom' : '▶ Custom (override)'}
        </button>

        {showCustomOptions && (
          <div className="mt-4 p-4 bg-slate-800/30 rounded-lg space-y-4 border border-slate-700">
            <div>
              <label className="block text-xs text-slate-400 mb-2 font-mono">Брой въпроси (само тук се задава ръчно)</label>
              <div className="flex gap-2">
                {[3, 5, 10, 15, 20, 30].map(n => (
                  <button
                    key={n}
                    onClick={() => setCustomQuestionCount(n)}
                    className={`px-3 py-1.5 rounded-lg border font-mono text-sm ${
                      customQuestionCount === n ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2 font-mono">Bloom ниво</label>
              <div className="grid grid-cols-6 gap-1">
                {BLOOM_LEVELS.map(b => (
                  <button
                    key={b.level}
                    onClick={() => setCustomBloomLevel(b.level)}
                    className={`p-2 rounded border text-center font-mono text-xs ${
                      customBloomLevel === b.level ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'
                    }`}
                    title={b.name}
                  >
                    {b.level}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Material mode indicator */}
      {mode && mode !== 'free_recall' && !hasMaterial && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
          <p className="text-xs text-amber-300 font-mono">
            <span className="font-bold">Общи знания</span> — няма добавен материал. Въпросите ще са от стандартния медицински курс, не от конкретния ти конспект.
          </p>
        </div>
      )}

      {/* Start Button */}
      <button
        onClick={mode === 'free_recall' ? () => {} : onOpenPreview}
        disabled={isGenerating || !mode || (mode === 'free_recall' && !hasMaterial)}
        className={`w-full py-4 font-semibold rounded-lg font-mono disabled:opacity-50 flex items-center justify-center gap-2 ${
          mode === 'free_recall'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white'
            : mode === 'gap_analysis'
              ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white'
              : mode === 'mid_order'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                : mode === 'higher_order'
                  ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white'
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white'
        }`}
      >
        {mode === 'free_recall' ? (
          <><FileText size={20} /> Започни Free Recall</>
        ) : (
          <><Settings size={20} /> Преглед и редакция</>
        )}
      </button>
    </>
  );
}
