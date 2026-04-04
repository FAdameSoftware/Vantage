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
                drive_a.unwrap(),
                drive_b.unwrap()
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

/// Create a new git worktree with a new branch at the specified path.
/// If the branch already exists, checks it out instead of creating it.
pub fn create_worktree(
    repo_path: &str,
    branch_name: &str,
    worktree_path: &str,
) -> Result<WorktreeCreateResult, String> {
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
pub fn agent_worktree_path(repo_path: &str, agent_name: &str, agent_id: &str) -> String {
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
    worktree_dir.to_string_lossy().to_string()
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
