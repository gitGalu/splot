import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WorkspaceNode } from "../../types/workspace";
import { fuzzyMatch } from "../../services/fuzzy";
import { t } from "../../i18n/i18n";

interface Props {
  roots: WorkspaceNode[];
  fileName: string;
  fromPath: string;
  onClose: () => void;
  onConfirm: (targetDir: string) => void;
}

const TRASH_DIR = ".trash";
const MAX_RESULTS = 60;
const ROOT_LABEL = "/";

interface DirEntry {
  /** `""` means the workspace root. Otherwise a slash-joined relative path. */
  path: string;
  /** User-facing label — `ROOT_LABEL` for root, else the path itself. */
  label: string;
}

function collectDirs(roots: WorkspaceNode[]): DirEntry[] {
  const out: DirEntry[] = [{ path: "", label: ROOT_LABEL }];
  const walk = (nodes: WorkspaceNode[]) => {
    for (const node of nodes) {
      if (node.kind !== "directory") continue;
      // Skip trash so users can't move anything into it through the palette.
      if (node.path === TRASH_DIR || node.path.startsWith(`${TRASH_DIR}/`)) {
        continue;
      }
      out.push({ path: node.path, label: node.path });
      walk(node.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * Resolve a user-typed path against a base directory, honoring `..` and `/`.
 * Leading `/` anchors at the workspace root; otherwise the path is relative
 * to `baseDir`. Returns the canonical relative directory string (`""` = root)
 * or `null` if the path escapes the workspace.
 */
function resolveUserPath(input: string, baseDir: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "/" || trimmed === ".") {
    return trimmed.startsWith("/") ? "" : baseDir;
  }
  const anchored = trimmed.startsWith("/");
  const startSegs = anchored ? [] : baseDir.split("/").filter(Boolean);
  const parts = trimmed.split("/");

  const stack = [...startSegs];
  for (const raw of parts) {
    if (raw === "" || raw === ".") continue;
    if (raw === "..") {
      if (stack.length === 0) {
        if (anchored) continue; // `/..` clamps to root
        return null; // relative `..` past root escapes the workspace
      }
      stack.pop();
      continue;
    }
    stack.push(raw);
  }
  return stack.join("/");
}

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function MoveFileModal({
  roots,
  fileName,
  fromPath,
  onClose,
  onConfirm,
}: Props) {
  const baseDir = useMemo(() => parentDir(fromPath), [fromPath]);
  const dirs = useMemo(() => collectDirs(roots), [roots]);
  const dirSet = useMemo(() => new Set(dirs.map((d) => d.path)), [dirs]);

  const [input, setInput] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = input.trim();
    // Fuzzy search ignores `/` and `..` navigation — for literal path edits,
    // fall back to prefix matching on canonical paths.
    if (!q) {
      return dirs.filter((d) => d.path !== baseDir).slice(0, MAX_RESULTS);
    }
    if (q.includes("/") || q === "." || q === "..") {
      const resolved = resolveUserPath(q, baseDir);
      if (resolved == null) return [];
      const prefix = resolved.toLowerCase();
      return dirs
        .filter(
          (d) =>
            d.path.toLowerCase().startsWith(prefix) && d.path !== baseDir,
        )
        .slice(0, MAX_RESULTS);
    }
    const scored: Array<{ entry: DirEntry; score: number }> = [];
    for (const d of dirs) {
      if (d.path === baseDir) continue;
      const hay = d.path || ROOT_LABEL;
      const m = fuzzyMatch(q, hay);
      if (m) scored.push({ entry: d, score: m.score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map((s) => s.entry);
  }, [input, dirs, baseDir]);

  useEffect(() => {
    setActive((a) =>
      results.length === 0 ? 0 : Math.min(a, results.length - 1),
    );
  }, [results.length]);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const submit = useCallback(
    (target: string) => {
      if (target === baseDir) {
        // No-op move — dismiss quietly.
        onClose();
        return;
      }
      onConfirm(target);
    },
    [baseDir, onConfirm, onClose],
  );

  const commit = useCallback(() => {
    const q = input.trim();
    if (q && (q.includes("/") || q === "." || q === "..")) {
      // Manual path: resolve and submit even without a matching list row,
      // provided the destination exists.
      const resolved = resolveUserPath(q, baseDir);
      if (resolved != null && dirSet.has(resolved)) {
        submit(resolved);
        return;
      }
    }
    const hit = results[active];
    if (hit) submit(hit.path);
  }, [active, baseDir, dirSet, input, results, submit]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActive((a) =>
            results.length === 0 ? 0 : (a + 1) % results.length,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActive((a) =>
            results.length === 0 ? 0 : (a - 1 + results.length) % results.length,
          );
          break;
        case "Enter":
          e.preventDefault();
          commit();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [commit, onClose, results.length],
  );

  const manualTarget = useMemo(() => {
    const q = input.trim();
    if (!q || !(q.includes("/") || q === "." || q === "..")) return null;
    const resolved = resolveUserPath(q, baseDir);
    if (resolved == null) return null;
    return { path: resolved, exists: dirSet.has(resolved) };
  }, [input, baseDir, dirSet]);

  return (
    <div
      className="qo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("move.title")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="qo-panel qo-panel--cmd" onKeyDown={onKeyDown}>
        <div className="qo-input-row">
          <span className="qo-mode" aria-hidden>{t("move.mode")}</span>
          <input
            ref={inputRef}
            className="qo-input"
            type="text"
            placeholder={t("move.placeholder", { name: fileName })}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={t("move.title")}
          />
        </div>
        {manualTarget && !manualTarget.exists ? (
          <div className="qo-empty">
            {t("move.notFound", {
              path: manualTarget.path || ROOT_LABEL,
            })}
          </div>
        ) : results.length === 0 ? (
          <div className="qo-empty">{t("move.empty")}</div>
        ) : (
          <ul className="qo-list" ref={listRef} role="listbox">
            {results.map((entry, idx) => (
              <li
                key={entry.path || "__root__"}
                data-index={idx}
                role="option"
                aria-selected={idx === active}
                className={`qo-row qo-row--cmd ${
                  idx === active ? "is-active" : ""
                }`}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  submit(entry.path);
                }}
              >
                <span className="qo-cmd-label">
                  {entry.path === "" ? ROOT_LABEL : entry.path}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="qo-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> {t("qo.navigate")} · <kbd>Enter</kbd>{" "}
          {t("move.hint.run")} · <kbd>Esc</kbd> {t("qo.close")}
        </div>
      </div>
    </div>
  );
}
