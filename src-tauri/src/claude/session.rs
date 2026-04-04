use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::sync::Mutex;

use super::process::ClaudeProcess;

// ── Session info (returned to frontend for session list) ───────────

#[derive(Serialize, Deserialize, Clone, Debug, specta::Type)]
pub struct SessionInfo {
    pub session_id: String,
    pub file_path: String,
    pub last_modified: f64,
    pub file_size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_message: Option<String>,
    pub line_count: u32,
}

// ── Session manager ────────────────────────────────────────────────

/// Manages all active Claude Code sessions.
pub struct SessionManager {
    pub processes: Arc<Mutex<HashMap<String, ClaudeProcess>>>,
    pub app_handle: AppHandle,
}

impl SessionManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
        }
    }

    /// Start a new Claude Code session.
    /// Returns the internal session ID.
    pub async fn start_session(
        &self,
        cwd: &str,
        resume_session_id: Option<&str>,
        resume: bool,
    ) -> Result<String, String> {
        let internal_id = uuid::Uuid::new_v4().to_string();

        let process = ClaudeProcess::spawn(
            &self.app_handle,
            cwd,
            &internal_id,
            resume_session_id,
            resume,
        )?;

        let mut procs = self.processes.lock().await;
        procs.insert(internal_id.clone(), process);

        Ok(internal_id)
    }

    /// Send a user message to an active session.
    pub async fn send_message(&self, session_id: &str, content: &str) -> Result<(), String> {
        let procs = self.processes.lock().await;
        let process = procs
            .get(session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;
        process.send_message(content).await
    }

    /// Send a permission response to an active session.
    pub async fn send_permission_response(
        &self,
        session_id: &str,
        allow: bool,
        updated_input: Option<serde_json::Value>,
        deny_reason: Option<String>,
    ) -> Result<(), String> {
        let procs = self.processes.lock().await;
        let process = procs
            .get(session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;
        process
            .send_permission_response(allow, updated_input, deny_reason)
            .await
    }

    /// Interrupt generation in a session.
    pub async fn interrupt_session(&self, session_id: &str) -> Result<(), String> {
        let procs = self.processes.lock().await;
        let process = procs
            .get(session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;
        process.interrupt().await
    }

    /// Stop a session and remove it from tracking.
    pub async fn stop_session(&self, session_id: &str) -> Result<(), String> {
        let mut procs = self.processes.lock().await;
        if let Some(process) = procs.remove(session_id) {
            process.stop().await?;
        }
        Ok(())
    }

    /// Stop all active sessions.
    #[allow(dead_code)]
    pub async fn stop_all(&self) {
        let mut procs = self.processes.lock().await;
        let ids: Vec<String> = procs.keys().cloned().collect();
        for id in ids {
            if let Some(process) = procs.remove(&id) {
                let _ = process.stop().await;
            }
        }
    }

    /// List internal IDs of all active sessions.
    pub async fn list_active(&self) -> Vec<String> {
        let procs = self.processes.lock().await;
        procs.keys().cloned().collect()
    }

    /// Check if a session is alive.
    pub async fn is_session_alive(&self, session_id: &str) -> bool {
        let procs = self.processes.lock().await;
        if let Some(process) = procs.get(session_id) {
            process.is_alive().await
        } else {
            false
        }
    }

    /// Get the CLI-assigned session ID for a session.
    #[allow(dead_code)]
    pub async fn get_cli_session_id(&self, session_id: &str) -> Option<String> {
        let procs = self.processes.lock().await;
        if let Some(process) = procs.get(session_id) {
            process.get_cli_session_id().await
        } else {
            None
        }
    }
}

// ── Session discovery (reading past sessions from disk) ────────────

/// Encode a working directory path the same way Claude Code does:
/// replace every non-alphanumeric character with `-`.
pub fn encode_cwd_for_session_path(cwd: &str) -> String {
    cwd.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect()
}

/// Get the `~/.claude/projects/` directory.
pub fn get_claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

/// Get the session directory for a specific project working directory.
pub fn get_session_dir_for_project(cwd: &str) -> Option<PathBuf> {
    get_claude_projects_dir().map(|p| p.join(encode_cwd_for_session_path(cwd)))
}

/// List past sessions for a project by scanning JSONL files on disk.
pub fn list_sessions_for_project(cwd: &str) -> Vec<SessionInfo> {
    let session_dir = match get_session_dir_for_project(cwd) {
        Some(d) => d,
        None => return Vec::new(),
    };

    if !session_dir.exists() || !session_dir.is_dir() {
        return Vec::new();
    }

    let mut sessions = Vec::new();

    let entries = match std::fs::read_dir(&session_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        let file_name = match path.file_stem().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let metadata = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);

        let file_size = metadata.len();

        // Parse first user message from the first 50 lines
        let (first_message, line_count) = parse_session_metadata(&path);

        sessions.push(SessionInfo {
            session_id: file_name,
            file_path: path.to_string_lossy().to_string(),
            last_modified,
            file_size,
            first_message,
            line_count,
        });
    }

    // Sort by last_modified descending (newest first)
    sessions.sort_by(|a, b| b.last_modified.partial_cmp(&a.last_modified).unwrap_or(std::cmp::Ordering::Equal));

    sessions
}

/// Read first ~50 lines of a JSONL session file to extract the first
/// user message and count total lines.
fn parse_session_metadata(path: &PathBuf) -> (Option<String>, u32) {
    use std::io::{BufRead, BufReader};

    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return (None, 0),
    };

    let reader = BufReader::new(file);
    let mut first_message: Option<String> = None;
    let mut line_count: u32 = 0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        line_count += 1;

        // Only scan first 50 lines for the first user message
        if first_message.is_none() && line_count <= 50 {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                if val.get("type").and_then(|t| t.as_str()) == Some("user") {
                    // Try to extract content from the message
                    let content = val
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                        .map(|s| {
                            if s.len() > 200 {
                                format!("{}...", &s[..200])
                            } else {
                                s.to_string()
                            }
                        });
                    first_message = content;
                }
            }
        }
    }

    (first_message, line_count)
}
