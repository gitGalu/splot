import { Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import {
  copyLineDown,
  copyLineUp,
  deleteLine,
  moveLineDown,
  moveLineUp,
} from "@codemirror/commands";

/**
 * VS Code–style line shortcuts. Opt-in via the "ideLineShortcuts" setting.
 *
 *   Mod-D                  delete line
 *   Mod-Shift-ArrowUp/Down duplicate line
 *   Alt-Shift-ArrowUp/Down move line
 *
 * The CodeMirror defaults bind copy to Shift-Alt and move to plain Alt, which
 * clashes with the VS Code mapping. Prec.high beats defaultKeymap so these
 * win when the setting is on.
 *
 * Important: `moveLineUp` / `moveLineDown` return `false` when there's no
 * room to move (already at top/bottom). CodeMirror then falls through to
 * the next binding that matches the same key — which under the default
 * keymap is `copyLineUp` / `copyLineDown`. Without `consume`, hitting
 * Alt+Shift+↑ on the first line would silently duplicate it instead of
 * being a no-op. Wrap the move commands so they always claim the event.
 */
const consume = (cmd: Command): Command => (view) => {
  cmd(view);
  return true;
};

export const lineCommandsKeymap = Prec.high(
  keymap.of([
    { key: "Mod-d", run: deleteLine, preventDefault: true },
    { key: "Mod-Shift-ArrowUp", run: copyLineUp, preventDefault: true },
    { key: "Mod-Shift-ArrowDown", run: copyLineDown, preventDefault: true },
    { key: "Alt-Shift-ArrowUp", run: consume(moveLineUp), preventDefault: true },
    { key: "Alt-Shift-ArrowDown", run: consume(moveLineDown), preventDefault: true },
  ]),
);
