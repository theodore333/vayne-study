'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Star, BookOpen, Trash2, FileText, Save, Brain, Upload, Loader2, AlertTriangle, Repeat, ChevronDown, ChevronUp, Maximize2, X, Pencil, Check, MessageSquarePlus, Trash, Sparkles, Link2, Microscope, Plus } from 'lucide-react';
import LinkTopicModal from '@/components/modals/LinkTopicModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import ReaderMode from '@/components/ReaderMode';
const MaterialEditor = dynamic(() => import('@/components/MaterialEditor'), {
  ssr: false,
  loading: () => <div className="h-64 bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center text-slate-500 font-mono text-sm">Зареждане на редактора...</div>
});
import { TextHighlight, BLOOM_LEVELS } from '@/lib/types';
import { TopicStatus, TopicSize } from '@/lib/types';
import { STATUS_CONFIG, TOPIC_SIZE_CONFIG } from '@/lib/constants';
import { getDaysSince, calculateRetrievability, getDaysUntilReview } from '@/lib/algorithms';
import { useApp } from '@/lib/context';
import Link from 'next/link';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';
import { setMaterial as saveMaterialToStorage } from '@/lib/storage';

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, setTopicStatus, addGrade, deleteTopic, updateTopicMaterial, updateTopicSize, updateTopic, trackTopicRead, setLastOpenedTopic } = useApp();

  const subjectId = params.subjectId as string;
  const topicId = params.topicId as string;

  // Reader mode from URL
  const readerFromUrl = searchParams.get('reader') === 'true';

  const subject = data.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);

  // Calculate prev/next topics for navigation
  const sortedTopics = subject?.topics.slice().sort((a, b) => a.number - b.number) || [];
  const currentIndex = sortedTopics.findIndex(t => t.id === topicId);
  const prevTopic = currentIndex > 0 ? sortedTopics[currentIndex - 1] : null;
  const nextTopic = currentIndex < sortedTopics.length - 1 ? sortedTopics[currentIndex + 1] : null;

  const [gradeInput, setGradeInput] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [material, setMaterial] = useState('');
  const [materialSaved, setMaterialSaved] = useState(true);

  // PDF upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pastedImages, setPastedImages] = useState<string[]>([]); // Base64 previews
  const [zoomedImage, setZoomedImage] = useState<string | null>(null); // For enlarged view
  const [isAnalyzingSize, setIsAnalyzingSize] = useState(false);
  const [showWrongAnswers, setShowWrongAnswers] = useState(false);
  const [weakConceptInput, setWeakConceptInput] = useState('');
  const [specimenInput, setSpecimenInput] = useState('');

  // Quick-add question state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickQuestion, setQuickQuestion] = useState('');
  const [quickAnswer, setQuickAnswer] = useState('');
  const [quickSaved, setQuickSaved] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [analyzingOverlapId, setAnalyzingOverlapId] = useState<string | null>(null);
  const [showEnrichWarning, setShowEnrichWarning] = useState(false);
  const [isSearchingSimilar, setIsSearchingSimilar] = useState(false);
  const [similarPairs, setSimilarPairs] = useState<Array<{ topicId: string; topicName: string; subjectId: string; subjectName: string; confidence: number; reason: string }>>([]);

  // Inline topic name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  // Track read only after 30 seconds in reader mode (not immediately on open)
  const hasTrackedReadRef = useRef(false);
  useEffect(() => {
    if (readerFromUrl && !hasTrackedReadRef.current) {
      const timer = setTimeout(() => {
        hasTrackedReadRef.current = true;
        trackTopicRead(subjectId, topicId);
      }, 30000);
      return () => clearTimeout(timer);
    }
    if (!readerFromUrl) {
      hasTrackedReadRef.current = false;
    }
  }, [readerFromUrl, subjectId, topicId, trackTopicRead]);

  // Open/close reader mode via URL
  const openReaderMode = () => {
    router.push(`/subjects/${subjectId}/topics/${topicId}?reader=true`);
  };
  const closeReaderMode = () => {
    router.push(`/subjects/${subjectId}/topics/${topicId}`);
  };

  // Navigate to prev/next topic in reader mode
  const goToPrevTopic = () => {
    if (prevTopic) {
      router.push(`/subjects/${subjectId}/topics/${prevTopic.id}?reader=true`);
    }
  };
  const goToNextTopic = () => {
    if (nextTopic) {
      router.push(`/subjects/${subjectId}/topics/${nextTopic.id}?reader=true`);
    }
  };

  // Load API key
  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);
  }, []);

  // Handle paste event for screenshots
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
      if (imageItems.length === 0) return;

      e.preventDefault();

      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          setPastedImages(prev => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Process pasted images with AI
  const processPastedImages = async () => {
    if (pastedImages.length === 0 || !apiKey || !topic || !subject) return;

    setIsExtracting(true);
    setExtractError(null);

    try {
      // Convert base64 images to blobs and send
      const response = await fetchWithTimeout('/api/extract-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: pastedImages,
          apiKey,
          topicName: topic.name,
          subjectName: subject.name,
          existingMaterial: material
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setExtractError(result.error || 'Грешка при извличане');
        return;
      }

      // Append extracted material
      if (material.trim()) {
        setMaterial(prev => prev + '\n\n--- Добавено от screenshot ---\n\n' + result.text);
      } else {
        setMaterial(result.text);
      }
      setMaterialSaved(false);
      setPastedImages([]); // Clear after processing

      // Save AI-detected size if not already set by user
      if (result.size && (!topic.size || topic.sizeSetBy === 'ai')) {
        updateTopicSize(subjectId, topic.id, result.size, 'ai');
      }

    } catch (err) {
      setExtractError(getFetchErrorMessage(err));
    } finally {
      setIsExtracting(false);
    }
  };

  const clearPastedImages = () => {
    setPastedImages([]);
  };

  const removeImage = (index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (topic) {
      // Try direct localStorage first (most reliable), then context
      let loadedMaterial = topic.material || '';
      try {
        const key = `material-${topic.id}`;
        const directSaved = localStorage.getItem(key);
        if (directSaved && directSaved.length > 0) {
          loadedMaterial = directSaved;
        }
      } catch (e) {
        // ignore
      }
      setMaterial(loadedMaterial);
      setMaterialSaved(true);
    }
    // Only reload when navigating to a DIFFERENT topic, not when topic.material
    // changes from our own save (which was causing the revert bug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic?.id]);

  // Track last opened topic for "Continue where you left off" dashboard feature
  useEffect(() => {
    if (subjectId && topicId && topic && subject) {
      setLastOpenedTopic(subjectId, topicId);
    }
  }, [subjectId, topicId, topic, subject, setLastOpenedTopic]);

  // All hooks must be before any early return (React hooks rule)
  const contextSyncNeededRef = useRef(false);
  const materialRef = useRef(material);
  materialRef.current = material;

  // Local Bloom classification based on Bulgarian question keywords
  const classifyBloomLocal = useCallback((question: string): number => {
    const q = question.toLowerCase().trim();
    // Level 6 - Create
    if (/^(създай|предложи|проектирай|състави|планирай|разработи|формулирай)/i.test(q)) return 6;
    // Level 5 - Evaluate
    if (/^(оцени|обоснов|критикувай|защити|кое е по-добр|преценете|аргументирай)/i.test(q) || /кое е по-добр/i.test(q)) return 5;
    // Level 4 - Analyze
    if (/^(анализирай|разграничи|разделе|свърж|сравни.*и.*анализ)/i.test(q) || /каква е разликата|каква е връзката|по какво се различава/i.test(q)) return 4;
    // Level 3 - Apply
    if (/^(приложи|реши|използвай|изчисли|демонстрирай|как бихте|покажи как)/i.test(q) || /как се прилага|как бихте/i.test(q)) return 3;
    // Level 2 - Understand
    if (/^(обясни|защо|опиши|сравни|разграничи|интерпретирай)/i.test(q) || /какво означава|обясне|каква е ролята|защо е важн/i.test(q)) return 2;
    // Level 1 - Remember
    if (/^(какво е|кои са|назов|изброй|дефинирай|кога|къде|кой)/i.test(q) || /избройте|назовете|дефинирайте/i.test(q)) return 1;
    // Default: Understand (most common for study questions)
    return 2;
  }, []);

  // Enrich all unenriched questions with AI (batched to avoid timeouts)
  const handleEnrichQuestions = useCallback(async () => {
    if (!topic || !apiKey) return;
    const questions = topic.customQuestions || [];
    const unenriched = questions.filter(q => !q.enrichedAnswer);
    if (unenriched.length === 0) return;

    setIsEnriching(true);
    setEnrichError(null);

    try {
      // Process in batches of 5 to avoid timeouts
      const BATCH_SIZE = 5;
      const allEnrichments: Array<{ index: number; bloomLevel: number; enrichedAnswer: string; explanation: string }> = [];

      for (let batchStart = 0; batchStart < unenriched.length; batchStart += BATCH_SIZE) {
        const batch = unenriched.slice(batchStart, batchStart + BATCH_SIZE);

        const res = await fetchWithTimeout('/api/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            mode: 'enrich_custom_questions',
            questions: batch.map(q => ({ question: q.question, answer: q.answer })),
            topicName: topic.name,
            subjectName: subject?.name || '',
            material: material || '',
          }),
          timeout: 120000,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Грешка при обогатяване');

        // Remap batch indices to global unenriched indices
        if (data.enrichments) {
          for (const e of data.enrichments) {
            allEnrichments.push({ ...e, index: batchStart + e.index });
          }
        }
      }

      // Map enrichments back to questions by matching unenriched indices
      const updated = [...questions];
      let unenrichedIdx = 0;
      for (let i = 0; i < updated.length; i++) {
        if (!updated[i].enrichedAnswer) {
          const enrichment = allEnrichments.find(e => e.index === unenrichedIdx);
          if (enrichment) {
            updated[i] = {
              ...updated[i],
              bloomLevel: enrichment.bloomLevel || updated[i].bloomLevel,
              enrichedAnswer: enrichment.enrichedAnswer || undefined,
              explanation: enrichment.explanation || undefined,
            };
          }
          unenrichedIdx++;
        }
      }

      updateTopic(subjectId, topicId, { customQuestions: updated });
    } catch (err) {
      setEnrichError(getFetchErrorMessage(err));
    } finally {
      setIsEnriching(false);
    }
  }, [topic, apiKey, material, subject, subjectId, topicId, updateTopic]);

  const handleSaveMaterialFromReader = useCallback((newMaterial: string) => {
    setMaterial(newMaterial);
    saveMaterialToStorage(topicId, newMaterial);
    try {
      localStorage.setItem(`material-${topicId}`, newMaterial);
    } catch {}
    contextSyncNeededRef.current = true;
  }, [topicId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (contextSyncNeededRef.current) {
        updateTopicMaterial(subjectId, topicId, materialRef.current);
        contextSyncNeededRef.current = false;
      }
    }, 10000);
    return () => {
      clearInterval(interval);
      if (contextSyncNeededRef.current) {
        updateTopicMaterial(subjectId, topicId, materialRef.current);
      }
    };
  }, [subjectId, topicId, updateTopicMaterial]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  if (!subject || !topic) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-12 text-center">
          <p className="text-slate-500 font-mono mb-4">Темата не е намерена</p>
          <Link
            href="/subjects"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-mono text-sm"
          >
            <ArrowLeft size={16} />
            Обратно към предмети
          </Link>
        </div>
      </div>
    );
  }

  const handleStatusChange = (status: TopicStatus) => {
    setTopicStatus(subjectId, topic.id, status);
  };

  const handleAddGrade = () => {
    if (gradeInput !== null && gradeInput >= 2 && gradeInput <= 6) {
      addGrade(subjectId, topic.id, gradeInput);
      setGradeInput(null);
    }
  };

  const handleDelete = () => {
    deleteTopic(subjectId, topic.id);
    router.push(`/subjects?id=${subjectId}`);
  };

  const handleMaterialChange = (value: string) => {
    setMaterial(value);
    setMaterialSaved(false);
  };

  const handleSaveMaterial = () => {
    // Save to localStorage FIRST so the loading useEffect doesn't revert
    try {
      localStorage.setItem(`material-${topic.id}`, material);
    } catch {}
    saveMaterialToStorage(topic.id, material);
    updateTopicMaterial(subjectId, topic.id, material);
    setMaterialSaved(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !apiKey || !topic || !subject) return;

    setIsExtracting(true);
    setExtractError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('apiKey', apiKey);
      formData.append('topicName', topic.name);
      formData.append('subjectName', subject.name);
      formData.append('existingMaterial', material);

      const response = await fetchWithTimeout('/api/extract-material', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        setExtractError(result.error || 'Грешка при извличане');
        return;
      }

      // Append or replace material
      if (material.trim()) {
        setMaterial(prev => prev + '\n\n--- Добавено от ' + file.name + ' ---\n\n' + result.text);
      } else {
        setMaterial(result.text);
      }
      setMaterialSaved(false);

      // Save AI-detected size if not already set by user
      if (result.size && (!topic.size || topic.sizeSetBy === 'ai')) {
        updateTopicSize(subjectId, topic.id, result.size, 'ai');
      }

    } catch (err) {
      setExtractError(getFetchErrorMessage(err));
    } finally {
      setIsExtracting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Analyze size of existing material
  const handleAnalyzeSize = async () => {
    if (!apiKey || !topic || !subject || !material.trim()) return;

    setIsAnalyzingSize(true);

    try {
      const response = await fetchWithTimeout('/api/analyze-size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material,
          topicName: topic.name,
          apiKey
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setExtractError(result.error || 'Грешка при анализ');
        return;
      }

      if (result.size) {
        updateTopicSize(subjectId, topic.id, result.size, 'ai');
      }
    } catch (err) {
      setExtractError(getFetchErrorMessage(err));
    } finally {
      setIsAnalyzingSize(false);
    }
  };

  // AI: Find similar topics across all subjects
  const handleFindSimilar = async () => {
    if (!apiKey || !topic || !subject) return;
    setIsSearchingSimilar(true);
    setSimilarPairs([]);
    try {
      const subjectsPayload = data.subjects
        .filter(s => s.topics.length > 0)
        .map(s => ({
          id: s.id,
          name: s.name,
          topics: s.topics.map(t => ({ id: t.id, name: t.name }))
        }));

      const res = await fetchWithTimeout('/api/find-overlaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, subjects: subjectsPayload }),
      });
      const result = await res.json();
      if (res.ok && result.pairs) {
        // Filter to only pairs that include THIS topic
        const relevant = result.pairs
          .filter((p: any) => p.topicA.id === topicId || p.topicB.id === topicId)
          .map((p: any) => {
            const other = p.topicA.id === topicId ? p.topicB : p.topicA;
            // Find the subject for the other topic
            const otherSubject = data.subjects.find(s => s.topics.some(t => t.id === other.id));
            return {
              topicId: other.id,
              topicName: other.name,
              subjectId: otherSubject?.id || '',
              subjectName: other.subjectName || otherSubject?.name || '',
              confidence: p.confidence,
              reason: p.reason || '',
            };
          })
          // Exclude already linked topics
          .filter((p: any) => !(topic.linkedTopicIds || []).includes(p.topicId));
        setSimilarPairs(relevant);
      }
    } catch {} finally {
      setIsSearchingSimilar(false);
    }
  };

  const handleApplySimilarLink = (targetTopicId: string, targetSubjectId: string) => {
    // Bidirectional link
    const currentLinked = topic.linkedTopicIds || [];
    if (!currentLinked.includes(targetTopicId)) {
      updateTopic(subjectId, topicId, { linkedTopicIds: [...currentLinked, targetTopicId] });
    }
    // Link from the other side too
    for (const s of data.subjects) {
      const t = s.topics.find(t => t.id === targetTopicId);
      if (t) {
        const otherLinked = t.linkedTopicIds || [];
        if (!otherLinked.includes(topicId)) {
          updateTopic(s.id, targetTopicId, { linkedTopicIds: [...otherLinked, topicId] });
        }
        break;
      }
    }
    // Remove from suggestions
    setSimilarPairs(prev => prev.filter(p => p.topicId !== targetTopicId));
  };

  const daysSinceLastRead = getDaysSince(topic.lastRead);
  const reviewWarning = daysSinceLastRead >= 7 && topic.status !== 'gray';
  const hasMaterial = material.trim().length > 0;
  const config = STATUS_CONFIG[topic.status];

  // Handle saving highlights from ReaderMode
  const handleSaveHighlights = (highlights: TextHighlight[]) => {
    updateTopic(subjectId, topicId, { highlights });
  };

  // ReaderMode needs the full topic with current material
  const topicForReader = { ...topic, material };

  return (
    <>
      {/* Reader Mode Overlay — only render after material is loaded to prevent TipTap initializing empty */}
      {readerFromUrl && material && (
        <ReaderMode
          topic={topicForReader}
          subjectName={subject.name}
          subjectTopics={subject.topics.map(t => t.name)}
          onClose={closeReaderMode}
          onSaveHighlights={handleSaveHighlights}
          onSaveMaterial={handleSaveMaterialFromReader}
          onPrevTopic={goToPrevTopic}
          onNextTopic={goToNextTopic}
          hasPrevTopic={!!prevTopic}
          hasNextTopic={!!nextTopic}
          prevTopicName={prevTopic?.name}
          nextTopicName={nextTopic?.name}
        />
      )}

      <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/subjects?id=${subjectId}`}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 font-mono text-sm"
        >
          <ArrowLeft size={16} />
          {subject.name}
        </Link>
        <button
          onClick={() => router.push(`/quiz?subject=${subjectId}&topic=${topic.id}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all bg-purple-600 hover:bg-purple-500 text-white"
        >
          <Brain size={18} />
          Започни Quiz
          {!hasMaterial && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300">общи</span>}
        </button>
      </div>

      {/* Topic Header Card */}
      <div
        className="p-6 rounded-xl border mb-6"
        style={{ backgroundColor: config.bg, borderColor: config.border }}
      >
        <div className="flex items-start gap-4">
          <span className="text-4xl">{config.emoji}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ backgroundColor: `${subject.color}30`, color: subject.color }}
              >
                #{topic.number}
              </span>
              <span className="text-sm text-slate-400 font-mono">{config.label}</span>
            </div>
            {/* Editable Topic Name */}
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editNameValue.trim()) {
                      const numMatch = editNameValue.trim().match(/^(\d+)[\.\)\-\s]+(.+)$/);
                      if (numMatch) {
                        updateTopic(subjectId, topicId, { name: numMatch[2].trim(), number: parseInt(numMatch[1], 10) });
                      } else {
                        updateTopic(subjectId, topicId, { name: editNameValue.trim() });
                      }
                      setIsEditingName(false);
                    }
                    if (e.key === 'Escape') {
                      setIsEditingName(false);
                      setEditNameValue(topic.name);
                    }
                  }}
                  className="flex-1 text-2xl font-bold text-slate-100 font-mono bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-1 focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (editNameValue.trim()) {
                      const numMatch = editNameValue.trim().match(/^(\d+)[\.\)\-\s]+(.+)$/);
                      if (numMatch) {
                        updateTopic(subjectId, topicId, { name: numMatch[2].trim(), number: parseInt(numMatch[1], 10) });
                      } else {
                        updateTopic(subjectId, topicId, { name: editNameValue.trim() });
                      }
                      setIsEditingName(false);
                    }
                  }}
                  className="p-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                  title="Запази"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setEditNameValue(topic.name);
                  }}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                  title="Откажи"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <h1
                onClick={() => {
                  setEditNameValue(topic.name);
                  setIsEditingName(true);
                }}
                className="text-2xl font-bold text-slate-100 font-mono cursor-pointer hover:text-cyan-300 transition-colors group flex items-center gap-2"
                title="Кликни за редактиране"
              >
                {String(topic.name || '')}
                <Pencil size={16} className="opacity-0 group-hover:opacity-50 transition-opacity" />
              </h1>
            )}

            {/* Topic Size Selector */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-slate-500 font-mono">Размер:</span>
              <div className="flex gap-1">
                {(['small', 'medium', 'large'] as TopicSize[]).map(s => {
                  const cfg = TOPIC_SIZE_CONFIG[s];
                  const isActive = topic.size === s;
                  return (
                    <button
                      key={s}
                      onClick={() => updateTopicSize(subjectId, topic.id, s, 'user')}
                      className={`px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                        isActive
                          ? 'border-current font-semibold'
                          : 'border-transparent opacity-50 hover:opacity-80'
                      }`}
                      style={{
                        color: cfg.color,
                        backgroundColor: isActive ? cfg.bgColor : 'transparent'
                      }}
                      title={`${cfg.label} (~${cfg.minutes} мин)`}
                    >
                      {cfg.short}
                    </button>
                  );
                })}
              </div>
              {topic.sizeSetBy === 'ai' && topic.size && (
                <span className="text-[10px] text-purple-400 font-mono">(AI)</span>
              )}
              {!topic.size && hasMaterial && (
                <span className="text-xs text-slate-600 font-mono italic">Не е определен</span>
              )}
              {/* Analyze Size Button */}
              {hasMaterial && apiKey && (
                <button
                  onClick={handleAnalyzeSize}
                  disabled={isAnalyzingSize}
                  className="ml-2 px-2 py-0.5 text-[10px] font-mono bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded border border-purple-600/30 transition-all disabled:opacity-50"
                  title="Анализирай размера на материала с AI"
                >
                  {isAnalyzingSize ? '...' : '🔍 Анализ'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Material Section */}
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-400 font-mono uppercase tracking-wider">
                <FileText size={16} />
                Материал
              </label>
              <div className="flex items-center gap-3">
                {!materialSaved && (
                  <span className="text-xs text-orange-400 font-mono">Незапазено</span>
                )}
                {/* PDF Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {/* Reader Mode Button */}
                {material.trim().length > 0 && (
                  <button
                    onClick={openReaderMode}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-mono text-xs transition-all"
                    title="Режим за четене - светъл фон, голям текст, маркиране"
                  >
                    <Maximize2 size={14} />
                    Чети
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!apiKey || isExtracting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!apiKey ? 'Добави API ключ в Settings' : 'Качи PDF или снимка'}
                >
                  {isExtracting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Извличане...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Качи PDF
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extract Error */}
            {extractError && (
              <div className="mb-3 p-3 bg-red-900/20 border border-red-800/30 rounded-lg">
                <p className="text-sm text-red-300 font-mono">{String(extractError)}</p>
              </div>
            )}

            {/* Extracting Status */}
            {isExtracting && (
              <div className="mb-3 p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <p className="text-sm text-purple-300 font-mono">
                  Claude чете документа и извлича материала...
                </p>
              </div>
            )}

            {/* Pasted Images Preview */}
            {pastedImages.length > 0 && (
              <div className="mb-3 p-3 bg-cyan-900/20 border border-cyan-700/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-cyan-300 font-mono">
                    {pastedImages.length} {pastedImages.length === 1 ? 'снимка' : 'снимки'} готови за обработка
                  </p>
                  <button
                    onClick={clearPastedImages}
                    className="text-xs text-slate-400 hover:text-slate-200 font-mono"
                  >
                    Изчисти
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {pastedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img}
                        alt={`Pasted ${i + 1}`}
                        className="h-20 w-auto rounded border border-cyan-700/50 object-cover cursor-pointer hover:border-cyan-500 transition-all"
                        onClick={() => setZoomedImage(img)}
                        title="Кликни за увеличаване"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Изтрий"
                      >
                        <X size={12} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={processPastedImages}
                  disabled={!apiKey || isExtracting}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-mono text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Извличане...
                    </>
                  ) : (
                    <>
                      <Brain size={14} />
                      Извлечи текст от снимките
                    </>
                  )}
                </button>
              </div>
            )}

            <MaterialEditor
              value={material}
              onChange={handleMaterialChange}
              placeholder="Постави текст от учебник, лекции или бележки тук... Markdown форматиране (**bold**, *italic*, # headers) се рендерира автоматично."
            />

            <button
              onClick={handleSaveMaterial}
              disabled={materialSaved}
              className="w-full mt-3 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-cyan-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save size={16} />
              {materialSaved ? 'Запазено' : 'Запази материал'}
            </button>

            <p className="mt-2 text-xs text-slate-500 font-mono text-center">
              AI ще генерира Quiz въпроси базирани на този материал
            </p>
          </div>

          {/* Status Section */}
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
            <label className="block text-sm font-medium text-slate-400 mb-4 font-mono uppercase tracking-wider">
              Промени статус
            </label>
            <div className="grid grid-cols-4 gap-3">
              {(Object.keys(STATUS_CONFIG) as TopicStatus[]).map(status => {
                const statusConfig = STATUS_CONFIG[status];
                const isActive = topic.status === status;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isActive ? 'scale-[1.02]' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: isActive ? statusConfig.bg : 'transparent',
                      borderColor: isActive ? statusConfig.border : 'transparent',
                      color: statusConfig.text
                    }}
                  >
                    <div className="text-2xl mb-1 text-center">{statusConfig.emoji}</div>
                    <div className="text-xs font-mono text-center">{statusConfig.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Study Progress */}
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-cyan-400" />
              <span className="text-sm font-medium text-slate-400 font-mono">
                Преговори
              </span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl font-mono font-bold text-cyan-400">
                {topic.readCount || 0}x
              </span>
              <div className={`text-right ${reviewWarning ? 'text-orange-400' : 'text-slate-400'}`}>
                <div className="text-xs font-mono text-slate-500">Последно</div>
                <div className="text-sm font-mono">
                  {topic.lastRead
                    ? getDaysSince(topic.lastRead) === 0
                      ? 'Днес'
                      : getDaysSince(topic.lastRead) === 1
                        ? 'Вчера'
                        : `Преди ${getDaysSince(topic.lastRead)} дни`
                    : 'Никога'
                  }
                  {reviewWarning && ' ⚠️'}
                </div>
              </div>
            </div>
            {(topic.readCount || 0) === 0 && (
              <p className="text-xs text-slate-500 font-mono">
                Завърши тест за да отбележиш преговор
              </p>
            )}
          </div>

          {/* Grades Section */}
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-4 font-mono uppercase tracking-wider">
              <Star size={14} />
              Оценки от тестове
            </label>

            {topic.grades.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400 font-mono">Средна:</span>
                  <span className={`text-2xl font-bold font-mono ${
                    (topic.avgGrade || 0) >= 5.5 ? 'text-green-400' :
                    (topic.avgGrade || 0) >= 4.5 ? 'text-yellow-400' :
                    (topic.avgGrade || 0) >= 3.5 ? 'text-orange-400' : 'text-red-400'
                  }`}>
                    {typeof topic.avgGrade === 'number' ? topic.avgGrade.toFixed(2) : '—'}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {topic.grades.map((grade, i) => (
                    <span
                      key={i}
                      className={`px-2 py-1 rounded text-sm font-mono ${
                        grade >= 5 ? 'bg-green-500/20 text-green-400' :
                        grade >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
                        grade >= 3 ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {Number(grade) || grade}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono">
                  {Number(topic.quizCount) || 0} {topic.quizCount === 1 ? 'тест' : 'теста'}
                </div>

                {/* Activity dates */}
                <div className="mt-2 space-y-1 text-xs font-mono">
                  {topic.lastRead && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Последно четене:</span>
                      <span className="text-slate-400">{new Date(topic.lastRead).toLocaleDateString('bg-BG')}</span>
                    </div>
                  )}
                  {topic.quizHistory?.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Последен тест:</span>
                      <span className="text-slate-400">{new Date(topic.quizHistory[topic.quizHistory.length - 1].date).toLocaleDateString('bg-BG')}</span>
                    </div>
                  )}
                  {topic.lastReview && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Последен преговор:</span>
                      <span className="text-slate-400">{new Date(topic.lastReview).toLocaleDateString('bg-BG')}</span>
                    </div>
                  )}
                </div>

                {/* FSRS Memory Indicator */}
                {topic.fsrs && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500">🧠 Памет:</span>
                      <span className={`font-medium ${
                        calculateRetrievability(topic.fsrs) >= 0.9 ? 'text-green-400' :
                        calculateRetrievability(topic.fsrs) >= 0.7 ? 'text-yellow-400' :
                        'text-orange-400'
                      }`}>
                        {Math.round(calculateRetrievability(topic.fsrs) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono mt-1">
                      <span className="text-slate-500">Стабилност:</span>
                      <span className="text-slate-300">{Math.round(topic.fsrs.stability)} дни</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono mt-1">
                      <span className="text-slate-500">Преговор след:</span>
                      <span className={`${
                        getDaysUntilReview(topic.fsrs) <= 0 ? 'text-red-400' :
                        getDaysUntilReview(topic.fsrs) <= 2 ? 'text-orange-400' :
                        'text-slate-300'
                      }`}>
                        {getDaysUntilReview(topic.fsrs) <= 0 ? 'Сега!' : `${getDaysUntilReview(topic.fsrs)} дни`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-1 mb-2">
              {[2, 3, 4, 5, 6].map(grade => (
                <button
                  key={grade}
                  onClick={() => setGradeInput(grade)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-lg font-mono ${
                    gradeInput === grade
                      ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {grade}
                </button>
              ))}
            </div>
            <button
              onClick={handleAddGrade}
              disabled={gradeInput === null}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Запиши оценка {gradeInput !== null && `(${gradeInput})`}
            </button>
          </div>

          {/* Linked Topics Section */}
          {(() => {
            const linkedIds = topic.linkedTopicIds || [];
            // Resolve linked topics to their names and subjects
            const linkedTopics = linkedIds.map(lid => {
              for (const s of data.subjects) {
                const t = s.topics.find(t => t.id === lid);
                if (t) return { topic: t, subject: s };
              }
              return null;
            }).filter(Boolean) as { topic: typeof topic; subject: typeof subject }[];

            const handleUnlink = (targetTopicId: string) => {
              // Remove from source
              updateTopic(subjectId, topicId, {
                linkedTopicIds: linkedIds.filter(id => id !== targetTopicId)
              });
              // Remove from target (bidirectional)
              for (const s of data.subjects) {
                const t = s.topics.find(t => t.id === targetTopicId);
                if (t) {
                  updateTopic(s.id, targetTopicId, {
                    linkedTopicIds: (t.linkedTopicIds || []).filter(id => id !== topicId)
                  });
                  break;
                }
              }
            };

            return (
              <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-700/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Link2 size={16} className="text-blue-400" />
                    <span className="text-sm font-medium text-blue-400 font-mono">
                      Свързани теми ({linkedTopics.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {apiKey && (
                      <button
                        onClick={handleFindSimilar}
                        disabled={isSearchingSimilar}
                        className="text-xs text-purple-400 hover:text-purple-300 font-mono px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 transition-all flex items-center gap-1 disabled:opacity-50"
                      >
                        {isSearchingSimilar ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                        AI: Намери
                      </button>
                    )}
                    <button
                      onClick={() => setShowLinkModal(true)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 transition-all"
                    >
                      + Ръчно
                    </button>
                  </div>
                </div>

                {/* AI Suggestions */}
                {similarPairs.length > 0 && (
                  <div className="mb-3 p-3 rounded-lg bg-purple-900/20 border border-purple-700/30">
                    <p className="text-[11px] text-purple-400 font-mono mb-2">AI намери подобни теми:</p>
                    <div className="space-y-1.5">
                      {similarPairs.map(sp => (
                        <div key={sp.topicId} className="flex items-center justify-between gap-2 p-2 rounded bg-slate-800/50 border border-slate-700/20">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-200 font-mono truncate">{sp.topicName}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{sp.subjectName} · {sp.confidence}% съвпадение</p>
                            {sp.reason && <p className="text-[10px] text-purple-400/70 font-mono mt-0.5">{sp.reason}</p>}
                          </div>
                          <button
                            onClick={() => handleApplySimilarLink(sp.topicId, sp.subjectId)}
                            className="shrink-0 text-[10px] text-emerald-400 hover:text-emerald-300 font-mono px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                          >
                            Свържи
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isSearchingSimilar && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-purple-400 font-mono">
                    <Loader2 size={14} className="animate-spin" /> Търсене на подобни теми с AI...
                  </div>
                )}

                {linkedTopics.length > 0 ? (
                  <div className="space-y-2">
                    {linkedTopics.map(({ topic: lt, subject: ls }) => {
                      // Check if we have overlap analysis for this pair
                      const analysis = topic.overlapAnalysis?.linkedTopicId === lt.id ? topic.overlapAnalysis : null;
                      const bothHaveMaterial = hasMaterial && (lt.material?.trim() || (() => { try { return localStorage.getItem(`material-${lt.id}`)?.trim(); } catch { return ''; } })());
                      const isAnalyzing = analyzingOverlapId === lt.id;

                      const handleAnalyze = async () => {
                        if (!apiKey) return;
                        setAnalyzingOverlapId(lt.id);
                        try {
                          // Get target material
                          let targetMaterial = lt.material || '';
                          try {
                            const stored = localStorage.getItem(`material-${lt.id}`);
                            if (stored && stored.length > 0) targetMaterial = stored;
                          } catch {}

                          const res = await fetchWithTimeout('/api/quiz', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              apiKey,
                              mode: 'analyze_overlap',
                              materialA: material,
                              materialB: targetMaterial,
                              topicNameA: topic.name,
                              topicNameB: lt.name,
                              subjectNameA: subject.name,
                              subjectNameB: ls.name,
                            }),
                          });
                          const result = await res.json();
                          if (res.ok) {
                            updateTopic(subjectId, topicId, {
                              overlapAnalysis: {
                                linkedTopicId: lt.id,
                                overlapPercent: result.overlapPercent,
                                sharedConcepts: result.sharedConcepts || [],
                                uniqueConcepts: result.uniqueToA || [],
                              }
                            });
                          }
                        } catch {} finally {
                          setAnalyzingOverlapId(null);
                        }
                      };

                      return (
                        <div key={lt.id} className="rounded-lg bg-slate-800/40 border border-slate-700/30 group">
                          <div className="flex items-center justify-between p-2.5">
                            <Link
                              href={`/subjects/${ls.id}/topics/${lt.id}`}
                              className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
                            >
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ls.color }} />
                              <div className="min-w-0">
                                <p className="text-sm text-slate-200 font-mono truncate">{lt.name}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{ls.name}</p>
                              </div>
                            </Link>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {bothHaveMaterial && (
                                <button
                                  onClick={handleAnalyze}
                                  disabled={isAnalyzing}
                                  className="flex items-center gap-1 px-1.5 py-0.5 text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded transition-all text-[10px] font-mono"
                                  title="Анализирай припокриването с AI"
                                >
                                  {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                                  {analysis ? 'Преанализирай' : 'Анализ'}
                                </button>
                              )}
                              <button
                                onClick={() => handleUnlink(lt.id)}
                                className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                title="Премахни връзка"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          {/* Overlap analysis results */}
                          {analysis && (
                            <div className="px-2.5 pb-2.5 border-t border-slate-700/20 pt-2">
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${analysis.overlapPercent}%` }} />
                                </div>
                                <span className="text-[10px] text-blue-400 font-mono shrink-0">{analysis.overlapPercent}% общо</span>
                              </div>
                              {analysis.uniqueConcepts.length > 0 && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  <span className="text-emerald-400">Уникално:</span>{' '}
                                  {analysis.uniqueConcepts.slice(0, 3).join(', ')}
                                  {analysis.uniqueConcepts.length > 3 && ` +${analysis.uniqueConcepts.length - 3}`}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-mono">
                    Няма свързани теми. Натисни &quot;AI: Намери&quot; за автоматично търсене или &quot;+ Ръчно&quot; за ръчно свързване.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Specimens Section */}
          <div className="bg-gradient-to-br from-violet-900/20 to-purple-900/20 border border-violet-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Microscope size={16} className="text-violet-400" />
              <span className="text-sm font-medium text-violet-400 font-mono">
                Препарати {(topic.specimens?.length || 0) > 0 && `(${topic.specimens!.length})`}
              </span>
            </div>
            {(topic.specimens || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {topic.specimens!.map((spec, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-violet-500/15 border border-violet-500/30 rounded-lg text-xs font-mono text-violet-300">
                    {spec}
                    <button
                      onClick={() => {
                        const updated = topic.specimens!.filter((_, idx) => idx !== i);
                        updateTopic(subjectId!, topic.id, { specimens: updated.length > 0 ? updated : undefined });
                      }}
                      className="ml-0.5 text-violet-500 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={specimenInput}
                onChange={(e) => setSpecimenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && specimenInput.trim()) {
                    const current = topic.specimens || [];
                    if (!current.includes(specimenInput.trim())) {
                      updateTopic(subjectId!, topic.id, { specimens: [...current, specimenInput.trim()] });
                    }
                    setSpecimenInput('');
                  }
                }}
                placeholder="напр. хроничен хепатит..."
                className="flex-1 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-violet-500/50 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (specimenInput.trim()) {
                    const current = topic.specimens || [];
                    if (!current.includes(specimenInput.trim())) {
                      updateTopic(subjectId!, topic.id, { specimens: [...current, specimenInput.trim()] });
                    }
                    setSpecimenInput('');
                  }
                }}
                className="p-1.5 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Unified Weak Concepts — manual + quiz-derived */}
          {(() => {
            // Build quiz-derived concept stats
            const conceptStats: Record<string, { count: number; drilled: number; totalDrillCount: number }> = {};
            (topic.wrongAnswers || []).forEach(wa => {
              if (!conceptStats[wa.concept]) {
                conceptStats[wa.concept] = { count: 0, drilled: 0, totalDrillCount: 0 };
              }
              conceptStats[wa.concept].count++;
              conceptStats[wa.concept].totalDrillCount += wa.drillCount;
              if (wa.drillCount > 0) conceptStats[wa.concept].drilled++;
            });
            const sortedQuizConcepts = Object.entries(conceptStats).sort((a, b) => b[1].count - a[1].count);
            const manualConcepts = topic.weakConcepts || [];
            const totalCount = manualConcepts.length + sortedQuizConcepts.length;

            return (
              <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-700/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <span className="text-sm font-medium text-amber-400 font-mono">
                      Слаби концепции {totalCount > 0 && `(${totalCount})`}
                    </span>
                  </div>
                  {sortedQuizConcepts.length > 0 && (
                    <button
                      onClick={() => setShowWrongAnswers(!showWrongAnswers)}
                      className="text-xs text-slate-500 hover:text-slate-300 font-mono transition-colors"
                    >
                      {showWrongAnswers ? 'скрий детайли' : 'покажи детайли'}
                    </button>
                  )}
                </div>

                {/* Manual weak concepts — editable tags */}
                {manualConcepts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {manualConcepts.map((concept, i) => (
                      <span key={`manual-${i}`} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/15 border border-amber-500/30 rounded-lg text-xs font-mono text-amber-300">
                        {concept}
                        <button
                          onClick={() => {
                            const updated = manualConcepts.filter((_, idx) => idx !== i);
                            updateTopic(subjectId!, topic.id, { weakConcepts: updated.length > 0 ? updated : undefined });
                          }}
                          className="ml-0.5 text-amber-500 hover:text-red-400 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Quiz-derived concepts — compact tags or expanded details */}
                {sortedQuizConcepts.length > 0 && !showWrongAnswers && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {sortedQuizConcepts.slice(0, 6).map(([concept, stats]) => (
                      <span key={`quiz-${concept}`} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono border ${
                        stats.totalDrillCount >= 3
                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                          : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                      }`}>
                        {String(concept || '')}
                        <span className="text-[10px] opacity-60">{stats.count}x</span>
                      </span>
                    ))}
                    {sortedQuizConcepts.length > 6 && (
                      <span className="px-2 py-1 text-[10px] text-slate-500 font-mono">+{sortedQuizConcepts.length - 6}</span>
                    )}
                  </div>
                )}

                {/* Quiz-derived concepts — expanded view with drill progress */}
                {sortedQuizConcepts.length > 0 && showWrongAnswers && (
                  <div className="space-y-2 mb-3">
                    {sortedQuizConcepts.slice(0, 8).map(([concept, stats]) => (
                      <div key={concept} className="p-2.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-200 font-mono font-medium">{String(concept || '')}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-orange-400 font-mono">{stats.count} {stats.count === 1 ? 'грешка' : 'грешки'}</span>
                            {stats.totalDrillCount > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-mono">{stats.totalDrillCount}x drilled</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${stats.totalDrillCount >= 3 ? 'bg-green-500' : stats.totalDrillCount > 0 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                            style={{ width: `${Math.min(100, (stats.totalDrillCount / 3) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {sortedQuizConcepts.length > 8 && (
                      <p className="text-xs text-slate-500 font-mono text-center">+{sortedQuizConcepts.length - 8} още</p>
                    )}
                  </div>
                )}

                {/* Add manual concept input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={weakConceptInput}
                    onChange={(e) => setWeakConceptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && weakConceptInput.trim()) {
                        const current = topic.weakConcepts || [];
                        if (!current.includes(weakConceptInput.trim())) {
                          updateTopic(subjectId!, topic.id, { weakConcepts: [...current, weakConceptInput.trim()] });
                        }
                        setWeakConceptInput('');
                      }
                    }}
                    placeholder="добави слаба концепция..."
                    className="flex-1 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      if (weakConceptInput.trim()) {
                        const current = topic.weakConcepts || [];
                        if (!current.includes(weakConceptInput.trim())) {
                          updateTopic(subjectId!, topic.id, { weakConcepts: [...current, weakConceptInput.trim()] });
                        }
                        setWeakConceptInput('');
                      }
                    }}
                    className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Drill button when there are quiz concepts */}
                {sortedQuizConcepts.length > 0 && (
                  <Link
                    href={`/quiz?subject=${subjectId}&topic=${topicId}`}
                    className="w-full mt-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white font-semibold rounded-lg hover:from-orange-500 hover:to-red-500 transition-all font-mono text-sm flex items-center justify-center gap-2"
                  >
                    <Repeat size={14} />
                    Drill Weakness Quiz
                  </Link>
                )}

                <p className="text-[10px] text-slate-600 font-mono mt-2">Quiz ще фокусира 40%+ въпроси върху тези области</p>
              </div>
            );
          })()}

          {/* Custom Questions (Мои въпроси) */}
          {(() => {
            const questions = topic.customQuestions || [];
            const enrichedCount = questions.filter(q => q.enrichedAnswer).length;
            const bloomColors: Record<number, string> = {
              1: 'bg-blue-500', 2: 'bg-green-500', 3: 'bg-yellow-500',
              4: 'bg-orange-500', 5: 'bg-red-500', 6: 'bg-purple-500'
            };
            return (
              <div className="bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border border-cyan-700/30 rounded-xl p-5">
                <button
                  onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus size={16} className="text-cyan-400" />
                    <span className="text-sm font-medium text-cyan-400 font-mono">
                      Мои въпроси ({questions.length})
                    </span>
                    {enrichedCount > 0 && (
                      <span className="text-xs text-emerald-400 font-mono">
                        {enrichedCount}/{questions.length} обогатени
                      </span>
                    )}
                  </div>
                  {showQuickAdd ? (
                    <ChevronUp size={16} className="text-cyan-400" />
                  ) : (
                    <ChevronDown size={16} className="text-cyan-400" />
                  )}
                </button>

                {showQuickAdd && (
                  <div className="mt-4 space-y-3">
                    {/* Existing questions - compact cards with Bloom badges */}
                    {questions.length > 0 && (
                      <div className="space-y-1.5 mb-3 max-h-[400px] overflow-y-auto">
                        {questions.map((q, i) => {
                          const bloom = q.bloomLevel || classifyBloomLocal(q.question);
                          const bloomInfo = BLOOM_LEVELS.find(b => b.level === bloom);
                          const isExpanded = expandedQuestion === i;
                          return (
                            <div key={i} className="bg-slate-800/50 rounded-lg border border-slate-700/50 group">
                              {/* Question header - always visible */}
                              <div
                                className="flex items-start gap-2 p-2.5 cursor-pointer"
                                onClick={() => setExpandedQuestion(isExpanded ? null : i)}
                              >
                                {/* Bloom badge */}
                                <span className={`shrink-0 mt-0.5 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white ${bloomColors[bloom] || 'bg-slate-500'}`}>
                                  {bloom}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-slate-200 font-mono leading-snug line-clamp-2">{q.question}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {q.enrichedAnswer && (
                                    <span className="text-emerald-500"><Check size={12} /></span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = topic.customQuestions!.filter((_, idx) => idx !== i);
                                      updateTopic(subjectId, topicId, { customQuestions: updated });
                                      if (expandedQuestion === i) setExpandedQuestion(null);
                                    }}
                                    className="p-0.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Trash size={12} />
                                  </button>
                                </div>
                              </div>

                              {/* Expanded: show answer + explanation */}
                              {isExpanded && (
                                <div className="px-2.5 pb-2.5 border-t border-slate-700/30 pt-2 space-y-1.5">
                                  <div className="text-xs text-slate-500 font-mono">
                                    Bloom: {bloomInfo?.name || '?'} (L{bloom})
                                  </div>
                                  {q.answer && (
                                    <div>
                                      <span className="text-xs text-slate-500 font-mono">Твой отговор: </span>
                                      <span className="text-xs text-slate-300 font-mono">{q.answer}</span>
                                    </div>
                                  )}
                                  {q.enrichedAnswer && (
                                    <div className="p-2 bg-emerald-900/20 border border-emerald-800/30 rounded">
                                      <span className="text-xs text-emerald-400 font-mono font-semibold">AI отговор: </span>
                                      <span className="text-xs text-slate-300 font-mono">{q.enrichedAnswer}</span>
                                    </div>
                                  )}
                                  {q.explanation && (
                                    <div className="text-xs text-slate-400 font-mono italic">{q.explanation}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Enrich with AI button */}
                    {questions.length > 0 && enrichedCount < questions.length && (
                      <button
                        onClick={() => setShowEnrichWarning(true)}
                        disabled={isEnriching || !apiKey}
                        className="w-full py-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        {isEnriching ? (
                          <><Loader2 size={14} className="animate-spin" /> Обогатяване...</>
                        ) : (
                          <><Sparkles size={14} /> Обогати с AI ({questions.length - enrichedCount} въпроса)</>
                        )}
                      </button>
                    )}
                    {enrichError && (
                      <p className="text-xs text-red-400 font-mono">{enrichError}</p>
                    )}

                    {/* Add new question */}
                    <div className="border-t border-slate-700/30 pt-3">
                      <textarea
                        value={quickQuestion}
                        onChange={(e) => { setQuickQuestion(e.target.value); setQuickSaved(false); }}
                        placeholder="Напиши въпрос..."
                        rows={2}
                        className="w-full p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
                      />
                      <textarea
                        value={quickAnswer}
                        onChange={(e) => { setQuickAnswer(e.target.value); setQuickSaved(false); }}
                        placeholder="Отговор (по избор)..."
                        rows={2}
                        className="w-full mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
                      />
                      <button
                        onClick={() => {
                          if (!quickQuestion.trim()) return;
                          const existing = topic.customQuestions || [];
                          const bloom = classifyBloomLocal(quickQuestion.trim());
                          updateTopic(subjectId, topicId, {
                            customQuestions: [...existing, {
                              question: quickQuestion.trim(),
                              answer: quickAnswer.trim(),
                              bloomLevel: bloom,
                            }]
                          });
                          setQuickQuestion('');
                          setQuickAnswer('');
                          setQuickSaved(true);
                          setTimeout(() => setQuickSaved(false), 2000);
                        }}
                        disabled={!quickQuestion.trim()}
                        className="w-full mt-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-mono text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        {quickSaved ? (
                          <><Check size={16} /> Записан!</>
                        ) : (
                          <><MessageSquarePlus size={16} /> Запиши</>
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-slate-600 font-mono">
                      Включват се автоматично в quiz-овете. Натисни &ldquo;Обогати с AI&rdquo; за отговори и Bloom нива.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick Quiz Prompt */}
          <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-700/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-purple-400 font-mono">
                Съвет
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Редовните тестове предотвратяват забравяне. Препоръчваме quiz всеки 2-3 дни.
            </p>
          </div>

          {/* Delete Topic */}
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-all font-mono text-sm flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                Изтрий тема
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-center text-slate-400 font-mono">
                  Сигурен ли си?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all font-mono text-sm"
                  >
                    Отказ
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all font-mono text-sm"
                  >
                    Изтрий
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Cognitive offloading warning for enrichment */}
    <ConfirmDialog
      isOpen={showEnrichWarning}
      onClose={() => setShowEnrichWarning(false)}
      onConfirm={() => { setShowEnrichWarning(false); handleEnrichQuestions(); }}
      title="Опитай първо сам!"
      message="Преди AI да обогати отговорите, опитай да отговориш сам на въпросите. Самостоятелното формулиране укрепва разбирането повече от четенето на готови отговори."
      confirmText="Обогати с AI"
      cancelText="Ще отговоря сам"
      variant="warning"
    />

    {/* Link Topic Modal */}
    {showLinkModal && topic && (
      <LinkTopicModal
        subjectId={subjectId}
        topicId={topicId}
        topicName={topic.name}
        existingLinkedIds={topic.linkedTopicIds || []}
        onClose={() => setShowLinkModal(false)}
      />
    )}

    {/* Zoomed Image Modal */}
    {zoomedImage && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90"
        onClick={() => setZoomedImage(null)}
      >
        <button
          onClick={() => setZoomedImage(null)}
          className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors"
        >
          <X size={24} />
        </button>
        <img
          src={zoomedImage}
          alt="Enlarged"
          className="max-w-full max-h-full object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}
