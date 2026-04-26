/**
 * Remembers which file was open in each workspace so the next session can
 * restore it. One entry per workspace root — we don't keep history beyond
 * the most recent file, because anything older is already discoverable
 * through the file tree and quick open.
 */

const STORAGE_PREFIX = "splot.lastFile:";

function storageKey(workspaceRoot: string): string {
  return `${STORAGE_PREFIX}${workspaceRoot}`;
}

export function getLastFile(workspaceRoot: string): string | null {
  try {
    return localStorage.getItem(storageKey(workspaceRoot));
  } catch {
    return null;
  }
}

export function setLastFile(workspaceRoot: string, path: string): void {
  try {
    localStorage.setItem(storageKey(workspaceRoot), path);
  } catch {
    // Quota or privacy mode — best-effort.
  }
}

export function forgetLastFile(workspaceRoot: string): void {
  try {
    localStorage.removeItem(storageKey(workspaceRoot));
  } catch {
    // ignore
  }
}
