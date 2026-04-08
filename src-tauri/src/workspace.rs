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

/// Validate that the file_name does not escape the workspaces directory.
/// Rejects empty names, path traversal patterns, directory separators,
/// and names that don't end with `.json`.
fn validate_workspace_filename(file_name: &str) -> Result<(), String> {
    // Reject empty names
    if file_name.is_empty() {
        return Err("Workspace filename cannot be empty".to_string());
    }
    // Reject path traversal patterns and directory separators
    if file_name.contains("..") || file_name.contains('/') || file_name.contains('\\') {
        return Err(format!("Invalid workspace filename: {}", file_name));
    }
    // Reject names that don't end with .json
    if !file_name.ends_with(".json") {
        return Err(format!("Workspace filename must end with .json: {}", file_name));
    }
    Ok(())
}

/// Read a workspace file by filename (e.g., "abc123.json" or "recent-projects.json").
/// Returns `None` if the file does not exist.
#[tauri::command]
#[specta::specta]
pub fn read_workspace_file(file_name: String) -> Result<Option<String>, String> {
    validate_workspace_filename(&file_name)?;

    let dir = workspaces_dir()?;
    let path = dir.join(&file_name);

    if !path.exists() {
        // File doesn't exist yet — string-level validation above is the primary defense.
        return Ok(None);
    }

    // Secondary defense: canonicalize both paths and verify containment.
    let canonical_dir = dir.canonicalize().map_err(|e| format!("Path error: {}", e))?;
    let canonical_path = path.canonicalize().map_err(|e| format!("Path error: {}", e))?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Path traversal detected".to_string());
    }

    fs::read_to_string(&canonical_path)
        .map(Some)
        .map_err(|e| format!("Failed to read workspace file '{}': {}", file_name, e))
}

/// Write a workspace file by filename. Creates the directory tree if needed.
#[tauri::command]
#[specta::specta]
pub fn write_workspace_file(file_name: String, content: String) -> Result<(), String> {
    validate_workspace_filename(&file_name)?;

    let dir = workspaces_dir()?;

    // Ensure the directory exists
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create workspaces directory: {}", e))?;
    }

    let path = dir.join(&file_name);

    // Write the file first, then verify containment via canonicalization.
    fs::write(&path, &content)
        .map_err(|e| format!("Failed to write workspace file '{}': {}", file_name, e))?;

    // Secondary defense: canonicalize both paths and verify containment.
    let canonical_dir = dir.canonicalize().map_err(|e| format!("Path error: {}", e))?;
    let canonical_path = path.canonicalize().map_err(|e| format!("Path error: {}", e))?;
    if !canonical_path.starts_with(&canonical_dir) {
        // Remove the file we just wrote — it's outside the allowed directory.
        let _ = fs::remove_file(&path);
        return Err("Path traversal detected".to_string());
    }

    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal() {
        assert!(validate_workspace_filename("../../../etc/passwd").is_err());
        assert!(validate_workspace_filename("..\\windows\\system32").is_err());
        assert!(validate_workspace_filename("subdir/file.json").is_err());
        assert!(validate_workspace_filename("subdir\\file.json").is_err());
        assert!(validate_workspace_filename("..").is_err());
        assert!(validate_workspace_filename("foo/../bar.json").is_err());
    }

    #[test]
    fn accepts_valid_filenames() {
        assert!(validate_workspace_filename("abc123.json").is_ok());
        assert!(validate_workspace_filename("recent-projects.json").is_ok());
        assert!(validate_workspace_filename("aHR0cHM6Ly9leGFtcGxlLmNvbQ.json").is_ok());
        assert!(validate_workspace_filename("my_workspace.json").is_ok());
    }

    #[test]
    fn rejects_non_json() {
        assert!(validate_workspace_filename("file.txt").is_err());
        assert!(validate_workspace_filename("file").is_err());
        assert!(validate_workspace_filename("file.json.bak").is_err());
        assert!(validate_workspace_filename("file.jsonl").is_err());
    }

    #[test]
    fn rejects_empty_filename() {
        assert!(validate_workspace_filename("").is_err());
    }
}
