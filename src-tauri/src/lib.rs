mod analytics;
mod checkpoint;
mod claude;
mod claude_settings;
mod files;
mod git;
mod indexer;
mod mcp;
mod merge_queue;
mod plugins;
mod prerequisites;
mod search;
mod session_search;
mod terminal;
mod theme;
mod workspace;
mod worktree;

use claude::process::SpawnOptions;
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

#[tauri::command]
#[specta::specta]
fn format_file(path: String) -> Result<String, String> {
    operations::format_file(&path)
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
    effort_level: Option<String>,
    plan_mode: bool,
    from_pr: Option<u32>,
) -> Result<String, String> {
    let options = SpawnOptions {
        effort_level,
        plan_mode,
        from_pr,
    };
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager
        .start_session(&cwd, session_id.as_deref(), resume, options)
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
async fn claude_stop_all_sessions(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager.stop_all().await;
    Ok(())
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

// ── Prerequisite Commands ───────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn check_prerequisites() -> Vec<prerequisites::PrerequisiteResult> {
    prerequisites::check_all()
}

// ── Git Commands ────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn get_git_branch(cwd: String) -> Result<git::GitBranchInfo, String> {
    git::get_branch(&cwd)
}

#[tauri::command]
#[specta::specta]
fn get_git_status(cwd: String) -> Result<Vec<git::GitFileStatus>, String> {
    git::get_status(&cwd)
}

// ── PR List Command ─────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn get_pr_list(cwd: String, limit: Option<u32>) -> Result<Vec<git::PrInfo>, String> {
    git::get_pr_list(&cwd, limit.unwrap_or(10))
}

// ── Git Show Command ────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn git_show_file(
    worktree_path: String,
    file_path: String,
    git_ref: String,
) -> Result<String, String> {
    git::show_file(&worktree_path, &file_path, &git_ref)
}

// ── Worktree Commands ──────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn create_worktree(
    repo_path: String,
    branch_name: String,
    worktree_path: String,
) -> Result<worktree::WorktreeCreateResult, String> {
    worktree::create_worktree(&repo_path, &branch_name, &worktree_path)
}

#[tauri::command]
#[specta::specta]
fn list_worktrees(repo_path: String) -> Result<Vec<worktree::WorktreeInfo>, String> {
    worktree::list_worktrees(&repo_path)
}

#[tauri::command]
#[specta::specta]
fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    worktree::remove_worktree(&repo_path, &worktree_path, force)
}

#[tauri::command]
#[specta::specta]
fn get_worktree_disk_usage(worktree_path: String) -> Result<u64, String> {
    worktree::get_worktree_disk_usage(&worktree_path)
}

#[tauri::command]
#[specta::specta]
fn get_worktree_changes(worktree_path: String) -> Result<Vec<String>, String> {
    worktree::get_worktree_changes(&worktree_path)
}

#[tauri::command]
#[specta::specta]
fn get_agent_worktree_path(repo_path: String, agent_name: String, agent_id: String) -> Result<String, String> {
    worktree::agent_worktree_path(&repo_path, &agent_name, &agent_id)
}

#[tauri::command]
#[specta::specta]
fn get_agent_branch_name(agent_name: String, agent_id: String) -> String {
    worktree::agent_branch_name(&agent_name, &agent_id)
}

// ── Search Commands ────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn search_project(
    root: String,
    query: String,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<String>,
    max_results: Option<u32>,
) -> Result<search::SearchResult, String> {
    search::search_project(
        &root,
        &query,
        is_regex,
        case_sensitive,
        glob_filter.as_deref(),
        max_results.unwrap_or(1000),
    )
}

#[tauri::command]
#[specta::specta]
fn replace_in_files(
    root: String,
    search: String,
    replace: String,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<String>,
) -> Result<search::ReplaceResult, String> {
    search::replace_in_files(
        &root,
        &search,
        &replace,
        is_regex,
        case_sensitive,
        glob_filter.as_deref(),
    )
}

// ── Session Search Commands ────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn search_sessions(
    query: String,
    cwd: Option<String>,
) -> Result<Vec<session_search::SessionSearchResult>, String> {
    session_search::search_sessions(&query, cwd.as_deref())
}

#[tauri::command]
#[specta::specta]
fn get_session_stats(
    session_path: String,
) -> Result<session_search::SessionStats, String> {
    session_search::get_session_stats(&session_path)
}

// ── Git Log/Blame Commands ─────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn git_log(cwd: String, limit: u32) -> Result<Vec<git::GitLogEntry>, String> {
    git::git_log(&cwd, limit)
}

#[tauri::command]
#[specta::specta]
fn git_blame(cwd: String, file_path: String) -> Result<Vec<git::GitBlameLine>, String> {
    git::git_blame(&cwd, &file_path)
}

#[tauri::command]
#[specta::specta]
fn git_diff_commit(cwd: String, hash: String) -> Result<String, String> {
    git::git_diff_commit(&cwd, &hash)
}

#[tauri::command]
#[specta::specta]
fn git_diff_working(cwd: String) -> Result<String, String> {
    git::git_diff_working(&cwd)
}

// ── Git Write Commands ────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn git_stage(cwd: String, paths: Vec<String>) -> Result<String, String> {
    git::git_stage(&cwd, paths)
}

#[tauri::command]
#[specta::specta]
fn git_unstage(cwd: String, paths: Vec<String>) -> Result<String, String> {
    git::git_unstage(&cwd, paths)
}

#[tauri::command]
#[specta::specta]
fn git_commit(cwd: String, message: String) -> Result<String, String> {
    git::git_commit(&cwd, &message)
}

#[tauri::command]
#[specta::specta]
fn git_push(cwd: String) -> Result<String, String> {
    git::git_push(&cwd)
}

#[tauri::command]
#[specta::specta]
fn git_pull(cwd: String) -> Result<String, String> {
    git::git_pull(&cwd)
}

#[tauri::command]
#[specta::specta]
fn git_create_branch(cwd: String, name: String) -> Result<String, String> {
    git::git_create_branch(&cwd, &name)
}

#[tauri::command]
#[specta::specta]
fn git_diff_staged(cwd: String) -> Result<String, String> {
    git::git_diff_staged(&cwd)
}

// ── MCP Config Commands ───────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn read_mcp_config(
    project_root: Option<String>,
) -> Result<Vec<mcp::McpServerEntry>, String> {
    mcp::read_mcp_config(project_root.as_deref())
}

#[tauri::command]
#[specta::specta]
fn write_mcp_config(
    scope: String,
    servers: std::collections::HashMap<String, mcp::McpServerConfig>,
    project_root: Option<String>,
) -> Result<(), String> {
    mcp::write_mcp_config(&scope, servers, project_root.as_deref())
}

// ── Analytics Commands ─────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn get_analytics(days: u32) -> Result<analytics::AnalyticsSummary, String> {
    analytics::get_analytics(days)
}

// ── Plugin Commands ────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn list_installed_plugins() -> Result<Vec<plugins::PluginInfo>, String> {
    plugins::list_installed_plugins()
}

#[tauri::command]
#[specta::specta]
fn list_installed_skills() -> Result<Vec<plugins::SkillInfo>, String> {
    plugins::list_installed_skills()
}

#[tauri::command]
#[specta::specta]
fn get_plugin_config(plugin_name: String) -> Result<plugins::PluginInfo, String> {
    plugins::get_plugin_config(&plugin_name)
}

#[tauri::command]
#[specta::specta]
fn toggle_plugin(plugin_name: String, enabled: bool) -> Result<(), String> {
    plugins::toggle_plugin(&plugin_name, enabled)
}

#[tauri::command]
#[specta::specta]
fn install_plugin(name: String) -> Result<String, String> {
    plugins::install_plugin(&name)
}

// ── Indexer Commands ──────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn index_project(root_path: String, force: bool) -> Result<indexer::ProjectIndex, String> {
    indexer::index_project_cached(&root_path, force)
}

#[tauri::command]
#[specta::specta]
fn get_project_index(root_path: String) -> Result<Option<indexer::ProjectIndex>, String> {
    indexer::get_cached_index(&root_path)
}

// ── Checkpoint Commands ────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn create_checkpoint(
    cwd: String,
    agent_id: String,
    agent_name: String,
) -> Result<checkpoint::Checkpoint, String> {
    checkpoint::create_checkpoint(&cwd, &agent_id, &agent_name)
}

#[tauri::command]
#[specta::specta]
fn list_checkpoints(
    cwd: String,
    agent_id: Option<String>,
) -> Result<Vec<checkpoint::Checkpoint>, String> {
    checkpoint::list_checkpoints(&cwd, agent_id.as_deref())
}

#[tauri::command]
#[specta::specta]
fn restore_checkpoint(cwd: String, tag_name: String) -> Result<(), String> {
    checkpoint::restore_checkpoint(&cwd, &tag_name)
}

#[tauri::command]
#[specta::specta]
fn delete_checkpoint(cwd: String, tag_name: String) -> Result<(), String> {
    checkpoint::delete_checkpoint(&cwd, &tag_name)
}

// ── Theme File Commands ────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn read_theme_file() -> Result<Option<String>, String> {
    theme::read_theme_file()
}

#[tauri::command]
#[specta::specta]
fn write_theme_file(content: String) -> Result<(), String> {
    theme::write_theme_file(&content)
}

#[tauri::command]
#[specta::specta]
fn get_theme_file_path() -> Result<String, String> {
    theme::get_theme_file_path()
}

// ── Merge Queue Commands ──────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn run_quality_gate(
    cwd: String,
    gate_name: String,
    command: String,
) -> Result<merge_queue::QualityGateResult, String> {
    merge_queue::run_quality_gate(&cwd, &gate_name, &command)
}

#[tauri::command]
#[specta::specta]
fn detect_quality_gates(cwd: String) -> Result<Vec<merge_queue::DetectedGate>, String> {
    merge_queue::detect_quality_gates(&cwd)
}

#[tauri::command]
#[specta::specta]
fn merge_branch(
    repo_path: String,
    branch_name: String,
    no_ff: bool,
) -> Result<merge_queue::MergeResult, String> {
    merge_queue::merge_branch(&repo_path, &branch_name, no_ff)
}

#[tauri::command]
#[specta::specta]
fn rebase_branch(
    worktree_path: String,
    onto_branch: String,
) -> Result<bool, String> {
    merge_queue::rebase_branch(&worktree_path, &onto_branch)
}

// ── Claude Settings Commands ─────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn read_claude_settings() -> Result<String, String> {
    claude_settings::read_claude_settings()
}

#[tauri::command]
#[specta::specta]
fn write_claude_settings(content: String) -> Result<(), String> {
    claude_settings::write_claude_settings(&content)
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
            format_file,
            start_file_watcher,
            stop_file_watcher,
            list_shells,
            get_default_shell,
            claude_start_session,
            claude_send_message,
            claude_respond_permission,
            claude_interrupt_session,
            claude_stop_session,
            claude_stop_all_sessions,
            claude_list_active_sessions,
            claude_list_sessions,
            claude_is_session_alive,
            check_prerequisites,
            get_git_branch,
            get_git_status,
            git_show_file,
            create_worktree,
            list_worktrees,
            remove_worktree,
            get_worktree_disk_usage,
            get_worktree_changes,
            get_agent_worktree_path,
            get_agent_branch_name,
            search_project,
            replace_in_files,
            read_mcp_config,
            write_mcp_config,
            search_sessions,
            get_session_stats,
            git_log,
            git_blame,
            git_diff_commit,
            git_diff_working,
            git_diff_staged,
            git_stage,
            git_unstage,
            git_commit,
            git_push,
            git_pull,
            git_create_branch,
            get_pr_list,
            get_analytics,
            read_theme_file,
            write_theme_file,
            get_theme_file_path,
            create_checkpoint,
            list_checkpoints,
            restore_checkpoint,
            delete_checkpoint,
            run_quality_gate,
            detect_quality_gates,
            merge_branch,
            rebase_branch,
            list_installed_plugins,
            list_installed_skills,
            get_plugin_config,
            toggle_plugin,
            install_plugin,
            index_project,
            get_project_index,
            read_claude_settings,
            write_claude_settings,
            workspace::read_workspace_file,
            workspace::write_workspace_file,
            workspace::list_workspace_files,
        ],
    );

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export TypeScript bindings");

    let mut app_builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());
        // .plugin(tauri_plugin_updater::Builder::new().build()) // TODO: enable when updater endpoint is configured

    // MCP Bridge: enables AI assistants (Claude Code, Cursor, etc.) to
    // take screenshots, click elements, read DOM, inspect IPC, and execute
    // JS in the running app.  Only active in debug builds.
    #[cfg(debug_assertions)]
    {
        app_builder = app_builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    app_builder
        .manage(Mutex::new(FileWatcherState::new()))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            // Initialize the Claude session manager
            let session_manager = SessionManager::new(app.handle().clone());
            app.manage(TokioMutex::new(session_manager));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Vantage")
        .run(|app_handle, event| {
            // 4B: Kill all managed Claude CLI processes on app exit
            if let tauri::RunEvent::ExitRequested { .. } = &event {
                let handle = app_handle.clone();
                tauri::async_runtime::block_on(async {
                    let state = handle.state::<TokioMutex<SessionManager>>();
                    let manager = state.lock().await;
                    manager.stop_all().await;
                });
            }
        });
}
