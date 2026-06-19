mod workspace;

use tauri::menu::Menu;
#[cfg(target_os = "macos")]
use tauri::menu::{MenuItem, Submenu};
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri_plugin_opener::OpenerExt;
use workspace::{
    cmd_add_workspace, cmd_append_inbox, cmd_create_entry, cmd_list_workspace, cmd_list_workspaces,
    cmd_move_entry, cmd_read_file, cmd_remove_workspace, cmd_rename_entry, cmd_search_content,
    cmd_switch_workspace, cmd_trash_entry, cmd_undo_inbox, cmd_unwatch_file, cmd_watch_file,
    cmd_workspace_info, cmd_write_file, WorkspaceState,
};

mod quick_capture;
use quick_capture::{
    cmd_close_quick_capture, cmd_set_quick_capture_shortcut,
    cmd_unregister_quick_capture_shortcut,
};

#[cfg(target_os = "macos")]
const REPO_URL: &str = "https://github.com/gitGalu/splot";
#[cfg(target_os = "macos")]
const MENU_ID_REPO: &str = "splot.help.repo";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered (Tauri docs are
    // explicit on this — registering it after others can race the callback).
    // When a second launch tries to spawn, the running process raises and
    // focuses its window instead of producing a parallel app with its own
    // localStorage that would fight the original over autosave.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(quick_capture::plugin())
        .manage(quick_capture::QuickCaptureShortcut::default());

    // Auto-update is intentionally desktop-only and intentionally excludes
    // Linux: Flatpak builds are managed by the package; raw deb/AppImage
    // builds aren't shipped here. Keeping the registration target-gated
    // matches the Cargo target-conditional dependency in src-tauri/Cargo.toml.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .setup(|app| {
            let state = WorkspaceState::initialize(app.handle())?;
            app.manage(state);

            // Bind the default Quick Capture accelerator at startup so the
            // hotkey works before the frontend mounts. The frontend re-asserts
            // the user's persisted choice on launch (settings are the source of
            // truth); a failure here is non-fatal — the window stays reachable
            // via the command palette / in-app shortcut.
            {
                let app_handle = app.handle().clone();
                let shortcut_state = app.state::<quick_capture::QuickCaptureShortcut>();
                let _ = quick_capture::cmd_set_quick_capture_shortcut(
                    app_handle,
                    shortcut_state,
                    quick_capture::DEFAULT_SHORTCUT.to_string(),
                );
            }

            // macOS: full default menu (system requires one) + a Help submenu
            //        with the repo link.
            // Windows/Linux: empty menu so no menubar is rendered — keeps the
            //        UI quiet. Repo link stays reachable via the command palette.
            #[cfg(target_os = "macos")]
            {
                let menu = Menu::default(app.handle())?;
                let repo_item = MenuItem::with_id(
                    app.handle(),
                    MENU_ID_REPO,
                    "Splot on GitHub…",
                    true,
                    None::<&str>,
                )?;
                let help = Submenu::with_items(app.handle(), "Help", true, &[&repo_item])?;
                menu.append(&help)?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    if event.id().as_ref() == MENU_ID_REPO {
                        let _ = app.opener().open_url(REPO_URL, None::<&str>);
                    }
                });
            }
            #[cfg(not(target_os = "macos"))]
            {
                app.set_menu(Menu::new(app.handle())?)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_workspace_info,
            cmd_list_workspace,
            cmd_read_file,
            cmd_write_file,
            cmd_search_content,
            cmd_list_workspaces,
            cmd_add_workspace,
            cmd_switch_workspace,
            cmd_remove_workspace,
            cmd_create_entry,
            cmd_trash_entry,
            cmd_move_entry,
            cmd_rename_entry,
            cmd_watch_file,
            cmd_unwatch_file,
            cmd_append_inbox,
            cmd_undo_inbox,
            cmd_set_quick_capture_shortcut,
            cmd_unregister_quick_capture_shortcut,
            cmd_close_quick_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running splot");
}
