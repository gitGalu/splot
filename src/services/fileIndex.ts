import type { FileRef, WorkspaceNode } from "../types/workspace";
import { fuzzyMatch } from "./fuzzy";

/**
 * A flat, searchable view of the workspace. Kept separate from the tree so
 * quick-open can iterate this without reshaping the tree component.
 */
export interface FileSearchResult {
  file: FileRef;
  score: number;
  /** Matched character positions within `file.name`, for highlighting. */
  namePositions: number[];
  /** Matched character positions within `file.path`, for highlighting. */
  pathPositions: number[];
}

export interface FileSearchOptions {
  /**
   * If set, only files whose path is inside this directory are considered.
   * Pass the directory's relative path (no leading slash, no trailing slash).
   * An empty string means "workspace root only" — files directly at the root,
   * with no subdirectory in their path.
   */
  scope?: string | null;
}

export interface FileIndex {
  all(): FileRef[];
  findByPath(path: string): FileRef | undefined;
  /** Fuzzy, ranked search over file name + relative path. */
  search(query: string, limit?: number, options?: FileSearchOptions): FileSearchResult[];
}

const DEFAULT_LIMIT = 50;

const TRASH_DIR_NAME = ".trash";

/**
 * Build a predicate that decides whether a file lies within `scope`.
 *
 * Conventions for `scope`:
 *   - `null`/`undefined` — no scope filter, every file passes.
 *   - `""` (empty string) — root only: files directly at the workspace root
 *     (their path contains no `/`).
 *   - `"docs"` or `"a/b"` — files inside that directory at any depth.
 *
 * The scope is normalised: leading/trailing slashes are stripped so callers
 * can pass `/docs/` or `docs` interchangeably.
 */
function makeScopePredicate(scope: string | null | undefined): (f: FileRef) => boolean {
  if (scope == null) return () => true;
  const trimmed = scope.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "") {
    return (f) => !f.path.includes("/");
  }
  const prefix = `${trimmed}/`;
  return (f) => f.path.startsWith(prefix);
}

export function buildFileIndex(roots: WorkspaceNode[]): FileIndex {
  const files: FileRef[] = [];
  const walk = (nodes: WorkspaceNode[], depth: number) => {
    for (const node of nodes) {
      // Trash lives at workspace root; never index its contents even when the
      // user has chosen to show it in the tree.
      if (depth === 0 && node.kind === "directory" && node.name === TRASH_DIR_NAME) {
        continue;
      }
      if (node.kind === "file") {
        files.push({
          path: node.path,
          name: node.name,
          extension: node.extension,
          size: node.size,
        });
      } else {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(roots, 0);

  const byPath = new Map(files.map((f) => [f.path, f]));

  return {
    all: () => files.slice(),
    findByPath: (path) => byPath.get(path),
    search: (query, limit = DEFAULT_LIMIT, options) => {
      const q = query.trim();
      const inScope = makeScopePredicate(options?.scope);
      if (!q) {
        return files
          .filter(inScope)
          .sort((a, b) => a.path.localeCompare(b.path))
          .slice(0, limit)
          .map((file) => ({
            file,
            score: 0,
            namePositions: [],
            pathPositions: [],
          }));
      }

      const results: FileSearchResult[] = [];
      for (const file of files) {
        if (!inScope(file)) continue;
        const nameMatch = fuzzyMatch(q, file.name);
        const pathMatch = fuzzyMatch(q, file.path);

        if (!nameMatch && !pathMatch) continue;

        // Name match is weighted higher: people search by filename first.
        const nameScore = nameMatch ? nameMatch.score * 1.5 : 0;
        const pathScore = pathMatch ? pathMatch.score : 0;
        const score = Math.max(nameScore, pathScore);

        results.push({
          file,
          score,
          namePositions: nameMatch?.positions ?? [],
          pathPositions: pathMatch?.positions ?? [],
        });
      }

      results.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
      return results.slice(0, limit);
    },
  };
}
