use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;
use std::time::Instant;

// ── Security: Input Validation ─────────────────────────────────────

/// Shell metacharacters that could enable command injection.
const SHELL_METACHARACTERS: &[char] = &[';', '|', '&', '$', '`', '(', ')', '{', '}', '<', '>', '!', '#', '~', '\n', '\r'];

/// Whitelist of allowed quality gate command patterns.
/// Commands must start with one of these prefixes.
const ALLOWED_COMMAND_PREFIXES: &[&str] = &[
    "npm ",
    "npm.cmd ",
    "npx ",
    "npx.cmd ",
    "yarn ",
    "pnpm ",
    "node ",
    "cargo ",
    "make ",
    "tsc ",
    "eslint ",
    "prettier ",
    "vitest ",
    "jest ",
    "playwright ",
    "biome ",
];

/// Validate a quality gate command against injection attacks.
/// Rejects commands containing shell metacharacters and commands that
/// don't match the allowed prefix whitelist.
fn validate_quality_gate_command(command: &str) -> Result<(), String> {
    let command_trimmed = command.trim();

    if command_trimmed.is_empty() {
        return Err("Quality gate command must not be empty".to_string());
    }

    // Reject shell metacharacters
    for &ch in SHELL_METACHARACTERS {
        if command_trimmed.contains(ch) {
            return Err(format!(
                "Quality gate command contains forbidden character '{}'. Commands must not contain shell metacharacters.",
                ch.escape_default()
            ));
        }
    }

    // Must match an allowed command prefix
    let lower = command_trimmed.to_lowercase();
    let matches_prefix = ALLOWED_COMMAND_PREFIXES.iter().any(|prefix| lower.starts_with(prefix));
    if !matches_prefix {
        return Err(format!(
            "Quality gate command '{}' does not match any allowed prefix. Allowed: npm, npx, yarn, pnpm, node, cargo, make, tsc, eslint, prettier, vitest, jest, playwright, biome",
            command_trimmed
        ));
    }

    Ok(())
}

/// Validate a git branch name. Allows alphanumeric, `.`, `_`, `-`, `/`.
fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name must not be empty".to_string());
    }
    let valid = name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '.' || c == '_' || c == '-' || c == '/');
    if !valid {
        return Err(format!(
            "Invalid branch name '{}': only alphanumeric, '.', '_', '-', '/' characters are allowed",
            name
        ));
    }
    // Reject directory traversal in branch names
    if name.contains("..") {
        return Err(format!("Invalid branch name '{}': '..' is not allowed", name));
    }
    Ok(())
}

// ── Quality Gate ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QualityGateResult {
    pub gate_name: String,
    pub command: String,
    pub passed: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
}

/// Run a quality gate command (e.g., `npm test`, `npm run lint`) in a given
/// working directory. Returns a structured result with pass/fail, output,
/// and duration.
///
/// Security: Commands are validated against a whitelist of allowed prefixes
/// and rejected if they contain shell metacharacters.
pub fn run_quality_gate(
    cwd: &str,
    gate_name: &str,
    command: &str,
) -> Result<QualityGateResult, String> {
    // Security: validate command before execution
    validate_quality_gate_command(command)?;

    let start = Instant::now();

    // Tokenize the command into program + arguments instead of passing to shell
    let parts: Vec<&str> = command.trim().split_whitespace().collect();
    if parts.is_empty() {
        return Err("Quality gate command is empty after parsing".to_string());
    }

    let program = parts[0];
    let args = &parts[1..];

    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output();

    let output = output.map_err(|e| format!("Failed to run quality gate '{}': {}", gate_name, e))?;
    let duration_ms = start.elapsed().as_millis() as u64;
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(QualityGateResult {
        gate_name: gate_name.to_string(),
        command: command.to_string(),
        passed: exit_code == 0,
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code,
        duration_ms,
    })
}

// ── Detect Quality Gates ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DetectedGate {
    pub name: String,
    pub command: String,
}

/// Read the project's `package.json` and return any scripts that look like
/// quality gates (test, lint, build, typecheck, type-check).
pub fn detect_quality_gates(cwd: &str) -> Result<Vec<DetectedGate>, String> {
    let pkg_path = std::path::Path::new(cwd).join("package.json");
    let content = std::fs::read_to_string(&pkg_path)
        .map_err(|e| format!("Failed to read package.json: {}", e))?;

    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse package.json: {}", e))?;

    let scripts = match parsed.get("scripts") {
        Some(serde_json::Value::Object(m)) => m,
        _ => return Ok(Vec::new()),
    };

    // Map known script names to quality gate definitions
    let gate_candidates = [
        ("lint", "npm run lint"),
        ("test", "npm test"),
        ("typecheck", "npm run typecheck"),
        ("type-check", "npm run type-check"),
        ("build", "npm run build"),
    ];

    let mut gates = Vec::new();
    for (script_name, npm_command) in &gate_candidates {
        if scripts.contains_key(*script_name) {
            gates.push(DetectedGate {
                name: script_name.to_string(),
                command: npm_command.to_string(),
            });
        }
    }

    Ok(gates)
}

// ── Merge Branch ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MergeResult {
    pub success: bool,
    pub merge_commit: Option<String>,
    pub conflict_files: Vec<String>,
    pub output: String,
}

/// Merge a branch into the current branch in the given repo.
/// If `no_ff` is true, uses `--no-ff` to always create a merge commit.
pub fn merge_branch(
    repo_path: &str,
    branch_name: &str,
    no_ff: bool,
) -> Result<MergeResult, String> {
    // Security: validate branch name
    validate_branch_name(branch_name)?;

    let mut args = vec!["merge"];
    if no_ff {
        args.push("--no-ff");
    }
    args.push(branch_name);

    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git merge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr);

    if output.status.success() {
        // Get the merge commit hash
        let hash_output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("Failed to get merge commit hash: {}", e))?;

        let merge_commit = if hash_output.status.success() {
            Some(String::from_utf8_lossy(&hash_output.stdout).trim().to_string())
        } else {
            None
        };

        Ok(MergeResult {
            success: true,
            merge_commit,
            conflict_files: Vec::new(),
            output: combined,
        })
    } else {
        // Parse conflicting files
        let conflict_output = Command::new("git")
            .args(["diff", "--name-only", "--diff-filter=U"])
            .current_dir(repo_path)
            .output();

        let conflict_files = match conflict_output {
            Ok(co) if co.status.success() => {
                String::from_utf8_lossy(&co.stdout)
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(|l| l.to_string())
                    .collect()
            }
            _ => Vec::new(),
        };

        // Abort the failed merge to leave the repo clean
        let _ = Command::new("git")
            .args(["merge", "--abort"])
            .current_dir(repo_path)
            .output();

        Ok(MergeResult {
            success: false,
            merge_commit: None,
            conflict_files,
            output: combined,
        })
    }
}

// ── Rebase Branch ───────────────────────────────────────────────────

/// Rebase the current branch onto `onto_branch` in the given worktree.
/// Returns `true` if successful. On conflict, aborts the rebase and
/// returns an error.
pub fn rebase_branch(worktree_path: &str, onto_branch: &str) -> Result<bool, String> {
    // Security: validate branch name
    validate_branch_name(onto_branch)?;

    let output = Command::new("git")
        .args(["rebase", onto_branch])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to run git rebase: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        // Abort the rebase to leave the worktree clean
        let _ = Command::new("git")
            .args(["rebase", "--abort"])
            .current_dir(worktree_path)
            .output();

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Rebase failed (aborted): {}", stderr.trim()))
    }
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── validate_quality_gate_command tests ────────────────────────

    #[test]
    fn quality_gate_accepts_npm_test() {
        assert!(validate_quality_gate_command("npm test").is_ok());
    }

    #[test]
    fn quality_gate_accepts_cargo_test() {
        assert!(validate_quality_gate_command("cargo test").is_ok());
    }

    #[test]
    fn quality_gate_accepts_npx_vitest() {
        assert!(validate_quality_gate_command("npx vitest run").is_ok());
    }

    #[test]
    fn quality_gate_accepts_npm_run_lint() {
        assert!(validate_quality_gate_command("npm run lint").is_ok());
    }

    #[test]
    fn quality_gate_accepts_yarn() {
        assert!(validate_quality_gate_command("yarn test").is_ok());
    }

    #[test]
    fn quality_gate_accepts_pnpm() {
        assert!(validate_quality_gate_command("pnpm run build").is_ok());
    }

    #[test]
    fn quality_gate_accepts_eslint() {
        assert!(validate_quality_gate_command("eslint src/").is_ok());
    }

    #[test]
    fn quality_gate_accepts_playwright() {
        assert!(validate_quality_gate_command("playwright test").is_ok());
    }

    #[test]
    fn quality_gate_rejects_semicolon_injection() {
        let result = validate_quality_gate_command("npm test; rm -rf /");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden character"));
    }

    #[test]
    fn quality_gate_rejects_pipe_injection() {
        let result = validate_quality_gate_command("npm test | cat /etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden character"));
    }

    #[test]
    fn quality_gate_rejects_dollar_injection() {
        let result = validate_quality_gate_command("$(whoami)");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden character"));
    }

    #[test]
    fn quality_gate_rejects_backtick_injection() {
        let result = validate_quality_gate_command("`whoami`");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden character"));
    }

    #[test]
    fn quality_gate_rejects_ampersand_injection() {
        let result = validate_quality_gate_command("npm test && rm -rf /");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden character"));
    }

    #[test]
    fn quality_gate_rejects_unknown_command() {
        let result = validate_quality_gate_command("rm -rf /");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not match any allowed prefix"));
    }

    #[test]
    fn quality_gate_rejects_empty() {
        let result = validate_quality_gate_command("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }

    #[test]
    fn quality_gate_rejects_whitespace_only() {
        let result = validate_quality_gate_command("   ");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }

    // ── validate_branch_name tests (merge_queue copy) ─────────────

    #[test]
    fn merge_branch_name_accepts_valid() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("feature/new-feature").is_ok());
        assert!(validate_branch_name("release-1.0").is_ok());
    }

    #[test]
    fn merge_branch_name_rejects_dotdot() {
        let result = validate_branch_name("feature/../main");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("'..' is not allowed"));
    }

    #[test]
    fn merge_branch_name_rejects_injection() {
        let result = validate_branch_name("; rm -rf /");
        assert!(result.is_err());
    }

    #[test]
    fn merge_branch_name_rejects_spaces() {
        let result = validate_branch_name("my branch");
        assert!(result.is_err());
    }

    #[test]
    fn merge_branch_name_rejects_empty() {
        let result = validate_branch_name("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must not be empty"));
    }
}
