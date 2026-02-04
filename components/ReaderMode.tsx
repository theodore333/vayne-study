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
  Calculator, GitBranch, Pencil, Check, Library
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

// Medical Image Library
const MEDICAL_IMAGE_LIBRARY: Record<string, Array<{ name: string; description: string; url: string; tags: string[] }>> = {
  'Биохимия': [
    {
      name: 'Цикъл на Кребс',
      description: 'Цитратен цикъл - основен метаболитен път',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Citric_acid_cycle_with_aconitate_2.svg/800px-Citric_acid_cycle_with_aconitate_2.svg.png',
      tags: ['krebs', 'цитратен', 'метаболизъм', 'митохондрии']
    },
    {
      name: 'Гликолиза',
      description: 'Разграждане на глюкоза до пируват',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Glycolysis_metabolic_pathway_3_annotated.svg/800px-Glycolysis_metabolic_pathway_3_annotated.svg.png',
      tags: ['гликолиза', 'глюкоза', 'пируват', 'ATP']
    },
    {
      name: 'Електрон-транспортна верига',
      description: 'Окислително фосфорилиране в митохондриите',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Mitochondrial_electron_transport_chain%E2%80%94Etc4.svg/800px-Mitochondrial_electron_transport_chain%E2%80%94Etc4.svg.png',
      tags: ['ETC', 'митохондрии', 'ATP', 'NADH', 'окислително']
    },
    {
      name: 'β-окисление',
      description: 'Разграждане на мастни киселини',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Beta-Oxidation.svg/800px-Beta-Oxidation.svg.png',
      tags: ['бета', 'мастни киселини', 'ацетил-CoA']
    },
    {
      name: 'Уреен цикъл',
      description: 'Обезвреждане на амоняк в черния дроб',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Urea_cycle.svg/800px-Urea_cycle.svg.png',
      tags: ['урея', 'амоняк', 'черен дроб', 'азот']
    },
    {
      name: 'Глюконеогенеза',
      description: 'Синтез на глюкоза от не-въглехидратни източници',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Gluconeogenesis_pathway.svg/800px-Gluconeogenesis_pathway.svg.png',
      tags: ['глюконеогенеза', 'глюкоза', 'пируват', 'черен дроб']
    },
    {
      name: 'Пентозофосфатен път',
      description: 'Производство на NADPH и рибоза-5-фосфат',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Pentose_phosphate_pathway.svg/800px-Pentose_phosphate_pathway.svg.png',
      tags: ['пентозофосфатен', 'NADPH', 'рибоза', 'G6PD']
    },
    {
      name: 'Синтез на мастни киселини',
      description: 'De novo липогенеза',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Fatty_acid_synthesis.svg/800px-Fatty_acid_synthesis.svg.png',
      tags: ['мастни киселини', 'липогенеза', 'ацетил-CoA', 'малонил-CoA']
    }
  ],
  'Анатомия': [
    {
      name: 'Сърце - анатомия',
      description: 'Структура на сърцето с камери и клапи',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/800px-Diagram_of_the_human_heart_%28cropped%29.svg.png',
      tags: ['сърце', 'камери', 'клапи', 'кардиология']
    },
    {
      name: 'Нефрон',
      description: 'Структурна единица на бъбрека',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Kidney_Nephron.png/800px-Kidney_Nephron.png',
      tags: ['нефрон', 'бъбрек', 'гломерул', 'тубули']
    },
    {
      name: 'Неврон',
      description: 'Структура на нервна клетка',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Blausen_0657_MultipolarNeuron.png/800px-Blausen_0657_MultipolarNeuron.png',
      tags: ['неврон', 'аксон', 'дендрит', 'синапс']
    },
    {
      name: 'Бели дробове',
      description: 'Анатомия на дихателната система',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Illu_bronchi_lungs.jpg/800px-Illu_bronchi_lungs.jpg',
      tags: ['бели дробове', 'бронхи', 'алвеоли', 'дихателна']
    },
    {
      name: 'Черен дроб',
      description: 'Анатомия и сегменти на черния дроб',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Liver_04_Couinaud_classification_animation.gif/800px-Liver_04_Couinaud_classification_animation.gif',
      tags: ['черен дроб', 'хепатоцити', 'сегменти']
    },
    {
      name: 'Мозък - сагитален разрез',
      description: 'Структури на мозъка',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Gray720.png/800px-Gray720.png',
      tags: ['мозък', 'кора', 'малък мозък', 'мозъчен ствол']
    }
  ],
  'Физиология': [
    {
      name: 'Акционен потенциал',
      description: 'Фази на акционния потенциал',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Action_potential.svg/800px-Action_potential.svg.png',
      tags: ['акционен потенциал', 'деполяризация', 'реполяризация', 'Na+', 'K+']
    },
    {
      name: 'Сърдечен цикъл',
      description: 'Фази на сърдечния цикъл с налягания',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Wiggers_Diagram.svg/800px-Wiggers_Diagram.svg.png',
      tags: ['сърдечен цикъл', 'систола', 'диастола', 'wiggers']
    },
    {
      name: 'ЕКГ',
      description: 'Нормална електрокардиограма',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/SinusRhythmLabels.svg/800px-SinusRhythmLabels.svg.png',
      tags: ['ЕКГ', 'ECG', 'P вълна', 'QRS', 'T вълна']
    },
    {
      name: 'Хемоглобин-кислородна дисоциация',
      description: 'Крива на дисоциация на хемоглобина',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Hemoglobin_saturation_curve.svg/800px-Hemoglobin_saturation_curve.svg.png',
      tags: ['хемоглобин', 'кислород', 'сатурация', 'Bohr ефект']
    },
    {
      name: 'Рефлексна дъга',
      description: 'Компоненти на рефлексната дъга',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Afferent_%28PSF%29.svg/800px-Afferent_%28PSF%29.svg.png',
      tags: ['рефлекс', 'аферентен', 'еферентен', 'синапс']
    }
  ],
  'Хистология': [
    {
      name: 'Типове епител',
      description: 'Класификация на епителните тъкани',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Blausen_0283_EpithelialTissue.png/800px-Blausen_0283_EpithelialTissue.png',
      tags: ['епител', 'плосък', 'цилиндричен', 'кубичен']
    },
    {
      name: 'Мускулни типове',
      description: 'Скелетна, сърдечна и гладка мускулатура',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Blausen_0801_SkeletalMuscle.png/800px-Blausen_0801_SkeletalMuscle.png',
      tags: ['мускул', 'скелетен', 'сърдечен', 'гладък']
    },
    {
      name: 'Кръвни клетки',
      description: 'Еритроцити, левкоцити, тромбоцити',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Blausen_0761_RedBloodCells.png/800px-Blausen_0761_RedBloodCells.png',
      tags: ['еритроцити', 'левкоцити', 'тромбоцити', 'кръв']
    }
  ],
  'Фармакология': [
    {
      name: 'G-протеин рецептори',
      description: 'Сигнална трансдукция чрез G-протеини',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/GPCR-Zyklus.png/800px-GPCR-Zyklus.png',
      tags: ['GPCR', 'G-протеин', 'рецептор', 'сигнализация']
    },
    {
      name: 'Синапс',
      description: 'Невротрансмитерно освобождаване',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Synapse_diag1.svg/800px-Synapse_diag1.svg.png',
      tags: ['синапс', 'невротрансмитер', 'везикули', 'рецептор']
    },
    {
      name: 'Холинергичен синапс',
      description: 'Ацетилхолинова невротрансмисия',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Synapse_acetridge.jpg/800px-Synapse_acetridge.jpg',
      tags: ['ацетилхолин', 'холинергичен', 'мускаринов', 'никотинов']
    },
    {
      name: 'Адренергични рецептори',
      description: 'Алфа и бета адренорецептори',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Adrenergic_receptor_signaling.png/800px-Adrenergic_receptor_signaling.png',
      tags: ['адренергичен', 'алфа', 'бета', 'катехоламини']
    },
    {
      name: 'COX инхибиране',
      description: 'Механизъм на НСПВС',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Arachidonic_acid_metabolism.svg/800px-Arachidonic_acid_metabolism.svg.png',
      tags: ['COX', 'НСПВС', 'простагландини', 'арахидонова']
    }
  ],
  'Патофизиология': [
    {
      name: 'Възпалителен отговор',
      description: 'Каскада на възпалението',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Inflammation.svg/800px-Inflammation.svg.png',
      tags: ['възпаление', 'цитокини', 'левкоцити', 'отток']
    },
    {
      name: 'Атеросклероза',
      description: 'Формиране на атеросклеротична плака',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Endo_dysfunction_Athero.PNG/800px-Endo_dysfunction_Athero.PNG',
      tags: ['атеросклероза', 'плака', 'холестерол', 'ендотел']
    },
    {
      name: 'Тромбоза',
      description: 'Коагулационна каскада и тромбообразуване',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Coagulation_full.svg/800px-Coagulation_full.svg.png',
      tags: ['тромбоза', 'коагулация', 'фибрин', 'тромбоцити']
    },
    {
      name: 'Апоптоза',
      description: 'Програмирана клетъчна смърт',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Apoptosis_-_signals.svg/800px-Apoptosis_-_signals.svg.png',
      tags: ['апоптоза', 'каспази', 'Bcl-2', 'митохондрии']
    },
    {
      name: 'Исхемия-реперфузия',
      description: 'Увреждане при исхемия и реперфузия',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Myocardial_infarction_diagram.svg/800px-Myocardial_infarction_diagram.svg.png',
      tags: ['исхемия', 'реперфузия', 'некроза', 'ROS']
    },
    {
      name: 'Шок - патофизиология',
      description: 'Типове шок и компенсаторни механизми',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Symptoms_of_shock.png/800px-Symptoms_of_shock.png',
      tags: ['шок', 'хиповолемичен', 'кардиогенен', 'септичен']
    },
    {
      name: 'Оток - механизъм',
      description: 'Старлингови сили и формиране на оток',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Illu_capillary_microcirculation.jpg/800px-Illu_capillary_microcirculation.jpg',
      tags: ['оток', 'Старлинг', 'онкотично', 'хидростатично']
    }
  ],
  'Патоанатомия': [
    {
      name: 'Некроза - типове',
      description: 'Коагулативна, ликвефактивна, казеозна некроза',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Necrosis_types.svg/800px-Necrosis_types.svg.png',
      tags: ['некроза', 'коагулативна', 'ликвефактивна', 'казеозна']
    },
    {
      name: 'Грануломатозно възпаление',
      description: 'Структура на гранулом',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Granuloma_mac.jpg/800px-Granuloma_mac.jpg',
      tags: ['гранулом', 'гигантски клетки', 'туберкулоза', 'саркоидоза']
    },
    {
      name: 'Хипертрофия vs Хиперплазия',
      description: 'Адаптивни клетъчни промени',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Hypertrophy.png/800px-Hypertrophy.png',
      tags: ['хипертрофия', 'хиперплазия', 'атрофия', 'метаплазия']
    },
    {
      name: 'Инфаркт на миокарда',
      description: 'Морфологични промени при MI',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Heart_attack_diagram.svg/800px-Heart_attack_diagram.svg.png',
      tags: ['инфаркт', 'миокард', 'тропонин', 'некроза']
    },
    {
      name: 'Цироза на черния дроб',
      description: 'Нодуларна регенерация и фиброза',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Cirrhosis_of_the_liver_%28trichrome_stain%29.jpg/800px-Cirrhosis_of_the_liver_%28trichrome_stain%29.jpg',
      tags: ['цироза', 'фиброза', 'регенерация', 'портална хипертензия']
    },
    {
      name: 'Гломерулонефрит',
      description: 'Патология на гломерула',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Crescentic_glomerulonephritis_PAS_stain.jpg/800px-Crescentic_glomerulonephritis_PAS_stain.jpg',
      tags: ['гломерулонефрит', 'протеинурия', 'хематурия', 'нефрит']
    }
  ],
  'Микробиология': [
    {
      name: 'Gram оцветяване',
      description: 'Gram-положителни и Gram-отрицателни бактерии',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Gram_stain_01.jpg/800px-Gram_stain_01.jpg',
      tags: ['gram', 'бактерии', 'оцветяване', 'стена']
    },
    {
      name: 'Бактериална клетка',
      description: 'Структура на бактериална клетка',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Average_prokaryote_cell-_en.svg/800px-Average_prokaryote_cell-_en.svg.png',
      tags: ['бактерия', 'клетъчна стена', 'рибозоми', 'плазмид']
    },
    {
      name: 'Вирусна репликация',
      description: 'Цикъл на вирусна репликация',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/HepC_replication.png/800px-HepC_replication.png',
      tags: ['вирус', 'репликация', 'транскрипция', 'капсид']
    }
  ],
  'Имунология': [
    {
      name: 'Имунен отговор',
      description: 'Вроден и адаптивен имунитет',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Immune_response.svg/800px-Immune_response.svg.png',
      tags: ['имунитет', 'вроден', 'адаптивен', 'антитела']
    },
    {
      name: 'T-клетъчна активация',
      description: 'MHC представяне и T-клетъчен отговор',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/T_cell_activation.svg/800px-T_cell_activation.svg.png',
      tags: ['T-клетки', 'MHC', 'антиген', 'CD4', 'CD8']
    },
    {
      name: 'Антитела - структура',
      description: 'Имуноглобулинова структура',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Antibody.svg/800px-Antibody.svg.png',
      tags: ['антитела', 'IgG', 'имуноглобулин', 'Fab', 'Fc']
    },
    {
      name: 'Комплемент система',
      description: 'Каскада на комплемента',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Complement_system.svg/800px-Complement_system.svg.png',
      tags: ['комплемент', 'C3', 'MAC', 'опсонизация']
    }
  ]
};

// Image Library Modal Component
function ImageLibraryModal({ isOpen, onClose, onInsert }: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string, alt: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'collection' | 'personal'>('collection');
  const [selectedCategory, setSelectedCategory] = useState<string>('Биохимия');
  const [searchQuery, setSearchQuery] = useState('');
  const [personalImages, setPersonalImages] = useState<Array<{ name: string; url: string; tags: string[] }>>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [newImageName, setNewImageName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageTags, setNewImageTags] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load personal images from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vayne-personal-images');
    if (saved) {
      try {
        setPersonalImages(JSON.parse(saved));
      } catch {}
    }
  }, [isOpen]);

  // Save personal images to localStorage
  const savePersonalImages = (images: typeof personalImages) => {
    localStorage.setItem('vayne-personal-images', JSON.stringify(images));
    setPersonalImages(images);
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Файлът е твърде голям (макс 5MB)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewImageUrl(reader.result as string);
      setNewImageName(file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsDataURL(file);
  };

  // Add new personal image
  const handleAddPersonalImage = () => {
    if (!newImageName || !newImageUrl) return;

    const newImage = {
      name: newImageName,
      url: newImageUrl,
      tags: newImageTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    };

    savePersonalImages([...personalImages, newImage]);
    setNewImageName('');
    setNewImageUrl('');
    setNewImageTags('');
    setShowUpload(false);
  };

  // Delete personal image
  const handleDeletePersonalImage = (index: number) => {
    const updated = personalImages.filter((_, i) => i !== index);
    savePersonalImages(updated);
  };

  // Filter images by search
  const filterImages = (images: Array<{ name: string; tags: string[]; url: string; description?: string }>) => {
    if (!searchQuery) return images;
    const query = searchQuery.toLowerCase();
    return images.filter(img =>
      img.name.toLowerCase().includes(query) ||
      img.tags.some(tag => tag.toLowerCase().includes(query)) ||
      img.description?.toLowerCase().includes(query)
    );
  };

  if (!isOpen) return null;

  const categories = Object.keys(MEDICAL_IMAGE_LIBRARY);
  const collectionImages = filterImages(MEDICAL_IMAGE_LIBRARY[selectedCategory] || []);
  const filteredPersonalImages = filterImages(personalImages);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white border border-stone-300 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <ImagePlus size={20} className="text-blue-600" />
            Медицинска библиотека
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded">
            <X size={20} className="text-stone-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setActiveTab('collection')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'collection'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            📚 Колекция
          </button>
          <button
            onClick={() => setActiveTab('personal')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'personal'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            🖼️ Моя библиотека ({personalImages.length})
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-100">
          <input
            type="text"
            placeholder="Търси по име или таг..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {activeTab === 'collection' ? (
            <>
              {/* Categories sidebar */}
              <div className="w-48 border-r border-stone-200 p-2 overflow-y-auto">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Images grid */}
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {collectionImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="group bg-stone-50 rounded-lg overflow-hidden border border-stone-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => onInsert(img.url, img.name)}
                    >
                      <div className="aspect-square bg-white flex items-center justify-center p-2">
                        <img
                          src={img.url}
                          alt={img.name}
                          className="max-w-full max-h-full object-contain"
                          loading="lazy"
                        />
                      </div>
                      <div className="p-2 border-t border-stone-200">
                        <p className="text-sm font-medium text-stone-800 truncate">{img.name}</p>
                        <p className="text-xs text-stone-500 truncate">{img.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {collectionImages.length === 0 && (
                  <p className="text-center text-stone-400 py-8">Няма резултати</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 p-4 overflow-y-auto">
              {/* Upload button */}
              {!showUpload ? (
                <button
                  onClick={() => setShowUpload(true)}
                  className="mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
                >
                  <Plus size={16} />
                  Добави изображение
                </button>
              ) : (
                <div className="mb-4 p-4 bg-stone-50 rounded-lg border border-stone-200">
                  <h4 className="font-medium text-stone-700 mb-3">Ново изображение</h4>
                  <div className="space-y-3">
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded text-sm"
                      >
                        Избери файл
                      </button>
                      <span className="ml-2 text-xs text-stone-500">или</span>
                      <input
                        type="text"
                        placeholder="URL на изображение"
                        value={newImageUrl}
                        onChange={e => setNewImageUrl(e.target.value)}
                        className="ml-2 px-2 py-1 border border-stone-300 rounded text-sm w-64"
                      />
                    </div>
                    {newImageUrl && (
                      <div className="w-32 h-32 bg-white border rounded overflow-hidden">
                        <img src={newImageUrl} alt="Preview" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Име на изображението"
                      value={newImageName}
                      onChange={e => setNewImageName(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Тагове (разделени със запетая)"
                      value={newImageTags}
                      onChange={e => setNewImageTags(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddPersonalImage}
                        disabled={!newImageName || !newImageUrl}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
                      >
                        Запази
                      </button>
                      <button
                        onClick={() => { setShowUpload(false); setNewImageName(''); setNewImageUrl(''); setNewImageTags(''); }}
                        className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded text-sm"
                      >
                        Отказ
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Personal images grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredPersonalImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="group bg-stone-50 rounded-lg overflow-hidden border border-stone-200 hover:border-blue-400 hover:shadow-md transition-all relative"
                  >
                    <div
                      className="aspect-square bg-white flex items-center justify-center p-2 cursor-pointer"
                      onClick={() => onInsert(img.url, img.name)}
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="p-2 border-t border-stone-200">
                      <p className="text-sm font-medium text-stone-800 truncate">{img.name}</p>
                      <p className="text-xs text-stone-400 truncate">{img.tags.join(', ')}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePersonalImage(idx); }}
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Изтрий"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {filteredPersonalImages.length === 0 && !showUpload && (
                <p className="text-center text-stone-400 py-8">
                  Нямаш запазени изображения. Добави първото!
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Drawing Modal with Excalidraw
function DrawingModal({ isOpen, onClose, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (imageData: string) => void;
}) {
  const [ExcalidrawComponent, setExcalidrawComponent] = useState<any>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  useEffect(() => {
    if (isOpen && !ExcalidrawComponent) {
      import('@excalidraw/excalidraw').then(module => {
        setExcalidrawComponent(() => module.Excalidraw);
      });
    }
  }, [isOpen, ExcalidrawComponent]);

  const handleSave = async () => {
    if (excalidrawAPI) {
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();

        const { exportToBlob } = await import('@excalidraw/excalidraw');
        const blob = await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
        });

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          onSave(base64);
          onClose();
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error('Error saving drawing:', error);
        alert('Грешка при запазване на скицата');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 bg-stone-100 border-b">
        <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
          <Pencil size={20} className="text-purple-600" />
          Рисуване / Скица
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
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm flex items-center gap-2"
          >
            <Check size={16} />
            Запази като изображение
          </button>
        </div>
      </div>
      <div className="flex-1" style={{ height: 'calc(100vh - 60px)' }}>
        {ExcalidrawComponent ? (
          <ExcalidrawComponent
            excalidrawAPI={(api: any) => setExcalidrawAPI(api)}
            theme="light"
            langCode="en"
            initialData={{
              elements: [],
              appState: {
                viewBackgroundColor: '#ffffff',
                currentItemFontFamily: 1,
              },
            }}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                export: false,
                saveAsImage: false,
              },
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-purple-500" size={32} />
            <span className="ml-2 text-stone-500">Зареждане на Excalidraw...</span>
          </div>
        )}
      </div>
    </div>
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

  // Helper to sanitize URLs (prevent javascript: and data: XSS)
  const sanitizeUrl = (url: string): string => {
    // Decode URL-encoded characters to catch obfuscation attempts
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      // If decoding fails, use original (it might not be encoded)
    }
    const trimmed = decoded.trim().toLowerCase().replace(/\s/g, '');
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
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    `<img src="${sanitizeUrl(src)}" alt="${alt}">`
  );

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

  // Task lists (before regular lists)
  html = html.replace(/^- \[x\] (.+)$/gm, '<li data-type="taskItem" data-checked="true">$1</li>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<li data-type="taskItem" data-checked="false">$1</li>');

  // Unordered lists (only if there's content after the dash)
  html = html.replace(/^[-*] +(.+)$/gm, '<li>$1</li>');

  // Ordered lists (only if there's content after the number)
  html = html.replace(/^\d+\. +(.+)$/gm, '<li>$1</li>');

  // Wrap consecutive task items in taskList
  html = html.replace(/(<li data-type="taskItem"[^>]*>.*?<\/li>\n?)+/g, (match) => `<ul data-type="taskList">${match}</ul>`);

  // Wrap consecutive regular <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

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

  // Regular lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let i = 1;
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${i++}. $1\n`) + '\n';
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

  // Clean up extra whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
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
  const [showDrawingModal, setShowDrawingModal] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);

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
    content: markdownToHtml(topic.material),
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
      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        const markdown = htmlToMarkdown(editor.getHTML());
        onSaveMaterial(markdown);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
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
    if (editor) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const markdown = htmlToMarkdown(editor.getHTML());
      onSaveMaterial(markdown);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    }
  }, [editor, onSaveMaterial]);

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

  // Insert drawing into editor
  const handleInsertDrawing = (imageData: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: imageData, alt: 'Drawing' }).run();
  };

  // Insert image from library
  const handleInsertLibraryImage = (url: string, alt: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url, alt }).run();
    setShowImageLibrary(false);
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

  // Toolbar button component
  const ToolbarButton = ({ onClick, active, disabled, children, title }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded bg-transparent transition-all duration-150 ${
        active
          ? 'bg-amber-100 text-amber-700'
          : 'text-stone-600 hover:bg-stone-200 hover:text-stone-900'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
      title={title}
    >
      {children}
    </button>
  );

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
              {hasUnsavedChanges ? (
                <span className="text-amber-600">Записване...</span>
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
            onClick={() => setShowImageLibrary(true)}
            title="Медицинска библиотека"
          >
            <Library size={18} />
          </ToolbarButton>
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
            onClick={() => setShowDrawingModal(true)}
            title="Рисуване / Скица"
          >
            <Pencil size={18} />
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

      {/* Drawing Modal */}
      <DrawingModal
        isOpen={showDrawingModal}
        onClose={() => setShowDrawingModal(false)}
        onSave={handleInsertDrawing}
      />

      {/* Image Library Modal */}
      <ImageLibraryModal
        isOpen={showImageLibrary}
        onClose={() => setShowImageLibrary(false)}
        onInsert={handleInsertLibraryImage}
      />

    </div>
  );
}
