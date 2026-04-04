use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::protocol::{
    parse_claude_message, ClaudeEventPayload, ClaudeMessage, ClaudeStatusPayload,
    ControlResponseMessage, PermissionRequestPayload, UserInputMessage,
};

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

        // Spawn stderr reader task
        {
            let app = app_handle.clone();
            let sid = session_id.to_string();

            tokio::spawn(async move {
                let reader = BufReader::new(child_stderr);
                let mut lines = reader.lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    eprintln!("[claude stderr] {line}");

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
    /// On Unix we send SIGINT.
    pub async fn interrupt(&self) -> Result<(), String> {
        #[cfg(unix)]
        {
            let lock = self.child.lock().await;
            if let Some(ref child) = *lock {
                if let Some(id) = child.id() {
                    unsafe {
                        libc::kill(id as i32, libc::SIGINT);
                    }
                    return Ok(());
                }
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
