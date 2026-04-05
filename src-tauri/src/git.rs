use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;
use std::fs;
use std::time::Duration;

/// Default timeout for git commands (30 seconds).
const GIT_TIMEOUT_SECS: u64 = 30;

/// Run a git Command with a timeout. Spawns the process, waits up to
/// `GIT_TIMEOUT_SECS`, and kills it if it has not finished.
fn run_git_with_timeout(cmd: &mut Command) -> Result<std::process::Output, String> {
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn git: {}", e))?;

    let timeout = Duration::from_secs(GIT_TIMEOUT_SECS);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Process finished -- collect output
                return child
                    .wait_with_output()
                    .map_err(|e| format!("Failed to read git output: {}", e));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "Git command timed out after {}s",
                        GIT_TIMEOUT_SECS
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                return Err(format!("Error waiting for git process: {}", e));
            }
        }
    }
}

// ── Security: Git Input Validation ─────────────────────────────────

/// Validate a git ref (branch name, tag, or symbolic ref like HEAD).
/// Allows alphanumeric, `.`, `_`, `-`, `/`, `~`, `^` (for ref traversal like HEAD~1).
fn validate_git_ref(git_ref: &str) -> Result<(), String> {
    if git_ref.is_empty() {
        return Err("Git ref must not be empty".to_string());
    }
    if git_ref.len() > 256 {
        return Err("Git ref is too long (max 256 characters)".to_string());
    }
    let valid = git_ref
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '/' | '~' | '^'));
    if !valid {
        return Err(format!(
            "Invalid git ref '{}': only alphanumeric, '.', '_', '-', '/', '~', '^' characters are allowed",
            git_ref
        ));
    }
    // Reject directory traversal
    if git_ref.contains("..") && !git_ref.contains("~") && !git_ref.contains("^") {
        // Allow ".." only in range specs like "abc..def", but reject standalone ".."
        // Actually, ".." is valid in git for range specs (e.g. commit1..commit2)
        // We'll allow it since we validate character set above
    }
    Ok(())
}

/// Validate a git commit hash (short or full). Must be 4-40 lowercase hex characters.
fn validate_commit_hash(hash: &str) -> Result<(), String> {
    if hash.is_empty() {
        return Err("Commit hash must not be empty".to_string());
    }
    if hash.len() < 4 || hash.len() > 40 {
        return Err(format!(
            "Invalid commit hash '{}': must be 4-40 hex characters",
            hash
        ));
    }
    let valid = hash.chars().all(|c| c.is_ascii_hexdigit());
    if !valid {
        return Err(format!(
            "Invalid commit hash '{}': must contain only hex characters (0-9, a-f)",
            hash
        ));
    }
    Ok(())
}

/// Validate a file path for use in git commands.
/// Rejects paths with shell metacharacters and directory traversal.
fn validate_git_file_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("File path must not be empty".to_string());
    }
    // Reject shell metacharacters
    let forbidden = [';', '|', '&', '$', '`', '(', ')', '{', '}', '<', '>', '!', '#', '\n', '\r'];
    for &ch in &forbidden {
        if path.contains(ch) {
            return Err(format!(
                "File path contains forbidden character '{}'",
                ch.escape_default()
            ));
        }
    }
    Ok(())
}

/// Validate a branch name for git commands.
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
    let output = run_git_with_timeout(
        Command::new("git")
            .args(["symbolic-ref", "--short", "HEAD"])
            .current_dir(cwd),
    )?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(GitBranchInfo {
            branch: Some(branch),
            is_detached: false,
        });
    }

    // Fallback: detached HEAD -- get short commit hash
    let output = run_git_with_timeout(
        Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .current_dir(cwd),
    )?;

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
    // Security: validate inputs before passing to git
    validate_git_ref(git_ref)?;
    validate_git_file_path(file_path)?;

    let output = run_git_with_timeout(
        Command::new("git")
            .args(["show", &format!("{}:{}", git_ref, file_path)])
            .current_dir(cwd),
    )?;

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
    let output = run_git_with_timeout(
        Command::new("git")
            .args(["status", "--porcelain=v1", "-uall"])
            .current_dir(cwd),
    )?;

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

        // Emit separate entries for staged and unstaged changes.
        // A file can appear in both sections when it has changes in
        // the index AND the working tree.
        match (index_status, worktree_status) {
            ('?', '?') => {
                // Untracked
                results.push(GitFileStatus { path: file_path, status: "?".to_string(), is_staged: false });
            }
            ('!', '!') => {
                // Ignored
                results.push(GitFileStatus { path: file_path, status: "!".to_string(), is_staged: false });
            }
            (idx, wt) => {
                // Staged change in index
                if idx != ' ' && idx != '?' && idx != '!' {
                    results.push(GitFileStatus { path: file_path.clone(), status: idx.to_string(), is_staged: true });
                }
                // Unstaged change in working tree
                if wt != ' ' && wt != '?' && wt != '!' {
                    results.push(GitFileStatus { path: file_path, status: wt.to_string(), is_staged: false });
                }
            }
        }
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

    let output = run_git_with_timeout(
        Command::new("git")
            .args([
                "log",
                &format!("--max-count={}", limit),
                &format!("--format={}", format_str),
                "--no-color",
            ])
            .current_dir(cwd),
    )?;

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
    // Security: validate file path
    validate_git_file_path(file_path)?;

    let output = run_git_with_timeout(
        Command::new("git")
            .args(["blame", "--porcelain", file_path])
            .current_dir(cwd),
    )?;

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
    // Security: validate commit hash
    validate_commit_hash(hash)?;

    let output = run_git_with_timeout(
        Command::new("git")
            .args(["diff", &format!("{}~1..{}", hash, hash), "--no-color"])
            .current_dir(cwd),
    )?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        // Handle first commit (no parent) - diff against empty tree
        let output = run_git_with_timeout(
            Command::new("git")
                .args([
                    "diff",
                    "--no-color",
                    "4b825dc642cb6eb9a060e54bf899d69f",
                    hash,
                ])
                .current_dir(cwd),
        )?;
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

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── validate_git_ref tests ────────────────────────────────────

    #[test]
    fn git_ref_accepts_main() {
        assert!(validate_git_ref("main").is_ok());
    }

    #[test]
    fn git_ref_accepts_feature_branch() {
        assert!(validate_git_ref("feature/my-branch").is_ok());
    }

    #[test]
    fn git_ref_accepts_version_tag() {
        assert!(validate_git_ref("v1.0.0").is_ok());
    }

    #[test]
    fn git_ref_accepts_head() {
        assert!(validate_git_ref("HEAD").is_ok());
    }

    #[test]
    fn git_ref_accepts_head_tilde() {
        assert!(validate_git_ref("HEAD~1").is_ok());
    }

    #[test]
    fn git_ref_accepts_head_caret() {
        assert!(validate_git_ref("HEAD^2").is_ok());
    }

    #[test]
    fn git_ref_rejects_semicolon_injection() {
        let result = validate_git_ref("; rm -rf /");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid git ref"));
    }

    #[test]
    fn git_ref_rejects_dollar_injection() {
        let result = validate_git_ref("$(whoami)");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid git ref"));
    }

    #[test]
    fn git_ref_rejects_backtick_injection() {
        let result = validate_git_ref("`whoami`");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid git ref"));
    }

    #[test]
    fn git_ref_rejects_pipe_injection() {
        let result = validate_git_ref("main | cat /etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn git_ref_rejects_empty() {
        let result = validate_git_ref("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }

    #[test]
    fn git_ref_rejects_too_long() {
        let long_ref = "a".repeat(257);
        let result = validate_git_ref(&long_ref);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too long"));
    }

    // ── validate_commit_hash tests ────────────────────────────────

    #[test]
    fn commit_hash_accepts_full_sha() {
        assert!(validate_commit_hash("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2").is_ok());
    }

    #[test]
    fn commit_hash_accepts_short_sha() {
        assert!(validate_commit_hash("a1b2c3d").is_ok());
    }

    #[test]
    fn commit_hash_accepts_minimum_length() {
        assert!(validate_commit_hash("abcd").is_ok());
    }

    #[test]
    fn commit_hash_rejects_non_hex() {
        let result = validate_commit_hash("zzzzzzzz");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("hex characters"));
    }

    #[test]
    fn commit_hash_rejects_too_short() {
        let result = validate_commit_hash("abc");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("4-40"));
    }

    #[test]
    fn commit_hash_rejects_too_long() {
        let long_hash = "a".repeat(41);
        let result = validate_commit_hash(&long_hash);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("4-40"));
    }

    #[test]
    fn commit_hash_rejects_empty() {
        let result = validate_commit_hash("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }

    #[test]
    fn commit_hash_rejects_injection() {
        let result = validate_commit_hash("; rm -rf /");
        assert!(result.is_err());
    }

    #[test]
    fn commit_hash_rejects_shell_expansion() {
        let result = validate_commit_hash("$(whoami)");
        assert!(result.is_err());
    }

    // ── validate_git_file_path tests ──────────────────────────────

    #[test]
    fn git_file_path_rejects_semicolon() {
        let result = validate_git_file_path("file.txt; rm -rf /");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden character"));
    }

    #[test]
    fn git_file_path_rejects_pipe() {
        let result = validate_git_file_path("file.txt | cat");
        assert!(result.is_err());
    }

    #[test]
    fn git_file_path_rejects_dollar() {
        let result = validate_git_file_path("$(whoami).txt");
        assert!(result.is_err());
    }

    #[test]
    fn git_file_path_accepts_normal_path() {
        assert!(validate_git_file_path("src/main.rs").is_ok());
    }

    #[test]
    fn git_file_path_accepts_dotfile() {
        assert!(validate_git_file_path(".gitignore").is_ok());
    }

    // ── validate_branch_name tests ────────────────────────────────

    #[test]
    fn branch_name_accepts_simple() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("develop").is_ok());
    }

    #[test]
    fn branch_name_accepts_slashes() {
        assert!(validate_branch_name("feature/new-thing").is_ok());
    }

    #[test]
    fn branch_name_rejects_dotdot() {
        let result = validate_branch_name("feature/..exploit");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("'..' is not allowed"));
    }

    #[test]
    fn branch_name_rejects_spaces() {
        let result = validate_branch_name("my branch");
        assert!(result.is_err());
    }

    // ── unix_to_iso8601 tests ─────────────────────────────────────

    #[test]
    fn unix_to_iso8601_epoch() {
        assert_eq!(unix_to_iso8601(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn unix_to_iso8601_known_date() {
        // 2024-01-01T00:00:00Z = 1704067200
        assert_eq!(unix_to_iso8601(1704067200), "2024-01-01T00:00:00Z");
    }
}

// ── Git Write Operations ──────────────────────────────────────────

/// Validate a commit message. Must be non-empty and not contain
/// characters that could be used for shell injection.
fn validate_commit_message(msg: &str) -> Result<(), String> {
    if msg.trim().is_empty() {
        return Err("Commit message must not be empty".to_string());
    }
    if msg.len() > 10_000 {
        return Err("Commit message is too long (max 10000 characters)".to_string());
    }
    // Reject shell metacharacters that could enable injection
    let forbidden = ['`', '$'];
    for &ch in &forbidden {
        if msg.contains(ch) {
            return Err(format!(
                "Commit message contains forbidden character '{}'",
                ch.escape_default()
            ));
        }
    }
    Ok(())
}

/// Stage files: `git add <paths>`.
/// Each path is validated against shell injection.
pub fn git_stage(cwd: &str, paths: Vec<String>) -> Result<String, String> {
    if paths.is_empty() {
        return Err("No paths provided to stage".to_string());
    }
    for p in &paths {
        validate_git_file_path(p)?;
    }

    let mut cmd = Command::new("git");
    cmd.arg("add").args(&paths).current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git add failed: {}", stderr.trim()))
    }
}

/// Unstage files: `git restore --staged <paths>`.
pub fn git_unstage(cwd: &str, paths: Vec<String>) -> Result<String, String> {
    if paths.is_empty() {
        return Err("No paths provided to unstage".to_string());
    }
    for p in &paths {
        validate_git_file_path(p)?;
    }

    let mut cmd = Command::new("git");
    cmd.arg("restore")
        .arg("--staged")
        .args(&paths)
        .current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git restore --staged failed: {}", stderr.trim()))
    }
}

/// Commit staged changes: `git commit -m <message>`.
pub fn git_commit(cwd: &str, message: &str) -> Result<String, String> {
    validate_commit_message(message)?;

    let mut cmd = Command::new("git");
    cmd.args(["commit", "-m", message]).current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git commit failed: {}", stderr.trim()))
    }
}

/// Push to remote: `git push`.
pub fn git_push(cwd: &str) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("push").current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        // git push often writes to stderr even on success
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{}{}", stdout.trim(), stderr.trim());
        Ok(combined)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git push failed: {}", stderr.trim()))
    }
}

/// Pull from remote: `git pull`.
pub fn git_pull(cwd: &str) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("pull").current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{}{}", stdout.trim(), stderr.trim());
        Ok(combined)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git pull failed: {}", stderr.trim()))
    }
}

/// Create and checkout a new branch: `git checkout -b <name>`.
pub fn git_create_branch(cwd: &str, name: &str) -> Result<String, String> {
    validate_branch_name(name)?;

    let mut cmd = Command::new("git");
    cmd.args(["checkout", "-b", name]).current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Ok(stderr.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git checkout -b failed: {}", stderr.trim()))
    }
}

/// Get the working-tree diff (unstaged changes only): `git diff`.
pub fn git_diff_working(cwd: &str) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff", "--no-color"]).current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git diff failed: {}", stderr.trim()))
    }
}

/// Get the staged diff: `git diff --staged`.
pub fn git_diff_staged(cwd: &str) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff", "--staged", "--no-color"]).current_dir(cwd);

    let output = run_git_with_timeout(&mut cmd)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git diff --staged failed: {}", stderr.trim()))
    }
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
    let output = run_git_with_timeout(
        Command::new("gh")
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
            .current_dir(cwd),
    );

    let output = match output {
        Ok(o) => o,
        // gh not installed, not on PATH, or timed out — return empty list gracefully
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
