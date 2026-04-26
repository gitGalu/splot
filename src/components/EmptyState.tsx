import { t } from "../i18n/i18n";
import { formatShortcutString } from "../services/keyLabel";

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <h1>{t("empty.title")}</h1>
        <p>
          {t("empty.body", {
            new: formatShortcutString("Mod+N"),
            quickopen: formatShortcutString("Mod+P"),
          })}
        </p>
      </div>
    </div>
  );
}
