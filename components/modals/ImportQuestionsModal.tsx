'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Loader2, Sparkles, AlertCircle, Check, Settings, CheckCircle, ScanLine, FileType, Files, Trash2, Plus } from 'lucide-react';
import { useApp } from '@/lib/context';
import Link from 'next/link';
import { Topic } from '@/lib/types';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';

interface ImportQuestionsModalProps {
  subjectId: string;
  subjectName: string;
  topics: Topic[];  // Full topic objects for ID + name
  onClose: () => void;
}

interface ExtractedQuestion {
  type: 'mcq' | 'open' | 'case_study';
  text: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  linkedTopicIds: string[];
  bloomLevel?: number;
  caseId?: string;
  stats: { attempts: number; correct: number };
}

interface ExtractedCase {
  id: string;
  description: string;
  questionIds: string[];
}

interface PDFAnalysisResult {
  isScanned: boolean;
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
}

// ExtractionWarning interface kept for future use with wasRepaired flag

// Normalize text for duplicate comparison
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
}

// Check if two questions are likely duplicates
function isDuplicate(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  // Check first 40 chars match (catches minor trailing differences)
  if (na.length >= 40 && nb.length >= 40 && na.substring(0, 40) === nb.substring(0, 40)) return true;
  // Check if one contains the other (for subset matches)
  if (na.length > 20 && nb.length > 20) {
    if (na.includes(nb.substring(0, Math.min(40, nb.length)))) return true;
    if (nb.includes(na.substring(0, Math.min(40, na.length)))) return true;
  }
  return false;
}

export default function ImportQuestionsModal({
  subjectId,
  subjectName,
  topics,
  onClose
}: ImportQuestionsModalProps) {
  const { data, addQuestionBank, addQuestionsToBank, incrementApiCalls } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[] | null>(null);
  const [extractedCases, setExtractedCases] = useState<ExtractedCase[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [pdfAnalysis, setPdfAnalysis] = useState<PDFAnalysisResult | null>(null);
  const [wasRepaired, setWasRepaired] = useState(false);
  const [wasChunked, setWasChunked] = useState(false);
  const [numChunks, setNumChunks] = useState(0);

  // Duplicate detection
  const [duplicateIndices, setDuplicateIndices] = useState<Set<number>>(new Set());

  // Multi-part file support
  const [isMultiPart, setIsMultiPart] = useState(false);
  const [fileParts, setFileParts] = useState<File[]>([]);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);

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
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractedQuestions(null);
      setError(null);
      setRawResponse(null);
      setPdfAnalysis(null);
      setWasRepaired(false);
      setWasChunked(false);
      setNumChunks(0);
      setDuplicateIndices(new Set());
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
      if (isMultiPart) {
        // Add to parts list
        addFilePart(droppedFile);
      } else {
        setFile(droppedFile);
        setExtractedQuestions(null);
        setError(null);
        setRawResponse(null);
        setPdfAnalysis(null);
        setWasRepaired(false);
        setWasChunked(false);
        setNumChunks(0);
        setDuplicateIndices(new Set());
        if (!bankName) {
          setBankName(droppedFile.name.replace(/\.[^/.]+$/, ''));
        }
      }
    }
  };

  // Multi-part handlers - with natural number sorting
  const naturalSort = (a: File, b: File) => {
    // Extract numbers from filenames for natural sorting
    const getNumber = (name: string) => {
      const match = name.match(/(\d+)\.[^.]+$/);
      return match ? parseInt(match[1], 10) : 0;
    };
    return getNumber(a.name) - getNumber(b.name);
  };

  const addFilePart = (newFile: File) => {
    setFileParts(prev => {
      const updated = [...prev, newFile].sort(naturalSort);
      // Auto-set bank name from first file
      if (updated.length === 1 && !bankName) {
        setBankName(newFile.name.replace(/(_Part\d+|_part\d+|\.\d+)?\.[^/.]+$/, ''));
      }
      return updated;
    });
    setExtractedQuestions(null);
    setError(null);
    setDuplicateIndices(new Set());
  };

  const removeFilePart = (index: number) => {
    setFileParts(prev => prev.filter((_, i) => i !== index));
  };

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(f => addFilePart(f));
    }
  };

  const handleExtract = async () => {
    // Check if we have files to process
    const hasFiles = isMultiPart ? fileParts.length > 0 : file !== null;
    if (!hasFiles || !apiKey) return;

    setIsProcessing(true);
    setError(null);
    setRawResponse(null);

    try {
      // Multi-part: process each file separately and combine results
      if (isMultiPart && fileParts.length > 0) {
        const allQuestions: ExtractedQuestion[] = [];
        const allCases: ExtractedCase[] = [];
        let totalCost = 0;
        let lastPdfAnalysis: PDFAnalysisResult | null = null;

        for (let i = 0; i < fileParts.length; i++) {
          const part = fileParts[i];
          setProcessingStatus(`Обработка на част ${i + 1}/${fileParts.length}: ${part.name}`);

          const formData = new FormData();
          formData.append('file', part);
          formData.append('apiKey', apiKey);
          formData.append('subjectName', subjectName);
          formData.append('topicNames', JSON.stringify(topics.map(t => t.name)));
          formData.append('topicIds', JSON.stringify(topics.map(t => t.id)));

          const response = await fetchWithTimeout('/api/extract-questions', {
            method: 'POST',
            body: formData,
            timeout: 180000 // 3 minutes for question extraction per part
          });

          const responseText = await response.text();
          let result;
          try {
            result = JSON.parse(responseText);
          } catch {
            console.error(`Part ${i + 1} parse error:`, responseText.substring(0, 500));
            continue; // Skip failed part, continue with others
          }

          if (response.ok && result.questions) {
            // Add part number to questions for reference
            const questionsWithPart = result.questions.map((q: any) => ({
              ...q,
              partNumber: i + 1
            }));
            allQuestions.push(...questionsWithPart);
            if (result.cases) allCases.push(...result.cases);
            if (result.usage?.cost) totalCost += result.usage.cost;
            if (result.pdfAnalysis) lastPdfAnalysis = result.pdfAnalysis;
          }
        }

        setProcessingStatus(null);

        if (allQuestions.length === 0) {
          setError('Не бяха извлечени въпроси от нито един файл');
          return;
        }

        setExtractedQuestions(allQuestions);
        setExtractedCases(allCases);
        detectDuplicates(allQuestions);
        if (lastPdfAnalysis) setPdfAnalysis(lastPdfAnalysis);
        setWasChunked(true);
        setNumChunks(fileParts.length);
        incrementApiCalls(totalCost);
        return;
      }

      // Single file mode
      const formData = new FormData();
      formData.append('file', file!);
      formData.append('apiKey', apiKey);
      formData.append('subjectName', subjectName);
      formData.append('topicNames', JSON.stringify(topics.map(t => t.name)));
      formData.append('topicIds', JSON.stringify(topics.map(t => t.id)));

      const response = await fetchWithTimeout('/api/extract-questions', {
        method: 'POST',
        body: formData,
        timeout: 180000 // 3 minutes for question extraction
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
      detectDuplicates(result.questions);

      // Set PDF analysis if available
      if (result.pdfAnalysis) {
        setPdfAnalysis(result.pdfAnalysis);
      }

      // Check if JSON was repaired (truncated response)
      if (result.wasRepaired) {
        setWasRepaired(true);
      }

      // Check if chunked extraction was used
      if (result.wasChunked) {
        setWasChunked(true);
        setNumChunks(result.numChunks || 0);
      }

      if (result.usage) {
        incrementApiCalls(result.usage.cost);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Provide more helpful error messages
      if (errorMessage === 'Failed to fetch' || errorMessage.includes('fetch')) {
        setError('Timeout или мрежова грешка. Възможни причини:\n' +
          '• PDF файлът е твърде голям (опитай с по-малък)\n' +
          '• Vercel Free tier има 10 сек. timeout\n' +
          '• Опитай да пуснеш локално: npm run dev');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('504')) {
        setError('Timeout - Claude API отговаря твърде бавно. Опитай с по-малък PDF.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Detect duplicates against existing bank questions
  const detectDuplicates = (questions: ExtractedQuestion[]) => {
    const existingBanks = (data.questionBanks || []).filter(b => b.subjectId === subjectId);
    const existingTexts = existingBanks.flatMap(b => b.questions.map(q => q.text));

    const dupes = new Set<number>();
    // Also detect duplicates within the extracted batch itself
    const seenTexts: string[] = [];

    questions.forEach((q, i) => {
      // Check against existing bank questions
      const isExistingDupe = existingTexts.some(existing => isDuplicate(q.text, existing));
      if (isExistingDupe) {
        dupes.add(i);
        return;
      }
      // Check against earlier questions in this batch
      const isBatchDupe = seenTexts.some(seen => isDuplicate(q.text, seen));
      if (isBatchDupe) {
        dupes.add(i);
      }
      seenTexts.push(q.text);
    });

    setDuplicateIndices(dupes);

    // Auto-deselect duplicates, select the rest
    const selected = new Set(questions.map((_, i) => i));
    dupes.forEach(i => selected.delete(i));
    setSelectedQuestions(selected);
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
        bloomLevel: q.bloomLevel,
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
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          // Don't close if there are extracted questions (prevent accidental data loss)
          if (extractedQuestions && extractedQuestions.length > 0) {
            if (confirm('Имаш неимпортнати въпроси. Сигурен ли си, че искаш да затвориш?')) {
              onClose();
            }
          } else {
            onClose();
          }
        }}
      />

      <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 font-mono">
            <Sparkles size={20} className="text-purple-400" />
            Импорт на въпроси от PDF
          </h2>
          <button
            onClick={() => {
              if (extractedQuestions && extractedQuestions.length > 0) {
                if (confirm('Имаш неимпортнати въпроси. Сигурен ли си, че искаш да затвориш?')) {
                  onClose();
                }
              } else {
                onClose();
              }
            }}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
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

          {/* Multi-part toggle */}
          <label className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg cursor-pointer hover:bg-slate-800/50 transition-colors">
            <input
              type="checkbox"
              checked={isMultiPart}
              onChange={(e) => {
                setIsMultiPart(e.target.checked);
                setFile(null);
                setFileParts([]);
                setExtractedQuestions(null);
                setError(null);
              }}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
            />
            <div className="flex items-center gap-2">
              <Files size={18} className="text-purple-400" />
              <span className="text-sm text-slate-300 font-mono">Файлът е разделен на части</span>
            </div>
            <span className="text-xs text-slate-500 font-mono ml-auto">
              (въпроси + отговори в отделни файлове)
            </span>
          </label>

          {/* File Upload - Single or Multi */}
          {!isMultiPart ? (
            /* Single file upload */
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
                accept=".pdf,.docx,.doc,image/*"
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
                  <p className="text-slate-400 font-medium">Качи PDF или Word документ</p>
                  <p className="text-sm text-slate-500 font-mono">
                    Тестове, казуси, изпитни въпроси
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Multi-part file upload */
            <div className="space-y-3">
              {/* Parts list */}
              {fileParts.length > 0 && (
                <div className="space-y-2">
                  {fileParts.map((part, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg"
                    >
                      <CheckCircle size={18} className="text-green-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-mono truncate">{part.name}</p>
                        <p className="text-xs text-slate-500 font-mono">
                          {(part.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <span className="text-xs text-purple-400 font-mono shrink-0">
                        Part {index + 1}
                      </span>
                      <button
                        onClick={() => removeFilePart(index)}
                        className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add more parts */}
              <div
                onClick={() => multiFileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-slate-700 hover:border-purple-500/50 rounded-xl p-6 text-center cursor-pointer transition-all hover:bg-slate-800/30"
              >
                <input
                  ref={multiFileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,image/*"
                  multiple
                  onChange={handleMultiFileChange}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 text-slate-400">
                  <Plus size={20} />
                  <span className="font-mono text-sm">
                    {fileParts.length === 0 ? 'Добави файлове' : 'Добави още части'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Файловете ще бъдат сортирани по име
                </p>
              </div>

              {/* Summary */}
              {fileParts.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg">
                  <span className="text-xs text-slate-400 font-mono">
                    {fileParts.length} файла • {(fileParts.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB общо
                  </span>
                  <span className="text-xs text-purple-400 font-mono">
                    Ще бъдат обработени заедно
                  </span>
                </div>
              )}
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

          {/* Processing Status */}
          {isProcessing && (
            <div className="p-4 bg-purple-900/30 border border-purple-700/50 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 size={24} className="animate-spin text-purple-400" />
                <div>
                  <p className="text-purple-200 font-mono font-medium">
                    {processingStatus || 'Claude обработва файла...'}
                  </p>
                  <p className="text-xs text-purple-400 font-mono">
                    Не затваряй прозореца
                  </p>
                </div>
              </div>

              {/* Progress bar for multi-part */}
              {isMultiPart && processingStatus && (
                <div className="space-y-1">
                  <div className="h-2 bg-purple-900/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                      style={{
                        width: `${(parseInt(processingStatus.match(/(\d+)\//)?.[1] || '0') / fileParts.length) * 100}%`
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 font-mono text-center">
                    Част {processingStatus.match(/(\d+)\//)?.[1] || '?'} от {fileParts.length}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Extract Button */}
          {!extractedQuestions && !isProcessing && (
            <button
              onClick={handleExtract}
              disabled={
                (!isMultiPart && !file) ||
                (isMultiPart && fileParts.length === 0) ||
                !bankName.trim()
              }
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Sparkles size={18} />
              {isMultiPart ? `Обработи ${fileParts.length} части последователно` : 'Извлечи въпроси'}
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
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded">
                  {extractedQuestions.filter(q => q.type === 'mcq').length} MCQ
                </span>
                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded">
                  {extractedQuestions.filter(q => q.type === 'case_study').length} Казуси
                </span>
                <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded">
                  {extractedQuestions.filter(q => q.type === 'open').length} Отворени
                </span>

                {duplicateIndices.size > 0 && (
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded">
                    {duplicateIndices.size} дубликати
                  </span>
                )}

                {/* PDF Analysis indicator */}
                {pdfAnalysis && (
                  <span className={`px-2 py-1 rounded flex items-center gap-1 ${
                    pdfAnalysis.isScanned
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-cyan-500/20 text-cyan-300'
                  }`}>
                    {pdfAnalysis.isScanned ? (
                      <>
                        <ScanLine size={12} />
                        Сканиран PDF
                      </>
                    ) : (
                      <>
                        <FileType size={12} />
                        Текстов PDF
                      </>
                    )}
                    <span className="text-slate-500">({pdfAnalysis.pageCount} стр.)</span>
                  </span>
                )}
              </div>

              {/* Info if chunked extraction was used */}
              {wasChunked && (
                <div className="p-2 bg-green-900/20 border border-green-700/30 rounded-lg flex items-start gap-2">
                  <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-green-300 font-mono">
                    PDF обработен на {numChunks} части. Извлечени {extractedQuestions.length} въпроса.
                  </div>
                </div>
              )}

              {/* Duplicate detection info */}
              {duplicateIndices.size > 0 && (
                <div className="p-2 bg-amber-900/20 border border-amber-700/30 rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300 font-mono">
                    Намерени {duplicateIndices.size} дубликати (вече съществуват или се повтарят). Автоматично са махнати от селекцията.
                  </div>
                </div>
              )}

              {/* Warning if response was truncated and repaired */}
              {wasRepaired && !wasChunked && (
                <div className="p-2 bg-amber-900/20 border border-amber-700/30 rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300 font-mono">
                    <strong>Внимание:</strong> Response-ът беше отрязан. Показани са {extractedQuestions.length} пълни въпроса.
                    Може да има още въпроси в PDF-а.
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto space-y-1 bg-slate-800/30 rounded-lg p-2">
                {extractedQuestions.map((question, i) => (
                  <div
                    key={i}
                    onClick={() => toggleQuestion(i)}
                    className={`flex items-start gap-2 p-2 rounded-lg transition-all cursor-pointer ${
                      duplicateIndices.has(i)
                        ? selectedQuestions.has(i)
                          ? 'bg-amber-500/10 border border-amber-500/30 opacity-70'
                          : 'bg-amber-500/5 border border-amber-500/20 opacity-50'
                        : selectedQuestions.has(i)
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
                        {duplicateIndices.has(i) && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300">
                            Дубликат
                          </span>
                        )}
                      </div>
                      <p className={`text-sm line-clamp-2 ${duplicateIndices.has(i) ? 'text-slate-400 line-through' : 'text-slate-200'}`}>{question.text}</p>
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
