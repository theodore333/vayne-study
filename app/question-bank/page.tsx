'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';
import { Book, Upload, Play, Trash2, FileQuestion, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import ImportQuestionsModal from '@/components/modals/ImportQuestionsModal';

export default function QuestionBankPage() {
  const { data, deleteQuestionBank } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    data.subjects.length > 0 ? data.subjects[0].id : null
  );
  const [showImportModal, setShowImportModal] = useState(false);

  const selectedSubject = data.subjects.find(s => s.id === selectedSubjectId);
  const subjectBanks = (data.questionBanks || []).filter(b => b.subjectId === selectedSubjectId);

  // Calculate statistics
  const totalQuestions = subjectBanks.reduce((sum, bank) => sum + bank.questions.length, 0);
  const totalAttempts = subjectBanks.reduce((sum, bank) =>
    sum + bank.questions.reduce((s, q) => s + q.stats.attempts, 0), 0);
  const totalCorrect = subjectBanks.reduce((sum, bank) =>
    sum + bank.questions.reduce((s, q) => s + q.stats.correct, 0), 0);
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

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
            {data.subjects.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono">
                Няма предмети. Добави от Subjects страницата.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.subjects.map(subject => {
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
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono text-sm"
                    >
                      <Upload size={16} />
                      Качи сборник
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
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              {bankAccuracy !== null && (
                                <div className="flex items-center gap-2 text-sm font-mono">
                                  <BarChart3 size={14} className="text-slate-400" />
                                  <span className={
                                    bankAccuracy >= 80 ? 'text-green-400' :
                                    bankAccuracy >= 60 ? 'text-yellow-400' : 'text-red-400'
                                  }>
                                    {bankAccuracy}%
                                  </span>
                                </div>
                              )}

                              <Link
                                href={`/question-bank/practice?subject=${selectedSubjectId}&bank=${bank.id}`}
                                className="p-2 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors"
                                title="Практика"
                              >
                                <Play size={18} />
                              </Link>

                              <button
                                onClick={() => {
                                  if (confirm(`Изтрий "${bank.name}"?`)) {
                                    deleteQuestionBank(bank.id);
                                  }
                                }}
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
          topics={selectedSubject.topics.map(t => t.name)}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}
