'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Image, Loader2, Sparkles, AlertCircle, Check, Settings, Edit2, Trash2, Plus, AlertTriangle, DollarSign } from 'lucide-react';
import { useApp } from '@/lib/context';
import Link from 'next/link';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';

interface ImportFileModalProps {
  subjectId: string;
  subjectName: string;
  onClose: () => void;
}

interface ExtractedTopic {
  number: number | string;
  name: string;
}

interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  isLarge: boolean;
}

// Estimate tokens based on file size and type
function estimateTokens(file: File): CostEstimate {
  const fileSizeMB = file.size / 1024 / 1024;
  const isPDF = file.type === 'application/pdf';

  // Rough estimation:
  // - Images: ~1000-1500 tokens per image depending on size
  // - PDFs: ~1500 tokens per MB (includes text + structure)
  // - Base64 encoding adds ~33% overhead

  let inputTokens: number;

  if (isPDF) {
    // PDFs: estimate based on size, roughly 1500 tokens per MB
    inputTokens = Math.round(fileSizeMB * 1500);
  } else {
    // Images: base estimate + size factor
    inputTokens = Math.round(1000 + fileSizeMB * 500);
  }

  // Add prompt tokens (~200)
  inputTokens += 200;

  // Estimate output tokens (depends on topics found, estimate ~50 per topic, ~50 topics avg)
  const outputTokens = 2500;

  // Sonnet pricing: $3/1M input, $15/1M output
  const totalCost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

  // Consider "large" if > 5MB or > 10000 estimated tokens
  const isLarge = fileSizeMB > 5 || inputTokens > 10000;

  return { inputTokens, outputTokens, totalCost, isLarge };
}

export default function ImportFileModal({ subjectId, subjectName, onClose }: ImportFileModalProps) {
  const { addTopics, incrementApiCalls } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined); // undefined = loading, null = no key
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [extractedTopics, setExtractedTopics] = useState<ExtractedTopic[] | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showCostWarning, setShowCostWarning] = useState(false);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
    // Create previews for images
    newFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setFilePreviews(prev => [...prev, url]);
      } else {
        setFilePreviews(prev => [...prev, '']); // Empty string for non-images
      }
    });
    setExtractedTopics(null);
    setError(null);
    setRawResponse(null);
  };

  const removeFile = (index: number) => {
    if (filePreviews[index]) {
      URL.revokeObjectURL(filePreviews[index]);
    }
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    filePreviews.forEach(url => url && URL.revokeObjectURL(url));
    setFiles([]);
    setFilePreviews([]);
    setExtractedTopics(null);
  };

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      filePreviews.forEach(url => url && URL.revokeObjectURL(url));
    };
  }, []);

  const handleExtractClick = () => {
    if (files.length === 0 || !apiKey) return;

    // Calculate total cost estimate for all files
    const totalEstimate = files.reduce((acc, file) => {
      const estimate = estimateTokens(file);
      return {
        inputTokens: acc.inputTokens + estimate.inputTokens,
        outputTokens: acc.outputTokens + estimate.outputTokens,
        totalCost: acc.totalCost + estimate.totalCost,
        isLarge: acc.isLarge || estimate.isLarge
      };
    }, { inputTokens: 0, outputTokens: 0, totalCost: 0, isLarge: false });

    setCostEstimate(totalEstimate);

    // Show warning for large files
    if (totalEstimate.isLarge || files.length > 3) {
      setShowCostWarning(true);
    } else {
      // Small files - proceed directly
      handleExtract();
    }
  };

  const handleExtract = async () => {
    if (files.length === 0 || !apiKey) return;

    setShowCostWarning(false);
    setIsProcessing(true);
    setError(null);
    setRawResponse(null);

    try {
      // Convert all files to base64
      const base64Files = await Promise.all(
        files.map(file => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }))
      );

      const response = await fetchWithTimeout('/api/extract-syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: base64Files,
          apiKey,
          subjectName
        })
      });

      // Get response text first to handle non-JSON responses
      const responseText = await response.text();

      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        // Server returned non-JSON (probably Vercel error)
        setError('Сървърът върна невалиден отговор');
        setRawResponse(responseText.substring(0, 1000));
        return;
      }

      if (!response.ok) {
        setError(result.error || 'Failed to extract topics');
        if (result.raw) {
          setRawResponse(result.raw);
        }
        return;
      }

      // Parse topics from the extracted text, preserving sections
      const text = result.text || '';
      const lines = text.split('\n').filter((line: string) => line.trim());
      const topics: ExtractedTopic[] = [];
      let globalIndex = 1;

      for (const line of lines) {
        // Check for section headers (## Section Name)
        const sectionMatch = line.match(/^##\s*(.+)/);
        if (sectionMatch) {
          // Add section header as a special topic
          topics.push({
            number: `📚`,
            name: sectionMatch[1].trim().toUpperCase()
          });
          globalIndex++;
          continue;
        }

        // Skip # headers (single #)
        if (line.startsWith('#') && !line.startsWith('##')) continue;

        // Match numbered topics: "1. Topic name" or "1) Topic name"
        const match = line.match(/^\s*(\d+)[\.\)]\s*(.+)/);
        if (match) {
          topics.push({
            number: match[1], // Keep original number from document
            name: match[2].trim()
          });
          globalIndex++;
        } else if (line.trim() && !line.startsWith('-') && !line.startsWith('*')) {
          // Non-numbered but non-empty lines
          topics.push({
            number: globalIndex++,
            name: line.trim()
          });
        }
      }

      if (topics.length === 0) {
        setError('Не бяха открити теми в документа');
        setRawResponse(text);
        return;
      }

      setExtractedTopics(topics);
      setSelectedTopics(new Set(topics.map((_, i) => i)));

      // Track API usage
      if (result.inputTokens && result.outputTokens) {
        const cost = (result.inputTokens * 0.015 + result.outputTokens * 0.075) / 1000; // Opus pricing
        incrementApiCalls(cost);
      }
    } catch (err) {
      setError(getFetchErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleTopic = (index: number) => {
    if (editingIndex !== null) return; // Don't toggle while editing
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTopics(newSelected);
  };

  const startEditing = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!extractedTopics) return;
    setEditingIndex(index);
    setEditValue(extractedTopics[index].name);
  };

  const saveEdit = () => {
    if (editingIndex === null || !extractedTopics) return;
    const newTopics = [...extractedTopics];
    newTopics[editingIndex] = { ...newTopics[editingIndex], name: editValue.trim() };
    setExtractedTopics(newTopics);
    setEditingIndex(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const deleteTopic = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!extractedTopics) return;
    const newTopics = extractedTopics.filter((_, i) => i !== index);
    // Keep original numbers - don't renumber!
    setExtractedTopics(newTopics);
    // Update selected indices
    const newSelected = new Set<number>();
    selectedTopics.forEach(i => {
      if (i < index) newSelected.add(i);
      else if (i > index) newSelected.add(i - 1);
    });
    setSelectedTopics(newSelected);
  };

  const addNewTopic = () => {
    if (!extractedTopics) return;
    const newTopic: ExtractedTopic = {
      number: extractedTopics.length + 1,
      name: 'Нова тема'
    };
    setExtractedTopics([...extractedTopics, newTopic]);
    setSelectedTopics(new Set([...selectedTopics, extractedTopics.length]));
    // Start editing the new topic
    setEditingIndex(extractedTopics.length);
    setEditValue('Нова тема');
  };

  const handleImport = () => {
    if (!extractedTopics) return;

    // Build topics with section prefixes
    let currentSection = '';
    let topicCounter = 1;
    const topicsToAdd: Array<{
      number: number;
      name: string;
      status: 'gray';
      lastReview: null;
      grades: never[];
      avgGrade: null;
      quizCount: number;
      material: string;
      materialImages: never[];
      currentBloomLevel: 1;
      quizHistory: never[];
      readCount: number;
      lastRead: null;
      size: null;
      sizeSetBy: null;
      wrongAnswers: never[];
      highlights: never[];
    }> = [];

    extractedTopics.forEach((t, i) => {
      if (!selectedTopics.has(i)) return;

      // Check if this is a section header
      if (t.number === '📚') {
        currentSection = t.name;
        return; // Skip adding section header as a topic
      }

      // Build topic name with section prefix if there's a section
      const topicName = currentSection
        ? `[${currentSection}] ${t.name}`
        : t.name;

      topicsToAdd.push({
        number: topicCounter++,
        name: topicName,
        status: 'gray' as const,
        lastReview: null,
        grades: [],
        avgGrade: null,
        quizCount: 0,
        material: '',
        materialImages: [],
        currentBloomLevel: 1 as const,
        quizHistory: [],
        readCount: 0,
        lastRead: null,
        size: null,
        sizeSetBy: null,
        wrongAnswers: [],
        highlights: []
      });
    });

    addTopics(subjectId, topicsToAdd);
    onClose();
  };


  // Loading API key (undefined = still loading)
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

  // No API key (null or empty string)
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
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              files.length > 0
                ? 'border-purple-500/50 bg-purple-500/10'
                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <div className={`mx-auto mb-3 ${files.length > 0 ? 'text-purple-400' : 'text-slate-500'}`}>
              <Upload size={32} />
            </div>
            <p className="text-slate-400 font-medium">Качи PDF или снимки на конспект</p>
            <p className="text-sm text-slate-500 font-mono">
              Можеш да избереш няколко файла наведнъж
            </p>
          </div>

          {/* Uploaded Files Preview */}
          {files.length > 0 && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-cyan-300 font-mono">
                  {files.length} {files.length === 1 ? 'файл' : 'файла'} избрани
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); clearAllFiles(); }}
                  className="text-xs text-slate-400 hover:text-red-400 font-mono"
                >
                  Изчисти всички
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {files.map((file, i) => (
                  <div key={i} className="relative group">
                    {filePreviews[i] ? (
                      <img
                        src={filePreviews[i]}
                        alt={file.name}
                        className="h-16 w-auto rounded border border-slate-600 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded border border-slate-600 bg-slate-700 flex items-center justify-center" title={file.name}>
                        <FileText size={20} className="text-slate-400" />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
              {/* Total size estimate */}
              <div className="mt-2 text-xs text-slate-500 font-mono">
                Общо: {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          )}

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

          {/* Cost Warning */}
          {showCostWarning && costEstimate && (
            <div className="p-4 bg-amber-900/30 border border-amber-700/50 rounded-xl">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle size={24} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-amber-200 font-semibold font-mono mb-1">
                    Голям файл
                  </h3>
                  <p className="text-sm text-amber-300/80 font-mono">
                    Сигурен ли си, че искаш да продължиш?
                  </p>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3 mb-3 space-y-2">
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-slate-400">Брой файлове:</span>
                  <span className="text-slate-200">{files.length}</span>
                </div>
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-slate-400">Общ размер:</span>
                  <span className="text-slate-200">{(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-slate-400">Приблизително токени (input):</span>
                  <span className="text-slate-200">~{costEstimate.inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-mono">
                  <span className="text-slate-400">Приблизително токени (output):</span>
                  <span className="text-slate-200">~{costEstimate.outputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-mono pt-2 border-t border-slate-700">
                  <span className="text-amber-400 flex items-center gap-1">
                    <DollarSign size={14} />
                    Очаквана цена:
                  </span>
                  <span className="text-amber-300 font-semibold">
                    ~${costEstimate.totalCost.toFixed(6)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCostWarning(false)}
                  className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 font-mono text-sm"
                >
                  Отказ
                </button>
                <button
                  onClick={handleExtract}
                  className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 font-mono text-sm font-semibold"
                >
                  Продължи
                </button>
              </div>
            </div>
          )}

          {/* Extract Button */}
          {!extractedTopics && !showCostWarning && files.length > 0 && (
            <button
              onClick={handleExtractClick}
              disabled={files.length === 0 || isProcessing}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Claude Opus чете {files.length} {files.length === 1 ? 'файл' : 'файла'}...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Извлечи теми от {files.length} {files.length === 1 ? 'файл' : 'файла'}
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
                <div className="flex gap-2">
                  <button
                    onClick={addNewTopic}
                    className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 font-mono"
                  >
                    <Plus size={14} />
                    Добави
                  </button>
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
              </div>

              <div className="max-h-80 overflow-y-auto space-y-1 bg-slate-800/30 rounded-lg p-2">
                {extractedTopics.map((topic, i) => {
                  const isSection = topic.number === '📚';

                  return (
                  <div
                    key={i}
                    onClick={() => !isSection && toggleTopic(i)}
                    className={`group flex items-center gap-2 p-2 rounded-lg transition-all ${
                      isSection
                        ? 'bg-amber-500/20 border border-amber-500/30'
                        : editingIndex === i
                          ? 'bg-blue-500/20 border border-blue-500/30'
                          : selectedTopics.has(i)
                            ? 'bg-purple-500/20 border border-purple-500/30 cursor-pointer'
                            : 'hover:bg-slate-700/50 border border-transparent cursor-pointer'
                    }`}
                  >
                    {/* Checkbox - hide for sections */}
                    {isSection ? (
                      <div className="w-5 h-5 shrink-0" />
                    ) : (
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleTopic(i); }}
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                          selectedTopics.has(i)
                            ? 'bg-purple-500 border-purple-500'
                            : 'border-slate-600 hover:border-slate-500'
                        }`}
                      >
                        {selectedTopics.has(i) && <Check size={14} className="text-white" />}
                      </div>
                    )}

                    {/* Number or section icon */}
                    <span className={`text-xs font-mono w-6 shrink-0 ${isSection ? 'text-amber-400' : 'text-slate-500'}`}>
                      {topic.number}
                    </span>

                    {/* Name - click to edit (not for sections) */}
                    {isSection ? (
                      <span className="text-sm text-amber-300 flex-1 truncate font-semibold">
                        {topic.name}
                      </span>
                    ) : editingIndex === i ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="flex-1 px-2 py-1 bg-slate-800 border border-blue-500 rounded text-sm text-slate-100 font-mono focus:outline-none"
                      />
                    ) : (
                      <span
                        onClick={(e) => startEditing(i, e)}
                        className="text-sm text-slate-200 flex-1 truncate cursor-text hover:text-purple-300 transition-colors"
                        title="Кликни за редактиране"
                      >
                        {topic.name}
                      </span>
                    )}

                    {/* Actions - hide for sections */}
                    {isSection ? (
                      <div className="w-14 shrink-0" />
                    ) : editingIndex === i ? (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                          className="p-1 text-green-400 hover:bg-green-500/20 rounded"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                          className="p-1 text-slate-400 hover:bg-slate-600 rounded"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100">
                        <button
                          onClick={(e) => startEditing(i, e)}
                          className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => deleteTopic(i, e)}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>

              <button
                onClick={handleImport}
                disabled={selectedTopics.size === 0}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-500 hover:to-emerald-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Импортирай {
                  // Count only actual topics (not section headers)
                  extractedTopics.filter((t, i) => selectedTopics.has(i) && t.number !== '📚').length
                } теми
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
