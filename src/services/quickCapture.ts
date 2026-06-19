/**
 * Quick Capture service: the typed boundary between the UI and the Tauri
 * commands that (a) append an entry to an `Inbox.md` and (b) manage the global
 * shortcut + capture window. Like every other service here, UI code goes
 * through this rather than touching `invoke` directly.
 */
import type { CommandBridge } from "./bridge";
import { tauriBridge } from "./bridge";
import { parseCapture } from "./parseCapture";
import type { WorkspaceNode } from "../types/workspace";

export interface InboxAppendResult {
  /** Workspace-relative path written to (`/`-separated). */
  path: string;
  /** Exact block appended (header line + body). */
  appended: string;
  /** True when a `@Folder` was requested but missing; entry went to the
   *  global inbox instead. */
  dirMissing: boolean;
}

/** Thrown when the parsed capture has no body to save (rule 13). */
export class EmptyCaptureError extends Error {
  constructor() {
    super("empty capture");
    this.name = "EmptyCaptureError";
  }
}

/**
 * Parse a raw capture string and append it to the appropriate inbox. Rejects
 * with {@link EmptyCaptureError} when the body is empty after parsing, so the
 * UI can show "can't save an empty entry" without hitting the backend.
 */
export async function captureToInbox(
  raw: string,
  bridge: CommandBridge = tauriBridge,
): Promise<InboxAppendResult> {
  const parsed = parseCapture(raw);
  if (!parsed.body.trim()) {
    throw new EmptyCaptureError();
  }
  const result = await bridge.invoke<{
    path: string;
    appended: string;
    dir_missing: boolean;
  }>("cmd_append_inbox", {
    targetDir: parsed.targetDirectory,
    tags: parsed.tags,
    body: parsed.body,
  });
  return {
    path: result.path,
    appended: result.appended,
    dirMissing: result.dir_missing,
  };
}

/**
 * Translate an app shortcut spec (`"Mod+Shift+I"`) into Tauri's global-shortcut
 * accelerator syntax (`"CmdOrCtrl+Shift+I"`). Only `Mod`/`Cmd` differ; the rest
 * of the tokens are already compatible.
 */
export function toAccelerator(spec: string): string {
  return spec
    .split("+")
    .map((t) => t.trim())
    .map((t) => (t === "Mod" || t === "Cmd" ? "CmdOrCtrl" : t))
    .join("+");
}

/**
 * (Re)bind the global Quick Capture shortcut. Returns `null` on success or a
 * short error string when the combo can't be registered (taken by another app,
 * missing OS permission, invalid). Callers surface that as a non-blocking hint
 * — the feature still works from the command palette.
 */
export async function applyShortcut(
  spec: string,
  bridge: CommandBridge = tauriBridge,
): Promise<string | null> {
  try {
    await bridge.invoke<void>("cmd_set_quick_capture_shortcut", {
      accelerator: toAccelerator(spec),
    });
    return null;
  } catch (e) {
    if (typeof e === "string") return e;
    if (e instanceof Error) return e.message;
    return String(e);
  }
}

/**
 * Unregister the global Quick Capture shortcut. Used when the feature is
 * disabled in settings. Best-effort; failures are swallowed since there's
 * nothing actionable for the user.
 */
export async function clearShortcut(
  bridge: CommandBridge = tauriBridge,
): Promise<void> {
  try {
    await bridge.invoke<void>("cmd_unregister_quick_capture_shortcut");
  } catch {
    /* nothing the user can do */
  }
}

/**
 * Undo the most recent append by removing the exact written block from the
 * inbox file. Best-effort: if the user edited the file meanwhile the backend
 * leaves it alone.
 */
export async function undoCapture(
  path: string,
  appended: string,
  bridge: CommandBridge = tauriBridge,
): Promise<void> {
  await bridge.invoke<void>("cmd_undo_inbox", { path, appended });
}

/** Hide the capture window (Esc or after a successful save). */
export async function closeQuickCapture(
  bridge: CommandBridge = tauriBridge,
): Promise<void> {
  await bridge.invoke<void>("cmd_close_quick_capture");
}

/** The active workspace root absolute path (for revealing the inbox file). */
export async function workspaceRoot(
  bridge: CommandBridge = tauriBridge,
): Promise<string> {
  const info = await bridge.invoke<{ root: string }>("cmd_workspace_info");
  return info.root;
}

/**
 * Names of the top-level directories in the active workspace — the candidates
 * a `@Folder` token can target (the MVP only supports first-level folders, so
 * we don't descend). Sorted case-insensitively. Hidden folders like `.trash`
 * are already filtered out by the backend tree listing.
 */
export async function listTargetDirectories(
  bridge: CommandBridge = tauriBridge,
): Promise<string[]> {
  const roots = await bridge.invoke<WorkspaceNode[]>("cmd_list_workspace");
  return roots
    .filter((n): n is Extract<WorkspaceNode, { kind: "directory" }> => n.kind === "directory")
    .map((n) => n.name)
    .sort((a, b) => a.localeCompare(b));
}
