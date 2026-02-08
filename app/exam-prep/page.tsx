'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';
import { GraduationCap, Stethoscope, Brain, ArrowLeft, Loader2, ChevronDown, ChevronRight, RefreshCw, Target, AlertTriangle, CheckCircle2, BookOpen, Eye } from 'lucide-react';
import Link from 'next/link';

type Phase =
  | 'select_subject'
  | 'select_mode'
  // Diagnostic
  | 'diag_select_topics'
  | 'diag_generating'
  | 'diag_answering'
  | 'diag_evaluating'
  | 'diag_heatmap'
  // Simulation
  | 'sim_pick_topic'
  | 'sim_free_recall'
  | 'sim_evaluating'
  | 'sim_follow_ups'
  | 'sim_eval_follow_ups'
  | 'sim_results';

interface DiagQuestion {
  question: string;
  correctAnswer: string;
  bloomLevel: number;
  concept: string;
}

interface TopicQuestions {
  topicId: string;
  topicName: string;
  questions: DiagQuestion[];
}

interface TopicScore {
  topicId: string;
  topicName: string;
  score: number;
  feedback: string;
  missing: string[];
}

interface FollowUpQ {
  question: string;
  correctAnswer: string;
}

interface FollowUpEval {
  score: number;
  isCorrect: boolean;
  feedback: string;
}

export default function ExamPrepPage() {
  const { data, isLoading, incrementApiCalls, addGrade } = useApp();
  const [phase, setPhase] = useState<Phase>('select_subject');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Diagnostic state
  const [batches, setBatches] = useState<Array<{ topicId: string; topicName: string; material: string; bloomLevel: number }[]>>([]);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [batchQuestions, setBatchQuestions] = useState<TopicQuestions[]>([]);
  const [batchAnswers, setBatchAnswers] = useState<Record<string, string[]>>({});
  const [allScores, setAllScores] = useState<Record<string, TopicScore>>({});
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [showMaterial, setShowMaterial] = useState<string | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());

  // Simulation state
  const [simTopicId, setSimTopicId] = useState<string | null>(null);
  const [freeRecallText, setFreeRecallText] = useState('');
  const [recallEval, setRecallEval] = useState<any>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQ[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<string[]>([]);
  const [followUpEvals, setFollowUpEvals] = useState<FollowUpEval[]>([]);
  const [followUpSummary, setFollowUpSummary] = useState('');
  const [followUpOverall, setFollowUpOverall] = useState(0);
  const [simTopicsCompleted, setSimTopicsCompleted] = useState<Array<{ topicId: string; score: number }>>([]);

  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('claude-api-key') : null;

  const activeSubjects = useMemo(() =>
    (data.subjects || []).filter(s => !s.archived && !s.deletedAt && s.topics.length > 0),
    [data.subjects]
  );

  const selectedSubject = useMemo(() =>
    activeSubjects.find(s => s.id === subjectId) || null,
    [activeSubjects, subjectId]
  );

  // Persistence: load diagnostic scores from localStorage when subject changes
  useEffect(() => {
    if (!subjectId) return;
    try {
      const stored = localStorage.getItem(`exam-prep-scores-${subjectId}`);
      if (stored) setAllScores(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [subjectId]);

  // Persistence: save diagnostic scores to localStorage when they change
  useEffect(() => {
    if (!subjectId || Object.keys(allScores).length === 0) return;
    try {
      localStorage.setItem(`exam-prep-scores-${subjectId}`, JSON.stringify(allScores));
    } catch { /* ignore */ }
  }, [allScores, subjectId]);

  // Timer for loading states
  useEffect(() => {
    if (phase === 'diag_generating' || phase === 'diag_evaluating' || phase === 'sim_evaluating' || phase === 'sim_eval_follow_ups') {
      const interval = setInterval(() => setElapsed(e => e + 1), 1000);
      return () => clearInterval(interval);
    } else {
      setElapsed(0);
    }
  }, [phase]);

  // Cleanup abort on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse text-slate-500 font-mono">Зареждане...</div></div>;
  }

  // --- HELPERS ---

  const allTopicsSorted = useMemo(() => {
    if (!selectedSubject) return [];
    return [...selectedSubject.topics].sort((a, b) => {
      const statusOrder: Record<string, number> = { gray: 0, yellow: 1, orange: 2, green: 3 };
      return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
    });
  }, [selectedSubject]);

  function buildBatches(topicIds?: Set<string>) {
    const BATCH_SIZE = 6;
    const filtered = topicIds && topicIds.size > 0
      ? allTopicsSorted.filter(t => topicIds.has(t.id))
      : allTopicsSorted;
    const topics = filtered.map(t => ({
      topicId: t.id,
      topicName: t.name,
      material: t.material || '',
      bloomLevel: t.currentBloomLevel || 2
    }));
    const result: typeof topics[] = [];
    for (let i = 0; i < topics.length; i += BATCH_SIZE) {
      result.push(topics.slice(i, i + BATCH_SIZE));
    }
    return result;
  }

  function pickRandomTopic(): string | null {
    if (!selectedSubject) return null;
    const topics = selectedSubject.topics;
    if (topics.length === 0) return null;

    // Weight: gray=4, yellow=3, orange=2, green=1, plus heatmap data
    const weights: Record<string, number> = { gray: 4, yellow: 3, orange: 2, green: 1 };
    const weighted = topics.map(t => {
      let w = weights[t.status] || 2;
      const score = allScores[t.id];
      if (score && score.score < 50) w += 3;
      // Don't repeat recently completed sim topics
      if (simTopicsCompleted.some(c => c.topicId === t.id)) w = 0.5;
      return { topic: t, weight: w };
    });
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * totalWeight;
    for (const { topic, weight } of weighted) {
      r -= weight;
      if (r <= 0) return topic.id;
    }
    return topics[0].id;
  }

  // --- DIAGNOSTIC FLOW ---

  function startDiagnostic() {
    // Go to topic selection first
    if (selectedSubject) {
      setSelectedTopicIds(new Set(selectedSubject.topics.map(t => t.id)));
    }
    setPhase('diag_select_topics');
  }

  async function launchDiagnostic() {
    const b = buildBatches(selectedTopicIds);
    setBatches(b);
    setCurrentBatch(0);
    setBatchAnswers({});
    await generateBatch(b, 0);
  }

  async function generateBatch(batchList: typeof batches, batchIdx: number) {
    if (!apiKey || batchIdx >= batchList.length) return;
    setPhase('diag_generating');
    setError(null);

    const batch = batchList[batchIdx];
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'exam_prep_diagnostic',
          topics: batch,
          subjectName: selectedSubject?.name || ''
        }),
        signal: controller.signal,
        timeout: 240000
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Generation failed');

      if (result.usage?.cost) incrementApiCalls(result.usage.cost);

      setBatchQuestions(result.topicQuestions || []);
      // Init empty answers
      const answers: Record<string, string[]> = {};
      for (const tq of (result.topicQuestions || [])) {
        answers[tq.topicId] = tq.questions.map(() => '');
      }
      setBatchAnswers(answers);
      setPhase('diag_answering');
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError(getFetchErrorMessage(err));
      setPhase('select_mode');
    }
  }

  async function evaluateBatch() {
    if (!apiKey) return;
    setPhase('diag_evaluating');
    setError(null);

    // Build answers array
    const answers: Array<{
      topicId: string; topicName: string;
      question: string; correctAnswer: string; userAnswer: string; bloomLevel: number;
    }> = [];

    for (const tq of batchQuestions) {
      const userAnswers = batchAnswers[tq.topicId] || [];
      tq.questions.forEach((q, i) => {
        answers.push({
          topicId: tq.topicId,
          topicName: tq.topicName,
          question: q.question,
          correctAnswer: q.correctAnswer,
          userAnswer: userAnswers[i] || '',
          bloomLevel: q.bloomLevel
        });
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, mode: 'exam_prep_evaluate', answers }),
        signal: controller.signal,
        timeout: 240000
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Evaluation failed');

      if (result.usage?.cost) incrementApiCalls(result.usage.cost);

      // Merge scores
      const newScores = { ...allScores };
      for (const ts of (result.topicScores || [])) {
        newScores[ts.topicId] = ts;
      }
      setAllScores(newScores);
      setPhase('diag_heatmap');
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError(getFetchErrorMessage(err));
      setPhase('diag_heatmap');
    }
  }

  function nextBatch() {
    const next = currentBatch + 1;
    setCurrentBatch(next);
    generateBatch(batches, next);
  }

  // --- SIMULATION FLOW ---

  function startSimulation() {
    setSimTopicsCompleted([]);
    pickNewSimTopic();
  }

  function pickNewSimTopic() {
    const topicId = pickRandomTopic();
    setSimTopicId(topicId);
    setFreeRecallText('');
    setRecallEval(null);
    setFollowUpQuestions([]);
    setFollowUpAnswers([]);
    setFollowUpEvals([]);
    setFollowUpSummary('');
    setFollowUpOverall(0);
    setPhase('sim_free_recall');
  }

  async function evaluateFreeRecall() {
    if (!apiKey || !simTopicId || !selectedSubject) return;
    setPhase('sim_evaluating');
    setError(null);

    const topic = selectedSubject.topics.find(t => t.id === simTopicId);
    if (!topic) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'free_recall',
          material: topic.material || '',
          topicName: topic.name,
          subjectName: selectedSubject.name,
          userRecall: freeRecallText,
          examSimulation: true
        }),
        signal: controller.signal,
        timeout: 240000
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Evaluation failed');

      if (result.usage?.cost) incrementApiCalls(result.usage.cost);

      setRecallEval(result.evaluation);
      const fqs = result.evaluation?.followUpQuestions || [];
      setFollowUpQuestions(fqs);
      setFollowUpAnswers(fqs.map(() => ''));

      if (fqs.length > 0) {
        setPhase('sim_follow_ups');
      } else {
        setPhase('sim_results');
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError(getFetchErrorMessage(err));
      setPhase('sim_free_recall');
    }
  }

  async function evaluateFollowUps() {
    if (!apiKey) return;
    setPhase('sim_eval_follow_ups');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithTimeout('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'exam_prep_followup_eval',
          followUps: followUpQuestions.map((q, i) => ({
            question: q.question,
            correctAnswer: q.correctAnswer,
            userAnswer: followUpAnswers[i] || ''
          }))
        }),
        signal: controller.signal,
        timeout: 120000
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Evaluation failed');

      if (result.usage?.cost) incrementApiCalls(result.usage.cost);

      setFollowUpEvals(result.evaluations || []);
      setFollowUpSummary(result.summary || '');
      setFollowUpOverall(result.overallScore || 0);
      setPhase('sim_results');
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError(getFetchErrorMessage(err));
      setPhase('sim_results');
    }
  }

  function saveSimGrade() {
    if (!selectedSubject || !simTopicId || !recallEval) return;
    const topic = selectedSubject.topics.find(t => t.id === simTopicId);
    if (!topic) return;

    const recallScore = recallEval.score || 0;
    const followUpScore = followUpOverall ? followUpOverall * 100 : recallScore;
    const combined = Math.round(recallScore * 0.6 + followUpScore * 0.4);
    const grade = combined >= 90 ? 6 : combined >= 75 ? 5 : combined >= 60 ? 4 : combined >= 40 ? 3 : 2;

    addGrade(selectedSubject.id, simTopicId, grade, {
      bloomLevel: recallEval.bloomLevel || 2,
      questionsCount: 1 + followUpQuestions.length,
      correctAnswers: combined >= 60 ? 1 : 0,
      weight: 1.0
    });

    setSimTopicsCompleted(prev => [...prev, { topicId: simTopicId, score: combined }]);
  }

  // --- RENDER ---

  const simTopic = selectedSubject?.topics.find(t => t.id === simTopicId);

  // Loading spinner component
  const LoadingSpinner = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 size={40} className="animate-spin text-violet-400" />
      <p className="text-slate-300 font-mono">{text}</p>
      <p className="text-slate-500 text-sm font-mono">{elapsed}s</p>
      <button onClick={() => abortRef.current?.abort()} className="text-xs text-red-400 hover:text-red-300 mt-2">
        Отказ
      </button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {phase !== 'select_subject' && (
          <button onClick={() => {
            abortRef.current?.abort();
            if (phase === 'select_mode') setPhase('select_subject');
            else if (phase === 'diag_select_topics') setPhase('select_mode');
            else if (phase.startsWith('diag_') && phase !== 'diag_generating' && phase !== 'diag_evaluating') setPhase('diag_select_topics');
            else if (phase.startsWith('sim_') && phase !== 'sim_evaluating' && phase !== 'sim_eval_follow_ups') setPhase('select_mode');
          }} className="text-slate-400 hover:text-slate-200">
            <ArrowLeft size={20} />
          </button>
        )}
        <span className="text-2xl"><GraduationCap size={28} className="text-violet-400 inline" /></span>
        <h1 className="text-xl font-bold text-slate-100">Изпитна подготовка</h1>
        {selectedSubject && phase !== 'select_subject' && (
          <span className="text-sm text-slate-500 font-mono ml-2">{selectedSubject.name}</span>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">×</button>
        </div>
      )}

      {/* PHASE: Select Subject */}
      {phase === 'select_subject' && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">Избери предмет за изпитна подготовка</p>
          <div className="grid gap-3">
            {activeSubjects.map(s => {
              const grayCount = s.topics.filter(t => t.status === 'gray').length;
              const greenCount = s.topics.filter(t => t.status === 'green').length;
              const daysLeft = s.examDate ? Math.ceil((new Date(s.examDate).getTime() - Date.now()) / 86400000) : null;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSubjectId(s.id); setPhase('select_mode'); }}
                  className="flex items-center gap-4 p-4 bg-[#0f172a] border border-[#1e293b] rounded-xl hover:border-violet-500/50 transition-colors text-left"
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || '#8b5cf6' }} />
                  <div className="flex-1">
                    <div className="text-slate-100 font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {s.topics.length} теми &middot; {greenCount} зелени &middot; {grayCount} сиви
                      {daysLeft !== null && daysLeft > 0 && (
                        <span className={daysLeft <= 7 ? ' text-red-400' : ''}> &middot; {daysLeft} дни до изпит</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
              );
            })}
          </div>
          {activeSubjects.length === 0 && (
            <p className="text-slate-500 text-center py-8">Няма предмети. Добави предмети от <Link href="/subjects" className="text-violet-400 hover:underline">Предмети</Link>.</p>
          )}
        </div>
      )}

      {/* PHASE: Select Mode */}
      {phase === 'select_mode' && selectedSubject && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Diagnostic */}
            <button
              onClick={startDiagnostic}
              disabled={!apiKey}
              className="p-6 bg-[#0f172a] border border-[#1e293b] rounded-xl hover:border-blue-500/50 transition-colors text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <Target size={24} className="text-blue-400" />
                <span className="text-lg font-bold text-slate-100">Диагностика</span>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                Сканирай целия конспект на части. За всяка тема 2-3 въпроса. Виж heatmap кои теми знаеш и кои не.
              </p>
              <div className="text-xs text-slate-500 font-mono">
                {selectedSubject.topics.length} теми &middot; {Math.ceil(selectedSubject.topics.length / 6)} батча &middot; ~{selectedSubject.topics.length * 3} въпроса
              </div>
            </button>

            {/* Simulation */}
            <button
              onClick={startSimulation}
              disabled={!apiKey}
              className="p-6 bg-[#0f172a] border border-[#1e293b] rounded-xl hover:border-amber-500/50 transition-colors text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3 mb-3">
                <Stethoscope size={24} className="text-amber-400" />
                <span className="text-lg font-bold text-slate-100">Симулация на изпит</span>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                Теглиш случайна тема. Пишеш всичко което знаеш. AI те изпитва с follow-up въпроси като професор.
              </p>
              <div className="text-xs text-slate-500 font-mono">
                Free recall + 2-3 follow-up въпроса
              </div>
            </button>
          </div>
          {!apiKey && (
            <p className="text-amber-400 text-sm text-center">Добави API ключ в <Link href="/settings" className="underline">Settings</Link></p>
          )}

          {/* Show existing heatmap if we have scores */}
          {Object.keys(allScores).length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-slate-300 mb-3">Последна диагностика</h3>
              {renderHeatmap()}
            </div>
          )}
        </div>
      )}

      {/* DIAGNOSTIC: Select Topics */}
      {phase === 'diag_select_topics' && selectedSubject && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-200">Избери теми за диагностика</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTopicIds(new Set(selectedSubject.topics.map(t => t.id)))}
                className="text-xs text-violet-400 hover:text-violet-300"
              >
                Всички
              </button>
              <span className="text-xs text-slate-600">|</span>
              <button
                onClick={() => setSelectedTopicIds(new Set())}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                Нито една
              </button>
              <span className="text-xs text-slate-600">|</span>
              <button
                onClick={() => setSelectedTopicIds(new Set(
                  selectedSubject.topics.filter(t => t.status === 'gray' || t.status === 'yellow').map(t => t.id)
                ))}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                Само слаби
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {selectedTopicIds.size}/{selectedSubject.topics.length} избрани &middot; {Math.ceil(selectedTopicIds.size / 6)} батча
          </div>
          <div className="grid gap-1.5 max-h-[400px] overflow-y-auto">
            {allTopicsSorted.map(topic => {
              const isSelected = selectedTopicIds.has(topic.id);
              const prevScore = allScores[topic.id];
              return (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopicIds(prev => {
                    const next = new Set(prev);
                    next.has(topic.id) ? next.delete(topic.id) : next.add(topic.id);
                    return next;
                  })}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    isSelected ? 'bg-violet-500/15 border border-violet-500/30' : 'bg-[#0f172a] border border-[#1e293b] opacity-50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'border-violet-400 bg-violet-500' : 'border-slate-600'
                  }`}>
                    {isSelected && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <span className={`w-2 h-2 rounded-full ${
                    topic.status === 'green' ? 'bg-green-500' : topic.status === 'orange' ? 'bg-orange-500' : topic.status === 'yellow' ? 'bg-yellow-500' : 'bg-slate-500'
                  }`} />
                  <span className="text-slate-200 flex-1 truncate">{topic.name}</span>
                  {prevScore && (
                    <span className={`text-xs font-mono ${prevScore.score >= 80 ? 'text-green-400' : prevScore.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {prevScore.score}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={launchDiagnostic}
            disabled={selectedTopicIds.size === 0}
            className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
          >
            Започни диагностика ({selectedTopicIds.size} теми)
          </button>
        </div>
      )}

      {/* DIAGNOSTIC: Generating */}
      {phase === 'diag_generating' && (
        <LoadingSpinner text={`Генериране на въпроси за батч ${currentBatch + 1}/${batches.length} (${batches[currentBatch]?.length || 0} теми)...`} />
      )}

      {/* DIAGNOSTIC: Answering */}
      {phase === 'diag_answering' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-200">
              Батч {currentBatch + 1}/{batches.length}
            </h2>
            <span className="text-xs text-slate-500 font-mono">{batchQuestions.length} теми &middot; {batchQuestions.reduce((s, tq) => s + tq.questions.length, 0)} въпроса</span>
          </div>

          {batchQuestions.map(tq => (
            <div key={tq.topicId} className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-100">{tq.topicName}</h3>
              {tq.questions.map((q, qi) => (
                <div key={qi} className="space-y-2">
                  <p className="text-sm text-slate-300">{qi + 1}. {q.question}</p>
                  <textarea
                    value={batchAnswers[tq.topicId]?.[qi] || ''}
                    onChange={e => {
                      setBatchAnswers(prev => {
                        const copy = { ...prev };
                        if (!copy[tq.topicId]) copy[tq.topicId] = tq.questions.map(() => '');
                        copy[tq.topicId] = [...copy[tq.topicId]];
                        copy[tq.topicId][qi] = e.target.value;
                        return copy;
                      });
                    }}
                    placeholder="Напиши отговора тук..."
                    className="w-full bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 resize-y min-h-[80px] focus:outline-none focus:border-violet-500/50"
                    rows={3}
                  />
                </div>
              ))}
            </div>
          ))}

          <div className="flex gap-3 justify-end">
            <button
              onClick={evaluateBatch}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
            >
              Оцени батча
            </button>
          </div>
        </div>
      )}

      {/* DIAGNOSTIC: Evaluating */}
      {phase === 'diag_evaluating' && (
        <LoadingSpinner text="Оценяване на отговорите..." />
      )}

      {/* DIAGNOSTIC: Heatmap */}
      {phase === 'diag_heatmap' && selectedSubject && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-200">Heatmap</h2>
            <div className="text-xs text-slate-500 font-mono">
              {Object.keys(allScores).length}/{selectedSubject.topics.length} теми оценени
            </div>
          </div>

          {renderHeatmap()}

          {/* Stats */}
          {Object.keys(allScores).length > 0 && (() => {
            const scores = Object.values(allScores);
            const avg = Math.round(scores.reduce((s, t) => s + t.score, 0) / scores.length);
            const red = scores.filter(s => s.score < 20).length;
            const orange = scores.filter(s => s.score >= 20 && s.score < 50).length;
            const yellow = scores.filter(s => s.score >= 50 && s.score < 80).length;
            const green = scores.filter(s => s.score >= 80).length;
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <div className="bg-[#0f172a] rounded-lg p-3">
                  <div className="text-2xl font-bold text-slate-100">{avg}%</div>
                  <div className="text-xs text-slate-500">Средно</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">{green}</div>
                  <div className="text-xs text-green-500">Силни (80%+)</div>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-400">{yellow}</div>
                  <div className="text-xs text-yellow-500">Средни (50-79%)</div>
                </div>
                <div className="bg-orange-500/10 rounded-lg p-3">
                  <div className="text-2xl font-bold text-orange-400">{orange}</div>
                  <div className="text-xs text-orange-500">Слаби (20-49%)</div>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-400">{red}</div>
                  <div className="text-xs text-red-500">Критични (&lt;20%)</div>
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {currentBatch + 1 < batches.length && (
              <button onClick={nextBatch} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors">
                Следващ батч ({currentBatch + 2}/{batches.length})
              </button>
            )}
            {Object.values(allScores).some(s => s.score < 50) && (
              <Link
                href={`/quiz?subject=${subjectId}&multi=true&topics=${Object.entries(allScores).filter(([, s]) => s.score < 50).map(([id]) => `${subjectId}:${id}`).join(',')}`}
                className="px-5 py-2.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <AlertTriangle size={16} /> Grind слаби теми
              </Link>
            )}
            <button onClick={() => setPhase('select_mode')} className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg font-medium transition-colors">
              Назад
            </button>
          </div>
        </div>
      )}

      {/* SIMULATION: Free Recall */}
      {phase === 'sim_free_recall' && simTopic && (
        <div className="space-y-4">
          <div className="bg-[#0f172a] border border-amber-500/30 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-amber-400 font-mono mb-1">Тема за изпит</div>
                <h2 className="text-xl font-bold text-slate-100">{simTopic.name}</h2>
              </div>
              <button onClick={pickNewSimTopic} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                <RefreshCw size={12} /> Друга тема
              </button>
            </div>
            <p className="text-sm text-slate-400">Напиши всичко, което знаеш по тази тема. Представи си, че си пред професора.</p>
          </div>

          <textarea
            value={freeRecallText}
            onChange={e => setFreeRecallText(e.target.value)}
            placeholder="Почни да пишеш всичко което знаеш по темата..."
            className="w-full bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 text-sm text-slate-200 placeholder-slate-600 resize-y min-h-[200px] focus:outline-none focus:border-amber-500/50"
            rows={10}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono">{freeRecallText.length} символа</span>
            <button
              onClick={evaluateFreeRecall}
              disabled={!freeRecallText.trim()}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
            >
              Предай
            </button>
          </div>

          {simTopicsCompleted.length > 0 && (
            <div className="text-xs text-slate-500 font-mono">
              Завършени: {simTopicsCompleted.length} теми &middot; Средно: {Math.round(simTopicsCompleted.reduce((s, t) => s + t.score, 0) / simTopicsCompleted.length)}%
            </div>
          )}
        </div>
      )}

      {/* SIMULATION: Evaluating free recall */}
      {phase === 'sim_evaluating' && (
        <LoadingSpinner text="Професорът чете отговора ти..." />
      )}

      {/* SIMULATION: Follow-up questions */}
      {phase === 'sim_follow_ups' && recallEval && (
        <div className="space-y-4">
          {/* Show recall feedback first */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-300">Free Recall: {recallEval.score}%</span>
              <span className="text-xs text-slate-500 font-mono">Оценка: {recallEval.grade}</span>
            </div>
            <p className="text-sm text-slate-400">{recallEval.feedback}</p>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
            <p className="text-sm text-amber-400 font-medium mb-1">Професорът пита:</p>
            <p className="text-xs text-slate-500">Отговори на всички въпроси, после ще бъдат оценени наведнъж.</p>
          </div>

          {followUpQuestions.map((fq, i) => (
            <div key={i} className="space-y-2">
              <p className="text-sm text-slate-200 font-medium">{i + 1}. {fq.question}</p>
              <textarea
                value={followUpAnswers[i] || ''}
                onChange={e => {
                  setFollowUpAnswers(prev => {
                    const copy = [...prev];
                    copy[i] = e.target.value;
                    return copy;
                  });
                }}
                placeholder="Отговори..."
                className="w-full bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 resize-y min-h-[80px] focus:outline-none focus:border-amber-500/50"
                rows={3}
              />
            </div>
          ))}

          <div className="flex justify-end">
            <button
              onClick={evaluateFollowUps}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
            >
              Оцени отговорите
            </button>
          </div>
        </div>
      )}

      {/* SIMULATION: Evaluating follow-ups */}
      {phase === 'sim_eval_follow_ups' && (
        <LoadingSpinner text="Оценяване на follow-up отговорите..." />
      )}

      {/* SIMULATION: Results */}
      {phase === 'sim_results' && recallEval && simTopic && (
        <div className="space-y-4">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 text-center">
            <h2 className="text-xl font-bold text-slate-100 mb-2">{simTopic.name}</h2>
            <div className="text-4xl font-bold mb-1" style={{
              color: recallEval.score >= 80 ? '#4ade80' : recallEval.score >= 50 ? '#facc15' : recallEval.score >= 30 ? '#fb923c' : '#f87171'
            }}>
              {recallEval.score}%
            </div>
            <div className="text-sm text-slate-500">Free Recall &middot; Оценка: {recallEval.grade}</div>
          </div>

          {/* Recall feedback */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
            <p className="text-sm text-slate-300">{recallEval.feedback}</p>

            {recallEval.covered?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-green-400 mb-1">Покрити:</p>
                <div className="flex flex-wrap gap-1">
                  {recallEval.covered.map((c: any, i: number) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded ${c.accuracy === 'correct' ? 'bg-green-500/20 text-green-400' : c.accuracy === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                      {c.concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {recallEval.missing?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-400 mb-1">Пропуснати:</p>
                <div className="flex flex-wrap gap-1">
                  {recallEval.missing.map((m: any, i: number) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded ${m.importance === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                      {m.concept}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Follow-up results */}
          {followUpEvals.length > 0 && (
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-amber-400">Follow-up въпроси</p>
                <span className="text-sm font-mono text-slate-400">{Math.round(followUpOverall * 100)}%</span>
              </div>
              {followUpQuestions.map((fq, i) => {
                const ev = followUpEvals[i];
                return (
                  <div key={i} className="border-t border-[#1e293b] pt-2">
                    <p className="text-xs text-slate-400 mb-1">{fq.question}</p>
                    {ev && (
                      <div className="flex items-center gap-2">
                        {ev.isCorrect ? <CheckCircle2 size={14} className="text-green-400" /> : <AlertTriangle size={14} className="text-orange-400" />}
                        <span className="text-xs text-slate-300">{ev.feedback}</span>
                        <span className="text-xs font-mono text-slate-500 ml-auto">{Math.round(ev.score * 100)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {followUpSummary && <p className="text-sm text-slate-400 border-t border-[#1e293b] pt-2">{followUpSummary}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { saveSimGrade(); pickNewSimTopic(); }}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
            >
              Запази + Следваща тема
            </button>
            <button onClick={pickNewSimTopic} className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg font-medium transition-colors">
              Следваща (без запис)
            </button>
            <button onClick={() => setPhase('select_mode')} className="px-5 py-2.5 bg-[#1e293b] hover:bg-[#334155] text-slate-300 rounded-lg font-medium transition-colors">
              Назад
            </button>
          </div>
        </div>
      )}

      {/* SIMULATION: Pick topic */}
      {phase === 'sim_pick_topic' && (
        <LoadingSpinner text="Избиране на тема..." />
      )}
    </div>
  );

  // Heatmap rendering helper
  function renderHeatmap() {
    if (!selectedSubject) return null;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
          {selectedSubject.topics.map((topic, idx) => {
            const result = allScores[topic.id];
            const color = !result ? 'bg-slate-700/50' :
              result.score >= 80 ? 'bg-green-600' :
              result.score >= 50 ? 'bg-yellow-600' :
              result.score >= 20 ? 'bg-orange-600' :
              'bg-red-600';

            return (
              <button
                key={topic.id}
                onClick={() => setExpandedTopic(expandedTopic === topic.id ? null : topic.id)}
                className={`${color} aspect-square rounded text-[10px] text-white font-mono flex items-center justify-center hover:ring-2 hover:ring-white/30 transition-all ${expandedTopic === topic.id ? 'ring-2 ring-violet-400' : ''}`}
                title={`${idx + 1}. ${topic.name}${result ? ` — ${result.score}%` : ' — не е тестван'}`}
              >
                {result ? `${result.score}` : idx + 1}
              </button>
            );
          })}
        </div>

        {/* Expanded topic feedback */}
        {expandedTopic && allScores[expandedTopic] && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-slate-200">{allScores[expandedTopic].topicName}</span>
              <span className="text-sm font-mono" style={{
                color: allScores[expandedTopic].score >= 80 ? '#4ade80' : allScores[expandedTopic].score >= 50 ? '#facc15' : '#f87171'
              }}>{allScores[expandedTopic].score}%</span>
            </div>
            <p className="text-xs text-slate-400">{allScores[expandedTopic].feedback}</p>
            {allScores[expandedTopic].missing.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {allScores[expandedTopic].missing.map((m, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded">{m}</span>
                ))}
              </div>
            )}
            {/* View material button */}
            <button
              onClick={() => setShowMaterial(showMaterial === expandedTopic ? null : expandedTopic)}
              className="mt-2 flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              <Eye size={12} />
              {showMaterial === expandedTopic ? 'Скрий материала' : 'Виж материала'}
            </button>
            {showMaterial === expandedTopic && (() => {
              const topic = selectedSubject?.topics.find(t => t.id === expandedTopic);
              const mat = topic?.material;
              if (!mat) return <p className="mt-1 text-xs text-slate-500 italic">Няма материал за тази тема</p>;
              return (
                <div className="mt-2 max-h-60 overflow-y-auto bg-[#1e293b]/50 rounded p-2 text-xs text-slate-300 whitespace-pre-wrap">
                  {mat.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)}
                  {mat.length > 3000 && <span className="text-slate-500"> ...</span>}
                </div>
              );
            })()}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600 inline-block" /> 80%+</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-600 inline-block" /> 50-79%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-600 inline-block" /> 20-49%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 inline-block" /> &lt;20%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-700/50 inline-block" /> Не е тестван</span>
        </div>
      </div>
    );
  }
}
