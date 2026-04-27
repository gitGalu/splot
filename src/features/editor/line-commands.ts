import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
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
 */
export const lineCommandsKeymap = Prec.high(
  keymap.of([
    { key: "Mod-d", run: deleteLine, preventDefault: true },
    { key: "Mod-Shift-ArrowUp", run: copyLineUp, preventDefault: true },
    { key: "Mod-Shift-ArrowDown", run: copyLineDown, preventDefault: true },
    { key: "Alt-Shift-ArrowUp", run: moveLineUp, preventDefault: true },
    { key: "Alt-Shift-ArrowDown", run: moveLineDown, preventDefault: true },
  ]),
);
