import { useCallback, useEffect, useRef } from "react";
import { t } from "../../i18n/i18n";
import { formatShortcut } from "../../services/keyLabel";

interface Props {
  onClose: () => void;
}

/**
 * A shortcut is either a platform-neutral spec like `"Mod+Shift+M"` (rendered
 * via `formatShortcut` so macOS sees ⌘⇧M and other OSes see Ctrl+Shift+M), or
 * a `literal` chunk list for things that aren't real key combos (e.g. "3×"
 * for triple-click, or a spec followed by a post-key like `"Mod+P"` + `">"`).
 */
type Shortcut =
  | { spec: string; labelKey: string }
  | { literal: string[]; labelKey: string };

interface Section {
  titleKey: string;
  items: Shortcut[];
}

const SECTIONS: Section[] = [
  {
    titleKey: "help.section.navigation",
    items: [
      { spec: "Mod+P", labelKey: "help.nav.quickOpen" },
      { literal: [...formatShortcut("Mod+P"), ">"], labelKey: "help.nav.contentSearch" },
      { literal: [...formatShortcut("Mod+P"), "@"], labelKey: "help.nav.symbolJump" },
      { spec: "Mod+Shift+P", labelKey: "help.nav.commandPalette" },
      { spec: "Mod+,", labelKey: "help.nav.settings" },
      { spec: "Mod+/", labelKey: "help.nav.help" },
    ],
  },
  {
    titleKey: "help.section.file",
    items: [
      { spec: "Mod+N", labelKey: "help.file.new" },
      { spec: "Mod+S", labelKey: "help.file.save" },
      { spec: "Mod+Shift+M", labelKey: "help.file.move" },
    ],
  },
  {
    titleKey: "help.section.view",
    items: [
      { spec: "Mod+B", labelKey: "help.view.toggleSidebar" },
      { spec: "Mod+Shift+T", labelKey: "help.view.typewriter" },
      { spec: "Mod+Shift+F", labelKey: "help.view.focus" },
      { spec: "Mod+=", labelKey: "help.view.zoomIn" },
      { spec: "Mod+-", labelKey: "help.view.zoomOut" },
      { spec: "Mod+0", labelKey: "help.view.zoomReset" },
    ],
  },
  {
    titleKey: "help.section.editor",
    items: [
      { spec: "Mod+Shift+A", labelKey: "help.editor.selectParagraph" },
      { literal: ["3×"], labelKey: "help.editor.tripleClick" },
      { spec: "Mod+Enter", labelKey: "help.editor.toggleTask" },
      { spec: "Mod+F", labelKey: "help.editor.find" },
      { spec: "Mod+G", labelKey: "help.editor.findNext" },
      { spec: "Mod+Shift+G", labelKey: "help.editor.findPrev" },
    ],
  },
];

function chunksFor(item: Shortcut): string[] {
  return "spec" in item ? formatShortcut(item.spec) : item.literal;
}

function keyFor(item: Shortcut): string {
  return ("spec" in item ? item.spec : item.literal.join(" ")) + "|" + item.labelKey;
}

const FORMATTING_KEYS = [
  "help.md.headings",
  "help.md.emphasis",
  "help.md.strong",
  "help.md.lists",
  "help.md.ordered",
  "help.md.links",
  "help.md.code",
  "help.md.quote",
];

export function HelpModal({ onClose }: Props) {
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
      aria-label={t("help.title")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-panel help-panel" onKeyDown={onKeyDown}>
        <header className="settings-header">
          <h2 className="settings-title">{t("help.title")}</h2>
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
          {SECTIONS.map((section) => (
            <section key={section.titleKey} className="settings-section">
              <h3 className="settings-section-title">{t(section.titleKey)}</h3>
              <ul className="help-list">
                {section.items.map((item) => (
                  <li key={keyFor(item)} className="help-row">
                    <span className="help-row-label">{t(item.labelKey)}</span>
                    <span className="help-row-keys">
                      {chunksFor(item).map((chunk, i) => (
                        <kbd key={i}>{chunk}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t("help.section.formatting")}
            </h3>
            <ul className="help-list">
              {FORMATTING_KEYS.map((key) => (
                <li key={key} className="help-row help-row--md">
                  <span className="help-row-label">{t(key)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
