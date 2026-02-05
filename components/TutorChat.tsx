'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, RotateCcw, BookOpen, Target, Link2, Stethoscope,
  Loader2, DollarSign, X
} from 'lucide-react';
import { Topic } from '@/lib/types';
import { useApp } from '@/lib/context';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';

type TutorMode = 'explain' | 'test' | 'connect' | 'clinical';

interface TutorMessage {
  id: string;
  role: 'user' | 'tutor';
  content: string;
}

interface TutorChatProps {
  topic: Topic;
  subjectName: string;
  subjectTopics?: string[];
  onClose: () => void;
}

const MODES: { mode: TutorMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { mode: 'explain', label: 'Обясни ми', desc: 'Провери разбирането си', icon: <BookOpen size={14} /> },
  { mode: 'test', label: 'Провери ме', desc: 'AI търси пропуски', icon: <Target size={14} /> },
  { mode: 'connect', label: 'Свържи', desc: 'Свържи две концепции', icon: <Link2 size={14} /> },
  { mode: 'clinical', label: 'Случай', desc: 'Клиничен сценарий', icon: <Stethoscope size={14} /> },
];

export default function TutorChat({ topic, subjectName, subjectTopics, onClose }: TutorChatProps) {
  const { incrementApiCalls } = useApp();
  const [selectedMode, setSelectedMode] = useState<TutorMode | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('claude-api-key') : null;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const callTutorApi = useCallback(async (
    mode: TutorMode,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage?: string
  ) => {
    if (!apiKey) {
      setError('Няма API ключ. Добави го в Настройки.');
      return null;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const response = await fetchWithTimeout('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        mode,
        topicName: topic.name,
        subjectName,
        material: topic.material || '',
        topicsList: subjectTopics,
        conversationHistory,
        userMessage,
      }),
      signal: abortControllerRef.current.signal,
      timeout: 60000,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Грешка' }));
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return response.json();
  }, [apiKey, topic.name, topic.material, subjectName, subjectTopics]);

  const startSession = useCallback(async (mode: TutorMode) => {
    setSelectedMode(mode);
    setSessionActive(true);
    setMessages([]);
    setError(null);
    setIsTyping(true);

    try {
      const data = await callTutorApi(mode, []);

      if (data?.response) {
        setMessages([{
          id: Date.now().toString(),
          role: 'tutor',
          content: data.response,
        }]);
        setTotalCost(prev => prev + (data.usage?.cost || 0));
        if (data.usage?.cost) incrementApiCalls(data.usage.cost);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(getFetchErrorMessage(err));
    } finally {
      setIsTyping(false);
    }
  }, [callTutorApi, incrementApiCalls]);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !selectedMode || isTyping) return;

    const userMsg: TutorMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setError(null);
    setIsTyping(true);

    // Build conversation history for API
    const history = messages.map(m => ({
      role: (m.role === 'tutor' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const data = await callTutorApi(selectedMode, history, userMsg.content);

      if (data?.response) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'tutor',
          content: data.response,
        }]);
        setTotalCost(prev => prev + (data.usage?.cost || 0));
        if (data.usage?.cost) incrementApiCalls(data.usage.cost);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(getFetchErrorMessage(err));
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }, [inputValue, selectedMode, isTyping, messages, callTutorApi, incrementApiCalls]);

  const resetSession = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setSelectedMode(null);
    setSessionActive(false);
    setError(null);
    setIsTyping(false);
    setTotalCost(0);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Turn count warning
  const turnCount = messages.filter(m => m.role === 'user').length;

  // Mode selection view
  if (!sessionActive) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-purple-300">AI Тютор</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Topic info */}
          <div className="text-xs text-slate-400 mb-2">
            <span className="text-slate-300">{subjectName}</span> &rarr; {topic.name}
          </div>

          {!apiKey && (
            <div className="p-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300">
              Няма API ключ. Добави го в Настройки.
            </div>
          )}

          {/* Mode buttons */}
          <p className="text-xs text-slate-500">Избери режим:</p>
          {MODES.map(({ mode, label, desc, icon }) => (
            <button
              key={mode}
              onClick={() => startSession(mode)}
              disabled={!apiKey || !topic.material}
              className="w-full flex items-center gap-3 p-3 bg-slate-800/60 hover:bg-purple-900/30
                border border-slate-700/50 hover:border-purple-600/50 rounded-lg
                text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="p-1.5 bg-purple-900/40 rounded text-purple-400 group-hover:text-purple-300">
                {icon}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-200">{label}</div>
                <div className="text-xs text-slate-500">{desc}</div>
              </div>
            </button>
          ))}

          {!topic.material && (
            <p className="text-xs text-amber-400/80 mt-2">
              Тази тема няма материал. Добави материал за да използваш тютора.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-purple-300 truncate">
            {MODES.find(m => m.mode === selectedMode)?.label}
          </h3>
          {totalCost > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500 flex-shrink-0">
              <DollarSign size={10} />
              {totalCost.toFixed(4)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={resetSession}
            className="p-1 text-slate-400 hover:text-purple-300 rounded"
            title="Нова сесия"
          >
            <RotateCcw size={14} />
          </button>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Turn count warning */}
      {turnCount >= 18 && (
        <div className="px-3 py-1.5 bg-amber-900/20 border-b border-amber-800/30 text-xs text-amber-400">
          {turnCount}/20 хода. Обмисли нова сесия за по-ниска цена.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/80 border border-slate-700/50 text-slate-200'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-slate-700/50">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напиши отговор..."
            rows={2}
            className="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg
              text-sm text-slate-200 placeholder-slate-500 resize-none
              focus:outline-none focus:border-purple-600/50"
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="px-3 self-end bg-purple-600 hover:bg-purple-500 disabled:opacity-40
              disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
