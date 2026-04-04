mod files;
mod terminal;

use files::operations::{self, FileContent};
use files::tree::{self, FileNode};
use files::watcher::{self, FileWatcherState};
use std::sync::Mutex;
use tauri::Manager;
use terminal::shell_detect::ShellInfo;

// ── File Tree Commands ──────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn get_file_tree(path: String, depth: u32) -> Result<Vec<FileNode>, String> {
    tree::build_file_tree(&path, depth)
}

#[tauri::command]
#[specta::specta]
fn get_directory_children(path: String) -> Result<Vec<FileNode>, String> {
    tree::get_directory_children(&path)
}

// ── File Operations Commands ────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn read_file(path: String) -> Result<FileContent, String> {
    operations::read_file(&path)
}

#[tauri::command]
#[specta::specta]
fn write_file(path: String, content: String) -> Result<(), String> {
    operations::write_file(&path, &content)
}

#[tauri::command]
#[specta::specta]
fn create_file(path: String) -> Result<(), String> {
    operations::create_file(&path)
}

#[tauri::command]
#[specta::specta]
fn create_dir(path: String) -> Result<(), String> {
    operations::create_dir(&path)
}

#[tauri::command]
#[specta::specta]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    operations::rename_path(&old_path, &new_path)
}

#[tauri::command]
#[specta::specta]
fn delete_file(path: String) -> Result<(), String> {
    operations::delete_file(&path)
}

#[tauri::command]
#[specta::specta]
fn delete_dir(path: String) -> Result<(), String> {
    operations::delete_dir(&path)
}

// ── File Watcher Commands ───────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn start_file_watcher(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let state = app_handle.state::<Mutex<FileWatcherState>>();
    watcher::start_watching(&app_handle, &state, &path)
}

#[tauri::command]
#[specta::specta]
fn stop_file_watcher(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<Mutex<FileWatcherState>>();
    watcher::stop_watching(&state)
}

// ── Terminal Commands ───────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn list_shells() -> Vec<ShellInfo> {
    terminal::pty_manager::list_shells()
}

#[tauri::command]
#[specta::specta]
fn get_default_shell() -> ShellInfo {
    terminal::pty_manager::default_shell()
}

// ── Application Setup ───────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new().commands(
        tauri_specta::collect_commands![
            get_file_tree,
            get_directory_children,
            read_file,
            write_file,
            create_file,
            create_dir,
            rename_path,
            delete_file,
            delete_dir,
            start_file_watcher,
            stop_file_watcher,
            list_shells,
            get_default_shell,
        ],
    );

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export TypeScript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(FileWatcherState::new()))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vantage");
}
