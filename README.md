# Splot

A calm, minimal workspace editor for text — notes, essays, research, long-form writing.

Built with Tauri 2, React, TypeScript, Vite, and CodeMirror 6.

## Requirements

- Node 18+ (tested on Node 25)
- Rust toolchain (`cargo`, `rustc`) — install via <https://rustup.rs>

## Setup

```bash
npm install
```

## Run in development

```bash
npm run tauri:dev
```

## Build for production

```bash
npm run tauri:build
```

## Workspace

On first launch, Splot copies the bundled sample workspace (`src-tauri/resources/workspace/`) into a writable app data directory. On macOS this resolves to:

```
~/Library/Application Support/info.galu.dev.splot/workspace/
```

Subsequent launches read from and write to that copy. The bundled sample is only used to seed the first run, so your edits are safe across updates.

Supported file types for editing: `.md`, `.markdown`, `.txt`.

## Installing on Linux

Splot is built on Tauri 2, which links against **WebKitGTK 4.1** and **libsoup3** at runtime. Releases ship two Linux artifacts:

- **`.deb`** — for Ubuntu 22.04+, Debian 12+, and derivatives (Mint, Pop!_OS).
- **`.AppImage`** — single-file binary that runs on any glibc-2.34+ distro that has WebKitGTK 4.1 / libsoup3 installed system-wide. Works on Fedora 39+, Arch, openSUSE Tumbleweed.

RHEL 9 / Rocky 9 / AlmaLinux 9 are not officially supported: their package repositories do not provide WebKitGTK 4.1, so neither the `.AppImage` nor a hypothetical `.rpm` would resolve dependencies. Flatpak distribution is the planned long-term answer for these distros.

## Shortcuts

- `⌘S` / `Ctrl+S` — save current file

## Project structure

```
src/                      frontend (React + TS)
  app/                    app shell, orchestration
  components/             reusable presentational bits
  features/
    workspace/            sidebar tree UI
    editor/               CodeMirror integration + theme
  services/               typed service boundaries (workspace, bridge, file index)
  types/                  shared domain types
  styles/                 CSS tokens + layout
src-tauri/                Rust backend
  src/                    commands and workspace logic
  resources/workspace/    bundled sample workspace (seeded on first run)
```

See `ARCHITECTURE.md` for the design rationale.

## License

MIT — see `LICENSE`.
