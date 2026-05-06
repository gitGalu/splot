# Releasing Splot

Splot ships signed builds for **macOS (arm64 + x64)** and **Windows x64** with
an in-app auto-updater. Releases are produced by `.github/workflows/release.yml`,
which is triggered by pushing a tag matching `v*`.

> **Linux note.** Linux/Flatpak distribution is intentionally **not part of
> this pipeline**. The auto-updater is wired up only for macOS and Windows
> (see `src-tauri/Cargo.toml` and `src-tauri/src/lib.rs`). Linux users update
> through their package manager.

---

## One-time setup

### 1. Generate the updater key pair

Run on your local machine (you only do this **once** for the project):

```bash
# Creates ~/.tauri/splot.key (private) and ~/.tauri/splot.key.pub (public)
npm run tauri signer generate -- -w ~/.tauri/splot.key
```

You will be asked for an optional passphrase. If you set one, remember it —
you'll add it as a separate GitHub secret.

The command prints both keys. The **public key** is the multi-line string
starting with `untrusted comment: minisign public key …`.

### 2. Paste the public key into the app config

Open `src-tauri/tauri.conf.json` and replace the placeholder
`__TAURI_UPDATER_PUBLIC_KEY__` with the content of `~/.tauri/splot.key.pub`
(single-line, base64-only — Tauri accepts the raw key body without the
`untrusted comment:` header).

Commit that change. **Never commit the private key.**

### 3. Add GitHub Actions secrets

In GitHub → **Settings → Secrets and variables → Actions**, add:

| Secret name                            | Value                                                  |
| -------------------------------------- | ------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`            | Full content of `~/.tauri/splot.key`                   |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`   | Passphrase you used (omit if you didn't set one)       |

`GITHUB_TOKEN` is provided automatically by Actions — no need to add it.

### 4. Back up the private key

If you lose `~/.tauri/splot.key`, you cannot ship updates that existing
installs will accept (the public key is already baked into shipped builds).
Back it up to a password manager or hardware key. Do **not** commit it.

---

## Cutting a release

1. Bump the version in **all three** of these files (must match):
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
2. Commit, push to `main`.
3. Tag and push:
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```
4. The release workflow runs and creates a **draft** GitHub Release with:
   - macOS arm64 `.dmg` + `.app.tar.gz` + `.app.tar.gz.sig`
   - macOS x64 `.dmg` + `.app.tar.gz` + `.app.tar.gz.sig`
   - Windows x64 `.msi` (or `setup.exe`) + `.sig`
   - **`latest.json`** — built by the `publish-updater-manifest` job once
     all platform builds finish. This is what the auto-updater reads.
5. Open the draft in the GitHub UI. Tweak the auto-generated release notes
   if you want — that body becomes `update.body` shown in the in-app
   "Update available" dialog.
6. Hit **Publish release**.

---

## Verifying a release

After publishing, fetch:

```bash
curl -L https://github.com/gitGalu/splot/releases/latest/download/latest.json
```

It must:

- exist (HTTP 200, JSON content),
- have a `version` matching the tag (without the leading `v`),
- have a `signature` and `url` for each of `darwin-aarch64`, `darwin-x86_64`,
  `windows-x86_64`.

Each `signature` must match the corresponding `.sig` asset content.

---

## Testing the upgrade flow

The cleanest way to test is from a real previous build:

1. Install Splot **`vN.N.N`** (a published version older than what you're
   about to ship).
2. Cut a new release **`vN.N.N+1`** as above.
3. Open the installed Splot, run the **"Sprawdź aktualizacje…"** command
   from the command palette (`Cmd/Ctrl+Shift+P`).
4. The modal should show the new version + release notes. Click install.
5. App downloads, applies, and restarts on its own version.

If you don't have an older build handy, you can fake the version locally by
temporarily setting `package.json` / `tauri.conf.json` / `Cargo.toml` to a
version below the latest release, building locally, then opening the
"Sprawdź aktualizacje…" dialog. Don't commit that downgrade.

---

## Troubleshooting

**`latest.json` is missing from the release.**
Check the **publish-updater-manifest** job in the workflow run. It only
runs after all platform builds succeed. If a platform job failed, it never
fires. Fix the failing platform and re-tag (or use `gh workflow run` on a
fresh tag).

**No `.sig` files attached.**
`TAURI_SIGNING_PRIVATE_KEY` is missing or the password is wrong. The Tauri
build logs print "skipping updater signing" when the key isn't readable —
check the platform job logs.

**App refuses an update with "signature mismatch".**
The public key in `tauri.conf.json` doesn't match the private key used to
sign. Re-check that you pasted the correct public key — the body of
`~/.tauri/splot.key.pub`, not the comment line.

**Update not offered to user even though release is newer.**
The user's installed version must be **strictly less than** the version in
`latest.json`. SemVer comparison rules apply. Pre-release suffixes (e.g.
`0.3.0-beta.1`) are tricky; prefer plain `MAJOR.MINOR.PATCH` versions.

**macOS Gatekeeper warning ("Splot is damaged" / unidentified developer).**
The auto-updater uses Tauri's minisign signing, which proves the bytes came
from us. macOS Gatekeeper is separate — it requires Apple Developer ID
notarization. Notarization is **not** wired up in this workflow yet; users
must right-click → Open the first time, or expect a Gatekeeper prompt.

**Windows SmartScreen warning.**
Same shape as Gatekeeper: Tauri signing protects update integrity, but
Windows code-signing (EV cert) is what suppresses SmartScreen. Not wired up
here yet — users see a "Don't run" prompt that they can override via "More
info".

**Wrong SemVer in `latest.json`.**
The manifest job derives the version from the git tag (`v1.2.3` → `1.2.3`).
If the tag is malformed, `latest.json` will be malformed too. Use plain
`vX.Y.Z` tags.

---

## Scope notes

- **Flatpak is intentionally out of scope** for this workflow. Existing
  files under `flatpak/` remain in the repo, but the release pipeline does
  not build or publish them. If you want to ship a Flatpak, it should be a
  separate pipeline (and probably driven by Flathub, not GitHub Releases).
- The manual `Build (manual)` workflow (`.github/workflows/ci.yml`) does
  not sign updater artifacts. Builds from it are useful for smoke-testing
  installers but cannot be served to the auto-updater.
