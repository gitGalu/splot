# Architecture

Splot's foundation is deliberately small. Most of the thought has gone into *boundaries*, not features — so that future work (LLM, Git, mobile, sync) can be added without reshaping the app.

## Layers

```
┌────────────────────────────────────────────────────────────┐
│ UI components (React)                                      │
│   features/{workspace,editor,quickopen,commands,           │
│              settings,help} · components · app             │
├────────────────────────────────────────────────────────────┤
│ Services (typed, platform-agnostic)                        │
│   WorkspaceProvider · FileIndex · settings · cursorMemory  │
│   lastFile · fuzzy · keyLabel                              │
├────────────────────────────────────────────────────────────┤
│ Tauri bridge (`invoke` — isolated in services/bridge.ts)   │
├────────────────────────────────────────────────────────────┤
│ Rust commands (src-tauri/src/workspace.rs)                 │
│   workspace registry · tree · read · write · create        │
│   move · trash · content search                            │
└────────────────────────────────────────────────────────────┘
```

**Rule:** UI code never imports `@tauri-apps/api` directly. Everything goes through a service. This keeps the platform boundary tight, makes services testable with an in-memory bridge, and leaves room for alternate providers (web, mobile sandbox, cloud).

## Key modules

### Frontend

- `src/types/workspace.ts` — shared domain types (`WorkspaceNode`, `FileRef`, `OpenFileState`, `WorkspaceRef`). No React, no Tauri.
- `src/services/bridge.ts` — the only place that touches `invoke`.
- `src/services/workspaceProvider.ts` — `WorkspaceProvider` interface + Tauri implementation; covers tree listing, read/write, create, move, trash, content search, and the multi-workspace registry.
- `src/services/fileIndex.ts` — flat, queryable view over the tree, used by quick-open and the command palette.
- `src/services/fuzzy.ts` — fuzzy matcher used wherever results need ranking.
- `src/services/settings.ts` — typed settings store backed by `localStorage`, exposed via `useSyncExternalStore`.
- `src/services/cursorMemory.ts` — last-known caret offset per file, persisted across sessions.
- `src/services/lastFile.ts` — last-opened file per workspace, restored on launch.
- `src/services/keyLabel.ts` — platform-aware shortcut formatting (⌘ vs Ctrl).
- `src/i18n/i18n.ts` — minimal flat-key i18n, currently Polish only.
- `src/app/App.tsx` — orchestration only: state machine for open-file/dirty/save, wires services to the UI, owns the global keymap and command registry.
- `src/features/workspace/` — sidebar tree, switcher, move/trash modals.
- `src/features/editor/` — CodeMirror 6 host plus extensions: `paragraph-selection`, `task-toggle` (clickable checkboxes + auto-sort), `links` (URL detection + click-to-open), `theme`.
- `src/features/quickopen/` — file picker, content search, "new file" mode.
- `src/features/commands/CommandPalette.tsx` — searchable command list, populated by `App.tsx`.
- `src/features/settings/SettingsPanel.tsx`, `src/features/help/HelpModal.tsx` — modal panels.

### Rust side (`src-tauri/src/workspace.rs`)

Single module owns all filesystem state. Exposes commands grouped by purpose:

- **Bootstrap & info** — `cmd_workspace_info`, `cmd_list_workspace`.
- **File I/O** — `cmd_read_file`, `cmd_write_file`.
- **Mutations** — `cmd_create_entry`, `cmd_move_entry`, `cmd_trash_entry`.
- **Search** — `cmd_search_content`.
- **Multi-workspace registry** — `cmd_list_workspaces`, `cmd_add_workspace`, `cmd_switch_workspace`, `cmd_remove_workspace`.

Boundary guarantees:

- Every path is resolved against the active workspace root and normalized; any path that escapes the root is rejected with `PathEscapesRoot`.
- Only `.md`, `.markdown`, `.txt` are readable/writable.
- The frontend cannot name a path outside the workspace root, nor write a file of an unsupported type.
- The active workspace registry is persisted to the OS app-data directory (`~/Library/Application Support/info.galu.dev.splot/workspaces.json` on macOS).
- On first run, the bundled sample workspace (`src-tauri/resources/workspace/`) is copied to the app-data directory and registered as the initial active workspace.

## Editor philosophy

CodeMirror 6 is configured as a **prose editor**, not a code editor:

- Line wrapping on.
- No gutters, no line numbers, no active-line highlight.
- Configurable type stack (serif default — `Iowan Old Style` / `Palatino` / `Georgia`) with a relaxed line-height.
- Restrained markdown highlighting — heading weight, emphasis italic, link accent. No rainbow.
- Reading measure of 72ch by default; full-panel width is opt-out via settings.
- Triple-click and `Mod+Shift+A` select the current paragraph.
- Markdown task lists get clickable checkboxes; `Mod+Enter` toggles the task at the caret. An optional setting auto-sinks completed items to the end of their list.
- URLs are detected and rendered as links. Whether a plain click or `Mod+click` opens them is a setting.
- Find/replace is `@codemirror/search` with translated phrases.

The theme reads CSS variables from the app shell, so light/dark flips the editor automatically.

## Styling

- Single source of truth: `src/styles/tokens.css`. Spacing, radii, type, colors.
- `prefers-color-scheme` swaps the palette by default; an explicit theme override (system / light / dark) lives in settings.
- Plain CSS (no Tailwind, no CSS-in-JS runtime).
- Platform tagging: `document.documentElement` gets `platform-mac` or `platform-other`, used to swap titlebar treatment.

## State

No global state library. The app is small enough that `useState` in `App.tsx` plus local component state is clearer than introducing a store. Cross-cutting persistent state (settings, cursor positions, last-opened file) lives in dedicated services backed by `localStorage`, exposed through small `useSyncExternalStore` hooks where React needs to subscribe.

## Things we deliberately did not build (yet)

- **No LLM integration.** The service layer leaves room for an `LlmProvider` that consumes `FileRef` / `OpenFileState`.
- **No Git integration.** `WorkspaceNode` is plain data; attaching Git metadata (status, diff marker) later won't require reshaping the tree.
- **No sync / cloud.** `WorkspaceProvider` is an interface — a sync-backed implementation can replace the Tauri one without touching the UI.
- **No mobile shell.** Domain types and services are framework-free, so a mobile app can reuse them around a different bridge.
- **No tabs / split view.** A single open file at a time keeps the model and the UI simple; multi-tab can be added on top of `OpenFileState` without disturbing it.

See `FUTURE_EXTENSIONS.md` for concrete insertion points.
