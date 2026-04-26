/**
 * Render a platform-neutral shortcut spec like `"Mod+Shift+M"` into the
 * glyphs or words a user on this OS actually sees on their keyboard.
 *
 * Specs use these tokens, joined by `+`:
 *   Mod     → ⌘ on macOS, Ctrl elsewhere
 *   Ctrl    → ⌃ on macOS, Ctrl elsewhere
 *   Alt     → ⌥ on macOS, Alt elsewhere
 *   Shift   → ⇧ on macOS, Shift elsewhere
 *   Enter, Esc, Space, Tab, Backspace, ArrowUp/Down/Left/Right, letters…
 *
 * The exact modifier mapping mirrors how we handle keyboard events in the
 * app (`metaKey || ctrlKey`): a user on macOS presses Cmd, everyone else
 * presses Ctrl, and the label should reflect that.
 */

const IS_MAC = /Mac|iPhone|iPod|iPad/i.test(
  typeof navigator !== "undefined" ? navigator.platform : "",
);

const MAC_TOKENS: Record<string, string> = {
  Mod: "⌘",
  Cmd: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Option: "⌥",
  Shift: "⇧",
  Enter: "⏎",
  Esc: "Esc",
  Escape: "Esc",
  Space: "Space",
  Tab: "⇥",
  Backspace: "⌫",
  Delete: "⌦",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

const PC_TOKENS: Record<string, string> = {
  Mod: "Ctrl",
  Cmd: "Ctrl",
  Ctrl: "Ctrl",
  Alt: "Alt",
  Option: "Alt",
  Shift: "Shift",
  Enter: "Enter",
  Esc: "Esc",
  Escape: "Esc",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/** Render one token (e.g. `"Mod"`, `"Shift"`, `"M"`). Unknown tokens pass
 *  through with a single-letter uppercase normalization. */
function renderToken(token: string): string {
  const map = IS_MAC ? MAC_TOKENS : PC_TOKENS;
  if (token in map) return map[token];
  return token.length === 1 ? token.toUpperCase() : token;
}

/**
 * Turn a spec like `"Mod+Shift+M"` into an array of rendered chunks
 * (`["⌘", "⇧", "M"]` on macOS, `["Ctrl", "Shift", "M"]` elsewhere).
 * Returned as an array so UIs can render each token in its own `<kbd>`.
 */
export function formatShortcut(spec: string): string[] {
  return spec.split("+").map((t) => renderToken(t.trim())).filter(Boolean);
}

/** Flat string form — useful for `hint` fields in the command palette. */
export function formatShortcutString(spec: string): string {
  return formatShortcut(spec).join(IS_MAC ? "" : "+");
}

export const isMac = IS_MAC;
