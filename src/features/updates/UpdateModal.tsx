import { useCallback, useEffect, useRef, useState } from "react";
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
            <button type="button" className="settings-action" onClick={onRecheck}>
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
          {status.notes ? (
            <pre className="update-notes">{status.notes}</pre>
          ) : null}
          <div className="settings-actions">
            <button
              type="button"
              className="settings-action settings-action--primary"
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
            <button type="button" className="settings-action" onClick={onRecheck}>
              {t("update.recheck")}
            </button>
          </div>
        </section>
      );
  }
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
