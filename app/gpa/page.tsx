'use client';

import { useState, useMemo } from 'react';
import { GraduationCap, Plus, Trash2, Target, Award, BookOpen } from 'lucide-react';
import { useApp } from '@/lib/context';

// МУ София формула: Семестър = средна аритметична от всички оценки
type SemesterGrade = { grade: number };
function getSemesterAverage(semGrades: SemesterGrade[]) {
  if (semGrades.length === 0) return 0;
  const sum = semGrades.reduce((acc, g) => acc + g.grade, 0);
  return sum / semGrades.length;
}

export default function GPAPage() {
  const { data, addSemesterGrade, deleteSemesterGrade, setTargetGPA, addStateExam, deleteStateExam } = useApp();
  const { grades, targetGPA, stateExams = [] } = data.gpaData;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showStateExamModal, setShowStateExamModal] = useState(false);
  const [newGrade, setNewGrade] = useState({
    semester: 1,
    year: new Date().getFullYear(),
    subjectName: '',
    grade: 6
  });
  const [newStateExam, setNewStateExam] = useState({ name: '', grade: 6 });

  // Group grades by semester
  const semesters = useMemo(() => {
    const result: Record<string, typeof grades> = {};
    grades.forEach(g => {
      const key = `${g.year}-${g.semester}`;
      if (!result[key]) result[key] = [];
      result[key].push(g);
    });
    return result;
  }, [grades]);

  // Среден успех от ВСИЧКИ семестри (аритметична средна от семестрите)
  const semesterAverages = useMemo(() => {
    return Object.values(semesters).map(getSemesterAverage).filter(avg => avg > 0);
  }, [semesters]);

  const overallSemesterAverage = useMemo(() => {
    if (semesterAverages.length === 0) return 0;
    return semesterAverages.reduce((a, b) => a + b, 0) / semesterAverages.length;
  }, [semesterAverages]);

  // Средна от държавни изпити
  const stateExamAverage = useMemo(() => {
    if (stateExams.length === 0) return 0;
    return stateExams.reduce((acc, e) => acc + e.grade, 0) / stateExams.length;
  }, [stateExams]);

  // 4. Диплома = (среден успех от всички семестри + средна от държавни изпити) / 2
  const diplomaGPA = useMemo(() => {
    if (overallSemesterAverage === 0) return 0;
    if (stateExamAverage === 0) return overallSemesterAverage; // Ако няма държавни изпити
    return (overallSemesterAverage + stateExamAverage) / 2;
  }, [overallSemesterAverage, stateExamAverage]);

  const handleAddGrade = () => {
    if (!newGrade.subjectName.trim()) return;
    // Validate grade is between 2-6
    if (newGrade.grade < 2 || newGrade.grade > 6) {
      alert('Оценката трябва да е между 2 и 6!');
      return;
    }
    addSemesterGrade(newGrade);
    setNewGrade({
      semester: newGrade.semester,
      year: newGrade.year,
      subjectName: '',
      grade: 6
    });
    setShowAddModal(false);
  };

  const handleAddStateExam = () => {
    if (!newStateExam.name.trim()) return;
    // Validate grade is between 2-6
    if (newStateExam.grade < 2 || newStateExam.grade > 6) {
      alert('Оценката трябва да е между 2 и 6!');
      return;
    }
    addStateExam(newStateExam);
    setNewStateExam({ name: '', grade: 6 });
    setShowStateExamModal(false);
  };

  const handleDeleteStateExam = (index: number) => {
    deleteStateExam(index);
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 5.5) return 'text-green-400';
    if (grade >= 4.5) return 'text-yellow-400';
    if (grade >= 3.5) return 'text-orange-400';
    return 'text-red-400';
  };

  const getGradeBg = (grade: number) => {
    if (grade >= 5.5) return 'bg-green-500/10 border-green-500/30';
    if (grade >= 4.5) return 'bg-yellow-500/10 border-yellow-500/30';
    if (grade >= 3.5) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
            <GraduationCap className="text-amber-400" />
            GPA Калкулатор - МУ София
          </h1>
          <p className="text-slate-400 mt-1 font-mono text-sm">
            Изчисли средния успех по формулата на МУ София
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStateExamModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-600/30 font-semibold rounded-lg hover:bg-purple-600/30 transition-all font-mono text-sm"
          >
            <Award size={18} />
            Държавен изпит
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-lg hover:from-amber-500 hover:to-orange-500 transition-all font-mono text-sm"
          >
            <Plus size={18} />
            Добави оценка
          </button>
        </div>
      </div>

      {/* Formula Explanation */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-2 font-mono">Формула МУ София:</h3>
        <div className="text-xs text-slate-400 font-mono space-y-1">
          <p>1. <span className="text-blue-400">Семестър</span> = средна аритметична от всички оценки</p>
          <p>2. <span className="text-purple-400">Година</span> = (семестър 1 + семестър 2) / 2</p>
          <p>3. <span className="text-amber-400">Диплома</span> = (среден успех от ВСИЧКИ семестри + средна от държавни изпити) / 2</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Semester Average */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={18} className="text-blue-400" />
            <span className="text-sm text-slate-400 font-mono">Всички семестри</span>
          </div>
          <div className={`text-4xl font-bold font-mono ${getGradeColor(overallSemesterAverage)}`}>
            {overallSemesterAverage > 0 ? overallSemesterAverage.toFixed(2) : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            {semesterAverages.length} семестъра
          </div>
        </div>

        {/* State Exams Average */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Award size={18} className="text-purple-400" />
            <span className="text-sm text-slate-400 font-mono">Държавни изпити</span>
          </div>
          <div className={`text-4xl font-bold font-mono ${stateExamAverage > 0 ? getGradeColor(stateExamAverage) : 'text-slate-600'}`}>
            {stateExamAverage > 0 ? stateExamAverage.toFixed(2) : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            {stateExams.length} изпита
          </div>
        </div>

        {/* Diploma GPA */}
        <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-700/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap size={18} className="text-amber-400" />
            <span className="text-sm text-amber-400 font-mono">Диплома</span>
          </div>
          <div className={`text-4xl font-bold font-mono ${getGradeColor(diplomaGPA)}`}>
            {diplomaGPA > 0 ? diplomaGPA.toFixed(2) : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-mono">
            ({overallSemesterAverage.toFixed(2)} + {stateExamAverage > 0 ? stateExamAverage.toFixed(2) : '?'}) / 2
          </div>
        </div>

        {/* Target GPA */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <Target size={18} className="text-slate-400" />
            <span className="text-sm text-slate-400 font-mono">Цел</span>
          </div>
          <input
            type="number"
            value={targetGPA}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) setTargetGPA(Math.min(6, Math.max(2, val)));
            }}
            min={2}
            max={6}
            step={0.1}
            aria-label="Целева GPA"
            className="text-4xl font-bold font-mono text-purple-400 bg-transparent w-24 focus:outline-none"
          />
          <div className="mt-2 text-xs text-slate-500 font-mono">
            {diplomaGPA >= targetGPA && diplomaGPA > 0 ? '✓ Постигната!' : diplomaGPA > 0 ? `${(targetGPA - diplomaGPA).toFixed(2)} до целта` : 'Добави оценки'}
          </div>
        </div>
      </div>

      {/* State Exams Section */}
      {stateExams.length > 0 && (
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-purple-700/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award size={20} className="text-purple-400" />
              <h3 className="text-lg font-semibold text-slate-100 font-mono">
                Държавни изпити
              </h3>
            </div>
            <div className="text-right">
              <div className={`text-xl font-bold font-mono ${getGradeColor(stateExamAverage)}`}>
                {stateExamAverage.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 font-mono">средна</div>
            </div>
          </div>
          <div className="divide-y divide-purple-700/30">
            {stateExams.map((exam, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-lg border font-mono font-bold ${getGradeBg(exam.grade)} ${getGradeColor(exam.grade)}`}>
                    {exam.grade.toFixed(2)}
                  </div>
                  <span className="text-slate-200 font-medium">{exam.name}</span>
                </div>
                <button
                  onClick={() => handleDeleteStateExam(i)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Semesters */}
      {Object.keys(semesters).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(semesters)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, semGrades]) => {
              const [year, sem] = key.split('-');
              const avg = getSemesterAverage(semGrades);
              return (
                <div key={key} className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-100 font-mono">
                        {year} - Семестър {sem}
                      </h3>
                      <p className="text-sm text-slate-400 font-mono">
                        {semGrades.length} {semGrades.length === 1 ? 'предмет' : 'предмета'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold font-mono ${getGradeColor(avg)}`}>
                        {avg.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">средна аритметична</div>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {semGrades.map(g => (
                      <div key={g.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`px-3 py-1 rounded-lg border font-mono font-bold ${getGradeBg(g.grade)} ${getGradeColor(g.grade)}`}>
                            {g.grade.toFixed(2)}
                          </div>
                          <div>
                            <div className="text-slate-200 font-medium">{g.subjectName}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteSemesterGrade(g.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-12 text-center">
          <GraduationCap size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2 font-mono">
            Няма добавени оценки
          </h3>
          <p className="text-sm text-slate-500 font-mono mb-4">
            Добави оценките си по семестри за да изчислиш GPA
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 font-semibold rounded-lg hover:bg-amber-600/30 transition-all font-mono text-sm"
          >
            <Plus size={18} />
            Добави първата оценка
          </button>
        </div>
      )}

      {/* Add Grade Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 font-mono flex items-center gap-2">
              <Plus size={20} className="text-amber-400" />
              Добави оценка
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1 font-mono">Семестър</label>
                  <select
                    value={newGrade.semester}
                    onChange={(e) => setNewGrade({ ...newGrade, semester: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(s => (
                      <option key={s} value={s}>Семестър {s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1 font-mono">Година</label>
                  <input
                    type="number"
                    value={newGrade.year}
                    onChange={(e) => setNewGrade({ ...newGrade, year: parseInt(e.target.value, 10) || new Date().getFullYear() })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1 font-mono">Предмет</label>
                <input
                  type="text"
                  value={newGrade.subjectName}
                  onChange={(e) => setNewGrade({ ...newGrade, subjectName: e.target.value })}
                  placeholder="напр. Анатомия"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1 font-mono">Оценка</label>
                <input
                  type="number"
                  value={newGrade.grade}
                  onChange={(e) => setNewGrade({ ...newGrade, grade: parseFloat(e.target.value) || 6 })}
                  min={2}
                  max={6}
                  step={0.01}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all font-mono"
                >
                  Отказ
                </button>
                <button
                  onClick={handleAddGrade}
                  disabled={!newGrade.subjectName.trim()}
                  className="flex-1 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-lg hover:from-amber-500 hover:to-orange-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Добави
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add State Exam Modal */}
      {showStateExamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowStateExamModal(false)} />
          <div className="relative bg-[rgba(20,20,35,0.98)] border border-[#1e293b] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 font-mono flex items-center gap-2">
              <Award size={20} className="text-purple-400" />
              Добави държавен изпит
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1 font-mono">Име на изпита</label>
                <input
                  type="text"
                  value={newStateExam.name}
                  onChange={(e) => setNewStateExam({ ...newStateExam, name: e.target.value })}
                  placeholder="напр. Вътрешни болести"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1 font-mono">Оценка</label>
                <input
                  type="number"
                  value={newStateExam.grade}
                  onChange={(e) => setNewStateExam({ ...newStateExam, grade: parseFloat(e.target.value) || 6 })}
                  min={2}
                  max={6}
                  step={0.01}
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowStateExamModal(false)}
                  className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all font-mono"
                >
                  Отказ
                </button>
                <button
                  onClick={handleAddStateExam}
                  disabled={!newStateExam.name.trim()}
                  className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Добави
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
