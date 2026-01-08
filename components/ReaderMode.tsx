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
  onSaveMaterial: (material: string) => void;
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

const HIGHLIGHT_COLORS: { color: HighlightColor; bg: string; name: string }[] = [
  { color: 'yellow', bg: '#fef08a', name: 'Жълто' },
  { color: 'green', bg: '#bbf7d0', name: 'Зелено' },
  { color: 'blue', bg: '#bfdbfe', name: 'Синьо' },
  { color: 'pink', bg: '#fbcfe8', name: 'Розово' },
];

export default function ReaderMode({ topic, subjectName, onClose, onSaveHighlights, onSaveEncodingCoach, onSaveMaterial }: ReaderModeProps) {
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentMaterialRef = useRef(topic.material);

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

  // Debounced auto-save
  const saveContent = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    // Get plain text from contentEditable
    const newMaterial = content.innerText || '';

    if (newMaterial !== currentMaterialRef.current) {
      currentMaterialRef.current = newMaterial;
      onSaveMaterial(newMaterial);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    }
  }, [onSaveMaterial]);

  const debouncedSave = useCallback(() => {
    setHasUnsavedChanges(true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveContent();
    }, 1000); // Save after 1 second of no typing
  }, [saveContent]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Save any pending changes on unmount
      saveContent();
    };
  }, [saveContent]);

  // Handle input in contentEditable
  const handleInput = useCallback(() => {
    debouncedSave();
  }, [debouncedSave]);

  // Handle text selection for highlights
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

  // Add highlight
  const addHighlight = useCallback((color: HighlightColor) => {
    if (!selectionInfo) return;

    const content = contentRef.current?.innerText || topic.material;
    const startOffset = content.indexOf(selectionInfo.text);

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

  // Fetch encoding coach
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectionInfo) {
          setSelectionInfo(null);
          window.getSelection()?.removeAllRanges();
        } else {
          // Save before closing
          saveContent();
          onClose();
        }
      }

      // Ctrl+S to force save
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveContent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectionInfo, saveContent]);

  // Handle paste - strip formatting
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Simple markdown parsing for display
  const parseMarkdownSimple = (text: string): string => {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-stone-800 mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-stone-800 mt-5 mb-3">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-stone-900 mt-6 mb-4">$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-stone-900">$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Lists
    html = html.replace(/^[-•] (.+)$/gm, '<li class="ml-4">$1</li>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4">$2</li>');

    // Line breaks to paragraphs
    html = html.replace(/\n\n/g, '</p><p class="mb-3">');
    html = '<p class="mb-3">' + html + '</p>';
    html = html.replace(/<p class="mb-3"><\/p>/g, '');

    return html;
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
            <button
              onClick={() => { saveContent(); onClose(); }}
              className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors"
            >
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
            {/* Save status */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-stone-400">
              {hasUnsavedChanges ? (
                <span className="text-amber-600">Записване...</span>
              ) : lastSaved ? (
                <span>Запазено</span>
              ) : null}
            </div>

            {/* Encoding Coach Button */}
            <button
              onClick={fetchEncodingCoach}
              disabled={loadingCoach}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                encodingCoach
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              } disabled:opacity-50`}
              title={encodingCoach ? 'Виж стратегията' : 'Получи стратегия за учене'}
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
            <button
              onClick={() => { saveContent(); onClose(); }}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Затвори (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT TOOLBAR */}
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

          {/* Highlight colors */}
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

          {highlights.length > 0 && (
            <div className="flex flex-col items-center py-2">
              <span className="text-xs text-stone-400">{highlights.length}</span>
              <span className="text-[10px] text-stone-300">маркирани</span>
            </div>
          )}
        </aside>

        {/* CENTER - Editable Content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto bg-[#fafaf9]"
        >
          <article className="max-w-4xl mx-auto px-8 sm:px-16 py-8">
            {/* Images */}
            {topic.materialImages && topic.materialImages.length > 0 && (
              <div className="mb-8 space-y-4">
                {topic.materialImages.map((img, idx) => (
                  <img key={idx} src={img} alt={`Изображение ${idx + 1}`} className="max-w-full rounded-lg shadow-md" />
                ))}
              </div>
            )}

            {/* Editable content - Notion style */}
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onMouseUp={handleMouseUp}
              onPaste={handlePaste}
              className="min-h-[60vh] outline-none text-stone-800 leading-relaxed
                focus:outline-none
                [&:empty]:before:content-['Започни_да_пишеш...'] [&:empty]:before:text-stone-400
                selection:bg-amber-200"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: 1.8,
                whiteSpace: 'pre-wrap'
              }}
              dangerouslySetInnerHTML={{ __html: topic.material || '' }}
            />

            <p className="mt-8 text-xs text-stone-400 text-center">
              Кликни и пиши директно. Промените се запазват автоматично.
            </p>
          </article>
        </div>

        {/* RIGHT SIDEBAR */}
        {showSidebar && (
          <aside className="w-80 flex-shrink-0 bg-white border-l border-stone-200 flex flex-col overflow-hidden">
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
                      const isEditingNote = editingNoteId === hl.id;

                      return (
                        <div
                          key={hl.id}
                          className="rounded-lg border border-stone-200 hover:border-stone-300 transition-colors overflow-hidden"
                          style={{ backgroundColor: bgColor + '20' }}
                        >
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

                          <div className="px-2 pb-2 space-y-1.5">
                            {isEditingNote ? (
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
                                <button onClick={saveNote} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors">
                                  <Check size={14} />
                                </button>
                                <button onClick={() => { setEditingNoteId(null); setNoteText(''); }} className="px-2 py-1 bg-stone-200 hover:bg-stone-300 text-stone-600 rounded transition-colors">
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

            {highlights.length > 0 && (
              <div className="p-3 border-t border-stone-200">
                <p className="text-xs text-stone-400 text-center">
                  Кликни на highlight за бележка
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
                <button onClick={() => setShowCoach(false)} className="text-white/80 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">{topic.name}</p>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="prose prose-sm max-w-none text-stone-700 whitespace-pre-wrap">
                {encodingCoach}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
