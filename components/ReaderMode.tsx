'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { Fragment } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Link } from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  X, Minus, Plus, BookOpen, ChevronUp, ChevronLeft, PanelRightClose, PanelRight,
  Type, Loader2, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Heading3, Highlighter, Undo, Redo, Quote, Wand2,
  ImagePlus, Table as TableIcon, Link2, Unlink, Code2, CheckSquare,
  Strikethrough, ChevronDown, RowsIcon, ColumnsIcon, Trash2, Plus as PlusIcon,
  MinusIcon, GripVertical, AlignLeft, AlignCenter, AlignRight,
  Calculator, Check, Search, Replace, ListTree, Clock, FileText, CheckCircle2,
  ChevronRight, Eye, AlertTriangle, ArrowLeft, ArrowRight, Brain,
  Info, Lightbulb, Sparkles
} from 'lucide-react';
import { Topic, TextHighlight } from '@/lib/types';
import { useApp } from '@/lib/context';
import { mergeAttributes, Node as TiptapNode, Mark as TiptapMark } from '@tiptap/core';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';
import { DetailsNode, DetailsSummary, DetailsContent, transformDetailsHTML } from '@/lib/tiptap-details';
import TutorChat from '@/components/TutorChat';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const lowlight = createLowlight(common);

// Highlight colors
const HIGHLIGHT_COLORS = [
  { name: 'Жълто', color: '#fef08a' },
  { name: 'Зелено', color: '#bbf7d0' },
  { name: 'Синьо', color: '#bfdbfe' },
  { name: 'Розово', color: '#fecdd3' },
  { name: 'Оранжево', color: '#fed7aa' },
];

// Resizable Image Component
function ResizableImageComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const [isResizing, setIsResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = imageRef.current?.offsetWidth || 300;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(100, Math.min(800, startWidth.current + (corner.includes('right') ? diff : -diff)));
      updateAttributes({ width: newWidth });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cleanupRef.current = null;
    };

    // Store cleanup function
    cleanupRef.current = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle>
      <div className={`relative inline-block ${selected ? 'ring-2 ring-blue-500' : ''}`} style={{ width: node.attrs.width || 'auto' }}>
        <img
          ref={imageRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          className="rounded-lg"
          draggable={false}
        />
        {selected && (
          <>
            {/* Resize handles */}
            <div
              className="absolute top-0 left-0 w-3 h-3 bg-blue-500 cursor-nw-resize rounded-sm transform -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'top-left')}
            />
            <div
              className="absolute top-0 right-0 w-3 h-3 bg-blue-500 cursor-ne-resize rounded-sm transform translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'top-right')}
            />
            <div
              className="absolute bottom-0 left-0 w-3 h-3 bg-blue-500 cursor-sw-resize rounded-sm transform -translate-x-1/2 translate-y-1/2 hover:scale-125 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'bottom-left')}
            />
            <div
              className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize rounded-sm transform translate-x-1/2 translate-y-1/2 hover:scale-125 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
            />
            {/* Side handles */}
            <div
              className="absolute top-1/2 left-0 w-2 h-8 bg-blue-500 cursor-ew-resize rounded-sm transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
            <div
              className="absolute top-1/2 right-0 w-2 h-8 bg-blue-500 cursor-ew-resize rounded-sm transform translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Create Resizable Image Extension
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width}px` };
        },
      },
      align: {
        default: 'center',
        renderHTML: attributes => {
          return { 'data-align': attributes.align };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

// Superscript mark extension
const Superscript = TiptapMark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }]; },
  renderHTML({ HTMLAttributes }) { return ['sup', mergeAttributes(HTMLAttributes), 0]; },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-.': () => this.editor.commands.toggleMark(this.name) };
  },
});

// Subscript mark extension
const Subscript = TiptapMark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }]; },
  renderHTML({ HTMLAttributes }) { return ['sub', mergeAttributes(HTMLAttributes), 0]; },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-,': () => this.editor.commands.toggleMark(this.name) };
  },
});

// Callout block node extension
const CALLOUT_TYPES = {
  info: { label: 'Бележка', emoji: 'ℹ️', borderColor: '#3b82f6', bgColor: 'rgba(59,130,246,0.08)' },
  important: { label: 'Важно', emoji: '⚠️', borderColor: '#f59e0b', bgColor: 'rgba(245,158,11,0.08)' },
  clinical: { label: 'Клинична перла', emoji: '💡', borderColor: '#22c55e', bgColor: 'rgba(34,197,94,0.08)' },
  danger: { label: 'Внимание', emoji: '🚨', borderColor: '#ef4444', bgColor: 'rgba(239,68,68,0.08)' },
  definition: { label: 'Дефиниция', emoji: '📖', borderColor: '#a855f7', bgColor: 'rgba(168,85,247,0.08)' },
} as const;

const CalloutExtension = TiptapNode.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-callout') || 'info',
        renderHTML: (attributes: Record<string, string>) => ({ 'data-callout': attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: Record<string, any> }) {
    const type = node.attrs.type as keyof typeof CALLOUT_TYPES;
    const config = CALLOUT_TYPES[type] || CALLOUT_TYPES.info;
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-callout': node.attrs.type,
      style: `border-left: 4px solid ${config.borderColor}; background: ${config.bgColor}; padding: 0.75em 1em; border-radius: 0 0.5em 0.5em 0; margin: 1em 0;`,
    }), 0];
  },

  addCommands() {
    return {
      setCallout: (attributes?: { type: string }) => ({ commands }: { commands: any }) => {
        return commands.wrapIn(this.name, attributes);
      },
      toggleCallout: (attributes?: { type: string }) => ({ commands }: { commands: any }) => {
        if (this.editor.isActive(this.name)) {
          return commands.lift(this.name);
        }
        return commands.wrapIn(this.name, attributes);
      },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at empty paragraph at start of callout lifts it out
      Backspace: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.textContent === '' &&
            $from.depth > 1 &&
            $from.node($from.depth - 1).type.name === this.name) {
          return this.editor.commands.lift(this.name);
        }
        return false;
      },
    };
  },
});

// Table Grid Picker Component
function TableGridPicker({ onSelect, onClose }: { onSelect: (rows: number, cols: number) => void; onClose: () => void }) {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const maxRows = 8;
  const maxCols = 8;

  return (
    <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-stone-200 p-3 z-50">
      <div className="text-xs text-stone-500 mb-2 text-center">
        {hoveredCell ? `${hoveredCell.row} x ${hoveredCell.col}` : 'Избери размер'}
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}>
        {Array.from({ length: maxRows * maxCols }).map((_, index) => {
          const row = Math.floor(index / maxCols) + 1;
          const col = (index % maxCols) + 1;
          const isHighlighted = hoveredCell && row <= hoveredCell.row && col <= hoveredCell.col;
          return (
            <div
              key={index}
              className={`w-4 h-4 border rounded-sm cursor-pointer transition-colors ${
                isHighlighted ? 'bg-amber-400 border-amber-500' : 'bg-stone-100 border-stone-300 hover:bg-stone-200'
              }`}
              onMouseEnter={() => setHoveredCell({ row, col })}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => {
                onSelect(row, col);
                onClose();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Formula Modal Component
function FormulaModal({ isOpen, onClose, onInsert }: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (formula: string) => void;
}) {
  const [formula, setFormula] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!formula) {
      setPreview('');
      setError('');
      return;
    }
    try {
      const html = katex.renderToString(formula, { throwOnError: true, displayMode: true });
      setPreview(html);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setPreview('');
    }
  }, [formula]);

  const handleInsert = () => {
    if (formula && !error) {
      onInsert(formula);
      setFormula('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const examples = [
    { label: 'pH формула', code: 'pH = -\\log[H^+]' },
    { label: 'Henderson-Hasselbalch', code: 'pH = pK_a + \\log\\frac{[A^-]}{[HA]}' },
    { label: 'Michaelis-Menten', code: 'v = \\frac{V_{max}[S]}{K_m + [S]}' },
    { label: 'Химична реакция', code: 'CO_2 + H_2O \\rightleftharpoons H_2CO_3' },
    { label: 'ATP хидролиза', code: 'ATP + H_2O \\rightarrow ADP + P_i + \\Delta G' },
    { label: 'Fraction', code: '\\frac{a}{b}' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white border border-stone-300 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <Calculator size={20} className="text-amber-600" />
            Вмъкни формула (LaTeX)
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded">
            <X size={20} className="text-stone-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-stone-500 font-medium mb-2 block">Примери:</label>
            <div className="flex flex-wrap gap-2">
              {examples.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => setFormula(ex.code)}
                  className="px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 rounded"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium mb-1 block">LaTeX код:</label>
            <textarea
              value={formula}
              onChange={e => setFormula(e.target.value)}
              placeholder="Напиши LaTeX формула... напр. H_2O или \frac{1}{2}"
              className="w-full h-24 bg-stone-50 border border-stone-300 rounded-lg p-3 text-stone-800 font-mono text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium mb-1 block">Преглед:</label>
            <div className="min-h-[60px] bg-stone-50 border border-stone-200 rounded-lg p-4 flex items-center justify-center">
              {error ? (
                <span className="text-red-500 text-sm">{error}</span>
              ) : preview ? (
                <div dangerouslySetInnerHTML={{ __html: preview }} />
              ) : (
                <span className="text-stone-400 text-sm">Въведи формула...</span>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm"
            >
              Отказ
            </button>
            <button
              onClick={handleInsert}
              disabled={!formula || !!error}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Check size={16} />
              Вмъкни
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Toolbar button component - defined outside to prevent re-renders
function ToolbarButton({ onClick, active, disabled, children, title }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded transition-colors ${
        active
          ? 'bg-amber-100 text-amber-700'
          : 'bg-white text-stone-600 hover:bg-stone-200 hover:text-stone-900'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
      title={title}
    >
      {children}
    </button>
  );
}

interface ReaderModeProps {
  topic: Topic;
  subjectName?: string;
  subjectTopics?: string[];
  onClose: () => void;
  onSaveHighlights: (highlights: TextHighlight[]) => void;
  onSaveMaterial: (material: string) => void;
  // Navigation
  onPrevTopic?: () => void;
  onNextTopic?: () => void;
  hasPrevTopic?: boolean;
  hasNextTopic?: boolean;
  prevTopicName?: string;
  nextTopicName?: string;
}

// Parse formula and image markers
function parseMarkers(text: string): string {
  // Parse images
  let result = text.replace(/\[IMG:([^:]*):([^\]]+)\]/g, (_, alt, src) => {
    return `<img src="${src}" alt="${alt}" />`;
  });

  // Parse formulas
  result = result.replace(/\[FORMULA:([^\]]+)\]/g, (_, encodedFormula) => {
    try {
      const formula = decodeURIComponent(encodedFormula);
      const html = katex.renderToString(formula, {
        throwOnError: false,
        displayMode: false,
        output: 'html'
      });
      return `<span class="katex-formula" data-formula="${encodedFormula}">${html}</span>`;
    } catch {
      return `[FORMULA:${encodedFormula}]`;
    }
  });

  return result;
}

// Convert markdown to HTML for initial load
function markdownToHtml(markdown: string): string {
  if (!markdown) return '<p></p>';

  // First parse any formula/image markers
  let html = parseMarkers(markdown);

  // Code blocks first (before escaping)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code class="language-${lang || 'plaintext'}">${escapedCode}</code></pre>`;
  });

  // Inline code (before escaping)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Now escape remaining HTML
  html = html.replace(/&(?!amp;|lt;|gt;)/g, '&amp;');
  html = html.replace(/<(?!\/?(pre|code|h[1-3]|strong|em|s|blockquote|ul|ol|li|p|br|a|img|table|thead|tbody|tr|th|td|hr|mark|u|input|details|summary|div)[^>]*>)/g, '&lt;');

  // Horizontal rule (before headers)
  html = html.replace(/^---+$/gm, '<hr>');

  // Headers (must be before other replacements)
  // Wiki-style headers: === Title === → h3, == Title == → h2, = Title = → h1
  html = html.replace(/^={3,}\s*(.+?)\s*={3,}$/gm, '<h3>$1</h3>');
  html = html.replace(/^={2}\s*(.+?)\s*={2}$/gm, '<h2>$1</h2>');
  html = html.replace(/^=\s*(.+?)\s*=$/gm, '<h1>$1</h1>');
  // Markdown-style headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Helper to sanitize URLs (prevent javascript: and other XSS vectors)
  const sanitizeUrl = (url: string): string => {
    // Decode URL-encoded characters to catch obfuscation attempts
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      // If decoding fails, use original (it might not be encoded)
    }
    const trimmed = decoded.trim().toLowerCase().replace(/\s/g, '');
    // Allow data:image URLs (base64 images from paste/drawing)
    if (trimmed.startsWith('data:image/')) {
      return url;
    }
    // Block dangerous protocols
    if (trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:') ||
        trimmed.startsWith('file:')) {
      return '#'; // Neutralize dangerous URLs
    }
    return url;
  };

  // Images (before links)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const fixedSrc = sanitizeUrl(src);
    return `<img src="${fixedSrc}" alt="${alt}">`;
  });

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) =>
    `<a href="${sanitizeUrl(href)}">${text}</a>`
  );

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Tables - parse BEFORE list processing to avoid interference
  const tableRegex = /((?:^\|[^\n]+\|\n?)+)/gm;
  html = html.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    let tableHtml = '<table><tbody>';
    let isFirstDataRow = true;

    for (const row of rows) {
      // Skip separator rows (| --- | --- |)
      if (/^\|[\s-:|]+\|$/.test(row)) continue;

      // Parse cells
      const cellMatch = row.match(/^\|(.+)\|$/);
      if (!cellMatch) continue;

      const cells = cellMatch[1].split('|').map(c => c.trim());
      const tag = isFirstDataRow ? 'th' : 'td';
      tableHtml += `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
      isFirstDataRow = false;
    }

    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  // Pre-process: split inline bullets into separate lines
  // e.g., "• Бели дробове • Сърце • Корем" → three separate "• ..." lines
  const rawLines = html.split('\n');
  const expandedLines: string[] = [];
  for (const line of rawLines) {
    // Check if line has multiple inline bullets (• or - used as separators)
    // Match pattern: text starts with • and has more • in the middle
    if (/•/.test(line)) {
      const parts = line.split(/\s*•\s*/).filter(p => p.trim());
      if (parts.length > 1) {
        for (const part of parts) {
          expandedLines.push(`• ${part.trim()}`);
        }
        continue;
      }
    }
    expandedLines.push(line);
  }

  // Process lists line-by-line (prevents empty bullet points)
  const lines = expandedLines;
  const processedLines: string[] = [];
  let inList: 'none' | 'bullet' | 'task' = 'none';

  for (const line of lines) {
    // Check for task list items first
    const taskCheckedMatch = line.match(/^- \[x\] (.+)$/);
    const taskUncheckedMatch = line.match(/^- \[ \] (.+)$/);
    const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    // Skip standalone bullet characters with no text (e.g., lines that are just "•" or "- ")
    const isEmptyBullet = /^\s*[-*•]\s*$/.test(line);

    if (isEmptyBullet) {
      // Skip empty bullet lines entirely (e.g., "•", "- ", "* ")
      continue;
    } else if (taskCheckedMatch || taskUncheckedMatch) {
      // Task list item
      const content = taskCheckedMatch ? taskCheckedMatch[1] : taskUncheckedMatch![1];
      const checked = !!taskCheckedMatch;
      if (inList !== 'task') {
        if (inList === 'bullet') processedLines.push('</ul>');
        processedLines.push('<ul data-type="taskList">');
        inList = 'task';
      }
      processedLines.push(`<li data-type="taskItem" data-checked="${checked}">${content}</li>`);
    } else if (bulletMatch || numberedMatch) {
      // Regular list item - only if content is not empty
      const content = bulletMatch ? bulletMatch[1] : numberedMatch![1];
      if (content.trim()) {
        if (inList !== 'bullet') {
          if (inList === 'task') processedLines.push('</ul>');
          processedLines.push('<ul>');
          inList = 'bullet';
        }
        processedLines.push(`<li>${content}</li>`);
      }
    } else {
      // Non-list line
      if (inList !== 'none') {
        processedLines.push('</ul>');
        inList = 'none';
      }
      // Only add non-empty lines (also skip lines that are only bullet chars)
      if (line.trim() && !/^[\s•\-*]+$/.test(line)) {
        processedLines.push(line);
      }
    }
  }
  // Close any open list
  if (inList !== 'none') {
    processedLines.push('</ul>');
  }

  html = processedLines.join('\n');

  // Paragraphs - split by double newlines
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') ||
        block.startsWith('<blockquote') || block.startsWith('<pre') || block.startsWith('<table') ||
        block.startsWith('<hr') || block.startsWith('<img')) {
      return block;
    }
    // Convert single newlines to <br> within paragraphs
    block = block.replace(/\n/g, '<br>');
    return `<p>${block}</p>`;
  }).join('');

  return html || '<p></p>';
}

// Clean up empty elements from HTML before loading into editor
function cleanupEmptyListItems(html: string): string {
  if (typeof window === 'undefined') return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove empty <li> elements (including those with only bullet chars or whitespace)
  // Skip elements inside toggle content to preserve block+ requirement
  const listItems = doc.querySelectorAll('li');
  listItems.forEach(li => {
    if (li.closest('[data-type="details-content"]')) return;
    const text = li.textContent?.trim() || '';
    if (text.length === 0 || /^[\s\u200B\u00A0•\-*]+$/.test(text)) {
      li.remove();
    }
  });

  // Remove empty <ul> and <ol> that have no children
  // Skip elements inside toggle content to preserve block+ requirement
  const lists = doc.querySelectorAll('ul, ol');
  lists.forEach(list => {
    if (list.closest('[data-type="details-content"]')) return;
    if (list.children.length === 0) {
      list.remove();
    }
  });

  // Remove empty <p> elements (including those with only <br>, whitespace, or lone bullet chars)
  // BUT skip paragraphs inside toggle content — they're required for TipTap's block+ content spec
  const paragraphs = doc.querySelectorAll('p');
  paragraphs.forEach(p => {
    if (p.closest('[data-type="details-content"]') || p.closest('[data-details-content]')) return;
    const text = p.textContent?.trim() || '';
    const hasOnlyBr = p.innerHTML.trim() === '<br>' || p.innerHTML.trim() === '';
    // Also remove paragraphs that contain only bullet characters (•, -, *)
    const hasOnlyBullets = /^[\s•\-*\u200B\u00A0]+$/.test(text);
    if (text.length === 0 || hasOnlyBr || hasOnlyBullets) {
      p.remove();
    }
  });

  // Collapse consecutive empty-ish elements: remove runs of >1 empty <p> between content
  // (TipTap may add <p><br></p> for spacing - keep max 1)
  const children = Array.from(doc.body.children);
  let consecutiveEmpty = 0;
  for (const child of children) {
    const text = child.textContent?.trim() || '';
    const isEmpty = child.tagName === 'P' && (text === '' || child.innerHTML.trim() === '<br>');
    if (isEmpty) {
      consecutiveEmpty++;
      if (consecutiveEmpty > 1) {
        child.remove();
      }
    } else {
      consecutiveEmpty = 0;
    }
  }

  return doc.body.innerHTML;
}

// Convert HTML back to markdown for saving
function htmlToMarkdown(html: string): string {
  if (!html) return '';

  let md = html;

  // Code blocks (before other processing)
  md = md.replace(/<pre[^>]*><code[^>]*class="language-(\w+)"[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, lang, code) => {
    const unescapedCode = code
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return `\n\`\`\`${lang}\n${unescapedCode}\`\`\`\n\n`;
  });
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => {
    const unescapedCode = code
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return `\n\`\`\`\n${unescapedCode}\`\`\`\n\n`;
  });

  // Inline code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Horizontal rule
  md = md.replace(/<hr[^>]*>/gi, '\n---\n\n');

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');

  // Bold and italic
  md = md.replace(/<strong><em>(.*?)<\/em><\/strong>/gi, '***$1***');
  md = md.replace(/<em><strong>(.*?)<\/strong><\/em>/gi, '***$1***');
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, '$1'); // No markdown for underline
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');

  // Highlights - just keep the text
  md = md.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '$1');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');

  // Task lists (before regular lists)
  md = md.replace(/<ul[^>]*data-type="taskList"[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return content
      .replace(/<li[^>]*data-checked="true"[^>]*>([\s\S]*?)<\/li>/gi, '- [x] $1\n')
      .replace(/<li[^>]*data-checked="false"[^>]*>([\s\S]*?)<\/li>/gi, '- [ ] $1\n') + '\n';
  });

  // Tables - strip ALL HTML from cells and remove newlines
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, content) => {
    let result = '';
    const rows = content.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    rows.forEach((row: string, index: number) => {
      const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      const cellContents = cells.map((cell: string) => {
        // Remove td/th tags, then ALL other HTML tags, then clean whitespace
        return cell
          .replace(/<\/?t[hd][^>]*>/gi, '')
          .replace(/<[^>]+>/g, '') // Remove ALL HTML tags
          .replace(/\s+/g, ' ')    // Collapse whitespace
          .trim();
      });
      result += '| ' + cellContents.join(' | ') + ' |\n';
      if (index === 0) {
        result += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n';
      }
    });
    return '\n' + result + '\n';
  });

  // Regular lists - skip empty items
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    const items: string[] = [];
    content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, itemContent: string) => {
      // Remove all HTML tags, decode entities, and clean whitespace
      let cleaned = itemContent
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length > 0) {
        items.push('- ' + cleaned);
      }
      return '';
    });
    return items.length > 0 ? items.join('\n') + '\n\n' : '';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    const items: string[] = [];
    let i = 1;
    content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, itemContent: string) => {
      // Remove all HTML tags, decode entities, and clean whitespace
      let cleaned = itemContent
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length > 0) {
        items.push(`${i++}. ` + cleaned);
      }
      return '';
    });
    return items.length > 0 ? items.join('\n') + '\n\n' : '';
  });

  // Paragraphs and line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<\/p><p[^>]*>/gi, '\n\n');

  // Clean up remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&nbsp;/g, ' ');

  // Clean up empty list items and standalone dashes
  md = md.replace(/^- *$/gm, ''); // Remove empty bullet points
  md = md.replace(/^\d+\. *$/gm, ''); // Remove empty numbered items
  md = md.replace(/^- \s*$/gm, ''); // Remove bullet points with only whitespace
  md = md.replace(/^\d+\. \s*$/gm, ''); // Remove numbered items with only whitespace

  // Aggressively clean up whitespace
  md = md.replace(/^\s*$/gm, ''); // Remove lines that are only whitespace
  md = md.replace(/\n{2,}/g, '\n\n'); // Max 2 newlines (one blank line)
  md = md.trim();

  return md;
}

// Calculate word count and reading time
function calculateWordCount(html: string): { words: number; chars: number; readingTime: number } {
  if (typeof window === 'undefined') return { words: 0, chars: 0, readingTime: 0 };

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;
  const readingTime = Math.ceil(words / 200); // ~200 words per minute

  return { words, chars, readingTime };
}

// Extract TOC from editor content
function extractTOC(html: string): Array<{ level: number; text: string; id: string }> {
  if (typeof window === 'undefined') return [];

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const headings = tempDiv.querySelectorAll('h1, h2, h3');
  const items: Array<{ level: number; text: string; id: string }> = [];

  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName[1], 10);
    const text = heading.textContent?.trim() || '';
    if (text) {
      items.push({
        level,
        text,
        id: `heading-${index}`
      });
    }
  });

  return items;
}

// Toast notification component
function SaveToast({ show, message, type, onClose }: {
  show: boolean;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
      type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// Search bar component
function SearchBar({
  show,
  query,
  setQuery,
  replaceQuery,
  setReplaceQuery,
  showReplace,
  setShowReplace,
  onClose,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  resultsCount,
  currentIndex,
  inputRef
}: {
  show: boolean;
  query: string;
  setQuery: (q: string) => void;
  replaceQuery: string;
  setReplaceQuery: (q: string) => void;
  showReplace: boolean;
  setShowReplace: (show: boolean) => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  resultsCount: number;
  currentIndex: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  if (!show) return null;

  return (
    <div className="absolute top-0 right-0 z-50 bg-white border border-stone-200 rounded-lg shadow-lg p-3 m-4 w-80">
      <div className="flex items-center gap-2 mb-2">
        <Search size={16} className="text-stone-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Търси..."
          className="flex-1 px-2 py-1 text-sm border border-stone-200 rounded focus:outline-none focus:border-amber-500"
          autoFocus
        />
        <button
          onClick={() => setShowReplace(!showReplace)}
          className={`p-1 rounded ${showReplace ? 'bg-amber-100 text-amber-700' : 'text-stone-400 hover:bg-stone-100'}`}
          title="Замени"
        >
          <Replace size={16} />
        </button>
        <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600">
          <X size={16} />
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-2 mb-2">
          <Replace size={16} className="text-stone-400" />
          <input
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Замени с..."
            className="flex-1 px-2 py-1 text-sm border border-stone-200 rounded focus:outline-none focus:border-amber-500"
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500">
          {query ? `${resultsCount > 0 ? currentIndex + 1 : 0} от ${resultsCount}` : 'Въведи текст'}
        </span>
        <div className="flex items-center gap-1">
          {showReplace && (
            <>
              <button
                onClick={onReplace}
                disabled={resultsCount === 0}
                className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50"
              >
                Замени
              </button>
              <button
                onClick={onReplaceAll}
                disabled={resultsCount === 0}
                className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50"
              >
                Всички
              </button>
            </>
          )}
          <button
            onClick={onPrev}
            disabled={resultsCount === 0}
            className="p-1 text-stone-500 hover:bg-stone-100 rounded disabled:opacity-50"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={onNext}
            disabled={resultsCount === 0}
            className="p-1 text-stone-500 hover:bg-stone-100 rounded disabled:opacity-50"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Table of Contents component
function TableOfContents({
  items,
  show,
  onClose,
  onNavigate
}: {
  items: Array<{ level: number; text: string; id: string }>;
  show: boolean;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed top-20 left-4 z-50 bg-white border border-stone-200 rounded-lg shadow-lg p-4 w-72 max-h-[calc(100vh-10rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
          <ListTree size={16} />
          Съдържание
        </h3>
        <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600">
          <X size={16} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-4">Няма заглавия</p>
      ) : (
        <nav className="space-y-1">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => onNavigate(item.id)}
              className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-stone-100 transition-colors ${
                item.level === 1 ? 'font-semibold text-stone-800' :
                item.level === 2 ? 'pl-4 text-stone-700' :
                'pl-6 text-stone-600 text-xs'
              }`}
            >
              <span className="line-clamp-1">{item.text}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function ReaderMode({
  topic,
  subjectName,
  subjectTopics,
  onClose,
  onSaveHighlights,
  onSaveMaterial,
  onPrevTopic,
  onNextTopic,
  hasPrevTopic,
  hasNextTopic,
  prevTopicName,
  nextTopicName
}: ReaderModeProps) {
  const [fontSize, setFontSize] = useState(18);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [tutorWidth, setTutorWidth] = useState(384); // default w-96 = 384px
  const tutorResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showTableGridPicker, setShowTableGridPicker] = useState(false);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false); // Use ref to avoid re-renders on every keystroke
  const isEditorInitializedRef = useRef(false); // Prevents saving during initial content load
  const originalMaterialLengthRef = useRef(topic.material?.length || 0); // Track original size

  // New features state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchResults, setSearchResults] = useState<number>(0);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [showTOC, setShowTOC] = useState(false);
  const [tocItems, setTocItems] = useState<Array<{ level: number; text: string; id: string }>>([]);
  const [saveToast, setSaveToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const [wordCount, setWordCount] = useState({ words: 0, chars: 0, readingTime: 0 });
  const [focusMode, setFocusMode] = useState(false);
  const [showCalloutPicker, setShowCalloutPicker] = useState(false);
  const [techniqueTipDismissed, setTechniqueTipDismissed] = useState(false);

  // Study technique tip for reading
  const { data } = useApp();
  const activeTechniqueCount = data?.studyTechniques?.filter(t => t.isActive).length ?? 0;
  const techniqueTip = useMemo(() => {
    const techniques = data?.studyTechniques?.filter(t => t.isActive) || [];
    if (techniques.length === 0) return null;
    // Pick a technique relevant to reading/encoding, rotate by day
    const readingTechniques = techniques.filter(t =>
      ['chunking', 'non-linear-notes', 'inquiry-based-learning', 'cognitive-load-regulation', 'priming', 'effort-monitoring'].includes(t.slug)
    );
    const pool = readingTechniques.length > 0 ? readingTechniques : techniques;
    const dayIndex = new Date().getDate() % pool.length;
    return pool[dayIndex];
  }, [activeTechniqueCount]);

  const containerRef = useRef<HTMLDivElement>(null);
  const calloutPickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onSaveMaterialRef = useRef(onSaveMaterial); // Ref for stable callback

  // Keep refs in sync with state/props
  onSaveMaterialRef.current = onSaveMaterial;
  const highlightPickerRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const tableGridPickerRef = useRef<HTMLDivElement>(null);

  // Initialize TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false, // We use CodeBlockLowlight instead
      }),
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: 'highlight',
        },
      }),
      Placeholder.configure({
        placeholder: 'Започни да пишеш...',
      }),
      Typography,
      Underline,
      Superscript,
      Subscript,
      CalloutExtension,
      DetailsNode,
      DetailsSummary,
      DetailsContent,
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'editor-table',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
        },
      }),
      TextStyle,
      Color,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'editor-code-block',
        },
      }),
    ],
    // Detect if content is HTML (starts with <) or markdown, handle accordingly
    content: cleanupEmptyListItems(
      topic.material?.trim().startsWith('<')
        ? topic.material  // Already HTML, use directly
        : markdownToHtml(topic.material)  // Markdown, convert to HTML
    ),
    editorProps: {
      attributes: {
        class: 'prose prose-stone max-w-none focus:outline-none min-h-[60vh]',
      },
      transformPastedHTML(html) {
        return transformDetailsHTML(html);
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Handle pasted images (screenshots, copied images)
        const items = Array.from(clipboardData.items || []);
        const imageItem = items.find(item => item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              if (base64 && editor) {
                editor.chain().focus().setImage({ src: base64 }).run();
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }

        // Check for HTML content first (Notion pastes HTML)
        const html = clipboardData.getData('text/html');
        if (html) {
          // Check if Notion HTML contains a table
          if (html.includes('<table') || html.includes('<tr')) {
            // Let TipTap handle HTML tables directly
            return false;
          }

          // Check for Notion's specific table format (divs with data attributes)
          if (html.includes('notion-table') || html.includes('data-block-id')) {
            // Extract text and try to parse as table
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const text = tempDiv.textContent || '';
            const lines = text.trim().split('\n').filter(l => l.trim());

            if (lines.length > 1) {
              // Try to detect columns by consistent spacing
              const firstLine = lines[0];
              // Notion often uses multiple spaces between columns
              const hasMultipleSpaces = /\s{2,}/.test(firstLine);

              if (hasMultipleSpaces) {
                // Split by multiple spaces
                const rows = lines.map(line => {
                  const cells = line.split(/\s{2,}/).filter(c => c.trim());
                  return `<tr>${cells.map(cell => `<td>${cell.trim()}</td>`).join('')}</tr>`;
                });
                const headerRow = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
                const bodyRows = rows.slice(1).join('');
                const tableHtml = `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;

                event.preventDefault();
                const tempDiv2 = document.createElement('div');
                tempDiv2.innerHTML = tableHtml;
                const slice = view.someProp('clipboardParser')?.parseSlice(tempDiv2, {
                  preserveWhitespace: false,
                  context: view.state.selection.$from,
                });
                if (slice) {
                  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
                  return true;
                }
              }
            }
          }

          // Let TipTap handle other HTML
          return false;
        }

        // Handle plain text with markdown or tab-separated tables
        const text = clipboardData.getData('text/plain');
        if (!text) return false;

        // Clean up the text - remove empty lines at start/end
        const cleanText = text.trim();
        const lines = cleanText.split('\n');

        // Check if it looks like a table (tab-separated from Notion/Excel)
        const isTabSeparatedTable = lines.length > 1 && lines.some(line => line.includes('\t'));

        // Check for space-separated table (Notion sometimes does this)
        const isSpaceSeparatedTable = lines.length > 1 &&
          lines.every(line => line.trim()) &&
          lines.some(line => /\s{2,}/.test(line));

        // Check if it contains markdown formatting
        const hasMarkdown = /(\*\*|__|\*|_|~~|^#|^>|^-\s+\S|^\d+\.\s+\S|```|\|.+\|)/.test(cleanText);

        if (isTabSeparatedTable) {
          // Convert tab-separated to HTML table
          const rows = lines.filter(l => l.trim()).map(line => {
            const cells = line.split('\t');
            return `<tr>${cells.map(cell => `<td>${cell.trim()}</td>`).join('')}</tr>`;
          });
          // First row as header
          const headerRow = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
          const bodyRows = rows.slice(1).join('');
          const tableHtml = `<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;

          event.preventDefault();
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = tableHtml;
          const slice = view.someProp('clipboardParser')?.parseSlice(tempDiv, {
            preserveWhitespace: false,
            context: view.state.selection.$from,
          });
          if (slice) {
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          }
          return false;
        }

        if (isSpaceSeparatedTable && !hasMarkdown) {
          // Try to parse space-separated table
          const rows = lines.filter(l => l.trim()).map(line => {
            const cells = line.split(/\s{2,}/).filter(c => c.trim());
            return `<tr>${cells.map(cell => `<td>${cell.trim()}</td>`).join('')}</tr>`;
          });

          if (rows.length > 1 && rows[0].includes('<td>')) {
            const headerRow = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
            const bodyRows = rows.slice(1).join('');
            const tableHtml = `<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;

            event.preventDefault();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = tableHtml;
            const slice = view.someProp('clipboardParser')?.parseSlice(tempDiv, {
              preserveWhitespace: false,
              context: view.state.selection.$from,
            });
            if (slice) {
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
              return true;
            }
          }
        }

        if (hasMarkdown) {
          // Convert markdown to HTML
          const convertedHtml = markdownToHtml(cleanText);
          event.preventDefault();

          // Parse and insert the HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = convertedHtml;
          const slice = view.someProp('clipboardParser')?.parseSlice(tempDiv, {
            preserveWhitespace: true,
            context: view.state.selection.$from,
          });
          if (slice) {
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          }
        }

        return false; // Let default handling take over
      },
      handleDrop: (view, event) => {
        // Handle dropped image files
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
          if (imageFile) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              if (base64 && editor) {
                editor.chain().focus().setImage({ src: base64 }).run();
              }
            };
            reader.readAsDataURL(imageFile);
            return true;
          }
        }
        return false;
      },
    },
    onCreate: ({ editor: ed }) => {
      // Verify content loaded correctly before allowing saves
      const loadedHtml = ed.getHTML();
      const originalMaterial = topic.material || '';
      const loadedLen = loadedHtml?.length || 0;
      const originalLen = originalMaterial.length;

      // Block saves if editor loaded significantly less content than stored
      // Catches: empty load, partial parse failures (e.g. toggle blocks dropped)
      const isEmpty = loadedLen < 20 || loadedHtml === '<p></p>';
      const bigShrink = originalLen > 100 && loadedLen < originalLen * 0.5;
      if (originalLen > 50 && (isEmpty || bigShrink)) {
        console.error('[ReaderMode] PARSE FAILURE: had', originalLen, 'chars but editor loaded', loadedLen, '— saves BLOCKED');
        // Do NOT set isEditorInitializedRef — saves will never fire
        return;
      }

      setTimeout(() => {
        isEditorInitializedRef.current = true;
      }, 500);
    },
    onUpdate: ({ editor }) => {
      // Skip updates during initial content load to prevent false "unsaved changes"
      if (!isEditorInitializedRef.current) return;
      hasUnsavedChangesRef.current = true;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        const html = editor.getHTML();
        if (!html || html === '<p></p>') return;

        // Safety: don't save content that is drastically shorter than what was loaded
        const originalLen = topic.material?.length || 0;
        const newLen = html.length;
        if (originalLen > 100 && newLen < originalLen * 0.2) {
          console.error('[ReaderMode] Refusing to save: content shrank from', originalLen, 'to', newLen);
          return;
        }

        // Now update UI state (only once per save, not per keystroke)
        setHasUnsavedChanges(true);
        isSavingRef.current = true;
        setIsSaving(true);

        try {
          // Save HTML directly - no markdown conversion (avoids table/formatting bugs)
          onSaveMaterialRef.current(html);
          setLastSaved(new Date());
          hasUnsavedChangesRef.current = false;
          setHasUnsavedChanges(false);
        } catch (error) {
          console.error('Save error:', error);
        } finally {
          isSavingRef.current = false;
          setIsSaving(false);
        }
      }, 2000);
    },
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (highlightPickerRef.current && !highlightPickerRef.current.contains(e.target as Node)) {
        setShowHighlightPicker(false);
      }
      if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
        setShowTableMenu(false);
      }
      if (tableGridPickerRef.current && !tableGridPickerRef.current.contains(e.target as Node)) {
        setShowTableGridPicker(false);
      }
      if (calloutPickerRef.current && !calloutPickerRef.current.contains(e.target as Node)) {
        setShowCalloutPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle scroll progress with throttling for performance
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = container;
          const progress = scrollHeight > clientHeight
            ? (scrollTop / (scrollHeight - clientHeight)) * 100
            : 100;
          setScrollProgress(progress);
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Save on unmount - with safety guards against saving empty content
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (editor && hasUnsavedChangesRef.current) {
        const html = editor.getHTML();
        // Guard: never save empty/blank content over existing material
        if (!html || html === '<p></p>' || html.trim().length < 10) {
          console.warn('[ReaderMode] Blocked unmount save: content too short/empty');
          return;
        }
        // Guard: if original material was substantial, don't save drastically shorter content
        // (protects against editor failing to load content properly)
        if (originalMaterialLengthRef.current > 100 && html.length < originalMaterialLengthRef.current * 0.1) {
          console.warn('[ReaderMode] Blocked unmount save: content drastically shorter than original');
          return;
        }
        onSaveMaterialRef.current(html);
      }
    };
  }, [editor]);

  // BACKUP: Auto-save every 3 seconds if there are unsaved changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (editor && hasUnsavedChangesRef.current && !isSavingRef.current) {
        const html = editor.getHTML();
        if (html && html !== '<p></p>') {
          isSavingRef.current = true;
          setIsSaving(true);
          try {
            onSaveMaterialRef.current(html);
            setLastSaved(new Date());
            hasUnsavedChangesRef.current = false;
            setHasUnsavedChanges(false);
          } catch (e) {
            console.error('Backup save error:', e);
          } finally {
            isSavingRef.current = false;
            setIsSaving(false);
          }
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [editor]);

  // Show toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setSaveToast({ show: true, message, type });
  }, []);

  // Force save - ALWAYS saves to prevent data loss on navigation
  const forceSave = useCallback(() => {
    if (!editor) return;

    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // ALWAYS save - ignore isSaving state to prevent data loss
    try {
      onSaveMaterialRef.current(editor.getHTML());
      setLastSaved(new Date());
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
      isSavingRef.current = false;
      setIsSaving(false);
    } catch (error) {
      console.error('Force save error:', error);
    }
  }, [editor]);

  // Insert formula into editor
  const handleInsertFormula = (formula: string) => {
    if (!editor) return;
    const encodedFormula = encodeURIComponent(formula);
    try {
      const html = katex.renderToString(formula, {
        throwOnError: false,
        displayMode: false,
        output: 'html'
      });
      const formulaHtml = `<span class="katex-formula" data-formula="${encodedFormula}">${html}</span>&nbsp;`;
      editor.chain().focus().insertContent(formulaHtml).run();
    } catch {
      // Fallback - insert as marker
      editor.chain().focus().insertContent(`[FORMULA:${encodedFormula}]`).run();
    }
  };

  // Search functionality
  useEffect(() => {
    if (!editor || !searchQuery) {
      setSearchResults(0);
      setCurrentSearchIndex(0);
      return;
    }

    // Use editor's built-in search or manual search
    const text = editor.getText();
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    setSearchResults(matches?.length || 0);
    setCurrentSearchIndex(0);
  }, [editor, searchQuery]);

  const handleSearchNext = useCallback(() => {
    if (!editor || searchResults === 0) return;
    setCurrentSearchIndex((prev) => (prev + 1) % searchResults);
    // Focus on match in editor
    editor.commands.focus();
  }, [editor, searchResults]);

  const handleSearchPrev = useCallback(() => {
    if (!editor || searchResults === 0) return;
    setCurrentSearchIndex((prev) => (prev - 1 + searchResults) % searchResults);
    editor.commands.focus();
  }, [editor, searchResults]);

  const handleReplace = useCallback(() => {
    if (!editor || !searchQuery) return;
    const { state } = editor;
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to);

    if (selectedText.toLowerCase() === searchQuery.toLowerCase()) {
      editor.chain().focus().deleteSelection().insertContent(replaceQuery).run();
    }
  }, [editor, searchQuery, replaceQuery]);

  const handleReplaceAll = useCallback(() => {
    if (!editor || !searchQuery) return;
    const html = editor.getHTML();
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newHtml = html.replace(regex, replaceQuery);
    editor.commands.setContent(newHtml);
    setSearchResults(0);
    showToast(`Заменени ${searchResults} съвпадения`, 'success');
  }, [editor, searchQuery, replaceQuery, searchResults, showToast]);

  // Smart heading toggle: isolates the current line from <br>-joined paragraphs before applying
  const smartToggleHeading = useCallback((level: 1 | 2 | 3) => {
    if (!editor) return;

    // If already a heading at this level, just toggle off
    if (editor.isActive('heading', { level })) {
      editor.chain().focus().toggleHeading({ level }).run();
      return;
    }

    const { state } = editor;
    const { $from } = state.selection;

    // Only need special handling for paragraphs with hard breaks
    if ($from.parent.type.name !== 'paragraph') {
      editor.chain().focus().toggleHeading({ level }).run();
      return;
    }

    let hasHardBreak = false;
    $from.parent.forEach(child => {
      if (child.type.name === 'hardBreak') hasHardBreak = true;
    });

    if (!hasHardBreak) {
      editor.chain().focus().toggleHeading({ level }).run();
      return;
    }

    // Paragraph has hard breaks - isolate the current line
    const parentStart = $from.start();
    const cursorOffset = $from.pos - parentStart;
    const parentContent = $from.parent.content;
    const schema = state.schema;

    // Collect hard break positions (offsets within parent content)
    const breakPositions: number[] = [];
    $from.parent.forEach((node, offset) => {
      if (node.type.name === 'hardBreak') {
        breakPositions.push(offset);
      }
    });

    // Build line fragments: [start, end) pairs excluding hardBreaks
    const lineFragments: Array<{ start: number; end: number }> = [];
    let lineStart = 0;
    for (const bp of breakPositions) {
      lineFragments.push({ start: lineStart, end: bp });
      lineStart = bp + 1; // skip the hardBreak node (size 1)
    }
    lineFragments.push({ start: lineStart, end: parentContent.size });

    // Find which line the cursor is on
    let cursorLineIndex = lineFragments.length - 1;
    for (let i = 0; i < lineFragments.length; i++) {
      if (cursorOffset >= lineFragments[i].start && cursorOffset <= lineFragments[i].end) {
        cursorLineIndex = i;
        break;
      }
    }

    // Build replacement nodes: each line becomes its own block
    const newNodes: any[] = [];
    for (let i = 0; i < lineFragments.length; i++) {
      const { start, end } = lineFragments[i];
      const content = start < end ? parentContent.cut(start, end) : Fragment.empty;

      if (i === cursorLineIndex) {
        // This line becomes a heading
        newNodes.push(schema.nodes.heading.create({ level }, content));
      } else {
        // This line stays as a paragraph
        newNodes.push(schema.nodes.paragraph.create(null, content));
      }
    }

    // Replace the parent paragraph with the new nodes
    const parentPos = $from.before();
    const parentEndPos = $from.after();
    const tr = state.tr.replaceWith(parentPos, parentEndPos, newNodes);
    editor.view.dispatch(tr);
  }, [editor]);

  // Split current paragraph at all hard breaks into separate paragraphs
  const splitParagraphBreaks = useCallback(() => {
    if (!editor) return;
    const { state } = editor;
    const { $from } = state.selection;

    if ($from.parent.type.name !== 'paragraph' && $from.parent.type.name !== 'heading') return;

    let hasHardBreak = false;
    $from.parent.forEach(child => {
      if (child.type.name === 'hardBreak') hasHardBreak = true;
    });

    if (!hasHardBreak) {
      showToast('Параграфът няма нови редове за разделяне', 'error');
      return;
    }

    const parentStart = $from.start();
    const parentContent = $from.parent.content;
    const schema = state.schema;
    const parentType = $from.parent.type;
    const parentAttrs = $from.parent.attrs;

    const breakPositions: number[] = [];
    $from.parent.forEach((node, offset) => {
      if (node.type.name === 'hardBreak') breakPositions.push(offset);
    });

    const lineFragments: Array<{ start: number; end: number }> = [];
    let lineStart = 0;
    for (const bp of breakPositions) {
      lineFragments.push({ start: lineStart, end: bp });
      lineStart = bp + 1;
    }
    lineFragments.push({ start: lineStart, end: parentContent.size });

    const newNodes: any[] = [];
    for (const { start, end } of lineFragments) {
      const content = start < end ? parentContent.cut(start, end) : Fragment.empty;
      // First line keeps the original type (heading/paragraph), rest become paragraphs
      if (newNodes.length === 0 && parentType.name === 'heading') {
        newNodes.push(parentType.create(parentAttrs, content));
      } else {
        newNodes.push(schema.nodes.paragraph.create(null, content));
      }
    }

    const parentPos = $from.before();
    const parentEndPos = $from.after();
    editor.view.dispatch(state.tr.replaceWith(parentPos, parentEndPos, newNodes));
    showToast(`Разделен на ${newNodes.length} параграфа`, 'success');
  }, [editor, showToast]);

  // Auto-detect and convert header-like lines to proper headings
  const autoDetectHeaders = useCallback(() => {
    if (!editor) return;

    let html = editor.getHTML();
    let count = 0;

    // Pattern 1: === text === → h3, == text == → h2
    html = html.replace(/<p>={3,}\s*(.+?)\s*={3,}<\/p>/g, (_, text) => { count++; return `<h3>${text}</h3>`; });
    html = html.replace(/<p>={2}\s*(.+?)\s*={2}<\/p>/g, (_, text) => { count++; return `<h2>${text}</h2>`; });

    // Also handle inside paragraphs with <br> (common from PDF extraction)
    // Match at start of paragraph: <p>=== text ===<br>...
    html = html.replace(/<p>={3,}\s*(.+?)\s*={3,}<br>/g, (_, text) => { count++; return `<h3>${text}</h3><p>`; });
    html = html.replace(/<p>={2}\s*(.+?)\s*={2}<br>/g, (_, text) => { count++; return `<h2>${text}</h2><p>`; });

    // Pattern 2: Numbered sections like "5.3.2. Title" or "5.3.2 Title"
    // Three-level numbers → H3
    html = html.replace(/<p>(\d+\.\d+\.\d+\.?\s+[^<]{3,80})<\/p>/g, (match, text) => {
      // Only if the text is short enough to be a header (not a full paragraph)
      if (text.length > 100) return match;
      count++; return `<h3>${text}</h3>`;
    });
    // Two-level numbers → H2
    html = html.replace(/<p>(\d+\.\d+\.?\s+[^<]{3,80})<\/p>/g, (match, text) => {
      if (text.length > 100) return match;
      count++; return `<h2>${text}</h2>`;
    });

    // Pattern 3: "Глава X", "ГЛАВА X", "Раздел X"
    html = html.replace(/<p>((?:Глава|ГЛАВА|Раздел|РАЗДЕЛ|Тема|ТЕМА)\s+[^<]{1,80})<\/p>/gi, (_, text) => {
      count++; return `<h2>${text}</h2>`;
    });

    // Pattern 4: ALL CAPS lines (3-80 chars, at least 2 Cyrillic letters)
    html = html.replace(/<p>([А-ЯЁ\s,.\-–():;]{3,80})<\/p>/g, (match, text) => {
      const cyrillicCount = (text.match(/[А-ЯЁ]/g) || []).length;
      if (cyrillicCount < 2 || text.length > 80) return match;
      // Check it's actually mostly uppercase
      if (text === text.toUpperCase()) {
        count++; return `<h2>${text}</h2>`;
      }
      return match;
    });

    if (count === 0) {
      showToast('Не бяха открити заглавия за конвертиране', 'error');
      return;
    }

    editor.commands.setContent(html);
    showToast(`Открити и конвертирани ${count} заглавия`, 'success');
  }, [editor, showToast]);

  // Navigate to heading in TOC
  const handleTOCNavigate = useCallback((id: string) => {
    if (!editor) return;

    const headings = editor.view.dom.querySelectorAll('h1, h2, h3');
    const index = parseInt(id.split('-')[1], 10);
    const heading = headings[index];

    if (heading) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowTOC(false);
    }
  }, [editor]);

  // Update word count and TOC when content changes
  useEffect(() => {
    if (editor) {
      const html = editor.getHTML();
      setWordCount(calculateWordCount(html));
      setTocItems(extractTOC(html));
    }
  }, [editor?.getHTML()]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false);
          setSearchQuery('');
        } else if (showTOC) {
          setShowTOC(false);
        } else {
          forceSave();
          onClose();
        }
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        forceSave();
      }
      // Ctrl+F for search
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // Ctrl+H for replace
      if (e.key === 'h' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSearch(true);
        setShowReplace(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, forceSave, showSearch, showTOC]);

  // Warn about unsaved changes before page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        // Force save before unload
        if (editor) {
          onSaveMaterialRef.current(editor.getHTML());
        }
        // Show browser warning
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editor]);

  // Format text with AI
  const formatTextWithAI = async () => {
    if (!editor) return;

    const currentText = htmlToMarkdown(editor.getHTML());
    if (!currentText.trim()) {
      alert('Няма текст за форматиране');
      return;
    }

    const apiKey = localStorage.getItem('claude-api-key');
    if (!apiKey) {
      alert('Добави API ключ в Settings');
      return;
    }

    setIsFormatting(true);

    try {
      const response = await fetchWithTimeout('/api/format-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentText,
          apiKey
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Грешка при форматиране');
      }

      // Update editor with formatted text
      const formattedHtml = markdownToHtml(data.formattedText);
      editor.commands.setContent(formattedHtml);

      // Save IMMEDIATELY - save the HTML, not the markdown!
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      onSaveMaterialRef.current(editor.getHTML());
      setLastSaved(new Date());
      setHasUnsavedChanges(false);

    } catch (error) {
      console.error('Format error:', error);
      alert(getFetchErrorMessage(error));
    } finally {
      setIsFormatting(false);
    }
  };

  if (!editor) {
    return (
      <div className="fixed inset-0 z-50 bg-stone-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-stone-400" size={32} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-50 flex flex-col">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-stone-200 z-50">
        <div className="h-full bg-amber-500" style={{ width: `${scrollProgress}%` }} />
      </div>

      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-stone-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { forceSave(); onClose(); }}
              className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="font-medium hidden sm:inline">Назад</span>
            </button>
            <div className="h-6 w-px bg-stone-300 hidden sm:block" />

            {/* Prev/Next Topic Navigation */}
            {(hasPrevTopic || hasNextTopic) && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { if (onPrevTopic) { forceSave(); onPrevTopic(); } }}
                  disabled={!hasPrevTopic}
                  className={`p-1.5 rounded-lg transition-colors ${
                    hasPrevTopic
                      ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                      : 'text-stone-300 cursor-not-allowed'
                  }`}
                  title={prevTopicName ? `← ${prevTopicName}` : 'Няма предишна тема'}
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={() => { if (onNextTopic) { forceSave(); onNextTopic(); } }}
                  disabled={!hasNextTopic}
                  className={`p-1.5 rounded-lg transition-colors ${
                    hasNextTopic
                      ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                      : 'text-stone-300 cursor-not-allowed'
                  }`}
                  title={nextTopicName ? `→ ${nextTopicName}` : 'Няма следваща тема'}
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            )}

            <div className="h-6 w-px bg-stone-300 hidden sm:block" />
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-stone-500" />
              <h1 className="font-semibold text-stone-800 truncate max-w-[200px] sm:max-w-[400px]">{topic.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Save status - always visible, prominent */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isSaving
                ? 'bg-amber-100 text-amber-700 animate-pulse'
                : hasUnsavedChanges
                  ? 'bg-red-100 text-red-600 border border-red-200'
                  : lastSaved
                    ? 'bg-green-100 text-green-700'
                    : 'bg-stone-100 text-stone-500'
            }`}>
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Записване...</span>
                </>
              ) : hasUnsavedChanges ? (
                <>
                  <AlertTriangle size={14} />
                  <span>Незапазено!</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>Запазено</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>

            {/* Word count badge */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-stone-400 bg-stone-100 px-2 py-1 rounded">
              <FileText size={12} />
              <span>{wordCount.words} думи</span>
              <span className="text-stone-300">•</span>
              <Clock size={12} />
              <span>{wordCount.readingTime} мин</span>
            </div>

            {/* Search button */}
            <button
              onClick={() => {
                setShowSearch(!showSearch);
                if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
              className={`p-2 rounded-lg transition-colors ${
                showSearch ? 'bg-amber-100 text-amber-700' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="Търсене (Ctrl+F)"
            >
              <Search size={20} />
            </button>

            {/* TOC button */}
            <button
              onClick={() => setShowTOC(!showTOC)}
              className={`p-2 rounded-lg transition-colors ${
                showTOC ? 'bg-amber-100 text-amber-700' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="Съдържание"
            >
              <ListTree size={20} />
            </button>

            {/* Focus mode toggle */}
            <button
              onClick={() => setFocusMode(!focusMode)}
              className={`p-2 rounded-lg transition-colors ${
                focusMode ? 'bg-indigo-100 text-indigo-700' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title={focusMode ? 'Изключи режим фокус' : 'Режим фокус (чисто четене)'}
            >
              <Eye size={20} />
            </button>

            {/* AI Tutor toggle */}
            <button
              onClick={() => { setShowTutor(!showTutor); if (!showTutor) setShowSidebar(false); }}
              className={`p-2 rounded-lg transition-colors ${
                showTutor ? 'bg-purple-100 text-purple-700' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title={showTutor ? 'Скрий тютора' : 'AI Тютор'}
            >
              <Brain size={20} />
            </button>

            <button
              onClick={() => { setShowSidebar(!showSidebar); if (!showSidebar) setShowTutor(false); }}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title={showSidebar ? 'Скрий панела' : 'Покажи панела'}
            >
              {showSidebar ? <PanelRightClose size={20} /> : <PanelRight size={20} />}
            </button>
            <button
              onClick={() => { forceSave(); onClose(); }}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              title="Затвори (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Formatting Toolbar - hidden in focus mode */}
        {!focusMode && (
        <div className="px-4 py-2 border-t border-stone-100 flex items-center gap-1 flex-wrap bg-stone-50/50">
          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Отмени (Ctrl+Z)"
          >
            <Undo size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Повтори (Ctrl+Y)"
          >
            <Redo size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => smartToggleHeading(1)}
            active={editor.isActive('heading', { level: 1 })}
            title="Заглавие 1 (Ctrl+Alt+1)"
          >
            <Heading1 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => smartToggleHeading(2)}
            active={editor.isActive('heading', { level: 2 })}
            title="Заглавие 2 (Ctrl+Alt+2)"
          >
            <Heading2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => smartToggleHeading(3)}
            active={editor.isActive('heading', { level: 3 })}
            title="Заглавие 3 (Ctrl+Alt+3)"
          >
            <Heading3 size={18} />
          </ToolbarButton>
<ToolbarButton
            onClick={autoDetectHeaders}
            title="Авто-откриване на заглавия (===, номерирани, ГЛАВНИ БУКВИ)"
          >
            <Sparkles size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Text formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Удебелен (Ctrl+B)"
          >
            <Bold size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Курсив (Ctrl+I)"
          >
            <Italic size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Подчертан (Ctrl+U)"
          >
            <UnderlineIcon size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Зачертан"
          >
            <Strikethrough size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleMark('superscript').run()}
            active={editor.isActive('superscript')}
            title="Горен индекс (Ctrl+Shift+.)"
          >
            <span className="text-xs font-bold">X<sup className="text-[9px]">2</sup></span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleMark('subscript').run()}
            active={editor.isActive('subscript')}
            title="Долен индекс (Ctrl+Shift+,)"
          >
            <span className="text-xs font-bold">X<sub className="text-[9px]">2</sub></span>
          </ToolbarButton>

          {/* Highlight with color picker */}
          <div className="relative" ref={highlightPickerRef}>
            <button
              onClick={() => setShowHighlightPicker(!showHighlightPicker)}
              className={`p-2 rounded transition-colors flex items-center gap-0.5 ${
                editor.isActive('highlight')
                  ? 'bg-amber-100 text-amber-700'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
              title="Маркирай с цвят"
            >
              <Highlighter size={18} />
              <ChevronDown size={12} />
            </button>
            {showHighlightPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-stone-200 p-2 z-50">
                <div className="flex gap-1">
                  {HIGHLIGHT_COLORS.map(({ name, color }) => (
                    <button
                      key={color}
                      onClick={() => {
                        editor.chain().focus().toggleHighlight({ color }).run();
                        setShowHighlightPicker(false);
                      }}
                      className="w-6 h-6 rounded border border-stone-300 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={name}
                    />
                  ))}
                  <button
                    onClick={() => {
                      editor.chain().focus().unsetHighlight().run();
                      setShowHighlightPicker(false);
                    }}
                    className="w-6 h-6 rounded border border-stone-300 hover:scale-110 transition-transform bg-white flex items-center justify-center text-stone-400"
                    title="Премахни маркиране"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Списък с точки"
          >
            <List size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Номериран списък"
          >
            <ListOrdered size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive('taskList')}
            title="Чеклист"
          >
            <CheckSquare size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Blocks */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Цитат"
          >
            <Quote size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive('codeBlock')}
            title="Код блок"
          >
            <Code2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Хоризонтална линия"
          >
            <MinusIcon size={18} />
          </ToolbarButton>

          {/* Callout block */}
          <div className="relative" ref={calloutPickerRef}>
            <button
              onClick={() => setShowCalloutPicker(!showCalloutPicker)}
              className={`p-2 rounded transition-colors flex items-center gap-0.5 ${
                editor.isActive('callout')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
              title="Callout блок"
            >
              <Info size={18} />
              <ChevronDown size={12} />
            </button>
            {showCalloutPicker && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-stone-200 p-1.5 z-50 w-48">
                {editor.isActive('callout') && (
                  <button
                    onClick={() => { editor.chain().focus().lift('callout').run(); setShowCalloutPicker(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-stone-500 hover:bg-stone-100 transition-colors"
                  >
                    <X size={14} /> Премахни callout
                  </button>
                )}
                {Object.entries(CALLOUT_TYPES).map(([type, config]) => (
                  <button
                    key={type}
                    onClick={() => {
                      editor.chain().focus().run();
                      (editor.commands as any).toggleCallout({ type });
                      setShowCalloutPicker(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-stone-100 transition-colors"
                    style={{ borderLeft: `3px solid ${config.borderColor}` }}
                  >
                    <span>{config.emoji}</span>
                    <span className="text-stone-700">{config.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Toggle block */}
          <ToolbarButton
            onClick={() => (editor.commands as any).setDetails()}
            active={editor.isActive('details')}
            title="Разгъваем блок"
          >
            <ChevronRight size={18} />
          </ToolbarButton>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Insert */}
          <ToolbarButton
            onClick={() => {
              const url = prompt('Въведи URL на изображението:');
              if (url) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            }}
            title="Добави изображение"
          >
            <ImagePlus size={18} />
          </ToolbarButton>

          {/* Table insert with grid picker */}
          <div className="relative" ref={tableGridPickerRef}>
            <button
              onClick={() => setShowTableGridPicker(!showTableGridPicker)}
              className={`p-2 rounded transition-colors flex items-center gap-0.5 ${
                editor.isActive('table')
                  ? 'bg-amber-100 text-amber-700'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
              title="Вмъкни таблица"
            >
              <TableIcon size={18} />
              <ChevronDown size={12} />
            </button>
            {showTableGridPicker && (
              <TableGridPicker
                onSelect={(rows, cols) => {
                  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                }}
                onClose={() => setShowTableGridPicker(false)}
              />
            )}
          </div>

          {/* Table edit controls - only show when in table */}
          {editor.isActive('table') && (
            <div className="relative" ref={tableMenuRef}>
              <button
                onClick={() => setShowTableMenu(!showTableMenu)}
                className="p-2 rounded transition-colors flex items-center gap-0.5 bg-blue-100 text-blue-700 hover:bg-blue-200"
                title="Редактирай таблица"
              >
                <GripVertical size={18} />
                <ChevronDown size={12} />
              </button>
              {showTableMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-stone-200 p-2 z-50 min-w-[180px]">
                  <div className="text-xs font-medium text-stone-500 px-3 py-1 mb-1">Редове</div>
                  <button
                    onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 rounded flex items-center gap-2"
                  >
                    <PlusIcon size={14} /> Добави ред отгоре
                  </button>
                  <button
                    onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 rounded flex items-center gap-2"
                  >
                    <PlusIcon size={14} /> Добави ред отдолу
                  </button>
                  <button
                    onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Изтрий ред
                  </button>

                  <div className="border-t border-stone-200 my-2" />
                  <div className="text-xs font-medium text-stone-500 px-3 py-1 mb-1">Колони</div>
                  <button
                    onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 rounded flex items-center gap-2"
                  >
                    <PlusIcon size={14} /> Добави колона вляво
                  </button>
                  <button
                    onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 rounded flex items-center gap-2"
                  >
                    <PlusIcon size={14} /> Добави колона вдясно
                  </button>
                  <button
                    onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Изтрий колона
                  </button>

                  <div className="border-t border-stone-200 my-2" />
                  <button
                    onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Изтрий таблицата
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Link */}
          <ToolbarButton
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run();
              } else {
                const url = prompt('Въведи URL:');
                if (url) {
                  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                }
              }
            }}
            active={editor.isActive('link')}
            title={editor.isActive('link') ? 'Премахни линк' : 'Добави линк'}
          >
            {editor.isActive('link') ? <Unlink size={18} /> : <Link2 size={18} />}
          </ToolbarButton>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Rich content tools */}
          <ToolbarButton
            onClick={() => setShowFormulaModal(true)}
            title="Вмъкни формула (LaTeX)"
          >
            <Calculator size={18} />
          </ToolbarButton>
          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* Font size */}
          <div className="flex items-center gap-1">
            <Type size={16} className="text-stone-400" />
            <button
              onClick={() => setFontSize(Math.max(14, fontSize - 2))}
              className="p-1 text-stone-600 hover:bg-stone-100 rounded"
              title="По-малък шрифт"
            >
              <Minus size={14} />
            </button>
            <span className="text-xs text-stone-500 font-mono w-6 text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.min(28, fontSize + 2))}
              className="p-1 text-stone-600 hover:bg-stone-100 rounded"
              title="По-голям шрифт"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="w-px h-6 bg-stone-300 mx-1" />

          {/* AI Format */}
          <button
            onClick={formatTextWithAI}
            disabled={isFormatting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            title="Форматирай текста с AI (подрежда параграфи, без да променя съдържанието)"
          >
            {isFormatting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Wand2 size={18} />
            )}
            <span className="hidden sm:inline">{isFormatting ? 'Форматиране...' : 'AI Формат'}</span>
          </button>
        </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto"
        >
          {/* Images */}
          {topic.materialImages && topic.materialImages.length > 0 && (
            <div className="px-6 pt-6">
              <div className="space-y-4">
                {topic.materialImages.map((img, idx) => (
                  <img key={idx} src={img} alt={`Изображение ${idx + 1}`} className="max-w-full rounded-lg shadow-md" />
                ))}
              </div>
            </div>
          )}

          {/* Technique tip */}
          {techniqueTip && !techniqueTipDismissed && !focusMode && (
            <div className="mx-6 md:mx-12 lg:mx-20 mt-4 mb-2 bg-violet-500/10 border border-violet-500/30 rounded-lg px-4 py-3 flex items-start gap-3">
              <span className="text-lg flex-shrink-0 mt-0.5">{techniqueTip.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-300">{techniqueTip.name}</p>
                <p className="text-xs text-violet-400 mt-0.5 leading-relaxed">{techniqueTip.howToApply.substring(0, 200)}{techniqueTip.howToApply.length > 200 ? '...' : ''}</p>
              </div>
              <button
                onClick={() => setTechniqueTipDismissed(true)}
                className="text-violet-500 hover:text-violet-300 flex-shrink-0 mt-0.5"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Editor */}
          <article className={`py-6 pb-16 max-w-none transition-all duration-300 ${
            focusMode
              ? 'px-8 md:px-16 lg:px-32 xl:px-48 bg-stone-50'
              : 'px-6 md:px-12 lg:px-20'
          }`}>
            <style jsx global>{`
              /* Animation for toast */
              @keyframes fade-in {
                from { opacity: 0; transform: translate(-50%, 10px); }
                to { opacity: 1; transform: translate(-50%, 0); }
              }
              .animate-fade-in {
                animation: fade-in 0.2s ease-out;
              }

              .ProseMirror {
                font-family: 'Georgia', 'Charter', 'Cambria', 'Times New Roman', serif;
                font-size: ${fontSize}px;
                line-height: 1.9;
                color: #1c1917;
                letter-spacing: 0.01em;
                word-spacing: 0.05em;
                max-width: ${focusMode ? '65ch' : '80ch'};
                margin: 0 auto;
                text-rendering: optimizeLegibility;
                -webkit-font-smoothing: antialiased;
              }
              .ProseMirror:focus {
                outline: none;
              }
              .ProseMirror p {
                margin-bottom: 1.25em;
                text-align: left;
              }
              .ProseMirror h1 {
                font-size: 2em;
                font-weight: 700;
                margin-top: 2em;
                margin-bottom: 0.75em;
                color: #0c0a09;
                letter-spacing: -0.02em;
                line-height: 1.3;
                border-bottom: 2px solid #e7e5e4;
                padding-bottom: 0.3em;
              }
              .ProseMirror h2 {
                font-size: 1.6em;
                font-weight: 700;
                margin-top: 1.75em;
                margin-bottom: 0.6em;
                color: #0c0a09;
                letter-spacing: -0.01em;
                line-height: 1.35;
              }
              .ProseMirror h3 {
                font-size: 1.3em;
                font-weight: 600;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                color: #1c1917;
                line-height: 1.4;
              }
              .ProseMirror strong {
                font-weight: 700;
                color: #0c0a09;
              }
              .ProseMirror em {
                font-style: italic;
              }
              .ProseMirror u {
                text-decoration: underline;
                text-underline-offset: 2px;
              }
              .ProseMirror s {
                text-decoration: line-through;
                opacity: 0.7;
              }
              .ProseMirror mark {
                padding: 0.1em 0.3em;
                border-radius: 0.2em;
                box-decoration-break: clone;
              }
              .ProseMirror ul {
                list-style-type: disc;
                padding-left: 1.75em;
                margin-bottom: 1.25em;
              }
              .ProseMirror ul ul {
                list-style-type: circle;
                margin-bottom: 0.5em;
              }
              .ProseMirror ul ul ul {
                list-style-type: square;
                margin-bottom: 0.25em;
              }
              .ProseMirror ul ul ul ul {
                list-style-type: '–  ';
              }
              .ProseMirror ol {
                list-style-type: decimal;
                padding-left: 1.75em;
                margin-bottom: 1.25em;
              }
              .ProseMirror ol ol {
                list-style-type: lower-alpha;
                margin-bottom: 0.5em;
              }
              .ProseMirror ol ol ol {
                list-style-type: lower-roman;
                margin-bottom: 0.25em;
              }
              .ProseMirror li {
                margin-bottom: 0.4em;
                padding-left: 0.25em;
              }
              .ProseMirror li::marker {
                color: #78716c;
              }
              .ProseMirror blockquote {
                border-left: 4px solid #d97706;
                padding-left: 1.25em;
                margin-left: 0;
                margin-right: 0;
                margin-top: 1.5em;
                margin-bottom: 1.5em;
                color: #44403c;
                font-style: italic;
                background: linear-gradient(to right, rgba(217, 119, 6, 0.05), transparent);
                padding: 1em 1.25em;
                border-radius: 0 0.5em 0.5em 0;
              }
              .ProseMirror p.is-editor-empty:first-child::before {
                content: attr(data-placeholder);
                float: left;
                color: #a8a29e;
                pointer-events: none;
                height: 0;
              }
              .ProseMirror ::selection {
                background-color: #fde68a;
              }

              /* Tables */
              .ProseMirror table {
                border-collapse: collapse;
                width: 100%;
                margin: 1em 0;
                table-layout: fixed;
                overflow: hidden;
              }
              .ProseMirror th,
              .ProseMirror td {
                border: 1px solid #d6d3d1;
                padding: 0.5em 0.75em;
                vertical-align: top;
                box-sizing: border-box;
                position: relative;
              }
              .ProseMirror th {
                background-color: #f5f5f4;
                font-weight: 600;
                text-align: left;
              }
              .ProseMirror td > *,
              .ProseMirror th > * {
                margin-bottom: 0;
              }
              .ProseMirror .selectedCell:after {
                z-index: 2;
                position: absolute;
                content: "";
                left: 0; right: 0; top: 0; bottom: 0;
                background: rgba(200, 200, 255, 0.4);
                pointer-events: none;
              }
              .ProseMirror .column-resize-handle {
                position: absolute;
                right: -2px;
                top: 0;
                bottom: -2px;
                width: 4px;
                background-color: #adf;
                pointer-events: none;
              }
              .tableWrapper {
                overflow-x: auto;
              }
              .resize-cursor {
                cursor: ew-resize;
                cursor: col-resize;
              }

              /* Task lists */
              .ProseMirror ul[data-type="taskList"] {
                list-style: none;
                padding-left: 0;
              }
              .ProseMirror ul[data-type="taskList"] li {
                display: flex;
                align-items: flex-start;
                gap: 0.5em;
              }
              .ProseMirror ul[data-type="taskList"] li > label {
                flex-shrink: 0;
                user-select: none;
              }
              .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
                width: 1em;
                height: 1em;
                margin-top: 0.3em;
                cursor: pointer;
                accent-color: #f59e0b;
              }
              .ProseMirror ul[data-type="taskList"] li > div {
                flex: 1;
              }
              .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div {
                text-decoration: line-through;
                color: #78716c;
              }

              /* Code blocks */
              .ProseMirror pre {
                background: #1e1e1e;
                color: #d4d4d4;
                padding: 1em;
                border-radius: 0.5em;
                overflow-x: auto;
                margin: 1em 0;
                font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
                font-size: 0.9em;
                line-height: 1.5;
              }
              .ProseMirror pre code {
                background: none;
                padding: 0;
                font-size: inherit;
                color: inherit;
              }
              .ProseMirror code {
                background: #f5f5f4;
                padding: 0.2em 0.4em;
                border-radius: 0.25em;
                font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
                font-size: 0.9em;
                color: #c7254e;
              }
              /* Syntax highlighting */
              .ProseMirror pre .hljs-keyword { color: #569cd6; }
              .ProseMirror pre .hljs-string { color: #ce9178; }
              .ProseMirror pre .hljs-number { color: #b5cea8; }
              .ProseMirror pre .hljs-function { color: #dcdcaa; }
              .ProseMirror pre .hljs-comment { color: #6a9955; }
              .ProseMirror pre .hljs-variable { color: #9cdcfe; }
              .ProseMirror pre .hljs-class { color: #4ec9b0; }

              /* Superscript / Subscript */
              .ProseMirror sup {
                font-size: 0.75em;
                vertical-align: super;
                line-height: 0;
              }
              .ProseMirror sub {
                font-size: 0.75em;
                vertical-align: sub;
                line-height: 0;
              }

              /* Callout blocks - label */
              .ProseMirror div[data-callout]::before {
                display: block;
                font-weight: 700;
                font-size: 0.85em;
                margin-bottom: 0.3em;
                letter-spacing: 0.02em;
              }
              .ProseMirror div[data-callout="info"]::before { content: "ℹ️ Бележка"; color: #3b82f6; }
              .ProseMirror div[data-callout="important"]::before { content: "⚠️ Важно"; color: #f59e0b; }
              .ProseMirror div[data-callout="clinical"]::before { content: "💡 Клинична перла"; color: #22c55e; }
              .ProseMirror div[data-callout="danger"]::before { content: "🚨 Внимание"; color: #ef4444; }
              .ProseMirror div[data-callout="definition"]::before { content: "📖 Дефиниция"; color: #a855f7; }

              .ProseMirror div[data-callout] > p:first-child {
                margin-top: 0;
              }
              .ProseMirror div[data-callout] > p:last-child {
                margin-bottom: 0;
              }

              /* Toggle / Details blocks — Notion style */
              .ProseMirror [data-type="details"] {
                margin: 0.5em 0;
                border: none !important;
                background: none !important;
                padding: 0 !important;
              }
              .ProseMirror [data-type="details-summary"] {
                cursor: pointer;
                font-weight: 600;
                display: flex !important;
                align-items: flex-start;
                gap: 0.4em;
                padding: 0.2em 0;
                border: none !important;
                background: none !important;
                color: inherit;
                user-select: text;
              }
              .ProseMirror [data-type="details-summary"]::before {
                content: '▶';
                font-size: 0.55em;
                margin-top: 0.45em;
                transition: transform 0.15s ease;
                opacity: 0.5;
                flex-shrink: 0;
              }
              .ProseMirror [data-type="details"][data-open="true"] > [data-type="details-summary"]::before {
                transform: rotate(90deg);
              }
              .ProseMirror [data-type="details-content"] {
                padding-left: 1.4em;
                border: none !important;
                background: none !important;
              }
              .ProseMirror [data-type="details"][data-open="false"] > [data-type="details-content"] {
                display: none !important;
              }
              .ProseMirror [data-type="details-content"] > *:first-child {
                margin-top: 0;
              }
              .ProseMirror [data-type="details-content"] > *:last-child {
                margin-bottom: 0;
              }

              /* Images */
              .ProseMirror img {
                max-width: 100%;
                height: auto;
                border-radius: 0.5em;
                margin: 1em 0;
              }
              .ProseMirror img.ProseMirror-selectednode {
                outline: 3px solid #68cef8;
              }

              /* Links */
              .ProseMirror a {
                color: #2563eb;
                text-decoration: underline;
                cursor: pointer;
              }
              .ProseMirror a:hover {
                color: #1d4ed8;
              }

              /* Horizontal rule */
              .ProseMirror hr {
                border: none;
                border-top: 2px solid #d6d3d1;
                margin: 1.5em 0;
              }

              /* KaTeX formulas */
              .ProseMirror .katex-formula {
                display: inline-block;
                background: rgba(245, 158, 11, 0.1);
                padding: 0.25em 0.5em;
                border-radius: 0.25em;
                border: 1px solid rgba(245, 158, 11, 0.3);
              }
              .ProseMirror .katex {
                font-size: 1.1em;
              }
            `}</style>
            <EditorContent editor={editor} />
          </article>
        </div>

        {/* Right Sidebar */}
        {showSidebar && (
          <aside className="w-72 flex-shrink-0 bg-white border-l border-stone-200 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-stone-700 mb-3">Клавишни комбинации</h3>
            <div className="space-y-2 text-xs text-stone-500">
              <div className="flex justify-between">
                <span>Удебелен</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+B</kbd>
              </div>
              <div className="flex justify-between">
                <span>Курсив</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+I</kbd>
              </div>
              <div className="flex justify-between">
                <span>Подчертан</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+U</kbd>
              </div>
              <div className="flex justify-between">
                <span>Заглавие 1</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+Alt+1</kbd>
              </div>
              <div className="flex justify-between">
                <span>Заглавие 2</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+Alt+2</kbd>
              </div>
              <div className="flex justify-between">
                <span>Списък</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+Shift+8</kbd>
              </div>
              <div className="flex justify-between">
                <span>Запази</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Ctrl+S</kbd>
              </div>
              <div className="flex justify-between">
                <span>Затвори</span>
                <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600">Esc</kbd>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-200">
              <h3 className="text-sm font-medium text-stone-700 mb-2">Markdown shortcuts</h3>
              <div className="space-y-1 text-xs text-stone-500">
                <p><code className="bg-stone-100 px-1 rounded"># </code> Заглавие 1</p>
                <p><code className="bg-stone-100 px-1 rounded">## </code> Заглавие 2</p>
                <p><code className="bg-stone-100 px-1 rounded">### </code> Заглавие 3</p>
                <p><code className="bg-stone-100 px-1 rounded">- </code> Списък</p>
                <p><code className="bg-stone-100 px-1 rounded">1. </code> Номериран списък</p>
                <p><code className="bg-stone-100 px-1 rounded">&gt; </code> Цитат</p>
              </div>
            </div>
          </aside>
        )}

        {/* AI Tutor Panel */}
        {showTutor && (
          <aside
            className="flex-shrink-0 bg-[rgb(15,15,25)] border-l border-slate-700/50 flex overflow-hidden relative"
            style={{ width: tutorWidth }}
          >
            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-purple-500/30 active:bg-purple-500/50 z-10"
              onMouseDown={(e) => {
                e.preventDefault();
                tutorResizeRef.current = { startX: e.clientX, startW: tutorWidth };
                const onMove = (ev: MouseEvent) => {
                  if (!tutorResizeRef.current) return;
                  const diff = tutorResizeRef.current.startX - ev.clientX;
                  const newW = Math.max(300, Math.min(800, tutorResizeRef.current.startW + diff));
                  setTutorWidth(newW);
                };
                const onUp = () => {
                  tutorResizeRef.current = null;
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
            <div className="flex flex-col flex-1 overflow-hidden">
              <TutorChat
                topic={topic}
                subjectName={subjectName || ''}
                subjectTopics={subjectTopics}
                onClose={() => setShowTutor(false)}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Scroll to top */}
      {scrollProgress > 20 && (
        <button
          onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 bg-white rounded-full shadow-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:scale-110 transition-all z-40"
        >
          <ChevronUp size={24} />
        </button>
      )}

      {/* Search Bar */}
      <SearchBar
        show={showSearch}
        query={searchQuery}
        setQuery={setSearchQuery}
        replaceQuery={replaceQuery}
        setReplaceQuery={setReplaceQuery}
        showReplace={showReplace}
        setShowReplace={setShowReplace}
        onClose={() => {
          setShowSearch(false);
          setSearchQuery('');
          setReplaceQuery('');
        }}
        onNext={handleSearchNext}
        onPrev={handleSearchPrev}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
        resultsCount={searchResults}
        currentIndex={currentSearchIndex}
        inputRef={searchInputRef}
      />

      {/* Table of Contents */}
      <TableOfContents
        items={tocItems}
        show={showTOC}
        onClose={() => setShowTOC(false)}
        onNavigate={handleTOCNavigate}
      />

      {/* Save Toast */}
      <SaveToast
        show={saveToast.show}
        message={saveToast.message}
        type={saveToast.type}
        onClose={() => setSaveToast({ ...saveToast, show: false })}
      />

      {/* Status bar */}
      <div className="flex-shrink-0 h-8 bg-stone-100 border-t border-stone-200 flex items-center justify-between px-4 text-xs text-stone-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <FileText size={12} />
            {wordCount.words} думи • {wordCount.chars} символи
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            ~{wordCount.readingTime} мин четене
          </span>
        </div>
        <div className="flex items-center gap-4">
          {focusMode && <span className="text-indigo-600 font-medium">Режим фокус</span>}
        </div>
      </div>

      {/* Formula Modal */}
      <FormulaModal
        isOpen={showFormulaModal}
        onClose={() => setShowFormulaModal(false)}
        onInsert={handleInsertFormula}
      />

    </div>
  );
}
