import { useCallback, useEffect, useMemo, useRef } from "react";
import { diffLines } from "diff";
import { t } from "../../i18n/i18n";

interface Props {
  fileName: string;
  /** What's currently in the editor (your unsaved version). */
  mine: string;
  /** What's now on disk (the external change). */
  theirs: string;
  onClose: () => void;
  onReload: () => void;
  onKeepMine: () => void;
}

interface Row {
  /** Line text on the "mine" column, or null when only "theirs" has a line here. */
  mine: string | null;
  /** Line text on the "theirs" column, or null when only "mine" has a line. */
  theirs: string | null;
  /** Whether the line is part of a changed region (mine-side highlight). */
  mineChanged: boolean;
  /** Whether the line is part of a changed region (theirs-side highlight). */
  theirsChanged: boolean;
}

/**
 * Build a side-by-side row representation from a `diffLines` result. Equal
 * runs land on the same row in both columns. Removed runs (only in `mine`)
 * pair up against added runs (only in `theirs`) line-by-line; whichever side
 * has more lines gets blank rows on the other side.
 *
 * This is intentionally line-granular and read-only — picking individual
 * hunks, or word-level sub-diffs, would be a separate (bigger) feature.
 */
function buildRows(mine: string, theirs: string): Row[] {
  const parts = diffLines(mine, theirs);
  const rows: Row[] = [];

  // diffLines emits parts in order. Pair consecutive removed/added runs;
  // anything that's a standalone removed (no following added) is a pure
  // deletion, anything standalone added is a pure insertion.
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    const lines = stripTrailingNewline(part.value).split("\n");
    if (!part.added && !part.removed) {
      for (const line of lines) {
        rows.push({ mine: line, theirs: line, mineChanged: false, theirsChanged: false });
      }
      i += 1;
      continue;
    }
    if (part.removed) {
      const next = parts[i + 1];
      if (next && next.added) {
        const nextLines = stripTrailingNewline(next.value).split("\n");
        const max = Math.max(lines.length, nextLines.length);
        for (let k = 0; k < max; k++) {
          rows.push({
            mine: k < lines.length ? lines[k] : null,
            theirs: k < nextLines.length ? nextLines[k] : null,
            mineChanged: k < lines.length,
            theirsChanged: k < nextLines.length,
          });
        }
        i += 2;
        continue;
      }
      for (const line of lines) {
        rows.push({ mine: line, theirs: null, mineChanged: true, theirsChanged: false });
      }
      i += 1;
      continue;
    }
    // pure added
    for (const line of lines) {
      rows.push({ mine: null, theirs: line, mineChanged: false, theirsChanged: true });
    }
    i += 1;
  }
  return rows;
}

function stripTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

export function ConflictDiffModal({
  fileName,
  mine,
  theirs,
  onClose,
  onReload,
  onKeepMine,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const rows = useMemo(() => buildRows(mine, theirs), [mine, theirs]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className="qo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("conflict.diff.title", { name: fileName })}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-panel diff-panel"
        onKeyDown={onKeyDown}
      >
        <header className="settings-header">
          <h2 className="settings-title">
            {t("conflict.diff.title", { name: fileName })}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label={t("settings.close")}
          >
            ×
          </button>
        </header>
        <div className="diff-headers">
          <div className="diff-col-header diff-col-header--mine">
            {t("conflict.diff.mine")}
          </div>
          <div className="diff-col-header diff-col-header--theirs">
            {t("conflict.diff.theirs")}
          </div>
        </div>
        <div className="diff-body" role="region" aria-label={t("conflict.diff.title", { name: fileName })}>
          {rows.length === 0 ? (
            <div className="diff-empty">{t("conflict.diff.identical")}</div>
          ) : (
            <table className="diff-table">
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td
                      className={`diff-cell diff-cell--mine ${row.mineChanged ? "is-changed" : ""} ${row.mine === null ? "is-empty" : ""}`}
                    >
                      <pre className="diff-text">{row.mine ?? ""}</pre>
                    </td>
                    <td
                      className={`diff-cell diff-cell--theirs ${row.theirsChanged ? "is-changed" : ""} ${row.theirs === null ? "is-empty" : ""}`}
                    >
                      <pre className="diff-text">{row.theirs ?? ""}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="diff-footer">
          <button
            type="button"
            className="conflict-banner-btn conflict-banner-btn--primary"
            onClick={onReload}
          >
            {t("conflict.reload")}
          </button>
          <button
            type="button"
            className="conflict-banner-btn"
            onClick={onKeepMine}
          >
            {t("conflict.keepMine")}
          </button>
          <button
            type="button"
            className="conflict-banner-btn"
            onClick={onClose}
          >
            {t("conflict.diff.dismiss")}
          </button>
        </footer>
      </div>
    </div>
  );
}
