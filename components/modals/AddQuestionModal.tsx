'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Check } from 'lucide-react';
import { useApp } from '@/lib/context';

interface AddQuestionModalProps {
  subjectId: string;
  subjectName: string;
  existingBanks: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string }>;
  onClose: () => void;
}

export default function AddQuestionModal({
  subjectId,
  subjectName,
  existingBanks,
  topics,
  onClose
}: AddQuestionModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  const { addQuestionBank, addQuestionsToBank } = useApp();

  // Bank selection
  const [selectedBankId, setSelectedBankId] = useState<string | 'new'>(
    existingBanks.length > 0 ? existingBanks[0].id : 'new'
  );
  const [newBankName, setNewBankName] = useState('');

  // Topic linking
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');

  // Question data
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<string>('А');
  const [explanation, setExplanation] = useState('');

  // Multiple correct answers
  const [multipleCorrect, setMultipleCorrect] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState<Set<string>>(new Set(['А']));

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);

      // Remap correct answers: letters after the removed index shift down by one
      const removedLetter = letters[index];

      // Single correct answer
      if (correctAnswer === removedLetter) {
        setCorrectAnswer(letters[0]);
      } else {
        const correctIdx = letters.indexOf(correctAnswer);
        if (correctIdx > index) {
          setCorrectAnswer(letters[correctIdx - 1]);
        }
      }

      // Multiple correct answers
      const newCorrect = new Set<string>();
      correctAnswers.forEach(letter => {
        const letterIdx = letters.indexOf(letter);
        if (letterIdx === index) return; // removed
        if (letterIdx > index) {
          newCorrect.add(letters[letterIdx - 1]); // shift down
        } else {
          newCorrect.add(letter); // unchanged
        }
      });
      if (newCorrect.size === 0) newCorrect.add(letters[0]);
      setCorrectAnswers(newCorrect);
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value.slice(0, 500);
    setOptions(newOptions);
  };

  const toggleCorrectAnswer = (letter: string) => {
    if (multipleCorrect) {
      const newCorrect = new Set(correctAnswers);
      if (newCorrect.has(letter)) {
        if (newCorrect.size > 1) {
          newCorrect.delete(letter);
        }
      } else {
        newCorrect.add(letter);
      }
      setCorrectAnswers(newCorrect);
    } else {
      setCorrectAnswer(letter);
    }
  };

  const handleSave = async () => {
    if (!questionText.trim()) return;
    if (options.filter(o => o.trim()).length < 2) return;

    setSaving(true);

    try {
      // Build question object
      const formattedOptions = options
        .filter(o => o.trim())
        .map((opt, i) => `${letters[i]}. ${opt}`);

      const finalCorrectAnswer = multipleCorrect
        ? Array.from(correctAnswers).sort().join(', ')
        : correctAnswer;

      const question = {
        type: 'mcq' as const,
        text: questionText.trim(),
        options: formattedOptions,
        correctAnswer: finalCorrectAnswer,
        explanation: explanation.trim() || undefined,
        linkedTopicIds: selectedTopicId ? [selectedTopicId] : [],
        caseId: undefined,
        stats: { attempts: 0, correct: 0, lastAttempt: undefined }
      };

      if (selectedBankId === 'new') {
        // Create new bank, then add question
        const bankName = newBankName.trim() || `Ръчни въпроси - ${new Date().toLocaleDateString('bg-BG')}`;
        const newBankId = addQuestionBank(subjectId, bankName);
        addQuestionsToBank(newBankId, [question], []);
        // Update selected bank to the new one
        setSelectedBankId(newBankId);
      } else {
        // Add to existing bank (context will generate ID)
        addQuestionsToBank(selectedBankId, [question], []);
      }

      setSuccess(true);

      // Reset form for another question after delay
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setQuestionText('');
        setOptions(['', '', '', '']);
        setCorrectAnswer('А');
        setCorrectAnswers(new Set(['А']));
        setExplanation('');
        setSelectedTopicId('');
        setSuccess(false);
      }, 1500);

    } catch (error) {
      console.error('Error saving question:', error);
    } finally {
      setSaving(false);
    }
  };

  const isValid = questionText.trim() && options.filter(o => o.trim()).length >= 2;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[rgba(20,20,35,0.98)]">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 font-mono">
              Добави въпрос ръчно
            </h2>
            <p className="text-sm text-slate-500 font-mono">{subjectName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Bank Selection */}
          <div>
            <label className="block text-xs text-slate-500 font-mono uppercase mb-2">
              Добави към сборник
            </label>
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500"
            >
              <option value="new">+ Нов сборник</option>
              {existingBanks.map(bank => (
                <option key={bank.id} value={bank.id}>{bank.name}</option>
              ))}
            </select>

            {selectedBankId === 'new' && (
              <input
                type="text"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value.slice(0, 100))}
                placeholder="Име на новия сборник (optional)"
                maxLength={100}
                className="w-full mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
              />
            )}
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-xs text-slate-500 font-mono uppercase mb-2">
              Текст на въпроса *
            </label>
            <textarea
              value={questionText}
              onChange={(e) => {
                if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; setSuccess(false); }
                setQuestionText(e.target.value.slice(0, 2000));
              }}
              placeholder="Напиши въпроса тук..."
              rows={3}
              maxLength={2000}
              className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500 resize-none"
            />
            {questionText.length >= 1800 && (
              <p className="text-xs text-amber-400 mt-1 font-mono">{2000 - questionText.length} символа остават</p>
            )}
          </div>

          {/* Topic Linking */}
          {topics.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase mb-2">
                Свързана тема
              </label>
              <select
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="">— Без тема —</option>
                {topics.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500 font-mono uppercase">
                Отговори *
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-400 font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={multipleCorrect}
                  onChange={(e) => {
                    setMultipleCorrect(e.target.checked);
                    if (!e.target.checked) {
                      setCorrectAnswer(Array.from(correctAnswers)[0] || 'А');
                    }
                  }}
                  className="rounded border-slate-600 bg-slate-700 text-purple-500"
                />
                Няколко верни
              </label>
            </div>

            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCorrectAnswer(letters[i])}
                    className={`w-10 h-10 rounded-lg font-mono font-semibold flex items-center justify-center transition-all shrink-0 ${
                      (multipleCorrect ? correctAnswers.has(letters[i]) : correctAnswer === letters[i])
                        ? 'bg-green-500/20 text-green-400 border-2 border-green-500'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                    }`}
                    title={multipleCorrect ? 'Цъкни за да избереш верен отговор' : 'Избери верен отговор'}
                  >
                    {(multipleCorrect ? correctAnswers.has(letters[i]) : correctAnswer === letters[i]) ? (
                      <Check size={18} />
                    ) : (
                      letters[i]
                    )}
                  </button>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Отговор ${letters[i]}`}
                    className="flex-1 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 font-mono"
              >
                <Plus size={16} /> Добави отговор
              </button>
            )}
          </div>

          {/* Explanation */}
          <div>
            <label className="block text-xs text-slate-500 font-mono uppercase mb-2">
              Обяснение (optional)
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value.slice(0, 1000))}
              placeholder="Защо този отговор е верен..."
              rows={2}
              maxLength={1000}
              className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {/* Success Message */}
          {success && (
            <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-3">
              <Check size={20} className="text-green-400" />
              <span className="text-green-400 font-mono">Въпросът е добавен!</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-mono font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? 'Запазване...' : success ? 'Добавен!' : 'Добави въпрос'}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-mono transition-colors"
            >
              Затвори
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
