import { useEffect, useRef, useState } from "react";
import type { WorkspaceRegistry } from "../../types/workspace";
import { t } from "../../i18n/i18n";

interface Props {
  activeName: string;
  registry: WorkspaceRegistry | null;
  onSwitch: (path: string) => void;
  onOpenFolder: () => void;
  onRemove: (path: string) => void;
  onReveal: (path: string) => void;
}

export function WorkspaceSwitcher({
  activeName,
  registry,
  onSwitch,
  onOpenFolder,
  onRemove,
  onReveal,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = registry?.active ?? null;

  return (
    <div className="ws-switcher" ref={rootRef}>
      <button
        type="button"
        className="ws-switcher-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ws-switcher-name">{activeName}</span>
        <ChevronDown />
      </button>
      {open ? (
        <div className="ws-menu" role="listbox">
          {registry && registry.workspaces.length > 0 ? (
            <ul className="ws-menu-list">
              {registry.workspaces.map((w) => {
                const isActive = w.path === active;
                return (
                  <li key={w.path} className="ws-menu-row">
                    <button
                      type="button"
                      className={`ws-menu-item ${isActive ? "is-active" : ""}`}
                      onClick={() => {
                        setOpen(false);
                        if (!isActive) onSwitch(w.path);
                      }}
                    >
                      <span className="ws-menu-check" aria-hidden>
                        {isActive ? <CheckIcon /> : null}
                      </span>
                      <span className="ws-menu-main">
                        <span className="ws-menu-name">{w.name}</span>
                        <span className="ws-menu-path" title={w.path}>
                          {w.path}
                        </span>
                      </span>
                    </button>
                    <div className="ws-menu-row-actions">
                      <button
                        type="button"
                        className="ws-menu-action-btn"
                        title={t("ws.reveal")}
                        aria-label={t("ws.revealAria", { name: w.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReveal(w.path);
                        }}
                      >
                        <RevealIcon />
                      </button>
                      <button
                        type="button"
                        className="ws-menu-action-btn ws-menu-remove"
                        title={t("ws.remove")}
                        aria-label={t("ws.removeAria", { name: w.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(w.path);
                        }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="ws-menu-empty">{t("ws.empty")}</div>
          )}
          <div className="ws-menu-divider" />
          <button
            type="button"
            className="ws-menu-item ws-menu-footer"
            onClick={() => {
              setOpen(false);
              onOpenFolder();
            }}
          >
            <span className="ws-menu-check" aria-hidden>
              <PlusIcon />
            </span>
            <span className="ws-menu-main">
              <span className="ws-menu-name">{t("ws.openFolder")}</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      className="ws-icon"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="ws-icon"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RevealIcon() {
  return (
    <svg
      className="ws-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 3.5H5.5L6.75 5H11.5V11H2.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="ws-icon"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 3L9 9M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="ws-icon"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 2V10M2 6H10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
