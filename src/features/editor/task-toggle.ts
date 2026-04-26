import {
  type EditorState,
  type Extension,
  Prec,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";

/**
 * Toggleable markdown task lists.
 *
 * A task line matches `^\s*([-*+]|\d+[.)])\s+\[([ xX])\]\s` — i.e. a bullet or
 * ordered-list marker, a checkbox `[ ]`/`[x]`/`[X]`, then content. Nested
 * lists are supported via arbitrary leading whitespace.
 *
 * Two entry points:
 *   - `Mod-Enter` toggles the current line. If the line is a list item
 *     without a checkbox (`- foo`), it's converted into a task (`- [ ] foo`)
 *     so there's one keystroke path to creating tasks.
 *   - Clicking a rendered checkbox in the gutter-free editor toggles it.
 *     The `[ ]`/`[x]` text is replaced by a real `<input>` widget so the rest
 *     of the line remains selectable/editable.
 */

// A task line: leading whitespace, list marker, whitespace, checkbox, space.
// Capture groups: 1=indent+marker+spaces, 2=checkbox char.
const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s/;

// A plain list item without checkbox. Used to promote `- foo` → `- [ ] foo`.
const LIST_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)(?!\[[ xX]\]\s)/;

interface TaskMatch {
  /** Offset of the `[` character in the document. */
  bracketFrom: number;
  /** Offset just past the `]` character. */
  bracketTo: number;
  /** Current state of the checkbox. */
  checked: boolean;
}

function matchTaskLine(doc: Text, lineNumber: number): TaskMatch | null {
  const line = doc.line(lineNumber);
  const m = TASK_RE.exec(line.text);
  if (!m) return null;
  const bracketFrom = line.from + m[1].length;
  return {
    bracketFrom,
    bracketTo: bracketFrom + 3, // "[x]"
    checked: m[2] !== " ",
  };
}

/**
 * Build a transaction that toggles (or creates) a checkbox on the line
 * containing `pos`. Returns the transaction spec, or null if the line is
 * not a list item at all.
 */
function toggleSpecAt(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  const task = matchTaskLine(state.doc, line.number);
  if (task) {
    return {
      changes: {
        from: task.bracketFrom,
        to: task.bracketTo,
        insert: task.checked ? "[ ]" : "[x]",
      },
      userEvent: "input.task.toggle",
    };
  }
  const promote = LIST_RE.exec(line.text);
  if (promote) {
    const insertAt = line.from + promote[1].length;
    return {
      changes: { from: insertAt, to: insertAt, insert: "[ ] " },
      userEvent: "input.task.create",
    };
  }
  return null;
}

/** Command: toggle the task on the current line. */
export const toggleTask = (view: EditorView): boolean => {
  const pos = view.state.selection.main.head;
  const spec = toggleSpecAt(view.state, pos);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
};

/**
 * Widget that renders a real checkbox in place of the `[ ]`/`[x]` literal.
 * Clicking toggles via a document change; keyboard focus is delegated so
 * users can still arrow-through with a keyboard.
 */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly selected: boolean,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return (
      other.checked === this.checked &&
      other.from === this.from &&
      other.selected === this.selected
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-task-checkbox";
    if (this.selected) wrap.classList.add("cm-task-checkbox--selected");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.setAttribute("aria-label", this.checked ? "Odznacz zadanie" : "Zaznacz zadanie");
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    input.addEventListener("click", (e) => {
      e.preventDefault();
      const spec = toggleSpecAt(view.state, this.from);
      if (spec) view.dispatch(spec);
    });
    wrap.appendChild(input);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Does any selection range in `state` fully cover [from, to)? We only paint
 * the widget as selected when it's *inside* the highlighted span, not merely
 * touching it — matches how the browser paints selection over real text.
 */
function rangeIsSelected(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    if (range.from <= from && range.to >= to) return true;
  }
  return false;
}

const doneMark = Decoration.mark({ class: "cm-task-done" });

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const task = matchTaskLine(view.state.doc, line.number);
      if (task) {
        const selected = rangeIsSelected(
          view.state,
          task.bracketFrom,
          task.bracketTo,
        );
        ranges.push(
          Decoration.replace({
            widget: new CheckboxWidget(task.checked, task.bracketFrom, selected),
          }).range(task.bracketFrom, task.bracketTo),
        );
        if (task.checked && task.bracketTo + 1 <= line.to) {
          // Strike-through + mute the content after the `[x] ` marker.
          ranges.push(doneMark.range(task.bracketTo + 1, line.to));
        }
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

const taskCheckboxes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// --------------------------------------------------------------------------
// Sort tasks: move checked items to the end of the surrounding list.
// --------------------------------------------------------------------------

/** Count leading whitespace characters (spaces/tabs) on a line. */
function indentOf(text: string): number {
  const m = /^[ \t]*/.exec(text);
  return m ? m[0].length : 0;
}

/** Does this line start a list item at some indent level? */
function isListLine(text: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(text);
}

interface TaskItem {
  /** Document offset of the first character of the item's first line. */
  from: number;
  /** Document offset just past the last character of the item's last line. */
  to: number;
  /** `true` when this top-level item starts with `[x]` / `[X]`. */
  checked: boolean;
  /** Verbatim text of all lines making up this item, joined by `\n`. */
  text: string;
  /** Original order — used to keep the sort stable. */
  index: number;
}

/**
 * Find the contiguous list block containing `lineNumber`. A block is the
 * longest run of adjacent lines where the first line of each top-level item
 * is a list line at the same indent level as the anchor line. Lines with
 * deeper indent (nested items / continuation text) stay attached to the
 * preceding top-level item. Blank lines break the block.
 */
function findListBlock(
  doc: Text,
  lineNumber: number,
): { firstLine: number; lastLine: number; indent: number } | null {
  const line = doc.line(lineNumber);
  if (!isListLine(line.text)) return null;
  const indent = indentOf(line.text);

  let first = lineNumber;
  while (first > 1) {
    const prev = doc.line(first - 1);
    if (prev.text.trim() === "") break;
    const prevIndent = indentOf(prev.text);
    if (prevIndent < indent) break;
    if (prevIndent === indent && !isListLine(prev.text)) break;
    first--;
  }

  let last = lineNumber;
  while (last < doc.lines) {
    const next = doc.line(last + 1);
    if (next.text.trim() === "") break;
    const nextIndent = indentOf(next.text);
    if (nextIndent < indent) break;
    if (nextIndent === indent && !isListLine(next.text)) break;
    last++;
  }

  return { firstLine: first, lastLine: last, indent };
}

/**
 * Parse a list block into top-level items. Each item's text spans from its
 * top-level list line through any following deeper-indented continuation
 * lines, up to the next top-level line or the end of the block.
 */
function collectItems(
  doc: Text,
  firstLine: number,
  lastLine: number,
  indent: number,
): TaskItem[] {
  const items: TaskItem[] = [];
  let cursor = firstLine;
  let index = 0;
  while (cursor <= lastLine) {
    const startLine = doc.line(cursor);
    if (indentOf(startLine.text) !== indent) {
      // Shouldn't happen for a well-formed block, but skip defensively.
      cursor++;
      continue;
    }
    let endLine = cursor;
    while (endLine < lastLine) {
      const peek = doc.line(endLine + 1);
      if (indentOf(peek.text) <= indent) break;
      endLine++;
    }
    const from = startLine.from;
    const to = doc.line(endLine).to;
    const taskMatch = TASK_RE.exec(startLine.text);
    items.push({
      from,
      to,
      checked: taskMatch ? taskMatch[2] !== " " : false,
      text: doc.sliceString(from, to),
      index: index++,
    });
    cursor = endLine + 1;
  }
  return items;
}

/**
 * Command: reorder the list containing the caret so that unchecked tasks
 * come first, checked last. Stable within each group — relative order of
 * unchecked items is preserved, and likewise for checked. Non-task items
 * (plain bullets) count as "unchecked" so they don't get shoved to the end.
 *
 * Returns `false` when the caret isn't inside a list or nothing would move,
 * so the keymap chain can continue.
 */
export const sortTasks = (view: EditorView): boolean => {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const block = findListBlock(state.doc, line.number);
  if (!block) return false;

  const items = collectItems(
    state.doc,
    block.firstLine,
    block.lastLine,
    block.indent,
  );
  if (items.length < 2) return false;

  const sorted = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.index - b.index;
  });
  if (sorted.every((it, i) => it.index === i)) return false;

  const from = items[0].from;
  const to = items[items.length - 1].to;
  const insert = sorted.map((it) => it.text).join("\n");

  view.dispatch({
    changes: { from, to, insert },
    userEvent: "input.task.sort",
  });
  return true;
};

export const taskToggleKeymap = Prec.high(
  keymap.of([
    { key: "Mod-Enter", run: toggleTask, preventDefault: true },
  ]),
);

/**
 * Listener factory: when a transaction toggles a checkbox AND the provided
 * predicate returns true, run `sortTasks` after a short debounce. The delay
 * gives the user time to make a wrong click and undo, and lets rapid
 * multi-toggles coalesce into one reorder.
 */
function autoSortListener(shouldAutoSort: () => boolean, delayMs = 350) {
  let timer: number | null = null;
  return EditorView.updateListener.of((update) => {
    if (!shouldAutoSort()) return;
    const toggled = update.transactions.some((tr) =>
      tr.isUserEvent("input.task.toggle"),
    );
    if (!toggled) return;
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      if (!shouldAutoSort()) return;
      sortAllLists(update.view);
    }, delayMs);
  });
}

/**
 * Sort every contiguous list block in the document. Used by the auto-sort
 * listener so a toggle anywhere reorders the list it belongs to without
 * requiring the caret to stand there.
 */
function sortAllLists(view: EditorView): void {
  const { doc } = view.state;
  interface Edit {
    from: number;
    to: number;
    insert: string;
  }
  const edits: Edit[] = [];
  const seen = new Set<number>();
  for (let ln = 1; ln <= doc.lines; ln++) {
    if (seen.has(ln)) continue;
    const block = findListBlock(doc, ln);
    if (!block) continue;
    for (let i = block.firstLine; i <= block.lastLine; i++) seen.add(i);
    const items = collectItems(
      doc,
      block.firstLine,
      block.lastLine,
      block.indent,
    );
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.index - b.index;
    });
    if (sorted.every((it, i) => it.index === i)) continue;
    edits.push({
      from: items[0].from,
      to: items[items.length - 1].to,
      insert: sorted.map((it) => it.text).join("\n"),
    });
  }
  if (edits.length === 0) return;
  view.dispatch({
    changes: edits,
    userEvent: "input.task.sort",
  });
}

/** Extension bundle: keybinding + clickable checkbox widgets. */
export const taskToggle: Extension = [taskToggleKeymap, taskCheckboxes];

/**
 * Variant that also auto-sorts completed tasks to the bottom of their list
 * whenever a checkbox is toggled on. `shouldAutoSort` is read on every
 * transaction so the preference can be changed at runtime without rebuilding
 * the editor.
 */
export function taskToggleWithAutoSort(shouldAutoSort: () => boolean): Extension {
  return [taskToggleKeymap, taskCheckboxes, autoSortListener(shouldAutoSort)];
}
