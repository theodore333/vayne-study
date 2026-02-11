'use client';

import { useState, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { Book, Upload, Play, Trash2, FileQuestion, BarChart3, PenLine, Link2, Unlink, Loader2, Search, Eye, EyeOff, ChevronDown, X } from 'lucide-react';
import Link from 'next/link';
import ImportQuestionsModal from '@/components/modals/ImportQuestionsModal';
import AddQuestionModal from '@/components/modals/AddQuestionModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';

export default function QuestionBankPage() {
  const { data, deleteQuestionBank, deleteQuestion, updateQuestionLinkedTopics, incrementApiCalls } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    data.subjects.filter(s => !s.archived && !s.deletedAt).length > 0 ? data.subjects.filter(s => !s.archived && !s.deletedAt)[0].id : null
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingBank, setDeletingBank] = useState<{ id: string; name: string } | null>(null);
  const [linkingBankId, setLinkingBankId] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{ bankId: string; linked: number; total: number } | null>(null);

  // Browse state
  const [expandedBankId, setExpandedBankId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTopicId, setFilterTopicId] = useState<string>('all');
  const [deletingQuestion, setDeletingQuestion] = useState<{ bankId: string; questionId: string; text: string } | null>(null);

  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
  const selectedSubject = data.subjects.find(s => s.id === selectedSubjectId);
  const subjectBanks = (data.questionBanks || []).filter(b => b.subjectId === selectedSubjectId);

  // Topic name lookup
  const topicNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (selectedSubject) {
      selectedSubject.topics.forEach(t => map.set(t.id, t.name));
    }
    return map;
  }, [selectedSubject]);

  // Calculate statistics
  const totalQuestions = subjectBanks.reduce((sum, bank) => sum + bank.questions.length, 0);
  const totalAttempts = subjectBanks.reduce((sum, bank) =>
    sum + bank.questions.reduce((s, q) => s + q.stats.attempts, 0), 0);
  const totalCorrect = subjectBanks.reduce((sum, bank) =>
    sum + bank.questions.reduce((s, q) => s + q.stats.correct, 0), 0);
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const handleAutoLink = useCallback(async (bankId: string) => {
    if (!selectedSubject || linkingBankId) return;
    const bank = subjectBanks.find(b => b.id === bankId);
    if (!bank) return;

    const unlinked = bank.questions.filter(q => !q.linkedTopicIds || q.linkedTopicIds.length === 0);
    if (unlinked.length === 0) return;

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) return;

    setLinkingBankId(bankId);
    setLinkResult(null);

    try {
      const response = await fetch('/api/auto-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          questions: unlinked.map(q => ({ id: q.id, text: q.text })),
          topics: selectedSubject.topics.map(t => ({ id: t.id, name: t.name }))
        })
      });

      const result = await response.json();
      if (response.ok && result.links) {
        const updates = result.links.map((link: { questionId: string; topicId: string }) => ({
          questionId: link.questionId,
          linkedTopicIds: [link.topicId]
        }));
        if (updates.length > 0) {
          updateQuestionLinkedTopics(bankId, updates);
        }
        setLinkResult({ bankId, linked: result.linked, total: result.total });
        if (result.usage?.cost) {
          incrementApiCalls(result.usage.cost);
        }
        setTimeout(() => setLinkResult(null), 5000);
      }
    } catch (err) {
      console.error('Auto-link failed:', err);
    } finally {
      setLinkingBankId(null);
    }
  }, [selectedSubject, subjectBanks, linkingBankId, updateQuestionLinkedTopics, incrementApiCalls]);

  const handleUnlinkAll = useCallback((bankId: string) => {
    const bank = subjectBanks.find(b => b.id === bankId);
    if (!bank) return;
    const linked = bank.questions.filter(q => q.linkedTopicIds && q.linkedTopicIds.length > 0);
    if (linked.length === 0) return;
    const updates = linked.map(q => ({ questionId: q.id, linkedTopicIds: [] as string[] }));
    updateQuestionLinkedTopics(bankId, updates);
  }, [subjectBanks, updateQuestionLinkedTopics]);

  const handleChangeQuestionTopic = useCallback((bankId: string, questionId: string, topicId: string) => {
    updateQuestionLinkedTopics(bankId, [{
      questionId,
      linkedTopicIds: topicId ? [topicId] : []
    }]);
  }, [updateQuestionLinkedTopics]);

  const toggleBrowse = (bankId: string) => {
    if (expandedBankId === bankId) {
      setExpandedBankId(null);
      setSearchQuery('');
      setFilterTopicId('all');
    } else {
      setExpandedBankId(bankId);
      setSearchQuery('');
      setFilterTopicId('all');
    }
  };

  // Filter questions for browsing
  const getFilteredQuestions = (bankId: string) => {
    const bank = subjectBanks.find(b => b.id === bankId);
    if (!bank) return [];

    let questions = bank.questions;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      questions = questions.filter(question =>
        question.text.toLowerCase().includes(q) ||
        question.correctAnswer?.toLowerCase().includes(q) ||
        question.explanation?.toLowerCase().includes(q)
      );
    }

    // Topic filter
    if (filterTopicId === 'unlinked') {
      questions = questions.filter(q => !q.linkedTopicIds || q.linkedTopicIds.length === 0);
    } else if (filterTopicId !== 'all') {
      questions = questions.filter(q => q.linkedTopicIds?.includes(filterTopicId));
    }

    return questions;
  };

  const typeBadge = (type: string) => {
    const config: Record<string, { label: string; color: string }> = {
      mcq: { label: 'MCQ', color: 'text-purple-400 bg-purple-500/15' },
      open: { label: 'Open', color: 'text-blue-400 bg-blue-500/15' },
      case_study: { label: 'Case', color: 'text-amber-400 bg-amber-500/15' },
    };
    const c = config[type] || config.mcq;
    return <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${c.color}`}>{c.label}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
          <FileQuestion className="text-purple-400" />
          Question Bank
        </h1>
        <p className="text-sm text-slate-500 font-mono mt-1">
          Качи сборници с тестове и казуси, реши ги и следи прогреса си
        </p>
      </div>

      <div className="flex gap-6">
        {/* Subject Selector */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-3">
              Предмети
            </h3>
            {activeSubjects.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono">
                Няма предмети. Добави от Subjects страницата.
              </p>
            ) : (
              <ul className="space-y-2">
                {activeSubjects.map(subject => {
                  const banks = (data.questionBanks || []).filter(b => b.subjectId === subject.id);
                  const qCount = banks.reduce((sum, b) => sum + b.questions.length, 0);

                  return (
                    <li key={subject.id}>
                      <button
                        onClick={() => {
                          setSelectedSubjectId(subject.id);
                          setExpandedBankId(null);
                        }}
                        className={`w-full p-3 rounded-lg text-left transition-all ${
                          selectedSubjectId === subject.id
                            ? 'bg-slate-700/50 border border-slate-600'
                            : 'hover:bg-slate-800/50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: subject.color }}
                          />
                          <span className="text-sm font-medium text-slate-200 truncate">
                            {subject.name}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {banks.length} сборник{banks.length !== 1 ? 'а' : ''} | {qCount} въпрос{qCount !== 1 ? 'а' : ''}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {selectedSubject ? (
            <div className="space-y-6">
              {/* Stats Card */}
              <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: selectedSubject.color }}
                    />
                    {selectedSubject.name}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-mono text-sm"
                      title="Добави въпрос ръчно"
                    >
                      <PenLine size={16} />
                      Ръчно
                    </button>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono text-sm"
                    >
                      <Upload size={16} />
                      Качи PDF
                    </button>
                    {totalQuestions > 0 && (
                      <Link
                        href={`/question-bank/practice?subject=${selectedSubjectId}`}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-mono text-sm"
                      >
                        <Play size={16} />
                        Практика
                      </Link>
                    )}
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-purple-400 font-mono">
                      {totalQuestions}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">Въпроси</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-blue-400 font-mono">
                      {totalAttempts}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">Опити</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-green-400 font-mono">
                      {totalCorrect}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">Верни</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <div className={`text-3xl font-bold font-mono ${
                      accuracy >= 80 ? 'text-green-400' :
                      accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {accuracy}%
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">Точност</div>
                  </div>
                </div>
              </div>

              {/* Banks List */}
              <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase">
                    Сборници ({subjectBanks.length})
                  </h3>
                </div>

                {subjectBanks.length === 0 ? (
                  <div className="p-12 text-center">
                    <Book size={48} className="mx-auto text-slate-600 mb-4" />
                    <p className="text-slate-500 font-mono mb-4">
                      Няма качени сборници
                    </p>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono text-sm"
                    >
                      <Upload size={16} />
                      Качи първия сборник
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {subjectBanks.map(bank => {
                      const bankAttempts = bank.questions.reduce((s, q) => s + q.stats.attempts, 0);
                      const bankCorrect = bank.questions.reduce((s, q) => s + q.stats.correct, 0);
                      const bankAccuracy = bankAttempts > 0
                        ? Math.round((bankCorrect / bankAttempts) * 100)
                        : null;

                      const mcqCount = bank.questions.filter(q => q.type === 'mcq').length;
                      const caseCount = bank.questions.filter(q => q.type === 'case_study').length;
                      const openCount = bank.questions.filter(q => q.type === 'open').length;
                      const unlinkedCount = bank.questions.filter(q => !q.linkedTopicIds || q.linkedTopicIds.length === 0).length;
                      const linkedCount = bank.questions.length - unlinkedCount;
                      const isLinking = linkingBankId === bank.id;
                      const hasTopics = selectedSubject && selectedSubject.topics.length > 0;
                      const isExpanded = expandedBankId === bank.id;
                      const filteredQuestions = isExpanded ? getFilteredQuestions(bank.id) : [];

                      return (
                        <div key={bank.id}>
                          <div className="p-4 hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-slate-200">{bank.name}</h4>
                                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-mono flex-wrap">
                                  <span>{bank.questions.length} въпроса</span>
                                  {mcqCount > 0 && <span>{mcqCount} MCQ</span>}
                                  {caseCount > 0 && <span>{caseCount} казуса</span>}
                                  {openCount > 0 && <span>{openCount} отворени</span>}
                                  <span>|</span>
                                  <span>
                                    {new Date(bank.uploadedAt).toLocaleDateString('bg-BG')}
                                  </span>
                                  {linkedCount > 0 && (
                                    <>
                                      <span>|</span>
                                      <span className="text-blue-400">{linkedCount} свързани</span>
                                    </>
                                  )}
                                  {unlinkedCount > 0 && (
                                    <>
                                      <span>|</span>
                                      <span className="text-amber-400">{unlinkedCount} несвързани</span>
                                    </>
                                  )}
                                </div>

                                {/* Link result message */}
                                {linkResult?.bankId === bank.id && (
                                  <div className="mt-2 text-xs text-green-400 font-mono">
                                    Свързани {linkResult.linked} от {linkResult.total} въпроса
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {bankAccuracy !== null && (
                                  <div className="flex items-center gap-2 text-sm font-mono mr-2">
                                    <BarChart3 size={14} className="text-slate-400" />
                                    <span className={
                                      bankAccuracy >= 80 ? 'text-green-400' :
                                      bankAccuracy >= 60 ? 'text-yellow-400' : 'text-red-400'
                                    }>
                                      {bankAccuracy}%
                                    </span>
                                  </div>
                                )}

                                {/* Browse button */}
                                {bank.questions.length > 0 && (
                                  <button
                                    onClick={() => toggleBrowse(bank.id)}
                                    className={`p-2 rounded-lg transition-colors ${
                                      isExpanded
                                        ? 'bg-purple-500/20 text-purple-400'
                                        : 'hover:bg-purple-500/20 text-slate-400 hover:text-purple-400'
                                    }`}
                                    title="Разгледай въпросите"
                                  >
                                    {isExpanded ? <EyeOff size={18} /> : <Eye size={18} />}
                                  </button>
                                )}

                                {/* Auto-link button */}
                                {unlinkedCount > 0 && hasTopics && (
                                  <button
                                    onClick={() => handleAutoLink(bank.id)}
                                    disabled={isLinking}
                                    className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                                    title={`Свържи ${unlinkedCount} несвързани въпроса с теми (AI)`}
                                  >
                                    {isLinking ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
                                  </button>
                                )}

                                {/* Unlink all button */}
                                {linkedCount > 0 && (
                                  <button
                                    onClick={() => handleUnlinkAll(bank.id)}
                                    className="p-2 hover:bg-amber-500/20 text-amber-400/60 rounded-lg transition-colors"
                                    title={`Премахни връзките на ${linkedCount} въпроса`}
                                  >
                                    <Unlink size={18} />
                                  </button>
                                )}

                                <Link
                                  href={`/question-bank/practice?subject=${selectedSubjectId}&bank=${bank.id}`}
                                  className="p-2 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors"
                                  title="Практика"
                                >
                                  <Play size={18} />
                                </Link>

                                <button
                                  onClick={() => setDeletingBank({ id: bank.id, name: bank.name })}
                                  className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                  title="Изтрий"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Browse View */}
                          {isExpanded && (
                            <div className="border-t border-slate-800 bg-slate-900/30">
                              {/* Search & Filter Bar */}
                              <div className="p-4 flex gap-3 items-center flex-wrap">
                                <div className="relative flex-1 min-w-[200px]">
                                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                  <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Търси въпрос..."
                                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                                  />
                                  {searchQuery && (
                                    <button
                                      onClick={() => setSearchQuery('')}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <ChevronDown size={14} className="text-slate-500" />
                                  <select
                                    value={filterTopicId}
                                    onChange={(e) => setFilterTopicId(e.target.value)}
                                    className="py-2 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm focus:outline-none focus:border-purple-500"
                                  >
                                    <option value="all">Всички теми</option>
                                    <option value="unlinked">Несвързани</option>
                                    {selectedSubject?.topics.map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <span className="text-xs text-slate-500 font-mono">
                                  {filteredQuestions.length} / {bank.questions.length}
                                </span>
                              </div>

                              {/* Questions List */}
                              <div className="max-h-[500px] overflow-y-auto">
                                {filteredQuestions.length === 0 ? (
                                  <div className="p-8 text-center text-slate-500 font-mono text-sm">
                                    Няма намерени въпроси
                                  </div>
                                ) : (
                                  <div className="divide-y divide-slate-800/50">
                                    {filteredQuestions.map((question, idx) => {
                                      const topicName = question.linkedTopicIds?.[0]
                                        ? topicNameMap.get(question.linkedTopicIds[0])
                                        : null;

                                      return (
                                        <div key={question.id} className="px-4 py-3 hover:bg-slate-800/20 transition-colors group">
                                          <div className="flex gap-3">
                                            {/* Number */}
                                            <span className="text-xs text-slate-600 font-mono mt-0.5 w-6 text-right shrink-0">
                                              {idx + 1}.
                                            </span>

                                            {/* Question Content */}
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-start gap-2">
                                                {typeBadge(question.type)}
                                                <p className="text-sm text-slate-300 leading-relaxed break-words">
                                                  {question.text.length > 200
                                                    ? question.text.substring(0, 200) + '...'
                                                    : question.text}
                                                </p>
                                              </div>

                                              {/* Options preview for MCQ */}
                                              {question.type === 'mcq' && question.options && question.options.length > 0 && (
                                                <div className="mt-1.5 ml-0 flex flex-wrap gap-x-4 gap-y-0.5">
                                                  {question.options.map((opt, oi) => (
                                                    <span
                                                      key={oi}
                                                      className={`text-xs font-mono ${
                                                        opt.startsWith(question.correctAnswer + '.')
                                                        || opt.startsWith(question.correctAnswer + ' ')
                                                        || question.correctAnswer === opt.charAt(0)
                                                          ? 'text-green-400'
                                                          : 'text-slate-500'
                                                      }`}
                                                    >
                                                      {opt.length > 60 ? opt.substring(0, 60) + '...' : opt}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}

                                              {/* Explanation */}
                                              {question.explanation && (
                                                <p className="mt-1 text-xs text-slate-500 italic">
                                                  {question.explanation.length > 120
                                                    ? question.explanation.substring(0, 120) + '...'
                                                    : question.explanation}
                                                </p>
                                              )}

                                              {/* Topic & Stats row */}
                                              <div className="mt-2 flex items-center gap-3 flex-wrap">
                                                {/* Topic selector */}
                                                <select
                                                  value={question.linkedTopicIds?.[0] || ''}
                                                  onChange={(e) => handleChangeQuestionTopic(bank.id, question.id, e.target.value)}
                                                  className={`text-xs py-1 px-2 rounded border font-mono focus:outline-none focus:border-purple-500 ${
                                                    topicName
                                                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                                      : 'bg-slate-800/50 border-slate-700 text-slate-500'
                                                  }`}
                                                >
                                                  <option value="">— Без тема —</option>
                                                  {selectedSubject?.topics.map(t => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                  ))}
                                                </select>

                                                {/* Stats */}
                                                {question.stats.attempts > 0 && (
                                                  <span className="text-[10px] text-slate-600 font-mono">
                                                    {question.stats.correct}/{question.stats.attempts} верни
                                                  </span>
                                                )}

                                                {/* Delete */}
                                                <button
                                                  onClick={() => setDeletingQuestion({
                                                    bankId: bank.id,
                                                    questionId: question.id,
                                                    text: question.text.substring(0, 80)
                                                  })}
                                                  className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                                                  title="Изтрий въпроса"
                                                >
                                                  <Trash2 size={14} />
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-12 text-center">
              <p className="text-slate-500 font-mono">
                Избери предмет от списъка
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && selectedSubjectId && selectedSubject && (
        <ImportQuestionsModal
          subjectId={selectedSubjectId}
          subjectName={selectedSubject.name}
          topics={selectedSubject.topics}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Add Question Modal */}
      {showAddModal && selectedSubjectId && selectedSubject && (
        <AddQuestionModal
          subjectId={selectedSubjectId}
          subjectName={selectedSubject.name}
          existingBanks={subjectBanks.map(b => ({ id: b.id, name: b.name }))}
          topics={selectedSubject.topics.map(t => ({ id: t.id, name: t.name }))}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Delete Bank Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingBank}
        onClose={() => setDeletingBank(null)}
        onConfirm={() => {
          if (deletingBank) {
            deleteQuestionBank(deletingBank.id);
            if (expandedBankId === deletingBank.id) setExpandedBankId(null);
          }
        }}
        title="Изтрий сборник"
        message={deletingBank ? `Сигурен ли си, че искаш да изтриеш "${deletingBank.name}"? Всички въпроси в сборника ще бъдат загубени.` : ''}
        confirmText="Изтрий"
        variant="danger"
      />

      {/* Delete Question Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingQuestion}
        onClose={() => setDeletingQuestion(null)}
        onConfirm={() => {
          if (deletingQuestion) {
            deleteQuestion(deletingQuestion.bankId, deletingQuestion.questionId);
          }
        }}
        title="Изтрий въпрос"
        message={deletingQuestion ? `"${deletingQuestion.text}..."` : ''}
        confirmText="Изтрий"
        variant="danger"
      />
    </div>
  );
}
