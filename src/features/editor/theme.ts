import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * CodeMirror theme driven by the app's CSS tokens so the editor inherits
 * the shell's light/dark styling without a second theme layer.
 */
export const splotEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "var(--editor-font-size, var(--font-size-editor))",
      fontFamily: "var(--editor-font-family, var(--font-prose))",
      color: "var(--color-text)",
      backgroundColor: "transparent",
    },
    ".cm-scroller": {
      fontFamily: "var(--editor-font-family, var(--font-prose))",
      lineHeight: "var(--editor-line-height, var(--line-height-prose))",
      padding: "var(--space-6) 0",
    },
    ".cm-content": {
      maxWidth: "var(--measure)",
      margin: "0 auto",
      padding: "0 var(--space-6)",
      caretColor: "var(--color-accent)",
    },
    ".cm-line": {
      padding: "0",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, ::selection, .cm-selectionBackground":
      {
        backgroundColor: "var(--color-selection)",
      },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-accent)",
      borderLeftWidth: "2px",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
  },
  { dark: false },
);

/**
 * Restrained markdown highlighting. Emphasis and headings get weight/tone
 * shifts, code gets a subtle mono rendering. No rainbow.
 */
export const splotHighlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600", color: "var(--color-text-strong)" },
  { tag: t.heading1, fontWeight: "700", fontSize: "1.25em" },
  { tag: t.heading2, fontWeight: "650", fontSize: "1.15em" },
  { tag: t.heading3, fontWeight: "600" },
  { tag: t.strong, fontWeight: "650", color: "var(--color-text-strong)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--color-accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--color-accent)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" },
  { tag: t.quote, color: "var(--color-text-muted)", fontStyle: "italic" },
  { tag: t.list, color: "var(--color-text)" },
  { tag: t.meta, color: "var(--color-text-faint)" },
  { tag: t.comment, color: "var(--color-text-faint)", fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);
