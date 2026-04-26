import { t } from "../i18n/i18n";

interface Props {
  path: string | null;
  dirty: boolean;
  saving: boolean;
}

export function Breadcrumb({ path, dirty, saving }: Props) {
  if (!path) {
    return <div className="breadcrumb breadcrumb--empty" data-tauri-drag-region="" />;
  }
  const segments = path.split("/");
  const last = segments.pop();
  return (
    <div className="breadcrumb" aria-label="Current file path" data-tauri-drag-region="">
      {segments.map((s, i) => (
        <span
          key={`${i}-${s}`}
          className="breadcrumb-segment"
          data-tauri-drag-region=""
        >
          {s}
          <span className="breadcrumb-sep" data-tauri-drag-region="">
            /
          </span>
        </span>
      ))}
      <span className="breadcrumb-current" data-tauri-drag-region="">
        {last}
      </span>
      <span className="breadcrumb-state" aria-live="polite" data-tauri-drag-region="">
        {saving ? t("breadcrumb.saving") : dirty ? t("breadcrumb.dirty") : ""}
      </span>
    </div>
  );
}
