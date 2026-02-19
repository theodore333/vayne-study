'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, Calendar, Edit2, AlertTriangle, TrendingUp, Target, MapPin, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useApp } from '@/lib/context';
import { DAYS, DAYS_SHORT, CLASS_TYPES, ACADEMIC_EVENT_CONFIG } from '@/lib/constants';
import AddClassModal from '@/components/modals/AddClassModal';
import AddAcademicEventModal from '@/components/modals/AddAcademicEventModal';
import ImportProgramModal from '@/components/modals/ImportProgramModal';

export default function SchedulePage() {
  const { data, isLoading, deleteClass, deleteAcademicEvent, updateAcademicPeriod } = useApp();
  const [showAddClass, setShowAddClass] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showImportProgram, setShowImportProgram] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [editingClass, setEditingClass] = useState<typeof data.schedule[0] | null>(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week

  // Determine which days to show (Mon-Fri, or include weekends if they have classes)
  const visibleDays = useMemo(() => {
    const hasWeekendClasses = data.schedule.some(c => c.day >= 5); // 5=Sat, 6=Sun
    if (hasWeekendClasses) return [0, 1, 2, 3, 4, 5, 6];
    return [0, 1, 2, 3, 4]; // Mon-Fri only
  }, [data.schedule]);

  // Get upcoming events sorted by date
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return data.academicEvents
      .map(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const subject = event.subjectId ? data.subjects.find(s => s.id === event.subjectId) : null;
        return { event, daysUntil, subject };
      })
      .filter(e => e.daysUntil >= 0 && (e.subject || !e.event.subjectId) && e.event.type !== 'seminar') // Exclude seminar (weekly topics) — only special events
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [data.academicEvents, data.subjects]);

  // Semester Overview - all exams with cluster detection
  const semesterOverview = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

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

  // Calculate the Monday of the selected week
  const selectedWeekMonday = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  // Get the date for a specific day index (0=Mon..6=Sun) in the selected week
  const getDateForDay = (dayIndex: number): string => {
    const d = new Date(selectedWeekMonday);
    d.setDate(d.getDate() + dayIndex);
    return d.toISOString().split('T')[0];
  };

  // Get academic events for a specific date
  const eventsForWeek = useMemo(() => {
    const weekDates = new Set<string>();
    for (let i = 0; i < 7; i++) {
      weekDates.add(getDateForDay(i));
    }
    return data.academicEvents.filter(e => weekDates.has(e.date) && e.type !== 'seminar');
  }, [data.academicEvents, selectedWeekMonday]);

  const getEventsForDay = (dayIndex: number) => {
    const dateStr = getDateForDay(dayIndex);
    return eventsForWeek.filter(e => e.date === dateStr);
  };

  // Week label
  const weekLabel = useMemo(() => {
    const start = new Date(selectedWeekMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
    return `${fmt(start)} — ${fmt(end)}`;
  }, [selectedWeekMonday]);

  // Check if a date falls in academic period
  const isInAcademicPeriod = (dateStr: string): boolean => {
    const ap = data.academicPeriod;
    if (!ap.semesterStart || !ap.semesterEnd) return true; // No period set = assume active
    return dateStr >= ap.semesterStart && dateStr <= ap.semesterEnd;
  };

  const getClassesForDay = (day: number) => {
    return data.schedule
      .filter(c => c.day === day)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const getSubjectById = (id: string) => data.subjects.find(s => s.id === id);
  const colsClass = visibleDays.length === 7 ? 'grid-cols-7' : 'grid-cols-5';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-mono">Седмичен график</h1>
          <p className="text-sm text-slate-500 font-mono mt-1">
            {data.schedule.length} занятия • {data.academicEvents.length} събития
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportProgram(true)}
            className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-mono text-sm"
          >
            <FileText size={16} /> Програма
          </button>
          <button
            onClick={() => setShowAddEvent(true)}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-mono text-sm"
          >
            <Calendar size={16} /> Събитие
          </button>
          <button
            onClick={() => setShowAddClass(true)}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-mono text-sm"
          >
            <Plus size={16} /> Занятие
          </button>
        </div>
      </div>

      {/* Academic Period */}
      {(() => {
        const ap = data.academicPeriod;
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        let currentPeriod = '';
        if (ap.sessionStart && ap.sessionEnd && todayDate >= new Date(ap.sessionStart) && todayDate <= new Date(ap.sessionEnd)) {
          currentPeriod = 'Сесия';
        } else if (ap.cycleStart && ap.cycleEnd && todayDate >= new Date(ap.cycleStart) && todayDate <= new Date(ap.cycleEnd)) {
          currentPeriod = 'Цикъл';
        } else if (ap.semesterStart && ap.semesterEnd && todayDate >= new Date(ap.semesterStart) && todayDate <= new Date(ap.semesterEnd)) {
          currentPeriod = 'Семестър';
        } else if (ap.semesterStart && todayDate < new Date(ap.semesterStart)) {
          const daysUntil = Math.ceil((new Date(ap.semesterStart).getTime() - todayDate.getTime()) / 86400000);
          currentPeriod = `Семестърът почва след ${daysUntil}д`;
        }

        return (
          <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300 font-mono">
                Академичен период
                {currentPeriod && (
                  <span className="ml-2 px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                    {currentPeriod}
                  </span>
                )}
              </h2>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Семестър', startKey: 'semesterStart' as const, endKey: 'semesterEnd' as const, startVal: ap.semesterStart, endVal: ap.semesterEnd },
                { label: 'Цикъл', startKey: 'cycleStart' as const, endKey: 'cycleEnd' as const, startVal: ap.cycleStart, endVal: ap.cycleEnd },
                { label: 'Сесия', startKey: 'sessionStart' as const, endKey: 'sessionEnd' as const, startVal: ap.sessionStart, endVal: ap.sessionEnd },
              ].map(period => (
                <div key={period.label} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-mono w-20 shrink-0">{period.label}</span>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[10px] text-slate-600 font-mono">от</span>
                    <input type="date" value={period.startVal || ''}
                      onChange={e => updateAcademicPeriod({ [period.startKey]: e.target.value || null })}
                      className="flex-1 max-w-[160px] px-2 py-1.5 bg-slate-800/50 border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-purple-500"
                    />
                    <span className="text-[10px] text-slate-600 font-mono">до</span>
                    <input type="date" value={period.endVal || ''}
                      onChange={e => updateAcademicPeriod({ [period.endKey]: e.target.value || null })}
                      className="flex-1 max-w-[160px] px-2 py-1.5 bg-slate-800/50 border border-slate-700 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              ))}
            </div>
            {!ap.semesterStart && !ap.cycleStart && !ap.sessionStart && (
              <p className="text-xs text-slate-600 font-mono mt-2">Задай дати за да знае AI кога какво почва</p>
            )}
          </div>
        );
      })()}

      {/* Week Grid */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl overflow-hidden">
        {/* Week Navigation */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e293b] bg-slate-900/30">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <button
              onClick={() => setWeekOffset(0)}
              className="text-sm font-mono text-slate-300 hover:text-cyan-400 transition-colors"
            >
              {weekLabel}
            </button>
            {weekOffset !== 0 && (
              <div className="text-[10px] font-mono text-slate-600 mt-0.5">
                {weekOffset > 0 ? `+${weekOffset}` : weekOffset} {Math.abs(weekOffset) === 1 ? 'седмица' : 'седмици'}
              </div>
            )}
            {eventsForWeek.length > 0 && (
              <div className="text-[10px] font-mono text-purple-400 mt-0.5">
                {eventsForWeek.length} {eventsForWeek.length === 1 ? 'събитие' : 'събития'} тази седмица
              </div>
            )}
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Day Headers */}
        <div className={`grid ${colsClass} border-b border-[#1e293b]`}>
          {visibleDays.map(i => {
            const dayDate = getDateForDay(i);
            const isActive = isInAcademicPeriod(dayDate);
            const classCount = isActive ? getClassesForDay(i).length : 0;
            const dayEvents = getEventsForDay(i);
            const isCurrentDay = weekOffset === 0 && i === today;
            return (
              <div
                key={i}
                className={"p-3 border-r last:border-r-0 border-[#1e293b] " + (isCurrentDay ? "bg-blue-500/10" : !isActive ? "bg-slate-900/50" : "")}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={"text-sm font-semibold font-mono " + (isCurrentDay ? "text-blue-400" : !isActive ? "text-slate-700" : "text-slate-400")}>
                      {DAYS_SHORT[i]}
                      <span className="ml-1.5 text-[10px] text-slate-600 font-normal">
                        {new Date(dayDate + 'T00:00:00').getDate()}
                      </span>
                      {isCurrentDay && <span className="ml-1.5 text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded">ДНЕС</span>}
                    </div>
                    {classCount > 0 && (
                      <div className="text-[10px] text-slate-600 font-mono mt-0.5">{classCount} зан.</div>
                    )}
                    {dayEvents.length > 0 && (
                      <div className="text-[10px] text-purple-400 font-mono mt-0.5">{dayEvents.length} съб.</div>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelectedDay(i); setShowAddClass(true); }}
                    className="p-1 rounded hover:bg-green-500/20 text-slate-600 hover:text-green-400 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Schedule Grid */}
        <div className={`grid ${colsClass} min-h-[400px]`}>
          {visibleDays.map(dayIndex => {
            const dayDate = getDateForDay(dayIndex);
            const isCurrentDay = weekOffset === 0 && dayIndex === today;
            const isActive = isInAcademicPeriod(dayDate);
            // Only show recurring classes during the academic period
            const classes = isActive ? getClassesForDay(dayIndex) : [];
            const dayEvents = getEventsForDay(dayIndex);

            return (
              <div
                key={dayIndex}
                className={"p-2.5 border-r last:border-r-0 border-[#1e293b] space-y-2 " + (isCurrentDay ? "bg-blue-500/5" : !isActive ? "bg-slate-900/30" : "")}
              >
                {/* Academic events for this day */}
                {dayEvents.map(ev => {
                  const config = ACADEMIC_EVENT_CONFIG[ev.type];
                  const subject = ev.subjectId ? data.subjects.find(s => s.id === ev.subjectId) : null;
                  return (
                    <div
                      key={ev.id}
                      className="p-2 rounded-lg border border-purple-500/30 bg-purple-500/10 relative group"
                      title={[ev.name || config.label, ev.description].filter(Boolean).join('\n')}
                    >
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => deleteAcademicEvent(ev.id)}
                          className="p-1 rounded hover:bg-red-500/20"
                        >
                          <Trash2 size={10} className="text-red-400" />
                        </button>
                      </div>
                      <div className="text-xs font-mono text-purple-300">
                        {config.icon} {ev.name || config.label}
                      </div>
                      {subject && (
                        <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: subject.color }}>
                          {subject.name}
                        </div>
                      )}
                      {ev.description && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                          {ev.description}
                        </div>
                      )}
                    </div>
                  );
                })}

                {classes.length === 0 && dayEvents.length === 0 ? (
                  !isActive ? (
                    <div className="w-full min-h-[60px] flex items-center justify-center">
                      <span className="text-[10px] font-mono text-slate-700">—</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setSelectedDay(dayIndex); setShowAddClass(true); }}
                      className="w-full h-full min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-800 hover:border-slate-600 text-slate-700 hover:text-slate-400 transition-all group"
                    >
                      <Plus size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">Добави</span>
                    </button>
                  )
                ) : (
                  classes.map(cls => {
                    const subject = getSubjectById(cls.subjectId);
                    const typeConfig = CLASS_TYPES[cls.type];
                    if (!subject) return null;

                    return (
                      <div
                        key={cls.id}
                        className="p-2.5 rounded-lg border group relative"
                        style={{
                          backgroundColor: typeConfig.color + "15",
                          borderColor: typeConfig.color + "40"
                        }}
                      >
                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => setEditingClass(cls)}
                            className="p-1 rounded hover:bg-blue-500/20"
                          >
                            <Edit2 size={11} className="text-blue-400" />
                          </button>
                          <button
                            onClick={() => deleteClass(cls.id)}
                            className="p-1 rounded hover:bg-red-500/20"
                          >
                            <Trash2 size={11} className="text-red-400" />
                          </button>
                        </div>
                        {(() => {
                          const weeklyInfo = cls.weeklyTopics?.[dayDate];
                          const linkedTopics = weeklyInfo?.topicIds
                            ?.map(id => subject.topics.find(t => t.id === id))
                            .filter(Boolean) || [];
                          return (
                            <>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-sm">{typeConfig.icon}</span>
                                <span className="text-xs font-mono font-semibold" style={{ color: typeConfig.color }}>
                                  {cls.time}
                                </span>
                              </div>
                              <div className="text-sm font-medium truncate" style={{ color: subject.color }}>
                                {subject.name}
                              </div>
                              {cls.room && (
                                <div className="flex items-center gap-1 mt-1 text-slate-500">
                                  <MapPin size={10} />
                                  <span className="text-[10px] font-mono">{cls.room}</span>
                                </div>
                              )}
                              {weeklyInfo ? (
                                <>
                                  <div
                                    className="text-[10px] text-cyan-300/80 font-mono mt-1.5 leading-relaxed line-clamp-3"
                                    title={weeklyInfo.description}
                                  >
                                    {weeklyInfo.description}
                                  </div>
                                  {linkedTopics.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-1">
                                      {linkedTopics.map(t => (
                                        <span key={t!.id} className="text-[9px] font-mono bg-purple-500/15 text-purple-400 px-1 py-0.5 rounded truncate max-w-full" title={t!.name}>
                                          #{t!.number}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : cls.description ? (
                                <div className="text-[10px] text-slate-400 font-mono mt-1 truncate" title={cls.description}>
                                  {cls.description}
                                </div>
                              ) : null}
                              {cls.topicIds && cls.topicIds.length > 0 && !weeklyInfo && (
                                <div className="text-[10px] text-purple-400/60 font-mono mt-0.5">
                                  {cls.topicIds.length} теми
                                </div>
                              )}
                              {cls.startDate && !weeklyInfo && (
                                <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                                  от {new Date(cls.startDate).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
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
              Добави колоквиуми, контролни, Erasmus срещи и др.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(({ event, daysUntil, subject }) => {
              const config = ACADEMIC_EVENT_CONFIG[event.type];
              const isUrgent = daysUntil <= config.urgencyDays.high;
              const isSoon = daysUntil <= config.urgencyDays.medium;
              const isGeneral = !event.subjectId;

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
                          {isGeneral ? (
                            <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded text-[10px] font-mono">
                              Лично
                            </span>
                          ) : subject && (
                            <>
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: subject.color }}
                              />
                              <span className="text-xs text-slate-400 font-mono">
                                {subject.name}
                              </span>
                            </>
                          )}
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
                        {event.topicIds && event.topicIds.length > 0 && subject && (
                          <p className="text-xs text-purple-400/70 font-mono mt-1 truncate max-w-[300px]">
                            Теми: {event.topicIds
                              .map(id => subject.topics.find(t => t.id === id)?.name)
                              .filter(Boolean)
                              .join(', ') || '?'}
                          </p>
                        )}
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
                          title={e.subject.name}
                        >
                          {e.subject.name.length > 15 ? e.subject.name.slice(0, 15) + '...' : e.subject.name}
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
      {editingClass && <AddClassModal onClose={() => setEditingClass(null)} editClass={editingClass} />}
      {showAddEvent && <AddAcademicEventModal onClose={() => setShowAddEvent(false)} />}
      {showImportProgram && <ImportProgramModal onClose={() => setShowImportProgram(false)} />}
    </div>
  );
}
