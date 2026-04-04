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
        return Err(format!(
            "Not a file (use delete_dir for directories): {}",
            path
        ));
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
