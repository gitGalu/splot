import { useEffect, useRef } from "react";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import type { FileRef } from "../../types/workspace";
import { splotEditorTheme, splotHighlightStyle } from "./theme";
import { paragraphSelection } from "./paragraph-selection";
import { taskToggleWithAutoSort } from "./task-toggle";
import { linkExtension } from "./links";
import { lineCommandsKeymap } from "./line-commands";
import { inlineCalcExtension } from "./inline-calc";
import { FONT_STACKS, getSettings, useSettings } from "../../services/settings";
import { getCursor, setCursor } from "../../services/cursorMemory";

interface Props {
  file: FileRef;
  value: string;
  workspaceRoot: string;
  onChange: (value: string) => void;
  /** Optional outbound handle — lets the parent call commands on the view. */
  viewRef?: React.MutableRefObject<EditorView | null>;
}

const CURSOR_SAVE_DELAY_MS = 400;

export function EditorPane({
  file,
  value,
  workspaceRoot,
  onChange,
  viewRef: outerViewRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const {
    fullWidthEditor,
    editorFont,
    editorFontSize,
    editorLineHeight,
    linkOpenMode,
    ideLineShortcuts,
    inlineCalc,
  } = useSettings();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || linkOpenMode !== "modClick") return;
    const isMacPlatform =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
    const onKey = (e: KeyboardEvent) => {
      const pressed = isMacPlatform ? e.metaKey : e.ctrlKey;
      host.classList.toggle("mod-pressed", pressed);
    };
    const onBlur = () => host.classList.remove("mod-pressed");
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      host.classList.remove("mod-pressed");
    };
  }, [linkOpenMode]);

  useEffect(() => {
    if (!hostRef.current) return;

    const isMarkdown =
      file.extension === "md" || file.extension === "markdown";

    // Debounce writes so normal typing/navigation doesn't thrash localStorage.
    let saveTimer: number | null = null;
    const scheduleSave = (offset: number) => {
      if (saveTimer != null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        setCursor(workspaceRoot, file.path, offset);
        saveTimer = null;
      }, CURSOR_SAVE_DELAY_MS);
    };

    const extensions: Extension[] = [
      history(),
      ...(ideLineShortcuts ? [lineCommandsKeymap] : []),
      search({ top: true }),
      EditorState.phrases.of({
        Find: "Znajdź",
        Replace: "Zamień",
        next: "następne",
        previous: "poprzednie",
        all: "wszystkie",
        "match case": "uwzględnij wielkość",
        "by word": "całe słowo",
        regexp: "regex",
        replace: "zamień",
        "replace all": "zamień wszystkie",
        close: "zamknij",
        "Go to line": "Idź do wiersza",
        go: "idź",
      }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
        if (update.selectionSet || update.docChanged) {
          scheduleSave(update.state.selection.main.head);
        }
      }),
      splotEditorTheme,
      syntaxHighlighting(splotHighlightStyle, { fallback: true }),
      paragraphSelection,
      ...linkExtension(),
    ];

    if (isMarkdown) {
      extensions.push(markdown());
      // Read the setting freshly on every transaction so toggling the
      // preference takes effect without rebuilding the editor.
      extensions.push(taskToggleWithAutoSort(() => getSettings().autoSortDoneTasks));
      if (inlineCalc) extensions.push(inlineCalcExtension());
    }

    // Restore the last-known caret offset for this file, clamped to the
    // current document length (file may have shrunk between sessions).
    const saved = getCursor(workspaceRoot, file.path);
    const docLen = value.length;
    const initialOffset =
      saved != null ? Math.min(Math.max(saved, 0), docLen) : null;

    const state = EditorState.create({
      doc: value,
      selection:
        initialOffset != null
          ? EditorSelection.cursor(initialOffset)
          : undefined,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;
    if (outerViewRef) outerViewRef.current = view;
    view.focus();
    if (initialOffset != null) {
      // Scroll the restored caret into view without animating.
      view.dispatch({
        effects: EditorView.scrollIntoView(initialOffset, { y: "center" }),
      });
    }

    return () => {
      // Flush any pending save before the view is gone; its state still has
      // the final selection.
      if (saveTimer != null) {
        window.clearTimeout(saveTimer);
        setCursor(workspaceRoot, file.path, view.state.selection.main.head);
      }
      view.destroy();
      viewRef.current = null;
      if (outerViewRef) outerViewRef.current = null;
    };
    // Recreate the editor when the file identity changes so extensions match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path, ideLineShortcuts, inlineCalc]);

  // Keep the document in sync when the outer value is replaced (e.g. after save
  // revert or switching files that reuse the same path — rare, but correct).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      className={`editor-host ${fullWidthEditor ? "editor-host--wide" : ""}`}
      data-link-open={linkOpenMode}
      style={
        {
          "--editor-font-family": FONT_STACKS[editorFont],
          "--editor-font-size": `${editorFontSize}px`,
          "--editor-line-height": String(editorLineHeight),
        } as React.CSSProperties
      }
    />
  );
}
