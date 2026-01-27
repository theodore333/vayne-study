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
import { useEffect, useCallback } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Convert markdown to HTML for TipTap
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
    // Lists
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>')
    // Line breaks - convert double newlines to paragraphs
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<h') && !html.startsWith('<p') && !html.startsWith('<ul') && !html.startsWith('<ol')) {
    html = '<p>' + html + '</p>';
  }

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>');

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

  // Get text content
  let text = div.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

export default function MaterialEditor({ value, onChange, placeholder, className }: Props) {
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
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: value ? markdownToHtml(value) : '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-[200px] p-4 ' + (className || ''),
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

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
      const html = editor.getHTML();
      const text = htmlToText(html);
      onChange(text);
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== htmlToText(editor.getHTML())) {
      const currentPos = editor.state.selection.from;
      editor.commands.setContent(value ? markdownToHtml(value) : '');
      // Try to restore cursor position
      try {
        const maxPos = editor.state.doc.content.size;
        editor.commands.setTextSelection(Math.min(currentPos, maxPos));
      } catch {
        // Ignore position errors
      }
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className={`w-full h-64 bg-slate-800/50 border border-slate-700 rounded-lg animate-pulse ${className}`} />
    );
  }

  return (
    <div className="material-editor-wrapper">
      {/* Simple Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-slate-700 bg-slate-800/30 rounded-t-lg">
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
      </div>

      {/* Editor */}
      <div className="max-h-64 overflow-y-auto bg-slate-800/50 border border-t-0 border-slate-700 rounded-b-lg">
        <EditorContent editor={editor} />
      </div>

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
      `}</style>
    </div>
  );
}
