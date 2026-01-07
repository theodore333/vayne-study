'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Minus, Plus, BookOpen, Highlighter, Trash2, ChevronUp, ChevronLeft, PanelRightClose, PanelRight, Type } from 'lucide-react';
import { Topic, TextHighlight } from '@/lib/types';

interface ReaderModeProps {
  topic: Topic;
  onClose: () => void;
  onSaveHighlights: (highlights: TextHighlight[]) => void;
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

const HIGHLIGHT_COLORS: { color: HighlightColor; bg: string; bgClass: string; name: string }[] = [
  { color: 'yellow', bg: '#fef08a', bgClass: 'bg-yellow-200', name: 'Жълто' },
  { color: 'green', bg: '#bbf7d0', bgClass: 'bg-green-200', name: 'Зелено' },
  { color: 'blue', bg: '#bfdbfe', bgClass: 'bg-blue-200', name: 'Синьо' },
  { color: 'pink', bg: '#fbcfe8', bgClass: 'bg-pink-200', name: 'Розово' },
];

// Clean markdown artifacts from text
function cleanMarkdown(text: string): string {
  return text
    .replace(/(?<!\*)\*(?!\*)/g, '')
    .replace(/(?<!^)#+(?!\s)/gm, '')
    .replace(/  +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Parse markdown to HTML-like structure for rendering
function parseMarkdown(text: string): string {
  let html = cleanMarkdown(text);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

export default function ReaderMode({ topic, onClose, onSaveHighlights }: ReaderModeProps) {
  const [fontSize, setFontSize] = useState(18);
  const [highlights, setHighlights] = useState<TextHighlight[]>(topic.highlights || []);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [selectionInfo, setSelectionInfo] = useState<{ text: string; x: number; y: number } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<'highlights' | 'notes'>('highlights');
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

  // Handle text selection - show floating toolbar
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
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

    // Get position for floating toolbar
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelectionInfo({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  }, []);

  // Add highlight
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

  // Remove highlight
  const removeHighlight = (id: string) => {
    const updatedHighlights = highlights.filter(h => h.id !== id);
    setHighlights(updatedHighlights);
    onSaveHighlights(updatedHighlights);
  };

  // Render content with highlights
  const renderContent = () => {
    let content = cleanMarkdown(topic.material);

    // Sort highlights by startOffset descending to apply from end to start
    const sortedHighlights = [...highlights].sort((a, b) => b.startOffset - a.startOffset);

    // Apply highlights
    for (const hl of sortedHighlights) {
      const before = content.slice(0, hl.startOffset);
      const highlighted = content.slice(hl.startOffset, hl.endOffset);
      const after = content.slice(hl.endOffset);

      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === hl.color);
      const bgColor = colorConfig?.bg || '#fef08a';
      content = `${before}<mark style="background-color: ${bgColor}; padding: 0 2px; border-radius: 2px;">${highlighted}</mark>${after}`;
    }

    return parseMarkdown(content);
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

  // Close selection toolbar when clicking outside
  const handleContentClick = () => {
    if (selectionInfo && window.getSelection()?.isCollapsed) {
      setSelectionInfo(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-100 flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-stone-300 z-50">
        <div
          className="h-full bg-amber-500 transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-stone-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="font-medium hidden sm:inline">Назад</span>
            </button>
            <div className="h-6 w-px bg-stone-300 hidden sm:block" />
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-stone-500" />
              <h1 className="font-semibold text-stone-800 truncate max-w-[200px] sm:max-w-[400px]">
                {topic.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Font size controls */}
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg px-2 py-1">
              <Type size={14} className="text-stone-500" />
              <button
                onClick={() => setFontSize(Math.max(14, fontSize - 2))}
                className="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm text-stone-600 min-w-[32px] text-center font-mono">
                {fontSize}
              </span>
              <button
                onClick={() => setFontSize(Math.min(28, fontSize + 2))}
                className="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Sidebar toggle */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title={showSidebar ? 'Скрий панела' : 'Покажи панела'}
            >
              {showSidebar ? <PanelRightClose size={20} /> : <PanelRight size={20} />}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Затвори (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: '#fafaf9' }}
        >
          <article
            ref={contentRef}
            className={`mx-auto px-6 sm:px-12 py-8 ${showSidebar ? 'max-w-4xl' : 'max-w-5xl'}`}
            onMouseUp={handleMouseUp}
            onClick={handleContentClick}
          >
            {/* Images at top if any */}
            {topic.materialImages && topic.materialImages.length > 0 && (
              <div className="mb-8 space-y-4">
                {topic.materialImages.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`Изображение ${idx + 1}`}
                    className="max-w-full rounded-lg shadow-md"
                  />
                ))}
              </div>
            )}

            {/* Main content */}
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
                [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-4"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.8, color: '#292524' }}
              dangerouslySetInnerHTML={{ __html: renderContent() }}
            />
          </article>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <aside className="w-80 flex-shrink-0 bg-white border-l border-stone-200 flex flex-col overflow-hidden">
            {/* Sidebar tabs */}
            <div className="flex border-b border-stone-200">
              <button
                onClick={() => setActiveTab('highlights')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'highlights'
                    ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50'
                    : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                }`}
              >
                <Highlighter size={16} className="inline mr-2" />
                Маркирани ({highlights.length})
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'notes'
                    ? 'text-amber-600 border-b-2 border-amber-500 bg-amber-50'
                    : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                }`}
              >
                📝 Бележки
              </button>
            </div>

            {/* Sidebar content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'highlights' && (
                <div className="space-y-3">
                  {/* Color selector */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-stone-500">Цвят:</span>
                    {HIGHLIGHT_COLORS.map(({ color, bgClass }) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-6 h-6 rounded ${bgClass} border-2 transition-all ${
                          selectedColor === color ? 'border-stone-600 scale-110' : 'border-stone-300'
                        }`}
                      />
                    ))}
                  </div>

                  {highlights.length === 0 ? (
                    <div className="text-center py-8 text-stone-400">
                      <Highlighter size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Селектирай текст за маркиране</p>
                    </div>
                  ) : (
                    highlights.map(hl => {
                      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === hl.color);
                      return (
                        <div
                          key={hl.id}
                          className="group p-3 rounded-lg border border-stone-200 hover:border-stone-300 transition-colors"
                          style={{ backgroundColor: colorConfig?.bg + '40' }}
                        >
                          <p className="text-sm text-stone-700 line-clamp-3 mb-2">
                            "{hl.text}"
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-stone-400">
                              {new Date(hl.createdAt).toLocaleDateString('bg-BG')}
                            </span>
                            <button
                              onClick={() => removeHighlight(hl.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-red-500 transition-all"
                              title="Изтрий"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {highlights.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm('Изтрий всички маркирания?')) {
                          setHighlights([]);
                          onSaveHighlights([]);
                        }
                      }}
                      className="w-full mt-4 py-2 text-sm text-stone-400 hover:text-red-500 transition-colors"
                    >
                      Изчисти всички
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="text-center py-8 text-stone-400">
                  <p className="text-sm">🚧 Бележки - скоро</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Floating selection toolbar */}
      {selectionInfo && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-stone-200 p-2 flex items-center gap-1"
          style={{
            left: `${Math.max(100, Math.min(selectionInfo.x - 80, window.innerWidth - 180))}px`,
            top: `${Math.max(60, selectionInfo.y - 50)}px`,
            transform: 'translateX(-50%)'
          }}
        >
          {HIGHLIGHT_COLORS.map(({ color, bgClass, name }) => (
            <button
              key={color}
              onClick={() => addHighlight(color)}
              className={`w-8 h-8 rounded ${bgClass} hover:scale-110 transition-transform border border-stone-300`}
              title={`Маркирай ${name}`}
            />
          ))}
          <div className="w-px h-6 bg-stone-200 mx-1" />
          <button
            onClick={() => {
              setSelectionInfo(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="w-8 h-8 rounded bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors"
            title="Откажи"
          >
            <X size={16} className="text-stone-500" />
          </button>
        </div>
      )}

      {/* Scroll to top button */}
      {scrollProgress > 20 && (
        <button
          onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 bg-white rounded-full shadow-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:scale-110 transition-all z-40"
          title="Към началото"
        >
          <ChevronUp size={24} />
        </button>
      )}
    </div>
  );
}
