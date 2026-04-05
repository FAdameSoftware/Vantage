//! Workspace file I/O commands.
//!
//! Reads and writes workspace state files under `~/.vantage/workspaces/`.
//! The frontend encodes the project path into a base64url filename and
//! passes just the filename to these commands.

use std::fs;
use std::path::PathBuf;

/// Get the base directory for all Vantage workspace data: `~/.vantage/workspaces/`
fn workspaces_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".vantage").join("workspaces"))
}

/// Read a workspace file by filename (e.g., "abc123.json" or "recent-projects.json").
/// Returns `None` if the file does not exist.
#[tauri::command]
#[specta::specta]
pub fn read_workspace_file(file_name: String) -> Result<Option<String>, String> {
    let dir = workspaces_dir()?;
    let path = dir.join(&file_name);

    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Failed to read workspace file '{}': {}", file_name, e))
}

/// Write a workspace file by filename. Creates the directory tree if needed.
#[tauri::command]
#[specta::specta]
pub fn write_workspace_file(file_name: String, content: String) -> Result<(), String> {
    let dir = workspaces_dir()?;

    // Ensure the directory exists
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create workspaces directory: {}", e))?;
    }

    let path = dir.join(&file_name);
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write workspace file '{}': {}", file_name, e))
}

/// List all `.json` files in the workspaces directory.
/// Returns filenames only (not full paths).
#[tauri::command]
#[specta::specta]
pub fn list_workspace_files() -> Result<Vec<String>, String> {
    let dir = workspaces_dir()?;

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read workspaces directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    if let Some(name) = path.file_name() {
                        files.push(name.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Ok(files)
}
