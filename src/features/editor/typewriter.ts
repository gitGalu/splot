import { EditorView } from "@codemirror/view";

/**
 * Typewriter mode: keep the active line centered in the viewport.
 *
 * Re-centers when the caret moves or the document changes. Manual scrolling
 * (wheel, scrollbar) is left alone until the next caret movement, so the
 * user can still glance up/down at surrounding text.
 *
 * The 50vh top/bottom padding lets the first and last lines reach the
 * viewport center; without it CodeMirror refuses to scroll past document
 * bounds and lines near edges stay pinned to the top/bottom.
 */
export function typewriterExtension() {
  let lastHead = -1;
  const padding = EditorView.theme({
    ".cm-content": {
      paddingTop: "50vh !important",
      paddingBottom: "50vh !important",
    },
  });
  const listener = EditorView.updateListener.of((update) => {
    const head = update.state.selection.main.head;
    const moved = head !== lastHead;
    if (!moved && !update.docChanged) return;
    lastHead = head;
    update.view.dispatch({
      effects: EditorView.scrollIntoView(head, { y: "center" }),
    });
  });
  return [padding, listener];
}
