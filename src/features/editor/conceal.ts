import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/**
 * Conceal markup: hide the syntax markers of markdown so the text reads clean
 * while staying fully editable. Styling (bold weight, italic, heading size) is
 * already supplied by `splotHighlightStyle`; this extension only removes or
 * substitutes the markers themselves.
 *
 * Handled:
 *  - inline emphasis / code / strikethrough markers (`*` `_` `` ` `` `~~`)
 *  - ATX heading markers (`#`s + the following space)
 *  - links: `[label](url)` → just the clickable `label`
 *  - unordered list bullets (`-`, `*`, `+`) → `•` (ordered lists left intact)
 *  - blockquote markers (`>`) → hidden, with a CSS left rule on the line
 *  - horizontal rules (`---`, `***`, `___`) → a drawn separator
 *
 * Markers on the line holding a cursor (the `head` of each selection range)
 * are *revealed* so the caret never lands in invisible text and editing the
 * syntax stays comfortable. We key off the caret line only — not the whole
 * selected span — so dragging a large selection (or Select All) doesn't flash
 * every line back to raw markdown. This is the standard "Live Preview"
 * behaviour.
 */

// Lezer node names (from @codemirror/lang-markdown) for the inline marker
// tokens we drop entirely. These are delimiters only, never styled content.
const INLINE_MARKER_NODES = new Set([
  "EmphasisMark", // * or _ around italic
  "StrongEmphasisMark", // ** or __ around bold
  "CodeMark", // ` around inline code
  "StrikethroughMark", // ~~ around strikethrough
  "LinkMark", // [ ] ( ) around a link
]);

const HEADER_MARK = "HeaderMark";
const URL_NODE = "URL";
const LIST_MARK = "ListMark";
const QUOTE_MARK = "QuoteMark";
const HORIZONTAL_RULE = "HorizontalRule";

const hidden = Decoration.replace({});
const quoteLine = Decoration.line({ class: "cm-conceal-quote" });

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-conceal-bullet";
    span.textContent = "•";
    return span;
  }
  ignoreEvent() {
    return false;
  }
}
const bullet = Decoration.replace({ widget: new BulletWidget() });

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement("span");
    hr.className = "cm-conceal-rule";
    return hr;
  }
}
const horizontalRule = Decoration.replace({ widget: new RuleWidget() });

function caretLineNumbers(view: EditorView): Set<number> {
  const lines = new Set<number>();
  const { doc } = view.state;
  // Reveal only the line each caret sits on, so a wide selection or Select All
  // doesn't unhide every marker in between.
  for (const range of view.state.selection.ranges) {
    lines.add(doc.lineAt(range.head).number);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const active = caretLineNumbers(view);

  // Decorations must be added in start-position order. Line decorations
  // (the quote rule) and mark/replace decorations can interleave, so collect
  // everything first, then sort and feed the builder.
  type Pending = { from: number; to: number; deco: Decoration; line?: boolean };
  const pending: Pending[] = [];

  const isActiveLine = (pos: number) => active.has(doc.lineAt(pos).number);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // ----- ATX headings: hide `#`s and the trailing space -----
        if (name === HEADER_MARK) {
          if (isActiveLine(node.from)) return;
          let end = node.to;
          if (end < doc.length && doc.sliceString(end, end + 1) === " ") {
            end += 1;
          }
          if (end > node.from) pending.push({ from: node.from, to: end, deco: hidden });
          return;
        }

        // ----- inline markers + link brackets -----
        if (INLINE_MARKER_NODES.has(name)) {
          if (isActiveLine(node.from)) return;
          pending.push({ from: node.from, to: node.to, deco: hidden });
          return;
        }

        // ----- link URL: hide it, keeping the label -----
        if (name === URL_NODE && node.matchContext(["Link"])) {
          if (isActiveLine(node.from)) return;
          pending.push({ from: node.from, to: node.to, deco: hidden });
          return;
        }

        // ----- list bullets: `-`/`*`/`+` → •, ordered (`1.`) left alone -----
        if (name === LIST_MARK && node.matchContext(["BulletList", "ListItem"])) {
          if (isActiveLine(node.from)) return;
          // Replace the marker char only (a single `-`/`*`/`+`); the space
          // after it is preserved so indentation stays intact.
          pending.push({ from: node.from, to: node.to, deco: bullet });
          return;
        }

        // ----- blockquote marker: hide `>` + space, rule via line class -----
        if (name === QUOTE_MARK) {
          if (isActiveLine(node.from)) return;
          let end = node.to;
          if (end < doc.length && doc.sliceString(end, end + 1) === " ") {
            end += 1;
          }
          pending.push({ from: node.from, to: end, deco: hidden });
          pending.push({
            from: doc.lineAt(node.from).from,
            to: doc.lineAt(node.from).from,
            deco: quoteLine,
            line: true,
          });
          return;
        }

        // ----- horizontal rule: draw a separator -----
        if (name === HORIZONTAL_RULE) {
          if (isActiveLine(node.from)) return;
          pending.push({ from: node.from, to: node.to, deco: horizontalRule });
          return;
        }
      },
    });
  }

  // Sort by start, then put line decorations before mark/replace at the same
  // position (RangeSetBuilder requires non-decreasing `from`, and line decos
  // must precede point decos sharing the position).
  pending.sort((a, b) => a.from - b.from || Number(!!b.line) - Number(!!a.line));

  const builder = new RangeSetBuilder<Decoration>();
  for (const p of pending) builder.add(p.from, p.to, p.deco);
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
