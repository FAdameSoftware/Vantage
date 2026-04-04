use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PrerequisiteResult {
    pub name: String,
    pub passed: bool,
    pub version: Option<String>,
    pub message: String,
    pub install_hint: Option<String>,
    /// "error" = blocks launch, "warning" = can proceed
    pub severity: String,
}

/// Run all prerequisite checks and return results.
pub fn check_all() -> Vec<PrerequisiteResult> {
    vec![
        check_git(),
        check_git_bash(),
        check_claude_code(),
        check_long_paths(),
    ]
}

fn check_git() -> PrerequisiteResult {
    // Check if git is on PATH
    let where_output = Command::new("where.exe")
        .arg("git")
        .output();

    match where_output {
        Ok(output) if output.status.success() => {
            // git found, get version
            let version_output = Command::new("git")
                .arg("--version")
                .output();

            match version_output {
                Ok(v) if v.status.success() => {
                    let version = String::from_utf8_lossy(&v.stdout).trim().to_string();
                    PrerequisiteResult {
                        name: "Git".to_string(),
                        passed: true,
                        version: Some(version.clone()),
                        message: format!("Found: {}", version),
                        install_hint: None,
                        severity: "error".to_string(),
                    }
                }
                _ => PrerequisiteResult {
                    name: "Git".to_string(),
                    passed: true,
                    version: None,
                    message: "Git found on PATH but could not determine version".to_string(),
                    install_hint: None,
                    severity: "error".to_string(),
                },
            }
        }
        _ => PrerequisiteResult {
            name: "Git".to_string(),
            passed: false,
            version: None,
            message: "Git is not installed or not on PATH".to_string(),
            install_hint: Some("Run: winget install Git.Git".to_string()),
            severity: "error".to_string(),
        },
    }
}

fn check_git_bash() -> PrerequisiteResult {
    // Check environment variable override first
    if let Ok(env_path) = std::env::var("CLAUDE_CODE_GIT_BASH_PATH") {
        if std::path::Path::new(&env_path).exists() {
            return PrerequisiteResult {
                name: "Git Bash".to_string(),
                passed: true,
                version: None,
                message: format!("Found at: {}", env_path),
                install_hint: None,
                severity: "error".to_string(),
            };
        }
    }

    // Check standard paths
    let standard_paths = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ];

    for path in &standard_paths {
        if std::path::Path::new(path).exists() {
            return PrerequisiteResult {
                name: "Git Bash".to_string(),
                passed: true,
                version: None,
                message: format!("Found at: {}", path),
                install_hint: None,
                severity: "error".to_string(),
            };
        }
    }

    // Try deriving from `where.exe git` — git.exe is in cmd\, bash.exe is in bin\
    if let Ok(output) = Command::new("where.exe").arg("git").output() {
        if output.status.success() {
            let git_path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();

            // git.exe is typically at <root>/cmd/git.exe, bash.exe at <root>/bin/bash.exe
            if let Some(cmd_dir) = std::path::Path::new(&git_path).parent() {
                if let Some(git_root) = cmd_dir.parent() {
                    let bash_path = git_root.join("bin").join("bash.exe");
                    if bash_path.exists() {
                        return PrerequisiteResult {
                            name: "Git Bash".to_string(),
                            passed: true,
                            version: None,
                            message: format!("Found at: {}", bash_path.display()),
                            install_hint: None,
                            severity: "error".to_string(),
                        };
                    }
                }
            }
        }
    }

    PrerequisiteResult {
        name: "Git Bash".to_string(),
        passed: false,
        version: None,
        message: "Git Bash not found".to_string(),
        install_hint: Some("Install Git for Windows from git-scm.com".to_string()),
        severity: "error".to_string(),
    }
}

fn check_claude_code() -> PrerequisiteResult {
    // Check if claude is on PATH
    let where_output = Command::new("where.exe")
        .arg("claude")
        .output();

    match where_output {
        Ok(output) if output.status.success() => {
            // claude found, get version
            let version_output = Command::new("claude")
                .arg("--version")
                .output();

            match version_output {
                Ok(v) if v.status.success() => {
                    let version = String::from_utf8_lossy(&v.stdout).trim().to_string();
                    PrerequisiteResult {
                        name: "Claude Code CLI".to_string(),
                        passed: true,
                        version: Some(version.clone()),
                        message: format!("Found: {}", version),
                        install_hint: None,
                        severity: "error".to_string(),
                    }
                }
                _ => PrerequisiteResult {
                    name: "Claude Code CLI".to_string(),
                    passed: true,
                    version: None,
                    message: "Claude CLI found on PATH but could not determine version".to_string(),
                    install_hint: None,
                    severity: "error".to_string(),
                },
            }
        }
        _ => PrerequisiteResult {
            name: "Claude Code CLI".to_string(),
            passed: false,
            version: None,
            message: "Claude Code CLI is not installed or not on PATH".to_string(),
            install_hint: Some("Run: npm install -g @anthropic-ai/claude-code".to_string()),
            severity: "error".to_string(),
        },
    }
}

fn check_long_paths() -> PrerequisiteResult {
    let reg_output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SYSTEM\CurrentControlSet\Control\FileSystem",
            "/v",
            "LongPathsEnabled",
        ])
        .output();

    match reg_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // The output contains a line like: "    LongPathsEnabled    REG_DWORD    0x1"
            // We look for the hex value at the end
            let enabled = stdout
                .lines()
                .find(|line| line.contains("LongPathsEnabled"))
                .and_then(|line| {
                    // Extract the value after REG_DWORD — it's a hex string like 0x1
                    line.split_whitespace().last()
                })
                .map(|val| val.trim_start_matches("0x") != "0")
                .unwrap_or(false);

            if enabled {
                PrerequisiteResult {
                    name: "Long Paths".to_string(),
                    passed: true,
                    version: None,
                    message: "Long path support is enabled".to_string(),
                    install_hint: None,
                    severity: "warning".to_string(),
                }
            } else {
                PrerequisiteResult {
                    name: "Long Paths".to_string(),
                    passed: false,
                    version: None,
                    message: "Long path support is disabled — some deep paths may fail".to_string(),
                    install_hint: Some(
                        r"Run as admin: reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f"
                            .to_string(),
                    ),
                    severity: "warning".to_string(),
                }
            }
        }
        _ => PrerequisiteResult {
            name: "Long Paths".to_string(),
            passed: false,
            version: None,
            message: "Could not check long path support (registry query failed)".to_string(),
            install_hint: Some(
                r"Run as admin: reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f"
                    .to_string(),
            ),
            severity: "warning".to_string(),
        },
    }
}
