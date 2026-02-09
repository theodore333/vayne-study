'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ImagePlus, Calculator, Pencil, X, Check, ChevronRight } from 'lucide-react';
import { DetailsNode, DetailsSummary, DetailsContent, transformDetailsHTML } from '@/lib/tiptap-details';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Convert markdown to HTML for TipTap
function markdownToHtml(markdown: string): string {
  // Remove empty lines that only have whitespace
  let text = markdown.replace(/^\s*$/gm, '');

  // Process lists first - group consecutive list items
  const lines = text.split('\n');
  const processedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);

    if (bulletMatch || numberedMatch) {
      const content = bulletMatch ? bulletMatch[1] : numberedMatch![1];
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }
      processedLines.push(`<li>${content}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      if (line.trim()) {
        processedLines.push(line);
      }
    }
  }
  if (inList) {
    processedLines.push('</ul>');
  }

  let html = processedLines.join('\n')
    // Escape HTML in non-tag content (skip tags we created)
    .replace(/&(?!amp;|lt;|gt;)/g, '&amp;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>')
    // Line breaks - but not inside lists
    .replace(/\n\n+/g, '</p><p>')
    .replace(/(?<!<\/li>|<ul>|<\/ul>)\n(?!<li>|<\/ul>|<ul>)/g, '<br>');

  // Clean up empty paragraphs and breaks around lists
  html = html
    .replace(/<br><ul>/g, '<ul>')
    .replace(/<\/ul><br>/g, '</ul>')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>')
    .replace(/<\/p><p>/g, '</p>\n<p>')
    .replace(/<br><br>/g, '</p><p>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<h') && !html.startsWith('<p') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<blockquote')) {
    html = '<p>' + html + '</p>';
  }

  // Clean up empty elements
  html = html
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<li>\s*<\/li>/g, '')
    .replace(/<ul>\s*<\/ul>/g, '');

  return html;
}

// Convert HTML to plain text for storage (preserves some formatting)
function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Convert headers back to markdown
  div.querySelectorAll('h1').forEach(el => {
    el.outerHTML = `# ${el.textContent}\n\n`;
  });
  div.querySelectorAll('h2').forEach(el => {
    el.outerHTML = `## ${el.textContent}\n\n`;
  });
  div.querySelectorAll('h3').forEach(el => {
    el.outerHTML = `### ${el.textContent}\n\n`;
  });

  // Convert bold/italic
  div.querySelectorAll('strong, b').forEach(el => {
    el.outerHTML = `**${el.textContent}**`;
  });
  div.querySelectorAll('em, i').forEach(el => {
    el.outerHTML = `*${el.textContent}*`;
  });

  // Convert lists
  div.querySelectorAll('li').forEach(el => {
    el.outerHTML = `- ${el.textContent}\n`;
  });

  // Convert blockquotes
  div.querySelectorAll('blockquote').forEach(el => {
    el.outerHTML = `> ${el.textContent}\n`;
  });

  // Convert images to special markers
  div.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || 'image';
    img.outerHTML = `[IMG:${alt}:${src}]\n`;
  });

  // Convert KaTeX formulas to special markers
  div.querySelectorAll('.katex-formula').forEach(span => {
    const formula = span.getAttribute('data-formula');
    if (formula) {
      span.outerHTML = `[FORMULA:${formula}]`;
    }
  });

  // Convert tables to tab-separated
  div.querySelectorAll('table').forEach(table => {
    const rows: string[] = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('td, th').forEach(cell => {
        cells.push(cell.textContent || '');
      });
      rows.push(cells.join('\t'));
    });
    table.outerHTML = rows.join('\n') + '\n\n';
  });

  // Get text content - add newlines around block-level elements before stripping tags
  let text = div.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/(p|ul|ol)>/gi, '\n')
    .replace(/<(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

// Parse image and formula markers back to HTML
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Calculator size={20} className="text-cyan-400" />
            Вмъкни формула (LaTeX)
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick examples */}
          <div>
            <label className="text-xs text-slate-500 font-mono mb-2 block">Примери:</label>
            <div className="flex flex-wrap gap-2">
              {examples.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => setFormula(ex.code)}
                  className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div>
            <label className="text-xs text-slate-500 font-mono mb-1 block">LaTeX код:</label>
            <textarea
              value={formula}
              onChange={e => setFormula(e.target.value)}
              placeholder="Напиши LaTeX формула... напр. H_2O или \frac{1}{2}"
              className="w-full h-24 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Preview */}
          <div>
            <label className="text-xs text-slate-500 font-mono mb-1 block">Преглед:</label>
            <div className="min-h-[60px] bg-white rounded-lg p-4 flex items-center justify-center">
              {error ? (
                <span className="text-red-500 text-sm font-mono">{error}</span>
              ) : preview ? (
                <div dangerouslySetInnerHTML={{ __html: preview }} />
              ) : (
                <span className="text-slate-400 text-sm">Въведи формула...</span>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-mono text-sm"
            >
              Отказ
            </button>
            <button
              onClick={handleInsert}
              disabled={!formula || !!error}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-mono text-sm flex items-center gap-2 disabled:opacity-50"
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

// Drawing Modal with Excalidraw
function DrawingModal({ isOpen, onClose, onSave, initialData }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (imageData: string) => void;
  initialData?: string;
}) {
  const [Excalidraw, setExcalidraw] = useState<any>(null);
  const excalidrawRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      import('@excalidraw/excalidraw').then(module => {
        setExcalidraw(() => module.Excalidraw);
      });
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (excalidrawRef.current) {
      const elements = excalidrawRef.current.getSceneElements();
      const appState = excalidrawRef.current.getAppState();

      // Export to PNG
      const { exportToBlob } = await import('@excalidraw/excalidraw');
      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true },
        files: excalidrawRef.current.getFiles(),
      });

      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        onSave(base64);
        onClose();
      };
      reader.readAsDataURL(blob);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between p-3 bg-slate-100 border-b">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Pencil size={20} className="text-purple-600" />
          Рисуване / Скица
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-mono text-sm"
          >
            Отказ
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-mono text-sm flex items-center gap-2"
          >
            <Check size={16} />
            Запази като изображение
          </button>
        </div>
      </div>
      <div className="flex-1">
        {Excalidraw ? (
          <Excalidraw
            ref={excalidrawRef}
            theme="light"
            langCode="en"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-slate-500">Зареждане...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MaterialEditor({ value, onChange, placeholder, className }: Props) {
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showDrawingModal, setShowDrawingModal] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isInternalUpdateRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Постави текст тук...',
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      DetailsNode,
      DetailsSummary,
      DetailsContent,
    ],
    content: value
      ? (value.trim().startsWith('<')
        ? value  // Already HTML (saved by ReaderMode), use directly
        : parseMarkers(markdownToHtml(value)))  // Markdown, convert to HTML
      : '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[200px] p-4 ' + (className || ''),
      },
      transformPastedHTML(html) {
        return transformDetailsHTML(html);
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Check for images in clipboard
        const items = Array.from(clipboardData.items);
        const imageItem = items.find(item => item.type.startsWith('image/'));

        if (imageItem) {
          event.preventDefault();
          const file = imageItem.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              editor?.chain().focus().setImage({ src: base64 }).run();
            };
            reader.readAsDataURL(file);
          }
          return true;
        }

        // Check for HTML content first
        const html = clipboardData.getData('text/html');
        if (html) {
          // Let TipTap handle native HTML
          return false;
        }

        // Handle plain text with markdown
        const text = clipboardData.getData('text/plain');
        if (!text) return false;

        // Check if it looks like a table (tab-separated)
        const lines = text.trim().split('\n');
        const isTabSeparatedTable = lines.length > 1 && lines.every(line => line.includes('\t'));

        // Check if it contains markdown formatting
        const hasMarkdown = /(\*\*|__|\*|_|~~|^#|^>|^-\s|^\d+\.\s|```|\|.+\|)/m.test(text);

        if (isTabSeparatedTable) {
          event.preventDefault();
          // Convert tab-separated to HTML table
          const rows = lines.map(line => {
            const cells = line.split('\t');
            return `<tr>${cells.map(cell => `<td>${cell.trim()}</td>`).join('')}</tr>`;
          });
          const headerRow = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
          const bodyRows = rows.slice(1).join('');
          const tableHtml = `<table><thead><tr>${headerRow.replace(/<\/?tr>/g, '')}</tr></thead><tbody>${bodyRows}</tbody></table>`;

          editor?.commands.insertContent(tableHtml);
          return true;
        }

        if (hasMarkdown) {
          event.preventDefault();
          const convertedHtml = markdownToHtml(text);
          editor?.commands.insertContent(convertedHtml);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdateRef.current = true;
      const html = editor.getHTML();
      const text = htmlToText(html);
      onChange(text);
    },
  });

  // Update editor content when value changes externally (not from editor's own onUpdate)
  useEffect(() => {
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }
    if (editor && value !== htmlToText(editor.getHTML())) {
      const currentPos = editor.state.selection.from;
      const content = value
        ? (value.trim().startsWith('<') ? value : parseMarkers(markdownToHtml(value)))
        : '';
      editor.commands.setContent(content);
      // Try to restore cursor position
      try {
        const maxPos = editor.state.doc.content.size;
        editor.commands.setTextSelection(Math.min(currentPos, maxPos));
      } catch {
        // Ignore position errors
      }
    }
  }, [value, editor]);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      editor.chain().focus().setImage({ src: base64 }).run();
    };
    reader.readAsDataURL(file);

    // Reset input
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  // Insert formula as rendered image
  const handleInsertFormula = (formula: string) => {
    if (!editor) return;

    try {
      const html = katex.renderToString(formula, {
        throwOnError: true,
        displayMode: false,
        output: 'html'
      });

      // Insert as HTML span with special class
      editor.chain().focus().insertContent(
        `<span class="katex-formula" data-formula="${encodeURIComponent(formula)}">${html}</span>`
      ).run();
    } catch (e) {
      console.error('KaTeX error:', e);
    }
  };

  // Insert drawing as image
  const handleInsertDrawing = (imageData: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: imageData, alt: 'Drawing' }).run();
  };

  if (!editor) {
    return (
      <div className={`w-full h-64 bg-slate-800/50 border border-slate-700 rounded-lg animate-pulse ${className}`} />
    );
  }

  return (
    <div className="material-editor-wrapper">
      {/* Enhanced Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-slate-700 bg-slate-800/30 rounded-t-lg flex-wrap">
        {/* Basic formatting */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded hover:bg-slate-700 ${editor.isActive('bold') ? 'bg-slate-700 text-blue-400' : 'text-slate-400'}`}
          title="Bold"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded hover:bg-slate-700 ${editor.isActive('italic') ? 'bg-slate-700 text-blue-400' : 'text-slate-400'}`}
          title="Italic"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h4m-2 0v16m-4 0h8" transform="skewX(-10)" />
          </svg>
        </button>
        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Headers */}
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded hover:bg-slate-700 text-xs font-bold ${editor.isActive('heading', { level: 1 }) ? 'bg-slate-700 text-blue-400' : 'text-slate-400'}`}
          title="Heading 1"
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded hover:bg-slate-700 text-xs font-bold ${editor.isActive('heading', { level: 2 }) ? 'bg-slate-700 text-blue-400' : 'text-slate-400'}`}
          title="Heading 2"
        >
          H2
        </button>
        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* List & Highlight */}
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded hover:bg-slate-700 ${editor.isActive('bulletList') ? 'bg-slate-700 text-blue-400' : 'text-slate-400'}`}
          title="Bullet List"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
          className={`p-1.5 rounded hover:bg-slate-700 ${editor.isActive('highlight') ? 'bg-slate-700 text-yellow-400' : 'text-slate-400'}`}
          title="Highlight"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.243 4.515l-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.829 1.04-1.041 2.122-.707 6.737-6.738-4.242-4.242zm6.364 3.536a1 1 0 010 1.414l-7.778 7.778-2.122.707-1.414 1.414a1 1 0 01-1.414 0l-4.243-4.243a1 1 0 010-1.414l1.414-1.414.707-2.121 7.778-7.778a1 1 0 011.414 0l5.657 5.657z" />
          </svg>
        </button>

        {/* Toggle block */}
        <button
          onClick={() => (editor.commands as any).setDetails()}
          className={`p-1.5 rounded hover:bg-slate-700 ${editor.isActive('details') ? 'bg-slate-700 text-blue-400' : 'text-slate-400'}`}
          title="Разгъваем блок"
        >
          <ChevronRight size={16} />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Medical Tools */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-cyan-400"
          title="Вмъкни изображение"
        >
          <ImagePlus size={16} />
        </button>
        <button
          onClick={() => setShowFormulaModal(true)}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-cyan-400"
          title="Вмъкни формула (LaTeX)"
        >
          <Calculator size={16} />
        </button>
        <button
          onClick={() => setShowDrawingModal(true)}
          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-purple-400"
          title="Рисувай / Скицирай"
        >
          <Pencil size={16} />
        </button>
      </div>

      {/* Editor */}
      <div className="max-h-96 overflow-y-auto bg-slate-800/50 border border-t-0 border-slate-700 rounded-b-lg">
        <EditorContent editor={editor} />
      </div>

      {/* Hint */}
      <p className="mt-1 text-[10px] text-slate-600 font-mono">
        Съвет: Paste изображение директно от clipboard (Ctrl+V)
      </p>

      {/* Modals */}
      <FormulaModal
        isOpen={showFormulaModal}
        onClose={() => setShowFormulaModal(false)}
        onInsert={handleInsertFormula}
      />
      <DrawingModal
        isOpen={showDrawingModal}
        onClose={() => setShowDrawingModal(false)}
        onSave={handleInsertDrawing}
      />

      <style jsx global>{`
        .material-editor-wrapper .ProseMirror {
          min-height: 180px;
          padding: 1rem;
          color: #e2e8f0;
        }
        .material-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #64748b;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .material-editor-wrapper .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: bold;
          margin: 1rem 0 0.5rem;
          color: #f1f5f9;
        }
        .material-editor-wrapper .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: bold;
          margin: 0.75rem 0 0.5rem;
          color: #f1f5f9;
        }
        .material-editor-wrapper .ProseMirror h3 {
          font-size: 1.1rem;
          font-weight: bold;
          margin: 0.5rem 0 0.25rem;
          color: #f1f5f9;
        }
        .material-editor-wrapper .ProseMirror strong {
          font-weight: bold;
          color: #fbbf24;
        }
        .material-editor-wrapper .ProseMirror em {
          font-style: italic;
        }
        .material-editor-wrapper .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .material-editor-wrapper .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .material-editor-wrapper .ProseMirror blockquote {
          border-left: 3px solid #3b82f6;
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: #94a3b8;
        }
        .material-editor-wrapper .ProseMirror table {
          border-collapse: collapse;
          margin: 1rem 0;
          display: block;
          overflow-x: auto;
          max-width: 100%;
        }
        .material-editor-wrapper .ProseMirror th,
        .material-editor-wrapper .ProseMirror td {
          border: 1px solid #475569;
          padding: 0.5rem;
          text-align: left;
          white-space: nowrap;
        }
        .material-editor-wrapper .ProseMirror th {
          background: #334155;
          font-weight: bold;
        }
        .material-editor-wrapper .ProseMirror mark {
          background-color: #fef08a;
          color: #1e293b;
          padding: 0.1rem 0.2rem;
          border-radius: 0.2rem;
        }
        .material-editor-wrapper .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 0.5rem 0;
        }
        .material-editor-wrapper .ProseMirror .katex-formula {
          display: inline-block;
          background: rgba(6, 182, 212, 0.1);
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          border: 1px solid rgba(6, 182, 212, 0.3);
        }
        .material-editor-wrapper .ProseMirror .katex {
          font-size: 1.1em;
        }
        /* Toggle / Details blocks — Notion style */
        .material-editor-wrapper .ProseMirror [data-type="details"] {
          margin: 0.25em 0;
        }
        .material-editor-wrapper .ProseMirror [data-type="details-summary"] {
          cursor: pointer;
          font-weight: 600;
          color: #e2e8f0;
          display: flex;
          align-items: flex-start;
          gap: 0.3em;
          padding: 0.15em 0;
        }
        .material-editor-wrapper .ProseMirror [data-type="details-summary"]::before {
          content: '▶';
          font-size: 0.6em;
          margin-top: 0.4em;
          transition: transform 0.15s ease;
          opacity: 0.4;
          flex-shrink: 0;
        }
        .material-editor-wrapper .ProseMirror [data-type="details"][data-open="true"] > [data-type="details-summary"]::before {
          transform: rotate(90deg);
        }
        .material-editor-wrapper .ProseMirror [data-type="details-content"] {
          padding-left: 1.2em;
        }
        .material-editor-wrapper .ProseMirror [data-type="details"][data-open="false"] > [data-type="details-content"] {
          display: none;
        }
        .material-editor-wrapper .ProseMirror [data-type="details-content"] > *:first-child {
          margin-top: 0;
        }
        .material-editor-wrapper .ProseMirror [data-type="details-content"] > *:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
