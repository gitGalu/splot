/**
 * Unit tests for the conceal-markup (live preview) extension. We mount a real
 * EditorView in jsdom, place the caret on a far-away line so nothing on the
 * tested line is "revealed", and inspect which source ranges end up replaced.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { Strikethrough } from "@lezer/markdown";
import { concealMarkupExtension } from "./conceal";

/** The substring covered by each replace/hide decoration, in order. */
function concealedSlices(doc: string, caretLine = 1): string[] {
  const lines = doc.split("\n");
  // Put the caret at the start of `caretLine` (1-based) so the tested content
  // sits on a non-active line and gets concealed.
  let offset = 0;
  for (let i = 1; i < caretLine; i++) offset += lines[i - 1].length + 1;

  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(offset),
      extensions: [markdown({ extensions: [Strikethrough] }), concealMarkupExtension],
    }),
  });

  const slices: string[] = [];
  const set = view.plugin(concealMarkupExtension as any)?.decorations;
  if (set) {
    const iter = set.iter();
    while (iter.value) {
      // Line decorations are zero-length; skip them — we assert on text.
      if (iter.to > iter.from) slices.push(doc.slice(iter.from, iter.to));
      iter.next();
    }
  }
  view.destroy();
  return slices;
}

/** Like concealedSlices but with an explicit anchor→head selection (offsets). */
function concealedSlicesForSelection(
  doc: string,
  anchor: number,
  head: number,
): string[] {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(anchor, head),
      extensions: [markdown({ extensions: [Strikethrough] }), concealMarkupExtension],
    }),
  });
  const slices: string[] = [];
  const set = view.plugin(concealMarkupExtension as any)?.decorations;
  if (set) {
    const iter = set.iter();
    while (iter.value) {
      if (iter.to > iter.from) slices.push(doc.slice(iter.from, iter.to));
      iter.next();
    }
  }
  view.destroy();
  return slices;
}

test("hides bold/italic/code/strikethrough markers", () => {
  const slices = concealedSlices("**b** _i_ `c` ~~s~~\nx", 2);
  assert.deepEqual(slices, ["**", "**", "_", "_", "`", "`", "~~", "~~"]);
});

test("hides ATX heading marker and its trailing space", () => {
  const slices = concealedSlices("### Title\nx", 2);
  assert.deepEqual(slices, ["### "]);
});

test("link: hides brackets and url, keeps the label", () => {
  const slices = concealedSlices("[Splot](https://galu.dev)\nx", 2);
  assert.deepEqual(slices, ["[", "]", "(", "https://galu.dev", ")"]);
});

test("unordered bullet is replaced; ordered list is left intact", () => {
  assert.deepEqual(concealedSlices("- item\nx", 2), ["-"]);
  assert.deepEqual(concealedSlices("1. item\nx", 2), []);
});

test("blockquote marker (with space) is hidden", () => {
  const slices = concealedSlices("> quote\nx", 2);
  assert.deepEqual(slices, ["> "]);
});

test("horizontal rule is replaced", () => {
  const slices = concealedSlices("---\nx", 2);
  assert.deepEqual(slices, ["---"]);
});

test("markers on the caret line are revealed (not concealed)", () => {
  // Caret on line 1 → its **bold** stays visible.
  const slices = concealedSlices("**b**\nx", 1);
  assert.deepEqual(slices, []);
});

test("a multi-line selection only reveals the head line, not the whole span", () => {
  // doc lines: 1:"**a**" 2:"**b**" 3:"**c**"
  // Selection anchored on line 1, head on line 3. Only line 3 should reveal;
  // lines 1 and 2 stay concealed.
  const doc = "**a**\n**b**\n**c**";
  const anchor = 0; // start of line 1
  const head = doc.length; // end of line 3
  const slices = concealedSlicesForSelection(doc, anchor, head);
  // Lines 1 and 2 each contribute two markers; line 3 (head) reveals.
  assert.deepEqual(slices, ["**", "**", "**", "**"]);
});
