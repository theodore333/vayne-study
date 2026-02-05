'use client';

import { BookOpen, ArrowRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { Subject, Topic } from '@/lib/types';

interface LastOpenedTopic {
  subjectId: string;
  topicId: string;
  timestamp: string;
}

interface ContinueStudyWidgetProps {
  lastOpenedTopic: LastOpenedTopic | null;
  subjects: Subject[];
}

export default function ContinueStudyWidget({ lastOpenedTopic, subjects }: ContinueStudyWidgetProps) {
  if (!lastOpenedTopic) {
    return null;
  }

  const subject = subjects.find(s => s.id === lastOpenedTopic.subjectId);
  if (!subject || subject.archived || subject.deletedAt) {
    return null;
  }

  const topic = subject.topics.find(t => t.id === lastOpenedTopic.topicId);
  if (!topic) {
    return null;
  }

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `преди ${days}д`;
    if (hours > 0) return `преди ${hours}ч`;
    if (minutes > 0) return `преди ${minutes}мин`;
    return 'току-що';
  };

  const statusColors = {
    gray: 'text-slate-400',
    orange: 'text-orange-400',
    yellow: 'text-yellow-400',
    green: 'text-green-400'
  };

  return (
    <Link
      href={`/subjects/${subject.id}/topics/${topic.id}`}
      className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl hover:border-purple-500/50 transition-all group"
    >
      <div className="p-3 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
        <BookOpen size={24} className="text-purple-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-purple-400 font-mono uppercase tracking-wider">
            Продължи оттук
          </span>
          <Clock size={12} className="text-slate-500" />
          <span className="text-xs text-slate-500 font-mono">
            {formatTimeAgo(lastOpenedTopic.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: subject.color }}
          />
          <span className="text-sm font-semibold text-slate-200 truncate">
            {topic.name}
          </span>
          <span className={`text-xs ${statusColors[topic.status]}`}>
            ({topic.status === 'gray' ? 'Незапочната' :
              topic.status === 'orange' ? 'Слаба' :
              topic.status === 'yellow' ? 'Научена' : 'Солидна'})
          </span>
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {subject.name}
        </span>
      </div>

      <ArrowRight size={20} className="text-purple-400 group-hover:translate-x-1 transition-transform" />
    </Link>
  );
}
