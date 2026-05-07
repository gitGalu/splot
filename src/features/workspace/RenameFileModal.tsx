import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n/i18n";

interface Props {
  /** Current file name (last segment of the path). */
  fileName: string;
  onClose: () => void;
  onConfirm: (newName: string) => void;
}

/**
 * Index of the dot that starts a file's extension, or `-1` if none. Skips
 * leading dots (`.gitignore` is a hidden file with no extension, not an
 * extension named `.gitignore`).
 */
function extDotIndex(name: string): number {
  let i = name.length - 1;
  while (i > 0 && name[i] !== ".") i--;
  if (i <= 0) return -1;
  return i;
}

export function RenameFileModal({ fileName, onClose, onConfirm }: Props) {
  const [value, setValue] = useState(fileName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-select the basename (everything before the extension) so the user can
  // start typing a replacement name without losing the extension. Matches the
  // Finder/Explorer rename UX.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dot = extDotIndex(fileName);
    const end = dot > 0 ? dot : fileName.length;
    el.setSelectionRange(0, end);
  }, [fileName]);

  const trimmed = value.trim();
  const unchanged = trimmed === fileName;
  const invalid =
    trimmed.length === 0 ||
    /[\\/]/.test(trimmed) ||
    trimmed === "." ||
    trimmed === "..";

  const commit = useCallback(() => {
    if (invalid) return;
    if (unchanged) {
      onClose();
      return;
    }
    setError(null);
    onConfirm(trimmed);
  }, [invalid, unchanged, trimmed, onConfirm, onClose]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
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
    [commit, onClose],
  );

  return (
    <div
      className="qo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("rename.title")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="qo-panel qo-panel--cmd" onKeyDown={onKeyDown}>
        <div className="qo-input-row">
          <span className="qo-mode" aria-hidden>{t("rename.mode")}</span>
          <input
            ref={inputRef}
            className="qo-input"
            type="text"
            placeholder={t("rename.placeholder", { name: fileName })}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-label={t("rename.title")}
          />
        </div>
        {error ? (
          <div className="qo-empty qo-empty--error">{error}</div>
        ) : invalid ? (
          <div className="qo-empty">{t("rename.invalid")}</div>
        ) : (
          <div className="qo-empty">
            {unchanged ? t("rename.hint.unchanged") : t("rename.hint.willRename", { name: trimmed })}
          </div>
        )}
        <div className="qo-hint">
          <kbd>Enter</kbd> {t("rename.hint.run")} · <kbd>Esc</kbd> {t("qo.close")}
        </div>
      </div>
    </div>
  );
}
