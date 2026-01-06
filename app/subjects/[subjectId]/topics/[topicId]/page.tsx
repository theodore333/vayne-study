'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Star, BookOpen, Trash2, FileText, Save, Brain, Upload, Loader2, FilePlus } from 'lucide-react';
import { TopicStatus } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';
import { getDaysSince } from '@/lib/algorithms';
import { useApp } from '@/lib/context';
import Link from 'next/link';

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data, isLoading, setTopicStatus, addGrade, deleteTopic, updateTopicMaterial } = useApp();

  const subjectId = params.subjectId as string;
  const topicId = params.topicId as string;

  const subject = data.subjects.find(s => s.id === subjectId);
  const topic = subject?.topics.find(t => t.id === topicId);

  const [gradeInput, setGradeInput] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [material, setMaterial] = useState('');
  const [materialSaved, setMaterialSaved] = useState(true);

  // PDF upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Load API key
  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    setApiKey(stored);
  }, []);

  useEffect(() => {
    if (topic) {
      setMaterial(topic.material || '');
      setMaterialSaved(true);
    }
  }, [topic?.id, topic?.material]);

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

      const response = await fetch('/api/extract-material', {
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

    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsExtracting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const daysSinceReview = getDaysSince(topic.lastReview);
  const reviewWarning = daysSinceReview >= 7 && topic.status !== 'gray';
  const hasMaterial = material.trim().length > 0;
  const config = STATUS_CONFIG[topic.status];

  return (
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
          disabled={!hasMaterial}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all ${
            hasMaterial
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Brain size={18} />
          Започни Quiz
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
            <h1 className="text-2xl font-bold text-slate-100 font-mono">
              {topic.name}
            </h1>
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
                <p className="text-sm text-red-300 font-mono">{extractError}</p>
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

            <textarea
              value={material}
              onChange={(e) => handleMaterialChange(e.target.value)}
              placeholder="Постави текст от учебник, лекции или бележки тук...&#10;&#10;Или натисни 'Качи PDF' за автоматично извличане от документ."
              className="w-full h-64 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveMaterial}
                disabled={materialSaved}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-cyan-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {materialSaved ? 'Запазено' : 'Запази материал'}
              </button>
              {hasMaterial && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!apiKey || isExtracting}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title="Добави още от PDF"
                >
                  <FilePlus size={16} />
                </button>
              )}
            </div>

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
          {/* Last Review */}
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-400 font-mono">
                Последен преговор
              </span>
            </div>
            <div className={`text-xl font-mono ${reviewWarning ? 'text-orange-400' : 'text-slate-200'}`}>
              {topic.lastReview
                ? daysSinceReview === 0
                  ? 'Днес'
                  : daysSinceReview === 1
                    ? 'Вчера'
                    : `Преди ${daysSinceReview} дни`
                : 'Никога'
              }
              {reviewWarning && ' ⚠️'}
            </div>
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
                    {topic.avgGrade?.toFixed(2)}
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
                      {grade}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono">
                  {topic.quizCount} {topic.quizCount === 1 ? 'тест' : 'теста'}
                </div>
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
  );
}
