import { EditorSelection, type Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * Paragraph-aware selection for prose editors.
 *
 * A paragraph is a contiguous run of non-empty lines; one or more empty
 * lines separate paragraphs. The range returned by `findParagraphRange`
 * spans from the first character of the paragraph's first line to the end
 * of its last non-empty line — blank separator lines are excluded on both
 * ends, so selecting and deleting a paragraph leaves surrounding blanks
 * intact.
 */

export interface ParagraphRange {
  from: number;
  to: number;
}

/** Whitespace-only (or truly empty) lines count as paragraph separators. */
function isBlankLine(doc: Text, lineNumber: number): boolean {
  return doc.line(lineNumber).text.trim().length === 0;
}

/**
 * Return the paragraph range containing `pos`. If `pos` lands on a blank
 * line, search downward first, then upward, matching the behavior users
 * expect when triple-clicking in an empty gap between paragraphs.
 *
 * Returns `null` only when the document contains no non-blank line at all.
 */
export function findParagraphRange(doc: Text, pos: number): ParagraphRange | null {
  if (doc.length === 0) return null;

  const clamped = Math.max(0, Math.min(pos, doc.length));
  const startLine = doc.lineAt(clamped).number;

  let anchor = startLine;
  if (isBlankLine(doc, anchor)) {
    // Search down for the next non-blank line, then up as a fallback.
    let probe = anchor + 1;
    while (probe <= doc.lines && isBlankLine(doc, probe)) probe++;
    if (probe > doc.lines) {
      probe = anchor - 1;
      while (probe >= 1 && isBlankLine(doc, probe)) probe--;
      if (probe < 1) return null;
    }
    anchor = probe;
  }

  let first = anchor;
  while (first > 1 && !isBlankLine(doc, first - 1)) first--;

  let last = anchor;
  while (last < doc.lines && !isBlankLine(doc, last + 1)) last++;

  return {
    from: doc.line(first).from,
    to: doc.line(last).to,
  };
}

/**
 * Command: select the paragraph at the main selection head. Returns `true`
 * when a range was applied so CodeMirror's keymap chain stops here.
 */
export const selectParagraph = (view: EditorView): boolean => {
  const { state } = view;
  const head = state.selection.main.head;
  const range = findParagraphRange(state.doc, head);
  if (!range) return false;

  view.dispatch({
    selection: EditorSelection.single(range.from, range.to),
    scrollIntoView: true,
    userEvent: "select.paragraph",
  });
  return true;
};

/**
 * Triple-click handling. CodeMirror's default triple-click selects the
 * line; we override with paragraph selection so prose readers get the
 * intuitive gesture. We let CodeMirror place the caret first (single
 * click), then expand on the `detail === 3` event.
 */
const tripleClickParagraph = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.detail !== 3 || event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const range = findParagraphRange(view.state.doc, pos);
    if (!range) return false;

    event.preventDefault();
    view.dispatch({
      selection: EditorSelection.single(range.from, range.to),
      scrollIntoView: true,
      userEvent: "select.paragraph",
    });
    return true;
  },
});

/**
 * Keybinding for `selectParagraph`. Mod-Shift-A — free in CodeMirror's
 * default keymap and reads naturally as "select All of this (paragraph)".
 */
export const paragraphKeymap = keymap.of([
  { key: "Mod-Shift-a", run: selectParagraph, preventDefault: true },
]);

/** Extension bundle: triple-click + keybinding. */
export const paragraphSelection = [tripleClickParagraph, paragraphKeymap];

// --------------------------------------------------------------------------
// Reference tests for `findParagraphRange` — drop into any Jest/Vitest suite
// with `Text` imported from "@codemirror/state". Kept inline so the expected
// behavior travels with the implementation.
//
//   const doc = (s: string) => Text.of(s.split("\n"));
//
//   // 1. Empty document → null.
//   expect(findParagraphRange(doc(""), 0)).toBeNull();
//
//   // 2. Single-line paragraph.
//   expect(findParagraphRange(doc("hello"), 2)).toEqual({ from: 0, to: 5 });
//
//   // 3. Multi-line paragraph, no trailing blanks in range.
//   const t3 = "para line 1\npara line 2\n\nnext";
//   expect(findParagraphRange(doc(t3), t3.indexOf("line 2")))
//     .toEqual({ from: 0, to: "para line 1\npara line 2".length });
//
//   // 4. Last paragraph excludes trailing blank lines.
//   const t4 = "first\n\nlast\n\n\n";
//   expect(findParagraphRange(doc(t4), t4.indexOf("last")))
//     .toEqual({ from: t4.indexOf("last"), to: t4.indexOf("last") + 4 });
//
//   // 5. Blank line → prefer paragraph below.
//   const t5 = "above\n\nbelow";
//   expect(findParagraphRange(doc(t5), t5.indexOf("\n\n") + 1))
//     .toEqual({ from: t5.indexOf("below"), to: t5.length });
//
//   // 6. Trailing blank → fall back above.
//   expect(findParagraphRange(doc("only\n\n\n"), 7))
//     .toEqual({ from: 0, to: 4 });
//
//   // 7. Multiple blanks between paragraphs.
//   const t7 = "one\n\n\n\ntwo";
//   expect(findParagraphRange(doc(t7), 1)).toEqual({ from: 0, to: 3 });
//   expect(findParagraphRange(doc(t7), t7.indexOf("two")))
//     .toEqual({ from: t7.indexOf("two"), to: t7.length });
//
//   // 8. Caret at line boundary stays in the same paragraph.
//   const t8 = "alpha\nbeta\n\ngamma";
//   expect(findParagraphRange(doc(t8), t8.indexOf("\n")))
//     .toEqual({ from: 0, to: "alpha\nbeta".length });
//
//   // 9. Document of only blank lines → null.
//   expect(findParagraphRange(doc("\n\n\n"), 1)).toBeNull();
// --------------------------------------------------------------------------
