/**
 * Remembers the caret offset for each file a user has opened, keyed by
 * workspace root. State lives in localStorage (per-device, not synced with
 * the workspace contents) and is capped at MAX_ENTRIES most-recent paths per
 * workspace via an LRU eviction on write.
 */

const STORAGE_PREFIX = "splot.cursors:";
const MAX_ENTRIES = 500;

interface WorkspaceMap {
  /** `path -> offset`. Insertion order is used as the LRU order. */
  entries: Record<string, number>;
}

function storageKey(workspaceRoot: string): string {
  return `${STORAGE_PREFIX}${workspaceRoot}`;
}

function load(workspaceRoot: string): WorkspaceMap {
  try {
    const raw = localStorage.getItem(storageKey(workspaceRoot));
    if (!raw) return { entries: {} };
    const parsed = JSON.parse(raw) as Partial<WorkspaceMap>;
    return { entries: parsed.entries ?? {} };
  } catch {
    return { entries: {} };
  }
}

function save(workspaceRoot: string, map: WorkspaceMap): void {
  try {
    localStorage.setItem(storageKey(workspaceRoot), JSON.stringify(map));
  } catch {
    // Quota or privacy mode — cursor memory is best-effort.
  }
}

export function getCursor(
  workspaceRoot: string,
  path: string,
): number | null {
  const map = load(workspaceRoot);
  const v = map.entries[path];
  return typeof v === "number" ? v : null;
}

export function setCursor(
  workspaceRoot: string,
  path: string,
  offset: number,
): void {
  const map = load(workspaceRoot);
  // Delete-then-set re-inserts the key at the end, keeping LRU order intact.
  delete map.entries[path];
  map.entries[path] = offset;

  const keys = Object.keys(map.entries);
  if (keys.length > MAX_ENTRIES) {
    const drop = keys.length - MAX_ENTRIES;
    for (let i = 0; i < drop; i++) {
      delete map.entries[keys[i]];
    }
  }
  save(workspaceRoot, map);
}

export function forgetCursor(workspaceRoot: string, path: string): void {
  const map = load(workspaceRoot);
  if (path in map.entries) {
    delete map.entries[path];
    save(workspaceRoot, map);
  }
}
