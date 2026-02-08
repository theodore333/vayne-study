'use client';

import { useState, useMemo } from 'react';
import { BarChart3, BookOpen, Calendar, Clock, List, GraduationCap, FileText } from 'lucide-react';
import { TimerSession, Subject, StudyGoals, AcademicPeriod } from '@/lib/types';
import { getStudyTimeByDayAndSubject, getSessionsGroupedByDay } from '@/lib/analytics';

type StatsPeriod = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'last30';
type ViewMode = 'summary' | 'detailed';

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['ян.', 'февр.', 'март', 'апр.', 'май', 'юни', 'юли', 'авг.', 'септ.', 'окт.', 'ноемв.', 'дек.'];
const DAY_OF_WEEK_NAMES = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];

interface StatsTabProps {
  timerSessions: TimerSession[];
  subjects: Subject[];
  studyGoals: StudyGoals;
  academicPeriod: AcademicPeriod;
}

function getSubjectDisplay(subjectId: string, subjects: Subject[]) {
  const subject = subjects.find(s => s.id === subjectId);
  if (subject) return { name: subject.name, color: subject.color || '#8b5cf6' };
  switch (subjectId) {
    case 'general': return { name: 'Общо учене', color: '#6366f1' };
    case 'manual': return { name: 'Ръчно добавено', color: '#22c55e' };
    case 'pomodoro': return { name: 'Pomodoro', color: '#06b6d4' };
    default: return { name: 'Неизвестен', color: '#666' };
  }
}

function formatMinutes(mins: number) {
  let h = Math.floor(mins / 60);
  let m = Math.round(mins % 60);
  if (m === 60) { h++; m = 0; }
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

function formatTimeRange(startTime: string, endTime: string | null) {
  const start = new Date(startTime);
  const sh = start.getHours().toString().padStart(2, '0');
  const sm = start.getMinutes().toString().padStart(2, '0');
  if (!endTime) return `${sh}:${sm} -`;
  const end = new Date(endTime);
  const eh = end.getHours().toString().padStart(2, '0');
  const em = end.getMinutes().toString().padStart(2, '0');
  return `${sh}:${sm} - ${eh}:${em}`;
}

export default function StatsTab({ timerSessions, subjects, studyGoals, academicPeriod }: StatsTabProps) {
  const [period, setPeriod] = useState<StatsPeriod>('thisWeek');
  const [viewMode, setViewMode] = useState<ViewMode>('summary');

  const completedSessions = useMemo(() =>
    timerSessions.filter(s => s.endTime !== null),
    [timerSessions]
  );

  const periodDates = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    switch (period) {
      case 'thisWeek': {
        const start = new Date(now);
        start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        return { start: start.toISOString().split('T')[0], end: todayStr };
      }
      case 'lastWeek': {
        const thisMonday = new Date(now);
        thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const end = new Date(thisMonday);
        end.setDate(end.getDate() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
      }
      case 'thisMonth': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: start.toISOString().split('T')[0], end: todayStr };
      }
      case 'last30': {
        const start = new Date(now);
        start.setDate(now.getDate() - 29);
        return { start: start.toISOString().split('T')[0], end: todayStr };
      }
    }
  }, [period]);

  const dailyData = useMemo(() =>
    getStudyTimeByDayAndSubject(completedSessions, periodDates.start, periodDates.end),
    [completedSessions, periodDates]
  );

  const dayGroups = useMemo(() =>
    getSessionsGroupedByDay(completedSessions, periodDates.start, periodDates.end),
    [completedSessions, periodDates]
  );

  // Aggregate stats for period
  const periodStats = useMemo(() => {
    const totalMinutes = dailyData.reduce((sum, d) => sum + d.totalMinutes, 0);
    const daysInPeriod = dailyData.length || 1;
    const daysWithData = dailyData.filter(d => d.totalMinutes > 0).length;
    const totalSessions = dayGroups.reduce((sum, g) => sum + g.sessions.length, 0);

    // By subject aggregate
    const bySubject: Record<string, number> = {};
    for (const day of dailyData) {
      for (const [sid, mins] of Object.entries(day.bySubject)) {
        bySubject[sid] = (bySubject[sid] || 0) + mins;
      }
    }

    return { totalMinutes, daysInPeriod, daysWithData, totalSessions, bySubject };
  }, [dailyData, dayGroups]);

  // All unique subject IDs in the period for consistent color ordering
  const subjectOrder = useMemo(() =>
    Object.entries(periodStats.bySubject)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id),
    [periodStats.bySubject]
  );

  // Semester/session stats (always from full sessions data)
  const academicStats = useMemo(() => {
    const now = new Date();
    let semesterMinutes = 0, semesterDays = 0;
    let sessionMinutes = 0, sessionDays = 0, isInSession = false;

    if (academicPeriod.semesterStart && academicPeriod.semesterEnd) {
      const semStart = new Date(academicPeriod.semesterStart);
      const semEnd = new Date(academicPeriod.semesterEnd);
      semesterDays = Math.ceil((Math.min(now.getTime(), semEnd.getTime()) - semStart.getTime()) / 86400000);
      semesterMinutes = completedSessions
        .filter(s => { const d = new Date(s.startTime); return d >= semStart && d <= semEnd; })
        .reduce((sum, s) => sum + s.duration, 0);
    }

    if (academicPeriod.sessionStart && academicPeriod.sessionEnd) {
      const sessStart = new Date(academicPeriod.sessionStart);
      const sessEnd = new Date(academicPeriod.sessionEnd);
      isInSession = now >= sessStart && now <= sessEnd;
      sessionDays = Math.ceil((Math.min(now.getTime(), sessEnd.getTime()) - sessStart.getTime()) / 86400000);
      sessionMinutes = completedSessions
        .filter(s => { const d = new Date(s.startTime); return d >= sessStart && d <= sessEnd; })
        .reduce((sum, s) => sum + s.duration, 0);
    }

    return { semesterMinutes, semesterDays, sessionMinutes, sessionDays, isInSession };
  }, [completedSessions, academicPeriod]);

  // Bar chart max
  const maxDayMinutes = Math.max(...dailyData.map(d => d.totalMinutes), studyGoals.dailyMinutes ?? 1, 1);

  const periods: { key: StatsPeriod; label: string }[] = [
    { key: 'thisWeek', label: 'Тази седмица' },
    { key: 'lastWeek', label: 'Миналата' },
    { key: 'thisMonth', label: 'Този месец' },
    { key: 'last30', label: '30 дни' },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-1.5 bg-slate-800/30 p-1 rounded-lg w-fit">
        {periods.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
              period === p.key
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-cyan-400" />
            <span className="text-xs text-slate-400 font-mono">Общо време</span>
          </div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">{formatMinutes(periodStats.totalMinutes)}</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-blue-400" />
            <span className="text-xs text-slate-400 font-mono">Средно/ден</span>
          </div>
          <div className="text-2xl font-bold text-blue-400 font-mono">
            {formatMinutes(Math.round(periodStats.totalMinutes / periodStats.daysInPeriod))}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">{periodStats.daysWithData}/{periodStats.daysInPeriod} дни с учене</div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-violet-400" />
            <span className="text-xs text-slate-400 font-mono">Сесии</span>
          </div>
          <div className="text-2xl font-bold text-violet-400 font-mono">{periodStats.totalSessions}</div>
        </div>
      </div>

      {/* Academic Period Cards */}
      {(academicPeriod.semesterStart || academicPeriod.sessionStart) && (
        <div className="grid grid-cols-2 gap-4">
          {academicPeriod.semesterStart && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap size={16} className="text-purple-400" />
                <span className="text-xs text-slate-400 font-mono">Семестър</span>
              </div>
              <div className="text-xl font-bold text-purple-400 font-mono">{formatMinutes(academicStats.semesterMinutes)}</div>
              <div className="text-[10px] text-slate-500 font-mono">
                {academicStats.semesterDays > 0 && `~${Math.round(academicStats.semesterMinutes / academicStats.semesterDays)}м/ден`}
              </div>
            </div>
          )}
          {academicPeriod.sessionStart && (
            <div className={`bg-slate-800/30 border rounded-xl p-4 ${academicStats.isInSession ? 'border-orange-500/50' : 'border-slate-700/50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className={academicStats.isInSession ? 'text-orange-400' : 'text-slate-400'} />
                <span className="text-xs text-slate-400 font-mono">Сесия {academicStats.isInSession && '(активна)'}</span>
              </div>
              <div className={`text-xl font-bold font-mono ${academicStats.isInSession ? 'text-orange-400' : 'text-slate-400'}`}>
                {formatMinutes(academicStats.sessionMinutes)}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {academicStats.sessionDays > 0 && `~${Math.round(academicStats.sessionMinutes / Math.max(1, academicStats.sessionDays))}м/ден`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Daily Bar Chart */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 font-mono flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-blue-400" />
          Дневно разпределение
        </h3>
        <div className="flex items-end gap-[3px] h-36">
          {dailyData.map((day) => {
            const date = new Date(day.date);
            const isToday = day.date === new Date().toISOString().split('T')[0];
            const segments = subjectOrder
              .filter(sid => day.bySubject[sid])
              .map(sid => ({
                sid,
                mins: day.bySubject[sid],
                pct: (day.bySubject[sid] / maxDayMinutes) * 100
              }));
            const totalPct = (day.totalMinutes / maxDayMinutes) * 100;
            const showLabel = dailyData.length <= 14;

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 group relative min-w-0">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-20 pointer-events-none">
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 shadow-lg whitespace-nowrap text-[10px] font-mono">
                    <div className="text-slate-200 font-bold mb-1">{date.getDate()} {MONTH_NAMES[date.getMonth()]} ({DAY_OF_WEEK_NAMES[date.getDay()]})</div>
                    {day.totalMinutes > 0 ? (
                      <>
                        <div className="text-cyan-400">{formatMinutes(day.totalMinutes)}</div>
                        {segments.map(seg => {
                          const disp = getSubjectDisplay(seg.sid, subjects);
                          return (
                            <div key={seg.sid} className="flex items-center gap-1 mt-0.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: disp.color }} />
                              <span className="text-slate-400">{disp.name}: {formatMinutes(seg.mins)}</span>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div className="text-slate-500">Без учене</div>
                    )}
                  </div>
                </div>

                {/* Bar */}
                <div className="relative w-full flex-1 flex items-end">
                  {/* Goal line */}
                  {studyGoals.dailyMinutes > 0 && (
                    <div
                      className="absolute w-full border-t border-dashed border-slate-600 z-10"
                      style={{ bottom: `${Math.min(100, (studyGoals.dailyMinutes / maxDayMinutes) * 100)}%` }}
                    />
                  )}
                  {/* Stacked segments */}
                  <div className="w-full flex flex-col-reverse" style={{ height: `${Math.max(totalPct, day.totalMinutes > 0 ? 4 : 0)}%` }}>
                    {segments.map(seg => {
                      const disp = getSubjectDisplay(seg.sid, subjects);
                      const segHeight = totalPct > 0 ? (seg.pct / totalPct) * 100 : 0;
                      return (
                        <div
                          key={seg.sid}
                          className="w-full first:rounded-t"
                          style={{ height: `${segHeight}%`, backgroundColor: disp.color, opacity: isToday ? 1 : 0.75 }}
                        />
                      );
                    })}
                  </div>
                  {day.totalMinutes === 0 && (
                    <div className="w-full h-[2px] bg-slate-800 rounded" />
                  )}
                </div>

                {/* Day label */}
                {showLabel && (
                  <span className={`text-[10px] font-mono truncate ${isToday ? 'text-blue-400 font-semibold' : 'text-slate-500'}`}>
                    {DAY_NAMES[date.getDay()]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] font-mono text-slate-500">
          {subjectOrder.slice(0, 6).map(sid => {
            const disp = getSubjectDisplay(sid, subjects);
            return (
              <span key={sid} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: disp.color }} />
                {disp.name}
              </span>
            );
          })}
          {subjectOrder.length > 6 && <span className="text-slate-600">+{subjectOrder.length - 6} други</span>}
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-3 h-0.5 border-t border-dashed border-slate-500" /> Дневна цел
          </span>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1.5 bg-slate-800/30 p-1 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('summary')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
            viewMode === 'summary'
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 size={12} /> Обобщение
        </button>
        <button
          onClick={() => setViewMode('detailed')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
            viewMode === 'detailed'
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <List size={12} /> Детайли
        </button>
      </div>

      {/* Summary View: By Subject */}
      {viewMode === 'summary' && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4 flex items-center gap-2">
            <BookOpen size={18} className="text-slate-400" />
            По предмети
          </h3>
          <div className="space-y-3">
            {subjectOrder.map(sid => {
              const mins = periodStats.bySubject[sid];
              const disp = getSubjectDisplay(sid, subjects);
              const pct = periodStats.totalMinutes > 0 ? (mins / periodStats.totalMinutes) * 100 : 0;
              return (
                <div key={sid}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: disp.color }} />
                      <span className="text-sm text-slate-300 font-mono">{disp.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400 font-mono">{formatMinutes(mins)}</span>
                      <span className="text-xs text-slate-500 font-mono w-10 text-right">{Math.round(pct)}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: disp.color }} />
                  </div>
                </div>
              );
            })}
            {subjectOrder.length === 0 && (
              <p className="text-slate-500 font-mono text-sm text-center py-4">Няма данни за този период</p>
            )}
          </div>
        </div>
      )}

      {/* Detailed View: Sessions by Day */}
      {viewMode === 'detailed' && (
        <div className="space-y-3">
          {dayGroups.length === 0 && (
            <p className="text-slate-500 font-mono text-sm text-center py-8">Няма сесии за този период</p>
          )}
          {dayGroups.map(group => {
            const date = new Date(group.date);
            const dayName = DAY_OF_WEEK_NAMES[date.getDay()];
            return (
              <div key={group.date} className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/30">
                  <span className="text-sm text-slate-200 font-mono">
                    {date.getDate()} {MONTH_NAMES[date.getMonth()]} ({dayName})
                  </span>
                  <span className="text-sm text-cyan-400 font-mono font-bold">{formatMinutes(group.totalMinutes)}</span>
                </div>
                {/* Sessions */}
                <div className="divide-y divide-slate-700/30">
                  {group.sessions.map(session => {
                    const disp = getSubjectDisplay(session.subjectId, subjects);
                    return (
                      <div key={session.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: disp.color }} />
                        <span className="text-sm text-slate-300 font-mono flex-1 truncate">{disp.name}</span>
                        {session.distractionNote && (
                          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                            {session.distractionNote}
                          </span>
                        )}
                        <span className="text-sm text-slate-400 font-mono shrink-0">{formatMinutes(session.duration)}</span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {formatTimeRange(session.startTime, session.endTime)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Distractions Log */}
      {(() => {
        const distractions = completedSessions
          .filter(s => s.distractionNote && s.distractionNote.trim())
          .slice(-20)
          .reverse();
        if (distractions.length === 0) return null;
        return (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-slate-100 font-mono mb-4">
              Разсейвания
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {distractions.map(s => (
                <div key={s.id} className="p-3 bg-slate-800/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(s.startTime).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{s.duration}м</span>
                  </div>
                  <p className="text-sm text-slate-300 font-mono">{s.distractionNote}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
