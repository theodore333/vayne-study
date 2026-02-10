import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Toggle/collapsible blocks for TipTap.
 *
 * Renders as <div> with data attributes in the editor (ProseMirror controls DOM).
 * Parses <details><summary> from external HTML paste.
 * Stored as div format (same as rendered).
 */

export const DetailsNode = TiptapNode.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element: HTMLElement) => {
          // Native <details>: check open attribute
          if (element.tagName === 'DETAILS') return element.hasAttribute('open');
          // Our divs: check data-open
          return element.getAttribute('data-open') !== 'false';
        },
        renderHTML: (attributes: Record<string, any>) => {
          return { 'data-open': attributes.open ? 'true' : 'false' };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'details' },
      { tag: 'div[data-type="details"]' },
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details' }), 0];
  },

  addCommands() {
    return {
      setDetails: () => ({ state, tr, dispatch }: any) => {
        const { from, to, empty } = state.selection;
        const schema = state.schema;

        if (!schema.nodes.details || !schema.nodes.detailsSummary || !schema.nodes.detailsContent) return false;

        if (!empty) {
          const $from = state.doc.resolve(from);
          const $to = state.doc.resolve(to);

          // Find depth where parent can accept a details block (doc or detailsContent)
          let wrapDepth = $from.depth;
          while (wrapDepth > 1) {
            const parentName = $from.node(wrapDepth - 1).type.name;
            if (parentName === 'doc' || parentName === 'detailsContent') break;
            wrapDepth--;
          }
          if (wrapDepth === 0) return false;

          const blockStart = $from.before(wrapDepth);
          const blockEnd = $to.after(Math.min(wrapDepth, $to.depth));
          const parentNode = $from.node(wrapDepth - 1);

          // Collect blocks at this depth level
          const blocks: any[] = [];
          state.doc.nodesBetween(blockStart, blockEnd, (node: any, pos: number, parent: any) => {
            if (parent === parentNode) {
              blocks.push(node);
              return false; // don't descend into the block
            }
            return true;
          });

          if (blocks.length === 0) return false;

          // If first block is a textblock (paragraph, heading), its content becomes the summary.
          // If first block is non-textblock (list, table), ALL blocks go into body with placeholder summary.
          const firstBlock = blocks[0];
          let summary: any;
          let bodyBlocks: any[];

          if (firstBlock.isTextblock && firstBlock.content.size > 0) {
            summary = schema.nodes.detailsSummary.create(null, firstBlock.content);
            bodyBlocks = blocks.length > 1
              ? blocks.slice(1)
              : [schema.nodes.paragraph.create()];
          } else {
            // Non-textblock (list, table, etc.) — put ALL blocks in body, don't discard anything
            summary = schema.nodes.detailsSummary.create(null, schema.text('Заглавие'));
            bodyBlocks = blocks;
          }

          const content = schema.nodes.detailsContent.create(null, bodyBlocks);
          const details = schema.nodes.details.create({ open: true }, [summary, content]);

          if (dispatch) {
            tr.replaceWith(blockStart, blockEnd, details);
            dispatch(tr);
          }
          return true;
        }

        // No selection: insert empty toggle with cursor in summary
        const summary = schema.nodes.detailsSummary.create(null, schema.text('Заглавие'));
        const paragraph = schema.nodes.paragraph.create();
        const content = schema.nodes.detailsContent.create(null, paragraph);
        const details = schema.nodes.details.create({ open: true }, [summary, content]);

        if (dispatch) {
          tr.replaceSelectionWith(details);
          dispatch(tr);
        }
        return true;
      },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, dispatch } = this.editor.view;
        const { $from, empty } = state.selection;

        if (!empty) return false;

        if ($from.parent.type.name === 'detailsSummary' &&
            $from.parent.textContent === '' &&
            $from.parentOffset === 0) {
          for (let depth = $from.depth; depth >= 0; depth--) {
            if ($from.node(depth).type.name === 'details') {
              const detailsNode = $from.node(depth);
              const detailsPos = $from.before(depth);
              const contentNode = detailsNode.child(1); // detailsContent
              const tr = state.tr;
              tr.replaceWith(detailsPos, detailsPos + detailsNode.nodeSize, contentNode.content);
              dispatch(tr);
              return true;
            }
          }
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('detailsToggle'),
        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement;
            const summaryEl = target.closest('[data-type="details-summary"]');
            if (!summaryEl) return false;

            // Only toggle if click is on the arrow area (left ~24px).
            // Clicking on text should place cursor for editing, not toggle.
            const rect = (summaryEl as HTMLElement).getBoundingClientRect();
            if (event.clientX - rect.left > 24) return false;

            const detailsEl = summaryEl.closest('[data-type="details"]');
            if (!detailsEl) return false;

            const detailsPos = view.posAtDOM(detailsEl, 0);
            if (detailsPos == null) return false;

            const $pos = view.state.doc.resolve(detailsPos);
            for (let d = $pos.depth; d >= 0; d--) {
              const node = $pos.node(d);
              if (node.type.name === 'details') {
                const nodePos = $pos.before(d);
                view.dispatch(
                  view.state.tr.setNodeMarkup(nodePos, undefined, {
                    ...node.attrs,
                    open: !node.attrs.open,
                  })
                );
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});

export const DetailsSummary = TiptapNode.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,
  isolating: true,

  parseHTML() {
    return [
      { tag: 'summary' },
      { tag: 'div[data-type="details-summary"]' },
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details-summary' }), 0];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name === 'detailsSummary') {
          const afterSummary = $from.after($from.depth);
          this.editor.commands.setTextSelection(afterSummary + 1);
          return true;
        }
        return false;
      },
    };
  },
});

export const DetailsContent = TiptapNode.create({
  name: 'detailsContent',
  content: 'block+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="details-content"]' },
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details-content' }), 0];
  },
});

/**
 * transformPastedHTML: converts native <details> to our div structure,
 * so TipTap can parse external HTML correctly.
 * Uses DOM-based approach to handle nested toggles safely.
 */
export function transformDetailsHTML(html: string): string {
  if (!html.includes('<details')) return html;
  if (typeof DOMParser === 'undefined') return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Process innermost first (querySelectorAll returns document order,
  // but replacing from leaves to root avoids nesting issues)
  const convert = () => {
    const elements = doc.querySelectorAll('details');
    if (elements.length === 0) return false;
    elements.forEach(details => {
      const div = doc.createElement('div');
      div.setAttribute('data-type', 'details');
      div.setAttribute('data-open', details.hasAttribute('open') ? 'true' : 'false');

      const summary = details.querySelector(':scope > summary');
      if (summary) {
        const summaryDiv = doc.createElement('div');
        summaryDiv.setAttribute('data-type', 'details-summary');
        summaryDiv.innerHTML = summary.innerHTML;
        div.appendChild(summaryDiv);
      }

      const contentDiv = doc.createElement('div');
      contentDiv.setAttribute('data-type', 'details-content');
      // Move all non-summary children into content wrapper
      Array.from(details.childNodes).forEach(child => {
        if (child instanceof Element && child.tagName === 'SUMMARY') return;
        contentDiv.appendChild(child.cloneNode(true));
      });
      if (contentDiv.childNodes.length === 0) {
        contentDiv.innerHTML = '<p></p>';
      }
      div.appendChild(contentDiv);

      details.replaceWith(div);
    });
    return true;
  };

  convert();
  return doc.body.innerHTML;
}

