use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
    pub is_default: bool,
}

/// Detect available shells on Windows.
/// Priority order: PowerShell 7 > Windows PowerShell 5.1 > Git Bash > CMD
pub fn detect_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();
    let mut found_default = false;

    // 1. PowerShell 7+ (pwsh.exe) -- check common install locations
    if let Some(pwsh_path) = find_pwsh() {
        let is_default = !found_default;
        if is_default {
            found_default = true;
        }
        shells.push(ShellInfo {
            name: "PowerShell".to_string(),
            path: pwsh_path,
            args: vec!["-NoLogo".to_string()],
            is_default,
        });
    }

    // 2. Windows PowerShell 5.1 (powershell.exe) -- always available on Windows 10+
    let windows_ps = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    if PathBuf::from(windows_ps).exists() {
        let is_default = !found_default;
        if is_default {
            found_default = true;
        }
        shells.push(ShellInfo {
            name: "Windows PowerShell".to_string(),
            path: windows_ps.to_string(),
            args: vec!["-NoLogo".to_string()],
            is_default,
        });
    }

    // 3. Git Bash -- check common install locations
    let git_bash_paths = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ];
    for git_bash in &git_bash_paths {
        if PathBuf::from(git_bash).exists() {
            let is_default = !found_default;
            if is_default {
                found_default = true;
            }
            shells.push(ShellInfo {
                name: "Git Bash".to_string(),
                path: git_bash.to_string(),
                args: vec!["--login".to_string(), "-i".to_string()],
                is_default,
            });
            break;
        }
    }

    // 4. CMD -- always available
    let cmd_path = r"C:\Windows\System32\cmd.exe";
    if PathBuf::from(cmd_path).exists() {
        let is_default = !found_default;
        if is_default {
            let _ = found_default;
        }
        shells.push(ShellInfo {
            name: "Command Prompt".to_string(),
            path: cmd_path.to_string(),
            args: vec![],
            is_default,
        });
    }

    shells
}

/// Find PowerShell 7+ (pwsh.exe) by checking common locations and PATH.
fn find_pwsh() -> Option<String> {
    // Check common install paths first
    let common_paths = [
        r"C:\Program Files\PowerShell\7\pwsh.exe",
        r"C:\Program Files (x86)\PowerShell\7\pwsh.exe",
    ];

    for path in &common_paths {
        if PathBuf::from(path).exists() {
            return Some(path.to_string());
        }
    }

    // Fall back to checking PATH via `where`
    if let Ok(output) = Command::new("where").arg("pwsh").output() {
        if output.status.success() {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                if let Some(first_line) = stdout.lines().next() {
                    let trimmed = first_line.trim();
                    if !trimmed.is_empty() && PathBuf::from(trimmed).exists() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Get the default shell for spawning terminals.
pub fn get_default_shell() -> ShellInfo {
    let shells = detect_shells();
    shells
        .into_iter()
        .find(|s| s.is_default)
        .unwrap_or(ShellInfo {
            name: "Command Prompt".to_string(),
            path: r"C:\Windows\System32\cmd.exe".to_string(),
            args: vec![],
            is_default: true,
        })
}
