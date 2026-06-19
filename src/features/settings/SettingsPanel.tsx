import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n/i18n";
import { formatShortcut, formatShortcutString } from "../../services/keyLabel";
import { applyShortcut, clearShortcut } from "../../services/quickCapture";
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
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState(false);
  // True when the recording session committed a new combo (vs. was cancelled),
  // so the effect cleanup knows whether to restore the previous shortcut.
  const committedRef = useRef(false);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Record a new Quick Capture shortcut while `recording` is true.
  //
  // This MUST run at the window capture phase and stop the event from
  // propagating: the app has its own window-level keydown listeners (the
  // in-app Quick Capture shortcut and the global keymap). If we let the combo
  // reach them, pressing e.g. the current shortcut while recording would open
  // the capture window and steal focus — leaving the field stuck on "press a
  // combo". Capturing + stopImmediatePropagation makes the recorder the sole
  // consumer of the keystroke.
  useEffect(() => {
    if (!recording) return;
    // Unregister the OS-level hotkey while recording. Otherwise pressing the
    // *current* shortcut to rebind it would fire the global handler and pop the
    // capture window (the OS hotkey is independent of DOM events, so the
    // capture-phase listener below can't suppress it). When recording ends
    // without a new combo, App's effect re-applies the stored shortcut; when a
    // new combo is chosen, applyShortcut re-registers it.
    void clearShortcut();
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const key = e.key;
      // Ignore lone modifier presses — wait for the actual key.
      if (["Shift", "Control", "Meta", "Alt", "AltGraph"].includes(key)) return;
      const hasMod = e.metaKey || e.ctrlKey;
      if (!hasMod) return; // require at least Cmd/Ctrl

      const tokens: string[] = ["Mod"];
      if (e.altKey) tokens.push("Alt");
      if (e.shiftKey) tokens.push("Shift");
      // Normalise the main key: single chars uppercased, named keys as-is.
      tokens.push(key.length === 1 ? key.toUpperCase() : key);
      const spec = tokens.join("+");

      committedRef.current = true; // a new combo was chosen; it gets registered
      setRecording(false);
      setShortcutError(false);
      setSetting("quickCaptureShortcut", spec);
      void applyShortcut(spec).then((err) => setShortcutError(err != null));
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      // If recording ended WITHOUT choosing a combo (Escape / blur / panel
      // close), re-register the stored shortcut we unregistered on start.
      // applyShortcut is idempotent, so this is safe even if the feature is
      // disabled (App's effect will then unregister again).
      if (!committedRef.current && settings.quickCaptureEnabled) {
        void applyShortcut(settings.quickCaptureShortcut);
      }
      committedRef.current = false;
    };
  }, [recording, settings.quickCaptureEnabled, settings.quickCaptureShortcut]);

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
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.inlineCalc}
                onChange={(e) => setSetting("inlineCalc", e.target.checked)}
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.inlineCalc.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.inlineCalc.help")}
                </span>
              </span>
            </label>
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
            <h3 className="settings-section-title">
              {t("settings.section.shortcuts")}
            </h3>
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.quickCaptureEnabled}
                onChange={(e) =>
                  setSetting("quickCaptureEnabled", e.target.checked)
                }
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.quickCaptureEnabled.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.quickCaptureEnabled.help")}
                </span>
              </span>
            </label>
            <div className="settings-row settings-row--stack">
              <div className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.quickCapture.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.quickCapture.help")}
                </span>
                {shortcutError && settings.quickCaptureEnabled ? (
                  <span className="settings-row-help" style={{ color: "var(--color-danger-text)" }}>
                    {t("settings.quickCapture.conflict")}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className={`settings-shortcut-field ${recording ? "is-recording" : ""}`}
                disabled={!settings.quickCaptureEnabled}
                onClick={() => setRecording((r) => !r)}
                onBlur={() => setRecording(false)}
              >
                {recording
                  ? t("settings.quickCapture.recording")
                  : formatShortcut(settings.quickCaptureShortcut).map((tok, i) => (
                      <kbd key={i} className="settings-kbd">
                        {tok}
                      </kbd>
                    ))}
              </button>
            </div>
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.ideLineShortcuts}
                onChange={(e) =>
                  setSetting("ideLineShortcuts", e.target.checked)
                }
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.ideLineShortcuts.label")}
                </span>
                <span className="settings-row-help">
                  {t("settings.ideLineShortcuts.help", {
                    mod: formatShortcutString("Mod"),
                  })}
                </span>
              </span>
            </label>
            <label className="settings-row">
              <input
                type="checkbox"
                checked={settings.wheelZoom}
                onChange={(e) => setSetting("wheelZoom", e.target.checked)}
              />
              <span className="settings-row-main">
                <span className="settings-row-label">
                  {t("settings.wheelZoom.label", {
                    mod: formatShortcutString("Mod"),
                  })}
                </span>
                <span className="settings-row-help">
                  {t("settings.wheelZoom.help", {
                    mod: formatShortcutString("Mod"),
                  })}
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
