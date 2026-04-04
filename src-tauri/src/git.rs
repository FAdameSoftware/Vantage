use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;
use std::fs;

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

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitLogEntry {
    /// Short hash (7 chars)
    pub hash: String,
    /// Full SHA
    pub hash_full: String,
    /// First line of commit message
    pub message: String,
    pub author: String,
    pub author_email: String,
    /// ISO 8601 date
    pub date: String,
    /// Branch/tag refs
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitBlameLine {
    pub line_number: u32,
    /// Short hash
    pub hash: String,
    pub author: String,
    /// ISO 8601 date
    pub date: String,
    /// Line content
    pub content: String,
    /// True if this is the initial commit for this line
    pub is_boundary: bool,
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

/// Get the content of a file at a specific git ref (e.g., HEAD, a branch name,
/// or a commit hash). Returns an empty string if the file does not exist at
/// that ref (i.e., the file is new).
pub fn show_file(cwd: &str, file_path: &str, git_ref: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", git_ref, file_path)])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git show: {}", e))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    // New file that doesn't exist at HEAD — treat as empty
    if stderr.contains("does not exist")
        || stderr.contains("not found")
        || stderr.contains("exists on disk")
        || stderr.contains("Path '")
    {
        return Ok(String::new());
    }

    Err(format!("git show failed: {}", stderr.trim()))
}

/// Read a file from the working tree by absolute path.
/// Returns an empty string if the file does not exist.
pub fn read_working_file(path: &str) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Failed to read file {}: {}", path, e)),
    }
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

/// Get git log for the given working directory.
/// Returns up to `limit` entries (default 100).
pub fn git_log(cwd: &str, limit: u32) -> Result<Vec<GitLogEntry>, String> {
    // Use a unique separator that won't appear in commit messages
    let sep = "---GIT-FIELD-SEP---";
    let record_sep = "---GIT-RECORD-SEP---";
    let format_str = format!(
        "%H{sep}%h{sep}%s{sep}%an{sep}%ae{sep}%aI{sep}%D{record_sep}",
        sep = sep,
        record_sep = record_sep
    );

    let output = Command::new("git")
        .args([
            "log",
            &format!("--max-count={}", limit),
            &format!("--format={}", format_str),
            "--no-color",
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Empty repo or not a git repo
        if stderr.contains("does not have any commits")
            || stderr.contains("not a git repository")
        {
            return Ok(Vec::new());
        }
        return Err(format!("git log failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for record in stdout.split(record_sep) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }

        let fields: Vec<&str> = record.split(sep).collect();
        if fields.len() < 7 {
            continue;
        }

        let refs_str = fields[6].trim();
        let refs: Vec<String> = if refs_str.is_empty() {
            Vec::new()
        } else {
            refs_str
                .split(", ")
                .map(|s| s.trim().to_string())
                .collect()
        };

        entries.push(GitLogEntry {
            hash_full: fields[0].trim().to_string(),
            hash: fields[1].trim().to_string(),
            message: fields[2].trim().to_string(),
            author: fields[3].trim().to_string(),
            author_email: fields[4].trim().to_string(),
            date: fields[5].trim().to_string(),
            refs,
        });
    }

    Ok(entries)
}

/// Get blame annotations for a file.
pub fn git_blame(cwd: &str, file_path: &str) -> Result<Vec<GitBlameLine>, String> {
    let output = Command::new("git")
        .args(["blame", "--porcelain", file_path])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git blame: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git blame failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines: Vec<GitBlameLine> = Vec::new();

    // Porcelain blame output format:
    // <hash> <orig_line> <final_line> [<num_lines>]
    // author <name>
    // author-mail <email>
    // author-time <timestamp>
    // author-tz <tz>
    // ...
    // \t<content>
    let mut current_hash = String::new();
    let mut current_author = String::new();
    let mut current_date = String::new();
    let mut current_line_number: u32 = 0;
    let mut current_is_boundary = false;

    for line in stdout.lines() {
        if line.starts_with('\t') {
            // Content line - this completes a blame entry
            let content = line[1..].to_string();
            let short_hash = if current_hash.len() >= 7 {
                current_hash[..7].to_string()
            } else {
                current_hash.clone()
            };

            lines.push(GitBlameLine {
                line_number: current_line_number,
                hash: short_hash,
                author: current_author.clone(),
                date: current_date.clone(),
                content,
                is_boundary: current_is_boundary,
            });
        } else if line.starts_with("author ") {
            current_author = line["author ".len()..].to_string();
        } else if line.starts_with("author-time ") {
            // Unix timestamp - convert to ISO 8601
            if let Ok(ts) = line["author-time ".len()..].trim().parse::<i64>() {
                current_date = unix_to_iso8601(ts);
            }
        } else if line == "boundary" {
            current_is_boundary = true;
        } else {
            // Check if it's a commit header line: <hash> <orig_line> <final_line> [<num_lines>]
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].len() >= 40 {
                // This is a hex hash - new blame entry header
                let is_hex = parts[0].chars().all(|c| c.is_ascii_hexdigit());
                if is_hex {
                    current_hash = parts[0].to_string();
                    current_line_number = parts[2].parse().unwrap_or(0);
                    current_is_boundary = false;
                }
            }
        }
    }

    Ok(lines)
}

/// Get the diff for a specific commit.
pub fn git_diff_commit(cwd: &str, hash: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", &format!("{}~1..{}", hash, hash), "--no-color"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        // Handle first commit (no parent) - diff against empty tree
        let output = Command::new("git")
            .args([
                "diff",
                "--no-color",
                "4b825dc642cb6eb9a060e54bf899d69f",
                hash,
            ])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("git diff fallback failed: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

/// Convert a Unix timestamp (seconds) to an ISO 8601 string.
fn unix_to_iso8601(secs: i64) -> String {
    let secs_u = secs as u64;
    let days_since_epoch = secs_u / 86400;
    let time_of_day = secs_u % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let mut remaining_days = days_since_epoch as i64;
    let mut year: i64 = 1970;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let days_in_months: [i64; 12] = if is_leap_year(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 1;
    for &days_in_month in &days_in_months {
        if remaining_days < days_in_month {
            break;
        }
        remaining_days -= days_in_month;
        month += 1;
    }
    let day = remaining_days + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// A GitHub pull request summary from `gh pr list`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PrInfo {
    pub number: u32,
    pub title: String,
    /// "OPEN", "CLOSED", "MERGED"
    pub state: String,
}

/// List recent pull requests using the `gh` CLI.
/// Returns up to `limit` PRs (default 10) for the repo at `cwd`.
/// Returns an empty list (not an error) when `gh` is unavailable or the
/// directory is not a GitHub repo.
pub fn get_pr_list(cwd: &str, limit: u32) -> Result<Vec<PrInfo>, String> {
    let output = Command::new("gh")
        .args([
            "pr",
            "list",
            "--json",
            "number,title,state",
            "--limit",
            &limit.to_string(),
            "--state",
            "open",
        ])
        .current_dir(cwd)
        .output();

    let output = match output {
        Ok(o) => o,
        // gh not installed or not on PATH — return empty list gracefully
        Err(_) => return Ok(Vec::new()),
    };

    if !output.status.success() {
        // Not a GitHub repo, no auth, etc. — return empty list gracefully
        return Ok(Vec::new());
    }

    let json = String::from_utf8_lossy(&output.stdout);
    // Parse array of { number, title, state }
    let parsed: Vec<serde_json::Value> =
        serde_json::from_str(&json).unwrap_or_default();

    let prs = parsed
        .into_iter()
        .filter_map(|v| {
            let number = v["number"].as_u64()? as u32;
            let title = v["title"].as_str()?.to_string();
            let state = v["state"].as_str().unwrap_or("OPEN").to_string();
            Some(PrInfo { number, title, state })
        })
        .collect();

    Ok(prs)
}
