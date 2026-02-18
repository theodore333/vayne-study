'use client';

import { useState, useMemo } from 'react';
import { GraduationCap, Plus, Trash2, Target, Award, BookOpen, TrendingUp, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
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

  const [totalSemesters, setTotalSemesters] = useState(12);
  const [assumedStateExamCount, setAssumedStateExamCount] = useState(3);
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

  // === GOAL ANALYSIS ===
  const goalAnalysis = useMemo(() => {
    const completedCount = semesterAverages.length;
    const remaining = Math.max(0, totalSemesters - completedCount);
    const sumCompleted = semesterAverages.reduce((a, b) => a + b, 0);

    // Determine state exam situation
    const hasStateExams = stateExams.length > 0;
    const stateExamsComplete = hasStateExams && stateExams.length >= assumedStateExamCount;
    const currentStateAvg = stateExamAverage;

    // Best possible diploma: all remaining semesters = 6, all remaining state exams = 6
    const bestPossibleSemAvg = completedCount === 0 ? 6 :
      (sumCompleted + remaining * 6) / totalSemesters;
    const bestPossibleStateAvg = stateExamsComplete ? currentStateAvg :
      hasStateExams
        ? (stateExams.reduce((a, e) => a + e.grade, 0) + (assumedStateExamCount - stateExams.length) * 6) / assumedStateExamCount
        : 6;
    const bestPossibleDiploma = (bestPossibleSemAvg + bestPossibleStateAvg) / 2;

    // Worst possible diploma: all remaining = 3.00 (pass minimum)
    const worstPassSemAvg = completedCount === 0 ? 3 :
      (sumCompleted + remaining * 3) / totalSemesters;
    const worstPassStateAvg = stateExamsComplete ? currentStateAvg :
      hasStateExams
        ? (stateExams.reduce((a, e) => a + e.grade, 0) + (assumedStateExamCount - stateExams.length) * 3) / assumedStateExamCount
        : 3;
    const worstPassDiploma = (worstPassSemAvg + worstPassStateAvg) / 2;

    // === SCENARIO 1: What semester avg needed if state exams = 6.00 ===
    // diploma = (semAvg + stateAvg) / 2 = target => semAvg = 2*target - stateAvg
    const stateAvgForCalc = stateExamsComplete ? currentStateAvg : 6;
    const neededSemAvg = 2 * targetGPA - stateAvgForCalc;
    // semAvg = (sumCompleted + sumRemaining) / totalSemesters
    // sumRemaining = neededSemAvg * totalSemesters - sumCompleted
    const sumRemainingNeeded = neededSemAvg * totalSemesters - sumCompleted;
    const avgRemainingNeeded = remaining > 0 ? sumRemainingNeeded / remaining : neededSemAvg;
    const scenario1Possible = avgRemainingNeeded <= 6.00;
    const scenario1RoomForError = 6.00 - avgRemainingNeeded;

    // === SCENARIO 2: What state exam avg needed if remaining semesters = 6.00 ===
    const bestSemAvgWithPerfectRemaining = completedCount === 0 ? 6 :
      (sumCompleted + remaining * 6) / totalSemesters;
    const neededStateAvg = 2 * targetGPA - bestSemAvgWithPerfectRemaining;
    const scenario2Possible = neededStateAvg <= 6.00 && neededStateAvg >= 2.00;

    // === "ROOM FOR ERROR" — how much can remaining grades average drop below 6 ===
    // Assuming state exams = 6.00 (best case support)
    const roomPerSubject = scenario1Possible ? scenario1RoomForError : 0;

    // Goal feasibility
    const isImpossible = bestPossibleDiploma < targetGPA;
    const isGuaranteed = worstPassDiploma >= targetGPA;

    return {
      completedCount,
      remaining,
      sumCompleted,
      bestPossibleDiploma,
      worstPassDiploma,
      // Scenario 1
      avgRemainingNeeded,
      scenario1Possible,
      scenario1RoomForError,
      stateAvgForCalc,
      // Scenario 2
      neededStateAvg,
      scenario2Possible,
      bestSemAvgWithPerfectRemaining,
      // Overall
      roomPerSubject,
      isImpossible,
      isGuaranteed,
    };
  }, [semesterAverages, totalSemesters, targetGPA, stateExams, stateExamAverage, assumedStateExamCount]);

  // === RETAKE RECOMMENDATIONS (повишителни изпити) ===
  const retakeRecommendations = useMemo(() => {
    if (grades.length === 0) return [];

    // For each grade, calculate diploma impact if improved to 6.00
    return grades
      .filter(g => g.grade < 5.50) // Only recommend for grades below 5.50
      .map(g => {
        const semKey = `${g.year}-${g.semester}`;
        const semGrades = semesters[semKey] || [];
        const subjectCount = semGrades.length;
        const delta = 6.00 - g.grade;
        // Impact: improving this grade changes semester avg by delta/subjectCount
        // That changes overall semAvg by (delta/subjectCount) / totalSemesters
        // That changes diploma by that / 2
        const diplomaImpact = subjectCount > 0
          ? (delta / subjectCount) / totalSemesters / 2
          : 0;
        return {
          ...g,
          delta,
          diplomaImpact,
          semKey,
        };
      })
      .sort((a, b) => b.diplomaImpact - a.diplomaImpact)
      .slice(0, 5);
  }, [grades, semesters, totalSemesters]);

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

      {/* === GOAL ANALYSIS SECTION === */}
      {grades.length > 0 && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-cyan-400" />
              <h3 className="text-lg font-semibold text-slate-100 font-mono">
                Анализ на целта
              </h3>
            </div>
            {/* Settings */}
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Семестри:</span>
                <select
                  value={totalSemesters}
                  onChange={(e) => setTotalSemesters(parseInt(e.target.value, 10))}
                  className="bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-slate-300"
                >
                  {[8, 10, 12].map(n => (
                    <option key={n} value={n}>{n} ({n / 2} г.)</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Държавни:</span>
                <select
                  value={assumedStateExamCount}
                  onChange={(e) => setAssumedStateExamCount(parseInt(e.target.value, 10))}
                  className="bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-slate-300"
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
                <span>Прогрес: {goalAnalysis.completedCount}/{totalSemesters} семестъра</span>
                <span>{Math.round((goalAnalysis.completedCount / totalSemesters) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                  style={{ width: `${(goalAnalysis.completedCount / totalSemesters) * 100}%` }}
                />
              </div>
            </div>

            {/* Main verdict */}
            <div className={`p-4 rounded-xl border ${
              goalAnalysis.isImpossible
                ? 'bg-red-500/10 border-red-500/30'
                : goalAnalysis.isGuaranteed
                  ? 'bg-green-500/10 border-green-500/30'
                  : goalAnalysis.scenario1Possible
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-start gap-3">
                {goalAnalysis.isImpossible ? (
                  <XCircle size={24} className="text-red-400 mt-0.5 shrink-0" />
                ) : goalAnalysis.isGuaranteed ? (
                  <CheckCircle size={24} className="text-green-400 mt-0.5 shrink-0" />
                ) : goalAnalysis.scenario1Possible ? (
                  <AlertTriangle size={24} className="text-yellow-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle size={24} className="text-red-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="font-semibold font-mono text-sm text-slate-100">
                    {goalAnalysis.isImpossible
                      ? `Целта ${targetGPA.toFixed(2)} е НЕДОСТИЖИМА`
                      : goalAnalysis.isGuaranteed
                        ? `Целта ${targetGPA.toFixed(2)} е ГАРАНТИРАНА!`
                        : goalAnalysis.scenario1Possible
                          ? `Целта ${targetGPA.toFixed(2)} е постижима, но изисква усилие`
                          : `Целта ${targetGPA.toFixed(2)} е почти недостижима`
                    }
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    {goalAnalysis.isImpossible
                      ? `Дори с 6.00 навсякъде, най-доброто възможно е ${goalAnalysis.bestPossibleDiploma.toFixed(2)}`
                      : goalAnalysis.isGuaranteed
                        ? `Дори с минимални оценки (3.00), дипломата ще е ${goalAnalysis.worstPassDiploma.toFixed(2)}`
                        : goalAnalysis.remaining > 0
                          ? `Най-добро възможно: ${goalAnalysis.bestPossibleDiploma.toFixed(2)} | Най-лошо (с тройки): ${goalAnalysis.worstPassDiploma.toFixed(2)}`
                          : `Очакваш още държавни изпити — средната им ще определи крайния резултат`
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed scenarios */}
            {goalAnalysis.remaining > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Scenario 1: What remaining semesters need */}
                <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
                  <div className="text-xs text-slate-500 font-mono mb-2">
                    Нужна средна за оставащите {goalAnalysis.remaining} семестъра
                    {stateExams.length >= assumedStateExamCount
                      ? ` (държавни: ${goalAnalysis.stateAvgForCalc.toFixed(2)})`
                      : ' (ако държавни = 6.00)'}
                  </div>
                  <div className={`text-3xl font-bold font-mono ${
                    goalAnalysis.avgRemainingNeeded <= 4.50 ? 'text-green-400' :
                    goalAnalysis.avgRemainingNeeded <= 5.50 ? 'text-yellow-400' :
                    goalAnalysis.avgRemainingNeeded <= 6.00 ? 'text-orange-400' :
                    'text-red-400'
                  }`}>
                    {goalAnalysis.avgRemainingNeeded <= 0
                      ? '< 2.00'
                      : goalAnalysis.avgRemainingNeeded > 6
                        ? '> 6.00'
                        : goalAnalysis.avgRemainingNeeded.toFixed(2)
                    }
                  </div>
                  {goalAnalysis.scenario1Possible && goalAnalysis.avgRemainingNeeded > 2 && (
                    <div className="text-xs text-slate-500 font-mono mt-2">
                      Буфер: {goalAnalysis.scenario1RoomForError.toFixed(2)} точки под 6.00
                    </div>
                  )}
                  {goalAnalysis.avgRemainingNeeded <= 2 && (
                    <div className="text-xs text-green-400/70 font-mono mt-2">
                      Вече си над целта — просто взимай изпитите!
                    </div>
                  )}
                </div>

                {/* Scenario 2: What state exams need */}
                <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
                  <div className="text-xs text-slate-500 font-mono mb-2">
                    Нужна средна от държавни изпити (ако оставащи семестри = 6.00)
                  </div>
                  <div className={`text-3xl font-bold font-mono ${
                    goalAnalysis.neededStateAvg < 2
                      ? 'text-green-400'
                      : goalAnalysis.neededStateAvg <= 4.50 ? 'text-green-400' :
                        goalAnalysis.neededStateAvg <= 5.50 ? 'text-yellow-400' :
                        goalAnalysis.neededStateAvg <= 6.00 ? 'text-orange-400' :
                        'text-red-400'
                  }`}>
                    {goalAnalysis.neededStateAvg < 2
                      ? '< 2.00'
                      : goalAnalysis.neededStateAvg > 6
                        ? '> 6.00'
                        : goalAnalysis.neededStateAvg.toFixed(2)
                    }
                  </div>
                  {goalAnalysis.scenario2Possible && goalAnalysis.neededStateAvg >= 2 && (
                    <div className="text-xs text-slate-500 font-mono mt-2">
                      Буфер: {(6.00 - goalAnalysis.neededStateAvg).toFixed(2)} точки под 6.00
                    </div>
                  )}
                  {goalAnalysis.neededStateAvg < 2 && (
                    <div className="text-xs text-green-400/70 font-mono mt-2">
                      Целта е гарантирана дори с минимални държавни!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Room for error visualization */}
            {goalAnalysis.remaining > 0 && goalAnalysis.scenario1Possible && goalAnalysis.avgRemainingNeeded > 2 && (
              <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
                <div className="text-xs text-slate-500 font-mono mb-3">
                  Допустима грешка на оставащите семестри (при държавни = 6.00)
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="h-4 bg-slate-700/50 rounded-full overflow-hidden relative">
                      {/* Required zone */}
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500/40 to-orange-500/40 rounded-l-full"
                        style={{ width: `${((goalAnalysis.avgRemainingNeeded - 2) / 4) * 100}%` }}
                      />
                      {/* Buffer zone */}
                      <div
                        className="absolute inset-y-0 bg-gradient-to-r from-green-500/40 to-emerald-500/40"
                        style={{
                          left: `${((goalAnalysis.avgRemainingNeeded - 2) / 4) * 100}%`,
                          width: `${(goalAnalysis.scenario1RoomForError / 4) * 100}%`
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-1">
                      <span>2.00</span>
                      <span>3.00</span>
                      <span>4.00</span>
                      <span>5.00</span>
                      <span>6.00</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-bold font-mono ${
                      goalAnalysis.scenario1RoomForError >= 1.5 ? 'text-green-400' :
                      goalAnalysis.scenario1RoomForError >= 0.5 ? 'text-yellow-400' :
                      'text-orange-400'
                    }`}>
                      {goalAnalysis.scenario1RoomForError >= 1.5 ? 'Комфортно' :
                       goalAnalysis.scenario1RoomForError >= 0.5 ? 'Умерено' :
                       'Тясно'}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      буфер {goalAnalysis.scenario1RoomForError.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Retake recommendations (повишителни изпити) */}
            {retakeRecommendations.length > 0 && (
              <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Award size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-slate-200 font-mono">
                    Препоръки за повишителни изпити
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono mb-3">
                  Предмети, при които повишителен изпит (до 6.00) ще подобри най-много дипломата:
                </div>
                <div className="space-y-2">
                  {retakeRecommendations.map((rec, i) => (
                    <div key={rec.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-600 w-4">{i + 1}.</span>
                        <div className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${getGradeBg(rec.grade)} ${getGradeColor(rec.grade)}`}>
                          {rec.grade.toFixed(2)}
                        </div>
                        <span className="text-sm text-slate-300">{rec.subjectName}</span>
                        <span className="text-xs text-slate-600 font-mono">→ 6.00</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-green-400">
                          +{rec.diplomaImpact.toFixed(3)} диплома
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-slate-500 font-mono border-t border-slate-700/30 pt-3">
                  Обща полза при повишаване на всички до 6.00: <span className="text-green-400 font-semibold">
                    +{retakeRecommendations.reduce((a, r) => a + r.diplomaImpact, 0).toFixed(3)}
                  </span> към дипломата
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
