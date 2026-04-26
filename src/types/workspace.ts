/**
 * Domain types shared between the workspace layer and the UI.
 * Kept framework-free so they remain reusable from alternative shells
 * (future mobile, future alternative providers, etc.).
 */

export interface WorkspaceRef {
  name: string;
  root: string;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
}

export interface WorkspaceRegistry {
  active: string | null;
  workspaces: WorkspaceEntry[];
}

export interface FileRef {
  path: string;
  name: string;
  extension: string | null;
  size: number;
}

export type WorkspaceNode =
  | {
      kind: "directory";
      name: string;
      path: string;
      children: WorkspaceNode[];
    }
  | {
      kind: "file";
      name: string;
      path: string;
      extension: string | null;
      size: number;
    };

export interface WorkspaceTree {
  workspace: WorkspaceRef;
  roots: WorkspaceNode[];
}

export interface FileContent {
  path: string;
  text: string;
}

export interface OpenFileState {
  ref: FileRef;
  original: string;
  current: string;
}

export function isDirty(state: OpenFileState): boolean {
  return state.original !== state.current;
}

export interface ContentHit {
  path: string;
  line: number;
  snippet: string;
  /** Inclusive-start, exclusive-end byte offsets within `snippet`. */
  positions: Array<[number, number]>;
}

export const SUPPORTED_TEXT_EXTENSIONS = new Set(["md", "markdown", "txt"]);

export function isSupportedTextFile(node: WorkspaceNode): boolean {
  if (node.kind !== "file") return false;
  if (!node.extension) return false;
  return SUPPORTED_TEXT_EXTENSIONS.has(node.extension.toLowerCase());
}
