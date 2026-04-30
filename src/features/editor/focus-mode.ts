import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { findParagraphRange } from "./paragraph-selection";

/**
 * Focus mode: dim every line that isn't part of the paragraph containing
 * the caret. Decoration.line marks whole lines via CSS, so opacity is
 * applied uniformly across wrapped soft-wrap rows.
 */

const dimLine = Decoration.line({ class: "cm-focus-dim" });

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const head = state.selection.main.head;
  const para = findParagraphRange(state.doc, head);
  const builder = new RangeSetBuilder<Decoration>();

  if (!para) return builder.finish();

  const firstActive = state.doc.lineAt(para.from).number;
  const lastActive = state.doc.lineAt(para.to).number;

  for (const { from, to } of view.visibleRanges) {
    let lineNo = state.doc.lineAt(from).number;
    const endLineNo = state.doc.lineAt(to).number;
    while (lineNo <= endLineNo) {
      const line = state.doc.line(lineNo);
      if (lineNo < firstActive || lineNo > lastActive) {
        builder.add(line.from, line.from, dimLine);
      }
      lineNo++;
    }
  }
  return builder.finish();
}

export const focusModeExtension = ViewPlugin.fromClass(
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
