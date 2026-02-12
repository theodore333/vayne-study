'use client';
import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Upload, Search, Trash2, Edit2, Calendar, Sparkles, Brain, Loader2, PanelLeftClose, PanelLeft, ArrowUpDown, Download, Archive, ArchiveRestore, Copy, FileDown, FileUp, CalendarDays, CloudUpload, Check, ChevronUp } from 'lucide-react';
import { useApp } from '@/lib/context';
import { getSubjectProgress, getDaysUntil, getDaysSince } from '@/lib/algorithms';
import { STATUS_CONFIG, PRESET_COLORS, TOPIC_SIZE_CONFIG } from '@/lib/constants';
import { TopicStatus, Subject, SubjectType, SUBJECT_TYPES, TopicSection } from '@/lib/types';
import AddSubjectModal from '@/components/modals/AddSubjectModal';
import ImportTopicsModal from '@/components/modals/ImportTopicsModal';
import ImportFileModal from '@/components/modals/ImportFileModal';
import ConfirmDialog from '@/components/modals/ConfirmDialog';
import Link from 'next/link';
import { checkAnkiConnect, exportSubjectToAnki } from '@/lib/anki';

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
  const { data, isLoading, isSyncing, syncNow, deleteSubject, updateSubject, setTopicStatus, updateTopic, deleteTopic, archiveSubject, unarchiveSubject, duplicateSubject, exportSubjectToJSON, importSubjectFromJSON, softDeleteSubject, restoreSubject, permanentlyDeleteSubject, emptyTrash } = useApp();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showImportTopics, setShowImportTopics] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TopicStatus | 'all'>('all');
  const [sizeFilter, setSizeFilter] = useState<'small' | 'medium' | 'large' | 'all'>('all');
  const [sectionFilter, setSectionFilter] = useState<TopicSection | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editExamDate, setEditExamDate] = useState('');
  const [editExamFormat, setEditExamFormat] = useState('');
  const [editSubjectType, setEditSubjectType] = useState<SubjectType>('preclinical');
  const [editSemester, setEditSemester] = useState('');

  // Sidebar toggle
  const [sidebarHidden, setSidebarHidden] = useState(false);

  // Show archived subjects
  const [showArchived, setShowArchived] = useState(false);

  // Show trash (soft-deleted subjects)
  const [showTrash, setShowTrash] = useState(false);

  // Sort subjects
  type SortOption = 'exam' | 'name' | 'progress' | 'topics';
  const [sortBy, setSortBy] = useState<SortOption>('exam');

  // Semester filter
  const [semesterFilter, setSemesterFilter] = useState<string>('all');

  // Multi-topic quiz selection
  const [quizSelectMode, setQuizSelectMode] = useState(false);
  const [selectedTopicsForQuiz, setSelectedTopicsForQuiz] = useState<Array<{ subjectId: string; topicId: string }>>([]);

  // Bulk edit mode
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedTopicsForBulk, setSelectedTopicsForBulk] = useState<string[]>([]);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Inline topic name editing
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState('');

  // Single topic delete confirmation
  const [topicToDelete, setTopicToDelete] = useState<{id: string, name: string} | null>(null);

  // Anki export state
  const [ankiConnected, setAnkiConnected] = useState(false);
  const [isExportingAnki, setIsExportingAnki] = useState(false);

  // Scroll to top button
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Track if initial subject selection has been done
  const initialSelectionDone = useRef(false);

  // Check Anki connection
  useEffect(() => {
    checkAnkiConnect().then(setAnkiConnected);
  }, []);

  // Show "scroll to top" button when scrolled down
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  // Bulk edit functions
  const toggleTopicForBulk = (topicId: string) => {
    setSelectedTopicsForBulk(prev => {
      if (prev.includes(topicId)) {
        return prev.filter(id => id !== topicId);
      }
      return [...prev, topicId];
    });
  };

  const selectAllFiltered = () => {
    if (!filteredTopics) return;
    setSelectedTopicsForBulk(filteredTopics.map(t => t.id));
  };

  const clearBulkSelection = () => {
    setSelectedTopicsForBulk([]);
  };

  const applyBulkStatus = (status: TopicStatus) => {
    if (!selectedSubjectId || selectedTopicsForBulk.length === 0) return;
    for (const topicId of selectedTopicsForBulk) {
      setTopicStatus(selectedSubjectId, topicId, status);
    }
    clearBulkSelection();
    setBulkEditMode(false);
  };

  const applyBulkSection = (section: TopicSection | null) => {
    if (!selectedSubjectId || selectedTopicsForBulk.length === 0) return;
    for (const topicId of selectedTopicsForBulk) {
      updateTopic(selectedSubjectId, topicId, { section: section || undefined });
    }
    clearBulkSelection();
    setBulkEditMode(false);
  };

  // Bulk delete
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const applyBulkDelete = () => {
    if (!selectedSubjectId || selectedTopicsForBulk.length === 0) return;
    for (const topicId of selectedTopicsForBulk) {
      deleteTopic(selectedSubjectId, topicId);
    }
    clearBulkSelection();
    setBulkEditMode(false);
    setShowBulkDeleteConfirm(false);
  };

  // Export subject to Anki
  const handleExportToAnki = async () => {
    if (!selectedSubject || selectedSubject.topics.length === 0) return;

    // Re-check connection
    const connected = await checkAnkiConnect();
    if (!connected) {
      alert('Anki не е свързан!\n\nУвери се, че:\n1. Anki е отворен\n2. AnkiConnect добавката е инсталирана\n3. AnkiConnect работи на localhost:8765');
      return;
    }

    setIsExportingAnki(true);
    try {
      const result = await exportSubjectToAnki(
        selectedSubject.name,
        selectedSubject.topics.map(t => ({ number: t.number, name: t.name }))
      );

      if (result.success) {
        alert(`Успешно експортирани в Anki!\n\nГлавен deck: ${result.parentDeck}\nСъздадени: ${result.createdDecks.length} тестета\n\nСега можеш да добавяш карти директно в Anki.`);
      } else {
        alert(`Грешка при експорт: ${result.error}\n\nЧастично създадени: ${result.createdDecks.length} тестета`);
      }
    } catch (error) {
      console.error('Anki export error:', error);
      alert('Грешка при експорт към Anki');
    } finally {
      setIsExportingAnki(false);
    }
  };

  // Sort subjects
  const sortSubjects = (subjects: Subject[]): Subject[] => {
    return [...subjects].sort((a, b) => {
      switch (sortBy) {
        case 'exam': {
          const daysA = getDaysUntil(a.examDate);
          const daysB = getDaysUntil(b.examDate);
          // Put subjects without exam dates at the end
          if (daysA === Infinity && daysB === Infinity) return 0;
          if (daysA === Infinity) return 1;
          if (daysB === Infinity) return -1;
          return daysA - daysB;
        }
        case 'name':
          return a.name.localeCompare(b.name, 'bg');
        case 'progress': {
          const progressA = getSubjectProgress(a).percentage;
          const progressB = getSubjectProgress(b).percentage;
          return progressA - progressB; // Least progress first
        }
        case 'topics':
          return b.topics.length - a.topics.length; // Most topics first
        default:
          return 0;
      }
    });
  };

  // Filter by archive/trash status, then sort (memoized for performance)
  const { activeSubjects, archivedSubjects, trashedSubjects, sortedSubjects, uniqueSemesters } = useMemo(() => {
    // Separate trashed subjects first
    const trashed = data.subjects.filter(s => s.deletedAt);
    const notTrashed = data.subjects.filter(s => !s.deletedAt);
    const active = notTrashed.filter(s => !s.archived);
    const archived = notTrashed.filter(s => s.archived);

    // Get unique semesters from active subjects (guard: only strings, prevents error #310)
    const semesters = [...new Set(active.map(s => s.semester).filter((v): v is string => typeof v === 'string' && v !== ''))];
    semesters.sort();

    let displayed;
    if (showTrash) {
      displayed = trashed;
    } else if (showArchived) {
      displayed = archived;
    } else {
      displayed = active;
    }

    // Apply semester filter (only for active subjects view)
    if (!showTrash && !showArchived && semesterFilter !== 'all') {
      displayed = displayed.filter(s => s.semester === semesterFilter);
    }

    const sorted = sortSubjects(displayed);
    return { activeSubjects: active, archivedSubjects: archived, trashedSubjects: trashed, sortedSubjects: sorted, uniqueSemesters: semesters };
  }, [data.subjects, showArchived, showTrash, sortBy, semesterFilter]);

  // Initial subject selection - only runs once on mount/URL change
  useEffect(() => {
    // Skip if we've already done initial selection
    if (initialSelectionDone.current) return;

    const id = searchParams.get('id');
    if (id && data.subjects.find(s => s.id === id)) {
      // If URL points to an archived subject, show archived view
      const subject = data.subjects.find(s => s.id === id);
      if (subject?.archived) {
        setShowArchived(true);
      }
      setSelectedSubjectId(id);
      initialSelectionDone.current = true;
    } else if (activeSubjects.length > 0) {
      setSelectedSubjectId(activeSubjects[0].id);
      initialSelectionDone.current = true;
    }
  }, [searchParams, data.subjects, activeSubjects]);

  const selectedSubject = data.subjects.find(s => s.id === selectedSubjectId);

  // Memoize filtered topics for performance (must be before any early return - React hooks rule)
  const filteredTopics = useMemo(() => {
    if (!selectedSubject) return [];
    return selectedSubject.topics
      .filter(topic => {
        const matchesStatus = statusFilter === 'all' || topic.status === statusFilter;
        const matchesSize = sizeFilter === 'all' || topic.size === sizeFilter;
        const matchesSection = sectionFilter === 'all' || topic.section === sectionFilter;
        const matchesSearch = searchQuery === '' ||
          topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          topic.number.toString().includes(searchQuery);
        return matchesStatus && matchesSize && matchesSection && matchesSearch;
      })
      .sort((a, b) => a.number - b.number);
  }, [selectedSubject, statusFilter, sizeFilter, sectionFilter, searchQuery]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'exam', label: 'Изпит (най-скоро)' },
    { value: 'name', label: 'Име (А-Я)' },
    { value: 'progress', label: 'Прогрес (най-малко)' },
    { value: 'topics', label: 'Теми (най-много)' }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const handleStartEdit = (subject: Subject) => {
    setEditingSubject(subject.id);
    setEditName(subject.name);
    setEditColor(subject.color);
    setEditExamDate(subject.examDate || '');
    setEditExamFormat(subject.examFormat || '');
    setEditSubjectType(subject.subjectType || 'preclinical');
    setEditSemester(subject.semester || '');
  };

  const handleSaveEdit = () => {
    if (editingSubject && editName.trim()) {
      updateSubject(editingSubject, {
        name: editName.trim(),
        color: editColor,
        subjectType: editSubjectType,
        examDate: editExamDate || null,
        examFormat: editExamFormat.trim() || null,
        semester: editSemester.trim() || undefined
      });
      setEditingSubject(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono">Предмети</h1>
          <p className="text-sm text-slate-500 font-mono mt-1">Управлявай предмети и теми</p>
        </div>
        <button
          onClick={() => syncNow()}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs transition-all ${
            isSyncing
              ? 'bg-blue-600/30 text-blue-300 cursor-wait'
              : 'bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="Синхронизирай с облака"
        >
          {isSyncing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Синхронизиране...
            </>
          ) : (
            <>
              <CloudUpload size={14} />
              Запази сега
            </>
          )}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Subject List */}
        {!sidebarHidden ? (
          <div className="w-72 flex-shrink-0">
            <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase">Предмети</h3>
                <button
                  onClick={() => setSidebarHidden(true)}
                  className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Скрий sidebar"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              {/* Sort dropdown */}
              <div className="mb-3">
                <div className="relative">
                  <ArrowUpDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-300 font-mono text-xs appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-blue-500"
                  >
                    {sortOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {/* Sort indicator badge */}
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                  <span className={`px-1.5 py-0.5 rounded ${
                    sortBy === 'exam' ? 'bg-red-600/20 text-red-400' :
                    sortBy === 'name' ? 'bg-blue-600/20 text-blue-400' :
                    sortBy === 'progress' ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-green-600/20 text-green-400'
                  }`}>
                    {sortBy === 'exam' && '📅 Скоро → Далеч'}
                    {sortBy === 'name' && '🔤 А → Я'}
                    {sortBy === 'progress' && '📊 Малко → Много'}
                    {sortBy === 'topics' && '📚 Много → Малко'}
                  </span>
                </div>
              </div>
              {/* Semester filter - only show if there are semesters defined */}
              {uniqueSemesters.length > 0 && !showArchived && !showTrash && (
                <div className="mb-3">
                  <select
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-300 font-mono text-xs appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">Всички семестри</option>
                    {uniqueSemesters.map(sem => (
                      <option key={sem} value={sem}>{sem}</option>
                    ))}
                  </select>
                  {semesterFilter !== 'all' && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400">
                        📆 {semesterFilter}
                      </span>
                      <button
                        onClick={() => setSemesterFilter('all')}
                        className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 hover:text-slate-200"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* View toggles */}
              <div className="mb-3 flex gap-2">
                {/* Archive toggle */}
                {archivedSubjects.length > 0 && (
                  <button
                    onClick={() => {
                      setShowArchived(!showArchived);
                      setShowTrash(false);
                      setSelectedSubjectId(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                      showArchived
                        ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600'
                    }`}
                    title="Покажи архивирани предмети"
                  >
                    <Archive size={12} />
                    {archivedSubjects.length}
                  </button>
                )}
                {/* Trash toggle */}
                {trashedSubjects.length > 0 && (
                  <button
                    onClick={() => {
                      setShowTrash(!showTrash);
                      setShowArchived(false);
                      setSelectedSubjectId(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                      showTrash
                        ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600'
                    }`}
                    title="Покажи кошче"
                  >
                    <Trash2 size={12} />
                    {trashedSubjects.length}
                  </button>
                )}
              </div>
              {/* Empty trash button */}
              {showTrash && trashedSubjects.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm(`Изтрий перманентно ${trashedSubjects.length} предмет(а)? Това действие е необратимо!`)) {
                      emptyTrash();
                      setShowTrash(false);
                    }
                  }}
                  className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 rounded-lg font-mono text-xs"
                >
                  <Trash2 size={12} />
                  Изпразни кошчето
                </button>
              )}
            {sortedSubjects.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono">
                {showTrash ? 'Кошчето е празно' : showArchived ? 'Няма архивирани предмети' : 'Няма предмети'}
              </p>
            ) : (
              <ul className="space-y-2">
                {sortedSubjects.map(subject => {
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
                          {/* Subject Type Selector */}
                          <div className="flex gap-1">
                            {SUBJECT_TYPES.map(st => (
                              <button
                                key={st.type}
                                onClick={() => setEditSubjectType(st.type)}
                                className={`flex-1 px-2 py-1.5 rounded text-xs font-mono transition-all ${
                                  editSubjectType === st.type
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                                title={st.description}
                              >
                                {st.name}
                              </button>
                            ))}
                          </div>
                          {/* Semester input */}
                          <input
                            type="text"
                            value={editSemester}
                            onChange={(e) => setEditSemester(e.target.value)}
                            placeholder="Семестър (напр. Зимен 2024, 3-ти курс)"
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-100 font-mono"
                          />
                          <input
                            type="date"
                            value={editExamDate}
                            onChange={(e) => setEditExamDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 font-mono"
                            placeholder="Дата на изпит"
                          />
                          {editExamDate && new Date(editExamDate) < new Date(new Date().toDateString()) && (
                            <p className="text-xs text-red-400 font-mono">⚠️ Датата е в миналото</p>
                          )}
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
                          onClick={() => {
                            setSelectedSubjectId(subject.id);
                            // Update URL so back navigation works correctly
                            router.push(`/subjects?id=${subject.id}`, { scroll: false });
                          }}
                          className={"w-full p-3 rounded-lg text-left transition-all " + (isSelected ? "bg-slate-700/50 border border-slate-600" : "hover:bg-slate-800/50 border border-transparent")}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color }} />
                            <span className="text-sm font-medium text-slate-200 truncate flex-1">{subject.name}</span>
                            {!subject.archived && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleStartEdit(subject); }}
                                className="p-1 hover:bg-slate-600 rounded opacity-50 hover:opacity-100"
                                title="Редактирай предмет"
                              >
                                <Edit2 size={12} className="text-slate-400" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-mono">{subject.topics.length} теми</span>
                            <span className="text-slate-500 font-mono">{progress.percentage}%</span>
                          </div>
                          {typeof subject.semester === 'string' && subject.semester && (
                            <div className="text-[10px] font-mono mt-1 px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-400 inline-block">
                              {subject.semester}
                            </div>
                          )}
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
            {/* Import subject button */}
            <label className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-300 border border-slate-600/50 rounded-lg transition-colors font-mono text-xs cursor-pointer">
              <FileUp size={16} /> Импортирай JSON
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const json = event.target?.result as string;
                      const success = importSubjectFromJSON(json);
                      if (success) {
                        alert('Предметът е импортиран успешно!');
                      } else {
                        alert('Грешка при импортиране. Проверете файла.');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = ''; // Reset input
                  }
                }}
              />
            </label>
          </div>
        </div>
        ) : (
          <button
            onClick={() => setSidebarHidden(false)}
            className="flex-shrink-0 p-2 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors self-start"
            title="Покажи списък с предмети"
          >
            <PanelLeft size={20} />
          </button>
        )}

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
                    {/* Action buttons - hide in trash view */}
                    {!showTrash && (
                      <>
                        {/* Bulk Edit Button */}
                        <button
                          onClick={() => {
                            setBulkEditMode(!bulkEditMode);
                            if (bulkEditMode) clearBulkSelection();
                            if (quizSelectMode) {
                              setQuizSelectMode(false);
                              setSelectedTopicsForQuiz([]);
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-mono text-sm ${
                            bulkEditMode
                              ? 'bg-orange-600 text-white'
                              : 'bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30'
                          }`}
                        >
                          <Edit2 size={16} /> {bulkEditMode ? 'Отказ' : 'Bulk Edit'}
                        </button>
                        <button
                          onClick={() => {
                            setQuizSelectMode(!quizSelectMode);
                            if (quizSelectMode) setSelectedTopicsForQuiz([]);
                            if (bulkEditMode) {
                              setBulkEditMode(false);
                              clearBulkSelection();
                            }
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
                      </>
                    )}
                    {/* These buttons only show for non-trashed subjects */}
                    {!showTrash && (
                      <>
                        {/* Export to Anki Button */}
                        <button
                          onClick={handleExportToAnki}
                          disabled={isExportingAnki || selectedSubject.topics.length === 0}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                            ankiConnected
                              ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30'
                              : 'bg-slate-600/20 hover:bg-slate-600/30 text-slate-400 border border-slate-500/30'
                          }`}
                          title={!ankiConnected ? 'Anki не е свързан - отвори Anki и AnkiConnect' : selectedSubject.topics.length === 0 ? 'Няма теми за експорт' : 'Създай deck структура в Anki'}
                        >
                          {isExportingAnki ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Експорт...
                            </>
                          ) : (
                            <>
                              <Download size={16} />
                              Anki
                            </>
                          )}
                        </button>
                        {/* Duplicate button */}
                        <button
                          onClick={() => {
                            duplicateSubject(selectedSubject.id);
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 rounded-lg transition-colors font-mono text-sm"
                          title="Дублирай предмета с всички теми"
                        >
                          <Copy size={16} />
                        </button>
                        {/* Export button */}
                        <button
                          onClick={() => {
                            const json = exportSubjectToJSON(selectedSubject.id);
                            if (json) {
                              const blob = new Blob([json], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${selectedSubject.name.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_')}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-600/20 hover:bg-slate-600/30 text-slate-400 border border-slate-500/30 rounded-lg transition-colors font-mono text-sm"
                          title="Експортирай предмета като JSON"
                        >
                          <FileDown size={16} />
                        </button>
                        {/* Archive/Unarchive button */}
                        <button
                          onClick={() => {
                            if (selectedSubject.archived) {
                              unarchiveSubject(selectedSubject.id);
                              setShowArchived(false);
                            } else {
                              archiveSubject(selectedSubject.id);
                              // Select the next active subject or show archived view
                              const remainingActive = activeSubjects.filter(s => s.id !== selectedSubject.id);
                              if (remainingActive.length > 0) {
                                setSelectedSubjectId(remainingActive[0].id);
                              } else {
                                setShowArchived(true);
                              }
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-mono text-sm ${
                            selectedSubject.archived
                              ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30'
                              : 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30'
                          }`}
                          title={selectedSubject.archived ? 'Активирай предмета' : 'Архивирай предмета'}
                        >
                          {selectedSubject.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          {selectedSubject.archived ? 'Активирай' : 'Архив'}
                        </button>
                      </>
                    )}
                    {/* Trash/Restore/Permanent Delete buttons - context-dependent */}
                    {showTrash ? (
                      <>
                        {/* Restore button - for trashed subjects */}
                        <button
                          onClick={() => {
                            restoreSubject(selectedSubject.id);
                            setSelectedSubjectId(null);
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-lg transition-colors font-mono text-sm"
                          title="Възстанови предмета"
                        >
                          <ArchiveRestore size={16} />
                          Възстанови
                        </button>
                        {/* Permanent delete button - for trashed subjects */}
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors font-mono text-sm"
                          title="Изтрий завинаги"
                        >
                          <Trash2 size={16} />
                          Изтрий завинаги
                        </button>
                      </>
                    ) : (
                      /* Soft delete button - for active/archived subjects */
                      <button
                        onClick={() => {
                          softDeleteSubject(selectedSubject.id);
                          // Select next subject or clear selection
                          const remaining = showArchived
                            ? archivedSubjects.filter(s => s.id !== selectedSubject.id)
                            : activeSubjects.filter(s => s.id !== selectedSubject.id);
                          setSelectedSubjectId(remaining.length > 0 ? remaining[0].id : null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors font-mono text-sm"
                        title="Премести в кошчето"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Mode Indicators */}
                {bulkEditMode && (
                  <div className="mb-4 p-3 bg-orange-600/20 border border-orange-500/50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Edit2 size={18} className="text-orange-400" />
                      <span className="text-orange-300 font-mono text-sm">
                        <strong>Bulk Edit режим</strong> - избери теми и промени статус/секция наведнъж
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400 font-mono text-xs">{selectedTopicsForBulk.length} избрани</span>
                      <button
                        onClick={() => { setBulkEditMode(false); clearBulkSelection(); }}
                        className="px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded text-xs font-mono"
                      >
                        Изход
                      </button>
                    </div>
                  </div>
                )}

                {quizSelectMode && (
                  <div className="mb-4 p-3 bg-purple-600/20 border border-purple-500/50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain size={18} className="text-purple-400" />
                      <span className="text-purple-300 font-mono text-sm">
                        <strong>Mix Quiz режим</strong> - избери теми от различни предмети за комбиниран тест
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 font-mono text-xs">{selectedTopicsForQuiz.length} избрани</span>
                      {selectedTopicsForQuiz.length > 0 && (
                        <button
                          onClick={startMixQuiz}
                          className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-mono"
                        >
                          Старт Quiz
                        </button>
                      )}
                      <button
                        onClick={() => { setQuizSelectMode(false); setSelectedTopicsForQuiz([]); }}
                        className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs font-mono"
                      >
                        Изход
                      </button>
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="flex flex-col gap-3">
                  {/* Search and Status Filter */}
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

                  {/* Size Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">Размер:</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSizeFilter('all')}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                          sizeFilter === 'all' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        Всички
                      </button>
                      {(['small', 'medium', 'large'] as const).map(size => (
                        <button
                          key={size}
                          onClick={() => setSizeFilter(size)}
                          className={`px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                            sizeFilter === size
                              ? 'border-current font-semibold'
                              : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                          style={{ color: TOPIC_SIZE_CONFIG[size].color }}
                          title={`${TOPIC_SIZE_CONFIG[size].label} (~${TOPIC_SIZE_CONFIG[size].minutes} мин)`}
                        >
                          {TOPIC_SIZE_CONFIG[size].short}
                        </button>
                      ))}
                    </div>
                    {/* Size stats */}
                    {selectedSubject && (
                      <span className="text-[10px] text-slate-600 font-mono ml-2">
                        {selectedSubject.topics.filter(t => t.size === 'small').length}S /
                        {selectedSubject.topics.filter(t => t.size === 'medium').length}M /
                        {selectedSubject.topics.filter(t => t.size === 'large').length}L
                        {selectedSubject.topics.filter(t => !t.size).length > 0 && (
                          <span className="text-slate-700"> / {selectedSubject.topics.filter(t => !t.size).length} без</span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Section Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">Секция:</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSectionFilter('all')}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                          sectionFilter === 'all' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        Всички
                      </button>
                      <button
                        onClick={() => setSectionFilter('theoretical')}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                          sectionFilter === 'theoretical' ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        📖 Теоретичен
                      </button>
                      <button
                        onClick={() => setSectionFilter('practical')}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                          sectionFilter === 'practical' ? 'bg-green-600/30 text-green-400 border border-green-500/50' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        🔬 Практичен
                      </button>
                    </div>
                    {selectedSubject && (
                      <span className="text-[10px] text-slate-600 font-mono ml-2">
                        {selectedSubject.topics.filter(t => t.section === 'theoretical').length}📖 /
                        {selectedSubject.topics.filter(t => t.section === 'practical').length}🔬
                        {selectedSubject.topics.filter(t => !t.section).length > 0 && (
                          <span className="text-slate-700"> / {selectedSubject.topics.filter(t => !t.section).length} без</span>
                        )}
                      </span>
                    )}
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

                      const isSelectedForBulk = selectedTopicsForBulk.includes(topic.id);

                      return (
                        <div
                          key={topic.id}
                          className={`flex items-center gap-2 p-4 rounded-lg border transition-all hover:scale-[1.005] ${
                            isSelectedForQuiz ? 'ring-2 ring-purple-500' : ''
                          } ${
                            isSelectedForBulk ? 'ring-2 ring-orange-500' : ''
                          }`}
                          style={{
                            backgroundColor: isSelectedForQuiz ? 'rgba(147, 51, 234, 0.15)' : isSelectedForBulk ? 'rgba(249, 115, 22, 0.15)' : config.bg,
                            borderColor: isSelectedForQuiz ? 'rgb(147, 51, 234)' : isSelectedForBulk ? 'rgb(249, 115, 22)' : config.border
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

                          {/* Checkbox for Bulk Edit selection */}
                          {bulkEditMode && (
                            <button
                              onClick={() => toggleTopicForBulk(topic.id)}
                              className={`shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                                selectedTopicsForBulk.includes(topic.id)
                                  ? 'border-orange-500 bg-orange-500 text-white'
                                  : 'border-slate-500 hover:border-orange-400'
                              }`}
                            >
                              {selectedTopicsForBulk.includes(topic.id) && <span className="text-sm">✓</span>}
                            </button>
                          )}

                          <Link
                            href={quizSelectMode || bulkEditMode ? '#' : `/subjects/${selectedSubjectId}/topics/${topic.id}`}
                            onClick={(e) => {
                              if (quizSelectMode) {
                                e.preventDefault();
                                if (hasMaterial) toggleTopicForQuiz(selectedSubject.id, topic.id);
                              } else if (bulkEditMode) {
                                e.preventDefault();
                                toggleTopicForBulk(topic.id);
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
                                {editingTopicId === topic.id ? (
                                  <input
                                    type="text"
                                    value={editingTopicName}
                                    onChange={(e) => setEditingTopicName(e.target.value)}
                                    onBlur={() => {
                                      if (editingTopicName.trim() && editingTopicName !== topic.name) {
                                        // Parse "17. Topic name" → number: 17, name: "Topic name"
                                        const numMatch = editingTopicName.trim().match(/^(\d+)[\.\)\-\s]+(.+)$/);
                                        if (numMatch) {
                                          updateTopic(selectedSubjectId!, topic.id, { name: numMatch[2].trim(), number: parseInt(numMatch[1], 10) });
                                        } else {
                                          updateTopic(selectedSubjectId!, topic.id, { name: editingTopicName.trim() });
                                        }
                                      }
                                      setEditingTopicId(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (editingTopicName.trim() && editingTopicName !== topic.name) {
                                          const numMatch = editingTopicName.trim().match(/^(\d+)[\.\)\-\s]+(.+)$/);
                                          if (numMatch) {
                                            updateTopic(selectedSubjectId!, topic.id, { name: numMatch[2].trim(), number: parseInt(numMatch[1], 10) });
                                          } else {
                                            updateTopic(selectedSubjectId!, topic.id, { name: editingTopicName.trim() });
                                          }
                                        }
                                        setEditingTopicId(null);
                                      } else if (e.key === 'Escape') {
                                        setEditingTopicId(null);
                                      }
                                    }}
                                    onClick={(e) => e.preventDefault()}
                                    onDragStart={(e) => e.preventDefault()}
                                    draggable={false}
                                    autoFocus
                                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                                  />
                                ) : (
                                  <span
                                    className="text-slate-200 font-medium line-clamp-2 text-sm leading-snug cursor-pointer hover:text-purple-300 transition-colors"
                                    title="Кликни за редакция"
                                    onClick={(e) => {
                                      if (!quizSelectMode && !bulkEditMode) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditingTopicId(topic.id);
                                        setEditingTopicName(topic.name);
                                      }
                                    }}
                                  >
                                    {topic.name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-mono flex-wrap">
                                <span>{config.label}</span>
                                {/* Topic Size Badge */}
                                {topic.size && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                    style={{
                                      color: TOPIC_SIZE_CONFIG[topic.size].color,
                                      backgroundColor: TOPIC_SIZE_CONFIG[topic.size].bgColor
                                    }}
                                    title={`${TOPIC_SIZE_CONFIG[topic.size].label} (~${TOPIC_SIZE_CONFIG[topic.size].minutes} мин)`}
                                  >
                                    {TOPIC_SIZE_CONFIG[topic.size].short}
                                  </span>
                                )}
                                {/* Section Badge - clickable to cycle */}
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!selectedSubjectId) return;
                                    const next = !topic.section ? 'theoretical' : topic.section === 'theoretical' ? 'practical' : undefined;
                                    updateTopic(selectedSubjectId, topic.id, { section: next });
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                    topic.section === 'theoretical'
                                      ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                      : topic.section === 'practical'
                                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                        : 'bg-slate-700/30 text-slate-600 hover:bg-slate-700/50 hover:text-slate-400'
                                  }`}
                                  title="Кликни за смяна: без → теоретичен → практичен"
                                >
                                  {topic.section === 'theoretical' ? '📖 Теор' : topic.section === 'practical' ? '🔬 Практ' : '⊘'}
                                </button>
                                {typeof topic.avgGrade === 'number' && topic.avgGrade > 0 && <span>Оценка: {topic.avgGrade.toFixed(2)}</span>}
                                {topic.quizCount > 0 && <span>{topic.quizCount} {topic.quizCount === 1 ? 'тест' : 'теста'}</span>}
                                {(topic.readCount || 0) > 0 && (
                                  <span className="text-cyan-500">
                                    {topic.readCount}x • {topic.lastRead
                                      ? getDaysSince(topic.lastRead) === 0
                                        ? 'днес'
                                        : getDaysSince(topic.lastRead) === 1
                                          ? 'вчера'
                                          : `${getDaysSince(topic.lastRead)}д`
                                      : ''}
                                  </span>
                                )}
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
                          {/* Delete Topic Button - hide in select modes */}
                          {!quizSelectMode && !bulkEditMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTopicToDelete({ id: topic.id, name: topic.name });
                              }}
                              title="Изтрий тема"
                              className="p-2.5 rounded-lg transition-all bg-slate-700/30 hover:bg-red-600/30 text-slate-500 hover:text-red-400 border border-transparent hover:border-red-500/30"
                            >
                              <Trash2 size={16} />
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

      {/* Floating bar for selected topics - Mix Quiz */}
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

      {/* Floating bar for Bulk Edit */}
      {bulkEditMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-900/95 backdrop-blur border border-orange-500/50 rounded-2xl px-6 py-4 shadow-2xl shadow-orange-500/20 flex items-center gap-6">
            <div>
              <span className="text-orange-300 font-mono text-lg font-semibold">
                {selectedTopicsForBulk.length} / {filteredTopics.length}
              </span>
              <p className="text-xs text-slate-400 font-mono">теми избрани</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAllFiltered}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-mono text-xs transition-all"
              >
                Избери всички
              </button>
              <button
                onClick={clearBulkSelection}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-mono text-xs transition-all"
              >
                Изчисти
              </button>
            </div>
            {selectedTopicsForBulk.length > 0 && (
              <div className="flex gap-2 border-l border-slate-700 pl-4">
                <span className="text-xs text-slate-500 font-mono self-center mr-1">Статус:</span>
                {(Object.keys(STATUS_CONFIG) as TopicStatus[]).map(status => (
                  <button
                    key={status}
                    onClick={() => applyBulkStatus(status)}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all hover:scale-110"
                    style={{ backgroundColor: STATUS_CONFIG[status].bg, border: `1px solid ${STATUS_CONFIG[status].border}` }}
                    title={`Смени на ${STATUS_CONFIG[status].label}`}
                  >
                    {STATUS_CONFIG[status].emoji}
                  </button>
                ))}
              </div>
            )}
            {selectedTopicsForBulk.length > 0 && (
              <div className="flex gap-2 border-l border-slate-700 pl-4">
                <span className="text-xs text-slate-500 font-mono self-center mr-1">Секция:</span>
                <button
                  onClick={() => applyBulkSection('theoretical')}
                  className="px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 rounded-lg font-mono text-xs transition-all border border-blue-500/30"
                  title="Теоретичен"
                >
                  📖 Теор
                </button>
                <button
                  onClick={() => applyBulkSection('practical')}
                  className="px-3 py-2 bg-green-600/30 hover:bg-green-600/50 text-green-400 rounded-lg font-mono text-xs transition-all border border-green-500/30"
                  title="Практичен"
                >
                  🔬 Практ
                </button>
                <button
                  onClick={() => applyBulkSection(null)}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg font-mono text-xs transition-all"
                  title="Без секция"
                >
                  ✕
                </button>
              </div>
            )}
            {selectedTopicsForBulk.length > 0 && (
              <div className="flex gap-2 border-l border-slate-700 pl-4">
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="px-3 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded-lg font-mono text-xs transition-all border border-red-500/30 flex items-center gap-1"
                  title="Изтрий избраните"
                >
                  🗑️ Изтрий ({selectedTopicsForBulk.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowBulkDeleteConfirm(false)} />
          <div className="relative bg-[#0f0f1a] border border-red-500/50 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-red-400 font-mono mb-4 flex items-center gap-2">
              🗑️ Изтриване на теми
            </h3>
            <p className="text-slate-300 font-mono text-sm mb-4">
              Сигурен ли си, че искаш да изтриеш <strong className="text-red-400">{selectedTopicsForBulk.length}</strong> теми?
            </p>
            <p className="text-slate-500 font-mono text-xs mb-6">
              Това действие е необратимо. Всички данни за избраните теми ще бъдат изгубени.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg font-mono text-sm hover:bg-slate-700 transition-colors"
              >
                Отказ
              </button>
              <button
                onClick={applyBulkDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-mono text-sm hover:bg-red-500 transition-colors"
              >
                🗑️ Изтрий
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddSubject && <AddSubjectModal onClose={() => setShowAddSubject(false)} />}
      {showImportTopics && selectedSubjectId && <ImportTopicsModal subjectId={selectedSubjectId} subjectName={selectedSubject?.name} onClose={() => setShowImportTopics(false)} />}
      {showAIImport && selectedSubjectId && selectedSubject && (
        <ImportFileModal
          subjectId={selectedSubjectId}
          subjectName={selectedSubject.name}
          onClose={() => setShowAIImport(false)}
        />
      )}

      {/* Permanent Delete Confirmation - only for trash */}
      {selectedSubject && showTrash && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            permanentlyDeleteSubject(selectedSubject.id);
            setSelectedSubjectId(null);
          }}
          title="Изтрий завинаги"
          message={`Сигурен ли си, че искаш да изтриеш "${selectedSubject.name}" ЗАВИНАГИ? Това действие е необратимо!`}
          confirmText="Изтрий завинаги"
          variant="danger"
        />
      )}

      {/* Single Topic Delete Confirmation */}
      {topicToDelete && selectedSubjectId && (
        <ConfirmDialog
          isOpen={!!topicToDelete}
          onClose={() => setTopicToDelete(null)}
          onConfirm={() => {
            deleteTopic(selectedSubjectId, topicToDelete.id);
            setTopicToDelete(null);
          }}
          title="Изтрий тема"
          message={`Сигурен ли си, че искаш да изтриеш темата "${topicToDelete.name}"?`}
          confirmText="Изтрий"
          variant="danger"
        />
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 p-3 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-full shadow-lg hover:bg-slate-700 hover:border-purple-500/50 transition-all text-slate-400 hover:text-purple-300"
          title="Нагоре"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </div>
  );
}