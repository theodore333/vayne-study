'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Loader2, Sparkles, AlertCircle, Check, Settings, CheckCircle, XCircle } from 'lucide-react';
import { useApp } from '@/lib/context';
import Link from 'next/link';
import { BankQuestion, ClinicalCase } from '@/lib/types';

interface ImportQuestionsModalProps {
  subjectId: string;
  subjectName: string;
  topics: string[];
  onClose: () => void;
}

interface ExtractedQuestion {
  type: 'mcq' | 'open' | 'case_study';
  text: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  linkedTopicIds: string[];
  caseId?: string;
  stats: { attempts: number; correct: number };
}

interface ExtractedCase {
  id: string;
  description: string;
  questionIds: string[];
}

export default function ImportQuestionsModal({
  subjectId,
  subjectName,
  topics,
  onClose
}: ImportQuestionsModalProps) {
  const { addQuestionBank, addQuestionsToBank, incrementApiCalls } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[] | null>(null);
  const [extractedCases, setExtractedCases] = useState<ExtractedCase[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractedQuestions(null);
      setError(null);
      setRawResponse(null);
      // Auto-generate bank name from file name
      if (!bankName) {
        setBankName(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setExtractedQuestions(null);
      setError(null);
      setRawResponse(null);
      if (!bankName) {
        setBankName(droppedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleExtract = async () => {
    if (!file || !apiKey) return;

    setIsProcessing(true);
    setError(null);
    setRawResponse(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('apiKey', apiKey);
      formData.append('subjectName', subjectName);
      formData.append('topicNames', JSON.stringify(topics));

      const response = await fetch('/api/extract-questions', {
        method: 'POST',
        body: formData
      });

      const responseText = await response.text();

      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        setError('Сървърът върна невалиден отговор');
        setRawResponse(responseText.substring(0, 1000));
        return;
      }

      if (!response.ok) {
        setError(result.error || 'Failed to extract questions');
        if (result.raw) {
          setRawResponse(result.raw);
        }
        return;
      }

      setExtractedQuestions(result.questions);
      setExtractedCases(result.cases || []);
      setSelectedQuestions(new Set(result.questions.map((_: any, i: number) => i)));

      if (result.usage) {
        incrementApiCalls(result.usage.cost);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleQuestion = (index: number) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedQuestions(newSelected);
  };

  const handleImport = () => {
    if (!extractedQuestions || !bankName.trim()) return;

    const questionsToAdd = extractedQuestions
      .filter((_, i) => selectedQuestions.has(i))
      .map(q => ({
        type: q.type,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || '',
        linkedTopicIds: q.linkedTopicIds || [],
        caseId: q.caseId || undefined,
        stats: { attempts: 0, correct: 0 }
      }));

    // Create bank and add questions
    const bankId = addQuestionBank(subjectId, bankName.trim());
    addQuestionsToBank(bankId, questionsToAdd, extractedCases);

    onClose();
  };

  // Loading API key
  if (apiKey === undefined) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md text-center">
          <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
        </div>
      </div>
    );
  }

  // No API key
  if (!apiKey) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md text-center">
          <AlertCircle size={48} className="mx-auto text-amber-400 mb-4" />
          <h3 className="text-lg font-semibold text-slate-100 mb-2 font-mono">
            Нужен е API ключ
          </h3>
          <p className="text-sm text-slate-400 mb-4 font-mono">
            За да използваш Question Bank, първо добави Claude API ключ в настройките.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 font-mono text-sm"
            >
              Отказ
            </button>
            <Link
              href="/settings"
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 font-mono text-sm"
            >
              <Settings size={16} />
              Настройки
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 font-mono">
            <Sparkles size={20} className="text-purple-400" />
            Импорт на въпроси от PDF
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Bank Name */}
          <div>
            <label className="block text-sm font-medium text-slate-400 font-mono mb-2">
              Име на сборника
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="напр. Изпитни тестове 2024"
              className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          {/* File Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              file
                ? 'border-purple-500/50 bg-purple-500/10'
                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className={`mx-auto mb-3 ${file ? 'text-purple-400' : 'text-slate-500'}`}>
              {file ? <FileText size={32} /> : <Upload size={32} />}
            </div>
            {file ? (
              <div>
                <p className="text-slate-200 font-medium">{file.name}</p>
                <p className="text-sm text-slate-500 font-mono">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-slate-400 font-medium">Качи PDF със сборник</p>
                <p className="text-sm text-slate-500 font-mono">
                  Тестове, казуси, изпитни въпроси
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800/30 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={18} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-300 font-mono">{error}</p>
              </div>
              {rawResponse && (
                <details className="mt-2">
                  <summary className="text-xs text-red-400 cursor-pointer font-mono">
                    Виж отговора
                  </summary>
                  <pre className="mt-2 text-xs text-slate-400 bg-slate-900 p-2 rounded overflow-x-auto">
                    {rawResponse}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Extract Button */}
          {!extractedQuestions && (
            <button
              onClick={handleExtract}
              disabled={!file || !bankName.trim() || isProcessing}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Claude извлича въпроси...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Извлечи въпроси
                </>
              )}
            </button>
          )}

          {/* Extracted Questions */}
          {extractedQuestions && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300 font-mono">
                  Намерени въпроси ({extractedQuestions.length})
                </h3>
                <button
                  onClick={() => {
                    if (selectedQuestions.size === extractedQuestions.length) {
                      setSelectedQuestions(new Set());
                    } else {
                      setSelectedQuestions(new Set(extractedQuestions.map((_, i) => i)));
                    }
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 font-mono"
                >
                  {selectedQuestions.size === extractedQuestions.length
                    ? 'Изчисти всички'
                    : 'Избери всички'}
                </button>
              </div>

              {/* Summary by type */}
              <div className="flex gap-2 text-xs font-mono">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded">
                  {extractedQuestions.filter(q => q.type === 'mcq').length} MCQ
                </span>
                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded">
                  {extractedQuestions.filter(q => q.type === 'case_study').length} Казуси
                </span>
                <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded">
                  {extractedQuestions.filter(q => q.type === 'open').length} Отворени
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 bg-slate-800/30 rounded-lg p-2">
                {extractedQuestions.map((question, i) => (
                  <div
                    key={i}
                    onClick={() => toggleQuestion(i)}
                    className={`flex items-start gap-2 p-2 rounded-lg transition-all cursor-pointer ${
                      selectedQuestions.has(i)
                        ? 'bg-purple-500/20 border border-purple-500/30'
                        : 'hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                        selectedQuestions.has(i)
                          ? 'bg-purple-500 border-purple-500'
                          : 'border-slate-600'
                      }`}
                    >
                      {selectedQuestions.has(i) && <Check size={14} className="text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          question.type === 'mcq'
                            ? 'bg-blue-500/20 text-blue-300'
                            : question.type === 'case_study'
                            ? 'bg-orange-500/20 text-orange-300'
                            : 'bg-green-500/20 text-green-300'
                        }`}>
                          {question.type === 'mcq' ? 'MCQ' :
                           question.type === 'case_study' ? 'Казус' : 'Open'}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">#{i + 1}</span>
                      </div>
                      <p className="text-sm text-slate-200 line-clamp-2">{question.text}</p>
                      {question.options && (
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          Отговор: {question.correctAnswer}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleImport}
                disabled={selectedQuestions.size === 0}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Импортирай {selectedQuestions.size} въпроса
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
