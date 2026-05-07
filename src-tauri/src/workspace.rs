use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use thiserror::Error;

const WORKSPACE_DIR_NAME: &str = "workspace";
const BUNDLED_WORKSPACE_SUBPATH: &str = "resources/workspace";
const REGISTRY_FILE: &str = "workspaces.json";
const TRASH_DIR_NAME: &str = ".trash";

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum WorkspaceError {
    #[error("workspace not initialized")]
    NotInitialized,
    #[error("path escapes workspace root")]
    PathEscapesRoot,
    #[error("path is not a file")]
    NotAFile,
    #[error("path is not a directory")]
    NotADirectory,
    #[error("workspace not found in registry")]
    UnknownWorkspace,
    #[error("io error: {0}")]
    Io(String),
    #[error("unsupported file type")]
    UnsupportedFileType,
    #[error("name is empty")]
    EmptyName,
    #[error("name contains invalid characters")]
    InvalidName,
    #[error("a file or folder with this name already exists")]
    AlreadyExists,
}

impl From<std::io::Error> for WorkspaceError {
    fn from(e: std::io::Error) -> Self {
        WorkspaceError::Io(e.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Registry {
    /// Active workspace path. `None` at first boot until one is chosen.
    #[serde(default)]
    pub active: Option<String>,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
}

pub struct WorkspaceState {
    root: RwLock<Option<PathBuf>>,
    registry: RwLock<Registry>,
    registry_path: PathBuf,
}

impl WorkspaceState {
    pub fn initialize(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
        fs::create_dir_all(&data_dir)?;

        let default_root = data_dir.join(WORKSPACE_DIR_NAME);
        let registry_path = data_dir.join(REGISTRY_FILE);

        // Seed the bundled sample on first run, as before.
        if !default_root.exists() {
            let resource_root = app
                .path()
                .resolve(BUNDLED_WORKSPACE_SUBPATH, tauri::path::BaseDirectory::Resource)
                .map_err(|e| format!("failed to resolve bundled workspace: {e}"))?;

            if resource_root.exists() {
                copy_dir_recursive(&resource_root, &default_root)?;
            } else {
                fs::create_dir_all(&default_root)?;
            }
        }

        let mut registry = load_registry(&registry_path).unwrap_or_default();

        // First-run migration: ensure the bundled workspace is registered.
        let default_path_str = path_to_string(&default_root);
        if !registry
            .workspaces
            .iter()
            .any(|w| w.path == default_path_str)
        {
            registry.workspaces.insert(
                0,
                WorkspaceEntry {
                    name: "Splot".to_string(),
                    path: default_path_str.clone(),
                },
            );
        }
        if registry.active.is_none() {
            registry.active = Some(default_path_str.clone());
        }

        // Validate that the active path still exists; fall back to default otherwise.
        let active_path = registry
            .active
            .as_ref()
            .map(PathBuf::from)
            .filter(|p| p.is_dir())
            .unwrap_or_else(|| default_root.clone());
        registry.active = Some(path_to_string(&active_path));

        save_registry(&registry_path, &registry)?;

        Ok(Self {
            root: RwLock::new(Some(active_path)),
            registry: RwLock::new(registry),
            registry_path,
        })
    }

    fn root(&self) -> Result<PathBuf, WorkspaceError> {
        self.root
            .read()
            .ok()
            .and_then(|g| g.clone())
            .ok_or(WorkspaceError::NotInitialized)
    }

    fn resolve_within(&self, relative: &str) -> Result<PathBuf, WorkspaceError> {
        let root = self.root()?;
        let candidate = root.join(relative);

        let normalized = normalize_path(&candidate);
        let root_norm = normalize_path(&root);

        if !normalized.starts_with(&root_norm) {
            return Err(WorkspaceError::PathEscapesRoot);
        }
        Ok(normalized)
    }

    fn persist_registry(&self) -> Result<(), WorkspaceError> {
        let registry = self
            .registry
            .read()
            .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
        save_registry(&self.registry_path, &registry)?;
        Ok(())
    }
}

fn load_registry(path: &Path) -> Option<Registry> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn save_registry(path: &Path, registry: &Registry) -> std::io::Result<()> {
    let json = serde_json::to_vec_pretty(registry)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(path, json)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn derive_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if file_type.is_file() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[derive(Serialize)]
pub struct WorkspaceInfo {
    pub name: String,
    pub root: String,
}

#[derive(Serialize)]
#[serde(tag = "kind")]
pub enum WorkspaceNode {
    #[serde(rename = "directory")]
    Directory {
        name: String,
        path: String,
        children: Vec<WorkspaceNode>,
    },
    #[serde(rename = "file")]
    File {
        name: String,
        path: String,
        extension: Option<String>,
        size: u64,
    },
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn relative_string(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn read_tree(
    root: &Path,
    current: &Path,
    show_trash: bool,
) -> Result<Vec<WorkspaceNode>, WorkspaceError> {
    let mut entries: Vec<_> = fs::read_dir(current)?.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| {
        let file_type = e.file_type().ok();
        let is_dir = file_type.map(|t| t.is_dir()).unwrap_or(false);
        // directories first, then case-insensitive name
        (
            if is_dir { 0 } else { 1 },
            e.file_name().to_string_lossy().to_lowercase(),
        )
    });

    let is_workspace_root = current == root;
    let mut out = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_trash_at_root = is_workspace_root && name == TRASH_DIR_NAME;
        if is_trash_at_root {
            if !show_trash {
                continue;
            }
        } else if is_hidden(&name) {
            continue;
        }
        let path = entry.path();
        let rel = relative_string(root, &path);
        let ft = entry.file_type()?;
        if ft.is_dir() {
            let children = read_tree(root, &path, show_trash)?;
            out.push(WorkspaceNode::Directory {
                name,
                path: rel,
                children,
            });
        } else if ft.is_file() {
            let metadata = entry.metadata()?;
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase());
            out.push(WorkspaceNode::File {
                name,
                path: rel,
                extension,
                size: metadata.len(),
            });
        }
    }
    Ok(out)
}

fn is_supported_text_ext(ext: Option<&str>) -> bool {
    matches!(ext, Some("md") | Some("txt") | Some("markdown"))
}

#[tauri::command]
pub fn cmd_workspace_info(state: State<'_, WorkspaceState>) -> Result<WorkspaceInfo, WorkspaceError> {
    let root = state.root()?;
    let root_str = path_to_string(&root);
    let name = {
        let registry = state
            .registry
            .read()
            .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
        registry
            .workspaces
            .iter()
            .find(|w| w.path == root_str)
            .map(|w| w.name.clone())
            .unwrap_or_else(|| derive_name(&root))
    };
    Ok(WorkspaceInfo {
        name,
        root: root_str,
    })
}

#[tauri::command]
pub fn cmd_list_workspace(
    state: State<'_, WorkspaceState>,
    show_trash: Option<bool>,
) -> Result<Vec<WorkspaceNode>, WorkspaceError> {
    let root = state.root()?;
    read_tree(&root, &root, show_trash.unwrap_or(false))
}

#[tauri::command]
pub fn cmd_read_file(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<String, WorkspaceError> {
    let resolved = state.resolve_within(&path)?;
    if !resolved.is_file() {
        return Err(WorkspaceError::NotAFile);
    }
    let ext = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    if !is_supported_text_ext(ext.as_deref()) {
        return Err(WorkspaceError::UnsupportedFileType);
    }
    Ok(fs::read_to_string(&resolved)?)
}

#[tauri::command]
pub fn cmd_write_file(
    state: State<'_, WorkspaceState>,
    path: String,
    contents: String,
) -> Result<(), WorkspaceError> {
    let resolved = state.resolve_within(&path)?;
    let ext = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    if !is_supported_text_ext(ext.as_deref()) {
        return Err(WorkspaceError::UnsupportedFileType);
    }
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&resolved, contents)?;
    Ok(())
}

#[derive(Serialize)]
pub struct ContentHit {
    pub path: String,
    pub line: u32,
    pub snippet: String,
    /// Byte offsets within `snippet` where the query matches (case-insensitive).
    pub positions: Vec<(u32, u32)>,
}

const MAX_HITS: usize = 200;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024; // 2 MiB
const SNIPPET_CONTEXT: usize = 40;

fn collect_text_files(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if is_hidden(&name) {
            continue;
        }
        let ft = entry.file_type()?;
        let path = entry.path();
        if ft.is_dir() {
            collect_text_files(root, &path, out)?;
        } else if ft.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase());
            if is_supported_text_ext(ext.as_deref()) {
                out.push(path);
            }
        }
    }
    Ok(())
}

/// Find char byte-offsets (0, c1, c1+c2, ...) to clamp slicing to char boundaries.
fn char_boundaries(line: &str) -> Vec<usize> {
    let mut bounds = Vec::with_capacity(line.len() + 1);
    bounds.push(0);
    for (i, _) in line.char_indices().skip(1) {
        bounds.push(i);
    }
    bounds.push(line.len());
    bounds
}

/// Snap byte index `pos` to the nearest char boundary at or before it.
fn snap_lower(bounds: &[usize], pos: usize) -> usize {
    match bounds.binary_search(&pos) {
        Ok(i) => bounds[i],
        Err(i) => bounds[i.saturating_sub(1)],
    }
}

fn snap_upper(bounds: &[usize], pos: usize) -> usize {
    match bounds.binary_search(&pos) {
        Ok(i) => bounds[i],
        Err(i) => bounds[i.min(bounds.len() - 1)],
    }
}

fn find_line_hits(root: &Path, path: &Path, needle_lower: &str, hits: &mut Vec<ContentHit>) {
    let Ok(metadata) = fs::metadata(path) else { return };
    if metadata.len() > MAX_FILE_BYTES {
        return;
    }
    let Ok(contents) = fs::read_to_string(path) else { return };
    let rel = relative_string(root, path);

    for (idx, line) in contents.lines().enumerate() {
        if hits.len() >= MAX_HITS {
            return;
        }
        let line_lower = line.to_lowercase();
        let Some(first) = line_lower.find(needle_lower) else { continue };

        let bounds = char_boundaries(line);
        let raw_start = first.saturating_sub(SNIPPET_CONTEXT);
        let raw_end = (first + needle_lower.len() + SNIPPET_CONTEXT).min(line.len());
        let start = snap_lower(&bounds, raw_start);
        let end = snap_upper(&bounds, raw_end);
        let snippet = line[start..end].to_string();

        // Collect every match in the line (not just the first) so the hit is
        // informative, but still bounded to the snippet window.
        let mut positions = Vec::new();
        let mut cursor = start;
        while let Some(rel_pos) = line_lower[cursor..end].find(needle_lower) {
            let abs = cursor + rel_pos;
            let hit_end = abs + needle_lower.len();
            if hit_end > end {
                break;
            }
            positions.push(((abs - start) as u32, (hit_end - start) as u32));
            cursor = hit_end;
        }

        hits.push(ContentHit {
            path: rel.clone(),
            line: (idx as u32) + 1,
            snippet,
            positions,
        });
    }
}

#[derive(Serialize)]
pub struct CreatedEntry {
    /// Relative path within the workspace, `/`-separated.
    pub path: String,
    /// "file" | "directory"
    pub kind: String,
}

fn has_invalid_char(segment: &str) -> bool {
    segment.chars().any(|c| matches!(c, '\0' | ':' | '\\'))
        || segment == "."
        || segment == ".."
}

/// Normalize and validate a user-supplied relative path. Returns the cleaned
/// segments (no leading/trailing empty, no `.` or `..`) and a trailing-slash flag.
fn parse_user_path(raw: &str) -> Result<(Vec<String>, bool), WorkspaceError> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(WorkspaceError::EmptyName);
    }
    let trailing_slash = raw.ends_with('/') || raw.ends_with('\\');
    let segments: Vec<String> = raw
        .split(|c| c == '/' || c == '\\')
        .filter(|s| !s.is_empty())
        .map(|s| s.trim().to_string())
        .collect();
    if segments.is_empty() {
        return Err(WorkspaceError::EmptyName);
    }
    for s in &segments {
        if s.is_empty() || has_invalid_char(s) {
            return Err(WorkspaceError::InvalidName);
        }
    }
    Ok((segments, trailing_slash))
}

#[tauri::command]
pub fn cmd_create_entry(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<CreatedEntry, WorkspaceError> {
    let (mut segments, is_dir) = parse_user_path(&path)?;

    if !is_dir {
        // Auto-append `.md` if the final segment has no extension.
        if let Some(last) = segments.last_mut() {
            let has_ext = Path::new(last).extension().is_some();
            if !has_ext {
                last.push_str(".md");
            }
            let ext = Path::new(last)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase());
            if !is_supported_text_ext(ext.as_deref()) {
                return Err(WorkspaceError::UnsupportedFileType);
            }
        }
    }

    let rel = segments.join("/");
    let resolved = state.resolve_within(&rel)?;
    if resolved.exists() {
        return Err(WorkspaceError::AlreadyExists);
    }

    if is_dir {
        fs::create_dir_all(&resolved)?;
        Ok(CreatedEntry {
            path: rel,
            kind: "directory".to_string(),
        })
    } else {
        if let Some(parent) = resolved.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&resolved, "")?;
        Ok(CreatedEntry {
            path: rel,
            kind: "file".to_string(),
        })
    }
}

/// UTC timestamp formatted as `YYYYMMDD-HHMMSS`. Used as a unique suffix when
/// an item of the same name already exists in the trash.
fn timestamp_suffix() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Days from the Unix epoch to a calendar date (proleptic Gregorian).
    let days = (secs / 86_400) as i64;
    let (y, mo, d) = civil_from_days(days);
    let rem = secs % 86_400;
    let h = rem / 3_600;
    let mi = (rem % 3_600) / 60;
    let se = rem % 60;
    format!("{:04}{:02}{:02}-{:02}{:02}{:02}", y, mo, d, h, mi, se)
}

/// Howard Hinnant's civil-from-days algorithm.
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

#[tauri::command]
pub fn cmd_move_entry(
    state: State<'_, WorkspaceState>,
    from: String,
    to_dir: String,
) -> Result<String, WorkspaceError> {
    let src = state.resolve_within(&from)?;
    if !src.exists() {
        return Err(WorkspaceError::NotAFile);
    }

    let root = state.root()?;
    let trash_root = root.join(TRASH_DIR_NAME);
    // The trash folder is off-limits for DnD in both directions; items go in
    // only through cmd_trash_entry, and come out only via the filesystem.
    if src == trash_root || src.starts_with(&trash_root) {
        return Err(WorkspaceError::InvalidName);
    }

    // Destination is either the workspace root (empty string) or a directory
    // inside it. Resolving "" yields the root itself.
    let dst_dir = if to_dir.trim().is_empty() {
        root.clone()
    } else {
        state.resolve_within(&to_dir)?
    };
    if !dst_dir.is_dir() {
        return Err(WorkspaceError::NotADirectory);
    }
    if dst_dir == trash_root || dst_dir.starts_with(&trash_root) {
        return Err(WorkspaceError::InvalidName);
    }

    // Prevent moving a folder into itself or one of its descendants.
    if src.is_dir() && dst_dir.starts_with(&src) {
        return Err(WorkspaceError::InvalidName);
    }

    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or(WorkspaceError::EmptyName)?;
    let target = dst_dir.join(&name);

    // No-op: dropping onto the folder you're already in.
    if target == src {
        return Ok(relative_string(&root, &src));
    }

    if target.exists() {
        return Err(WorkspaceError::AlreadyExists);
    }

    fs::rename(&src, &target)?;
    Ok(relative_string(&root, &target))
}

/// Rename an entry within its current parent directory. `new_name` must be a
/// single path segment (no slashes); path-altering renames go through
/// `cmd_move_entry` instead so this command can stay narrow and predictable.
/// Returns the new relative path on success.
#[tauri::command]
pub fn cmd_rename_entry(
    state: State<'_, WorkspaceState>,
    from: String,
    new_name: String,
) -> Result<String, WorkspaceError> {
    let src = state.resolve_within(&from)?;
    if !src.exists() {
        return Err(WorkspaceError::NotAFile);
    }

    let root = state.root()?;
    let trash_root = root.join(TRASH_DIR_NAME);
    if src == trash_root || src.starts_with(&trash_root) {
        return Err(WorkspaceError::InvalidName);
    }

    // The new name must be a single segment — keep this command focused on
    // rename-in-place. Splitting on the same separators as `parse_user_path`
    // means a user trying to "rename into a folder" hits a clear validation
    // error and can use Move instead.
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err(WorkspaceError::EmptyName);
    }
    if trimmed.contains('/') || trimmed.contains('\\') || has_invalid_char(trimmed) {
        return Err(WorkspaceError::InvalidName);
    }

    // For files, enforce the same supported-extension rule as create. Folders
    // have no extension constraint.
    if src.is_file() {
        let ext = Path::new(trimmed)
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());
        if !is_supported_text_ext(ext.as_deref()) {
            return Err(WorkspaceError::UnsupportedFileType);
        }
    }

    let parent = src
        .parent()
        .ok_or(WorkspaceError::InvalidName)?;
    let target = parent.join(trimmed);

    // No-op: same name as before.
    if target == src {
        return Ok(relative_string(&root, &src));
    }

    if target.exists() {
        return Err(WorkspaceError::AlreadyExists);
    }

    fs::rename(&src, &target)?;
    Ok(relative_string(&root, &target))
}

#[tauri::command]
pub fn cmd_trash_entry(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<String, WorkspaceError> {
    let resolved = state.resolve_within(&path)?;
    if !resolved.exists() {
        return Err(WorkspaceError::NotAFile);
    }

    let root = state.root()?;
    // Don't let the user trash the trash itself (or anything inside it).
    let trash_root = root.join(TRASH_DIR_NAME);
    if resolved == trash_root || resolved.starts_with(&trash_root) {
        return Err(WorkspaceError::InvalidName);
    }

    fs::create_dir_all(&trash_root)?;

    let name = resolved
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or(WorkspaceError::EmptyName)?;

    let mut target = trash_root.join(&name);
    if target.exists() {
        // Insert the timestamp before the extension so `notes.md` becomes
        // `notes-20260420-143022.md` rather than `notes.md-20260420-...`.
        let stem = Path::new(&name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| name.clone());
        let ext = Path::new(&name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let suffixed = format!("{}-{}{}", stem, timestamp_suffix(), ext);
        target = trash_root.join(suffixed);
        // Extremely unlikely, but if the timestamped name also collides keep
        // appending a counter rather than clobbering.
        let mut counter = 1u32;
        while target.exists() {
            let bumped = format!(
                "{}-{}-{}{}",
                stem,
                timestamp_suffix(),
                counter,
                ext,
            );
            target = trash_root.join(bumped);
            counter += 1;
        }
    }

    fs::rename(&resolved, &target)?;
    Ok(relative_string(&root, &target))
}

#[tauri::command]
pub fn cmd_search_content(
    state: State<'_, WorkspaceState>,
    query: String,
) -> Result<Vec<ContentHit>, WorkspaceError> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let needle_lower = trimmed.to_lowercase();

    let root = state.root()?;
    let mut files = Vec::new();
    collect_text_files(&root, &root, &mut files)?;

    let mut hits = Vec::new();
    for file in files {
        find_line_hits(&root, &file, &needle_lower, &mut hits);
        if hits.len() >= MAX_HITS {
            break;
        }
    }
    Ok(hits)
}

// ─── Multiple workspaces ──────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_list_workspaces(
    state: State<'_, WorkspaceState>,
) -> Result<Registry, WorkspaceError> {
    let registry = state
        .registry
        .read()
        .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
    Ok(registry.clone())
}

#[tauri::command]
pub fn cmd_add_workspace(
    state: State<'_, WorkspaceState>,
    path: String,
    name: Option<String>,
) -> Result<WorkspaceEntry, WorkspaceError> {
    let pbuf = PathBuf::from(&path);
    if !pbuf.is_dir() {
        return Err(WorkspaceError::NotADirectory);
    }
    let normalized = path_to_string(&normalize_path(&pbuf));
    let display_name = name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| derive_name(&pbuf));

    let entry = {
        let mut registry = state
            .registry
            .write()
            .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
        if let Some(existing) = registry.workspaces.iter().find(|w| w.path == normalized) {
            existing.clone()
        } else {
            let entry = WorkspaceEntry {
                name: display_name,
                path: normalized,
            };
            registry.workspaces.push(entry.clone());
            entry
        }
    };
    state.persist_registry()?;
    Ok(entry)
}

#[tauri::command]
pub fn cmd_switch_workspace(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<WorkspaceInfo, WorkspaceError> {
    let pbuf = PathBuf::from(&path);
    let normalized_path = normalize_path(&pbuf);
    if !normalized_path.is_dir() {
        return Err(WorkspaceError::NotADirectory);
    }
    let normalized = path_to_string(&normalized_path);

    let name = {
        let mut registry = state
            .registry
            .write()
            .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
        let Some(entry) = registry
            .workspaces
            .iter()
            .find(|w| w.path == normalized)
            .cloned()
        else {
            return Err(WorkspaceError::UnknownWorkspace);
        };
        registry.active = Some(normalized.clone());
        entry.name
    };

    {
        let mut root = state
            .root
            .write()
            .map_err(|e| WorkspaceError::Io(format!("root poisoned: {e}")))?;
        *root = Some(normalized_path);
    }
    state.persist_registry()?;

    Ok(WorkspaceInfo {
        name,
        root: normalized,
    })
}

#[tauri::command]
pub fn cmd_remove_workspace(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<Registry, WorkspaceError> {
    let pbuf = PathBuf::from(&path);
    let normalized = path_to_string(&normalize_path(&pbuf));

    {
        let mut registry = state
            .registry
            .write()
            .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
        registry.workspaces.retain(|w| w.path != normalized);
        // If the active workspace was just removed, fall back to the first entry
        // (or clear — the frontend will guard on None).
        if registry.active.as_deref() == Some(normalized.as_str()) {
            registry.active = registry.workspaces.first().map(|w| w.path.clone());
        }
    }

    // If the active entry changed, update the root to match so subsequent
    // tree/read calls don't target a removed workspace.
    let new_active = {
        let registry = state
            .registry
            .read()
            .map_err(|e| WorkspaceError::Io(format!("registry poisoned: {e}")))?;
        registry.active.clone()
    };
    {
        let mut root = state
            .root
            .write()
            .map_err(|e| WorkspaceError::Io(format!("root poisoned: {e}")))?;
        *root = new_active.map(PathBuf::from);
    }

    state.persist_registry()?;
    cmd_list_workspaces(state)
}
