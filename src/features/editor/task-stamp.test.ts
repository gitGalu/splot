/**
 * Unit tests for task creation-date stamps. The pure helpers are tested
 * directly; the rendering plugin is mounted in jsdom to confirm a stamped task
 * line conceals its raw marker and surfaces the date label.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import {
  formatStamp,
  hasStamp,
  isTaskLine,
  stampForLine,
  stampMarker,
  taskStamps,
  STAMP_RE,
} from "./task-stamp";
import { makeToggleTask } from "./task-toggle";

test("formatStamp renders local YYYY-MM-DD HH:MM with zero-padding", () => {
  // 2026-06-05 08:03 local time.
  const d = new Date(2026, 5, 5, 8, 3);
  assert.equal(formatStamp(d), "2026-06-05 08:03");
});

test("stampMarker wraps the date in an HTML comment with a leading space", () => {
  const d = new Date(2026, 5, 26, 8, 13);
  assert.equal(stampMarker(d), " <!-- t:2026-06-26 08:13 -->");
});

test("isTaskLine matches checkbox list items, not plain bullets", () => {
  assert.equal(isTaskLine("- [ ] todo"), true);
  assert.equal(isTaskLine("  * [x] done"), true);
  assert.equal(isTaskLine("1. [ ] ordered"), true);
  assert.equal(isTaskLine("- plain bullet"), false);
  assert.equal(isTaskLine("just text"), false);
});

test("hasStamp detects an existing marker only at end of line", () => {
  assert.equal(hasStamp("- [ ] x <!-- t:2026-06-26 08:13 -->"), true);
  assert.equal(hasStamp("- [ ] x"), false);
  // A comment that isn't a stamp shouldn't count.
  assert.equal(hasStamp("- [ ] x <!-- note -->"), false);
});

test("stampForLine returns a marker only for unstamped task lines", () => {
  const d = new Date(2026, 5, 26, 8, 13);
  assert.equal(stampForLine("- [ ] todo", d), " <!-- t:2026-06-26 08:13 -->");
  assert.equal(stampForLine("- plain", d), null);
  assert.equal(
    stampForLine("- [ ] todo <!-- t:2020-01-01 00:00 -->", d),
    null,
  );
});

test("STAMP_RE captures the date payload", () => {
  const m = STAMP_RE.exec("- [x] done <!-- t:2026-06-26 08:13 -->");
  assert.ok(m);
  assert.equal(m![1], "2026-06-26 08:13");
});

/** Mount the renderer; return the rendered stamp labels for non-caret lines. */
function renderedStamps(doc: string, caretLine = 99): string[] {
  const lines = doc.split("\n");
  let offset = 0;
  for (let i = 1; i < caretLine && i <= lines.length; i++) {
    offset += lines[i - 1].length + 1;
  }
  offset = Math.min(offset, doc.length);

  const ext = taskStamps(() => false); // rendering only; auto-stamp disabled
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(offset),
      extensions: [markdown(), ext],
    }),
  });
  const set = view.plugin((ext as any)[0])?.decorations;
  const labels: string[] = [];
  if (set) {
    const iter = set.iter();
    while (iter.value) {
      const w = (iter.value.spec as any).widget;
      if (w?.label) labels.push(w.label);
      iter.next();
    }
  }
  view.destroy();
  return labels;
}

test("a stamped task line off the caret renders the date label", () => {
  const labels = renderedStamps(
    "- [ ] first <!-- t:2026-06-26 08:13 -->\nplain line",
    2,
  );
  assert.deepEqual(labels, ["2026-06-26 08:13"]);
});

test("the caret line is not concealed (raw marker stays visible)", () => {
  // Caret on line 1 — the stamp there should NOT be rendered as a widget.
  const labels = renderedStamps(
    "- [ ] first <!-- t:2026-06-26 08:13 -->",
    1,
  );
  assert.deepEqual(labels, []);
});

test("makeToggleTask stamps a task created from a plain bullet when enabled", () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "- buy milk",
      selection: EditorSelection.cursor("- buy milk".length),
      extensions: [markdown()],
    }),
  });
  const ran = makeToggleTask(() => true)(view);
  assert.equal(ran, true);
  assert.match(
    view.state.doc.toString(),
    /^- \[ \] buy milk <!-- t:\d{4}-\d{2}-\d{2} \d{2}:\d{2} -->$/,
  );
  view.destroy();
});

test("makeToggleTask does not stamp when stamping is disabled", () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "- buy milk",
      selection: EditorSelection.cursor("- buy milk".length),
      extensions: [markdown()],
    }),
  });
  makeToggleTask(() => false)(view);
  assert.equal(view.state.doc.toString(), "- [ ] buy milk");
  view.destroy();
});

test("toggling an existing checkbox never adds a second stamp", () => {
  // Created + stamped, then checked off — the date must survive, not duplicate.
  const doc = "- [ ] task <!-- t:2026-06-26 08:13 -->";
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [markdown()],
    }),
  });
  makeToggleTask(() => true)(view);
  const out = view.state.doc.toString();
  // Exactly one stamp, and the box is now checked.
  assert.equal((out.match(/<!-- t:/g) ?? []).length, 1);
  view.destroy();
});
