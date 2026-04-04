use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Outgoing messages (written to CLI stdin) ───────────────────────

/// Sends user text to the CLI via stdin.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserInputMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub message: UserInputContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_use_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserInputContent {
    pub role: String,
    pub content: String,
}

impl UserInputMessage {
    pub fn new(text: &str) -> Self {
        Self {
            msg_type: "user".to_string(),
            message: UserInputContent {
                role: "user".to_string(),
                content: text.to_string(),
            },
            parent_tool_use_id: None,
        }
    }
}

/// Responds to a permission / control request from the CLI.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ControlResponseMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub behavior: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "updatedInput")]
    pub updated_input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl ControlResponseMessage {
    pub fn allow(updated_input: Option<Value>) -> Self {
        Self {
            msg_type: "control_response".to_string(),
            behavior: "allow".to_string(),
            updated_input,
            message: None,
        }
    }

    pub fn deny(reason: Option<String>) -> Self {
        Self {
            msg_type: "control_response".to_string(),
            behavior: "deny".to_string(),
            updated_input: None,
            message: reason,
        }
    }
}

// ── Incoming messages (parsed from CLI stdout) ─────────────────────
//
// The CLI emits many message shapes. We use a flexible parse approach:
// parse to `serde_json::Value` first, then match on the `type` field.

/// Top-level enum for all incoming NDJSON messages from the CLI.
/// We intentionally use `#[serde(untagged)]` with manual parsing
/// rather than `#[serde(tag = "type")]` for forward-compatibility.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum ClaudeMessage {
    #[serde(rename = "system")]
    System(SystemMessage),
    #[serde(rename = "assistant")]
    Assistant(AssistantMessage),
    #[serde(rename = "user")]
    User(UserEchoMessage),
    #[serde(rename = "result")]
    Result(ResultMessage),
    #[serde(rename = "stream_event")]
    StreamEvent(StreamEventMessage),
    #[serde(rename = "control_request")]
    ControlRequest(ControlRequestMessage),
    #[serde(other)]
    Unknown,
}

// ── System message (init, api_retry, compact_boundary) ─────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude_code_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "permissionMode")]
    pub permission_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_servers: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slash_commands: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agents: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Value>,
    // api_retry fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_delay_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    // compact_boundary fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compact_metadata: Option<Value>,
    // Catch-all for unknown fields
    #[serde(flatten)]
    pub extra: Value,
}

// ── Assistant message ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssistantMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_use_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<AnthropicMessage>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AnthropicMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<ContentBlock>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInfo>,
}

// ── Content blocks ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text {
        text: String,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
    },
    #[serde(rename = "thinking")]
    Thinking {
        thinking: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
    },
    /// Catch-all for unknown content block types.
    #[serde(other)]
    Unknown,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UsageInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u64>,
}

// ── User echo message ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserEchoMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isReplay")]
    pub is_replay: Option<bool>,
    #[serde(flatten)]
    pub extra: Value,
}

// ── Result message ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ResultMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtype: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_api_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "modelUsage")]
    pub model_usage: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_denials: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Value>,
    #[serde(flatten)]
    pub extra: Value,
}

// ── Stream event message ───────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StreamEventMessage {
    /// The raw streaming event (content_block_delta, message_start, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_tool_use_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(flatten)]
    pub extra: Value,
}

// ── Control request (permission) ───────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ControlRequestMessage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<Value>,
    #[serde(flatten)]
    pub extra: Value,
}

// ── Tauri event payloads ───────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClaudeEventPayload {
    pub session_id: String,
    pub message: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PermissionRequestPayload {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClaudeStatusPayload {
    pub session_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ── Fallback parser ────────────────────────────────────────────────
//
// If the tagged enum fails (unexpected fields, new message types), we
// fall back to parsing via `serde_json::Value` and matching on `type`.

pub fn parse_claude_message(line: &str) -> Result<(ClaudeMessage, Value), String> {
    let raw: Value =
        serde_json::from_str(line).map_err(|e| format!("JSON parse error: {e}"))?;

    // Try the tagged enum first
    match serde_json::from_value::<ClaudeMessage>(raw.clone()) {
        Ok(msg) => Ok((msg, raw)),
        Err(_) => {
            // Fallback: return Unknown variant with the raw value
            Ok((ClaudeMessage::Unknown, raw))
        }
    }
}
