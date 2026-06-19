//! Quick Capture: an OS-wide hotkey that summons a small always-on-top window
//! for jotting a note straight into an `Inbox.md`.
//!
//! The actual write is handled by `workspace::cmd_append_inbox`. This module
//! owns only the *window summoning*: the global-shortcut plugin, toggling the
//! `quick-capture` window's visibility/focus, and (re)binding the accelerator
//! from the frontend settings (the single source of truth for the shortcut).
//!
//! Failure is handled gracefully throughout: if an accelerator can't be parsed
//! or registered (already taken by another app, missing OS permission), the
//! command returns an error string the UI surfaces as a hint — the feature
//! still works from the command palette and the in-app shortcut.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const QUICK_CAPTURE_LABEL: &str = "quick-capture";

/// Default accelerator in Tauri's shortcut syntax. `CmdOrCtrl` maps to ⌘ on
/// macOS and Ctrl elsewhere. The frontend stores the user's choice in the
/// `Mod+Shift+I` form and translates to this before calling the bind command.
pub const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+I";

/// Remembers the currently-registered accelerator so we can unregister exactly
/// it when the user rebinds (rather than unregister_all, which would also drop
/// any future non-capture shortcuts). `None` means nothing is bound.
#[derive(Default)]
pub struct QuickCaptureShortcut(pub Mutex<Option<Shortcut>>);

/// Show + focus the quick-capture window, or hide it if it is already visible.
/// Centered each time so it behaves like a Spotlight panel regardless of where
/// the main window sits.
fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(QUICK_CAPTURE_LABEL) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    if visible {
        let _ = window.hide();
    } else {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Build the global-shortcut plugin with a handler that toggles the window on
/// key-down for any registered shortcut. We only ever register the capture
/// accelerator, so matching on a specific shortcut isn't necessary — but we
/// still gate on `Pressed` so the toggle fires once per press, not twice.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_window(app);
            }
        })
        .build()
}

/// (Re)bind the global Quick Capture accelerator. Called once on launch with
/// the persisted setting and again whenever the user changes it. Unregisters
/// the previous binding first. Returns a human-readable error on failure so
/// the UI can explain that the chosen combo is unavailable.
#[tauri::command]
pub fn cmd_set_quick_capture_shortcut(
    app: AppHandle,
    state: State<'_, QuickCaptureShortcut>,
    accelerator: String,
) -> Result<(), String> {
    let parsed: Shortcut = accelerator
        .parse()
        .map_err(|_| format!("invalid shortcut: {accelerator}"))?;

    let manager = app.global_shortcut();

    // Drop the previous binding (if any and different) before adding the new
    // one, so rebinding to the same key doesn't briefly leave it unregistered.
    let mut guard = state.0.lock().map_err(|_| "shortcut state poisoned".to_string())?;
    if let Some(prev) = guard.as_ref() {
        if *prev != parsed {
            let _ = manager.unregister(prev.clone());
        } else {
            // Already bound to this exact shortcut — nothing to do.
            return Ok(());
        }
    }

    manager
        .register(parsed.clone())
        .map_err(|e| format!("could not register shortcut: {e}"))?;
    *guard = Some(parsed);
    Ok(())
}

/// Unregister the current global Quick Capture accelerator, if any. Used when
/// the user disables the feature in settings. Idempotent.
#[tauri::command]
pub fn cmd_unregister_quick_capture_shortcut(
    app: AppHandle,
    state: State<'_, QuickCaptureShortcut>,
) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "shortcut state poisoned".to_string())?;
    if let Some(prev) = guard.take() {
        let _ = app.global_shortcut().unregister(prev);
    }
    Ok(())
}

/// Hide the quick-capture window. Called by the window's own UI on Esc or after
/// a successful save, so the capture panel dismisses without touching the main
/// window's focus.
#[tauri::command]
pub fn cmd_close_quick_capture(app: AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_CAPTURE_LABEL) {
        let _ = window.hide();
    }
}
