# Vantage Phase 2: Core IDE Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three core IDE features -- file explorer, Monaco code editor, and integrated terminal -- replacing Phase 1 placeholders with functional components.

**Architecture:** Rust backend handles file system operations (ignore crate for tree, notify for watching) and PTY management (tauri-plugin-pty for ConPTY). Monaco Editor runs in WebView2. xterm.js renders terminal output with WebGL. All Rust<->React communication uses tauri-specta for type safety.

**Tech Stack:** Monaco Editor, xterm.js 5.x (WebGL), tauri-plugin-pty, ignore crate, notify crate, tauri-specta, Zustand v5

---

### Task 1: File System Backend (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/files/mod.rs`
- Create: `src-tauri/src/files/tree.rs`
- Create: `src-tauri/src/files/watcher.rs`
- Create: `src-tauri/src/files/operations.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add file system crates to Cargo.toml**

Open `src-tauri/Cargo.toml` and add these dependencies to the existing `[dependencies]` section:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-store = "2"
tauri-specta = { version = "=2.0.0-rc.24", features = ["derive", "typescript"] }
specta = { version = "=2.0.0-rc.24", features = ["derive"] }
specta-typescript = "0.0.11"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
ignore = "0.4"
notify = "9"
notify-debouncer-full = "0.4"
```

- [ ] **Step 2: Create files module directory**

```bash
mkdir -p C:/CursorProjects/Vantage/src-tauri/src/files
```

- [ ] **Step 3: Create `src-tauri/src/files/tree.rs` -- file tree builder**

```rust
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub extension: Option<String>,
    pub children: Option<Vec<FileNode>>,
    pub is_symlink: bool,
}

/// Build a file tree from the given root path, respecting .gitignore.
/// `depth` controls how many levels deep to traverse (1 = immediate children only).
pub fn build_file_tree(root: &str, depth: u32) -> Result<Vec<FileNode>, String> {
    let root_path = PathBuf::from(root);
    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", root));
    }
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    let walker = WalkBuilder::new(&root_path)
        .max_depth(Some(depth as usize + 1)) // +1 because root itself is depth 0
        .hidden(false) // show dotfiles (except .gitignored)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .sort_by_file_path(|a, b| {
            // Directories first, then alphabetical (case-insensitive)
            let a_is_dir = a.is_dir();
            let b_is_dir = b.is_dir();
            match (a_is_dir, b_is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.file_name()
                    .unwrap_or_default()
                    .to_ascii_lowercase()
                    .cmp(
                        &b.file_name()
                            .unwrap_or_default()
                            .to_ascii_lowercase(),
                    ),
            }
        })
        .build();

    // Collect all entries into a flat list, excluding the root itself
    let mut entries: Vec<(PathBuf, bool, bool, bool)> = Vec::new();

    for entry in walker {
        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;
        let entry_path = entry.path().to_path_buf();

        // Skip the root directory itself
        if entry_path == root_path {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Metadata error for {:?}: {}", entry_path, e))?;

        entries.push((
            entry_path,
            metadata.is_dir(),
            metadata.is_file(),
            metadata.is_symlink(),
        ));
    }

    // Build the tree structure from the flat list
    build_tree_from_entries(&root_path, &entries)
}

fn build_tree_from_entries(
    root: &Path,
    entries: &[(PathBuf, bool, bool, bool)],
) -> Result<Vec<FileNode>, String> {
    // Group entries by their immediate parent relative to root
    let mut children_map: HashMap<PathBuf, Vec<&(PathBuf, bool, bool, bool)>> = HashMap::new();

    for entry in entries {
        if let Some(parent) = entry.0.parent() {
            children_map
                .entry(parent.to_path_buf())
                .or_default()
                .push(entry);
        }
    }

    fn build_children(
        dir_path: &Path,
        children_map: &HashMap<PathBuf, Vec<&(PathBuf, bool, bool, bool)>>,
    ) -> Vec<FileNode> {
        let empty = Vec::new();
        let children = children_map.get(dir_path).unwrap_or(&empty);

        children
            .iter()
            .map(|(path, is_dir, is_file, is_symlink)| {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let extension = if *is_file {
                    path.extension().map(|e| e.to_string_lossy().to_string())
                } else {
                    None
                };

                let node_children = if *is_dir {
                    let sub = build_children(path, children_map);
                    if sub.is_empty() {
                        // Directory exists but has no loaded children at this depth
                        // Return None to signal "expandable but not yet loaded"
                        None
                    } else {
                        Some(sub)
                    }
                } else {
                    None
                };

                // Normalize path separators to forward slashes for consistency
                let normalized_path = path.to_string_lossy().replace('\\', "/");

                FileNode {
                    name,
                    path: normalized_path,
                    is_dir: *is_dir,
                    is_file: *is_file,
                    extension,
                    children: node_children,
                    is_symlink: *is_symlink,
                }
            })
            .collect()
    }

    Ok(build_children(root, &children_map))
}

/// Get children of a specific directory (for lazy loading on expand).
/// Returns only the immediate children (depth=1).
pub fn get_directory_children(dir_path: &str) -> Result<Vec<FileNode>, String> {
    build_file_tree(dir_path, 1)
}
```

- [ ] **Step 4: Create `src-tauri/src/files/watcher.rs` -- file system watcher**

```rust
use notify::event::ModifyKind;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: FileChangeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum FileChangeKind {
    Created,
    Modified,
    Removed,
    Renamed,
    Other,
}

impl From<&EventKind> for FileChangeKind {
    fn from(kind: &EventKind) -> Self {
        match kind {
            EventKind::Create(_) => FileChangeKind::Created,
            EventKind::Modify(ModifyKind::Name(_)) => FileChangeKind::Renamed,
            EventKind::Modify(_) => FileChangeKind::Modified,
            EventKind::Remove(_) => FileChangeKind::Removed,
            _ => FileChangeKind::Other,
        }
    }
}

pub struct FileWatcherState {
    debouncer: Option<Debouncer<RecommendedWatcher, RecommendedCache>>,
    watched_path: Option<PathBuf>,
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            watched_path: None,
        }
    }
}

/// Start watching a directory for file changes.
/// Emits "file_changed" events to the frontend via Tauri events.
pub fn start_watching(
    app_handle: &AppHandle,
    watcher_state: &Mutex<FileWatcherState>,
    path: &str,
) -> Result<(), String> {
    let watch_path = PathBuf::from(path);
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let handle = app_handle.clone();

    let debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| {
            match result {
                Ok(events) => {
                    for event in events {
                        let kind = FileChangeKind::from(&event.kind);
                        for path in &event.paths {
                            let normalized = path.to_string_lossy().replace('\\', "/");
                            let change = FileChangeEvent {
                                path: normalized,
                                kind: kind.clone(),
                            };
                            // Emit event to all frontend listeners
                            let _ = handle.emit("file_changed", &change);
                        }
                    }
                }
                Err(errors) => {
                    for error in errors {
                        eprintln!("File watcher error: {:?}", error);
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    let mut state = watcher_state
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    // Stop existing watcher if any
    state.debouncer = None;
    state.watched_path = None;

    // Start the new watcher -- we store the debouncer first, then watch
    state.debouncer = Some(debouncer);
    state.watched_path = Some(watch_path.clone());

    // Get a mutable reference to the debouncer we just stored
    if let Some(ref mut debouncer) = state.debouncer {
        debouncer
            .watcher()
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to start watching: {}", e))?;
    }

    Ok(())
}

/// Stop watching the current directory.
pub fn stop_watching(watcher_state: &Mutex<FileWatcherState>) -> Result<(), String> {
    let mut state = watcher_state
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    state.debouncer = None;
    state.watched_path = None;

    Ok(())
}
```

- [ ] **Step 5: Create `src-tauri/src/files/operations.rs` -- file CRUD commands**

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub language: String,
}

/// Detect language from file extension for Monaco Editor.
pub fn detect_language(path: &str) -> String {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext {
        "ts" | "tsx" => "typescript".to_string(),
        "js" | "jsx" | "mjs" | "cjs" => "javascript".to_string(),
        "rs" => "rust".to_string(),
        "py" => "python".to_string(),
        "json" => "json".to_string(),
        "toml" => "toml".to_string(),
        "yaml" | "yml" => "yaml".to_string(),
        "md" | "mdx" => "markdown".to_string(),
        "html" | "htm" => "html".to_string(),
        "css" => "css".to_string(),
        "scss" => "scss".to_string(),
        "less" => "less".to_string(),
        "xml" | "svg" => "xml".to_string(),
        "sh" | "bash" | "zsh" => "shell".to_string(),
        "ps1" => "powershell".to_string(),
        "bat" | "cmd" => "bat".to_string(),
        "sql" => "sql".to_string(),
        "go" => "go".to_string(),
        "java" => "java".to_string(),
        "c" | "h" => "c".to_string(),
        "cpp" | "cc" | "cxx" | "hpp" => "cpp".to_string(),
        "cs" => "csharp".to_string(),
        "rb" => "ruby".to_string(),
        "php" => "php".to_string(),
        "swift" => "swift".to_string(),
        "kt" | "kts" => "kotlin".to_string(),
        "lua" => "lua".to_string(),
        "r" => "r".to_string(),
        "dockerfile" => "dockerfile".to_string(),
        "graphql" | "gql" => "graphql".to_string(),
        "ini" | "cfg" | "conf" => "ini".to_string(),
        "env" => "dotenv".to_string(),
        "gitignore" | "dockerignore" => "ignore".to_string(),
        _ => "plaintext".to_string(),
    }
}

/// Read a file's contents and detect its language.
pub fn read_file(path: &str) -> Result<FileContent, String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if !file_path.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    let content =
        fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let language = detect_language(path);
    let normalized_path = path.replace('\\', "/");

    Ok(FileContent {
        path: normalized_path,
        content,
        language,
    })
}

/// Write content to a file. Creates the file if it does not exist.
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    let file_path = Path::new(path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    fs::write(file_path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Create an empty file. Returns error if file already exists.
pub fn create_file(path: &str) -> Result<(), String> {
    let file_path = Path::new(path);
    if file_path.exists() {
        return Err(format!("File already exists: {}", path));
    }

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    fs::File::create(file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(())
}

/// Create a directory. Creates parent directories as needed.
pub fn create_dir(path: &str) -> Result<(), String> {
    let dir_path = Path::new(path);
    if dir_path.exists() {
        return Err(format!("Directory already exists: {}", path));
    }

    fs::create_dir_all(dir_path).map_err(|e| format!("Failed to create directory: {}", e))
}

/// Rename/move a file or directory.
pub fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    let old = Path::new(old_path);
    if !old.exists() {
        return Err(format!("Source does not exist: {}", old_path));
    }

    let new = Path::new(new_path);
    if new.exists() {
        return Err(format!("Destination already exists: {}", new_path));
    }

    fs::rename(old, new).map_err(|e| format!("Failed to rename: {}", e))
}

/// Delete a file.
pub fn delete_file(path: &str) -> Result<(), String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if !file_path.is_file() {
        return Err(format!("Not a file (use delete_dir for directories): {}", path));
    }

    fs::remove_file(file_path).map_err(|e| format!("Failed to delete file: {}", e))
}

/// Delete a directory and all its contents.
pub fn delete_dir(path: &str) -> Result<(), String> {
    let dir_path = Path::new(path);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    fs::remove_dir_all(dir_path).map_err(|e| format!("Failed to delete directory: {}", e))
}
```

- [ ] **Step 6: Create `src-tauri/src/files/mod.rs`**

```rust
pub mod operations;
pub mod tree;
pub mod watcher;
```

- [ ] **Step 7: Update `src-tauri/src/lib.rs` to register file system commands**

Replace `src-tauri/src/lib.rs` with:

```rust
mod files;

use files::operations::{self, FileContent};
use files::tree::{self, FileNode};
use files::watcher::{self, FileChangeEvent, FileChangeKind, FileWatcherState};
use std::sync::Mutex;
use tauri::Manager;

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
        .manage(Mutex::new(FileWatcherState::new()))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vantage");
}
```

- [ ] **Step 8: Verify Rust compiles**

```bash
cd C:/CursorProjects/Vantage/src-tauri
cargo check
```

Expected: Compilation succeeds with no errors. Warnings about unused imports in watcher types are acceptable at this stage.

- [ ] **Step 9: Commit**

```bash
cd C:/CursorProjects/Vantage
git add src-tauri/Cargo.toml src-tauri/src/files/ src-tauri/src/lib.rs
git commit -m "feat: add Rust file system backend with tree, watcher, and CRUD operations

Add ignore crate for .gitignore-aware file tree walking.
Add notify crate with 500ms debouncer for file system watching.
Implement file CRUD operations (read, write, create, rename, delete).
Register all commands with tauri-specta for type-safe IPC."
```

---

### Task 2: Terminal Backend (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/terminal/mod.rs`
- Create: `src-tauri/src/terminal/pty_manager.rs`
- Create: `src-tauri/src/terminal/shell_detect.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add terminal crate to Cargo.toml**

Add `tauri-plugin-pty` to `src-tauri/Cargo.toml` dependencies:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-store = "2"
tauri-specta = { version = "=2.0.0-rc.24", features = ["derive", "typescript"] }
specta = { version = "=2.0.0-rc.24", features = ["derive"] }
specta-typescript = "0.0.11"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
ignore = "0.4"
notify = "9"
notify-debouncer-full = "0.4"
tauri-plugin-pty = "0.1"
```

Also add the `tauri-pty` npm package for the frontend:

```bash
cd C:/CursorProjects/Vantage
npm install tauri-pty
```

- [ ] **Step 2: Create terminal module directory**

```bash
mkdir -p C:/CursorProjects/Vantage/src-tauri/src/terminal
```

- [ ] **Step 3: Create `src-tauri/src/terminal/shell_detect.rs` -- Windows shell detection**

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
    pub is_default: bool,
}

/// Detect available shells on Windows.
/// Priority order: PowerShell 7 > Windows PowerShell 5.1 > Git Bash > CMD
pub fn detect_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();
    let mut found_default = false;

    // 1. PowerShell 7+ (pwsh.exe) -- check common install locations
    if let Some(pwsh_path) = find_pwsh() {
        let is_default = !found_default;
        if is_default {
            found_default = true;
        }
        shells.push(ShellInfo {
            name: "PowerShell".to_string(),
            path: pwsh_path,
            args: vec!["-NoLogo".to_string()],
            is_default,
        });
    }

    // 2. Windows PowerShell 5.1 (powershell.exe) -- always available on Windows 10+
    let windows_ps = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    if PathBuf::from(windows_ps).exists() {
        let is_default = !found_default;
        if is_default {
            found_default = true;
        }
        shells.push(ShellInfo {
            name: "Windows PowerShell".to_string(),
            path: windows_ps.to_string(),
            args: vec!["-NoLogo".to_string()],
            is_default,
        });
    }

    // 3. Git Bash -- check common install locations
    let git_bash_paths = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ];
    for git_bash in &git_bash_paths {
        if PathBuf::from(git_bash).exists() {
            let is_default = !found_default;
            if is_default {
                found_default = true;
            }
            shells.push(ShellInfo {
                name: "Git Bash".to_string(),
                path: git_bash.to_string(),
                args: vec!["--login".to_string(), "-i".to_string()],
                is_default,
            });
            break;
        }
    }

    // 4. CMD -- always available
    let cmd_path = r"C:\Windows\System32\cmd.exe";
    if PathBuf::from(cmd_path).exists() {
        let is_default = !found_default;
        if is_default {
            // found_default would be set but variable is no longer read
        }
        shells.push(ShellInfo {
            name: "Command Prompt".to_string(),
            path: cmd_path.to_string(),
            args: vec![],
            is_default,
        });
    }

    shells
}

/// Find PowerShell 7+ (pwsh.exe) by checking common locations and PATH.
fn find_pwsh() -> Option<String> {
    // Check common install paths first
    let common_paths = [
        r"C:\Program Files\PowerShell\7\pwsh.exe",
        r"C:\Program Files (x86)\PowerShell\7\pwsh.exe",
    ];

    for path in &common_paths {
        if PathBuf::from(path).exists() {
            return Some(path.to_string());
        }
    }

    // Fall back to checking PATH via `where`
    if let Ok(output) = Command::new("where").arg("pwsh").output() {
        if output.status.success() {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                if let Some(first_line) = stdout.lines().next() {
                    let trimmed = first_line.trim();
                    if !trimmed.is_empty() && PathBuf::from(trimmed).exists() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Get the default shell for spawning terminals.
pub fn get_default_shell() -> ShellInfo {
    let shells = detect_shells();
    shells
        .into_iter()
        .find(|s| s.is_default)
        .unwrap_or(ShellInfo {
            name: "Command Prompt".to_string(),
            path: r"C:\Windows\System32\cmd.exe".to_string(),
            args: vec![],
            is_default: true,
        })
}
```

- [ ] **Step 4: Create `src-tauri/src/terminal/pty_manager.rs`**

Note: `tauri-plugin-pty` handles the actual PTY spawn and data transport from its JavaScript API (`tauri-pty` npm package). The Rust side only needs to register the plugin. This manager provides the shell detection commands that the frontend uses to decide *which* shell to spawn.

```rust
use super::shell_detect::{self, ShellInfo};

/// Get the list of available shells on this system.
pub fn list_shells() -> Vec<ShellInfo> {
    shell_detect::detect_shells()
}

/// Get the default shell for new terminals.
pub fn default_shell() -> ShellInfo {
    shell_detect::get_default_shell()
}
```

- [ ] **Step 5: Create `src-tauri/src/terminal/mod.rs`**

```rust
pub mod pty_manager;
pub mod shell_detect;
```

- [ ] **Step 6: Update `src-tauri/src/lib.rs` to register terminal commands and PTY plugin**

Replace `src-tauri/src/lib.rs` with the full updated version:

```rust
mod files;
mod terminal;

use files::operations::{self, FileContent};
use files::tree::{self, FileNode};
use files::watcher::{self, FileChangeEvent, FileChangeKind, FileWatcherState};
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
        .manage(Mutex::new(FileWatcherState::new()))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vantage");
}
```

- [ ] **Step 7: Verify Rust compiles with terminal support**

```bash
cd C:/CursorProjects/Vantage/src-tauri
cargo check
```

Expected: Compilation succeeds. The `tauri-plugin-pty` crate pulls in `portable-pty` which uses ConPTY on Windows.

- [ ] **Step 8: Commit**

```bash
cd C:/CursorProjects/Vantage
git add src-tauri/Cargo.toml src-tauri/src/terminal/ src-tauri/src/lib.rs package.json package-lock.json
git commit -m "feat: add terminal backend with PTY plugin and Windows shell detection

Register tauri-plugin-pty for ConPTY-based terminal emulation.
Add shell detection for PowerShell 7, Windows PowerShell, Git Bash, CMD.
Install tauri-pty npm package for frontend PTY API."
```

---

### Task 3: Editor Store (Zustand)

**Files:**
- Create: `src/stores/editor.ts`
- Create: `src/stores/__tests__/editor.test.ts`

- [ ] **Step 1: Create the editor store**

Create `src/stores/editor.ts`:

```ts
import { create } from "zustand";

export interface EditorTab {
  /** Unique ID for this tab (normalized file path) */
  id: string;
  /** Full file path (forward slashes) */
  path: string;
  /** Display name (filename) */
  name: string;
  /** Monaco language ID */
  language: string;
  /** Current file content in the editor */
  content: string;
  /** Content as last saved to disk */
  savedContent: string;
  /** Whether the editor content differs from the saved content */
  isDirty: boolean;
  /** Whether this tab is a preview (italic title, replaced on next single-click) */
  isPreview: boolean;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface EditorState {
  /** All open tabs in order */
  tabs: EditorTab[];
  /** ID of the currently active tab (null if no tabs open) */
  activeTabId: string | null;
  /** Current cursor position in the active editor */
  cursorPosition: CursorPosition;

  // ── Actions ─────────────────────────────────────────────────────

  /** Open a file in a new tab or switch to it if already open */
  openFile: (
    path: string,
    name: string,
    language: string,
    content: string,
    preview?: boolean
  ) => void;
  /** Close a tab by ID */
  closeTab: (id: string) => void;
  /** Set the active tab */
  setActiveTab: (id: string) => void;
  /** Update the content of a tab (marks it dirty if different from saved) */
  updateContent: (id: string, content: string) => void;
  /** Mark a tab as saved (resets dirty state, updates savedContent) */
  markSaved: (id: string, content: string) => void;
  /** Pin a preview tab (make it permanent) */
  pinTab: (id: string) => void;
  /** Update cursor position for the status bar */
  setCursorPosition: (position: CursorPosition) => void;
  /** Reload a tab's content from disk (external change) */
  reloadTab: (id: string, content: string) => void;
  /** Get the currently active tab, or null */
  getActiveTab: () => EditorTab | null;
  /** Close all tabs */
  closeAllTabs: () => void;
  /** Close all tabs except the given one */
  closeOtherTabs: (id: string) => void;
}

/** Normalize a file path to use as a tab ID (forward slashes, lowercase drive letter) */
function normalizeTabId(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  // Lowercase the drive letter on Windows paths like C:/...
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorPosition: { line: 1, column: 1 },

  openFile: (path, name, language, content, preview = false) => {
    const id = normalizeTabId(path);
    const { tabs } = get();

    // If file is already open, just switch to it
    const existingTab = tabs.find((t) => t.id === id);
    if (existingTab) {
      // If the existing tab is a preview and this is a non-preview open, pin it
      if (existingTab.isPreview && !preview) {
        set({
          tabs: tabs.map((t) => (t.id === id ? { ...t, isPreview: false } : t)),
          activeTabId: id,
        });
      } else {
        set({ activeTabId: id });
      }
      return;
    }

    // If opening a preview, replace any existing preview tab
    const newTabs = preview ? tabs.filter((t) => !t.isPreview) : [...tabs];

    const newTab: EditorTab = {
      id,
      path: path.replace(/\\/g, "/"),
      name,
      language,
      content,
      savedContent: content,
      isDirty: false,
      isPreview: preview,
    };

    set({
      tabs: [...newTabs, newTab],
      activeTabId: id,
    });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((t) => t.id === id);
    if (tabIndex === -1) return;

    const newTabs = tabs.filter((t) => t.id !== id);

    let newActiveId: string | null = null;
    if (activeTabId === id && newTabs.length > 0) {
      // Activate the tab to the left, or the first tab if we closed the leftmost
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      newActiveId = newTabs[newIndex].id;
    } else if (activeTabId !== id) {
      newActiveId = activeTabId;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
  },

  updateContent: (id, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? { ...t, content, isDirty: content !== t.savedContent }
          : t
      ),
    });
  },

  markSaved: (id, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? { ...t, savedContent: content, content, isDirty: false }
          : t
      ),
    });
  },

  pinTab: (id) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, isPreview: false } : t
      ),
    });
  },

  setCursorPosition: (position) => {
    set({ cursorPosition: position });
  },

  reloadTab: (id, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? { ...t, content, savedContent: content, isDirty: false }
          : t
      ),
    });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },

  closeAllTabs: () => {
    set({ tabs: [], activeTabId: null });
  },

  closeOtherTabs: (id) => {
    const { tabs } = get();
    set({
      tabs: tabs.filter((t) => t.id === id),
      activeTabId: id,
    });
  },
}));
```

- [ ] **Step 2: Create editor store tests**

Create `src/stores/__tests__/editor.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor";

describe("editorStore", () => {
  beforeEach(() => {
    // Reset store between tests
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      cursorPosition: { line: 1, column: 1 },
    });
  });

  it("opens a file and sets it as active", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/src/main.ts", "main.ts", "typescript", "const x = 1;");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].name).toBe("main.ts");
    expect(state.tabs[0].isDirty).toBe(false);
    expect(state.activeTabId).toBe("c:/project/src/main.ts");
  });

  it("switches to existing tab if file is already open", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b");
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("c:/project/a.ts");
  });

  it("marks tab dirty when content changes", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "const x = 1;");

    store.updateContent("c:/project/main.ts", "const x = 2;");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isDirty).toBe(true);
  });

  it("clears dirty state when content matches saved", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "const x = 1;");
    store.updateContent("c:/project/main.ts", "const x = 2;");
    store.updateContent("c:/project/main.ts", "const x = 1;");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isDirty).toBe(false);
  });

  it("marks saved resets dirty state", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "original");
    store.updateContent("c:/project/main.ts", "modified");
    store.markSaved("c:/project/main.ts", "modified");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isDirty).toBe(false);
    expect(state.tabs[0].savedContent).toBe("modified");
  });

  it("closes a tab and selects the neighbor", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b");
    store.openFile("C:/project/c.ts", "c.ts", "typescript", "c");

    // Active is c.ts; close it
    store.closeTab("c:/project/c.ts");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("c:/project/b.ts");
  });

  it("replaces preview tab when opening another preview", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a", true);
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b", true);

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].name).toBe("b.ts");
    expect(state.tabs[0].isPreview).toBe(true);
  });

  it("pins a preview tab", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a", true);
    store.pinTab("c:/project/a.ts");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isPreview).toBe(false);
  });

  it("normalizes backslash paths", () => {
    const store = useEditorStore.getState();
    store.openFile("C:\\project\\main.ts", "main.ts", "typescript", "content");

    const state = useEditorStore.getState();
    expect(state.tabs[0].path).toBe("C:/project/main.ts");
    expect(state.activeTabId).toBe("c:/project/main.ts");
  });

  it("returns null for getActiveTab when no tabs open", () => {
    const state = useEditorStore.getState();
    expect(state.getActiveTab()).toBeNull();
  });

  it("closeAllTabs clears everything", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b");
    store.closeAllTabs();

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd C:/CursorProjects/Vantage
npx vitest run src/stores/__tests__/editor.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/CursorProjects/Vantage
git add src/stores/editor.ts src/stores/__tests__/editor.test.ts
git commit -m "feat: add editor Zustand store with tabs, dirty tracking, and preview mode

Manage open file tabs with content, dirty state, and cursor position.
Support preview tabs (replaced on next single-click open).
Normalize Windows backslash paths for consistent tab IDs.
Include comprehensive unit tests."
```

---

### Task 4: File Explorer Component

**Files:**
- Create: `src/hooks/useFileTree.ts`
- Create: `src/components/files/FileExplorer.tsx`
- Create: `src/components/files/FileIcon.tsx`
- Create: `src/components/files/FileTreeNode.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx`

- [ ] **Step 1: Create the file tree hook**

Create `src/hooks/useFileTree.ts`:

```ts
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  extension: string | null;
  children: FileNode[] | null;
  is_symlink: boolean;
}

interface FileChangeEvent {
  path: string;
  kind: "Created" | "Modified" | "Removed" | "Renamed" | "Other";
}

interface UseFileTreeReturn {
  tree: FileNode[];
  isLoading: boolean;
  error: string | null;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  refresh: () => void;
  rootPath: string | null;
  setRootPath: (path: string) => void;
}

export function useFileTree(): UseFileTreeReturn {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [rootPath, setRootPathState] = useState<string | null>(null);

  const loadTree = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<FileNode[]>("get_file_tree", {
        path,
        depth: 1,
      });
      setTree(result);
    } catch (e) {
      setError(e as string);
      setTree([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setRootPath = useCallback(
    (path: string) => {
      setRootPathState(path);
      setExpandedPaths(new Set());
      loadTree(path);

      // Start file watcher for the new root
      invoke("start_file_watcher", { path }).catch((err) =>
        console.error("Failed to start file watcher:", err)
      );
    },
    [loadTree]
  );

  const toggleExpand = useCallback(
    async (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });

      // If expanding and we don't have children loaded, fetch them
      const node = findNode(tree, path);
      if (node && node.is_dir && node.children === null) {
        try {
          const children = await invoke<FileNode[]>("get_directory_children", {
            path,
          });
          setTree((prevTree) => updateNodeChildren(prevTree, path, children));
        } catch (e) {
          console.error("Failed to load children for", path, e);
        }
      }
    },
    [tree]
  );

  const refresh = useCallback(() => {
    if (rootPath) {
      // Preserve expanded state, re-fetch everything
      loadTree(rootPath).then(() => {
        // Re-expand previously expanded directories
        // The tree was reloaded at depth 1, so re-fetch children of expanded dirs
        expandedPaths.forEach(async (expandedPath) => {
          try {
            const children = await invoke<FileNode[]>(
              "get_directory_children",
              { path: expandedPath }
            );
            setTree((prevTree) =>
              updateNodeChildren(prevTree, expandedPath, children)
            );
          } catch {
            // Directory may no longer exist; remove from expanded
            setExpandedPaths((prev) => {
              const next = new Set(prev);
              next.delete(expandedPath);
              return next;
            });
          }
        });
      });
    }
  }, [rootPath, expandedPaths, loadTree]);

  // Listen for file change events from the Rust watcher
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<FileChangeEvent>("file_changed", (event) => {
      // Debounce is already handled on the Rust side (500ms).
      // On any file change, refresh the tree.
      // For a more efficient approach, we could update only the affected subtree,
      // but a full refresh at depth 1 is fast enough for most projects.
      if (rootPath) {
        refresh();
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [rootPath, refresh]);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      invoke("stop_file_watcher").catch(() => {});
    };
  }, []);

  return {
    tree,
    isLoading,
    error,
    expandedPaths,
    toggleExpand,
    refresh,
    rootPath,
    setRootPath,
  };
}

// ── Helper Functions ──────────────────────────────────────────────────

function findNode(tree: FileNode[], path: string): FileNode | null {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeChildren(
  tree: FileNode[],
  path: string,
  children: FileNode[]
): FileNode[] {
  return tree.map((node) => {
    if (node.path === path) {
      return { ...node, children };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeChildren(node.children, path, children),
      };
    }
    return node;
  });
}
```

- [ ] **Step 2: Create the file icon component**

Create `src/components/files/FileIcon.tsx`:

```tsx
import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  Folder,
  FolderOpen,
  FileType,
  Cog,
  Package,
  GitBranch,
  FileTerminal,
} from "lucide-react";

interface FileIconProps {
  name: string;
  extension: string | null;
  isDir: boolean;
  isExpanded?: boolean;
  size?: number;
}

const EXTENSION_COLORS: Record<string, string> = {
  ts: "var(--color-blue)",
  tsx: "var(--color-blue)",
  js: "var(--color-yellow)",
  jsx: "var(--color-yellow)",
  json: "var(--color-yellow)",
  rs: "var(--color-peach)",
  py: "var(--color-blue)",
  md: "var(--color-subtext-1)",
  css: "var(--color-blue)",
  scss: "var(--color-pink)",
  html: "var(--color-peach)",
  svg: "var(--color-yellow)",
  png: "var(--color-mauve)",
  jpg: "var(--color-mauve)",
  gif: "var(--color-mauve)",
  toml: "var(--color-peach)",
  yaml: "var(--color-red)",
  yml: "var(--color-red)",
  sh: "var(--color-green)",
  bash: "var(--color-green)",
  ps1: "var(--color-blue)",
  go: "var(--color-sky)",
  java: "var(--color-red)",
  rb: "var(--color-red)",
  php: "var(--color-mauve)",
  sql: "var(--color-yellow)",
  graphql: "var(--color-pink)",
  lock: "var(--color-overlay-0)",
};

const SPECIAL_FILES: Record<string, { icon: typeof File; color: string }> = {
  "package.json": { icon: Package, color: "var(--color-green)" },
  "Cargo.toml": { icon: Package, color: "var(--color-peach)" },
  "tsconfig.json": { icon: Cog, color: "var(--color-blue)" },
  ".gitignore": { icon: GitBranch, color: "var(--color-overlay-0)" },
  "Dockerfile": { icon: FileTerminal, color: "var(--color-sky)" },
  "docker-compose.yml": { icon: FileTerminal, color: "var(--color-sky)" },
  ".env": { icon: Cog, color: "var(--color-yellow)" },
  ".env.local": { icon: Cog, color: "var(--color-yellow)" },
};

function getIconForExtension(ext: string | null): typeof File {
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "rs":
    case "py":
    case "go":
    case "java":
    case "rb":
    case "php":
    case "c":
    case "cpp":
    case "h":
    case "cs":
    case "swift":
    case "kt":
      return FileCode;
    case "json":
    case "toml":
    case "yaml":
    case "yml":
    case "xml":
      return FileJson;
    case "md":
    case "mdx":
    case "txt":
    case "log":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "ico":
    case "webp":
      return FileImage;
    case "css":
    case "scss":
    case "less":
    case "html":
      return FileType;
    case "sh":
    case "bash":
    case "ps1":
    case "bat":
    case "cmd":
      return FileTerminal;
    default:
      return File;
  }
}

export function FileIcon({ name, extension, isDir, isExpanded = false, size = 16 }: FileIconProps) {
  // Directories
  if (isDir) {
    const Icon = isExpanded ? FolderOpen : Folder;
    return <Icon size={size} style={{ color: "var(--color-peach)" }} />;
  }

  // Special files (matched by full name)
  const special = SPECIAL_FILES[name];
  if (special) {
    const Icon = special.icon;
    return <Icon size={size} style={{ color: special.color }} />;
  }

  // Extension-based icon and color
  const Icon = getIconForExtension(extension);
  const color = extension
    ? EXTENSION_COLORS[extension] ?? "var(--color-overlay-1)"
    : "var(--color-overlay-1)";

  return <Icon size={size} style={{ color }} />;
}
```

- [ ] **Step 3: Create the file tree node component**

Create `src/components/files/FileTreeNode.tsx`:

```tsx
import { ChevronRight, ChevronDown } from "lucide-react";
import { FileIcon } from "./FileIcon";
import type { FileNode } from "@/hooks/useFileTree";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  onToggleExpand: (path: string) => void;
  onFileClick: (node: FileNode) => void;
  onFileDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

export function FileTreeNode({
  node,
  depth,
  isExpanded,
  onToggleExpand,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const paddingLeft = 8 + depth * 16;

  const handleClick = () => {
    if (node.is_dir) {
      onToggleExpand(node.path);
    } else {
      onFileClick(node);
    }
  };

  const handleDoubleClick = () => {
    if (!node.is_dir) {
      onFileDoubleClick(node);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, node);
  };

  return (
    <>
      <div
        className="flex items-center h-[22px] cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={node.is_dir ? isExpanded : undefined}
        aria-selected={false}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* Expand/collapse chevron for directories */}
        {node.is_dir ? (
          <span className="flex items-center justify-center w-4 h-4 shrink-0">
            {isExpanded ? (
              <ChevronDown size={12} style={{ color: "var(--color-overlay-1)" }} />
            ) : (
              <ChevronRight size={12} style={{ color: "var(--color-overlay-1)" }} />
            )}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/folder icon */}
        <span className="flex items-center justify-center w-4 h-4 mr-1.5 shrink-0">
          <FileIcon
            name={node.name}
            extension={node.extension}
            isDir={node.is_dir}
            isExpanded={isExpanded}
            size={14}
          />
        </span>

        {/* Name */}
        <span
          className="text-xs truncate"
          style={{
            color: node.name.startsWith(".")
              ? "var(--color-overlay-1)"
              : "var(--color-text)",
          }}
        >
          {node.name}
        </span>
      </div>

      {/* Render children if expanded */}
      {node.is_dir && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isExpanded={false} // Parent passes this via expandedPaths
              onToggleExpand={onToggleExpand}
              onFileClick={onFileClick}
              onFileDoubleClick={onFileDoubleClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Create the file explorer component**

Create `src/components/files/FileExplorer.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, RefreshCw } from "lucide-react";
import { useFileTree } from "@/hooks/useFileTree";
import { FileTreeNode } from "./FileTreeNode";
import { useEditorStore } from "@/stores/editor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileNode } from "@/hooks/useFileTree";

export function FileExplorer() {
  const {
    tree,
    isLoading,
    error,
    expandedPaths,
    toggleExpand,
    refresh,
    rootPath,
    setRootPath,
  } = useFileTree();

  const openFile = useEditorStore((s) => s.openFile);
  const pinTab = useEditorStore((s) => s.pinTab);

  const [contextNode, setContextNode] = useState<FileNode | null>(null);
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [renameNodePath, setRenameNodePath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // On first mount, try to detect the project directory
  useEffect(() => {
    if (!rootPath) {
      // Use the CWD from the Tauri environment or a default
      // In production, this would come from a "Open Folder" dialog
      // For now, just leave it empty -- the user will open a folder
    }
  }, [rootPath]);

  const handleFileClick = useCallback(
    async (node: FileNode) => {
      if (!node.is_file) return;
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: node.path });
        // Single-click opens as preview
        openFile(result.path, node.name, result.language, result.content, true);
      } catch (e) {
        console.error("Failed to open file:", e);
      }
    },
    [openFile]
  );

  const handleFileDoubleClick = useCallback(
    async (node: FileNode) => {
      if (!node.is_file) return;
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: node.path });
        // Double-click opens as pinned tab
        openFile(result.path, node.name, result.language, result.content, false);
      } catch (e) {
        console.error("Failed to open file:", e);
      }
    },
    [openFile]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileNode) => {
      setContextNode(node);
      setContextPosition({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    },
    []
  );

  const handleNewFile = useCallback(async () => {
    if (!contextNode) return;
    const parentPath = contextNode.is_dir ? contextNode.path : contextNode.path.replace(/\/[^/]+$/, "");
    const name = prompt("Enter file name:");
    if (!name) return;

    try {
      await invoke("create_file", { path: `${parentPath}/${name}` });
      refresh();
    } catch (e) {
      console.error("Failed to create file:", e);
    }
  }, [contextNode, refresh]);

  const handleNewFolder = useCallback(async () => {
    if (!contextNode) return;
    const parentPath = contextNode.is_dir ? contextNode.path : contextNode.path.replace(/\/[^/]+$/, "");
    const name = prompt("Enter folder name:");
    if (!name) return;

    try {
      await invoke("create_dir", { path: `${parentPath}/${name}` });
      refresh();
    } catch (e) {
      console.error("Failed to create folder:", e);
    }
  }, [contextNode, refresh]);

  const handleRename = useCallback(async () => {
    if (!contextNode) return;
    const newName = prompt("Enter new name:", contextNode.name);
    if (!newName || newName === contextNode.name) return;

    const parentPath = contextNode.path.replace(/\/[^/]+$/, "");
    try {
      await invoke("rename_path", {
        oldPath: contextNode.path,
        newPath: `${parentPath}/${newName}`,
      });
      refresh();
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  }, [contextNode, refresh]);

  const handleDelete = useCallback(async () => {
    if (!contextNode) return;
    const confirmed = confirm(
      `Are you sure you want to delete "${contextNode.name}"?`
    );
    if (!confirmed) return;

    try {
      if (contextNode.is_dir) {
        await invoke("delete_dir", { path: contextNode.path });
      } else {
        await invoke("delete_file", { path: contextNode.path });
      }
      refresh();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  }, [contextNode, refresh]);

  const handleCopyPath = useCallback(() => {
    if (!contextNode) return;
    navigator.clipboard.writeText(contextNode.path);
  }, [contextNode]);

  const handleOpenFolder = useCallback(async () => {
    try {
      // Use Tauri's file dialog to pick a folder
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setRootPath(selected as string);
      }
    } catch {
      // Fallback: prompt for a path string
      const path = prompt("Enter folder path:");
      if (path) {
        setRootPath(path.replace(/\\/g, "/"));
      }
    }
  }, [setRootPath]);

  // No folder open yet
  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <FolderOpen size={32} style={{ color: "var(--color-overlay-1)" }} />
        <p
          className="text-xs text-center"
          style={{ color: "var(--color-overlay-1)" }}
        >
          No folder open
        </p>
        <button
          onClick={handleOpenFolder}
          className="px-3 py-1.5 text-xs rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
          }}
        >
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-2 h-6 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider truncate"
          style={{ color: "var(--color-subtext-0)" }}
          title={rootPath}
        >
          {rootPath.split("/").pop() ?? "Project"}
        </span>
        <button
          onClick={refresh}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          aria-label="Refresh file tree"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-2 text-xs" style={{ color: "var(--color-red)" }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && tree.length === 0 && (
        <div
          className="p-2 text-xs"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Loading...
        </div>
      )}

      {/* File tree */}
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className="flex-1 overflow-y-auto py-1"
            role="tree"
            aria-label="File Explorer"
          >
            {tree.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                depth={0}
                isExpanded={expandedPaths.has(node.path)}
                onToggleExpand={toggleExpand}
                onFileClick={handleFileClick}
                onFileDoubleClick={handleFileDoubleClick}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-48"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <ContextMenuItem
            onClick={handleNewFile}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            New File
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleNewFolder}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={handleRename}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleDelete}
            className="text-xs"
            style={{ color: "var(--color-red)" }}
          >
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={handleCopyPath}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            Copy Path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
```

Note: The context menu above uses the base-ui based shadcn ContextMenu component that already exists in the project. The styling uses Catppuccin colors via CSS variables.

- [ ] **Step 5: Update FileTreeNode to receive expandedPaths from parent**

The `FileTreeNode` component in Step 3 renders children but does not know which child directories are expanded. We need to thread the `expandedPaths` set down. Replace the `FileTreeNode` in `src/components/files/FileTreeNode.tsx` with:

```tsx
import { ChevronRight, ChevronDown } from "lucide-react";
import { FileIcon } from "./FileIcon";
import type { FileNode } from "@/hooks/useFileTree";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onFileClick: (node: FileNode) => void;
  onFileDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

export function FileTreeNode({
  node,
  depth,
  expandedPaths,
  onToggleExpand,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const paddingLeft = 8 + depth * 16;
  const isExpanded = expandedPaths.has(node.path);

  const handleClick = () => {
    if (node.is_dir) {
      onToggleExpand(node.path);
    } else {
      onFileClick(node);
    }
  };

  const handleDoubleClick = () => {
    if (!node.is_dir) {
      onFileDoubleClick(node);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, node);
  };

  return (
    <>
      <div
        className="flex items-center h-[22px] cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={node.is_dir ? isExpanded : undefined}
        aria-selected={false}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* Expand/collapse chevron for directories */}
        {node.is_dir ? (
          <span className="flex items-center justify-center w-4 h-4 shrink-0">
            {isExpanded ? (
              <ChevronDown
                size={12}
                style={{ color: "var(--color-overlay-1)" }}
              />
            ) : (
              <ChevronRight
                size={12}
                style={{ color: "var(--color-overlay-1)" }}
              />
            )}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/folder icon */}
        <span className="flex items-center justify-center w-4 h-4 mr-1.5 shrink-0">
          <FileIcon
            name={node.name}
            extension={node.extension}
            isDir={node.is_dir}
            isExpanded={isExpanded}
            size={14}
          />
        </span>

        {/* Name */}
        <span
          className="text-xs truncate"
          style={{
            color: node.name.startsWith(".")
              ? "var(--color-overlay-1)"
              : "var(--color-text)",
          }}
        >
          {node.name}
        </span>
      </div>

      {/* Render children if expanded */}
      {node.is_dir && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onFileClick={onFileClick}
              onFileDoubleClick={onFileDoubleClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </>
  );
}
```

Also update `FileExplorer.tsx` to pass `expandedPaths` to `FileTreeNode` instead of `isExpanded`:

In the tree rendering section of `FileExplorer.tsx`, change:

```tsx
{tree.map((node) => (
  <FileTreeNode
    key={node.path}
    node={node}
    depth={0}
    isExpanded={expandedPaths.has(node.path)}
    onToggleExpand={toggleExpand}
    onFileClick={handleFileClick}
    onFileDoubleClick={handleFileDoubleClick}
    onContextMenu={handleContextMenu}
  />
))}
```

to:

```tsx
{tree.map((node) => (
  <FileTreeNode
    key={node.path}
    node={node}
    depth={0}
    expandedPaths={expandedPaths}
    onToggleExpand={toggleExpand}
    onFileClick={handleFileClick}
    onFileDoubleClick={handleFileDoubleClick}
    onContextMenu={handleContextMenu}
  />
))}
```

- [ ] **Step 6: Update PrimarySidebar to use FileExplorer**

Replace `src/components/layout/PrimarySidebar.tsx` with:

```tsx
import { Search, GitBranch, Bot, Settings, Files } from "lucide-react";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";
import { FileExplorer } from "@/components/files/FileExplorer";

const panelConfig: Record<
  ActivityBarItem,
  {
    title: string;
    icon: React.ReactNode;
    description: string;
    component: React.ReactNode | null;
  }
> = {
  explorer: {
    title: "Explorer",
    icon: <Files size={16} />,
    description: "",
    component: null, // Handled separately below
  },
  search: {
    title: "Search",
    icon: <Search size={16} />,
    description: "Project-wide search will appear here.",
    component: null,
  },
  git: {
    title: "Source Control",
    icon: <GitBranch size={16} />,
    description: "Git status and changes will appear here.",
    component: null,
  },
  agents: {
    title: "Agents",
    icon: <Bot size={16} />,
    description: "Agent dashboard will appear here.",
    component: null,
  },
  settings: {
    title: "Settings",
    icon: <Settings size={16} />,
    description: "Application settings will appear here.",
    component: null,
  },
};

export function PrimarySidebar() {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const config = panelConfig[activeItem];

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 h-9 shrink-0 text-xs font-semibold uppercase tracking-wider"
        style={{
          color: "var(--color-subtext-0)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {config.icon}
        <span>{config.title}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeItem === "explorer" ? (
          <FileExplorer />
        ) : (
          <div className="flex items-center justify-center h-full p-4">
            <p
              className="text-center text-xs leading-relaxed"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {config.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Install dialog plugin for folder picker**

```bash
cd C:/CursorProjects/Vantage
npm install @tauri-apps/plugin-dialog
```

Add the Rust plugin to `src-tauri/Cargo.toml`:

```toml
tauri-plugin-dialog = "2"
```

Register the plugin in `src-tauri/src/lib.rs` by adding `.plugin(tauri_plugin_dialog::init())` in the `tauri::Builder` chain, after the existing plugins:

In `lib.rs`, in the `tauri::Builder::default()` chain, add:

```rust
        .plugin(tauri_plugin_dialog::init())
```

right after the `.plugin(tauri_plugin_store::Builder::new().build())` line.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd C:/CursorProjects/Vantage
npx tsc --noEmit
```

Expected: No type errors. If there are errors related to the `invoke` return types not matching, ensure the Rust `cargo check` passed first (which generates `src/bindings.ts`).

- [ ] **Step 9: Commit**

```bash
cd C:/CursorProjects/Vantage
git add src/hooks/useFileTree.ts src/components/files/ src/components/layout/PrimarySidebar.tsx src-tauri/Cargo.toml src-tauri/src/lib.rs package.json package-lock.json
git commit -m "feat: add file explorer with lazy-loading tree, icons, and context menu

Replace PrimarySidebar explorer placeholder with functional FileExplorer.
Lazy-load directory children from Rust backend on expand.
File icons by extension with Catppuccin colors.
Context menu for New File, New Folder, Rename, Delete, Copy Path.
Single-click opens preview tab, double-click opens pinned tab.
Add tauri-plugin-dialog for folder picker."
```

---

### Task 5: Monaco Editor Integration

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json` (npm install)
- Create: `src/components/editor/MonacoEditor.tsx`
- Create: `src/components/editor/EditorTabs.tsx`
- Create: `src/components/editor/monacoTheme.ts`
- Modify: `src/components/layout/EditorArea.tsx`

- [ ] **Step 1: Install Monaco Editor and Vite plugin**

```bash
cd C:/CursorProjects/Vantage
npm install monaco-editor
npm install -D vite-plugin-monaco-editor
```

- [ ] **Step 2: Configure Vite for Monaco workers**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import monacoEditorPlugin from "vite-plugin-monaco-editor";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    (monacoEditorPlugin as any).default({
      languageWorkers: [
        "editorWorkerService",
        "typescript",
        "json",
        "css",
        "html",
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
}));
```

Note: The `(monacoEditorPlugin as any).default(...)` pattern handles the ESM/CJS interop that `vite-plugin-monaco-editor` sometimes requires. If the plugin exports directly (no `.default`), adjust accordingly -- check the actual import at build time.

- [ ] **Step 3: Create Catppuccin Mocha Monaco theme**

Create `src/components/editor/monacoTheme.ts`:

```ts
import type { editor } from "monaco-editor";

/**
 * Catppuccin Mocha theme for Monaco Editor.
 * Maps the CSS custom property hex values directly since Monaco requires
 * hex color strings, not CSS variable references.
 */
export const catppuccinMochaTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    // Keywords: if, else, return, const, let, function, class, import, export
    { token: "keyword", foreground: "cba6f7" }, // mauve
    { token: "keyword.control", foreground: "cba6f7" },
    { token: "keyword.operator", foreground: "89dceb" }, // sky

    // Strings
    { token: "string", foreground: "a6e3a1" }, // green
    { token: "string.escape", foreground: "f5c2e7" }, // pink

    // Numbers
    { token: "number", foreground: "fab387" }, // peach
    { token: "number.float", foreground: "fab387" },
    { token: "number.hex", foreground: "fab387" },

    // Comments
    { token: "comment", foreground: "6c7086", fontStyle: "italic" }, // overlay-0
    { token: "comment.block", foreground: "6c7086", fontStyle: "italic" },

    // Functions
    { token: "entity.name.function", foreground: "89b4fa" }, // blue
    { token: "support.function", foreground: "89b4fa" },

    // Types and classes
    { token: "entity.name.type", foreground: "f9e2af" }, // yellow
    { token: "entity.name.class", foreground: "f9e2af" },
    { token: "support.type", foreground: "f9e2af" },
    { token: "type", foreground: "f9e2af" },

    // Variables
    { token: "variable", foreground: "cdd6f4" }, // text
    { token: "variable.parameter", foreground: "eba0ac" }, // maroon
    { token: "variable.other", foreground: "cdd6f4" },

    // Constants
    { token: "constant", foreground: "fab387" }, // peach
    { token: "constant.language", foreground: "fab387" },
    { token: "constant.numeric", foreground: "fab387" },

    // Operators
    { token: "operator", foreground: "89dceb" }, // sky
    { token: "keyword.operator", foreground: "89dceb" },

    // Properties
    { token: "variable.property", foreground: "b4befe" }, // lavender
    { token: "support.variable.property", foreground: "b4befe" },

    // Decorators / annotations
    { token: "meta.decorator", foreground: "cba6f7" }, // mauve

    // Tags (HTML, JSX)
    { token: "tag", foreground: "89b4fa" }, // blue
    { token: "metatag", foreground: "89b4fa" },

    // Attributes
    { token: "attribute.name", foreground: "f9e2af" }, // yellow
    { token: "attribute.value", foreground: "a6e3a1" }, // green

    // Regex
    { token: "regexp", foreground: "fab387" }, // peach

    // Invalid / error
    { token: "invalid", foreground: "f38ba8" }, // red

    // Punctuation
    { token: "delimiter", foreground: "9399b2" }, // overlay-2
    { token: "delimiter.bracket", foreground: "9399b2" },

    // Markdown
    { token: "markup.heading", foreground: "89b4fa", fontStyle: "bold" },
    { token: "markup.bold", fontStyle: "bold" },
    { token: "markup.italic", fontStyle: "italic" },
    { token: "markup.underline", fontStyle: "underline" },

    // JSON keys
    { token: "string.key.json", foreground: "89b4fa" },
    { token: "string.value.json", foreground: "a6e3a1" },

    // TOML
    { token: "type.identifier.toml", foreground: "89b4fa" },

    // CSS
    { token: "attribute.name.css", foreground: "b4befe" },
    { token: "attribute.value.css", foreground: "a6e3a1" },
  ],
  colors: {
    // Editor background and foreground
    "editor.background": "#1e1e2e",
    "editor.foreground": "#cdd6f4",

    // Selection
    "editor.selectionBackground": "#45475a80",
    "editor.inactiveSelectionBackground": "#45475a40",
    "editor.selectionHighlightBackground": "#45475a60",

    // Cursor
    "editorCursor.foreground": "#f5e0dc",

    // Line highlight
    "editor.lineHighlightBackground": "#31324420",
    "editor.lineHighlightBorder": "#31324400",

    // Line numbers
    "editorLineNumber.foreground": "#585b70",
    "editorLineNumber.activeForeground": "#cdd6f4",

    // Indent guides
    "editorIndentGuide.background": "#31324480",
    "editorIndentGuide.activeBackground": "#45475a",

    // Brackets
    "editorBracketMatch.background": "#45475a40",
    "editorBracketMatch.border": "#89b4fa80",

    // Whitespace
    "editorWhitespace.foreground": "#31324480",

    // Gutter
    "editorGutter.background": "#1e1e2e",

    // Minimap
    "minimap.background": "#181825",
    "minimapSlider.background": "#45475a40",
    "minimapSlider.hoverBackground": "#45475a60",
    "minimapSlider.activeBackground": "#45475a80",

    // Scrollbar
    "scrollbarSlider.background": "#45475a40",
    "scrollbarSlider.hoverBackground": "#45475a80",
    "scrollbarSlider.activeBackground": "#45475aA0",

    // Widget (find/replace, etc.)
    "editorWidget.background": "#181825",
    "editorWidget.border": "#313244",

    // Suggest / autocomplete popup
    "editorSuggestWidget.background": "#181825",
    "editorSuggestWidget.border": "#313244",
    "editorSuggestWidget.selectedBackground": "#313244",
    "editorSuggestWidget.highlightForeground": "#89b4fa",

    // Hover
    "editorHoverWidget.background": "#181825",
    "editorHoverWidget.border": "#313244",

    // Peek view
    "peekView.border": "#89b4fa",
    "peekViewEditor.background": "#181825",
    "peekViewResult.background": "#181825",

    // Overview ruler
    "editorOverviewRuler.border": "#313244",

    // Find match highlighting
    "editor.findMatchBackground": "#f9e2af40",
    "editor.findMatchHighlightBackground": "#f9e2af20",
  },
};
```

- [ ] **Step 4: Create the Monaco Editor wrapper component**

Create `src/components/editor/MonacoEditor.tsx`:

```tsx
import { useEffect, useRef, useCallback } from "react";
import * as monaco from "monaco-editor";
import { catppuccinMochaTheme } from "./monacoTheme";
import { useSettingsStore } from "@/stores/settings";
import { useEditorStore } from "@/stores/editor";

// Register theme once at module level
let themeRegistered = false;
function ensureThemeRegistered() {
  if (!themeRegistered) {
    monaco.editor.defineTheme("catppuccin-mocha", catppuccinMochaTheme);
    themeRegistered = true;
  }
}

interface MonacoEditorProps {
  /** File path used as the editor model URI */
  filePath: string;
  /** Monaco language ID */
  language: string;
  /** Current file content */
  value: string;
  /** Called when user edits content */
  onChange: (value: string) => void;
  /** Read-only mode */
  readOnly?: boolean;
}

export function MonacoEditor({
  filePath,
  language,
  value,
  onChange,
  readOnly = false,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Read settings
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSizeEditor = useSettingsStore((s) => s.fontSizeEditor);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const minimapEnabled = useSettingsStore((s) => s.minimap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbers);

  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const pinTab = useEditorStore((s) => s.pinTab);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    ensureThemeRegistered();

    // Create or get existing model for this file path
    const uri = monaco.Uri.file(filePath);
    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(value, language, uri);
    } else {
      // If model exists but language differs, set it
      if (model.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(model, language);
      }
      // Update content only if it differs (avoids cursor jump)
      if (model.getValue() !== value) {
        model.setValue(value);
      }
    }

    const editor = monaco.editor.create(containerRef.current, {
      model,
      theme: "catppuccin-mocha",
      fontFamily,
      fontSize: fontSizeEditor,
      tabSize,
      insertSpaces,
      wordWrap: wordWrap ? "on" : "off",
      minimap: { enabled: minimapEnabled },
      lineNumbers: lineNumbers ? "on" : "off",
      readOnly,
      automaticLayout: true, // auto-resize when container changes
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderLineHighlight: "line",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      padding: { top: 8 },
      overviewRulerLanes: 0,
      fixedOverflowWidgets: true,
    });

    editorRef.current = editor;

    // Listen for content changes
    const changeDisposable = editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      onChangeRef.current(newValue);
    });

    // Listen for cursor position changes
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });

    // Pin preview tab on first edit
    const tabId = filePath.replace(/\\/g, "/").replace(/^([A-Z]):/, (m) => m.toLowerCase());
    const editDisposable = editor.onDidChangeModelContent(() => {
      pinTab(tabId);
    });

    // Focus the editor
    editor.focus();

    return () => {
      changeDisposable.dispose();
      cursorDisposable.dispose();
      editDisposable.dispose();
      editor.dispose();
      editorRef.current = null;
      // Note: we do NOT dispose the model here because it may be reused
      // if the user switches tabs and comes back. Models are disposed when
      // the tab is closed (see EditorArea).
    };
  }, [filePath]); // Re-create editor when file changes

  // Update editor options when settings change
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.updateOptions({
      fontFamily,
      fontSize: fontSizeEditor,
      tabSize,
      insertSpaces,
      wordWrap: wordWrap ? "on" : "off",
      minimap: { enabled: minimapEnabled },
      lineNumbers: lineNumbers ? "on" : "off",
      readOnly,
    });
  }, [fontFamily, fontSizeEditor, tabSize, insertSpaces, wordWrap, minimapEnabled, lineNumbers, readOnly]);

  // Sync external value changes (e.g., file reload from disk)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    // Only update if the value differs from current model content
    // This avoids cursor jumps during normal typing
    if (model.getValue() !== value) {
      // Preserve cursor position
      const position = editor.getPosition();
      model.setValue(value);
      if (position) {
        editor.setPosition(position);
      }
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      data-allow-select="true"
    />
  );
}
```

- [ ] **Step 5: Create the editor tabs component**

Create `src/components/editor/EditorTabs.tsx`:

```tsx
import { X, FileCode } from "lucide-react";
import { useEditorStore, type EditorTab } from "@/stores/editor";
import { FileIcon } from "@/components/files/FileIcon";

export function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const pinTab = useEditorStore((s) => s.pinTab);

  if (tabs.length === 0) return null;

  const handleTabClick = (tab: EditorTab) => {
    setActiveTab(tab.id);
  };

  const handleTabClose = (e: React.MouseEvent, tab: EditorTab) => {
    e.stopPropagation();
    closeTab(tab.id);
  };

  const handleTabDoubleClick = (tab: EditorTab) => {
    // Double-click pins a preview tab
    if (tab.isPreview) {
      pinTab(tab.id);
    }
  };

  const handleMiddleClick = (e: React.MouseEvent, tab: EditorTab) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab.id);
    }
  };

  return (
    <div
      className="flex items-center h-9 shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-mantle)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const fileName = tab.name;
        const ext = tab.path.split(".").pop() ?? null;

        return (
          <div
            key={tab.id}
            className="flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer shrink-0 transition-colors group"
            style={{
              backgroundColor: isActive
                ? "var(--color-base)"
                : "transparent",
              color: isActive
                ? "var(--color-text)"
                : "var(--color-subtext-0)",
              borderRight: "1px solid var(--color-surface-0)",
              fontStyle: tab.isPreview ? "italic" : "normal",
            }}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleTabClick(tab)}
            onDoubleClick={() => handleTabDoubleClick(tab)}
            onMouseDown={(e) => handleMiddleClick(e, tab)}
          >
            <FileIcon
              name={fileName}
              extension={ext}
              isDir={false}
              size={14}
            />
            <span>{fileName}</span>

            {/* Dirty indicator OR close button */}
            {tab.isDirty ? (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: "var(--color-text)" }}
                title="Unsaved changes"
              />
            ) : (
              <button
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-1)] transition-all"
                style={{ color: "var(--color-overlay-1)" }}
                onClick={(e) => handleTabClose(e, tab)}
                aria-label={`Close ${fileName}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Replace EditorArea with real editor integration**

Replace `src/components/layout/EditorArea.tsx` with:

```tsx
import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode } from "lucide-react";
import { useEditorStore } from "@/stores/editor";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { EditorTabs } from "@/components/editor/EditorTabs";
import * as monaco from "monaco-editor";

function Breadcrumbs() {
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });

  if (!activeTab) return null;

  const segments = activeTab.path.split("/");

  return (
    <div
      className="flex items-center h-6 px-3 text-xs shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-subtext-0)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center shrink-0">
          {i > 0 && (
            <span className="mx-1" style={{ color: "var(--color-overlay-0)" }}>
              /
            </span>
          )}
          <span
            style={{
              color:
                i === segments.length - 1
                  ? "var(--color-text)"
                  : "var(--color-subtext-0)",
            }}
          >
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: "var(--color-surface-0)" }}
      >
        <FileCode size={32} style={{ color: "var(--color-blue)" }} />
      </div>
      <div className="text-center">
        <h2
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--color-text)" }}
        >
          Welcome to Vantage
        </h2>
        <p
          className="text-xs max-w-md"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Open a project folder to get started. Use the Explorer (Ctrl+Shift+E)
          to browse files, or press Ctrl+Shift+P for the Command Palette.
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" />
        <KeyboardHint keys="Ctrl+Shift+E" label="Explorer" />
        <KeyboardHint keys="Ctrl+`" label="Terminal" />
      </div>
    </div>
  );
}

function KeyboardHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <kbd
        className="px-1.5 py-0.5 rounded text-xs font-mono"
        style={{
          backgroundColor: "var(--color-surface-0)",
          color: "var(--color-subtext-1)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {keys}
      </kbd>
      <span style={{ color: "var(--color-overlay-1)" }}>{label}</span>
    </div>
  );
}

export function EditorArea() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateContent = useEditorStore((s) => s.updateContent);
  const markSaved = useEditorStore((s) => s.markSaved);
  const closeTab = useEditorStore((s) => s.closeTab);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Handle Ctrl+S to save the active file
  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return;
    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      markSaved(activeTab.id, activeTab.content);
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  }, [activeTab, markSaved]);

  // Handle Ctrl+W to close active tab
  const handleCloseActiveTab = useCallback(() => {
    if (activeTab) {
      closeTab(activeTab.id);
    }
  }, [activeTab, closeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleSave]);

  // Dispose Monaco model when a tab is closed
  useEffect(() => {
    return () => {
      // Cleanup: dispose all models for tabs that no longer exist
      // This runs on unmount, not on every render
    };
  }, []);

  const handleContentChange = useCallback(
    (newValue: string) => {
      if (activeTab) {
        updateContent(activeTab.id, newValue);
      }
    },
    [activeTab, updateContent]
  );

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
      data-allow-select="true"
    >
      {/* Tab bar */}
      <EditorTabs />

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Editor content */}
      {activeTab ? (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeTab.id}
            filePath={activeTab.path}
            language={activeTab.language}
            value={activeTab.content}
            onChange={handleContentChange}
          />
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify TypeScript compiles and editor loads**

```bash
cd C:/CursorProjects/Vantage
npx tsc --noEmit
```

Expected: No type errors. Monaco Editor types should resolve from the `monaco-editor` package.

- [ ] **Step 8: Commit**

```bash
cd C:/CursorProjects/Vantage
git add vite.config.ts package.json package-lock.json src/components/editor/ src/components/layout/EditorArea.tsx
git commit -m "feat: integrate Monaco Editor with Catppuccin Mocha theme and tab management

Add Monaco Editor with full syntax highlighting, minimap, and bracket pairs.
Create Catppuccin Mocha theme with all Vantage color mappings.
Replace placeholder EditorArea with real editor, tabs, and breadcrumbs.
Configure Vite plugin for Monaco web workers.
Ctrl+S saves active file to disk via Rust backend."
```

---

### Task 6: Terminal Integration

**Files:**
- Modify: `package.json` (npm install)
- Create: `src/hooks/useTerminal.ts`
- Create: `src/components/terminal/TerminalInstance.tsx`
- Create: `src/components/terminal/TerminalTabs.tsx`
- Create: `src/components/terminal/terminalTheme.ts`
- Modify: `src/components/layout/PanelArea.tsx`

- [ ] **Step 1: Install xterm.js packages**

```bash
cd C:/CursorProjects/Vantage
npm install @xterm/xterm @xterm/addon-webgl @xterm/addon-fit @xterm/addon-search @xterm/addon-web-links
```

- [ ] **Step 2: Create terminal color theme**

Create `src/components/terminal/terminalTheme.ts`:

```ts
import type { ITheme } from "@xterm/xterm";

/**
 * Catppuccin Mocha theme for xterm.js.
 * Matches the CSS custom properties defined in index.css.
 */
export const catppuccinMochaTerminalTheme: ITheme = {
  background: "#1e1e2e", // base
  foreground: "#cdd6f4", // text
  cursor: "#f5e0dc", // rosewater
  cursorAccent: "#1e1e2e", // base
  selectionBackground: "#45475a80", // surface-1 + alpha
  selectionForeground: undefined, // use default
  selectionInactiveBackground: "#45475a40",

  // Normal colors (0-7)
  black: "#45475a", // surface-1
  red: "#f38ba8", // red
  green: "#a6e3a1", // green
  yellow: "#f9e2af", // yellow
  blue: "#89b4fa", // blue
  magenta: "#f5c2e7", // pink
  cyan: "#94e2d5", // teal
  white: "#bac2de", // subtext-1

  // Bright colors (8-15)
  brightBlack: "#585b70", // surface-2
  brightRed: "#f38ba8", // red
  brightGreen: "#a6e3a1", // green
  brightYellow: "#f9e2af", // yellow
  brightBlue: "#89b4fa", // blue
  brightMagenta: "#f5c2e7", // pink
  brightCyan: "#94e2d5", // teal
  brightWhite: "#a6adc8", // subtext-0
};
```

- [ ] **Step 3: Create the terminal hook**

Create `src/hooks/useTerminal.ts`:

```ts
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { catppuccinMochaTerminalTheme } from "@/components/terminal/terminalTheme";
import { useSettingsStore } from "@/stores/settings";

import "@xterm/xterm/css/xterm.css";

interface UseTerminalOptions {
  /** Shell executable path */
  shellPath: string;
  /** Shell arguments */
  shellArgs: string[];
  /** Working directory */
  cwd?: string;
}

interface UseTerminalReturn {
  /** Ref to attach to the container div */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The xterm.js Terminal instance */
  terminalRef: React.RefObject<Terminal | null>;
  /** Fit the terminal to its container */
  fit: () => void;
  /** Search within the terminal */
  search: (query: string) => void;
  /** Clear search highlights */
  clearSearch: () => void;
}

export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const ptyRef = useRef<any>(null); // tauri-pty instance

  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const terminalScrollback = useSettingsStore((s) => s.terminalScrollback);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily,
      fontSize: terminalFontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: terminalScrollback,
      theme: catppuccinMochaTerminalTheme,
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);

    // Try WebGL renderer, fall back to DOM
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        // WebGL context lost -- the DOM renderer is the automatic fallback
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, DOM renderer works fine
    }

    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Connect to PTY via tauri-pty
    // The tauri-pty package provides a `spawn` function that creates
    // a PTY process and returns a handle with onData/write/resize methods
    let cleanupPty: (() => void) | null = null;

    (async () => {
      try {
        const { spawn } = await import("tauri-pty");

        const pty = spawn(options.shellPath, options.shellArgs, {
          cols: terminal.cols,
          rows: terminal.rows,
          cwd: options.cwd,
        });

        ptyRef.current = pty;

        // PTY -> Terminal (data from shell to display)
        const dataDisposable = pty.onData((data: string) => {
          terminal.write(data);
        });

        // Terminal -> PTY (user keystrokes to shell)
        const inputDisposable = terminal.onData((data: string) => {
          pty.write(data);
        });

        // Terminal resize -> PTY resize
        const resizeDisposable = terminal.onResize(
          ({ cols, rows }: { cols: number; rows: number }) => {
            pty.resize(cols, rows);
          }
        );

        // PTY exit
        const exitDisposable = pty.onExit(
          ({ exitCode }: { exitCode: number }) => {
            terminal.writeln(
              `\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`
            );
          }
        );

        cleanupPty = () => {
          dataDisposable.dispose();
          inputDisposable.dispose();
          resizeDisposable.dispose();
          exitDisposable.dispose();
          pty.kill();
        };
      } catch (e) {
        terminal.writeln(
          `\x1b[31mFailed to spawn terminal: ${e}\x1b[0m`
        );
        terminal.writeln(
          "\x1b[90mMake sure tauri-plugin-pty is properly configured.\x1b[0m"
        );
      }
    })();

    return () => {
      if (cleanupPty) cleanupPty();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      ptyRef.current = null;
    };
  }, [options.shellPath, options.cwd]); // Re-create if shell or cwd changes

  // Update font settings without recreating the terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = terminalFontSize;
    fitAddonRef.current?.fit();
  }, [fontFamily, terminalFontSize]);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const search = useCallback((query: string) => {
    searchAddonRef.current?.findNext(query);
  }, []);

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
  }, []);

  return {
    containerRef,
    terminalRef,
    fit,
    search,
    clearSearch,
  };
}
```

- [ ] **Step 4: Create the terminal instance component**

Create `src/components/terminal/TerminalInstance.tsx`:

```tsx
import { useEffect, useCallback } from "react";
import { useTerminal } from "@/hooks/useTerminal";

interface TerminalInstanceProps {
  /** Shell executable path */
  shellPath: string;
  /** Shell arguments */
  shellArgs: string[];
  /** Working directory */
  cwd?: string;
  /** Whether this terminal is the currently visible one */
  isVisible: boolean;
}

export function TerminalInstance({
  shellPath,
  shellArgs,
  cwd,
  isVisible,
}: TerminalInstanceProps) {
  const { containerRef, terminalRef, fit } = useTerminal({
    shellPath,
    shellArgs,
    cwd,
  });

  // Re-fit when becoming visible or when container resizes
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure container has its final dimensions
      const timer = setTimeout(() => fit(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fit]);

  // Listen for container resize via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isVisible) {
        fit();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [isVisible, fit]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        display: isVisible ? "block" : "none",
      }}
      data-allow-select="true"
    />
  );
}
```

- [ ] **Step 5: Create the terminal tabs component**

Create `src/components/terminal/TerminalTabs.tsx`:

```tsx
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Maximize2,
  ChevronDown,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { TerminalInstance } from "./TerminalInstance";

interface ShellInfo {
  name: string;
  path: string;
  args: string[];
  is_default: boolean;
}

interface TerminalTab {
  id: string;
  label: string;
  shellName: string;
  shellPath: string;
  shellArgs: string[];
  cwd?: string;
}

let nextTerminalId = 1;

export function TerminalPanel() {
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [showShellPicker, setShowShellPicker] = useState(false);

  // Fetch available shells on mount
  useEffect(() => {
    invoke<ShellInfo[]>("list_shells")
      .then((shellList) => {
        setShells(shellList);
        // Create initial terminal with default shell
        if (shellList.length > 0) {
          const defaultShell =
            shellList.find((s) => s.is_default) ?? shellList[0];
          createTerminal(defaultShell);
        }
      })
      .catch((err) => {
        console.error("Failed to list shells:", err);
        // Fallback: create a PowerShell terminal
        createTerminal({
          name: "PowerShell",
          path: "powershell.exe",
          args: ["-NoLogo"],
          is_default: true,
        });
      });
  }, []);

  const createTerminal = useCallback(
    (shell: ShellInfo, cwd?: string) => {
      const id = `term-${nextTerminalId++}`;
      const newTab: TerminalTab = {
        id,
        label: `Terminal ${nextTerminalId - 1}`,
        shellName: shell.name,
        shellPath: shell.path,
        shellArgs: shell.args,
        cwd,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      setShowShellPicker(false);
    },
    []
  );

  const closeTerminal = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== id);
        if (activeTabId === id && newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }
        return newTabs;
      });
    },
    [activeTabId]
  );

  const handleNewTerminal = useCallback(() => {
    if (shells.length > 1) {
      setShowShellPicker((prev) => !prev);
    } else if (shells.length === 1) {
      createTerminal(shells[0]);
    }
  }, [shells, createTerminal]);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: "var(--color-base)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between h-9 shrink-0 px-2"
        style={{ backgroundColor: "var(--color-mantle)" }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-t cursor-pointer transition-colors group shrink-0"
              style={{
                backgroundColor:
                  tab.id === activeTabId
                    ? "var(--color-base)"
                    : "transparent",
                color:
                  tab.id === activeTabId
                    ? "var(--color-text)"
                    : "var(--color-subtext-0)",
              }}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => setActiveTabId(tab.id)}
            >
              <TerminalIcon size={12} />
              <span>{tab.label}</span>
              <span
                className="text-xs"
                style={{ color: "var(--color-overlay-0)" }}
              >
                ({tab.shellName})
              </span>
              <button
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-1)] transition-all ml-1"
                style={{ color: "var(--color-overlay-1)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(tab.id);
                }}
                aria-label={`Close ${tab.label}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* New terminal button */}
          <div className="relative">
            <button
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={handleNewTerminal}
              aria-label="New Terminal"
              title="New Terminal (Ctrl+Shift+`)"
            >
              <Plus size={14} />
            </button>

            {/* Shell picker dropdown */}
            {showShellPicker && (
              <div
                className="absolute top-full left-0 mt-1 rounded-md shadow-lg py-1 z-50 min-w-[160px]"
                style={{
                  backgroundColor: "var(--color-surface-0)",
                  border: "1px solid var(--color-surface-1)",
                }}
              >
                {shells.map((shell) => (
                  <button
                    key={shell.path}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-surface-1)] transition-colors"
                    style={{ color: "var(--color-text)" }}
                    onClick={() => createTerminal(shell)}
                  >
                    <TerminalIcon size={12} />
                    <span>{shell.name}</span>
                    {shell.is_default && (
                      <span
                        className="text-xs ml-auto"
                        style={{ color: "var(--color-overlay-0)" }}
                      >
                        default
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel actions */}
        <div className="flex items-center gap-0.5">
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="Maximize Panel"
          >
            <Maximize2 size={12} />
          </button>
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={togglePanel}
            aria-label="Close Panel (Ctrl+J)"
            title="Close Panel (Ctrl+J)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Close shell picker when clicking outside */}
      {showShellPicker && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowShellPicker(false)}
        />
      )}

      {/* Terminal instances */}
      <div className="flex-1 overflow-hidden">
        {tabs.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            No terminals open. Click + to create one.
          </div>
        ) : (
          tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              shellPath={tab.shellPath}
              shellArgs={tab.shellArgs}
              cwd={tab.cwd}
              isVisible={tab.id === activeTabId}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Replace PanelArea with the real terminal panel**

Replace `src/components/layout/PanelArea.tsx` with:

```tsx
import { TerminalPanel } from "@/components/terminal/TerminalTabs";

export function PanelArea() {
  return <TerminalPanel />;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd C:/CursorProjects/Vantage
npx tsc --noEmit
```

Expected: No type errors. The `tauri-pty` import type may need `@ts-ignore` if its types are not published; check the package's type definitions and add a `src/types/tauri-pty.d.ts` declaration file if needed:

```ts
// src/types/tauri-pty.d.ts
declare module "tauri-pty" {
  interface PtyOptions {
    cols: number;
    rows: number;
    cwd?: string;
  }

  interface PtyProcess {
    onData(callback: (data: string) => void): { dispose(): void };
    onExit(callback: (event: { exitCode: number }) => void): { dispose(): void };
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
  }

  export function spawn(
    shell: string,
    args: string[],
    options: PtyOptions
  ): PtyProcess;
}
```

- [ ] **Step 8: Commit**

```bash
cd C:/CursorProjects/Vantage
git add package.json package-lock.json src/hooks/useTerminal.ts src/components/terminal/ src/components/layout/PanelArea.tsx src/types/
git commit -m "feat: integrate xterm.js terminal with ConPTY via tauri-plugin-pty

Add xterm.js 5.x with WebGL renderer and Catppuccin Mocha colors.
Connect to Rust PTY backend via tauri-pty for real shell interaction.
Support multiple terminal tabs with shell type selector.
Auto-detect PowerShell 7, Windows PowerShell, Git Bash, and CMD.
Replace PanelArea placeholder with functional terminal panel."
```

---

### Task 7: Wire Everything Together

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/hooks/useKeybindings.ts`
- Modify: `src/components/layout/IDELayout.tsx`

- [ ] **Step 1: Update StatusBar to read from editor store**

Replace `src/components/layout/StatusBar.tsx` with:

```tsx
import {
  GitBranch,
  AlertTriangle,
  XCircle,
  Zap,
  CircleDollarSign,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor";

export function StatusBar() {
  const cursorPosition = useEditorStore((s) => s.cursorPosition);
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });

  // Map language IDs to display names
  const languageDisplayName = activeTab
    ? getLanguageDisplayName(activeTab.language)
    : "Plain Text";

  return (
    <div
      className="flex items-center justify-between h-6 px-2 text-xs shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        color: "var(--color-subtext-0)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
      role="status"
      aria-label="Status Bar"
    >
      {/* Left side - workspace scoped */}
      <div className="flex items-center gap-3">
        {/* Git branch */}
        <button
          className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
          aria-label="Git branch: main"
        >
          <GitBranch size={12} />
          <span>main</span>
        </button>

        {/* Errors and warnings */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
            aria-label="0 errors"
          >
            <XCircle size={12} style={{ color: "var(--color-red)" }} />
            <span>0</span>
          </button>
          <button
            className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
            aria-label="0 warnings"
          >
            <AlertTriangle size={12} style={{ color: "var(--color-yellow)" }} />
            <span>0</span>
          </button>
        </div>
      </div>

      {/* Right side - file/session scoped */}
      <div className="flex items-center gap-3">
        {/* Line and column */}
        <span>
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>

        {/* Language */}
        <button className="hover:text-[var(--color-text)] transition-colors">
          {languageDisplayName}
        </button>

        {/* Claude session status */}
        <div className="flex items-center gap-1">
          <Zap size={12} style={{ color: "var(--color-green)" }} />
          <span>Ready</span>
        </div>

        {/* Cost */}
        <div className="flex items-center gap-1">
          <CircleDollarSign size={12} />
          <span>$0.00</span>
        </div>

        {/* Model */}
        <span style={{ color: "var(--color-overlay-1)" }}>
          claude-opus-4-6
        </span>
      </div>
    </div>
  );
}

function getLanguageDisplayName(languageId: string): string {
  const names: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    rust: "Rust",
    python: "Python",
    json: "JSON",
    toml: "TOML",
    yaml: "YAML",
    markdown: "Markdown",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    xml: "XML",
    shell: "Shell Script",
    powershell: "PowerShell",
    bat: "Batch",
    sql: "SQL",
    go: "Go",
    java: "Java",
    c: "C",
    cpp: "C++",
    csharp: "C#",
    ruby: "Ruby",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    lua: "Lua",
    r: "R",
    dockerfile: "Dockerfile",
    graphql: "GraphQL",
    ini: "INI",
    plaintext: "Plain Text",
  };
  return names[languageId] ?? languageId;
}
```

- [ ] **Step 2: Update keybindings to use editor store actions**

Replace `src/hooks/useKeybindings.ts` with:

```ts
import { useEffect, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface Keybinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeybindings() {
  const togglePrimarySidebar = useLayoutStore((s) => s.togglePrimarySidebar);
  const toggleSecondarySidebar = useLayoutStore(
    (s) => s.toggleSecondarySidebar
  );
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setActiveActivityBarItem = useLayoutStore(
    (s) => s.setActiveActivityBarItem
  );

  const closeTab = useEditorStore((s) => s.closeTab);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const handleCloseActiveTab = useCallback(() => {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  }, [activeTabId, closeTab]);

  const handleNextTab = useCallback(() => {
    if (tabs.length === 0 || !activeTabId) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const handlePrevTab = useCallback(() => {
    if (tabs.length === 0 || !activeTabId) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[prevIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const handleSave = useCallback(async () => {
    const state = useEditorStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!activeTab || !activeTab.isDirty) return;

    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      state.markSaved(activeTab.id, activeTab.content);
    } catch (e) {
      toast.error("Failed to save file", {
        description: String(e),
      });
    }
  }, []);

  const keybindings: Keybinding[] = [
    // Layout toggles
    {
      key: "b",
      ctrl: true,
      action: togglePrimarySidebar,
      description: "Toggle Primary Sidebar",
    },
    {
      key: "j",
      ctrl: true,
      action: togglePanel,
      description: "Toggle Panel",
    },
    {
      key: "`",
      ctrl: true,
      action: togglePanel,
      description: "Toggle Terminal Panel",
    },
    {
      key: "b",
      ctrl: true,
      shift: true,
      action: toggleSecondarySidebar,
      description: "Toggle Secondary Sidebar (Chat)",
    },

    // Command palette placeholder
    {
      key: "p",
      ctrl: true,
      shift: true,
      action: () => {
        toast("Command Palette", {
          description: "Command palette will be implemented in Phase 3.",
        });
      },
      description: "Open Command Palette",
    },

    // Activity bar focus shortcuts
    {
      key: "e",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("explorer"),
      description: "Focus File Explorer",
    },
    {
      key: "f",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("search"),
      description: "Focus Search",
    },
    {
      key: "g",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("git"),
      description: "Focus Source Control",
    },
    {
      key: "a",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("agents"),
      description: "Focus Agents",
    },

    // Settings
    {
      key: ",",
      ctrl: true,
      action: () => {
        setActiveActivityBarItem("settings");
      },
      description: "Open Settings",
    },

    // File save
    {
      key: "s",
      ctrl: true,
      action: handleSave,
      description: "Save Active File",
    },

    // Tab management
    {
      key: "w",
      ctrl: true,
      action: handleCloseActiveTab,
      description: "Close Active Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      action: handleNextTab,
      description: "Next Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      shift: true,
      action: handlePrevTab,
      description: "Previous Tab",
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const binding of keybindings) {
        const ctrlMatch = binding.ctrl ? event.ctrlKey : !event.ctrlKey;
        const shiftMatch = binding.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = binding.alt ? event.altKey : !event.altKey;
        const keyMatch =
          event.key.toLowerCase() === binding.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          event.preventDefault();
          event.stopPropagation();
          binding.action();
          return;
        }
      }
    },
    [keybindings]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleKeyDown]);
}
```

- [ ] **Step 3: Verify everything compiles**

```bash
cd C:/CursorProjects/Vantage
npx tsc --noEmit
```

```bash
cd C:/CursorProjects/Vantage/src-tauri
cargo check
```

Expected: Both frontend and backend compile cleanly.

- [ ] **Step 4: Commit**

```bash
cd C:/CursorProjects/Vantage
git add src/components/layout/StatusBar.tsx src/hooks/useKeybindings.ts
git commit -m "feat: wire StatusBar to editor store and update keybindings for tab management

StatusBar now shows live cursor position and language from active editor tab.
Ctrl+S saves active file, Ctrl+W closes active tab.
Ctrl+Tab and Ctrl+Shift+Tab cycle through editor tabs.
Update command palette toast to reference Phase 3."
```

---

### Task 8: Integration Testing

**Files:**
- No new files -- verification steps only

- [ ] **Step 1: Verify Rust backend compiles with all crates**

```bash
cd C:/CursorProjects/Vantage/src-tauri
cargo check
```

Expected: Clean compilation. All crates (ignore, notify, notify-debouncer-full, tauri-plugin-pty, tauri-plugin-dialog) resolve and compile.

- [ ] **Step 2: Verify frontend compiles with no type errors**

```bash
cd C:/CursorProjects/Vantage
npx tsc --noEmit
```

Expected: Zero type errors. If there are errors related to `tauri-pty` types, ensure `src/types/tauri-pty.d.ts` exists with the type declarations from Task 6 Step 7.

- [ ] **Step 3: Run all Vitest tests**

```bash
cd C:/CursorProjects/Vantage
npx vitest run
```

Expected: All tests pass, including the new editor store tests from Task 3 and any existing layout/settings store tests from Phase 1.

- [ ] **Step 4: Verify production build succeeds**

```bash
cd C:/CursorProjects/Vantage
npm run build
```

Expected: Vite production build completes. Monaco Editor workers are bundled correctly. No missing module errors.

Also verify the Rust side builds in release mode:

```bash
cd C:/CursorProjects/Vantage/src-tauri
cargo build
```

Expected: Rust compiles in debug mode. The binary includes all plugins.

- [ ] **Step 5: Manual smoke test checklist**

Run the application with `npm run tauri dev` and verify each feature:

1. **File Explorer:**
   - [ ] Click "Open Folder" in the explorer, select a project directory
   - [ ] File tree loads with correct icons
   - [ ] Expanding a directory lazy-loads its children
   - [ ] .gitignore files are respected (node_modules hidden if .gitignore includes it)
   - [ ] Right-click shows context menu (New File, New Folder, Rename, Delete, Copy Path)
   - [ ] Creating a new file via context menu works

2. **Monaco Editor:**
   - [ ] Single-click a file in explorer opens it as a preview tab (italic name)
   - [ ] Double-click a file pins the tab (normal font)
   - [ ] Syntax highlighting works for TypeScript, JSON, Rust, Markdown
   - [ ] Editing a file shows the dirty indicator (dot) on the tab
   - [ ] Ctrl+S saves the file (dirty indicator disappears)
   - [ ] Ctrl+W closes the active tab
   - [ ] Ctrl+Tab switches to the next tab
   - [ ] Breadcrumbs show the file path
   - [ ] Status bar shows cursor position (Ln/Col) and language

3. **Terminal:**
   - [ ] Terminal panel shows with a shell running (PowerShell or detected default)
   - [ ] Typing in the terminal sends input to the shell
   - [ ] Shell output renders correctly (colors, cursor positioning)
   - [ ] Click "+" to open a new terminal tab
   - [ ] Shell picker shows available shells (PowerShell, Git Bash, CMD)
   - [ ] Closing a terminal tab works
   - [ ] Terminal resizes when panel is resized

4. **Integration:**
   - [ ] File watcher detects external changes (edit a file in another editor, tree updates)
   - [ ] All Phase 1 keybindings still work (Ctrl+B, Ctrl+J, Ctrl+Shift+E, etc.)
   - [ ] Panel resizing works for all areas (sidebar, editor, terminal)

- [ ] **Step 6: Final commit for Phase 2**

If any fixes were needed during smoke testing, commit them:

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "fix: Phase 2 integration fixes from smoke testing

Address any issues found during manual integration testing
of file explorer, Monaco editor, and terminal components."
```

---

## Summary

After completing all 8 tasks, Vantage has:

| Feature | Before (Phase 1) | After (Phase 2) |
|---------|------------------|-----------------|
| File Explorer | Placeholder text | Lazy-loading tree with icons, context menu, .gitignore support |
| Code Editor | Welcome screen | Monaco Editor with Catppuccin theme, tabs, dirty tracking, Ctrl+S save |
| Terminal | Animated cursor placeholder | xterm.js + ConPTY with multiple tabs, shell detection |
| Status Bar | Hardcoded values | Live cursor position, language from active file |
| Keybindings | Toast placeholders for Ctrl+W, Ctrl+Tab | Functional tab management, file save |

**Rust backend additions:**
- `src-tauri/src/files/` -- tree builder (ignore crate), file watcher (notify), CRUD operations
- `src-tauri/src/terminal/` -- shell detection, PTY plugin registration
- 13 new Tauri commands registered with tauri-specta

**Frontend additions:**
- `src/stores/editor.ts` -- Zustand store for editor tabs, dirty state, cursor position
- `src/components/files/` -- FileExplorer, FileTreeNode, FileIcon
- `src/components/editor/` -- MonacoEditor, EditorTabs, monacoTheme
- `src/components/terminal/` -- TerminalInstance, TerminalTabs, terminalTheme
- `src/hooks/useFileTree.ts`, `src/hooks/useTerminal.ts`
