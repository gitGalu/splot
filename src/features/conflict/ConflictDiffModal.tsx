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
  /** 1-based line number on the "mine" side, or null when the cell is blank. */
  mineNo: number | null;
  /** 1-based line number on the "theirs" side, or null when the cell is blank. */
  theirsNo: number | null;
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
 * Tracks 1-based line numbers per side so the rendered gutter matches what
 * the user would see in their editor — blank rows leave the number column
 * empty rather than incrementing it. Read-only by design; picking
 * individual hunks would be a separate, bigger feature.
 */
function buildRows(mine: string, theirs: string): Row[] {
  const parts = diffLines(mine, theirs);
  const rows: Row[] = [];
  let mineLine = 1;
  let theirsLine = 1;

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    const lines = stripTrailingNewline(part.value).split("\n");
    if (!part.added && !part.removed) {
      for (const line of lines) {
        rows.push({
          mineNo: mineLine,
          theirsNo: theirsLine,
          mine: line,
          theirs: line,
          mineChanged: false,
          theirsChanged: false,
        });
        mineLine += 1;
        theirsLine += 1;
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
          const hasMine = k < lines.length;
          const hasTheirs = k < nextLines.length;
          rows.push({
            mineNo: hasMine ? mineLine : null,
            theirsNo: hasTheirs ? theirsLine : null,
            mine: hasMine ? lines[k] : null,
            theirs: hasTheirs ? nextLines[k] : null,
            mineChanged: hasMine,
            theirsChanged: hasTheirs,
          });
          if (hasMine) mineLine += 1;
          if (hasTheirs) theirsLine += 1;
        }
        i += 2;
        continue;
      }
      for (const line of lines) {
        rows.push({
          mineNo: mineLine,
          theirsNo: null,
          mine: line,
          theirs: null,
          mineChanged: true,
          theirsChanged: false,
        });
        mineLine += 1;
      }
      i += 1;
      continue;
    }
    // pure added
    for (const line of lines) {
      rows.push({
        mineNo: null,
        theirsNo: theirsLine,
        mine: null,
        theirs: line,
        mineChanged: false,
        theirsChanged: true,
      });
      theirsLine += 1;
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
  const identical = mine === theirs;

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
      <div className="settings-panel diff-panel" onKeyDown={onKeyDown}>
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
        <div
          className="diff-body"
          role="region"
          aria-label={t("conflict.diff.title", { name: fileName })}
        >
          {identical ? (
            <div className="diff-empty">{t("conflict.diff.identical")}</div>
          ) : (
            <table className="diff-table">
              <thead>
                <tr>
                  <th colSpan={2}>{t("conflict.diff.mine")}</th>
                  <th colSpan={2}>{t("conflict.diff.theirs")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="diff-row">
                    <td className="diff-gutter diff-gutter--mine">
                      {row.mineNo ?? ""}
                    </td>
                    <td
                      className={
                        "diff-cell diff-cell--mine" +
                        (row.mineChanged ? " is-changed" : "") +
                        (row.mine === null ? " is-empty" : "")
                      }
                    >
                      <pre className="diff-text">{row.mine ?? ""}</pre>
                    </td>
                    <td className="diff-gutter diff-gutter--theirs">
                      {row.theirsNo ?? ""}
                    </td>
                    <td
                      className={
                        "diff-cell diff-cell--theirs" +
                        (row.theirsChanged ? " is-changed" : "") +
                        (row.theirs === null ? " is-empty" : "")
                      }
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
          <button type="button" className="btn btn--primary" onClick={onReload}>
            {t("conflict.reload")}
          </button>
          <button type="button" className="btn" onClick={onKeepMine}>
            {t("conflict.keepMine")}
          </button>
          <span className="diff-footer-spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t("conflict.diff.dismiss")}
          </button>
        </footer>
      </div>
    </div>
  );
}
