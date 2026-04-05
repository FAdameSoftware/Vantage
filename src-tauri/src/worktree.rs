use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeInfo {
    /// Absolute path to the worktree directory
    pub path: String,
    /// Branch name checked out in this worktree
    pub branch: Option<String>,
    /// HEAD commit hash
    pub head: String,
    /// Whether this is the main worktree
    pub is_main: bool,
    /// Whether the worktree is locked
    pub is_locked: bool,
    /// Disk usage in bytes (0 if not calculated)
    pub disk_usage_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeCreateResult {
    /// Path to the newly created worktree
    pub path: String,
    /// Branch name
    pub branch: String,
}

/// Validate that two paths are on the same volume (drive letter on Windows).
/// On non-Windows platforms this always returns Ok(()).
fn validate_same_volume(path_a: &str, path_b: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let drive_a = path_a
            .chars()
            .next()
            .map(|c| c.to_ascii_uppercase());
        let drive_b = path_b
            .chars()
            .next()
            .map(|c| c.to_ascii_uppercase());

        // Only compare if both paths have a drive letter (e.g. C:\...)
        let has_drive_a = path_a.len() >= 2
            && path_a.chars().nth(0).map_or(false, |c| c.is_ascii_alphabetic())
            && path_a.chars().nth(1) == Some(':');
        let has_drive_b = path_b.len() >= 2
            && path_b.chars().nth(0).map_or(false, |c| c.is_ascii_alphabetic())
            && path_b.chars().nth(1) == Some(':');

        if has_drive_a && has_drive_b && drive_a != drive_b {
            return Err(format!(
                "Worktree must be on the same drive as the repository. Repo is on {}:, target is on {}:",
                drive_a.expect("has_drive_a guard ensures drive_a is Some"),
                drive_b.expect("has_drive_b guard ensures drive_b is Some")
            ));
        }
    }

    // Suppress unused variable warnings on non-Windows
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path_a;
        let _ = path_b;
    }

    Ok(())
}

/// Validate a branch name for git worktree commands.
/// Allows alphanumeric, `.`, `_`, `-`, `/`.
fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name must not be empty".to_string());
    }
    let valid = name
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
    if !valid {
        return Err(format!(
            "Invalid branch name '{}': only alphanumeric, '.', '_', '-', '/' characters are allowed",
            name
        ));
    }
    if name.contains("..") {
        return Err(format!("Invalid branch name '{}': '..' is not allowed", name));
    }
    Ok(())
}

/// Create a new git worktree with a new branch at the specified path.
/// If the branch already exists, checks it out instead of creating it.
pub fn create_worktree(
    repo_path: &str,
    branch_name: &str,
    worktree_path: &str,
) -> Result<WorktreeCreateResult, String> {
    // Security: validate branch name
    validate_branch_name(branch_name)?;
    validate_same_volume(repo_path, worktree_path)?;

    // Ensure the parent directory of the worktree path exists
    if let Some(parent) = Path::new(worktree_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create worktree parent directory: {}", e))?;
    }

    // Try creating with a new branch first: git worktree add -b <branch> <path> HEAD
    let output = Command::new("git")
        .args([
            "worktree",
            "add",
            "-b",
            branch_name,
            worktree_path,
            "HEAD",
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        // Apply .worktreeinclude files
        let _ = apply_worktree_includes(repo_path, worktree_path);
        return Ok(WorktreeCreateResult {
            path: worktree_path.to_string(),
            branch: branch_name.to_string(),
        });
    }

    // If branch already exists, retry without -b
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("already exists") {
        let output = Command::new("git")
            .args(["worktree", "add", worktree_path, branch_name])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;

        if output.status.success() {
            // Apply .worktreeinclude files
            let _ = apply_worktree_includes(repo_path, worktree_path);
            return Ok(WorktreeCreateResult {
                path: worktree_path.to_string(),
                branch: branch_name.to_string(),
            });
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create worktree: {}", stderr.trim()));
    }

    Err(format!("Failed to create worktree: {}", stderr.trim()))
}

/// List all worktrees for the given repository.
/// Parses `git worktree list --porcelain` output.
pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list worktrees: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut is_first = true;

    // Porcelain output is blocks separated by blank lines.
    // Each block has lines like:
    //   worktree /path/to/worktree
    //   HEAD abc123...
    //   branch refs/heads/main
    //   locked
    for block in stdout.split("\n\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }

        let mut path = String::new();
        let mut head = String::new();
        let mut branch: Option<String> = None;
        let mut is_locked = false;

        for line in block.lines() {
            let line = line.trim();
            if let Some(p) = line.strip_prefix("worktree ") {
                path = p.to_string();
            } else if let Some(h) = line.strip_prefix("HEAD ") {
                head = h.to_string();
            } else if let Some(b) = line.strip_prefix("branch ") {
                // Strip refs/heads/ prefix
                branch = Some(
                    b.strip_prefix("refs/heads/")
                        .unwrap_or(b)
                        .to_string(),
                );
            } else if line == "locked" {
                is_locked = true;
            }
        }

        if !path.is_empty() {
            worktrees.push(WorktreeInfo {
                path,
                branch,
                head,
                is_main: is_first,
                is_locked,
                disk_usage_bytes: 0,
            });
            is_first = false;
        }
    }

    Ok(worktrees)
}

/// Remove a git worktree.
/// If `force` is true, removes even with uncommitted changes.
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["worktree", "remove", worktree_path];
    if force {
        args.push("--force");
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to remove worktree: {}", stderr.trim()));
    }

    Ok(())
}

/// Calculate the disk usage of a worktree directory recursively.
/// Skips the `.git` file (which is just a pointer in worktrees).
pub fn get_worktree_disk_usage(worktree_path: &str) -> Result<u64, String> {
    let path = Path::new(worktree_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", worktree_path));
    }

    fn dir_size(path: &Path) -> Result<u64, String> {
        let mut total: u64 = 0;

        let entries = fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

        for entry in entries {
            let entry =
                entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let entry_path = entry.path();
            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();

            // Skip the .git file/directory in worktrees
            if file_name_str == ".git" {
                continue;
            }

            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to get metadata for {}: {}", entry_path.display(), e))?;

            if metadata.is_dir() {
                total += dir_size(&entry_path)?;
            } else {
                total += metadata.len();
            }
        }

        Ok(total)
    }

    dir_size(path)
}

/// Get the list of changed files in a worktree.
/// Combines unstaged changes (`git diff --name-only HEAD`) and
/// staged changes (`git diff --name-only --cached HEAD`), deduplicated.
pub fn get_worktree_changes(worktree_path: &str) -> Result<Vec<String>, String> {
    let mut changed_files = HashSet::new();

    // Get unstaged changes
    let output = Command::new("git")
        .args(["diff", "--name-only", "HEAD"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if !line.is_empty() {
                changed_files.insert(line.to_string());
            }
        }
    }

    // Get staged changes
    let output = Command::new("git")
        .args(["diff", "--name-only", "--cached", "HEAD"])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git diff --cached: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if !line.is_empty() {
                changed_files.insert(line.to_string());
            }
        }
    }

    let mut result: Vec<String> = changed_files.into_iter().collect();
    result.sort();
    Ok(result)
}

/// Generate a worktree path for an agent.
/// Places worktrees in a `.vantage-worktrees/` directory adjacent to the repo.
///
/// Example: repo at C:/Projects/myapp -> C:/Projects/.vantage-worktrees/agent-backend-1234
pub fn agent_worktree_path(repo_path: &str, agent_name: &str, agent_id: &str) -> Result<String, String> {
    if repo_path.is_empty() {
        return Err("repo_path must not be empty".to_string());
    }
    if repo_path.contains("..") {
        return Err("repo_path must not contain '..' traversal".to_string());
    }
    let repo = Path::new(repo_path);
    let parent = repo.parent().unwrap_or(repo);
    let sanitized_name = agent_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>();
    let short_id = &agent_id[..8.min(agent_id.len())];
    let worktree_dir = parent
        .join(".vantage-worktrees")
        .join(format!("{}-{}", sanitized_name, short_id));
    Ok(worktree_dir.to_string_lossy().to_string())
}

/// Validate a path from `.worktreeinclude`.
/// - Must be relative (no leading `/` or drive letter)
/// - Must not contain `..` traversal
/// - Must not point to known sensitive files
fn validate_worktree_include_path(line: &str) -> Result<(), String> {
    // Must not be empty
    if line.is_empty() {
        return Err("Empty path in .worktreeinclude".to_string());
    }

    // Must be relative — reject absolute paths
    if line.starts_with('/') || line.starts_with('\\') {
        return Err(format!(
            "Absolute path '{}' is not allowed in .worktreeinclude",
            line
        ));
    }
    // Reject Windows drive letters (e.g., C:\...)
    if line.len() >= 2 && line.chars().nth(0).map_or(false, |c| c.is_ascii_alphabetic()) && line.chars().nth(1) == Some(':') {
        return Err(format!(
            "Absolute path '{}' is not allowed in .worktreeinclude",
            line
        ));
    }

    // Must not contain ".." traversal
    let normalized = line.replace('\\', "/");
    for component in normalized.split('/') {
        if component == ".." {
            return Err(format!(
                "Path '{}' contains directory traversal (..) which is not allowed in .worktreeinclude",
                line
            ));
        }
    }

    // Must not point to known sensitive paths
    let lower = normalized.to_lowercase();
    let sensitive_patterns = [
        ".ssh", ".gnupg", ".aws/credentials", ".env.local", ".env.production",
        "id_rsa", "id_ed25519", ".npmrc", ".pypirc",
    ];
    for pattern in &sensitive_patterns {
        if lower.contains(pattern) {
            return Err(format!(
                "Path '{}' matches sensitive pattern '{}' and is not allowed in .worktreeinclude",
                line, pattern
            ));
        }
    }

    Ok(())
}

/// Read `.worktreeinclude` from the project root and copy listed files
/// into the given worktree directory. Lines starting with `#` are comments.
/// Empty lines are skipped. Each non-comment line is a relative path from
/// the project root.
///
/// Security: Paths are validated to prevent directory traversal and
/// access to sensitive files.
pub fn apply_worktree_includes(project_root: &str, worktree_path: &str) -> Result<Vec<String>, String> {
    let include_path = Path::new(project_root).join(".worktreeinclude");
    if !include_path.exists() {
        return Ok(vec![]);
    }

    let contents = fs::read_to_string(&include_path)
        .map_err(|e| format!("Failed to read .worktreeinclude: {e}"))?;

    let mut copied = Vec::new();
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Security: validate each path entry
        validate_worktree_include_path(line)?;

        let src = Path::new(project_root).join(line);
        let dest = Path::new(worktree_path).join(line);

        // Extra safety: verify the resolved source is actually within project_root
        if let (Ok(canonical_root), Ok(canonical_src)) = (
            Path::new(project_root).canonicalize(),
            src.canonicalize(),
        ) {
            if !canonical_src.starts_with(&canonical_root) {
                return Err(format!(
                    "Path '{}' resolves outside the project root and is not allowed",
                    line
                ));
            }
        }

        if src.exists() {
            // Create parent directories in the worktree
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::copy(&src, &dest)
                .map_err(|e| format!("Failed to copy {line}: {e}"))?;
            copied.push(line.to_string());
        }
    }

    Ok(copied)
}

/// Generate a branch name for an agent worktree.
/// Format: vantage/agent-name-shortid
pub fn agent_branch_name(agent_name: &str, agent_id: &str) -> String {
    let sanitized_name = agent_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>();
    let short_id = &agent_id[..8.min(agent_id.len())];
    format!("vantage/{}-{}", sanitized_name, short_id)
}
