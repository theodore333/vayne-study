'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, Calendar, Edit2, AlertTriangle, TrendingUp, Target } from 'lucide-react';
import { useApp } from '@/lib/context';
import { DAYS, DAYS_SHORT, CLASS_TYPES, ACADEMIC_EVENT_CONFIG } from '@/lib/constants';
import { AcademicEvent } from '@/lib/types';
import AddClassModal from '@/components/modals/AddClassModal';
import AddAcademicEventModal from '@/components/modals/AddAcademicEventModal';

export default function SchedulePage() {
  const { data, isLoading, deleteClass, deleteAcademicEvent } = useApp();
  const [showAddClass, setShowAddClass] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  // Get upcoming events sorted by date
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return data.academicEvents
      .map(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const subject = data.subjects.find(s => s.id === event.subjectId);
        return { event, daysUntil, subject };
      })
      .filter(e => e.daysUntil >= 0 && e.subject) // Only future or today events
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [data.academicEvents, data.subjects]);

  // Semester Overview - all exams with cluster detection
  const semesterOverview = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

    // Get all exams sorted by date
    const exams = activeSubjects
      .filter(s => s.examDate)
      .map(s => {
        const examDate = new Date(s.examDate!);
        examDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const totalTopics = s.topics.length;
        const greenTopics = s.topics.filter(t => t.status === 'green').length;
        const remaining = totalTopics - greenTopics;
        const topicsPerDay = daysUntil > 0 ? remaining / daysUntil : remaining;

        return {
          subject: s,
          examDate: s.examDate!,
          daysUntil,
          totalTopics,
          greenTopics,
          remaining,
          topicsPerDay,
          progress: totalTopics > 0 ? Math.round((greenTopics / totalTopics) * 100) : 0
        };
      })
      .filter(e => e.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // Detect exam clusters (2+ exams within 3 days)
    const clusters: Array<{ exams: typeof exams; startDate: string; endDate: string }> = [];
    for (let i = 0; i < exams.length; i++) {
      const clusterExams = [exams[i]];
      for (let j = i + 1; j < exams.length; j++) {
        const daysDiff = exams[j].daysUntil - exams[i].daysUntil;
        if (daysDiff <= 3) {
          clusterExams.push(exams[j]);
        }
      }
      if (clusterExams.length >= 2) {
        // Check if this cluster isn't already part of a previous cluster
        const alreadyClustered = clusters.some(c =>
          c.exams.some(e => clusterExams.some(ce => ce.subject.id === e.subject.id))
        );
        if (!alreadyClustered) {
          clusters.push({
            exams: clusterExams,
            startDate: clusterExams[0].examDate,
            endDate: clusterExams[clusterExams.length - 1].examDate
          });
        }
      }
    }

    return { exams, clusters };
  }, [data.subjects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500 font-mono">Зареждане...</div>
      </div>
    );
  }

  const today = (new Date().getDay() + 6) % 7;

  const getClassesForDay = (day: number) => {
    return data.schedule
      .filter(c => c.day === day)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
  const getSubjectById = (id: string) => data.subjects.find(s => s.id === id);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono">Седмичен график</h1>
          <p className="text-sm text-slate-500 font-mono mt-1">Управлявай занятията си</p>
        </div>
        <button
          onClick={() => setShowAddClass(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-mono text-sm"
        >
          <Plus size={18} /> Добави занятие
        </button>
      </div>

      {/* Week Grid */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-[#1e293b]">
          {DAYS.map((day, i) => (
            <div
              key={day}
              className={"p-4 text-center border-r last:border-r-0 border-[#1e293b] " + (i === today ? "bg-blue-500/10" : "")}
            >
              <div className={"text-sm font-semibold font-mono " + (i === today ? "text-blue-400" : "text-slate-400")}>
                {DAYS_SHORT[i]}
              </div>
              <div className={"text-xs font-mono mt-1 " + (i === today ? "text-blue-400" : "text-slate-500")}>
                {i === today && "ДНЕС"}
              </div>
            </div>
          ))}
        </div>

        {/* Schedule Grid */}
        <div className="grid grid-cols-7 min-h-[500px]">
          {DAYS.map((_, dayIndex) => {
            const classes = getClassesForDay(dayIndex);
            const isToday = dayIndex === today;

            return (
              <div
                key={dayIndex}
                className={"p-3 border-r last:border-r-0 border-[#1e293b] space-y-2 " + (isToday ? "bg-blue-500/5" : "")}
              >
                {classes.length === 0 ? (
                  <div className="text-xs text-slate-600 font-mono text-center py-4">
                    Няма занятия
                  </div>
                ) : (
                  classes.map(cls => {
                    const subject = getSubjectById(cls.subjectId);
                    const typeConfig = CLASS_TYPES[cls.type];
                    if (!subject) return null;

                    return (
                      <div
                        key={cls.id}
                        className="p-3 rounded-lg border group relative"
                        style={{
                          backgroundColor: typeConfig.color + "15",
                          borderColor: typeConfig.color + "40"
                        }}
                      >
                        <button
                          onClick={() => deleteClass(cls.id)}
                          className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                        >
                          <Trash2 size={12} className="text-red-400" />
                        </button>
                        <div className="text-lg mb-1">{typeConfig.icon}</div>
                        <div className="text-xs font-mono mb-1" style={{ color: typeConfig.color }}>
                          {cls.time}
                        </div>
                        <div className="text-sm font-medium text-slate-200 truncate" style={{ color: subject.color }}>
                          {subject.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-1">
                          {typeConfig.label}
                        </div>
                        {cls.room && (
                          <div className="text-xs text-slate-500 font-mono">
                            Зала {cls.room}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
        <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-3">Легенда</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(CLASS_TYPES).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-lg">{config.icon}</span>
              <span className="text-sm font-mono" style={{ color: config.color }}>{config.label}</span>
              {config.prepRequired && (
                <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-mono">
                  Подготовка
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Academic Events Section */}
      <div className="mt-6 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="text-purple-400" size={20} />
            <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase">
              Предстоящи събития
            </h3>
          </div>
          <button
            onClick={() => setShowAddEvent(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-mono text-xs"
          >
            <Plus size={14} /> Събитие
          </button>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="mx-auto text-slate-600 mb-3" size={40} />
            <p className="text-slate-500 font-mono text-sm">Няма предстоящи събития</p>
            <p className="text-slate-600 font-mono text-xs mt-1">
              Добави колоквиуми, контролни и други важни дати
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(({ event, daysUntil, subject }) => {
              const config = ACADEMIC_EVENT_CONFIG[event.type];
              const isUrgent = daysUntil <= config.urgencyDays.high;
              const isSoon = daysUntil <= config.urgencyDays.medium;

              return (
                <div
                  key={event.id}
                  className={`p-3 rounded-lg border group transition-all ${
                    isUrgent
                      ? 'bg-red-500/10 border-red-500/30'
                      : isSoon
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{config.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-200 font-mono">
                            {event.name || config.label}
                          </span>
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: subject?.color }}
                          />
                          <span className="text-xs text-slate-400 font-mono">
                            {subject?.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-500 font-mono">
                            {new Date(event.date).toLocaleDateString('bg-BG', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short'
                            })}
                          </span>
                          <span
                            className={`text-xs font-mono font-semibold ${
                              isUrgent
                                ? 'text-red-400'
                                : isSoon
                                ? 'text-yellow-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {daysUntil === 0
                              ? 'ДНЕС!'
                              : daysUntil === 1
                              ? 'УТРЕ!'
                              : `след ${daysUntil} дни`}
                          </span>
                          {event.weight !== 1.0 && (
                            <span className="text-xs text-slate-500 font-mono">
                              {event.weight}x
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-slate-500 font-mono mt-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteAcademicEvent(event.id)}
                      className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Event Types Legend */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex flex-wrap gap-3">
            {Object.entries(ACADEMIC_EVENT_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="text-sm">{config.icon}</span>
                <span className="text-xs font-mono text-slate-500">{config.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Semester Overview - Exams Calendar */}
      {semesterOverview.exams.length > 0 && (
        <div className="mt-6 p-4 bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <Target className="text-cyan-400" size={20} />
            <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase">
              Semester Overview
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              ({semesterOverview.exams.length} изпита)
            </span>
          </div>

          {/* Cluster Warnings */}
          {semesterOverview.clusters.length > 0 && (
            <div className="mb-4 space-y-2">
              {semesterOverview.clusters.map((cluster, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                >
                  <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-red-400 font-mono">
                      Exam Cluster Warning!
                    </span>
                    <span className="text-xs text-red-300 font-mono ml-2">
                      {cluster.exams.length} изпита за {
                        Math.ceil((new Date(cluster.endDate).getTime() - new Date(cluster.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
                      } дни
                    </span>
                    <div className="flex gap-2 mt-1">
                      {cluster.exams.map(e => (
                        <span
                          key={e.subject.id}
                          className="text-xs px-2 py-0.5 rounded font-mono"
                          style={{ backgroundColor: `${e.subject.color}30`, color: e.subject.color }}
                        >
                          {e.subject.name.slice(0, 15)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Exam Timeline */}
          <div className="space-y-3">
            {semesterOverview.exams.map(exam => {
              const isUrgent = exam.daysUntil <= 7;
              const isCritical = exam.daysUntil <= 3;
              const workloadHeavy = exam.topicsPerDay > 5;
              const workloadMedium = exam.topicsPerDay > 3;

              return (
                <div
                  key={exam.subject.id}
                  className={`p-3 rounded-lg border transition-all ${
                    isCritical
                      ? 'bg-red-500/10 border-red-500/30'
                      : isUrgent
                      ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-slate-800/30 border-slate-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: exam.subject.color }}
                      />
                      <span className="text-sm font-semibold text-slate-200 font-mono">
                        {exam.subject.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono ${
                        isCritical ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-slate-400'
                      }`}>
                        {exam.daysUntil === 0 ? 'ДНЕС!' :
                         exam.daysUntil === 1 ? 'УТРЕ!' :
                         `${exam.daysUntil} дни`}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(exam.examDate).toLocaleDateString('bg-BG', {
                          day: 'numeric',
                          month: 'short'
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${exam.progress}%`,
                          backgroundColor: exam.progress >= 80 ? '#22c55e' :
                                          exam.progress >= 50 ? '#eab308' :
                                          exam.subject.color
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 font-mono w-12 text-right">
                      {exam.progress}%
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-2 text-xs font-mono">
                    <span className="text-slate-500">
                      {exam.greenTopics}/{exam.totalTopics} готови
                    </span>
                    <span className="text-slate-500">
                      {exam.remaining} остават
                    </span>
                    <span className={
                      workloadHeavy ? 'text-red-400' :
                      workloadMedium ? 'text-yellow-400' :
                      'text-emerald-400'
                    }>
                      {exam.topicsPerDay.toFixed(1)} теми/ден
                    </span>
                    {workloadHeavy && (
                      <span className="text-red-400 flex items-center gap-1">
                        <TrendingUp size={12} />
                        Тежко!
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            {(() => {
              const avgWorkload = semesterOverview.exams.reduce((s, e) => s + e.topicsPerDay, 0) / semesterOverview.exams.length;
              const allOnTrack = semesterOverview.exams.every(e => e.topicsPerDay <= 3);
              const hasCritical = semesterOverview.exams.some(e => e.daysUntil <= 3);

              if (hasCritical) {
                return (
                  <div className="flex items-center gap-2 text-red-400 text-sm font-mono">
                    <AlertTriangle size={16} />
                    Имаш изпит до 3 дни! Фокусирай се максимално.
                  </div>
                );
              } else if (semesterOverview.clusters.length > 0) {
                return (
                  <div className="flex items-center gap-2 text-orange-400 text-sm font-mono">
                    <AlertTriangle size={16} />
                    Внимание: Имаш натрупани изпити. Планирай внимателно.
                  </div>
                );
              } else if (allOnTrack) {
                return (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono">
                    <Target size={16} />
                    Добре си! Средно {avgWorkload.toFixed(1)} теми/ден - изпълнимо.
                  </div>
                );
              } else {
                return (
                  <div className="flex items-center gap-2 text-yellow-400 text-sm font-mono">
                    <TrendingUp size={16} />
                    Натоварено е ({avgWorkload.toFixed(1)} теми/ден), но можеш да се справиш!
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}

      {showAddClass && <AddClassModal onClose={() => setShowAddClass(false)} defaultDay={selectedDay} />}
      {showAddEvent && <AddAcademicEventModal onClose={() => setShowAddEvent(false)} />}
    </div>
  );
}