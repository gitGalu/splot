import { useCallback, useEffect, useRef } from "react";
import { t } from "../../i18n/i18n";
import { formatShortcutString } from "../../services/keyLabel";
import {
  AUTOSAVE_MAX_MS,
  AUTOSAVE_MIN_MS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  setSetting,
  useSettings,
  type FontChoice,
  type LinkOpenMode,
  type ThemeChoice,
} from "../../services/settings";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const settings = useSettings();
  const closeRef = useRef<HTMLButtonElement>(null);

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
      aria-label={t("settings.title")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel" onKeyDown={onKeyDown}>
        <header className="settings-header">
          <h2 className="settings-title">{t("settings.title")}</h2>
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
        <div className="settings-body">
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t("settings.section.appearance")}
            </h3>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.theme.label")}
                </span>
              </div>
              <div className="settings-seg">
                {(
                  [
                    ["system", t("settings.theme.system")],
                    ["light", t("settings.theme.light")],
                    ["dark", t("settings.theme.dark")],
                  ] as Array<[ThemeChoice, string]>
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={`settings-seg-btn ${
                      settings.theme === val ? "is-active" : ""
                    }`}
                    onClick={() => setSetting("theme", val)}
                    aria-pressed={settings.theme === val}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.font.label")}
                </span>
              </div>
              <div className="settings-seg">
                {(
                  [
                    ["serif", t("settings.font.serif")],
                    ["sans", t("settings.font.sans")],
                    ["system", t("settings.font.system")],
                    ["mono", t("settings.font.mono")],
                  ] as Array<[FontChoice, string]>
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={`settings-seg-btn ${
                      settings.editorFont === val ? "is-active" : ""
                    }`}
                    onClick={() => setSetting("editorFont", val)}
                    aria-pressed={settings.editorFont === val}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.fontSize.label")}
                </span>
              </div>
              <div className="settings-slider-row">
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={settings.editorFontSize}
                  onChange={(e) =>
                    setSetting("editorFontSize", Number(e.target.value))
                  }
                  aria-label={t("settings.fontSize.label")}
                />
                <span className="settings-slider-value">
                  {t("settings.fontSize.px", { n: settings.editorFontSize })}
                </span>
              </div>
            </div>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.lineHeight.label")}
                </span>
              </div>
              <div className="settings-slider-row">
                <input
                  type="range"
                  min={LINE_HEIGHT_MIN}
                  max={LINE_HEIGHT_MAX}
                  step={0.05}
                  value={settings.editorLineHeight}
                  onChange={(e) =>
                    setSetting("editorLineHeight", Number(e.target.value))
                  }
                  aria-label={t("settings.lineHeight.label")}
                />
                <span className="settings-slider-value">
                  {settings.editorLineHeight.toFixed(2)}
                </span>
              </div>
            </div>
          </section>
          <section className="settings-section">
            <h3 className="settings-section-title">{t("settings.section.editor")}</h3>
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.fullWidthEditor}
                onChange={(e) => setSetting("fullWidthEditor", e.target.checked)}
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.fullWidth.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.fullWidth.help")}
                </span>
              </span>
            </label>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.autosave.label")}
                </span>
              </div>
              <div className="settings-slider-row">
                <input
                  type="range"
                  min={AUTOSAVE_MIN_MS}
                  max={AUTOSAVE_MAX_MS}
                  step={500}
                  value={settings.autosaveDelayMs}
                  onChange={(e) =>
                    setSetting("autosaveDelayMs", Number(e.target.value))
                  }
                  aria-label={t("settings.autosave.label")}
                />
                <span className="settings-slider-value">
                  {t("settings.autosave.seconds", {
                    n: (settings.autosaveDelayMs / 1000).toFixed(
                      settings.autosaveDelayMs % 1000 === 0 ? 0 : 1,
                    ),
                  })}
                </span>
              </div>
            </div>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.linkOpen.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.linkOpen.help", { mod: formatShortcutString("Mod") })}
                </span>
              </div>
              <div className="settings-seg">
                {(
                  [
                    [
                      "modClick",
                      t("settings.linkOpen.modClick", { mod: formatShortcutString("Mod") }),
                    ],
                    ["click", t("settings.linkOpen.click")],
                  ] as Array<[LinkOpenMode, string]>
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={`settings-seg-btn ${
                      settings.linkOpenMode === val ? "is-active" : ""
                    }`}
                    onClick={() => setSetting("linkOpenMode", val)}
                    aria-pressed={settings.linkOpenMode === val}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="settings-section">
            <h3 className="settings-section-title">{t("settings.section.files")}</h3>
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.showTrash}
                onChange={(e) => setSetting("showTrash", e.target.checked)}
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.showTrash.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.showTrash.help")}
                </span>
              </span>
            </label>
          </section>
          <section className="settings-section">
            <h3 className="settings-section-title">{t("settings.section.tasks")}</h3>
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.autoSortDoneTasks}
                onChange={(e) =>
                  setSetting("autoSortDoneTasks", e.target.checked)
                }
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.autoSortTasks.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.autoSortTasks.help")}
                </span>
              </span>
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
