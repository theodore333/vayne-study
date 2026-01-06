'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/context';
import { DAYS, DAYS_SHORT, CLASS_TYPES } from '@/lib/constants';
import AddClassModal from '@/components/modals/AddClassModal';

export default function SchedulePage() {
  const { data, isLoading, deleteClass } = useApp();
  const [showAddClass, setShowAddClass] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

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

      {showAddClass && <AddClassModal onClose={() => setShowAddClass(false)} defaultDay={selectedDay} />}
    </div>
  );
}