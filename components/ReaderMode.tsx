'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
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
  Calculator, GitBranch, Check, Network
} from 'lucide-react';
import { Topic, TextHighlight } from '@/lib/types';
import { mergeAttributes } from '@tiptap/core';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';
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

// Mermaid Diagram Modal
function MermaidModal({ isOpen, onClose, onInsert }: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code || !isOpen) return;

    const renderMermaid = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose'
        });

        const { svg } = await mermaid.render('mermaid-preview-reader', code);
        setPreview(svg);
        setError('');
      } catch (e) {
        setError((e as Error).message || 'Грешка в диаграмата');
        setPreview('');
      }
    };

    const timer = setTimeout(renderMermaid, 500);
    return () => clearTimeout(timer);
  }, [code, isOpen]);

  const handleInsert = () => {
    if (code && !error) {
      onInsert(code);
      setCode('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const examples = [
    {
      label: 'Flowchart',
      code: `flowchart TD
    A[Глюкоза] --> B[Гликолиза]
    B --> C[Пируват]
    C --> D{Аеробно?}
    D -->|Да| E[Цикъл на Кребс]
    D -->|Не| F[Лактат]`
    },
    {
      label: 'Sequence',
      code: `sequenceDiagram
    participant R as Рецептор
    participant G as G-protein
    participant E as Ефектор
    R->>G: Активиране
    G->>E: Сигнал
    E->>E: Отговор`
    },
    {
      label: 'Krebs Cycle',
      code: `flowchart LR
    A[Acetyl-CoA] --> B[Цитрат]
    B --> C[Изоцитрат]
    C --> D[α-кетоглутарат]
    D --> E[Сукцинил-CoA]
    E --> F[Сукцинат]
    F --> G[Фумарат]
    G --> H[Малат]
    H --> I[Оксалоацетат]
    I --> A`
    }
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white border border-stone-300 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <GitBranch size={20} className="text-green-600" />
            Вмъкни диаграма (Mermaid)
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded">
            <X size={20} className="text-stone-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-stone-500 font-medium mb-2 block">Шаблони:</label>
            <div className="flex flex-wrap gap-2">
              {examples.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => setCode(ex.code)}
                  className="px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 rounded"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">Mermaid код:</label>
              <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="flowchart TD&#10;    A[Start] --> B[End]"
                className="w-full h-64 bg-stone-50 border border-stone-300 rounded-lg p-3 text-stone-800 font-mono text-sm focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">Преглед:</label>
              <div className="h-64 bg-stone-50 border border-stone-200 rounded-lg p-4 overflow-auto flex items-center justify-center">
                {error ? (
                  <span className="text-red-500 text-sm">{error}</span>
                ) : preview ? (
                  <div dangerouslySetInnerHTML={{ __html: preview }} />
                ) : (
                  <span className="text-stone-400 text-sm">Въведи код...</span>
                )}
              </div>
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
              disabled={!code || !!error}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
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

// Markmap Modal Component
function MarkmapModal({ isOpen, onClose, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (imageData: string) => void;
}) {
  const [markdown, setMarkdown] = useState(`# Тема
## Подтема 1
### Детайл A
### Детайл B
## Подтема 2
### Детайл C
### Детайл D`);
  const svgRef = useRef<SVGSVGElement>(null);
  const [markmapInstance, setMarkmapInstance] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !svgRef.current) return;

    const loadMarkmap = async () => {
      try {
        const { Transformer } = await import('markmap-lib');
        const { Markmap } = await import('markmap-view');

        const transformer = new Transformer();
        const { root } = transformer.transform(markdown);

        // Clear previous content
        svgRef.current!.innerHTML = '';

        // Create markmap
        const mm = Markmap.create(svgRef.current!, {
          autoFit: true,
          color: (node: any) => {
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            return colors[node.state?.depth % colors.length] || colors[0];
          },
          paddingX: 20,
          duration: 300,
        }, root);

        setMarkmapInstance(mm);
      } catch (error) {
        console.error('Error loading markmap:', error);
      }
    };

    loadMarkmap();
  }, [isOpen, markdown]);

  const handleSave = async () => {
    if (!svgRef.current) return;

    try {
      // Clone SVG and prepare for export
      const svgElement = svgRef.current.cloneNode(true) as SVGSVGElement;
      const bbox = svgRef.current.getBBox();

      // Set proper dimensions
      svgElement.setAttribute('width', String(bbox.width + 40));
      svgElement.setAttribute('height', String(bbox.height + 40));
      svgElement.setAttribute('viewBox', `${bbox.x - 20} ${bbox.y - 20} ${bbox.width + 40} ${bbox.height + 40}`);

      // Add white background
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', String(bbox.x - 20));
      bg.setAttribute('y', String(bbox.y - 20));
      bg.setAttribute('width', String(bbox.width + 40));
      bg.setAttribute('height', String(bbox.height + 40));
      bg.setAttribute('fill', 'white');
      svgElement.insertBefore(bg, svgElement.firstChild);

      // Convert to data URL
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });

      // Convert SVG to PNG using canvas
      const img = new window.Image();
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // Higher resolution
        canvas.width = (bbox.width + 40) * scale;
        canvas.height = (bbox.height + 40) * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const pngData = canvas.toDataURL('image/png');
        onSave(pngData);
        onClose();
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (error) {
      console.error('Error saving markmap:', error);
      alert('Грешка при запазване на mind map');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 bg-stone-100 border-b">
        <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
          <GitBranch size={20} className="text-blue-600" />
          Mind Map (Markmap)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm"
          >
            Отказ
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
          >
            <Check size={16} />
            Запази като изображение
          </button>
        </div>
      </div>
      <div className="flex-1 flex" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Markdown Editor */}
        <div className="w-1/3 border-r border-stone-200 flex flex-col">
          <div className="p-2 bg-stone-50 border-b text-sm text-stone-600 font-medium">
            Markdown (йерархия с #)
          </div>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="flex-1 p-4 font-mono text-sm resize-none focus:outline-none"
            placeholder="# Главна тема&#10;## Подтема 1&#10;### Детайл&#10;## Подтема 2"
          />
        </div>
        {/* Markmap Preview */}
        <div className="flex-1 bg-stone-50 overflow-hidden">
          <svg ref={svgRef} className="w-full h-full" />
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
  onClose: () => void;
  onSaveHighlights: (highlights: TextHighlight[]) => void;
  onSaveMaterial: (material: string) => void;
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
  html = html.replace(/<(?!\/?(pre|code|h[1-3]|strong|em|s|blockquote|ul|ol|li|p|br|a|img|table|thead|tbody|tr|th|td|hr|mark|u|input)[^>]*>)/g, '&lt;');

  // Horizontal rule (before headers)
  html = html.replace(/^---+$/gm, '<hr>');

  // Headers (must be before other replacements)
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

  // Process lists line-by-line (prevents empty bullet points)
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList: 'none' | 'bullet' | 'task' = 'none';

  for (const line of lines) {
    // Check for task list items first
    const taskCheckedMatch = line.match(/^- \[x\] (.+)$/);
    const taskUncheckedMatch = line.match(/^- \[ \] (.+)$/);
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);

    if (taskCheckedMatch || taskUncheckedMatch) {
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
      // Only add non-empty lines
      if (line.trim()) {
        processedLines.push(line);
      }
    }
  }
  // Close any open list
  if (inList !== 'none') {
    processedLines.push('</ul>');
  }

  html = processedLines.join('\n');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map((cell: string) => cell.trim());
    const isHeader = cells.every((cell: string) => /^-+$/.test(cell));
    if (isHeader) return '<!-- table-separator -->';
    return `<tr>${cells.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`;
  });
  html = html.replace(/(<!-- table-separator -->)/g, '');
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table><tbody>${match}</tbody></table>`);

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

  // Remove empty <li> elements
  const listItems = doc.querySelectorAll('li');
  listItems.forEach(li => {
    const text = li.textContent?.trim() || '';
    if (text.length === 0 || /^[\s\u200B\u00A0]*$/.test(text)) {
      li.remove();
    }
  });

  // Remove empty <ul> and <ol> that have no children
  const lists = doc.querySelectorAll('ul, ol');
  lists.forEach(list => {
    if (list.children.length === 0) {
      list.remove();
    }
  });

  // Remove empty <p> elements (including those with only <br> or whitespace)
  const paragraphs = doc.querySelectorAll('p');
  paragraphs.forEach(p => {
    const text = p.textContent?.trim() || '';
    const hasOnlyBr = p.innerHTML.trim() === '<br>' || p.innerHTML.trim() === '';
    if (text.length === 0 || hasOnlyBr) {
      p.remove();
    }
  });

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

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, content) => {
    let result = '';
    const rows = content.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    rows.forEach((row: string, index: number) => {
      const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      const cellContents = cells.map((cell: string) => cell.replace(/<\/?t[hd][^>]*>/gi, '').trim());
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

export default function ReaderMode({ topic, subjectName, onClose, onSaveHighlights, onSaveMaterial }: ReaderModeProps) {
  const [fontSize, setFontSize] = useState(18);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showTableGridPicker, setShowTableGridPicker] = useState(false);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const [showMarkmapModal, setShowMarkmapModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    content: cleanupEmptyListItems(markdownToHtml(topic.material)),
    editorProps: {
      attributes: {
        class: 'prose prose-stone max-w-none focus:outline-none min-h-[60vh]',
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

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
    },
    onUpdate: ({ editor }) => {
      // Don't trigger save if we're already saving
      if (isSaving) return;

      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setIsSaving(true);
        try {
          const markdown = htmlToMarkdown(editor.getHTML());
          onSaveMaterial(markdown);
          setLastSaved(new Date());
          setHasUnsavedChanges(false);
        } catch (error) {
          console.error('Save error:', error);
          // Don't clear hasUnsavedChanges on error - keep showing "unsaved" state
        } finally {
          // Small delay before allowing new saves
          setTimeout(() => setIsSaving(false), 100);
        }
      }, 1000);
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

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (editor && hasUnsavedChanges) {
        const markdown = htmlToMarkdown(editor.getHTML());
        onSaveMaterial(markdown);
      }
    };
  }, [editor, hasUnsavedChanges, onSaveMaterial]);

  // Force save
  const forceSave = useCallback(() => {
    if (editor && !isSaving) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      setIsSaving(true);
      try {
        const markdown = htmlToMarkdown(editor.getHTML());
        onSaveMaterial(markdown);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Force save error:', error);
        setHasUnsavedChanges(false);
      } finally {
        setTimeout(() => setIsSaving(false), 100);
      }
    }
  }, [editor, onSaveMaterial, isSaving]);

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

  // Insert mermaid diagram into editor
  const handleInsertMermaid = async (code: string) => {
    if (!editor) return;
    try {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose'
      });
      const uniqueId = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(uniqueId, code);
      // Convert SVG to data URL for embedding
      const svgBase64 = btoa(unescape(encodeURIComponent(svg)));
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
      editor.chain().focus().setImage({ src: dataUrl, alt: 'Mermaid Diagram' }).run();
    } catch (error) {
      console.error('Mermaid error:', error);
      alert('Грешка при създаване на диаграмата');
    }
  };

  // Insert markmap mind map into editor
  const handleInsertMarkmap = (imageData: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: imageData, alt: 'Mind Map' }).run();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        forceSave();
        onClose();
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        forceSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, forceSave]);

  // Warn about unsaved changes before page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Force save before unload
        if (editor) {
          const markdown = htmlToMarkdown(editor.getHTML());
          onSaveMaterial(markdown);
        }
        // Show browser warning
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, editor, onSaveMaterial]);

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

      // Trigger save
      setHasUnsavedChanges(true);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        onSaveMaterial(data.formattedText);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      }, 500);

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
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-stone-500" />
              <h1 className="font-semibold text-stone-800 truncate max-w-[200px] sm:max-w-[400px]">{topic.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Save status */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-stone-400 mr-2">
              {isSaving ? (
                <span className="text-amber-600">Записване...</span>
              ) : hasUnsavedChanges ? (
                <span className="text-amber-500">Несъхранено</span>
              ) : lastSaved ? (
                <span className="text-green-600">Запазено</span>
              ) : null}
            </div>

            <button
              onClick={() => setShowSidebar(!showSidebar)}
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

        {/* Formatting Toolbar */}
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
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Заглавие 1 (Ctrl+Alt+1)"
          >
            <Heading1 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Заглавие 2 (Ctrl+Alt+2)"
          >
            <Heading2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Заглавие 3 (Ctrl+Alt+3)"
          >
            <Heading3 size={18} />
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
          <ToolbarButton
            onClick={() => setShowMermaidModal(true)}
            title="Вмъкни диаграма (Mermaid)"
          >
            <GitBranch size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setShowMarkmapModal(true)}
            title="Mind Map (Markmap)"
          >
            <Network size={18} />
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

          {/* Editor */}
          <article className="px-6 py-6 max-w-none">
            <style jsx global>{`
              .ProseMirror {
                font-family: 'Georgia', 'Charter', serif;
                font-size: ${fontSize}px;
                line-height: 1.8;
                color: #292524;
              }
              .ProseMirror:focus {
                outline: none;
              }
              .ProseMirror p {
                margin-bottom: 1em;
              }
              .ProseMirror h1 {
                font-size: 1.875em;
                font-weight: 700;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                color: #1c1917;
              }
              .ProseMirror h2 {
                font-size: 1.5em;
                font-weight: 700;
                margin-top: 1.25em;
                margin-bottom: 0.5em;
                color: #1c1917;
              }
              .ProseMirror h3 {
                font-size: 1.25em;
                font-weight: 600;
                margin-top: 1em;
                margin-bottom: 0.5em;
                color: #1c1917;
              }
              .ProseMirror strong {
                font-weight: 700;
                color: #1c1917;
              }
              .ProseMirror em {
                font-style: italic;
              }
              .ProseMirror u {
                text-decoration: underline;
              }
              .ProseMirror s {
                text-decoration: line-through;
              }
              .ProseMirror mark {
                padding: 0.125em 0.25em;
                border-radius: 0.25em;
              }
              .ProseMirror ul {
                list-style-type: disc;
                padding-left: 1.5em;
                margin-bottom: 1em;
              }
              .ProseMirror ol {
                list-style-type: decimal;
                padding-left: 1.5em;
                margin-bottom: 1em;
              }
              .ProseMirror li {
                margin-bottom: 0.25em;
              }
              .ProseMirror blockquote {
                border-left: 4px solid #d6d3d1;
                padding-left: 1em;
                margin-left: 0;
                margin-right: 0;
                color: #57534e;
                font-style: italic;
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

      {/* Formula Modal */}
      <FormulaModal
        isOpen={showFormulaModal}
        onClose={() => setShowFormulaModal(false)}
        onInsert={handleInsertFormula}
      />

      {/* Mermaid Modal */}
      <MermaidModal
        isOpen={showMermaidModal}
        onClose={() => setShowMermaidModal(false)}
        onInsert={handleInsertMermaid}
      />

      {/* Markmap Modal */}
      <MarkmapModal
        isOpen={showMarkmapModal}
        onClose={() => setShowMarkmapModal(false)}
        onSave={handleInsertMarkmap}
      />

    </div>
  );
}
