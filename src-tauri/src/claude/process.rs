use std::collections::VecDeque;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::protocol::{
    parse_claude_message, ClaudeEventPayload, ClaudeMessage, ClaudeStatusPayload,
    ControlResponseMessage, PermissionRequestPayload, UserInputMessage,
};

/// Options that control how a Claude Code CLI session is spawned.
#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct SpawnOptions {
    /// Effort level: "low", "medium", or "high".
    /// Sets CLAUDE_CODE_EFFORT_LEVEL env var.
    pub effort_level: Option<String>,
    /// If true, pass --permission-mode plan to the CLI.
    pub plan_mode: bool,
    /// If set, pass --from-pr <number> to the CLI.
    pub from_pr: Option<u32>,
    /// If true, pass --dangerously-skip-permissions to the CLI.
    pub skip_permissions: bool,
}

/// Manages a single Claude Code CLI child process.
pub struct ClaudeProcess {
    child: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    /// The CLI-assigned session ID (extracted from system/init message).
    cli_session_id: Arc<Mutex<Option<String>>>,
    /// Our internal session identifier.
    #[allow(dead_code)]
    pub session_id: String,
    is_alive: Arc<Mutex<bool>>,
}

impl ClaudeProcess {
    /// Spawn a new Claude Code CLI process.
    ///
    /// - `cwd`: working directory for the CLI
    /// - `session_id`: our internal session ID (UUID)
    /// - `resume_session_id`: if set, pass `--resume <id>` to continue a previous session
    /// - `resume`: if true and `resume_session_id` is None, pass `--continue`
    pub fn spawn(
        app_handle: &AppHandle,
        cwd: &str,
        session_id: &str,
        resume_session_id: Option<&str>,
        resume: bool,
        options: &SpawnOptions,
    ) -> Result<Self, String> {
        let binary = if cfg!(windows) {
            "claude.exe"
        } else {
            "claude"
        };

        let mut cmd = Command::new(binary);
        cmd.arg("-p")
            .arg("")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--input-format")
            .arg("stream-json")
            .arg("--verbose")
            .arg("--include-partial-messages")
            .arg("--replay-user-messages");

        // Session / resume flags
        if let Some(sid) = resume_session_id {
            if resume {
                cmd.arg("--resume").arg(sid);
            } else {
                cmd.arg("--session-id").arg(sid);
            }
        } else if resume {
            cmd.arg("--continue");
        }

        // Effort level via environment variable
        if let Some(ref level) = options.effort_level {
            cmd.env("CLAUDE_CODE_EFFORT_LEVEL", level);
        }

        // Plan mode
        if options.plan_mode {
            cmd.arg("--permission-mode").arg("plan");
        }

        // Resume from PR
        if let Some(pr_number) = options.from_pr {
            cmd.arg("--from-pr").arg(pr_number.to_string());
        }

        // Skip permissions (dangerous — bypasses all permission prompts)
        if options.skip_permissions {
            eprintln!("[SECURITY] Starting Claude session with --dangerously-skip-permissions enabled");
            cmd.arg("--dangerously-skip-permissions");
        }

        cmd.current_dir(cwd);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        // On Windows, suppress the console window flash.
        #[cfg(windows)]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!(
                    "Claude Code CLI not found on PATH. Install it with: npm install -g @anthropic-ai/claude-code"
                )
            } else {
                format!("Failed to spawn Claude CLI: {e}")
            }
        })?;

        let child_stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture CLI stdin".to_string())?;
        let child_stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture CLI stdout".to_string())?;
        let child_stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture CLI stderr".to_string())?;

        let process = ClaudeProcess {
            child: Arc::new(Mutex::new(Some(child))),
            stdin: Arc::new(Mutex::new(Some(child_stdin))),
            cli_session_id: Arc::new(Mutex::new(None)),
            session_id: session_id.to_string(),
            is_alive: Arc::new(Mutex::new(true)),
        };

        // Emit starting status
        let _ = app_handle.emit(
            "claude_status",
            ClaudeStatusPayload {
                session_id: session_id.to_string(),
                status: "starting".to_string(),
                error: None,
            },
        );

        // Spawn stdout reader task
        {
            let app = app_handle.clone();
            let sid = session_id.to_string();
            let cli_sid = process.cli_session_id.clone();
            let alive = process.is_alive.clone();

            tokio::spawn(async move {
                let reader = BufReader::new(child_stdout);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    if line.trim().is_empty() {
                        continue;
                    }

                    match parse_claude_message(&line) {
                        Ok((msg, raw)) => {
                            // Extract CLI session ID from system/init
                            if let ClaudeMessage::System(ref sys) = msg {
                                if sys.subtype.as_deref() == Some("init") {
                                    if let Some(ref s) = sys.session_id {
                                        let mut lock = cli_sid.lock().await;
                                        *lock = Some(s.clone());
                                    }
                                    let _ = app.emit(
                                        "claude_status",
                                        ClaudeStatusPayload {
                                            session_id: sid.clone(),
                                            status: "ready".to_string(),
                                            error: None,
                                        },
                                    );
                                }
                            }

                            // Emit permission request as a dedicated event
                            if let ClaudeMessage::ControlRequest(ref cr) = msg {
                                let _ = app.emit(
                                    "claude_permission_request",
                                    PermissionRequestPayload {
                                        session_id: sid.clone(),
                                        tool_name: cr.tool_name.clone(),
                                        tool_input: cr.tool_input.clone(),
                                    },
                                );
                            }

                            // Emit the generic message event with raw JSON
                            let _ = app.emit(
                                "claude_message",
                                ClaudeEventPayload {
                                    session_id: sid.clone(),
                                    message: raw,
                                },
                            );
                        }
                        Err(err) => {
                            eprintln!("[claude stdout parse error] {err}: {line}");
                            // Emit raw message for debugging
                            let _ = app.emit(
                                "claude_raw_message",
                                ClaudeEventPayload {
                                    session_id: sid.clone(),
                                    message: Value::String(line),
                                },
                            );
                        }
                    }
                }

                // EOF reached — process exited
                let mut alive_lock = alive.lock().await;
                *alive_lock = false;
                let _ = app.emit(
                    "claude_status",
                    ClaudeStatusPayload {
                        session_id: sid,
                        status: "stopped".to_string(),
                        error: None,
                    },
                );
            });
        }

        // Spawn stderr reader task (bounded: keeps only last MAX_STDERR_LINES)
        {
            let app = app_handle.clone();
            let sid = session_id.to_string();

            tokio::spawn(async move {
                const MAX_STDERR_LINES: usize = 100;
                let reader = BufReader::new(child_stderr);
                let mut lines = reader.lines();
                let mut _buffer: VecDeque<String> = VecDeque::with_capacity(MAX_STDERR_LINES);

                while let Ok(Some(line)) = lines.next_line().await {
                    eprintln!("[claude stderr] {line}");

                    // Keep only the last MAX_STDERR_LINES in memory
                    if _buffer.len() >= MAX_STDERR_LINES {
                        _buffer.pop_front();
                    }
                    _buffer.push_back(line.clone());

                    // Emit error status for lines that look like errors
                    let lower = line.to_lowercase();
                    if lower.contains("error") || lower.contains("fatal") || lower.contains("panic")
                    {
                        let _ = app.emit(
                            "claude_status",
                            ClaudeStatusPayload {
                                session_id: sid.clone(),
                                status: "error".to_string(),
                                error: Some(line.clone()),
                            },
                        );
                    }
                }
            });
        }

        Ok(process)
    }

    /// Send a user text message to the CLI via stdin.
    pub async fn send_message(&self, content: &str) -> Result<(), String> {
        let msg = UserInputMessage::new(content);
        self.write_stdin(&msg).await
    }

    /// Respond to a permission / control request.
    pub async fn send_permission_response(
        &self,
        allow: bool,
        updated_input: Option<Value>,
        deny_reason: Option<String>,
    ) -> Result<(), String> {
        let msg = if allow {
            ControlResponseMessage::allow(updated_input)
        } else {
            ControlResponseMessage::deny(deny_reason)
        };
        self.write_stdin(&msg).await
    }

    /// Interrupt the current generation.
    /// On Windows we drop stdin to signal EOF (no SIGINT available without a console).
    /// On Unix we kill the child process (safe alternative to libc::kill).
    pub async fn interrupt(&self) -> Result<(), String> {
        #[cfg(unix)]
        {
            let mut lock = self.child.lock().await;
            if let Some(ref mut child) = *lock {
                // Use the safe tokio Child::start_kill() instead of unsafe libc::kill().
                // This avoids PID reuse vulnerabilities and doesn't require the libc crate.
                let _ = child.start_kill();
                return Ok(());
            }
        }

        // Windows fallback or if child has no pid: drop stdin
        let mut stdin_lock = self.stdin.lock().await;
        *stdin_lock = None;
        Ok(())
    }

    /// Gracefully stop the process.
    pub async fn stop(&self) -> Result<(), String> {
        // Drop stdin first to signal EOF
        {
            let mut stdin_lock = self.stdin.lock().await;
            *stdin_lock = None;
        }

        // Kill the child process
        let mut child_lock = self.child.lock().await;
        if let Some(ref mut child) = *child_lock {
            let _ = child.kill().await;
        }
        *child_lock = None;

        let mut alive_lock = self.is_alive.lock().await;
        *alive_lock = false;

        Ok(())
    }

    /// Check if the process is still running.
    pub async fn is_alive(&self) -> bool {
        *self.is_alive.lock().await
    }

    /// Get the CLI-assigned session ID (from the system/init message).
    pub async fn get_cli_session_id(&self) -> Option<String> {
        self.cli_session_id.lock().await.clone()
    }

    // ── Internal helpers ────────────────────────────────────────────

    /// Serialize a message and write it as a single NDJSON line to stdin.
    async fn write_stdin<T: Serialize>(&self, msg: &T) -> Result<(), String> {
        let mut json = serde_json::to_string(msg).map_err(|e| format!("Serialize error: {e}"))?;
        json.push('\n');

        let mut lock = self.stdin.lock().await;
        let stdin = lock
            .as_mut()
            .ok_or_else(|| "CLI stdin is closed".to_string())?;

        stdin
            .write_all(json.as_bytes())
            .await
            .map_err(|e| format!("Write to stdin failed: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Flush stdin failed: {e}"))?;

        Ok(())
    }
}

/// Run a single-shot `claude -p "<prompt>"` query and return the text response.
///
/// This is used by the Ctrl+K inline AI edit feature.  Unlike a full session it:
/// - does not stream events,
/// - does not manage session state,
/// - collects all stdout and returns the first `result` message's text content.
pub async fn claude_single_shot(prompt: String, cwd: Option<String>) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    // Validate prompt length to prevent runaway input
    if prompt.len() > 64_000 {
        return Err("Prompt too long (max 64 000 chars)".to_string());
    }

    let binary = if cfg!(windows) { "claude.exe" } else { "claude" };

    let mut cmd = tokio::process::Command::new(binary);
    cmd.arg("-p").arg(&prompt).arg("--output-format").arg("json");

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
                .to_string()
        } else {
            format!("Failed to spawn Claude CLI: {e}")
        }
    })?;

    // Collect stdout (max 1 MB to prevent OOM)
    let mut stdout_text = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        let mut buf = Vec::new();
        stdout.read_to_end(&mut buf).await.ok();
        stdout_text = String::from_utf8_lossy(&buf).into_owned();
    }

    // Wait for the process to exit
    child.wait().await.ok();

    // With --output-format json the output is a single JSON object.
    // Extract the text from `result` field, falling back to the raw output.
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout_text) {
        if let Some(text) = val
            .get("result")
            .and_then(|r| r.as_str())
        {
            return Ok(text.to_string());
        }
        // Some versions wrap in a `content` array
        if let Some(content) = val.get("content").and_then(|c| c.as_array()) {
            let combined: String = content
                .iter()
                .filter_map(|item| {
                    if item.get("type")?.as_str()? == "text" {
                        item.get("text")?.as_str().map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("");
            if !combined.is_empty() {
                return Ok(combined);
            }
        }
    }

    // Fall back to raw stdout if JSON parsing fails
    let trimmed = stdout_text.trim().to_string();
    if trimmed.is_empty() {
        Err("Claude returned an empty response".to_string())
    } else {
        Ok(trimmed)
    }
}

impl Drop for ClaudeProcess {
    fn drop(&mut self) {
        // Best-effort cleanup: try to kill the child if it still exists.
        // We can't use async here, so use try_lock + start_kill.
        if let Ok(mut lock) = self.child.try_lock() {
            if let Some(ref mut child) = *lock {
                let _ = child.start_kill();
            }
        }
    }
}
