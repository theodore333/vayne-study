'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Minus, Plus, BookOpen, Highlighter, Trash2, ChevronUp, ChevronLeft, PanelRightClose, PanelRight, Type, Bold, Italic, List, AlignLeft } from 'lucide-react';
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

function cleanMarkdown(text: string): string {
  return text
    .replace(/(?<!\*)\*(?!\*)/g, '')
    .replace(/(?<!^)#+(?!\s)/gm, '')
    .replace(/  +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

  // Render content with highlights
  const renderContent = () => {
    let content = cleanMarkdown(topic.material);
    const sortedHighlights = [...highlights].sort((a, b) => b.startOffset - a.startOffset);

    for (const hl of sortedHighlights) {
      const before = content.slice(0, hl.startOffset);
      const highlighted = content.slice(hl.startOffset, hl.endOffset);
      const after = content.slice(hl.endOffset);

      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === hl.color);
      const bgColor = colorConfig?.bg || '#fef08a';
      content = `${before}<mark style="background-color: ${bgColor} !important; padding: 2px 4px; border-radius: 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone;">${highlighted}</mark>${after}`;
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
                [&_mark]:text-stone-900"
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
                  <div className="space-y-2">
                    {highlights.map(hl => {
                      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === hl.color);
                      const bgColor = colorConfig?.bg || '#fef08a';
                      return (
                        <div
                          key={hl.id}
                          className="flex items-start gap-2 p-2 rounded-lg border border-stone-200 hover:border-stone-300 transition-colors"
                          style={{ backgroundColor: bgColor + '40' }}
                        >
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
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Notes Section */}
            <div className="flex-1 flex flex-col">
              <div className="px-4 py-3 bg-stone-50 border-b border-stone-100">
                <h3 className="text-sm font-medium text-stone-700">📝 Бележки</h3>
              </div>
              <div className="flex-1 p-3">
                <div className="text-center py-8 text-stone-400">
                  <p className="text-sm">🚧 Скоро...</p>
                </div>
              </div>
            </div>
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
    </div>
  );
}
