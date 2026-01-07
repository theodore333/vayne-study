'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Minus, Plus, BookOpen, Highlighter, Trash2, ChevronUp } from 'lucide-react';
import { Topic, TextHighlight } from '@/lib/types';

interface ReaderModeProps {
  topic: Topic;
  onClose: () => void;
  onSaveHighlights: (highlights: TextHighlight[]) => void;
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

const HIGHLIGHT_COLORS: { color: HighlightColor; bg: string; name: string }[] = [
  { color: 'yellow', bg: 'bg-yellow-200', name: 'Жълто' },
  { color: 'green', bg: 'bg-green-200', name: 'Зелено' },
  { color: 'blue', bg: 'bg-blue-200', name: 'Синьо' },
  { color: 'pink', bg: 'bg-pink-200', name: 'Розово' },
];

// Clean markdown artifacts from text
function cleanMarkdown(text: string): string {
  return text
    // Remove standalone asterisks that aren't part of formatting
    .replace(/(?<!\*)\*(?!\*)/g, '')
    // Remove standalone hash symbols that aren't headers
    .replace(/(?<!^)#+(?!\s)/gm, '')
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Parse markdown to HTML-like structure for rendering
function parseMarkdown(text: string): string {
  let html = cleanMarkdown(text);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // Paragraphs - wrap text blocks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

export default function ReaderMode({ topic, onClose, onSaveHighlights }: ReaderModeProps) {
  const [fontSize, setFontSize] = useState(18);
  const [highlights, setHighlights] = useState<TextHighlight[]>(topic.highlights || []);
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('yellow');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<{ text: string; range: Range } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
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
      setShowScrollTop(scrollTop > 300);
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
    setSelectionInfo({ text, range });
    setShowColorPicker(true);
  }, []);

  // Add highlight
  const addHighlight = useCallback((color: HighlightColor) => {
    if (!selectionInfo || !contentRef.current) return;

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
    setShowColorPicker(false);
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

      const colorClass = HIGHLIGHT_COLORS.find(c => c.color === hl.color)?.bg || 'bg-yellow-200';
      content = `${before}<mark class="${colorClass} px-0.5 rounded cursor-pointer hover:opacity-80" data-highlight-id="${hl.id}">${highlighted}</mark>${after}`;
    }

    return parseMarkdown(content);
  };

  // Handle click on highlight to remove
  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'MARK') {
      const highlightId = target.getAttribute('data-highlight-id');
      if (highlightId && window.confirm('Премахни маркирането?')) {
        removeHighlight(highlightId);
      }
    }
  };

  // Scroll to top
  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showColorPicker) {
          setShowColorPicker(false);
          setSelectionInfo(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showColorPicker]);

  return (
    <div className="fixed inset-0 z-50 bg-stone-100">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-stone-300 z-50">
        <div
          className="h-full bg-amber-500 transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 left-0 right-0 z-40 bg-stone-100/95 backdrop-blur-sm border-b border-stone-300">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen size={20} className="text-stone-600" />
            <h1 className="font-semibold text-stone-800 truncate max-w-[300px]">
              {topic.name}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Font size controls */}
            <div className="flex items-center gap-1 bg-stone-200 rounded-lg px-2 py-1">
              <button
                onClick={() => setFontSize(Math.max(14, fontSize - 2))}
                className="p-1 text-stone-600 hover:text-stone-900 transition-colors"
                title="По-малък шрифт"
              >
                <Minus size={16} />
              </button>
              <span className="text-sm text-stone-600 min-w-[40px] text-center">
                {fontSize}px
              </span>
              <button
                onClick={() => setFontSize(Math.min(28, fontSize + 2))}
                className="p-1 text-stone-600 hover:text-stone-900 transition-colors"
                title="По-голям шрифт"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Highlight color selector */}
            <div className="flex items-center gap-1 bg-stone-200 rounded-lg px-2 py-1">
              <Highlighter size={16} className="text-stone-600" />
              {HIGHLIGHT_COLORS.map(({ color, bg }) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-5 h-5 rounded ${bg} border-2 transition-all ${
                    selectedColor === color ? 'border-stone-600 scale-110' : 'border-transparent'
                  }`}
                  title={`Маркирай с ${color}`}
                />
              ))}
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded-lg transition-colors"
              title="Затвори (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto pt-20 pb-20"
      >
        <article
          ref={contentRef}
          className="max-w-3xl mx-auto px-6 py-8"
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

      {/* Color picker popup when text is selected */}
      {showColorPicker && selectionInfo && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-stone-200 p-3 z-50">
          <p className="text-sm text-stone-600 mb-2 text-center">Маркирай с цвят:</p>
          <div className="flex gap-2">
            {HIGHLIGHT_COLORS.map(({ color, bg, name }) => (
              <button
                key={color}
                onClick={() => addHighlight(color)}
                className={`w-10 h-10 rounded-lg ${bg} hover:scale-110 transition-transform border-2 border-stone-300`}
                title={name}
              />
            ))}
            <button
              onClick={() => {
                setShowColorPicker(false);
                setSelectionInfo(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="w-10 h-10 rounded-lg bg-stone-200 hover:bg-stone-300 flex items-center justify-center transition-colors"
              title="Откажи"
            >
              <X size={18} className="text-stone-600" />
            </button>
          </div>
        </div>
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 p-3 bg-white rounded-full shadow-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:scale-110 transition-all"
          title="Към началото"
        >
          <ChevronUp size={24} />
        </button>
      )}

      {/* Highlights summary */}
      {highlights.length > 0 && (
        <div className="fixed bottom-6 left-6 bg-white rounded-xl shadow-lg border border-stone-200 p-3 max-w-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-stone-700">
              Маркирания: {highlights.length}
            </span>
            <button
              onClick={() => {
                if (window.confirm('Премахни всички маркирания?')) {
                  setHighlights([]);
                  onSaveHighlights([]);
                }
              }}
              className="text-stone-400 hover:text-red-500 transition-colors"
              title="Изчисти всички"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="flex gap-1">
            {HIGHLIGHT_COLORS.map(({ color, bg }) => {
              const count = highlights.filter(h => h.color === color).length;
              if (count === 0) return null;
              return (
                <span key={color} className={`${bg} px-2 py-0.5 rounded text-xs text-stone-700`}>
                  {count}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
