'use client';

import { useState, useEffect } from 'react';
import { X, Clock, Star, BookOpen, Trash2, FileText, Save } from 'lucide-react';
import { Topic, TopicStatus } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';
import { getDaysSince } from '@/lib/algorithms';
import { useApp } from '@/lib/context';

interface Props {
  topic: Topic;
  subjectId: string;
  subjectColor: string;
  onClose: () => void;
}

export default function TopicDetailSidebar({ topic, subjectId, subjectColor, onClose }: Props) {
  const { setTopicStatus, addGrade, deleteTopic, updateTopicMaterial } = useApp();
  const [gradeInput, setGradeInput] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [material, setMaterial] = useState(topic.material || '');
  const [materialSaved, setMaterialSaved] = useState(true);

  useEffect(() => {
    setMaterial(topic.material || '');
    setMaterialSaved(true);
  }, [topic.id, topic.material]);

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
    onClose();
  };

  const handleMaterialChange = (value: string) => {
    setMaterial(value);
    setMaterialSaved(false);
  };

  const handleSaveMaterial = () => {
    updateTopicMaterial(subjectId, topic.id, material);
    setMaterialSaved(true);
  };

  const daysSinceReview = getDaysSince(topic.lastReview);
  const reviewWarning = daysSinceReview >= 7 && topic.status !== 'gray';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-screen w-full max-w-md bg-[rgba(15,15,25,0.98)] border-l border-[#1e293b] z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[rgba(15,15,25,0.98)] border-b border-[#1e293b] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor: `${subjectColor}30`, color: subjectColor }}
                >
                  #{topic.number}
                </span>
                <span className="text-lg">
                  {STATUS_CONFIG[topic.status].emoji}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-100 line-clamp-3" title={topic.name}>
                {topic.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Section */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-3 font-mono uppercase tracking-wider">
              Статус
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STATUS_CONFIG) as TopicStatus[]).map(status => {
                const config = STATUS_CONFIG[status];
                const isActive = topic.status === status;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isActive ? 'scale-[1.02]' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: isActive ? config.bg : 'transparent',
                      borderColor: isActive ? config.border : 'transparent',
                      color: config.text
                    }}
                  >
                    <div className="text-2xl mb-1">{config.emoji}</div>
                    <div className="text-sm font-mono">{config.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Material Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-400 font-mono uppercase tracking-wider">
                <FileText size={14} className="inline mr-2" />
                Материал
              </label>
              {!materialSaved && (
                <span className="text-xs text-orange-400 font-mono">Незапазено</span>
              )}
            </div>
            <textarea
              value={material}
              onChange={(e) => handleMaterialChange(e.target.value)}
              placeholder="Постави текст от учебник, лекции или бележки тук..."
              className="w-full h-40 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono text-sm resize-none"
            />
            <button
              onClick={handleSaveMaterial}
              disabled={materialSaved}
              className="w-full mt-2 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-cyan-500 transition-all font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save size={16} />
              {materialSaved ? 'Запазено' : 'Запази материал'}
            </button>
            <p className="mt-2 text-xs text-slate-500 font-mono">
              AI ще генерира тестове базирани на твоя материал
            </p>
          </div>

          {/* Last Review */}
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-400 font-mono">
                Последен преговор
              </span>
            </div>
            <div className={`text-lg font-mono ${reviewWarning ? 'text-orange-400' : 'text-slate-200'}`}>
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

          {/* Reading Stats */}
          <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-cyan-400" />
              <span className="text-sm font-medium text-slate-400 font-mono">
                Четене
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-slate-900/50 rounded-lg text-center">
                <div className="text-xs text-slate-500 font-mono mb-1">Прочетено</div>
                <div className="text-lg font-mono text-cyan-400">{topic.readCount || 0}x</div>
              </div>
              <div className="p-2 bg-slate-900/50 rounded-lg text-center">
                <div className="text-xs text-slate-500 font-mono mb-1">Последно</div>
                <div className="text-sm font-mono text-slate-300">
                  {topic.lastRead
                    ? getDaysSince(topic.lastRead) === 0
                      ? 'Днес'
                      : getDaysSince(topic.lastRead) === 1
                        ? 'Вчера'
                        : `${getDaysSince(topic.lastRead)}д`
                    : '—'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Grades Section */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-3 font-mono uppercase tracking-wider">
              <Star size={14} className="inline mr-2" />
              Оценки от тестове
            </label>

            {topic.grades.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400 font-mono">
                    Средна оценка:
                  </span>
                  <span className={`text-xl font-bold font-mono ${
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

            <div className="flex gap-2">
              <div className="flex-1">
                <div className="flex gap-1">
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
              </div>
            </div>
            <button
              onClick={handleAddGrade}
              disabled={gradeInput === null}
              className="w-full mt-2 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Запиши оценка {gradeInput !== null && `(${gradeInput})`}
            </button>
          </div>

          {/* Quick Quiz Prompt */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-700/30">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-purple-400 font-mono">
                Бърз тест
              </span>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Провери знанията си по тази тема и запиши оценката горе.
            </p>
            <div className="text-xs text-slate-500 font-mono">
              Съвет: Редовните тестове предотвратяват забравяне
            </div>
          </div>

          {/* Delete Topic */}
          <div className="pt-4 border-t border-slate-700/50">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-all font-mono text-sm flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                Изтрий тема
              </button>
            ) : (
              <div className="space-y-2">
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
    </>
  );
}
