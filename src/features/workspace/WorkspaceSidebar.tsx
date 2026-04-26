import { useRef, useState } from "react";
import type { WorkspaceNode } from "../../types/workspace";
import { isSupportedTextFile } from "../../types/workspace";
import { t } from "../../i18n/i18n";

interface Props {
  roots: WorkspaceNode[];
  activePath: string | null;
  onOpen: (path: string) => void;
  onTrash: (path: string, name: string) => void;
  onMove: (from: string, toDir: string) => void;
}

const TRASH_DIR = ".trash";
/** WKWebView (Tauri) only reliably round-trips text/plain through dataTransfer. */
const DND_MIME = "text/plain";
/** Sentinel path meaning "the workspace root" — never a real tree node. */
const ROOT_SENTINEL = "\u0000root";

function isInTrash(path: string): boolean {
  return path === TRASH_DIR || path.startsWith(`${TRASH_DIR}/`);
}

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Mirror of the Rust-side validation so invalid drops get no visual cue. */
function isValidMove(from: string, toDir: string): boolean {
  if (!from) return false;
  if (isInTrash(from)) return false;
  if (toDir && isInTrash(toDir)) return false;
  // Can't drop into itself or its own subtree.
  if (toDir === from || toDir.startsWith(`${from}/`)) return false;
  // No-op: already lives directly in the target dir.
  if (parentDir(from) === toDir) return false;
  return true;
}

export function WorkspaceSidebar({
  roots,
  activePath,
  onOpen,
  onTrash,
  onMove,
}: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Synchronous source-of-truth for the currently dragged path.
  // dataTransfer.getData() returns "" during dragover in most browsers for
  // security reasons, and relying on React state means the first dragover
  // fires before the state update has committed — both routes fail silently.
  const draggingRef = useRef<string | null>(null);

  const clearDrag = () => {
    setDragOver(null);
    draggingRef.current = null;
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    const from = draggingRef.current;
    if (!from) return;
    if (!isValidMove(from, "")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(ROOT_SENTINEL);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const from = draggingRef.current ?? e.dataTransfer.getData(DND_MIME);
    clearDrag();
    if (from && isValidMove(from, "")) onMove(from, "");
  };

  return (
    <nav
      className={`tree ${dragOver === ROOT_SENTINEL ? "is-drop-root" : ""}`}
      aria-label="Workspace"
      onDragOver={handleRootDragOver}
      onDragLeave={(e) => {
        // Only clear if the cursor actually left the nav, not when it crosses
        // into a child element (where relatedTarget is still inside).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver((v) => (v === ROOT_SENTINEL ? null : v));
        }
      }}
      onDrop={handleRootDrop}
      onDragEnd={clearDrag}
    >
      <ul className="tree-list" role="tree">
        {roots.map((node) => (
          <TreeNode
            key={node.path || node.name}
            node={node}
            depth={0}
            activePath={activePath}
            onOpen={onOpen}
            onTrash={onTrash}
            onMove={onMove}
            dragOver={dragOver}
            setDragOver={setDragOver}
            draggingRef={draggingRef}
          />
        ))}
      </ul>
    </nav>
  );
}

interface NodeProps {
  node: WorkspaceNode;
  depth: number;
  activePath: string | null;
  onOpen: (path: string) => void;
  onTrash: (path: string, name: string) => void;
  onMove: (from: string, toDir: string) => void;
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  draggingRef: React.MutableRefObject<string | null>;
}

function TreeNode({
  node,
  depth,
  activePath,
  onOpen,
  onTrash,
  onMove,
  dragOver,
  setDragOver,
  draggingRef,
}: NodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const inTrash = isInTrash(node.path);
  const isTrashRoot = node.path === TRASH_DIR;
  // Allow trashing normal items, but not the trash folder or anything inside it.
  const canTrash = !inTrash && !isTrashRoot;
  const canDrag = !inTrash && !isTrashRoot;

  const handleDragStart = (e: React.DragEvent) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DND_MIME, node.path);
    e.dataTransfer.effectAllowed = "move";
    draggingRef.current = node.path;
  };

  const handleDragEnd = () => {
    setDragOver(null);
    draggingRef.current = null;
  };

  if (node.kind === "directory") {
    const handleDragOver = (e: React.DragEvent) => {
      const from = draggingRef.current;
      if (!from || !isValidMove(from, node.path)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dragOver !== node.path) setDragOver(node.path);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const from = draggingRef.current ?? e.dataTransfer.getData(DND_MIME);
      setDragOver(null);
      draggingRef.current = null;
      if (from && isValidMove(from, node.path)) onMove(from, node.path);
    };

    const isDropTarget = dragOver === node.path;

    return (
      <li role="treeitem" aria-expanded={expanded}>
        <div className="tree-row-wrap">
          <button
            type="button"
            className={`tree-row tree-row--dir ${
              inTrash ? "is-trashed" : ""
            } ${isDropTarget ? "is-drop-target" : ""}`}
            style={{ paddingLeft: indent(depth) }}
            draggable={canDrag}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className={`chevron ${expanded ? "chevron--open" : ""}`} aria-hidden>
              ›
            </span>
            <span className="tree-label">{node.name}</span>
          </button>
          {canTrash ? (
            <button
              type="button"
              className="tree-trash"
              onClick={(e) => {
                e.stopPropagation();
                onTrash(node.path, node.name);
              }}
              aria-label={t("trash.aria", { name: node.name })}
              title={t("trash.aria", { name: node.name })}
            >
              ×
            </button>
          ) : null}
        </div>
        {expanded && node.children.length > 0 ? (
          <ul className="tree-list" role="group">
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                onOpen={onOpen}
                onTrash={onTrash}
                onMove={onMove}
                dragOver={dragOver}
                setDragOver={setDragOver}
                draggingRef={draggingRef}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const active = activePath === node.path;
  const supported = isSupportedTextFile(node);

  return (
    <li role="treeitem" aria-selected={active}>
      <div className="tree-row-wrap">
        <button
          type="button"
          className={`tree-row tree-row--file ${active ? "is-active" : ""} ${
            supported ? "" : "is-unsupported"
          } ${inTrash ? "is-trashed" : ""}`}
          style={{ paddingLeft: indent(depth) }}
          draggable={canDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onClick={() => supported && onOpen(node.path)}
          disabled={!supported}
          title={supported ? node.path : `${node.path} (unsupported file type)`}
        >
          <span className="file-dot" aria-hidden />
          <span className="tree-label">{node.name}</span>
        </button>
        {canTrash ? (
          <button
            type="button"
            className="tree-trash"
            onClick={(e) => {
              e.stopPropagation();
              onTrash(node.path, node.name);
            }}
            aria-label={t("trash.aria", { name: node.name })}
            title={t("trash.aria", { name: node.name })}
          >
            ×
          </button>
        ) : null}
      </div>
    </li>
  );
}

function indent(depth: number): number {
  return 10 + depth * 14;
}
