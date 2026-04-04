// ─── Content block types ────────────────────────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

// ─── Usage ──────────────────────────────────────────────────────────────────

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// ─── Stream event subtypes ──────────────────────────────────────────────────

export interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: ContentBlock[];
  };
}

export interface ContentBlockStartTextBlock {
  type: "text";
  text: string;
}

export interface ContentBlockStartThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface ContentBlockStartToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlockStartBlock =
  | ContentBlockStartTextBlock
  | ContentBlockStartThinkingBlock
  | ContentBlockStartToolUseBlock;

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: ContentBlockStartBlock;
}

export interface TextDelta {
  type: "text_delta";
  text: string;
}

export interface InputJsonDelta {
  type: "input_json_delta";
  partial_json: string;
}

export interface ThinkingDelta {
  type: "thinking_delta";
  thinking: string;
}

export type ContentDelta = TextDelta | InputJsonDelta | ThinkingDelta;

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: ContentDelta;
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageDeltaEvent {
  type: "message_delta";
  delta: { stop_reason: string };
  usage: { output_tokens: number };
}

export interface MessageStopEvent {
  type: "message_stop";
}

export type StreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent;

// ─── Top-level NDJSON message types ─────────────────────────────────────────

export interface SystemInitMessage {
  type: "system";
  subtype: "init";
  session_id: string;
  uuid: string;
  model: string;
  tools: string[];
  version?: string;
  cwd?: string;
  permissionMode?: string;
  mcp_servers?: Array<{ name: string; status: string }>;
  claude_code_version?: string;
  apiKeySource?: string;
}

export interface SystemApiRetryMessage {
  type: "system";
  subtype: "api_retry";
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  error: string;
  error_status?: number;
  uuid?: string;
  session_id?: string;
}

export interface SystemCompactMessage {
  type: "system";
  subtype: "compact_boundary";
  uuid?: string;
  session_id?: string;
  compact_metadata?: {
    trigger: string;
    pre_tokens: number;
  };
}

export type SystemMessage = SystemInitMessage | SystemApiRetryMessage | SystemCompactMessage;

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: ContentBlock[];
  stop_reason?: string;
  usage?: UsageInfo;
}

export interface AssistantMessage {
  type: "assistant";
  uuid: string;
  session_id: string;
  parent_tool_use_id: string | null;
  message: AnthropicMessage;
}

export interface ResultMessage {
  type: "result";
  subtype: string;
  uuid?: string;
  session_id?: string;
  duration_ms: number;
  duration_api_ms?: number;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  usage?: UsageInfo;
  modelUsage?: Record<string, { input_tokens: number; output_tokens: number }>;
  result?: string;
  stop_reason?: string;
  permission_denials?: unknown[];
  errors?: string[];
}

export interface StreamEventMessage {
  type: "stream_event";
  event: StreamEvent;
  uuid?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
}

export interface ControlRequestMessage {
  type: "control_request";
  subtype: "can_use_tool";
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface StatusMessage {
  type: "status";
  message: string;
  uuid?: string;
  session_id?: string;
}

export type ClaudeOutputMessage =
  | SystemMessage
  | AssistantMessage
  | ResultMessage
  | StreamEventMessage
  | ControlRequestMessage
  | StatusMessage;

// ─── Tauri event payloads ────────────────────────────────────────────────────

export interface ClaudeEventPayload {
  message: ClaudeOutputMessage;
}

export interface PermissionRequestPayload {
  tool_name: string;
  tool_input: Record<string, unknown>;
  session_id: string;
}

export interface ClaudeStatusPayload {
  status: string;
  error?: string;
}
