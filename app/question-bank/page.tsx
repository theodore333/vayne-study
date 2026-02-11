'use client';

import { useState, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { Book, Upload, Play, Trash2, FileQuestion, BarChart3, PenLine, Link2, Unlink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import ImportQuestionsModal from '@/components/modals/ImportQuestionsModal';
import AddQuestionModal from '@/components/modals/AddQuestionModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';

export default function QuestionBankPage() {
  const { data, deleteQuestionBank, updateQuestionLinkedTopics, incrementApiCalls } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    data.subjects.filter(s => !s.archived && !s.deletedAt).length > 0 ? data.subjects.filter(s => !s.archived && !s.deletedAt)[0].id : null
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingBank, setDeletingBank] = useState<{ id: string; name: string } | null>(null);
  const [linkingBankId, setLinkingBankId] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{ bankId: string; linked: number; total: number } | null>(null);

  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
  const selectedSubject = data.subjects.find(s => s.id === selectedSubjectId);
  const subjectBanks = (data.questionBanks || []).filter(b => b.subjectId === selectedSubjectId);

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
                        onClick={() => setSelectedSubjectId(subject.id)}
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

                      return (
                        <div key={bank.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-slate-200">{bank.name}</h4>
                              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-mono">
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
          }
        }}
        title="Изтрий сборник"
        message={deletingBank ? `Сигурен ли си, че искаш да изтриеш "${deletingBank.name}"? Всички въпроси в сборника ще бъдат загубени.` : ''}
        confirmText="Изтрий"
        variant="danger"
      />
    </div>
  );
}
