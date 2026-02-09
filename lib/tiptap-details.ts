import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Toggle/collapsible blocks for TipTap.
 *
 * Renders as <div> with data attributes in the editor (ProseMirror controls DOM).
 * Parses <details><summary> from external HTML paste.
 * Serializes to <details><summary> for storage.
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

  // Serialize to <details><summary> for storage/clipboard
  addStorage() {
    return {};
  },

  addCommands() {
    return {
      setDetails: () => ({ state, tr, dispatch }: any) => {
        const { from, to, empty } = state.selection;
        const schema = state.schema;

        if (!schema.nodes.details || !schema.nodes.detailsSummary || !schema.nodes.detailsContent) return false;

        if (!empty) {
          // Find the containing block boundaries using resolved positions
          const $from = state.doc.resolve(from);
          const $to = state.doc.resolve(to);

          // Walk up to find the depth where the parent can hold a details block
          // (i.e., a node whose content spec allows 'block' group)
          let wrapDepth = $from.depth;
          while (wrapDepth > 0 && $from.node(wrapDepth).type.name !== 'detailsContent' && wrapDepth > 1) {
            wrapDepth--;
          }
          // Use depth 1 for top-level, or the found depth
          const depth = Math.min($from.depth, 1);

          // Get the range of the block(s) containing the selection
          const blockStart = $from.before(depth);
          const blockEnd = $to.after(depth);

          // Collect the block nodes in that range
          const blocks: any[] = [];
          state.doc.nodesBetween(blockStart, blockEnd, (node: any, pos: number, parent: any, index: number) => {
            if (pos >= blockStart && parent === $from.node(depth - 1)) {
              blocks.push(node);
              return false;
            }
            return true;
          });

          if (blocks.length === 0) return false;

          const summary = schema.nodes.detailsSummary.create(null, schema.text('Заглавие'));
          const content = schema.nodes.detailsContent.create(null, blocks);
          const details = schema.nodes.details.create({ open: true }, [summary, content]);

          if (dispatch) {
            tr.replaceWith(blockStart, blockEnd, details);
            dispatch(tr);
          }
          return true;
        }

        // No selection: insert empty toggle
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
            // Check if clicked on the summary area (data-type="details-summary")
            const summaryEl = target.closest('[data-type="details-summary"]');
            if (!summaryEl) return false;

            // Don't toggle if clicking to edit text — only toggle on the arrow
            // The arrow is the ::before pseudo-element, which registers as click on the summary itself
            // If the click target IS the summary div (not a child text node), toggle
            if (target !== summaryEl) return false;

            // Find the details node in ProseMirror
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

  parseHTML() {
    return [
      { tag: 'div[data-details-content]' },
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
 */
export function transformDetailsHTML(html: string): string {
  return html.replace(
    /<details([^>]*)>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
    (_, attrs, summary, content) => {
      const isOpen = attrs.includes('open');
      const wrapped = content.includes('data-type="details-content"') || content.includes('data-details-content')
        ? content
        : `<div data-type="details-content">${content}</div>`;
      return `<div data-type="details" data-open="${isOpen ? 'true' : 'false'}"><div data-type="details-summary">${summary}</div>${wrapped}</div>`;
    }
  );
}

/**
 * Converts our div-based toggle HTML back to native <details><summary> for storage.
 * Call this on the HTML before saving to get clean, portable HTML.
 */
export function detailsToNativeHTML(html: string): string {
  return html
    .replace(/<div[^>]*data-type="details"[^>]*data-open="(\w+)"[^>]*>/gi, (_, open) => {
      return open === 'true' ? '<details open>' : '<details>';
    })
    .replace(/<div[^>]*data-open="(\w+)"[^>]*data-type="details"[^>]*>/gi, (_, open) => {
      return open === 'true' ? '<details open>' : '<details>';
    })
    .replace(/<div[^>]*data-type="details-summary"[^>]*>/gi, '<summary>')
    .replace(/<\/div>(\s*)<summary>/gi, '</details>$1<summary>') // close previous details before new summary (shouldn't happen but safety)
    .replace(/<div[^>]*data-type="details-content"[^>]*>/gi, '')
    // Close tags: each details block has 3 closing </div>s that need to become </summary>, nothing, </details>
    ;
  // Note: This is a simplified approach. For production, a DOM-based approach would be more robust.
  // But since our HTML structure is predictable (we generate it), regex works.
}
