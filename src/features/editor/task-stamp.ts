import {
  Annotation,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/**
 * Task creation-date stamps.
 *
 * When a markdown task line is created, Splot records the moment it entered the
 * list as an HTML comment at the end of the line:
 *
 *     - [ ] Klient chce eksport do PDF <!-- t:2026-06-26 08:13 -->
 *
 * The comment is invisible in every conformant markdown renderer (GitHub,
 * Obsidian, pandoc), so files stay clean and portable. In Splot the raw marker
 * is *concealed* and re-drawn as muted text pushed to the right edge of the
 * line — revealed only when the caret sits on that line (same "live preview"
 * behaviour as the conceal extension).
 *
 * The stamp is a *creation* date: set once, never refreshed. It's added in two
 * places:
 *   - at the moment a task is created via `task-toggle` (see `stampForLine`,
 *     called from there), and
 *   - by an "auto-stamp" listener here, which dates any task line that has no
 *     stamp yet once the user moves the caret off it — covering tasks typed by
 *     hand (`- [ ] ...`) rather than created through `Mod+Enter`.
 */

// A task line: leading whitespace, list marker, whitespace, checkbox, space.
// Mirrors TASK_RE in task-toggle.ts (kept local to avoid a cross-import cycle).
const TASK_LINE_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]\s/;

// The stamp marker, anchored to the end of the line. The date/time payload is
// captured but we only need the whole match's offsets for concealing.
//   <!-- t:2026-06-26 08:13 -->
const STAMP_RE = /\s*<!--\s*t:(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*-->\s*$/;

/** Two-digit zero-pad. */
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a Date as `YYYY-MM-DD HH:MM` in local time. Local (not UTC) because
 * the stamp answers "when did I add this", which is a wall-clock question.
 */
export function formatStamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Build the marker text appended to a task line, including its leading space. */
export function stampMarker(date = new Date()): string {
  return ` <!-- t:${formatStamp(date)} -->`;
}

/** True when the line text already carries a stamp marker. */
export function hasStamp(text: string): boolean {
  return STAMP_RE.test(text);
}

/** True when the line is a markdown task line (`- [ ] ` / `- [x] `). */
export function isTaskLine(text: string): boolean {
  return TASK_LINE_RE.test(text);
}

/**
 * If `lineText` is a task line lacking a stamp, return the marker string to
 * append (with a leading space). Returns null when no stamp is needed — the
 * line isn't a task, or it's already stamped.
 *
 * Exposed so `task-toggle` can stamp a task at the instant it's created.
 */
export function stampForLine(lineText: string, date = new Date()): string | null {
  if (!isTaskLine(lineText)) return null;
  if (hasStamp(lineText)) return null;
  return stampMarker(date);
}

// --------------------------------------------------------------------------
// Auto-stamp listener: date hand-typed tasks once the caret leaves the line.
// --------------------------------------------------------------------------

/** Offset of the line's last non-blank character, or its `from` if blank. */
function lineContentEnd(doc: Text, lineNumber: number): number {
  const line = doc.line(lineNumber);
  const trimmed = line.text.replace(/\s+$/, "");
  return line.from + trimmed.length;
}

/**
 * Listener: stamp a hand-typed task line on the *trailing edge* — once the
 * caret leaves it. We track which line the caret was on after the previous
 * update; when the caret moves to a different line, the line it left is dated
 * (if it's an unstamped task). Stamping the line still under the caret would
 * shove the caret around mid-typing, so we wait for the user to move away.
 *
 * `shouldStamp` is read per-update so the preference can flip at runtime
 * without rebuilding the editor.
 */
function autoStampListener(shouldStamp: () => boolean): Extension {
  // The line the caret occupied at the end of the previous update. -1 = unknown.
  let prevCaretLine = -1;

  return EditorView.updateListener.of((update) => {
    const { state } = update;
    const caretLine = state.doc.lineAt(state.selection.main.head).number;

    // Our own stamping transaction: just resync the tracked line and bail, so
    // we never re-enter and never loop.
    if (update.transactions.some((tr) => tr.annotation(STAMP_ANNOTATION))) {
      prevCaretLine = caretLine;
      return;
    }

    if (!shouldStamp()) {
      prevCaretLine = caretLine;
      return;
    }

    const left = prevCaretLine;
    prevCaretLine = caretLine;

    // Only act when the caret has actually moved to a different line, and we
    // know where it came from. (First update establishes the baseline.)
    if (left === -1 || left === caretLine) return;
    if (left < 1 || left > state.doc.lines) return;

    const text = state.doc.line(left).text;
    if (!isTaskLine(text) || hasStamp(text)) return;

    const at = lineContentEnd(state.doc, left);
    // Defer so we don't dispatch inside the update cycle.
    queueMicrotask(() => {
      if (!shouldStamp()) return;
      // Re-validate against the live doc — the line may have changed.
      const view = update.view;
      const ln = view.state.doc.lineAt(at).number;
      const cur = view.state.doc.line(ln).text;
      if (!isTaskLine(cur) || hasStamp(cur)) return;
      view.dispatch({
        changes: { from: lineContentEnd(view.state.doc, ln), insert: stampMarker() },
        annotations: STAMP_ANNOTATION.of(true),
      });
    });
  });
}

/** Marks our own stamping transactions so the listener ignores them. */
const STAMP_ANNOTATION = Annotation.define<boolean>();

// --------------------------------------------------------------------------
// Render: conceal the raw marker, draw the date as right-aligned muted text.
// --------------------------------------------------------------------------

class StampWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: StampWidget): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-task-stamp";
    span.textContent = this.label;
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function caretLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    lines.add(state.doc.lineAt(range.head).number);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const active = caretLines(view.state);
  const ranges: ReturnType<Decoration["range"]>[] = [];

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const m = STAMP_RE.exec(line.text);
      // Only stamp markers that sit on an actual task line.
      if (m && isTaskLine(line.text) && !active.has(line.number)) {
        const markerFrom = line.from + m.index;
        // Replace the whole ` <!-- t:... -->` tail with the rendered widget.
        ranges.push(
          Decoration.replace({ widget: new StampWidget(m[1]) }).range(
            markerFrom,
            line.to,
          ),
        );
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

const stampRenderer = ViewPlugin.fromClass(
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

/**
 * Extension bundle: render existing stamps as muted right-aligned text and
 * auto-stamp hand-typed tasks. `shouldStamp` gates the auto-stamping so it can
 * be toggled at runtime; rendering of already-present stamps is always on when
 * the feature is enabled.
 */
export function taskStamps(shouldStamp: () => boolean): Extension {
  return [stampRenderer, autoStampListener(shouldStamp)];
}

/** Re-exported for tests. */
export { STAMP_RE, TASK_LINE_RE };
