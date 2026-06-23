import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * Conceal markup: hide the syntax markers of inline emphasis/code and ATX
 * headings so the text reads clean while staying fully editable. The styling
 * (bold weight, italic, heading size) is already supplied by
 * `splotHighlightStyle`; this extension only removes the `*`, `_`, `` ` ``,
 * `###` markers themselves.
 *
 * Markers on the line(s) touched by the selection are *revealed* so the caret
 * never lands in invisible text and editing the syntax stays comfortable. This
 * is the standard "Live Preview" behaviour.
 */

// Lezer node names (from @codemirror/lang-markdown) for the marker tokens we
// want to drop. These are the delimiters only, never the styled content.
const MARKER_NODES = new Set([
  "EmphasisMark", // * or _ around italic
  "StrongEmphasisMark", // ** or __ around bold
  "CodeMark", // ` around inline code
  "StrikethroughMark", // ~~ around strikethrough
]);

// HeaderMark covers the leading `#`s of an ATX heading. We hide the marker and
// the single space that follows it, so `### Title` renders as just `Title`.
const HEADER_MARK = "HeaderMark";

const hidden = Decoration.replace({});

function lineNumbersTouchedBySelection(view: EditorView): Set<number> {
  const lines = new Set<number>();
  const { doc } = view.state;
  for (const range of view.state.selection.ranges) {
    const first = doc.lineAt(range.from).number;
    const last = doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const active = lineNumbersTouchedBySelection(view);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const isHeader = node.name === HEADER_MARK;
        if (!isHeader && !MARKER_NODES.has(node.name)) return;

        // Don't hide markers on a line the caret/selection is on — keep them
        // editable. A node never spans lines for the markers we handle.
        const lineNo = doc.lineAt(node.from).number;
        if (active.has(lineNo)) return;

        let end = node.to;
        if (isHeader) {
          // Swallow the single space between the `#`s and the heading text.
          if (end < doc.length && doc.sliceString(end, end + 1) === " ") {
            end += 1;
          }
        }
        if (end > node.from) builder.add(node.from, end, hidden);
      },
    });
  }
  return builder.finish();
}

export const concealMarkupExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
