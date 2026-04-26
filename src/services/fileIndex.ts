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

export interface FileIndex {
  all(): FileRef[];
  findByPath(path: string): FileRef | undefined;
  /** Fuzzy, ranked search over file name + relative path. */
  search(query: string, limit?: number): FileSearchResult[];
}

const DEFAULT_LIMIT = 50;

export function buildFileIndex(roots: WorkspaceNode[]): FileIndex {
  const files: FileRef[] = [];
  const walk = (nodes: WorkspaceNode[]) => {
    for (const node of nodes) {
      if (node.kind === "file") {
        files.push({
          path: node.path,
          name: node.name,
          extension: node.extension,
          size: node.size,
        });
      } else {
        walk(node.children);
      }
    }
  };
  walk(roots);

  const byPath = new Map(files.map((f) => [f.path, f]));

  return {
    all: () => files.slice(),
    findByPath: (path) => byPath.get(path),
    search: (query, limit = DEFAULT_LIMIT) => {
      const q = query.trim();
      if (!q) {
        return files
          .slice()
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
