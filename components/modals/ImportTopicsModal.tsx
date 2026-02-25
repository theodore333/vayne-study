'use client';

import { useState, useEffect, useRef } from 'react';
import { X, FileText, Upload, Sparkles, Loader2, BookOpen, Wrench, Layers, ImagePlus, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { parseTopicsFromText } from '@/lib/algorithms';
import type { Topic, TopicStatus } from '@/lib/types';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';

interface Props {
  subjectId: string;
  subjectName?: string;
  onClose: () => void;
}

interface AnalyzedTopic {
  number: number;
  name: string;
  type: 'theoretical' | 'practical' | 'mixed';
}

interface Section {
  name: string | null;
  topics: AnalyzedTopic[];
}

interface AnalysisResult {
  sections: Section[];
  summary: {
    theoretical: number;
    practical: number;
    mixed: number;
    total: number;
  };
}

export default function ImportTopicsModal({ subjectId, subjectName, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const { addTopics } = useApp();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'simple' | 'smart'>('simple');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [includeTheoretical, setIncludeTheoretical] = useState(true);
  const [includePractical, setIncludePractical] = useState(true);
  const [includeMixed, setIncludeMixed] = useState(true);
  const [addSubheadings, setAddSubheadings] = useState(true);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; preview?: string }[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const parsedTopics = parseTopicsFromText(text);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.map(file => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      return { file, preview };
    });
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove a file
  const removeFile = (index: number) => {
    setUploadedFiles(prev => {
      const newFiles = [...prev];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  // Extract text from uploaded files
  const handleExtractFromFiles = async () => {
    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      alert('Добави API ключ в Settings');
      return;
    }

    setExtracting(true);
    setExtractError(null);

    try {
      // Convert files to base64
      const filePromises = uploadedFiles.map(async ({ file }) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const base64Files = await Promise.all(filePromises);

      // Send to API for extraction
      const response = await fetchWithTimeout('/api/extract-syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: base64Files,
          apiKey,
          subjectName
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      // Set extracted text
      setText(prev => prev ? prev + '\n\n' + result.text : result.text);
      setUploadedFiles([]);
    } catch (err) {
      setExtractError(getFetchErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  };

  // Cleanup previews on unmount — use ref to avoid stale closure
  const uploadedFilesRef = useRef(uploadedFiles);
  uploadedFilesRef.current = uploadedFiles;
  useEffect(() => {
    return () => {
      uploadedFilesRef.current.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
    };
  }, []);

  const handleAnalyze = async () => {
    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      alert('Добави API ключ в Settings');
      return;
    }

    setAnalyzing(true);
    try {
      const response = await fetchWithTimeout('/api/analyze-syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, subjectName, apiKey })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setAnalysis(data);
      setMode('smart');
    } catch (error) {
      alert(getFetchErrorMessage(error));
    } finally {
      setAnalyzing(false);
    }
  };

  const createTopic = (number: number, name: string): Omit<Topic, 'id'> => ({
    number,
    name,
    status: 'gray' as TopicStatus,
    lastReview: null,
    grades: [],
    avgGrade: null,
    quizCount: 0,
    material: '',
    materialImages: [],
    currentBloomLevel: 1,
    quizHistory: [],
    readCount: 0,
    lastRead: null,
    size: null,
    sizeSetBy: null,
    wrongAnswers: [],
    highlights: []
  });

  const getFilteredTopics = (): Omit<Topic, 'id'>[] => {
    if (!analysis) return [];

    const topics: Omit<Topic, 'id'>[] = [];
    let currentNumber = 1;

    for (const section of analysis.sections) {
      // Add section header if needed
      if (addSubheadings && section.name) {
        topics.push(createTopic(currentNumber++, `📚 ${section.name}`));
      }

      // Filter topics by type
      const filteredSectionTopics = section.topics.filter(t => {
        if (t.type === 'theoretical' && !includeTheoretical) return false;
        if (t.type === 'practical' && !includePractical) return false;
        if (t.type === 'mixed' && !includeMixed) return false;
        return true;
      });

      // Add subheadings for practical/theoretical within section
      if (addSubheadings && filteredSectionTopics.length > 0) {
        const theoretical = filteredSectionTopics.filter(t => t.type === 'theoretical');
        const practical = filteredSectionTopics.filter(t => t.type === 'practical');
        const mixed = filteredSectionTopics.filter(t => t.type === 'mixed');

        if (theoretical.length > 0 && includeTheoretical) {
          if (practical.length > 0 || mixed.length > 0) {
            topics.push(createTopic(currentNumber++, '📖 Теоретична част'));
          }
          for (const t of theoretical) {
            topics.push(createTopic(currentNumber++, t.name));
          }
        }

        if (practical.length > 0 && includePractical) {
          if (theoretical.length > 0 || mixed.length > 0) {
            topics.push(createTopic(currentNumber++, '🔧 Практическа част'));
          }
          for (const t of practical) {
            topics.push(createTopic(currentNumber++, t.name));
          }
        }

        if (mixed.length > 0 && includeMixed) {
          for (const t of mixed) {
            topics.push(createTopic(currentNumber++, t.name));
          }
        }
      } else {
        for (const t of filteredSectionTopics) {
          topics.push(createTopic(currentNumber++, t.name));
        }
      }
    }

    return topics;
  };

  const handleImport = () => {
    if (mode === 'simple') {
      if (parsedTopics.length === 0) return;
      addTopics(subjectId, parsedTopics);
    } else {
      const filtered = getFilteredTopics();
      if (filtered.length === 0) return;
      addTopics(subjectId, filtered);
    }
    onClose();
  };

  const filteredTopics = mode === 'smart' ? getFilteredTopics() : parsedTopics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2">
            <FileText size={20} className="text-purple-400" />
            Импортирай теми
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-auto">
          {/* File upload */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Качи снимки/PDF на конспект
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="w-full py-3 border-2 border-dashed border-slate-600 hover:border-purple-500 rounded-lg text-slate-400 hover:text-purple-400 transition-colors flex items-center justify-center gap-2 font-mono text-sm"
            >
              <ImagePlus size={18} />
              Избери файлове (снимки или PDF)
            </button>

            {/* Uploaded files preview */}
            {uploadedFiles.length > 0 && (
              <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-cyan-300 font-mono">
                    {uploadedFiles.length} {uploadedFiles.length === 1 ? 'файл' : 'файла'} избрани
                  </span>
                  <button
                    onClick={() => setUploadedFiles([])}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Изчисти всички
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="relative group">
                      {f.preview ? (
                        <img
                          src={f.preview}
                          alt={f.file.name}
                          className="h-16 w-auto rounded border border-slate-600 object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded border border-slate-600 bg-slate-700 flex items-center justify-center">
                          <FileText size={20} className="text-slate-400" />
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleExtractFromFiles}
                  disabled={extracting}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-mono text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {extracting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Извличане на текст...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Извлечи конспект от файловете
                    </>
                  )}
                </button>
                {extractError && (
                  <p className="mt-2 text-sm text-red-400 font-mono">{extractError}</p>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500 font-mono">или</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Text input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">
              Постави текст директно
            </label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setAnalysis(null); setMode('simple'); }}
              placeholder={`1. Клетъчна структура (лекция)
2. Клетъчна структура (упражнение)
3. ДНК репликация
...`}
              rows={6}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-mono text-sm resize-none"
            />
          </div>

          {/* AI Analyze button */}
          {text.trim() && !analysis && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full mb-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium rounded-lg hover:from-violet-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Анализирам...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  AI Анализ (теория/практика)
                </>
              )}
            </button>
          )}

          {/* Smart mode options */}
          {analysis && (
            <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-3 text-slate-200 font-medium">
                <Sparkles size={16} className="text-purple-400" />
                Открити категории
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <label className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeTheoretical}
                    onChange={(e) => setIncludeTheoretical(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <BookOpen size={14} className="text-blue-400" />
                  <span className="text-sm text-slate-300">
                    Теория ({analysis.summary.theoretical})
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={includePractical}
                    onChange={(e) => setIncludePractical(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <Wrench size={14} className="text-orange-400" />
                  <span className="text-sm text-slate-300">
                    Практика ({analysis.summary.practical})
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeMixed}
                    onChange={(e) => setIncludeMixed(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <Layers size={14} className="text-green-400" />
                  <span className="text-sm text-slate-300">
                    Смесени ({analysis.summary.mixed})
                  </span>
                </label>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addSubheadings}
                  onChange={(e) => setAddSubheadings(e.target.checked)}
                  className="rounded border-slate-600"
                />
                <span className="text-sm text-slate-400">
                  Добави subheadings (📖 Теоретична част / 🔧 Практическа част)
                </span>
              </label>
            </div>
          )}

          {/* Preview */}
          {filteredTopics.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-300 font-mono">
                  Преглед ({filteredTopics.length} теми)
                </span>
                {mode === 'smart' && (
                  <span className="text-xs text-purple-400 font-mono">AI режим</span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto bg-slate-800/30 rounded-lg border border-slate-700 divide-y divide-slate-700/50">
                {filteredTopics.slice(0, 25).map((topic, i) => (
                  <div key={i} className={`px-4 py-2 flex items-center gap-3 ${
                    topic.name.startsWith('📚') || topic.name.startsWith('📖') || topic.name.startsWith('🔧')
                      ? 'bg-slate-700/30'
                      : ''
                  }`}>
                    <span className="text-xs font-mono text-slate-500 w-8">
                      #{topic.number}
                    </span>
                    <span className="text-sm text-slate-300">{topic.name}</span>
                  </div>
                ))}
                {filteredTopics.length > 25 && (
                  <div className="px-4 py-2 text-center text-sm text-slate-500 font-mono">
                    ... и още {filteredTopics.length - 25} теми
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1e293b]">
          <button
            onClick={handleImport}
            disabled={filteredTopics.length === 0}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            Импортирай {filteredTopics.length} {filteredTopics.length === 1 ? 'тема' : 'теми'}
          </button>
        </div>
      </div>
    </div>
  );
}
