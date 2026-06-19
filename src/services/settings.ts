import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type FontChoice = "serif" | "sans" | "system" | "mono";
export type LinkOpenMode = "click" | "modClick";

export interface Settings {
  /** When true, editor text fills the panel width instead of the 72ch measure. */
  fullWidthEditor: boolean;
  /** Debounce for autosave, in milliseconds. */
  autosaveDelayMs: number;
  /** Explicit theme override. "system" follows OS preference. */
  theme: ThemeChoice;
  /** Editor font family family (curated stacks). */
  editorFont: FontChoice;
  /** Editor font size in px. */
  editorFontSize: number;
  /** Editor line height (unitless multiplier). */
  editorLineHeight: number;
  /** When true, the `.trash` folder is visible in the workspace tree. */
  showTrash: boolean;
  /** When true, completing a task auto-reorders the list so done items sink. */
  autoSortDoneTasks: boolean;
  /** How clicking a link in the editor behaves. */
  linkOpenMode: LinkOpenMode;
  /** When true, VS Code–style line editing shortcuts (delete/duplicate/move). */
  ideLineShortcuts: boolean;
  /** When true, expressions ending with `=` show their result as ghost text. */
  inlineCalc: boolean;
  /** When true, Ctrl/Cmd + mousewheel adjusts the editor font size. */
  wheelZoom: boolean;
  /** When true, the active line is kept vertically centered in the editor. */
  typewriterMode: boolean;
  /** When true, paragraphs other than the one with the caret are dimmed. */
  focusMode: boolean;
  /** Global shortcut spec (e.g. "Mod+Shift+I") that opens Quick Capture.
   *  Stored in the platform-neutral spec form used across the app; translated
   *  to Tauri's accelerator syntax at the service boundary. */
  quickCaptureShortcut: string;
  /** When false, Quick Capture is fully disabled: the global hotkey is
   *  unregistered, the in-app shortcut is inert, and the command palette entry
   *  is hidden. */
  quickCaptureEnabled: boolean;
}

export const QUICK_CAPTURE_DEFAULT_SHORTCUT = "Mod+Shift+I";

export const AUTOSAVE_MIN_MS = 500;
export const AUTOSAVE_MAX_MS = 10_000;
export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 17;
export const LINE_HEIGHT_MIN = 1.3;
export const LINE_HEIGHT_MAX = 2.0;

const DEFAULTS: Settings = {
  fullWidthEditor: true,
  autosaveDelayMs: 1500,
  theme: "system",
  editorFont: "serif",
  editorFontSize: FONT_SIZE_DEFAULT,
  editorLineHeight: 1.65,
  showTrash: false,
  autoSortDoneTasks: false,
  linkOpenMode: "modClick",
  ideLineShortcuts: false,
  inlineCalc: true,
  wheelZoom: true,
  typewriterMode: false,
  focusMode: false,
  quickCaptureShortcut: QUICK_CAPTURE_DEFAULT_SHORTCUT,
  quickCaptureEnabled: true,
};

export const FONT_STACKS: Record<FontChoice, string> = {
  serif:
    '"Iowan Old Style", "Palatino", "Palatino Linotype", "Georgia", "Charter", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  mono: '"SF Mono", "JetBrains Mono", "Menlo", "Consolas", ui-monospace, monospace',
};

const STORAGE_KEY = "splot.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function getSettings(): Settings {
  return current;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // localStorage can fail (quota, privacy); state still updates in-memory.
  }
  emit();
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/**
 * Re-read settings from `localStorage` and notify subscribers if anything
 * changed. Each Tauri webview has its own JS context but shares `localStorage`,
 * so a setting written in the main window isn't seen by the Quick Capture
 * window's in-memory copy until it reloads. Call this when a secondary window
 * regains focus to pick up changes made elsewhere.
 */
export function reloadSettings(): void {
  const next = load();
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    current = next;
    emit();
  }
}

/**
 * Apply the explicit theme override to the document root. `"system"` adds no
 * class, letting the `prefers-color-scheme` media query in tokens.css pick the
 * palette; `"light"`/`"dark"` force it. Shared by every window (main editor +
 * Quick Capture) so they stay visually consistent.
 */
export function applyThemeClass(theme: ThemeChoice): void {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  if (theme === "light") root.classList.add("theme-light");
  else if (theme === "dark") root.classList.add("theme-dark");
}

/**
 * Keep the document root's theme class in sync with the setting, now and on
 * every change. Returns an unsubscribe fn. For windows that aren't already
 * subscribed to settings via React (e.g. the standalone Quick Capture entry).
 */
export function watchThemeClass(): () => void {
  applyThemeClass(getSettings().theme);
  return subscribe(() => applyThemeClass(getSettings().theme));
}
