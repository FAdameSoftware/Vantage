use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;
use std::time::Instant;

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
pub fn run_quality_gate(
    cwd: &str,
    gate_name: &str,
    command: &str,
) -> Result<QualityGateResult, String> {
    let start = Instant::now();

    // Use platform-appropriate shell
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", command])
            .current_dir(cwd)
            .output()
    } else {
        Command::new("sh")
            .args(["-c", command])
            .current_dir(cwd)
            .output()
    };

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
