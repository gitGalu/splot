import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { createTauriWorkspaceProvider, loadWorkspaceTree } from "../services/workspaceProvider";
import type {
  OpenFileState,
  WorkspaceRegistry,
  WorkspaceTree,
} from "../types/workspace";
import { isDirty } from "../types/workspace";
import { buildFileIndex } from "../services/fileIndex";
import { WorkspaceSidebar } from "../features/workspace/WorkspaceSidebar";
import { WorkspaceSwitcher } from "../features/workspace/WorkspaceSwitcher";
import { MoveFileModal } from "../features/workspace/MoveFileModal";
import { EditorPane } from "../features/editor/EditorPane";
import { sortTasks } from "../features/editor/task-toggle";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import type { Heading } from "../services/headings";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { Resizer } from "../components/Resizer";
import { QuickOpen } from "../features/quickopen/QuickOpen";
import { CommandPalette, type Command } from "../features/commands/CommandPalette";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { HelpModal } from "../features/help/HelpModal";
import { UpdateModal } from "../features/updates/UpdateModal";
import { isUpdaterSupported } from "../services/updater";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  getSettings,
  setSetting,
  useSettings,
} from "../services/settings";
import { forgetCursor, getCursor, setCursor } from "../services/cursorMemory";
import { forgetLastFile, getLastFile, setLastFile } from "../services/lastFile";
import { formatShortcutString } from "../services/keyLabel";
import { t } from "../i18n/i18n";

const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_STORAGE_KEY = "splot.sidebarWidth";
const SIDEBAR_VISIBLE_STORAGE_KEY = "splot.sidebarVisible";

export function App() {
  const provider = useMemo(() => createTauriWorkspaceProvider(), []);
  const [tree, setTree] = useState<WorkspaceTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenFileState | null>(null);
  const [saving, setSaving] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickOpenInitial, setQuickOpenInitial] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const { autosaveDelayMs, theme, showTrash, typewriterMode, focusMode } =
    useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    if (theme === "light") root.classList.add("theme-light");
    else if (theme === "dark") root.classList.add("theme-dark");
  }, [theme]);
  const [registry, setRegistry] = useState<WorkspaceRegistry | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX) {
      return stored;
    }
    return SIDEBAR_DEFAULT;
  });
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => {
    return localStorage.getItem(SIDEBAR_VISIBLE_STORAGE_KEY) !== "0";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_VISIBLE_STORAGE_KEY, sidebarVisible ? "1" : "0");
  }, [sidebarVisible]);

  const refreshTree = useCallback(async () => {
    try {
      const next = await loadWorkspaceTree(provider, showTrash);
      setTree(next);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  }, [provider, showTrash]);

  const refreshRegistry = useCallback(async () => {
    try {
      const next = await provider.listWorkspaces();
      setRegistry(next);
    } catch (e) {
      setError(formatError(e));
    }
  }, [provider]);

  useEffect(() => {
    refreshTree();
    refreshRegistry();
  }, [refreshTree, refreshRegistry]);

  const openRef = useRef<OpenFileState | null>(null);
  openRef.current = open;
  const editorViewRef = useRef<EditorView | null>(null);

  const flushPending = useCallback(async () => {
    const cur = openRef.current;
    if (!cur || !isDirty(cur)) return;
    try {
      await provider.writeFile(cur.ref.path, cur.current);
    } catch (e) {
      setError(formatError(e));
    }
  }, [provider]);

  const handleSwitchWorkspace = useCallback(
    async (path: string) => {
      try {
        await flushPending();
        await provider.switchWorkspace(path);
        setOpen(null);
        await Promise.all([refreshTree(), refreshRegistry()]);
        setError(null);
      } catch (e) {
        setError(formatError(e));
      }
    },
    [provider, refreshTree, refreshRegistry, flushPending],
  );

  const handleOpenFolder = useCallback(async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: t("ws.openDialog.title"),
      });
      if (!picked || typeof picked !== "string") return;
      await provider.addWorkspace(picked);
      await provider.switchWorkspace(picked);
      setOpen(null);
      await Promise.all([refreshTree(), refreshRegistry()]);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  }, [provider, refreshTree, refreshRegistry]);

  const handleRevealWorkspace = useCallback(async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  const handleRemoveWorkspace = useCallback(
    async (path: string) => {
      const entry = registry?.workspaces.find((w) => w.path === path);
      const name = entry?.name ?? path;
      const isActive = registry?.active === path;
      const confirmed = await ask(t("ws.remove.confirm", { name }), {
        title: t("ws.remove.title"),
        kind: "warning",
        okLabel: t("ws.remove.ok"),
        cancelLabel: t("ws.remove.cancel"),
      });
      if (!confirmed) return;
      try {
        const next = await provider.removeWorkspace(path);
        setRegistry(next);
        if (isActive) {
          setOpen(null);
          await refreshTree();
        }
        setError(null);
      } catch (e) {
        setError(formatError(e));
      }
    },
    [provider, refreshTree, registry],
  );

  const fileIndex = useMemo(
    () => (tree ? buildFileIndex(tree.roots) : null),
    [tree],
  );

  const handleOpen = useCallback(
    async (path: string) => {
      if (!fileIndex) return;
      const ref = fileIndex.findByPath(path);
      if (!ref) return;
      await flushPending();
      try {
        const content = await provider.readFile(path);
        setOpen({ ref, original: content.text, current: content.text });
        if (tree) setLastFile(tree.workspace.root, path);
        setError(null);
      } catch (e) {
        setError(formatError(e));
      }
    },
    [fileIndex, provider, flushPending, tree],
  );

  // Restore the last-open file when a workspace first becomes available, or
  // when we switch to a different workspace. We only touch the empty-file
  // state so an in-progress edit isn't clobbered.
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tree || !fileIndex) return;
    const root = tree.workspace.root;
    if (restoredForRef.current === root) return;
    restoredForRef.current = root;
    if (openRef.current) return;
    const last = getLastFile(root);
    if (!last) return;
    if (!fileIndex.findByPath(last)) {
      // File was removed or renamed outside the app; drop the stale pointer.
      forgetLastFile(root);
      return;
    }
    void handleOpen(last);
  }, [tree, fileIndex, handleOpen]);

  const handleChange = useCallback((text: string) => {
    setOpen((prev) => (prev ? { ...prev, current: text } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!open || !isDirty(open) || saving) return;
    setSaving(true);
    try {
      await provider.writeFile(open.ref.path, open.current);
      setOpen((prev) =>
        prev && prev.ref.path === open.ref.path
          ? { ...prev, original: prev.current }
          : prev,
      );
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }, [open, provider, saving]);

  const handleMove = useCallback(
    async (from: string, toDir: string) => {
      try {
        await flushPending();
        const newPath = await provider.moveEntry(from, toDir);
        // If the moved entry was (or contained) the open file, rewrite its path
        // so subsequent saves land at the new location.
        setOpen((prev) => {
          if (!prev) return prev;
          if (prev.ref.path === from) {
            const name = newPath.split("/").pop() ?? prev.ref.name;
            return { ...prev, ref: { ...prev.ref, path: newPath, name } };
          }
          if (prev.ref.path.startsWith(`${from}/`)) {
            const suffix = prev.ref.path.slice(from.length);
            const rewired = `${newPath}${suffix}`;
            return { ...prev, ref: { ...prev.ref, path: rewired } };
          }
          return prev;
        });
        // Migrate any remembered caret position to the new path so the user's
        // cursor is still restored after a move.
        if (tree) {
          const root = tree.workspace.root;
          const saved = getCursor(root, from);
          if (saved != null) {
            setCursor(root, newPath, saved);
            forgetCursor(root, from);
          }
          if (getLastFile(root) === from) {
            setLastFile(root, newPath);
          }
        }
        await refreshTree();
        setError(null);
      } catch (e) {
        setError(formatError(e));
      }
    },
    [provider, refreshTree, flushPending, tree],
  );

  const handleTrash = useCallback(
    async (path: string, name: string) => {
      const confirmed = await ask(t("trash.confirm", { name }), {
        title: t("trash.title"),
        kind: "warning",
        okLabel: t("trash.ok"),
        cancelLabel: t("trash.cancel"),
      });
      if (!confirmed) return;
      try {
        const openPath = openRef.current?.ref.path;
        const trashingOpen =
          !!openPath && (openPath === path || openPath.startsWith(`${path}/`));
        if (trashingOpen) {
          setOpen(null);
        }
        await provider.trashEntry(path);
        if (tree) {
          forgetCursor(tree.workspace.root, path);
          if (trashingOpen) forgetLastFile(tree.workspace.root);
        }
        await refreshTree();
        setError(null);
      } catch (e) {
        setError(formatError(e));
      }
    },
    [provider, refreshTree, tree],
  );

  useEffect(() => {
    if (!open || !isDirty(open)) return;
    const id = window.setTimeout(() => {
      void handleSave();
    }, autosaveDelayMs);
    return () => window.clearTimeout(id);
  }, [open, autosaveDelayMs, handleSave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        handleSave();
      } else if (key === "p" && e.shiftKey) {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (key === "p") {
        e.preventDefault();
        setQuickOpenInitial("");
        setQuickOpen((v) => !v);
      } else if (key === "n") {
        e.preventDefault();
        setQuickOpenInitial("+ ");
        setQuickOpen(true);
      } else if (key === "b") {
        e.preventDefault();
        setSidebarVisible((v) => !v);
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const cur = getSettings().editorFontSize;
        setSetting(
          "editorFontSize",
          Math.min(FONT_SIZE_MAX, cur + 1),
        );
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const cur = getSettings().editorFontSize;
        setSetting(
          "editorFontSize",
          Math.max(FONT_SIZE_MIN, cur - 1),
        );
      } else if (e.key === "0") {
        e.preventDefault();
        setSetting("editorFontSize", FONT_SIZE_DEFAULT);
      } else if (key === "m" && e.shiftKey) {
        if (!openRef.current) return;
        e.preventDefault();
        setMoveOpen(true);
      } else if (key === "t" && e.shiftKey) {
        e.preventDefault();
        setSetting("typewriterMode", !getSettings().typewriterMode);
      } else if (key === "f" && e.shiftKey) {
        e.preventDefault();
        setSetting("focusMode", !getSettings().focusMode);
      } else if (e.key === "/") {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleTrash]);

  useEffect(() => {
    let accum = 0;
    const STEP = 60;
    const onWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!getSettings().wheelZoom) return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      accum += e.deltaY;
      const steps = Math.trunc(accum / STEP);
      if (steps === 0) return;
      accum -= steps * STEP;
      const cur = getSettings().editorFontSize;
      const next = Math.max(
        FONT_SIZE_MIN,
        Math.min(FONT_SIZE_MAX, cur - steps),
      );
      if (next !== cur) setSetting("editorFontSize", next);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  const handleCreate = useCallback(
    async (rel: string) => {
      await flushPending();
      const created = await provider.createEntry(rel);
      await refreshTree();
      setQuickOpen(false);
      if (created.kind === "file") {
        const content = await provider.readFile(created.path);
        const name = created.path.split("/").pop() ?? created.path;
        const extMatch = /\.([^./\\]+)$/.exec(name);
        setOpen({
          ref: {
            name,
            path: created.path,
            extension: extMatch ? extMatch[1].toLowerCase() : null,
            size: 0,
          },
          original: content.text,
          current: content.text,
        });
      }
    },
    [provider, refreshTree, flushPending],
  );

  const dirty = open ? isDirty(open) : false;

  useEffect(() => {
    const suffix = dirty ? " •" : "";
    const fileName = open?.ref.name ?? "Splot";
    document.title = open ? `${fileName}${suffix} — Splot` : "Splot";
  }, [open, dirty]);

  const handleCloseFile = useCallback(async () => {
    if (!open) return;
    await flushPending();
    setOpen(null);
    if (tree) forgetLastFile(tree.workspace.root);
  }, [open, flushPending, tree]);

  const handleRevealCurrent = useCallback(async () => {
    if (!open || !tree) return;
    const full = joinPath(tree.workspace.root, open.ref.path);
    try {
      await revealItemInDir(full);
    } catch (e) {
      setError(formatError(e));
    }
  }, [open, tree]);

  const commands = useMemo<Command[]>(() => {
    const GO = t("cmd.group.go");
    const FILE = t("cmd.group.file");
    const VIEW = t("cmd.group.view");
    const WS = t("cmd.group.workspace");
    const list: Command[] = [
      {
        id: "quickopen.files",
        label: t("cmd.quickopen.files"),
        group: GO,
        hint: formatShortcutString("Mod+P"),
        run: () => {
          setQuickOpenInitial("");
          setQuickOpen(true);
        },
      },
      {
        id: "quickopen.content",
        label: t("cmd.quickopen.content"),
        group: GO,
        hint: `${formatShortcutString("Mod+P")} >`,
        run: () => {
          setQuickOpenInitial(">");
          setQuickOpen(true);
        },
      },
      {
        id: "file.new",
        label: t("cmd.file.new"),
        group: FILE,
        hint: formatShortcutString("Mod+N"),
        run: () => {
          setQuickOpenInitial("+ ");
          setQuickOpen(true);
        },
      },
      {
        id: "file.save",
        label: t("cmd.file.save"),
        group: FILE,
        hint: formatShortcutString("Mod+S"),
        run: () => {
          void handleSave();
        },
      },
      {
        id: "view.toggleSidebar",
        label: t("cmd.view.toggleSidebar"),
        group: VIEW,
        hint: formatShortcutString("Mod+B"),
        run: () => setSidebarVisible((v) => !v),
      },
      {
        id: "view.typewriter",
        label: typewriterMode
          ? t("cmd.view.typewriterOff")
          : t("cmd.view.typewriterOn"),
        group: VIEW,
        hint: formatShortcutString("Mod+Shift+T"),
        run: () => setSetting("typewriterMode", !typewriterMode),
      },
      {
        id: "view.focus",
        label: focusMode
          ? t("cmd.view.focusOff")
          : t("cmd.view.focusOn"),
        group: VIEW,
        hint: formatShortcutString("Mod+Shift+F"),
        run: () => setSetting("focusMode", !focusMode),
      },
      {
        id: "settings.open",
        label: t("cmd.settings.open"),
        group: VIEW,
        hint: formatShortcutString("Mod+,"),
        run: () => setSettingsOpen(true),
      },
      {
        id: "help.open",
        label: t("cmd.help.open"),
        group: VIEW,
        hint: formatShortcutString("Mod+/"),
        run: () => setHelpOpen(true),
      },
      {
        id: "workspace.openFolder",
        label: t("cmd.workspace.openFolder"),
        group: WS,
        run: () => {
          void handleOpenFolder();
        },
      },
    ];

    if (isUpdaterSupported) {
      list.push({
        id: "update.check",
        label: t("cmd.update.check"),
        group: VIEW,
        run: () => setUpdateOpen(true),
      });
    }

    if (open) {
      list.push({
        id: "file.close",
        label: t("cmd.file.close"),
        group: FILE,
        run: handleCloseFile,
      });
      list.push({
        id: "file.revealCurrent",
        label: t("cmd.file.revealCurrent", { name: open.ref.name }),
        group: FILE,
        run: () => {
          void handleRevealCurrent();
        },
      });
      list.push({
        id: "file.trash",
        label: t("cmd.file.trash", { name: open.ref.name }),
        group: FILE,
        run: () => {
          void handleTrash(open.ref.path, open.ref.name);
        },
      });
      list.push({
        id: "file.move",
        label: t("cmd.file.move", { name: open.ref.name }),
        group: FILE,
        hint: formatShortcutString("Mod+Shift+M"),
        run: () => {
          setMoveOpen(true);
        },
      });

      list.push({
        id: "editor.find",
        label: t("cmd.editor.find"),
        group: t("cmd.group.edit"),
        hint: formatShortcutString("Mod+F"),
        run: () => {
          const view = editorViewRef.current;
          if (!view) return;
          view.focus();
          openSearchPanel(view);
        },
      });

      const ext = open.ref.extension;
      if (ext === "md" || ext === "markdown") {
        list.push({
          id: "editor.sortTasks",
          label: t("cmd.editor.sortTasks"),
          group: t("cmd.group.edit"),
          run: () => {
            const view = editorViewRef.current;
            if (!view) return;
            view.focus();
            sortTasks(view);
          },
        });
      }
    }

    if (registry) {
      for (const w of registry.workspaces) {
        const isActive = registry.active === w.path;
        if (!isActive) {
          list.push({
            id: `workspace.switch:${w.path}`,
            label: t("cmd.workspace.switch", { name: w.name }),
            group: WS,
            run: () => {
              void handleSwitchWorkspace(w.path);
            },
          });
        }
        list.push({
          id: `workspace.reveal:${w.path}`,
          label: t("cmd.workspace.reveal", { name: w.name }),
          group: WS,
          run: () => {
            void handleRevealWorkspace(w.path);
          },
        });
        list.push({
          id: `workspace.remove:${w.path}`,
          label: t("cmd.workspace.remove", { name: w.name }),
          group: WS,
          run: () => {
            void handleRemoveWorkspace(w.path);
          },
        });
      }
    }

    return list;
  }, [
    open,
    registry,
    typewriterMode,
    focusMode,
    handleSave,
    handleOpenFolder,
    handleCloseFile,
    handleRevealCurrent,
    handleTrash,
    handleSwitchWorkspace,
    handleRevealWorkspace,
    handleRemoveWorkspace,
  ]);

  return (
    <div className="app-shell">
      {sidebarVisible ? (
        <>
          <aside className="sidebar" style={{ width: sidebarWidth }}>
            <header className="sidebar-header" data-tauri-drag-region="" />
            <div className="sidebar-switcher">
              <WorkspaceSwitcher
                activeName={tree?.workspace.name ?? "Workspace"}
                registry={registry}
                onSwitch={handleSwitchWorkspace}
                onOpenFolder={handleOpenFolder}
                onRemove={handleRemoveWorkspace}
                onReveal={handleRevealWorkspace}
              />
            </div>
            <div className="sidebar-body">
              {tree ? (
                <WorkspaceSidebar
                  roots={tree.roots}
                  activePath={open?.ref.path ?? null}
                  onOpen={handleOpen}
                  onTrash={handleTrash}
                  onMove={handleMove}
                />
              ) : (
                <div className="muted small padded">{t("app.loadingWorkspace")}</div>
              )}
            </div>
          </aside>
          <Resizer
            onResize={(delta) =>
              setSidebarWidth((w) =>
                Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w + delta)),
          )
            }
          />
        </>
      ) : null}
      <main className="main">
        <header
          className={`main-header ${sidebarVisible ? "" : "main-header--no-sidebar"}`}
          data-tauri-drag-region=""
        >
          <Breadcrumb path={open?.ref.path ?? null} dirty={dirty} saving={saving} />
          {typewriterMode ? (
            <span
              className="header-mode"
              title={t("header.typewriter.title", {
                shortcut: formatShortcutString("Mod+Shift+T"),
              })}
              aria-label={t("header.typewriter.title", {
                shortcut: formatShortcutString("Mod+Shift+T"),
              })}
            >
              {t("header.typewriter.badge")}
            </span>
          ) : null}
          {focusMode ? (
            <span
              className="header-mode"
              title={t("header.focus.title", {
                shortcut: formatShortcutString("Mod+Shift+F"),
              })}
              aria-label={t("header.focus.title", {
                shortcut: formatShortcutString("Mod+Shift+F"),
              })}
            >
              {t("header.focus.badge")}
            </span>
          ) : null}
          <button
            type="button"
            className="header-help"
            onClick={() => setHelpOpen(true)}
            aria-label={t("help.open")}
            title={t("help.open")}
          >
            ?
          </button>
        </header>
        <section className="main-body">
          {error ? <div className="error-banner">{error}</div> : null}
          {open && tree ? (
            <EditorPane
              key={open.ref.path}
              file={open.ref}
              value={open.current}
              workspaceRoot={tree.workspace.root}
              onChange={handleChange}
              viewRef={editorViewRef}
            />
          ) : (
            <EmptyState />
          )}
        </section>
      </main>
      {quickOpen && fileIndex ? (
        <QuickOpen
          index={fileIndex}
          searchContent={(q) => provider.searchContent(q)}
          onSelect={(path) => {
            setQuickOpen(false);
            handleOpen(path);
          }}
          onCreate={handleCreate}
          openDoc={open?.current}
          onJumpToHeading={(heading: Heading) => {
            const view = editorViewRef.current;
            if (!view) return;
            const docLen = view.state.doc.length;
            const pos = Math.min(heading.offset, docLen);
            view.dispatch({
              selection: EditorSelection.cursor(pos),
              effects: EditorView.scrollIntoView(pos, { y: "center" }),
            });
            view.focus();
          }}
          initialInput={quickOpenInitial}
          onClose={() => setQuickOpen(false)}
        />
      ) : null}
      {commandOpen ? (
        <CommandPalette
          commands={commands}
          onClose={() => setCommandOpen(false)}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      ) : null}
      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
      {updateOpen ? <UpdateModal onClose={() => setUpdateOpen(false)} /> : null}
      {moveOpen && open && tree ? (
        <MoveFileModal
          roots={tree.roots}
          fileName={open.ref.name}
          fromPath={open.ref.path}
          onClose={() => setMoveOpen(false)}
          onConfirm={(targetDir) => {
            setMoveOpen(false);
            void handleMove(open.ref.path, targetDir);
          }}
        />
      ) : null}
    </div>
  );
}

function joinPath(root: string, rel: string): string {
  if (!rel) return root;
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const r = root.replace(/[\\/]+$/, "");
  const parts = rel.split(/[\\/]/).filter(Boolean);
  return [r, ...parts].join(sep);
}

function formatError(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { message?: string; kind?: string };
    if (anyE.kind) {
      return t(`error.kind.${anyE.kind}`, { message: anyE.message ?? "" });
    }
    if (anyE.message) return anyE.message;
  }
  if (e instanceof Error) return e.message;
  return String(e) || t("error.unknown");
}
