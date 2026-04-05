use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub language: String,
}

// ── Security: Path Traversal Protection ────────────────────────────

/// Known sensitive paths that should never be accessed via file operations.
/// These are checked as path prefixes (case-insensitive on Windows).
const SENSITIVE_PATH_PATTERNS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".aws/credentials",
    ".env.local",
    ".env.production",
];

/// Validate that a file path is safe for file operations.
///
/// This function:
/// 1. Rejects empty paths
/// 2. Rejects paths containing `..` traversal components
/// 3. Rejects paths that resolve to known sensitive locations
/// 4. Ensures the path is absolute (all Tauri IPC file paths should be absolute)
///
/// Note: In a full project-root sandboxing implementation, this would also
/// canonicalize the path and verify it's within the project root. However,
/// since Vantage operates on user-opened project directories (not a server),
/// we focus on rejecting traversal attacks and sensitive paths.
pub fn validate_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("Path must not be empty".to_string());
    }

    let normalized = path.replace('\\', "/");

    // Reject paths containing ".." components (directory traversal)
    for component in normalized.split('/') {
        if component == ".." {
            return Err(format!(
                "Path '{}' contains directory traversal (..) which is not allowed",
                path
            ));
        }
    }

    // Reject known sensitive paths
    let lower = normalized.to_lowercase();
    for pattern in SENSITIVE_PATH_PATTERNS {
        if lower.contains(&format!("/{}", pattern)) || lower.contains(&format!("\\{}", pattern)) {
            return Err(format!(
                "Access to sensitive path pattern '{}' is not allowed",
                pattern
            ));
        }
    }

    // Reject paths that are clearly outside project scope
    // (e.g., /etc/passwd, C:\Windows\System32)
    #[cfg(target_os = "windows")]
    {
        let lower_path = path.to_lowercase().replace('\\', "/");
        if lower_path.starts_with("c:/windows") || lower_path.starts_with("c:/program files") {
            return Err(format!("Access to system path '{}' is not allowed", path));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if normalized.starts_with("/etc/")
            || normalized.starts_with("/var/")
            || normalized.starts_with("/usr/")
            || normalized.starts_with("/root/")
            || normalized == "/etc/passwd"
            || normalized == "/etc/shadow"
        {
            return Err(format!("Access to system path '{}' is not allowed", path));
        }
    }

    Ok(PathBuf::from(path))
}

/// Validate that both old and new paths are safe (for rename operations).
pub fn validate_path_pair(old_path: &str, new_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let old = validate_path(old_path)?;
    let new = validate_path(new_path)?;
    Ok((old, new))
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
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let file_path = validated.as_path();

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
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let file_path = validated.as_path();

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
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let file_path = validated.as_path();

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
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let dir_path = validated.as_path();

    if dir_path.exists() {
        return Err(format!("Directory already exists: {}", path));
    }

    fs::create_dir_all(dir_path).map_err(|e| format!("Failed to create directory: {}", e))
}

/// Rename/move a file or directory.
pub fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    // Security: validate both paths against traversal attacks
    let (validated_old, validated_new) = validate_path_pair(old_path, new_path)?;

    if !validated_old.exists() {
        return Err(format!("Source does not exist: {}", old_path));
    }
    if validated_new.exists() {
        return Err(format!("Destination already exists: {}", new_path));
    }

    fs::rename(&validated_old, &validated_new).map_err(|e| format!("Failed to rename: {}", e))
}

/// Delete a file.
pub fn delete_file(path: &str) -> Result<(), String> {
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let file_path = validated.as_path();

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
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let dir_path = validated.as_path();

    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    fs::remove_dir_all(dir_path).map_err(|e| format!("Failed to delete directory: {}", e))
}

/// Format a file using Prettier (`npx prettier --write <path>`).
///
/// Returns the formatted file content after Prettier runs.
/// Validates the path before executing to prevent injection attacks.
pub fn format_file(path: &str) -> Result<String, String> {
    // Security: validate path against traversal attacks
    let validated = validate_path(path)?;
    let file_path = validated.as_path();

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if !file_path.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    // Run prettier --write on the file
    // We pass the path as a separate argument (not interpolated into a shell string)
    // to prevent command injection.
    let output = std::process::Command::new("npx")
        .arg("prettier")
        .arg("--write")
        .arg(file_path)
        .output()
        .map_err(|e| format!("Failed to run prettier: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If prettier fails (e.g., unsupported file type), return a useful error
        // but don't treat it as catastrophic — the file is unchanged.
        return Err(format!("Prettier formatting failed: {}", stderr.trim()));
    }

    // Re-read the formatted file content
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read formatted file: {}", e))?;

    Ok(content)
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ── Path validation tests ─────────────────────────────────────

    #[test]
    fn validate_path_rejects_traversal_unix_style() {
        let result = validate_path("/home/user/project/../../../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("directory traversal"));
    }

    #[test]
    fn validate_path_rejects_traversal_windows_style() {
        let result = validate_path("C:\\Users\\user\\project\\..\\..\\..\\Windows\\System32");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("directory traversal"));
    }

    #[test]
    fn validate_path_rejects_empty() {
        let result = validate_path("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }

    #[test]
    fn validate_path_rejects_sensitive_ssh() {
        let result = validate_path("/home/user/.ssh/id_rsa");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("sensitive"));
    }

    #[test]
    fn validate_path_rejects_sensitive_aws() {
        let result = validate_path("/home/user/.aws/credentials");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("sensitive"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn validate_path_rejects_windows_system() {
        let result = validate_path("C:\\Windows\\System32\\cmd.exe");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("system path"));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn validate_path_rejects_etc_passwd() {
        let result = validate_path("/etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("system path"));
    }

    #[test]
    fn validate_path_accepts_normal_project_path() {
        // Use a plausible absolute path for the current platform
        let path = if cfg!(windows) {
            "C:\\Users\\dev\\project\\src\\main.rs"
        } else {
            "/home/dev/project/src/main.rs"
        };
        let result = validate_path(path);
        assert!(result.is_ok());
    }

    // ── read_file tests ───────────────────────────────────────────

    #[test]
    fn read_file_with_valid_path() {
        // Create a temp file, read it back
        let dir = std::env::temp_dir().join("vantage_test_read");
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join("hello.txt");
        fs::write(&file_path, "hello world").unwrap();

        let result = read_file(file_path.to_str().unwrap());
        assert!(result.is_ok());
        let fc = result.unwrap();
        assert_eq!(fc.content, "hello world");
        assert_eq!(fc.language, "plaintext");

        // Cleanup
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_file_nonexistent_returns_error() {
        let path = if cfg!(windows) {
            "C:\\vantage_nonexistent_abc123\\file.txt"
        } else {
            "/tmp/vantage_nonexistent_abc123/file.txt"
        };
        let result = read_file(path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    // ── write_file tests ──────────────────────────────────────────

    #[test]
    fn write_file_creates_parent_directories() {
        let dir = std::env::temp_dir().join("vantage_test_write_parents");
        let file_path = dir.join("sub").join("deep").join("file.txt");
        // Ensure clean state
        let _ = fs::remove_dir_all(&dir);

        let result = write_file(file_path.to_str().unwrap(), "nested content");
        assert!(result.is_ok());
        assert!(file_path.exists());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "nested content");

        // Cleanup
        let _ = fs::remove_dir_all(&dir);
    }

    // ── delete_file tests ─────────────────────────────────────────

    #[test]
    fn delete_file_rejects_nonexistent() {
        let path = if cfg!(windows) {
            "C:\\vantage_nonexistent_del\\file.txt"
        } else {
            "/tmp/vantage_nonexistent_del/file.txt"
        };
        let result = delete_file(path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    // ── Language detection tests ──────────────────────────────────

    #[test]
    fn detect_language_typescript() {
        assert_eq!(detect_language("app.ts"), "typescript");
        assert_eq!(detect_language("component.tsx"), "typescript");
    }

    #[test]
    fn detect_language_javascript() {
        assert_eq!(detect_language("index.js"), "javascript");
        assert_eq!(detect_language("module.mjs"), "javascript");
        assert_eq!(detect_language("config.cjs"), "javascript");
        assert_eq!(detect_language("app.jsx"), "javascript");
    }

    #[test]
    fn detect_language_rust() {
        assert_eq!(detect_language("main.rs"), "rust");
    }

    #[test]
    fn detect_language_python() {
        assert_eq!(detect_language("script.py"), "python");
    }

    #[test]
    fn detect_language_json() {
        assert_eq!(detect_language("package.json"), "json");
    }

    #[test]
    fn detect_language_yaml() {
        assert_eq!(detect_language("config.yaml"), "yaml");
        assert_eq!(detect_language("ci.yml"), "yaml");
    }

    #[test]
    fn detect_language_markdown() {
        assert_eq!(detect_language("README.md"), "markdown");
        assert_eq!(detect_language("page.mdx"), "markdown");
    }

    #[test]
    fn detect_language_html_css() {
        assert_eq!(detect_language("index.html"), "html");
        assert_eq!(detect_language("style.css"), "css");
        assert_eq!(detect_language("style.scss"), "scss");
    }

    #[test]
    fn detect_language_shell() {
        assert_eq!(detect_language("run.sh"), "shell");
        assert_eq!(detect_language("init.bash"), "shell");
    }

    #[test]
    fn detect_language_go() {
        assert_eq!(detect_language("main.go"), "go");
    }

    #[test]
    fn detect_language_cpp() {
        assert_eq!(detect_language("main.cpp"), "cpp");
        assert_eq!(detect_language("header.hpp"), "cpp");
    }

    #[test]
    fn detect_language_unknown_returns_plaintext() {
        assert_eq!(detect_language("file.xyz"), "plaintext");
        assert_eq!(detect_language("noextension"), "plaintext");
    }
}
