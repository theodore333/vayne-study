import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const DetailsNode = TiptapNode.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element: HTMLElement) => element.hasAttribute('open'),
        renderHTML: (attributes: Record<string, any>) => {
          return attributes.open ? { open: '' } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setDetails: () => ({ chain }: any) => {
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

        // Check if we're at the start of a detailsSummary with empty text
        if ($from.parent.type.name === 'detailsSummary' &&
            $from.parent.textContent === '' &&
            $from.parentOffset === 0) {
          // Find the details node and replace it with its content's children
          for (let depth = $from.depth; depth >= 0; depth--) {
            if ($from.node(depth).type.name === 'details') {
              const detailsNode = $from.node(depth);
              const detailsPos = $from.before(depth);
              // Extract content from detailsContent
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
          handleDOMEvents: {
            toggle: (view, event) => {
              const target = event.target as HTMLDetailsElement;
              if (target.tagName === 'DETAILS') {
                // Prevent default browser toggle behavior conflicting with ProseMirror
                const pos = view.posAtDOM(target, 0);
                if (pos != null) {
                  const $pos = view.state.doc.resolve(pos);
                  for (let d = $pos.depth; d >= 0; d--) {
                    const node = $pos.node(d);
                    if (node.type.name === 'details') {
                      const nodePos = $pos.before(d);
                      view.dispatch(
                        view.state.tr.setNodeMarkup(nodePos, undefined, {
                          ...node.attrs,
                          open: target.open,
                        })
                      );
                      return true;
                    }
                  }
                }
              }
              return false;
            },
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
    return [{ tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name === 'detailsSummary') {
          // Move cursor to start of detailsContent
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
    return [{ tag: 'div[data-details-content]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-details-content': '' }), 0];
  },
});

/**
 * transformPastedHTML helper: wraps bare <details> content in <div data-details-content>
 * so TipTap can parse external <details> HTML correctly.
 */
export function transformDetailsHTML(html: string): string {
  return html.replace(
    /<details([^>]*)>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
    (_, attrs, summary, content) => {
      // If content is already wrapped, leave it
      if (content.includes('data-details-content')) return _;
      return `<details${attrs}><summary>${summary}</summary><div data-details-content>${content}</div></details>`;
    }
  );
}
