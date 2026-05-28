import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../../i18n/i18n";
import {
  checkForAppUpdate,
  installAppUpdate,
  isUpdaterSupported,
  type UpdateStatus,
} from "../../services/updater";

interface Props {
  onClose: () => void;
}

const initial: UpdateStatus = isUpdaterSupported
  ? { kind: "checking" }
  : { kind: "unsupported-platform" };

export function UpdateModal({ onClose }: Props) {
  const [status, setStatus] = useState<UpdateStatus>(initial);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Auto-run a check when the modal opens on a supported platform. Guarded by
  // `ranRef` so React 18 strict-mode double-invoke doesn't fire two checks.
  useEffect(() => {
    if (!isUpdaterSupported) return;
    if (ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      const result = await checkForAppUpdate();
      setStatus(result.status);
    })();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && status.kind !== "downloading" && status.kind !== "installing") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose, status.kind],
  );

  const handleRecheck = useCallback(async () => {
    setStatus({ kind: "checking" });
    const result = await checkForAppUpdate();
    setStatus(result.status);
  }, []);

  const handleInstall = useCallback(async () => {
    setStatus({ kind: "downloading", downloaded: 0, contentLength: null });
    const final = await installAppUpdate({
      onProgress: (s) => setStatus(s),
    });
    setStatus(final);
  }, []);

  const busy = status.kind === "downloading" || status.kind === "installing";

  return (
    <div
      className="qo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("update.title")}
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel update-panel" onKeyDown={onKeyDown}>
        <header className="settings-header">
          <h2 className="settings-title">{t("update.title")}</h2>
          <button
            ref={closeRef}
            type="button"
            className="settings-close"
            onClick={onClose}
            disabled={busy}
            aria-label={t("settings.close")}
          >
            ×
          </button>
        </header>
        <div className="settings-body">
          <UpdateBody
            status={status}
            onRecheck={handleRecheck}
            onInstall={handleInstall}
          />
        </div>
      </div>
    </div>
  );
}

interface BodyProps {
  status: UpdateStatus;
  onRecheck: () => void;
  onInstall: () => void;
}

function UpdateBody({ status, onRecheck, onInstall }: BodyProps) {
  switch (status.kind) {
    case "idle":
    case "checking":
      return (
        <section className="settings-section">
          <p className="muted">{t("update.checking")}</p>
        </section>
      );

    case "unsupported-platform":
      return (
        <section className="settings-section">
          <p className="muted">{t("update.unsupported")}</p>
        </section>
      );

    case "up-to-date":
      return (
        <section className="settings-section">
          <p>{t("update.upToDate")}</p>
          <div className="settings-actions">
            <button type="button" className="btn" onClick={onRecheck}>
              {t("update.recheck")}
            </button>
          </div>
        </section>
      );

    case "available":
      return (
        <section className="settings-section">
          <p className="settings-row-label">
            {t("update.available", {
              version: status.version,
              current: status.currentVersion,
            })}
          </p>
          {status.date ? (
            <p className="muted small">
              {t("update.publishedOn", { date: formatDate(status.date) })}
            </p>
          ) : null}
          {status.notes ? <NotesBlock text={status.notes} /> : null}
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={onInstall}
            >
              {t("update.install")}
            </button>
          </div>
        </section>
      );

    case "downloading": {
      const pct = progressPercent(status.downloaded, status.contentLength);
      return (
        <section className="settings-section">
          <p>{t("update.downloading")}</p>
          <div className="update-progress">
            <div
              className="update-progress-bar"
              style={{ width: pct == null ? "100%" : `${pct}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
            />
          </div>
          <p className="muted small">
            {pct == null
              ? formatBytes(status.downloaded)
              : `${pct}% — ${formatBytes(status.downloaded)}`}
          </p>
        </section>
      );
    }

    case "installing":
      return (
        <section className="settings-section">
          <p>{t("update.installing")}</p>
        </section>
      );

    case "error":
      return (
        <section className="settings-section">
          <p className="error-banner">{status.message}</p>
          <div className="settings-actions">
            <button type="button" className="btn" onClick={onRecheck}>
              {t("update.recheck")}
            </button>
          </div>
        </section>
      );
  }
}

/**
 * Render release notes with bare http(s) URLs turned into real links
 * opened by the OS browser via `@tauri-apps/plugin-opener`, and lines
 * that begin with `## ` rendered as version headers. We avoid
 * `dangerouslySetInnerHTML` deliberately — the notes come from a
 * release description and could carry anything; everything that isn't
 * a matched URL stays plain text.
 */
function NotesBlock({ text }: { text: string }) {
  // Split into per-line nodes first so version headers (`## v0.2.26`)
  // can render as distinct elements. URLs are linkified inside each
  // non-header line.
  const lines = text.split("\n");
  return (
    <pre className="update-notes">
      {lines.map((line, i) => {
        const headerMatch = line.match(/^##\s+(.+)$/);
        if (headerMatch) {
          return (
            <span key={i} className="update-notes-header">
              {headerMatch[1]}
              {i < lines.length - 1 ? "\n" : ""}
            </span>
          );
        }
        return (
          <Fragment key={i}>
            {linkifyLine(line)}
            {i < lines.length - 1 ? "\n" : ""}
          </Fragment>
        );
      })}
    </pre>
  );
}

function linkifyLine(line: string): ReactNode[] {
  const URL_RE = /\bhttps?:\/\/[^\s)<>"']+/g;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(line.slice(last, start));
    out.push(
      <a
        key={`u${start}`}
        href={m[0]}
        className="update-notes-link"
        onClick={(e) => {
          e.preventDefault();
          void openUrl(m[0]).catch(() => {});
        }}
      >
        {m[0]}
      </a>,
    );
    last = start + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function progressPercent(
  downloaded: number,
  contentLength: number | null,
): number | null {
  if (!contentLength || contentLength <= 0) return null;
  return Math.min(100, Math.round((downloaded / contentLength) * 100));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(raw: string): string {
  // Tauri returns dates as RFC3339-ish strings; if it parses, render locale
  // date — otherwise show the raw string so we never throw on UI.
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString();
}
