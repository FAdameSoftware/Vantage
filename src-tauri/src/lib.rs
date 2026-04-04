mod claude;
mod files;
mod terminal;

use claude::session::{self, SessionInfo, SessionManager};
use files::operations::{self, FileContent};
use files::tree::{self, FileNode};
use files::watcher::{self, FileWatcherState};
use std::sync::Mutex;
use tauri::Manager;
use terminal::shell_detect::ShellInfo;
use tokio::sync::Mutex as TokioMutex;

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

// ── Claude Code Commands ────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
async fn claude_start_session(
    app_handle: tauri::AppHandle,
    cwd: String,
    session_id: Option<String>,
    resume: bool,
) -> Result<String, String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager
        .start_session(&cwd, session_id.as_deref(), resume)
        .await
}

#[tauri::command]
#[specta::specta]
async fn claude_send_message(
    app_handle: tauri::AppHandle,
    session_id: String,
    content: String,
) -> Result<(), String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager.send_message(&session_id, &content).await
}

#[tauri::command]
#[specta::specta]
async fn claude_respond_permission(
    app_handle: tauri::AppHandle,
    session_id: String,
    allow: bool,
    updated_input: Option<serde_json::Value>,
    deny_reason: Option<String>,
) -> Result<(), String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager
        .send_permission_response(&session_id, allow, updated_input, deny_reason)
        .await
}

#[tauri::command]
#[specta::specta]
async fn claude_interrupt_session(
    app_handle: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager.interrupt_session(&session_id).await
}

#[tauri::command]
#[specta::specta]
async fn claude_stop_session(
    app_handle: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager.stop_session(&session_id).await
}

#[tauri::command]
#[specta::specta]
async fn claude_list_active_sessions(app_handle: tauri::AppHandle) -> Vec<String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager.list_active().await
}

#[tauri::command]
#[specta::specta]
fn claude_list_sessions(cwd: String) -> Vec<SessionInfo> {
    session::list_sessions_for_project(&cwd)
}

#[tauri::command]
#[specta::specta]
async fn claude_is_session_alive(app_handle: tauri::AppHandle, session_id: String) -> bool {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager.is_session_alive(&session_id).await
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
            claude_start_session,
            claude_send_message,
            claude_respond_permission,
            claude_interrupt_session,
            claude_stop_session,
            claude_list_active_sessions,
            claude_list_sessions,
            claude_is_session_alive,
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

            // Initialize the Claude session manager
            let session_manager = SessionManager::new(app.handle().clone());
            app.manage(TokioMutex::new(session_manager));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vantage");
}
