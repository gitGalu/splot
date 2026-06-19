import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { t } from "../../i18n/i18n";
import { fuzzyMatch } from "../../services/fuzzy";
import { activeAtToken, parseCapture } from "../../services/parseCapture";
import {
  captureToInbox,
  closeQuickCapture,
  EmptyCaptureError,
  listTargetDirectories,
  undoCapture,
  workspaceRoot,
  type InboxAppendResult,
} from "../../services/quickCapture";

/** A transient confirmation shown after a successful save, with Undo / Open. */
interface Toast {
  message: string;
  result: InboxAppendResult;
}

/** Join a workspace root with a `/`-separated relative path, OS-aware. */
function joinPath(root: string, rel: string): string {
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const r = root.replace(/[\\/]+$/, "");
  const parts = rel.split(/[\\/]/).filter(Boolean);
  return [r, ...parts].join(sep);
}

export function QuickCaptureApp() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Directory autocomplete for `@Folder`. The candidate list is the workspace's
  // top-level folders, loaded once when the window first focuses; `token`
  // tracks the `@…` fragment under the caret, and `activeIdx` the highlighted
  // suggestion.
  const [directories, setDirectories] = useState<string[]>([]);
  const [token, setToken] = useState<{ start: number; fragment: string } | null>(
    null,
  );
  const [activeIdx, setActiveIdx] = useState(0);

  // Focus the input whenever the window gains focus (it's hidden, not
  // destroyed, so it's re-shown with stale focus otherwise).
  useEffect(() => {
    const el = textareaRef.current;
    el?.focus();
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) textareaRef.current?.focus();
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Refresh the candidate folder list whenever the window gains focus, so a
  // folder created since the last open shows up. Best-effort.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listTargetDirectories()
        .then((d) => {
          if (!cancelled) setDirectories(d);
        })
        .catch(() => {});
    };
    load();
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) load();
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Ranked suggestions for the current `@…` fragment. An empty fragment (just
  // typed `@`) lists every folder; otherwise we fuzzy-match and sort by score.
  const suggestions = useMemo(() => {
    if (!token) return [];
    const frag = token.fragment;
    if (!frag) return directories.slice(0, 8);
    return directories
      .map((name) => ({ name, m: fuzzyMatch(frag, name) }))
      .filter((x): x is { name: string; m: NonNullable<typeof x.m> } => x.m !== null)
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 8)
      .map((x) => x.name);
  }, [token, directories]);

  const showSuggestions = token !== null && suggestions.length > 0;

  // Signature of the last synced token, so we can tell a real change from a
  // no-op re-sync. Lives in a ref so updating it doesn't trigger a render.
  const tokenSigRef = useRef<string | null>(null);

  // Dismiss the dropdown and forget the last token signature in one place, so
  // a later identical `@frag` is treated as a fresh token (highlight resets).
  const clearToken = useCallback(() => {
    setToken(null);
    tokenSigRef.current = null;
  }, []);

  // Recompute the active `@` token from the textarea's current value + caret.
  // Only reset the highlighted suggestion when the token actually changes —
  // otherwise a keyup right after an Arrow press (which we preventDefault, so
  // the caret hasn't moved) would re-sync the same token and clobber the new
  // activeIdx, making the arrows appear dead.
  const syncToken = useCallback((value: string, caret: number) => {
    const next = activeAtToken(value, caret);
    const sig = next ? `${next.start}:${next.fragment}` : null;
    if (sig !== tokenSigRef.current) {
      tokenSigRef.current = sig;
      setActiveIdx(0);
    }
    setToken(next);
  }, []);

  // Replace the active `@frag` with the chosen folder + a trailing space, and
  // move the caret past it. Dismisses the dropdown.
  const completeWith = useCallback(
    (name: string) => {
      if (!token) return;
      const el = textareaRef.current;
      const caret = el ? el.selectionStart : text.length;
      const insert = `@${name} `;
      const next = text.slice(0, token.start) + insert + text.slice(caret);
      setText(next);
      clearToken();
      // Restore the caret right after the inserted folder + space.
      const newCaret = token.start + insert.length;
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (t) {
          t.focus();
          t.setSelectionRange(newCaret, newCaret);
        }
      });
    },
    [token, text, clearToken],
  );

  const reset = useCallback(() => {
    setText("");
    setError(null);
    setToast(null);
    clearToken();
  }, [clearToken]);

  const hide = useCallback(async () => {
    reset();
    await closeQuickCapture();
  }, [reset]);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await captureToInbox(text);
      // Show a brief confirmation, then auto-dismiss the window. The toast
      // stays up just long enough to read and click Undo/Open.
      const message = result.dirMissing
        ? // The redirected-folder case: warn rather than plain-confirm.
          t("qc.dirMissing", {
            name: extractAtFolder(text) ?? "",
          })
        : result.path === "Inbox.md"
          ? t("qc.saved")
          : t("qc.savedTo", { path: result.path });
      setToast({ message, result });
      setText("");
    } catch (e) {
      if (e instanceof EmptyCaptureError) {
        setError(t("qc.empty"));
      } else {
        setError(mapError(e));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, text]);

  // Auto-dismiss the window a moment after a successful save, unless the user
  // is hovering the toast actions. Simpler than tracking hover: give a fixed,
  // comfortable window and let Undo/Open cancel it by navigating away.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => {
      void hide();
    }, 2600);
    return () => window.clearTimeout(id);
  }, [toast, hide]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When the folder dropdown is open it captures navigation keys first.
      if (showSuggestions) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % suggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          completeWith(suggestions[activeIdx]);
          return;
        }
        if (e.key === "Escape") {
          // First Escape closes the dropdown, not the window.
          e.preventDefault();
          clearToken();
          return;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        void hide();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void save();
      }
      // Shift+Enter falls through to the textarea → inserts a newline.
    },
    [hide, save, showSuggestions, suggestions, activeIdx, completeWith, clearToken],
  );

  // Keep the token in sync as the caret moves via clicks / arrow keys, not just
  // typing. Runs after the key's default action via the keyup/click handlers.
  const onCaretMove = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      syncToken(el.value, el.selectionStart);
    },
    [syncToken],
  );

  const onUndo = useCallback(async () => {
    if (!toast) return;
    const { result } = toast;
    try {
      await undoCapture(result.path, result.appended);
    } catch {
      /* best-effort */
    }
    await hide();
  }, [toast, hide]);

  const onOpen = useCallback(async () => {
    if (!toast) return;
    try {
      const root = await workspaceRoot();
      await revealItemInDir(joinPath(root, toast.result.path));
    } catch {
      /* reveal is best-effort */
    }
    await hide();
  }, [toast, hide]);

  return (
    <div className="qc-shell" data-tauri-drag-region="">
      <div className="qc-titlebar" data-tauri-drag-region="">
        <span className="qc-brand">Splot</span>
        <span className="qc-brand-sep" aria-hidden>·</span>
        <span className="qc-brand-sub">{t("qc.title")}</span>
      </div>
      <div className="qc-input-wrap">
        <textarea
          ref={textareaRef}
          className="qc-input"
          value={text}
          placeholder={t("qc.placeholder")}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
            syncToken(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onCaretMove}
          onClick={onCaretMove}
          rows={3}
          spellCheck={false}
          aria-label={t("qc.placeholder")}
        />
        {showSuggestions ? (
          <ul className="qc-suggest" role="listbox">
            {suggestions.map((name, i) => (
              <li
                key={name}
                role="option"
                aria-selected={i === activeIdx}
                className={`qc-suggest-item ${i === activeIdx ? "is-active" : ""}`}
                // Use onMouseDown (not onClick) so the textarea doesn't lose
                // focus before we complete the token.
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeWith(name);
                }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                @{name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="qc-footer">
        {error ? (
          <span className="qc-error" role="alert">
            {error}
          </span>
        ) : toast ? (
          <span className="qc-toast">
            <span className="qc-toast-msg">{toast.message}</span>
            <button type="button" className="qc-action" onClick={() => void onUndo()}>
              {t("qc.undo")}
            </button>
            <button type="button" className="qc-action" onClick={() => void onOpen()}>
              {t("qc.open")}
            </button>
          </span>
        ) : (
          <span className="qc-hint">{t("qc.hint")}</span>
        )}
      </div>
    </div>
  );
}

/** Pull the first `@Folder` token from raw input, for the warning message. */
function extractAtFolder(raw: string): string | null {
  // Reuse the parser so escape handling (\@) and "first @ wins" stay identical
  // to what actually gets written — otherwise the warning could name a folder
  // the parser never selected.
  return parseCapture(raw).targetDirectory;
}

/**
 * Map a backend WorkspaceError to a user-facing message. The error kinds the
 * append path can realistically raise each get their own line (the prompt
 * lists these cases explicitly); anything else falls back to a write failure
 * that points at permissions.
 */
function mapError(e: unknown): string {
  if (e && typeof e === "object") {
    const kind = (e as { kind?: string }).kind;
    switch (kind) {
      case "NotInitialized":
        return t("qc.noWorkspace");
      case "InvalidName":
        return t("qc.invalidName");
      case "PathEscapesRoot":
        return t("qc.outsideRoot");
    }
  }
  return t("qc.writeFailed");
}
