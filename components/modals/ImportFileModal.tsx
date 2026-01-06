'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Image, Loader2, Sparkles, AlertCircle, Check, Settings } from 'lucide-react';
import { useApp } from '@/lib/context';
import Link from 'next/link';

interface ImportFileModalProps {
  subjectId: string;
  subjectName: string;
  onClose: () => void;
}

interface ExtractedTopic {
  number: number | string;
  name: string;
}

export default function ImportFileModal({ subjectId, subjectName, onClose }: ImportFileModalProps) {
  const { addTopics, incrementApiCalls } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [extractedTopics, setExtractedTopics] = useState<ExtractedTopic[] | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());

  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractedTopics(null);
      setError(null);
      setRawResponse(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setExtractedTopics(null);
      setError(null);
      setRawResponse(null);
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

      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to extract topics');
        if (result.raw) {
          setRawResponse(result.raw);
        }
        return;
      }

      setExtractedTopics(result.topics);
      setSelectedTopics(new Set(result.topics.map((_: ExtractedTopic, i: number) => i)));

      // Track API usage
      if (result.usage) {
        incrementApiCalls(result.usage.cost);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleTopic = (index: number) => {
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTopics(newSelected);
  };

  const handleImport = () => {
    if (!extractedTopics) return;

    const topicsToAdd = extractedTopics
      .filter((_, i) => selectedTopics.has(i))
      .map(t => ({
        number: typeof t.number === 'string' ? parseFloat(t.number) || 0 : t.number,
        name: t.name,
        status: 'gray' as const,
        lastReview: null,
        grades: [],
        avgGrade: null,
        quizCount: 0,
        material: '',
        materialImages: []
      }));

    addTopics(subjectId, topicsToAdd);
    onClose();
  };

  const getFileIcon = () => {
    if (!file) return <Upload size={32} />;
    if (file.type === 'application/pdf') return <FileText size={32} />;
    return <Image size={32} />;
  };

  // No API key - show settings prompt
  if (apiKey === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md text-center">
          <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
        </div>
      </div>
    );
  }

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
            За да използваш AI импорт, първо добави Claude API ключ в настройките.
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

      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 font-mono">
            <Sparkles size={20} className="text-purple-400" />
            AI Импорт на теми
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              {getFileIcon()}
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
                <p className="text-slate-400 font-medium">Качи PDF или снимка</p>
                <p className="text-sm text-slate-500 font-mono">
                  Кликни или пусни файл тук
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
                  <summary className="text-xs text-red-400 cursor-pointer font-mono">Виж отговора на Claude</summary>
                  <pre className="mt-2 text-xs text-slate-400 bg-slate-900 p-2 rounded overflow-x-auto">{rawResponse}</pre>
                </details>
              )}
            </div>
          )}

          {/* Extract Button */}
          {!extractedTopics && (
            <button
              onClick={handleExtract}
              disabled={!file || isProcessing}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Claude Haiku чете документа...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Извлечи теми с AI
                </>
              )}
            </button>
          )}

          {/* Extracted Topics */}
          {extractedTopics && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300 font-mono">
                  Намерени теми ({extractedTopics.length})
                </h3>
                <button
                  onClick={() => {
                    if (selectedTopics.size === extractedTopics.length) {
                      setSelectedTopics(new Set());
                    } else {
                      setSelectedTopics(new Set(extractedTopics.map((_, i) => i)));
                    }
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 font-mono"
                >
                  {selectedTopics.size === extractedTopics.length ? 'Изчисти всички' : 'Избери всички'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 bg-slate-800/30 rounded-lg p-2">
                {extractedTopics.map((topic, i) => (
                  <div
                    key={i}
                    onClick={() => toggleTopic(i)}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                      selectedTopics.has(i)
                        ? 'bg-purple-500/20 border border-purple-500/30'
                        : 'hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      selectedTopics.has(i)
                        ? 'bg-purple-500 border-purple-500'
                        : 'border-slate-600'
                    }`}>
                      {selectedTopics.has(i) && <Check size={14} className="text-white" />}
                    </div>
                    <span className="text-xs text-slate-500 font-mono w-8">
                      {topic.number}
                    </span>
                    <span className="text-sm text-slate-200 flex-1">
                      {topic.name}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleImport}
                disabled={selectedTopics.size === 0}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Импортирай {selectedTopics.size} теми
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
