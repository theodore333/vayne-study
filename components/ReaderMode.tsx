'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Minus, Plus, BookOpen, Highlighter, Trash2, ChevronUp, ChevronLeft, PanelRightClose, PanelRight, Type, MessageSquare, Check, Lightbulb, Loader2 } from 'lucide-react';
import { Topic, TextHighlight } from '@/lib/types';

interface ReaderModeProps {
  topic: Topic;
  subjectName?: string;
  onClose: () => void;
  onSaveHighlights: (highlights: TextHighlight[]) => void;
  onSaveEncodingCoach: (coach: string) => void;
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

const HIGHLIGHT_COLORS: { color: HighlightColor; bg: string; bgClass: string; name: string }[] = [
  { color: 'yellow', bg: '#fef08a', bgClass: 'bg-yellow-200', name: 'Жълто' },
  { color: 'green', bg: '#bbf7d0', bgClass: 'bg-green-200', name: 'Зелено' },
  { color: 'blue', bg: '#bfdbfe', bgClass: 'bg-blue-200', name: 'Синьо' },
  { color: 'pink', bg: '#fbcfe8', bgClass: 'bg-pink-200', name: 'Розово' },
];

function cleanMarkdown(text: string): string {
  return text
    .replace(/(?<!\*)\*(?!\*)/g, '')
    .replace(/(?<!^)#+(?!\s)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMarkdown(text: string): string {
  let html = cleanMarkdown(text);

  // Horizontal rules
  html = html.replace(/^-{3,}$/gm, '<hr class="my-6 border-stone-300" />');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code blocks (``` or lines with tree characters like |── ├── └──)
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-stone-100 p-4 rounded-lg overflow-x-auto font-mono text-sm my-4">$1</pre>');

  // Detect tree/diagram sections (lines with |, ├, └, ─)
  const lines = html.split('\n');
  let inTree = false;
  let treeContent: string[] = [];
  const processedLines: string[] = [];

  for (const line of lines) {
    const isTreeLine = /^[`\s]*[│├└─|┌┐┘┴┬┼╔╗╚╝═║]/.test(line) ||
                       /[│├└─|┌┐┘┴┬┼].*[│├└─|┌┐┘┴┬┼]/.test(line) ||
                       (inTree && /^\s+/.test(line) && line.trim().length > 0);

    if (isTreeLine && !inTree) {
      inTree = true;
      treeContent = [line];
    } else if (isTreeLine && inTree) {
      treeContent.push(line);
    } else if (!isTreeLine && inTree) {
      processedLines.push(`<pre class="bg-stone-50 p-4 rounded-lg overflow-x-auto font-mono text-sm my-4 whitespace-pre">${treeContent.join('\n')}</pre>`);
      inTree = false;
      treeContent = [];
      processedLines.push(line);
    } else {
      processedLines.push(line);
    }
  }

  if (inTree && treeContent.length > 0) {
    processedLines.push(`<pre class="bg-stone-50 p-4 rounded-lg overflow-x-auto font-mono text-sm my-4 whitespace-pre">${treeContent.join('\n')}</pre>`);
  }

  html = processedLines.join('\n');

  // Lists
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(\s*<(?:h[1-3]|pre|hr|ul|ol|li))/g, '$1');
  html = html.replace(/(<\/(?:h[1-3]|pre|hr|ul|ol|li)>\s*)<\/p>/g, '$1');

  return html;
}

export default function ReaderMode({ topic, subjectName, onClose, onSaveHighlights, onSaveEncodingCoach }: ReaderModeProps) {
  const [fontSize, setFontSize] = useState(18);
  const [highlights, setHighlights] = useState<TextHighlight[]>(topic.highlights || []);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [selectionInfo, setSelectionInfo] = useState<{ text: string; x: number; y: number } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [loadingTipId, setLoadingTipId] = useState<string | null>(null);
  const [encodingCoach, setEncodingCoach] = useState<string | null>(topic.encodingCoach || null);
  const [loadingCoach, setLoadingCoach] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle scroll progress
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const progress = scrollHeight > clientHeight
        ? (scrollTop / (scrollHeight - clientHeight)) * 100
        : 100;
      setScrollProgress(progress);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionInfo(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 3) {
      setSelectionInfo(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectionInfo({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  }, []);

  // Add highlight with current selected color
  const addHighlight = useCallback((color: HighlightColor) => {
    if (!selectionInfo) return;

    const material = cleanMarkdown(topic.material);
    const startOffset = material.indexOf(selectionInfo.text);

    if (startOffset === -1) return;

    const newHighlight: TextHighlight = {
      id: `hl-${Date.now()}`,
      text: selectionInfo.text,
      startOffset,
      endOffset: startOffset + selectionInfo.text.length,
      color,
      createdAt: new Date().toISOString()
    };

    const updatedHighlights = [...highlights, newHighlight];
    setHighlights(updatedHighlights);
    onSaveHighlights(updatedHighlights);

    setSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionInfo, highlights, topic.material, onSaveHighlights]);

  // Quick highlight with selected color from toolbar
  const quickHighlight = useCallback(() => {
    if (!selectionInfo) return;
    addHighlight(selectedColor);
  }, [selectionInfo, selectedColor, addHighlight]);

  // Remove highlight
  const removeHighlight = (id: string) => {
    const updatedHighlights = highlights.filter(h => h.id !== id);
    setHighlights(updatedHighlights);
    onSaveHighlights(updatedHighlights);
  };

  // Update highlight note
  const updateHighlightNote = (id: string, note: string) => {
    const updatedHighlights = highlights.map(h =>
      h.id === id ? { ...h, note: note.trim() || undefined } : h
    );
    setHighlights(updatedHighlights);
    onSaveHighlights(updatedHighlights);
  };

  // Start editing note
  const startEditingNote = (hl: TextHighlight) => {
    setEditingNoteId(hl.id);
    setNoteText(hl.note || '');
  };

  // Save note
  const saveNote = () => {
    if (editingNoteId) {
      updateHighlightNote(editingNoteId, noteText);
      setEditingNoteId(null);
      setNoteText('');
    }
  };

  // Fetch encoding tip from AI
  const fetchEncodingTip = async (hl: TextHighlight) => {
    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      alert('Добави API ключ в Settings');
      return;
    }

    setLoadingTipId(hl.id);

    try {
      const response = await fetch('/api/encoding-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: hl.text,
          context: topic.name,
          apiKey
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Грешка');
      }

      // Save the tip to the highlight
      const updatedHighlights = highlights.map(h =>
        h.id === hl.id ? { ...h, encodingTip: data.tip } : h
      );
      setHighlights(updatedHighlights);
      onSaveHighlights(updatedHighlights);
    } catch (error) {
      console.error('Error fetching encoding tip:', error);
      alert(error instanceof Error ? error.message : 'Грешка при генериране');
    } finally {
      setLoadingTipId(null);
    }
  };

  // Fetch encoding coach (one-time per topic)
  const fetchEncodingCoach = async () => {
    if (encodingCoach) {
      setShowCoach(true);
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      alert('Добави API ключ в Settings');
      return;
    }

    setLoadingCoach(true);

    try {
      const response = await fetch('/api/encoding-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material: topic.material,
          topicName: topic.name,
          subjectName,
          apiKey
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Грешка');
      }

      setEncodingCoach(data.strategy);
      onSaveEncodingCoach(data.strategy);
      setShowCoach(true);
    } catch (error) {
      console.error('Error fetching encoding coach:', error);
      alert(error instanceof Error ? error.message : 'Грешка при генериране');
    } finally {
      setLoadingCoach(false);
    }
  };

  // Render content with highlights
  const renderContent = () => {
    const cleanedMaterial = cleanMarkdown(topic.material);
    let html = parseMarkdown(cleanedMaterial);

    // Apply highlights by simple string replacement
    for (const hl of highlights) {
      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === hl.color);
      const bgColor = colorConfig?.bg || '#fef08a';

      // Simple replacement - find the text and wrap it
      // Use split/join to handle it safely
      const parts = html.split(hl.text);
      if (parts.length > 1) {
        html = parts[0] + `<span style="background-color: ${bgColor}; padding: 1px 4px; border-radius: 4px; box-decoration-break: clone;">${hl.text}</span>` + parts.slice(1).join(hl.text);
      }
    }

    return html;
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectionInfo) {
          setSelectionInfo(null);
          window.getSelection()?.removeAllRanges();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectionInfo]);

  const handleContentClick = () => {
    if (selectionInfo && window.getSelection()?.isCollapsed) {
      setSelectionInfo(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-100 flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-stone-300 z-50">
        <div className="h-full bg-amber-500 transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
      </div>

      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-stone-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors">
              <ChevronLeft size={20} />
              <span className="font-medium hidden sm:inline">Назад</span>
            </button>
            <div className="h-6 w-px bg-stone-300 hidden sm:block" />
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-stone-500" />
              <h1 className="font-semibold text-stone-800 truncate max-w-[200px] sm:max-w-[400px]">{topic.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Encoding Coach Button */}
            <button
              onClick={fetchEncodingCoach}
              disabled={loadingCoach}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                encodingCoach
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              } disabled:opacity-50`}
              title={encodingCoach ? 'Виж стратегията' : 'Получи стратегия за учене (1 път)'}
            >
              {loadingCoach ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Lightbulb size={16} />
              )}
              <span className="hidden sm:inline">
                {loadingCoach ? 'Мисля...' : encodingCoach ? 'Стратегия' : 'Как да уча?'}
              </span>
            </button>

            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title={showSidebar ? 'Скрий панела' : 'Покажи панела'}
            >
              {showSidebar ? <PanelRightClose size={20} /> : <PanelRight size={20} />}
            </button>
            <button onClick={onClose} className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors" title="Затвори (Esc)">
              <X size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main layout: Left toolbar + Content + Right sidebar */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT TOOLBAR - Formatting & Highlighting */}
        <aside className="w-16 flex-shrink-0 bg-white border-r border-stone-200 flex flex-col items-center py-4 gap-2">
          {/* Font size */}
          <div className="flex flex-col items-center gap-1 pb-3 border-b border-stone-200 w-full">
            <Type size={16} className="text-stone-400 mb-1" />
            <button
              onClick={() => setFontSize(Math.min(28, fontSize + 2))}
              className="w-10 h-8 flex items-center justify-center text-stone-600 hover:bg-stone-100 rounded transition-colors"
            >
              <Plus size={14} />
            </button>
            <span className="text-xs text-stone-500 font-mono">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.max(14, fontSize - 2))}
              className="w-10 h-8 flex items-center justify-center text-stone-600 hover:bg-stone-100 rounded transition-colors"
            >
              <Minus size={14} />
            </button>
          </div>

          {/* Highlight colors - using inline styles to prevent Tailwind purge */}
          <div className="flex flex-col items-center gap-2 py-3 border-b border-stone-200 w-full">
            <Highlighter size={16} className="text-stone-400 mb-1" />
            {HIGHLIGHT_COLORS.map(({ color, bg }) => (
              <button
                key={color}
                onClick={() => {
                  setSelectedColor(color);
                  if (selectionInfo) addHighlight(color);
                }}
                style={{ backgroundColor: bg }}
                className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 ${
                  selectedColor === color ? 'border-stone-600 ring-2 ring-stone-400' : 'border-stone-300'
                }`}
                title={`Маркирай ${color}`}
              />
            ))}
          </div>

          {/* Highlight count - no delete all button, delete individual from sidebar */}
          {highlights.length > 0 && (
            <div className="flex flex-col items-center py-2">
              <span className="text-xs text-stone-400">{highlights.length}</span>
              <span className="text-[10px] text-stone-300">маркирани</span>
            </div>
          )}
        </aside>

        {/* CENTER - Content area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: '#fafaf9' }}
        >
          <article
            ref={contentRef}
            className="max-w-4xl mx-auto px-8 sm:px-16 py-8"
            onMouseUp={handleMouseUp}
            onClick={handleContentClick}
          >
            {topic.materialImages && topic.materialImages.length > 0 && (
              <div className="mb-8 space-y-4">
                {topic.materialImages.map((img, idx) => (
                  <img key={idx} src={img} alt={`Изображение ${idx + 1}`} className="max-w-full rounded-lg shadow-md" />
                ))}
              </div>
            )}

            <div
              className="max-w-none text-stone-800 selection:bg-amber-200
                [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-stone-900 [&_h1]:mb-6 [&_h1]:mt-8
                [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_h2]:mb-4 [&_h2]:mt-6
                [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-stone-900 [&_h3]:mb-3 [&_h3]:mt-4
                [&_p]:text-stone-700 [&_p]:leading-relaxed [&_p]:mb-4
                [&_strong]:text-stone-900 [&_strong]:font-semibold
                [&_em]:italic
                [&_li]:text-stone-700 [&_li]:mb-1 [&_li]:ml-4
                [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-4
                [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-4
                [&_.highlight-text]:text-stone-900"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.8, color: '#292524' }}
              dangerouslySetInnerHTML={{ __html: renderContent() }}
            />
          </article>
        </div>

        {/* RIGHT SIDEBAR - Highlights list & Notes */}
        {showSidebar && (
          <aside className="w-80 flex-shrink-0 bg-white border-l border-stone-200 flex flex-col overflow-hidden">
            {/* Highlights Section */}
            <div className="border-b border-stone-200">
              <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">
                <h3 className="text-sm font-medium text-stone-700 flex items-center gap-2">
                  <Highlighter size={14} />
                  Маркирани ({highlights.length})
                </h3>
              </div>
              <div className="max-h-[40vh] overflow-y-auto p-3">
                {highlights.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-4">
                    Селектирай текст и избери цвят отляво
                  </p>
                ) : (
                  <div className="space-y-3">
                    {highlights.map(hl => {
                      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === hl.color);
                      const bgColor = colorConfig?.bg || '#fef08a';
                      const isEditing = editingNoteId === hl.id;

                      return (
                        <div
                          key={hl.id}
                          className="rounded-lg border border-stone-200 hover:border-stone-300 transition-colors overflow-hidden"
                          style={{ backgroundColor: bgColor + '20' }}
                        >
                          {/* Highlight text */}
                          <div className="flex items-start gap-2 p-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                              style={{ backgroundColor: bgColor }}
                            />
                            <p className="text-sm text-stone-700 line-clamp-2 flex-1">"{hl.text}"</p>
                            <button
                              onClick={() => removeHighlight(hl.id)}
                              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-stone-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {/* Note & Tip section */}
                          <div className="px-2 pb-2 space-y-1.5">
                            {/* Note */}
                            {isEditing ? (
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={noteText}
                                  onChange={(e) => setNoteText(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && saveNote()}
                                  placeholder="Добави бележка..."
                                  className="flex-1 px-2 py-1 text-sm bg-white border border-stone-300 rounded focus:outline-none focus:border-amber-500"
                                  autoFocus
                                />
                                <button
                                  onClick={saveNote}
                                  className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => { setEditingNoteId(null); setNoteText(''); }}
                                  className="px-2 py-1 bg-stone-200 hover:bg-stone-300 text-stone-600 rounded transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : hl.note ? (
                              <button
                                onClick={() => startEditingNote(hl)}
                                className="w-full text-left px-2 py-1 text-xs text-stone-600 bg-white/50 rounded border border-stone-200 hover:border-stone-300 transition-colors"
                              >
                                <span className="flex items-center gap-1">
                                  <MessageSquare size={10} />
                                  {hl.note}
                                </span>
                              </button>
                            ) : (
                              <button
                                onClick={() => startEditingNote(hl)}
                                className="w-full text-left px-2 py-1 text-xs text-stone-400 hover:text-stone-600 bg-white/30 hover:bg-white/50 rounded border border-dashed border-stone-300 transition-colors"
                              >
                                <span className="flex items-center gap-1">
                                  <MessageSquare size={10} />
                                  Бележка...
                                </span>
                              </button>
                            )}

                            {/* Encoding Tip */}
                            {hl.encodingTip ? (
                              <div className="px-2 py-1.5 text-xs bg-purple-50 border border-purple-200 rounded">
                                <div className="flex items-center gap-1 text-purple-600 font-medium mb-1">
                                  <Lightbulb size={10} />
                                  Как да запомня:
                                </div>
                                <p className="text-purple-800">{hl.encodingTip}</p>
                              </div>
                            ) : (
                              <button
                                onClick={() => fetchEncodingTip(hl)}
                                disabled={loadingTipId === hl.id}
                                className="w-full text-left px-2 py-1 text-xs text-purple-500 hover:text-purple-700 bg-purple-50/50 hover:bg-purple-50 rounded border border-dashed border-purple-300 transition-colors disabled:opacity-50"
                              >
                                <span className="flex items-center gap-1">
                                  {loadingTipId === hl.id ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin" />
                                      Генерирам...
                                    </>
                                  ) : (
                                    <>
                                      <Lightbulb size={10} />
                                      AI съвет за запомняне
                                    </>
                                  )}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Tip */}
            {highlights.length > 0 && (
              <div className="p-3 border-t border-stone-200">
                <p className="text-xs text-stone-400 text-center">
                  💡 Кликни на highlight за да добавиш бележка
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Floating toolbar on selection */}
      {selectionInfo && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-stone-200 px-3 py-2 flex items-center gap-2"
          style={{
            left: `${Math.max(100, Math.min(selectionInfo.x, window.innerWidth - 200))}px`,
            top: `${Math.max(60, selectionInfo.y - 50)}px`,
            transform: 'translateX(-50%)'
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-xs text-stone-500 mr-1">Маркирай:</span>
          {HIGHLIGHT_COLORS.map(({ color, bg, name }) => (
            <button
              key={color}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addHighlight(color)}
              style={{ backgroundColor: bg }}
              className={`w-7 h-7 rounded hover:scale-110 transition-transform border ${
                selectedColor === color ? 'border-stone-600' : 'border-stone-300'
              }`}
              title={name}
            />
          ))}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setSelectionInfo(null); window.getSelection()?.removeAllRanges(); }}
            className="ml-1 p-1 text-stone-400 hover:text-stone-600"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scroll to top */}
      {scrollProgress > 20 && (
        <button
          onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 bg-white rounded-full shadow-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:scale-110 transition-all z-40"
        >
          <ChevronUp size={24} />
        </button>
      )}

      {/* Encoding Coach Modal */}
      {showCoach && encodingCoach && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowCoach(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-purple-600 to-emerald-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Lightbulb size={24} />
                  <h2 className="text-lg font-bold">Как да уча тази тема?</h2>
                </div>
                <button
                  onClick={() => setShowCoach(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">{topic.name}</p>
            </div>
            <div className="p-6">
              <div className="prose prose-sm max-w-none text-stone-700 whitespace-pre-wrap">
                {encodingCoach}
              </div>
              <div className="mt-4 pt-4 border-t border-stone-200">
                <p className="text-xs text-stone-400 text-center">
                  💡 Този съвет е генериран веднъж за темата
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
