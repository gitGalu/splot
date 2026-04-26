import { Decoration, type DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isMac } from "../../services/keyLabel";
import { getSettings } from "../../services/settings";

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>()\[\]"']+[^\s<>()\[\]"',.;:!?]/gi;
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const linkMark = Decoration.mark({
  class: "cm-link",
  attributes: { role: "link" },
});

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  type Range = { from: number; to: number };
  const ranges: Range[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);

    for (const m of text.matchAll(URL_RE)) {
      const start = from + (m.index ?? 0);
      ranges.push({ from: start, to: start + m[0].length });
    }
    for (const m of text.matchAll(MD_LINK_RE)) {
      const idx = m.index ?? 0;
      const urlStart = idx + m[0].indexOf(m[1]);
      const start = from + urlStart;
      ranges.push({ from: start, to: start + m[1].length });
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.from < lastEnd) continue;
    builder.add(r.from, r.to, linkMark);
    lastEnd = r.to;
  }
  return builder.finish();
}

export const linkDecorator = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function urlAtPos(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  const offsetInLine = pos - line.from;
  const text = line.text;

  for (const m of text.matchAll(MD_LINK_RE)) {
    const start = m.index ?? 0;
    const urlStart = start + m[0].indexOf(m[1]);
    const urlEnd = urlStart + m[1].length;
    if (offsetInLine >= urlStart && offsetInLine <= urlEnd) return m[1];
  }
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (offsetInLine >= start && offsetInLine <= end) {
      return m[0].startsWith("www.") ? `https://${m[0]}` : m[0];
    }
  }
  return null;
}

function handleClick(e: MouseEvent, view: EditorView): boolean {
  if (e.button !== 0) return false;
  const mode = getSettings().linkOpenMode;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mode === "modClick" && !mod) return false;

  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
  if (pos == null) return false;
  const url = urlAtPos(view, pos);
  if (!url) return false;

  e.preventDefault();
  void openUrl(url).catch(() => {});
  return true;
}

export const linkClickHandler = EditorView.domEventHandlers({
  mousedown: handleClick,
});

export function linkExtension() {
  return [linkDecorator, linkClickHandler];
}
