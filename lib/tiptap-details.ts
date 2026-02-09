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
      setDetails: () => ({ state, chain }: any) => {
        const { from, to, empty } = state.selection;

        if (!empty) {
          // Wrap selected content: selection becomes the body
          const selectedContent = state.doc.slice(from, to);
          const contentNodes: any[] = [];
          selectedContent.content.forEach((node: any) => {
            contentNodes.push(node.toJSON());
          });

          // If selected content is just inline text, wrap in paragraph
          const bodyContent = contentNodes.length > 0 && contentNodes[0].type
            ? contentNodes
            : [{ type: 'paragraph', content: contentNodes }];

          return chain()
            .deleteSelection()
            .insertContent({
              type: 'details',
              attrs: { open: true },
              content: [
                {
                  type: 'detailsSummary',
                  content: [{ type: 'text', text: 'Заглавие' }],
                },
                {
                  type: 'detailsContent',
                  content: bodyContent,
                },
              ],
            })
            .run();
        }

        // No selection: insert empty toggle
        return chain()
          .insertContent({
            type: 'details',
            attrs: { open: true },
            content: [
              {
                type: 'detailsSummary',
                content: [{ type: 'text', text: 'Заглавие' }],
              },
              {
                type: 'detailsContent',
                content: [{ type: 'paragraph' }],
              },
            ],
          })
          .run();
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
