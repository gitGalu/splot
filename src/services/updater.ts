/**
 * App auto-update service.
 *
 * Wraps `@tauri-apps/plugin-updater` so the rest of the app can ask "is there
 * a new build?" without knowing about Tauri internals. The updater plugin and
 * its Rust counterpart are only registered on macOS and Windows (see
 * src-tauri/src/lib.rs and src-tauri/Cargo.toml), so this module short-circuits
 * to `unsupported-platform` on Linux. Flatpak users get updates through their
 * package manager.
 *
 * Update flow is two-step on purpose:
 *   1. `checkForAppUpdate()` returns availability + release notes.
 *   2. `installAppUpdate()` downloads, applies, and restarts — only after the
 *      user confirms in the UI. We never auto-install.
 */
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "unsupported-platform" }
  | { kind: "up-to-date"; checkedAt: number }
  | {
      kind: "available";
      version: string;
      currentVersion: string;
      date: string | null;
      notes: string | null;
    }
  | { kind: "downloading"; downloaded: number; contentLength: number | null }
  | { kind: "installing" }
  | { kind: "error"; message: string };

const IS_MAC = /Mac|iPhone|iPod|iPad/i.test(
  typeof navigator !== "undefined" ? navigator.platform : "",
);
const IS_WINDOWS = /Win/i.test(
  typeof navigator !== "undefined" ? navigator.platform : "",
);

export const isUpdaterSupported = IS_MAC || IS_WINDOWS;

let pendingUpdate: Update | null = null;

export interface CheckResult {
  status: UpdateStatus;
}

export async function checkForAppUpdate(): Promise<CheckResult> {
  if (!isUpdaterSupported) {
    return { status: { kind: "unsupported-platform" } };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { getVersion } = await import("@tauri-apps/api/app");
    const currentVersion = await getVersion();
    const update = await check();
    if (!update) {
      pendingUpdate = null;
      return { status: { kind: "up-to-date", checkedAt: Date.now() } };
    }
    pendingUpdate = update;
    return {
      status: {
        kind: "available",
        version: update.version,
        currentVersion,
        date: update.date ?? null,
        notes: update.body ?? null,
      },
    };
  } catch (e) {
    pendingUpdate = null;
    return {
      status: { kind: "error", message: errorMessage(e) },
    };
  }
}

export interface InstallOptions {
  onProgress?: (status: UpdateStatus) => void;
}

/**
 * Download + install + restart. Must be called only after a successful
 * `checkForAppUpdate()` returned `kind: "available"`. The progress callback
 * fires with `downloading` events while bytes flow, then `installing`, and
 * finally the app restarts (so subsequent code may not run).
 */
export async function installAppUpdate(
  options: InstallOptions = {},
): Promise<UpdateStatus> {
  if (!isUpdaterSupported) {
    return { kind: "unsupported-platform" };
  }
  if (!pendingUpdate) {
    return {
      kind: "error",
      message: "No update has been detected — call checkForAppUpdate() first.",
    };
  }
  const update = pendingUpdate;
  let downloaded = 0;
  let contentLength: number | null = null;
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength =
          typeof event.data.contentLength === "number"
            ? event.data.contentLength
            : null;
        options.onProgress?.({ kind: "downloading", downloaded, contentLength });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        options.onProgress?.({ kind: "downloading", downloaded, contentLength });
      } else if (event.event === "Finished") {
        options.onProgress?.({ kind: "installing" });
      }
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return { kind: "installing" };
  } catch (e) {
    return { kind: "error", message: errorMessage(e) };
  } finally {
    pendingUpdate = null;
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Unknown error";
}
