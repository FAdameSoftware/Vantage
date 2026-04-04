use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitBranchInfo {
    pub branch: Option<String>,
    pub is_detached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitFileStatus {
    /// The relative file path (forward slashes)
    pub path: String,
    /// Status code: "M" (modified), "A" (added), "D" (deleted),
    /// "R" (renamed), "?" (untracked), "!" (ignored)
    pub status: String,
    /// Whether the file is staged
    pub is_staged: bool,
}

/// Get the current git branch name for the given working directory.
/// Returns None for branch if not in a git repo.
pub fn get_branch(cwd: &str) -> Result<GitBranchInfo, String> {
    // Try symbolic-ref first (works for normal branches)
    let output = Command::new("git")
        .args(["symbolic-ref", "--short", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(GitBranchInfo {
            branch: Some(branch),
            is_detached: false,
        });
    }

    // Fallback: detached HEAD -- get short commit hash
    let output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(GitBranchInfo {
            branch: Some(hash),
            is_detached: true,
        });
    }

    // Not a git repo or git not available
    Ok(GitBranchInfo {
        branch: None,
        is_detached: false,
    })
}

/// Get the git status of all changed files in the working directory.
/// Uses `git status --porcelain=v1` for machine-readable output.
pub fn get_status(cwd: &str) -> Result<Vec<GitFileStatus>, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-uall"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]); // Not a git repo, return empty
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let index_status = line.chars().nth(0).unwrap_or(' ');
        let worktree_status = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].to_string().replace('\\', "/");

        // Determine the display status and staged flag
        let (status, is_staged) = match (index_status, worktree_status) {
            ('?', '?') => ("?".to_string(), false),                  // Untracked
            ('!', '!') => ("!".to_string(), false),                  // Ignored
            (idx, ' ') if idx != ' ' => (idx.to_string(), true),     // Staged only
            (' ', wt) if wt != ' ' => (wt.to_string(), false),      // Unstaged only
            (idx, _wt) if idx != ' ' => (idx.to_string(), true),    // Both (show staged)
            _ => continue,
        };

        results.push(GitFileStatus {
            path: file_path,
            status,
            is_staged,
        });
    }

    Ok(results)
}
