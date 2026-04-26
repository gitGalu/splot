import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fuzzyMatch } from "../../services/fuzzy";
import { t } from "../../i18n/i18n";

export interface Command {
  id: string;
  label: string;
  group?: string;
  hint?: string;
  run: () => void | Promise<void>;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

const MAX_RESULTS = 80;

interface Scored {
  command: Command;
  score: number;
}

function filterCommands(commands: Command[], query: string): Scored[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return commands.map((c) => ({ command: c, score: 0 }));
  }
  const scored: Scored[] = [];
  for (const c of commands) {
    const hay = c.group ? `${c.group} ${c.label}` : c.label;
    const s = fuzzyMatch(trimmed, hay);
    if (s) scored.push({ command: c, score: s.score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS);
}

export function CommandPalette({ commands, onClose }: Props) {
  const [input, setInput] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => filterCommands(commands, input), [commands, input]);

  useEffect(() => {
    setActive((a) => (results.length === 0 ? 0 : Math.min(a, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = useCallback(
    (idx: number) => {
      const hit = results[idx];
      if (!hit) return;
      onClose();
      void hit.command.run();
    },
    [results, onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActive((a) => (results.length === 0 ? 0 : (a + 1) % results.length));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActive((a) =>
            results.length === 0 ? 0 : (a - 1 + results.length) % results.length,
          );
          break;
        case "Enter":
          e.preventDefault();
          commit(active);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [active, commit, onClose, results.length],
  );

  return (
    <div
      className="qo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="qo-panel qo-panel--cmd" onKeyDown={onKeyDown}>
        <div className="qo-input-row">
          <span className="qo-mode" aria-hidden>{t("cmd.mode")}</span>
          <input
            ref={inputRef}
            className="qo-input"
            type="text"
            placeholder={t("cmd.placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={t("cmd.mode")}
          />
        </div>
        {results.length === 0 ? (
          <div className="qo-empty">{t("cmd.empty")}</div>
        ) : (
          <ul className="qo-list" ref={listRef} role="listbox">
            {results.map(({ command }, idx) => (
              <li
                key={command.id}
                data-index={idx}
                role="option"
                aria-selected={idx === active}
                className={`qo-row qo-row--cmd ${idx === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(idx);
                }}
              >
                <span className="qo-cmd-label">
                  {command.group ? (
                    <>
                      <span className="qo-cmd-group">{command.group}:</span>{" "}
                    </>
                  ) : null}
                  {command.label}
                </span>
                {command.hint ? (
                  <span className="qo-cmd-hint">{command.hint}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="qo-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> {t("qo.navigate")} · <kbd>Enter</kbd>{" "}
          {t("cmd.hint.run")} · <kbd>Esc</kbd> {t("qo.close")}
        </div>
      </div>
    </div>
  );
}
