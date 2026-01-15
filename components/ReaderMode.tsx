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
  MinusIcon, GripVertical, AlignLeft, AlignCenter, AlignRight
} from 'lucide-react';
import { Topic, TextHighlight } from '@/lib/types';
import { mergeAttributes } from '@tiptap/core';

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

interface ReaderModeProps {
  topic: Topic;
  subjectName?: string;
  onClose: () => void;
  onSaveHighlights: (highlights: TextHighlight[]) => void;
  onSaveMaterial: (material: string) => void;
}

// Convert markdown to HTML for initial load
function markdownToHtml(markdown: string): string {
  if (!markdown) return '<p></p>';

  let html = markdown;

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

  // Images (before links)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

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

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

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
      const response = await fetch('/api/format-text', {
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
      alert(error instanceof Error ? error.message : 'Грешка при форматиране');
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
      className={`p-2 rounded transition-colors ${
        active
          ? 'bg-amber-100 text-amber-700'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
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
        <div className="h-full bg-amber-500 transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
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

    </div>
  );
}
