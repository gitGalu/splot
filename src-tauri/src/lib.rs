mod workspace;

use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use workspace::{
    cmd_add_workspace, cmd_create_entry, cmd_list_workspace, cmd_list_workspaces,
    cmd_move_entry, cmd_read_file, cmd_remove_workspace, cmd_search_content, cmd_switch_workspace,
    cmd_trash_entry, cmd_workspace_info, cmd_write_file, WorkspaceState,
};

const REPO_URL: &str = "https://github.com/gitGalu/splot";
const MENU_ID_REPO: &str = "splot.help.repo";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = WorkspaceState::initialize(app.handle())?;
            app.manage(state);

            let menu = Menu::default(app.handle())?;
            let repo_item =
                MenuItem::with_id(app.handle(), MENU_ID_REPO, "Splot on GitHub…", true, None::<&str>)?;
            let help = Submenu::with_items(app.handle(), "Help", true, &[&repo_item])?;
            menu.append(&help)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == MENU_ID_REPO {
                    let _ = app.opener().open_url(REPO_URL, None::<&str>);
                }
            });
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running splot");
}
