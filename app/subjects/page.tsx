'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Upload, Search, Trash2, Edit2, Calendar, Sparkles, Brain } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil } from '@/lib/algorithms';
import { STATUS_CONFIG, PRESET_COLORS } from '@/lib/constants';
import { TopicStatus, Subject } from '@/lib/types';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import ImportTopicsModal from '@/components/modals/ImportTopicsModal';
import ImportFileModal from '@/components/modals/ImportFileModal';
import Link from 'next/link';

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
    </div>
  );
}

export default function SubjectsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubjectsContent />
    </Suspense>
  );
}

function SubjectsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data, isLoading, deleteSubject, updateSubject } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showImportTopics, setShowImportTopics] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TopicStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editExamDate, setEditExamDate] = useState('');
  const [editExamFormat, setEditExamFormat] = useState('');

  // Multi-topic quiz selection
  const [quizSelectMode, setQuizSelectMode] = useState(false);
  const [selectedTopicsForQuiz, setSelectedTopicsForQuiz] = useState<Array<{ subjectId: string; topicId: string }>>([]);

  const toggleTopicForQuiz = (subjectId: string, topicId: string) => {
    setSelectedTopicsForQuiz(prev => {
      const exists = prev.some(t => t.subjectId === subjectId && t.topicId === topicId);
      if (exists) {
        return prev.filter(t => !(t.subjectId === subjectId && t.topicId === topicId));
      }
      return [...prev, { subjectId, topicId }];
    });
  };

  const startMixQuiz = () => {
    if (selectedTopicsForQuiz.length === 0) return;
    const topicsParam = selectedTopicsForQuiz.map(t => `${t.subjectId}:${t.topicId}`).join(',');
    router.push(`/quiz?multi=true&topics=${topicsParam}`);
  };

  useEffect(() => {
    const id = searchParams.get('id');
    if (id && data.subjects.find(s => s.id === id)) {
      setSelectedSubjectId(id);
    } else if (data.subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(data.subjects[0].id);
    }
  }, [searchParams, data.subjects, selectedSubjectId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const selectedSubject = data.subjects.find(s => s.id === selectedSubjectId);

  const filteredTopics = selectedSubject?.topics.filter(topic => {
    const matchesStatus = statusFilter === 'all' || topic.status === statusFilter;
    const matchesSearch = searchQuery === '' ||
      topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      topic.number.toString().includes(searchQuery);
    return matchesStatus && matchesSearch;
  }) || [];

  const handleStartEdit = (subject: Subject) => {
    setEditingSubject(subject.id);
    setEditName(subject.name);
    setEditColor(subject.color);
    setEditExamDate(subject.examDate || '');
    setEditExamFormat(subject.examFormat || '');
  };

  const handleSaveEdit = () => {
    if (editingSubject && editName.trim()) {
      updateSubject(editingSubject, {
        name: editName.trim(),
        color: editColor,
        examDate: editExamDate || null,
        examFormat: editExamFormat.trim() || null
      });
      setEditingSubject(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 font-mono">Предмети</h1>
        <p className="text-sm text-slate-500 font-mono mt-1">Управлявай предмети и теми</p>
      </div>

      <div className="flex gap-6">
        {/* Subject List */}
        <div className="w-72 flex-shrink-0">
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-3">Предмети</h3>
            {data.subjects.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono">Няма предмети</p>
            ) : (
              <ul className="space-y-2">
                {data.subjects.map(subject => {
                  const progress = getSubjectProgress(subject);
                  const daysUntil = getDaysUntil(subject.examDate);
                  const isSelected = selectedSubjectId === subject.id;
                  const isEditing = editingSubject === subject.id;

                  return (
                    <li key={subject.id}>
                      {isEditing ? (
                        <div className="p-3 rounded-lg bg-slate-700/50 border border-slate-600 space-y-3">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 font-mono"
                            autoFocus
                          />
                          <div className="flex gap-1 flex-wrap">
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => setEditColor(c)}
                                className={"w-6 h-6 rounded " + (editColor === c ? "ring-2 ring-white" : "")}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <input
                            type="date"
                            value={editExamDate}
                            onChange={(e) => setEditExamDate(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 font-mono"
                            placeholder="Дата на изпит"
                          />
                          <textarea
                            value={editExamFormat}
                            onChange={(e) => setEditExamFormat(e.target.value)}
                            placeholder="Формат на изпит (напр. 20 теста, 2 казуса)"
                            rows={2}
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-100 font-mono resize-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={handleSaveEdit} className="flex-1 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-mono">Запази</button>
                            <button onClick={() => setEditingSubject(null)} className="flex-1 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs font-mono">Отказ</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedSubjectId(subject.id)}
                          className={"w-full p-3 rounded-lg text-left transition-all " + (isSelected ? "bg-slate-700/50 border border-slate-600" : "hover:bg-slate-800/50 border border-transparent")}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color }} />
                            <span className="text-sm font-medium text-slate-200 truncate flex-1">{subject.name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(subject); }}
                              className="p-1 hover:bg-slate-600 rounded opacity-50 hover:opacity-100"
                            >
                              <Edit2 size={12} className="text-slate-400" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-mono">{subject.topics.length} теми</span>
                            <span className="text-slate-500 font-mono">{progress.percentage}%</span>
                          </div>
                          {daysUntil !== Infinity && (
                            <div className={"text-xs font-mono mt-1 flex items-center gap-1 " + (daysUntil <= 7 ? "text-red-400" : "text-slate-500")}>
                              <Calendar size={10} />
                              {daysUntil <= 0 ? "ДНЕС" : daysUntil + " дни"}
                            </div>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              onClick={() => setShowAddSubject(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 rounded-lg transition-colors font-mono text-sm"
            >
              <Plus size={18} /> Нов предмет
            </button>
          </div>
        </div>

        {/* Topic Browser */}
        <div className="flex-1">
          {selectedSubject ? (
            <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
              {/* Subject Header */}
              <div className="p-6 border-b border-[#1e293b]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: selectedSubject.color }} />
                    <h2 className="text-xl font-semibold text-slate-100">{selectedSubject.name}</h2>
                    <span className="text-sm text-slate-500 font-mono">({selectedSubject.topics.length} теми)</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setQuizSelectMode(!quizSelectMode);
                        if (quizSelectMode) setSelectedTopicsForQuiz([]);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-mono text-sm ${
                        quizSelectMode
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      <Brain size={16} /> {quizSelectMode ? 'Отказ' : 'Mix Quiz'}
                    </button>
                    <button
                      onClick={() => setShowAIImport(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg transition-colors font-mono text-sm"
                    >
                      <Sparkles size={16} /> AI Импорт
                    </button>
                    <button
                      onClick={() => setShowImportTopics(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-mono text-sm"
                    >
                      <Upload size={16} /> Ръчен
                    </button>
                    <button
                      onClick={() => { if (confirm("Изтрий предмета?")) { deleteSubject(selectedSubject.id); setSelectedSubjectId(null); } }}
                      className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors font-mono text-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Търси тема..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={"px-3 py-2 rounded-lg font-mono text-sm transition-all " + (statusFilter === 'all' ? "bg-slate-700 text-slate-200" : "text-slate-400 hover:bg-slate-800")}
                    >
                      Всички
                    </button>
                    {(Object.keys(STATUS_CONFIG) as TopicStatus[]).map(status => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={"px-3 py-2 rounded-lg font-mono text-sm transition-all " + (statusFilter === status ? "bg-slate-700" : "hover:bg-slate-800")}
                        style={{ color: statusFilter === status ? STATUS_CONFIG[status].text : undefined }}
                      >
                        {STATUS_CONFIG[status].emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Topics List */}
              <div className="p-6">
                {filteredTopics.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-500 font-mono mb-4">
                      {selectedSubject.topics.length === 0 ? "Няма добавени теми" : "Няма намерени теми"}
                    </p>
                    {selectedSubject.topics.length === 0 && (
                      <button
                        onClick={() => setShowAIImport(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-mono text-sm"
                      >
                        <Sparkles size={16} /> AI Импорт от PDF/снимка
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {filteredTopics.map(topic => {
                      const config = STATUS_CONFIG[topic.status];
                      const hasMaterial = topic.material && topic.material.trim().length > 0;
                      const isSelectedForQuiz = selectedTopicsForQuiz.some(t => t.topicId === topic.id);

                      return (
                        <div
                          key={topic.id}
                          className={`flex items-center gap-2 p-4 rounded-lg border transition-all hover:scale-[1.005] ${
                            isSelectedForQuiz ? 'ring-2 ring-purple-500' : ''
                          }`}
                          style={{
                            backgroundColor: isSelectedForQuiz ? 'rgba(147, 51, 234, 0.15)' : config.bg,
                            borderColor: isSelectedForQuiz ? 'rgb(147, 51, 234)' : config.border
                          }}
                        >
                          {/* Checkbox for Mix Quiz selection */}
                          {quizSelectMode && (
                            <button
                              onClick={() => hasMaterial && toggleTopicForQuiz(selectedSubject.id, topic.id)}
                              disabled={!hasMaterial}
                              className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                                !hasMaterial
                                  ? 'border-slate-600 bg-slate-800 cursor-not-allowed opacity-50'
                                  : isSelectedForQuiz
                                    ? 'border-purple-500 bg-purple-500 text-white'
                                    : 'border-slate-500 hover:border-purple-400'
                              }`}
                            >
                              {isSelectedForQuiz && <span className="text-sm">✓</span>}
                            </button>
                          )}

                          <Link
                            href={quizSelectMode ? '#' : `/subjects/${selectedSubjectId}/topics/${topic.id}`}
                            onClick={(e) => {
                              if (quizSelectMode) {
                                e.preventDefault();
                                if (hasMaterial) toggleTopicForQuiz(selectedSubject.id, topic.id);
                              }
                            }}
                            className="flex-1 flex items-center gap-4 text-left"
                          >
                            <span className="text-2xl">{config.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-mono px-2 py-0.5 rounded shrink-0 mt-0.5" style={{ backgroundColor: selectedSubject.color + "30", color: selectedSubject.color }}>
                                  #{topic.number}
                                </span>
                                <span
                                  className="text-slate-200 font-medium line-clamp-2 text-sm leading-snug"
                                  title={topic.name}
                                >
                                  {topic.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-mono">
                                <span>{config.label}</span>
                                {topic.avgGrade && <span>Оценка: {topic.avgGrade.toFixed(2)}</span>}
                                {topic.quizCount > 0 && <span>{topic.quizCount} теста</span>}
                                {!hasMaterial && <span className="text-amber-500">Няма материал</span>}
                              </div>
                            </div>
                          </Link>
                          {/* Quiz Button - hide in select mode */}
                          {!quizSelectMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/quiz?subject=${selectedSubjectId}&topic=${topic.id}`);
                              }}
                              disabled={!hasMaterial}
                              title={hasMaterial ? "Започни Quiz" : "Добави материал първо"}
                              className={`p-2.5 rounded-lg transition-all flex items-center gap-1.5 font-mono text-xs ${
                                hasMaterial
                                  ? 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30'
                                  : 'bg-slate-700/30 text-slate-600 cursor-not-allowed'
                              }`}
                            >
                              <Brain size={16} />
                              Quiz
                            </button>
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
              <p className="text-slate-500 font-mono">Избери предмет от списъка</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating bar for selected topics */}
      {quizSelectMode && selectedTopicsForQuiz.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-900/95 backdrop-blur border border-purple-500/50 rounded-2xl px-6 py-4 shadow-2xl shadow-purple-500/20 flex items-center gap-6">
            <div>
              <span className="text-purple-300 font-mono text-lg font-semibold">
                {selectedTopicsForQuiz.length} {selectedTopicsForQuiz.length === 1 ? 'тема' : 'теми'}
              </span>
              <p className="text-xs text-slate-400 font-mono">избрани за Mix Quiz</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedTopicsForQuiz([])}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-mono text-sm transition-all"
              >
                Изчисти
              </button>
              <button
                onClick={startMixQuiz}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg font-mono text-sm transition-all flex items-center gap-2"
              >
                <Brain size={18} /> Започни Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddSubject && <AddSubjectModal onClose={() => setShowAddSubject(false)} />}
      {showImportTopics && selectedSubjectId && <ImportTopicsModal subjectId={selectedSubjectId} onClose={() => setShowImportTopics(false)} />}
      {showAIImport && selectedSubjectId && selectedSubject && (
        <ImportFileModal
          subjectId={selectedSubjectId}
          subjectName={selectedSubject.name}
          onClose={() => setShowAIImport(false)}
        />
      )}
    </div>
  );
}