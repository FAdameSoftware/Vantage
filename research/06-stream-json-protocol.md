# The Stream-JSON Protocol: Complete Integration Reference for Vantage

**Date**: 2026-04-03
**Purpose**: Definitive technical reference for integrating Vantage (Tauri v2 + React) with Claude Code CLI via the stream-json NDJSON protocol and the Claude Agent SDK.

---

## Table of Contents

1. [Integration Strategy Decision](#1-integration-strategy-decision)
2. [The stream-json NDJSON Protocol](#2-the-stream-json-ndjson-protocol)
3. [Output Message Types (stdout)](#3-output-message-types-stdout)
4. [Input Message Types (stdin)](#4-input-message-types-stdin)
5. [Streaming Events (Partial Messages)](#5-streaming-events-partial-messages)
6. [Permission Handling](#6-permission-handling)
7. [Session Management](#7-session-management)
8. [The Claude Agent SDK (Official)](#8-the-claude-agent-sdk-official)
9. [SDK Message Types (Complete TypeScript Definitions)](#9-sdk-message-types-complete-typescript-definitions)
10. [The Agent SDK V2 Preview](#10-the-agent-sdk-v2-preview)
11. [Process Management Patterns](#11-process-management-patterns)
12. [The Tauri + Agent SDK Bridge Pattern](#12-the-tauri--agent-sdk-bridge-pattern)
13. [The --permission-prompt-tool Flag](#13-the---permission-prompt-tool-flag)
14. [Existing Parsers and Libraries](#14-existing-parsers-and-libraries)
15. [The --sdk-url WebSocket Protocol (Undocumented)](#15-the---sdk-url-websocket-protocol-undocumented)
16. [CLI Flags Reference (Integration-Relevant)](#16-cli-flags-reference-integration-relevant)
17. [Critical Implementation Decisions for Vantage](#17-critical-implementation-decisions-for-vantage)

---

## 1. Integration Strategy Decision

There are **three viable approaches** for Vantage to integrate with Claude Code. Each has distinct trade-offs:

### Option A: Raw CLI with stream-json (stdin/stdout)

```
React Frontend <-> Tauri IPC <-> Rust Process Manager <-> claude CLI (stream-json) <-> Anthropic API
```

**Pros**: No Node.js dependency, direct control, lightweight
**Cons**: Undocumented input protocol, must handle all parsing, no official support guarantees

### Option B: Claude Agent SDK (TypeScript) via Node.js Sidecar

```
React Frontend <-> Tauri IPC <-> Rust AgentBridge <-> Node.js Sidecar (@anthropic-ai/claude-agent-sdk) <-> Anthropic API
```

**Pros**: Officially supported, rich typed API, callbacks for permissions, session management built-in, hook system
**Cons**: Requires Node.js sidecar process, additional complexity, ~50MB sidecar overhead

### Option C: Hybrid -- SDK for sessions, CLI for lightweight tasks

```
Sessions: React <-> Tauri IPC <-> Rust <-> Node.js Sidecar (Agent SDK)
One-shots: React <-> Tauri IPC <-> Rust <-> claude -p (stream-json) <-> API
```

**Recommendation**: **Option B (Agent SDK via Node.js sidecar)** is the strongest path. This is exactly the pattern used by Anthropic's own Claude Code Desktop app (which is itself Tauri 2 + React 19 + Rust + Node.js sidecar). The SDK provides:
- Official TypeScript types for all messages
- `canUseTool` callback for permission UI
- `streamInput()` for multi-turn conversations
- Session resume/fork/continue
- Hook system for lifecycle events
- MCP server management
- Structured outputs

The raw CLI stream-json protocol remains useful as a fallback for lightweight operations and for understanding what the SDK does under the hood.

**Sources**:
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Desktop AI IDE Architecture Blog Post](https://www.sachinadlakha.us/blog/desktop-ai-ide-claude-sdk)

---

## 2. The stream-json NDJSON Protocol

### Overview

The `--output-format stream-json` flag causes Claude Code CLI to emit **newline-delimited JSON (NDJSON)** on stdout. Each line is a self-contained JSON object terminated with `\n`. Combined with `--input-format stream-json`, this enables **bidirectional programmatic communication** via stdin/stdout.

### Basic Invocation

```bash
# One-shot with streaming output
claude -p "Fix the bug" --output-format stream-json --verbose --include-partial-messages

# Bidirectional NDJSON communication
claude -p "" \
  --input-format stream-json \
  --output-format stream-json \
  --include-partial-messages \
  --replay-user-messages
```

### Key Flags for stream-json

| Flag | Purpose |
|------|---------|
| `--output-format stream-json` | Emit NDJSON on stdout |
| `--input-format stream-json` | Accept NDJSON on stdin |
| `--include-partial-messages` | Emit `stream_event` messages with token-level deltas |
| `--include-hook-events` | Include hook lifecycle events in output |
| `--replay-user-messages` | Echo user messages back on stdout for acknowledgment |
| `--verbose` | Full turn-by-turn output |
| `-p` / `--print` | Non-interactive mode (required for stream-json) |

### Documentation Status

**Critical note**: The `--input-format stream-json` protocol is **largely undocumented**. Anthropic closed GitHub issue #24594 requesting documentation as "not planned". The protocol was reverse-engineered by the community, primarily from The Vibe Companion source code. The official Agent SDK (`@anthropic-ai/claude-agent-sdk`) wraps this protocol and is the supported interface.

**Sources**:
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Run Claude Code Programmatically](https://code.claude.com/docs/en/headless)
- [GitHub Issue #24594](https://github.com/anthropics/claude-code/issues/24594)

---

## 3. Output Message Types (stdout)

Every NDJSON line emitted on stdout contains a `type` field that discriminates the message. Here are all documented message types:

### 3.1 System Init

Emitted once at session start.

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "d8af951f-13ac-4a41-9748-7a7b9a6cfc00",
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent", "WebSearch", "WebFetch"],
  "mcp_servers": [
    {"name": "playwright", "status": "connected"}
  ],
  "model": "claude-opus-4-6-20250415",
  "permissionMode": "default",
  "apiKeySource": "anthropic_api_key",
  "claude_code_version": "2.1.88",
  "cwd": "/Users/me/project",
  "slash_commands": ["/commit", "/review"],
  "agents": ["explore", "plan", "verification"],
  "skills": ["commit", "review-pr"],
  "plugins": [{"name": "my-plugin", "path": "/path/to/plugin"}],
  "output_style": "concise",
  "betas": []
}
```

### 3.2 Assistant Message

A complete assistant turn (after all streaming is done).

```json
{
  "type": "assistant",
  "uuid": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "session_id": "d8af951f-...",
  "parent_tool_use_id": null,
  "message": {
    "id": "msg_01ABC...",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-4-6-20250415",
    "content": [
      {
        "type": "text",
        "text": "Let me look at the auth module..."
      },
      {
        "type": "tool_use",
        "id": "toolu_01ABC...",
        "name": "Read",
        "input": {
          "file_path": "src/auth.ts"
        }
      }
    ],
    "stop_reason": "tool_use",
    "usage": {
      "input_tokens": 1500,
      "output_tokens": 350,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 1200
    }
  }
}
```

The `message` field follows the Anthropic API's `BetaMessage` format. The `content` array contains `text` and `tool_use` blocks.

### 3.3 User Message (with --replay-user-messages)

When `--replay-user-messages` is enabled, user messages sent on stdin are echoed back on stdout:

```json
{
  "type": "user",
  "uuid": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "session_id": "d8af951f-...",
  "parent_tool_use_id": null,
  "message": {
    "role": "user",
    "content": "Fix the auth bug"
  },
  "isReplay": true
}
```

### 3.4 Result Message

Final message when the agent completes (success or error).

**Success:**
```json
{
  "type": "result",
  "subtype": "success",
  "uuid": "d4e5f6a7-b8c9-0123-def0-234567890123",
  "session_id": "d8af951f-...",
  "duration_ms": 45000,
  "duration_api_ms": 38000,
  "is_error": false,
  "num_turns": 5,
  "result": "I've fixed the authentication bug by...",
  "stop_reason": "end_turn",
  "total_cost_usd": 0.0234,
  "usage": {
    "input_tokens": 15000,
    "output_tokens": 3500,
    "cache_creation_input_tokens": 5000,
    "cache_read_input_tokens": 8000
  },
  "modelUsage": {
    "claude-opus-4-6-20250415": {
      "input_tokens": 15000,
      "output_tokens": 3500
    }
  },
  "permission_denials": [],
  "structured_output": null
}
```

**Error (max turns exceeded):**
```json
{
  "type": "result",
  "subtype": "error_max_turns",
  "uuid": "...",
  "session_id": "...",
  "duration_ms": 120000,
  "duration_api_ms": 100000,
  "is_error": true,
  "num_turns": 10,
  "stop_reason": null,
  "total_cost_usd": 0.15,
  "usage": { "input_tokens": 50000, "output_tokens": 12000 },
  "modelUsage": {},
  "permission_denials": [],
  "errors": ["Maximum number of turns (10) reached"]
}
```

Result subtypes: `"success"`, `"error_max_turns"`, `"error_during_execution"`, `"error_max_budget_usd"`, `"error_max_structured_output_retries"`.

### 3.5 API Retry Event

Emitted when an API request fails with a retryable error.

```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 1,
  "max_retries": 10,
  "retry_delay_ms": 5000,
  "error_status": 429,
  "error": "rate_limit",
  "uuid": "...",
  "session_id": "..."
}
```

Error categories: `"authentication_failed"`, `"billing_error"`, `"rate_limit"`, `"invalid_request"`, `"server_error"`, `"max_output_tokens"`, `"unknown"`.

### 3.6 Compact Boundary

Emitted when conversation history is compacted (context window management).

```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "uuid": "...",
  "session_id": "...",
  "compact_metadata": {
    "trigger": "auto",
    "pre_tokens": 167000
  }
}
```

### 3.7 Control Request (Permission Prompt)

When the agent needs permission to use a tool:

```json
{
  "type": "control_request",
  "subtype": "can_use_tool",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/test",
    "description": "Clean up test directory"
  }
}
```

This **blocks** execution until a `control_response` is sent on stdin.

### 3.8 Status Messages

Progress updates during execution:

```json
{
  "type": "status",
  "message": "Reading file src/auth.ts...",
  "uuid": "...",
  "session_id": "..."
}
```

### 3.9 Task Messages (Background Tasks)

```json
{
  "type": "task_started",
  "task_id": "a1b2c3d4",
  "description": "Running tests...",
  "uuid": "...",
  "session_id": "..."
}
```

```json
{
  "type": "task_progress",
  "task_id": "a1b2c3d4",
  "progress": "Test suite: 45/100 passed",
  "uuid": "...",
  "session_id": "..."
}
```

```json
{
  "type": "task_notification",
  "task_id": "a1b2c3d4",
  "status": "completed",
  "uuid": "...",
  "session_id": "..."
}
```

---

## 4. Input Message Types (stdin)

When using `--input-format stream-json`, send NDJSON to stdin. **Each message must be a single line terminated with `\n`.**

### 4.1 User Message

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Fix the bug in auth.py"
  },
  "parent_tool_use_id": null,
  "session_id": "optional-session-id"
}
```

Content can also be multi-part (text + images):

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {"type": "text", "text": "Review this architecture diagram"},
      {
        "type": "image",
        "source": {
          "type": "base64",
          "media_type": "image/png",
          "data": "iVBORw0KGgo..."
        }
      }
    ]
  },
  "parent_tool_use_id": null
}
```

### 4.2 Control Response (Permission Reply)

In response to a `control_request`:

**Allow:**
```json
{
  "type": "control_response",
  "behavior": "allow",
  "updatedInput": {
    "command": "rm -rf /tmp/test",
    "description": "Clean up test directory"
  }
}
```

**Deny:**
```json
{
  "type": "control_response",
  "behavior": "deny",
  "message": "User denied this action"
}
```

**Note**: Older protocol versions used `"allow": true/false` instead of `"behavior"`. The SDK now uses the `behavior` field.

---

## 5. Streaming Events (Partial Messages)

When `--include-partial-messages` is enabled, raw Claude API streaming events are wrapped in `stream_event` messages. These arrive **before** the complete `assistant` message.

### Event Flow

```
stream_event (message_start)
stream_event (content_block_start) - text block
stream_event (content_block_delta) - text chunks...
stream_event (content_block_stop)
stream_event (content_block_start) - tool_use block
stream_event (content_block_delta) - tool input chunks...
stream_event (content_block_stop)
stream_event (message_delta) - stop_reason, usage
stream_event (message_stop)
assistant - complete message with all content
... tool executes ...
... more streaming for next turn ...
result - final result
```

### Event Examples

**Message start:**
```json
{"type": "stream_event", "event": {"type": "message_start", "message": {"id": "msg_01ABC...", "type": "message", "role": "assistant", "content": [], "model": "claude-opus-4-6-20250415"}}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

**Text block start:**
```json
{"type": "stream_event", "event": {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

**Text delta (individual tokens):**
```json
{"type": "stream_event", "event": {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Let me"}}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

**Tool use block start:**
```json
{"type": "stream_event", "event": {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "toolu_01ABC...", "name": "Read", "input": {}}}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

**Tool input delta (partial JSON):**
```json
{"type": "stream_event", "event": {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\"file_path\":\"src/auth.ts\"}"}}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

**Block stop:**
```json
{"type": "stream_event", "event": {"type": "content_block_stop", "index": 1}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

**Message delta (stop reason):**
```json
{"type": "stream_event", "event": {"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 350}}, "uuid": "...", "session_id": "...", "parent_tool_use_id": null}
```

### The Verbose Mode Deduplication Problem

When using `--verbose` (required for full output), assistant messages are emitted as **cumulative snapshots** -- each subsequent `assistant` message contains ALL content blocks seen so far, not just new ones. Without deduplication, the UI would render duplicate content.

**Solution**: Use content fingerprinting. Track which content blocks have been seen (by their text content hash or tool_use ID) and only render new ones. The `claude-code-parser` library handles this with its `Translator` class.

### Subagent Interleaving

Messages from subagents include a non-null `parent_tool_use_id` that matches the `id` of the `tool_use` block that spawned them. Use this to:
- Route subagent messages to separate UI panels
- Track which agent produced which output
- Build nested conversation trees

---

## 6. Permission Handling

### Via the Agent SDK (Recommended)

The SDK's `canUseTool` callback is the cleanest permission mechanism:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Fix the bug",
  options: {
    canUseTool: async (toolName, input, options) => {
      // options includes: signal, suggestions, blockedPath, decisionReason, toolUseID, agentID

      // Show UI and wait for user decision
      const decision = await showPermissionDialog(toolName, input);

      if (decision.approved) {
        return {
          behavior: "allow",
          updatedInput: input,  // Can modify input before execution
          updatedPermissions: decision.permanentRules  // Optional: add permanent rules
        };
      } else {
        return {
          behavior: "deny",
          message: "User denied this action"
        };
      }
    }
  }
})) {
  // Process messages...
}
```

### Via Raw CLI (control_request/control_response)

When using stream-json directly:

1. CLI emits `control_request` on stdout
2. Your app reads it, shows UI
3. User decides
4. Your app sends `control_response` on stdin
5. CLI continues or aborts

**The control_request blocks indefinitely** -- there is no timeout. The user can take as long as they want.

### Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Everything not pre-approved triggers canUseTool / control_request |
| `acceptEdits` | File edits auto-approved; Bash/network still prompt |
| `dontAsk` | Anything not pre-approved is denied (no prompt) |
| `bypassPermissions` | Everything auto-approved (dangerous) |
| `plan` | No tool execution at all |
| `auto` | Model classifier decides (requires Team/Enterprise plan) |

### Permission Evaluation Order

1. **Hooks** (PreToolUse) -- can allow, deny, or continue
2. **Deny rules** (disallowedTools, settings.json) -- always win
3. **Permission mode** -- bypassPermissions approves all remaining
4. **Allow rules** (allowedTools, settings.json) -- pre-approve matching
5. **canUseTool callback / control_request** -- prompt user

**Sources**:
- [Configure Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Handle Approvals and User Input](https://platform.claude.com/docs/en/agent-sdk/user-input)

---

## 7. Session Management

### Session Storage

Sessions are stored as JSONL files at:
```
~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
```

Where `<encoded-cwd>` replaces every non-alphanumeric character with `-`:
- `/Users/me/proj` becomes `-Users-me-proj`
- `C:\Users\me\proj` becomes `C--Users-me-proj`

### CLI Flags

| Flag | Purpose |
|------|---------|
| `--session-id <uuid>` | Use a specific session UUID |
| `--continue` / `-c` | Continue most recent session in CWD |
| `--resume <id-or-name>` / `-r` | Resume specific session by ID or name |
| `--fork-session` | Create new session forked from resumed session |
| `--name <name>` / `-n` | Set display name for session |
| `--no-session-persistence` | Don't persist session to disk |

### Session Resume via SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Capture session ID from init message
let sessionId: string;
for await (const message of query({
  prompt: "Analyze the auth module",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Later: resume with full context
for await (const message of query({
  prompt: "Now fix the issues you found",
  options: { resume: sessionId }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Session Fork

```typescript
// Fork creates a new session with copied history; original unchanged
for await (const message of query({
  prompt: "Try a different approach",
  options: { resume: sessionId, forkSession: true }
})) {
  if (message.type === "system" && message.subtype === "init") {
    const forkedId = message.session_id; // New ID, different from sessionId
  }
}
```

### Session Discovery

```typescript
import { listSessions, getSessionMessages, getSessionInfo } from "@anthropic-ai/claude-agent-sdk";

// List recent sessions
const sessions = await listSessions({ dir: "/path/to/project", limit: 10 });
for (const s of sessions) {
  console.log(`${s.summary} (${s.sessionId}) - ${new Date(s.lastModified)}`);
}

// Read session messages
const messages = await getSessionMessages(sessions[0].sessionId, {
  dir: "/path/to/project",
  limit: 50
});
```

### Cross-Host Resume

Sessions are local to the machine. To resume on a different host:
1. Copy the `.jsonl` file to `~/.claude/projects/<encoded-cwd>/` on the target
2. Ensure `cwd` matches
3. Or: capture results from first run and pass as context to fresh session

**Sources**:
- [Work with Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)

---

## 8. The Claude Agent SDK (Official)

### Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

(Previously `@anthropic-ai/claude-code` -- renamed to `claude-agent-sdk`)

### How It Works Internally

The SDK spawns a Claude Code CLI process and communicates via NDJSON over stdin/stdout. The SDK wraps the raw stream-json protocol with:
- TypeScript types for all messages
- Async generator for message consumption
- Callback-based permission handling
- Session management
- Hook system
- MCP server management

### Core API: `query()`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

function query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
}): Query;  // Query extends AsyncGenerator<SDKMessage, void>
```

### Two Input Modes

**Single message (one-shot):**
```typescript
for await (const msg of query({ prompt: "Fix the bug" })) { ... }
```

**Streaming input (multi-turn, recommended):**
```typescript
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: "Analyze the codebase" }
  };
  // Wait for user input, conditions, etc.
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: "Now fix the issues" }
  };
}

for await (const msg of query({ prompt: generateMessages(), options: { ... } })) {
  // Process messages
}
```

### Query Object Methods

The `Query` object returned by `query()` provides these methods:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
  reconnectMcpServer(serverName: string): Promise<void>;
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
  stopTask(taskId: string): Promise<void>;
  close(): void;
}
```

### Key Options

```typescript
type Options = {
  // Authentication
  env?: Record<string, string | undefined>;  // Must include ANTHROPIC_API_KEY

  // Model
  model?: string;              // e.g. "claude-opus-4-6", "sonnet", "opus"
  fallbackModel?: string;

  // Permissions
  permissionMode?: PermissionMode;
  allowedTools?: string[];     // Pre-approve these tools
  disallowedTools?: string[];  // Always deny these tools
  canUseTool?: CanUseTool;     // Permission callback

  // Session
  resume?: string;             // Session ID to resume
  continue?: boolean;          // Continue most recent session
  forkSession?: boolean;       // Fork when resuming
  sessionId?: string;          // Use specific UUID
  persistSession?: boolean;    // Default true

  // Streaming
  includePartialMessages?: boolean;  // Emit StreamEvents

  // Limits
  maxTurns?: number;
  maxBudgetUsd?: number;

  // Context
  cwd?: string;
  additionalDirectories?: string[];
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  settingSources?: SettingSource[];  // ['user', 'project', 'local']

  // Tools & Agents
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  agents?: Record<string, AgentDefinition>;
  mcpServers?: Record<string, McpServerConfig>;

  // Hooks
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  // Advanced
  abortController?: AbortController;
  spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
  stderr?: (data: string) => void;
  bare?: boolean;              // Minimal mode
  debug?: boolean;
  thinking?: ThinkingConfig;
  effort?: 'low' | 'medium' | 'high' | 'max';
};
```

**Sources**:
- [TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Streaming Output](https://platform.claude.com/docs/en/agent-sdk/streaming-output)
- [Streaming vs Single Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)

---

## 9. SDK Message Types (Complete TypeScript Definitions)

### SDKMessage Union

```typescript
type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage    // stream_event
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage
  | SDKRateLimitEvent
  | SDKPromptSuggestionMessage;
```

### Core Types

```typescript
type SDKAssistantMessage = {
  type: "assistant";
  uuid: string;
  session_id: string;
  message: BetaMessage;  // From @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  error?: 'authentication_failed' | 'billing_error' | 'rate_limit'
    | 'invalid_request' | 'server_error' | 'max_output_tokens' | 'unknown';
};

type SDKUserMessage = {
  type: "user";
  uuid?: string;
  session_id: string;
  message: MessageParam;  // From @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  tool_use_result?: unknown;
};

type SDKUserMessageReplay = SDKUserMessage & {
  uuid: string;  // Required (not optional)
  isReplay: true;
};

type SDKResultMessage =
  | {
      type: "result";
      subtype: "success";
      uuid: string;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;
      stop_reason: string | null;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      structured_output?: unknown;
    }
  | {
      type: "result";
      subtype: "error_max_turns" | "error_during_execution"
        | "error_max_budget_usd" | "error_max_structured_output_retries";
      uuid: string;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      stop_reason: string | null;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      errors: string[];
    };

type SDKSystemMessage = {
  type: "system";
  subtype: "init";
  uuid: string;
  session_id: string;
  agents?: string[];
  apiKeySource: string;
  betas?: string[];
  claude_code_version: string;
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
  skills: string[];
  plugins: { name: string; path: string }[];
};

type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: BetaRawMessageStreamEvent;  // From @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
};

type SDKCompactBoundaryMessage = {
  type: "system";
  subtype: "compact_boundary";
  uuid: string;
  session_id: string;
  compact_metadata: {
    trigger: "manual" | "auto";
    pre_tokens: number;
  };
};

type SDKPermissionDenial = {
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};
```

### Permission Types

```typescript
type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };
```

### Hook Types

```typescript
type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Notification"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PermissionRequest"
  | "Setup"
  | "TeammateIdle"
  | "TaskCompleted"
  | "ConfigChange"
  | "WorktreeCreate"
  | "WorktreeRemove";

interface HookCallbackMatcher {
  matcher?: string;           // Regex to match tool names
  hooks: HookCallback[];
  timeout?: number;           // Seconds
}

type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

### Agent Definition

```typescript
type AgentDefinition = {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: "sonnet" | "opus" | "haiku" | "inherit";
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  maxTurns?: number;
  criticalSystemReminder_EXPERIMENTAL?: string;
};
```

### Tool Input Schemas (Selected)

```typescript
type BashInput = {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
};

type FileEditInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

type FileReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
  pages?: string;
};

type FileWriteInput = {
  file_path: string;
  content: string;
};

type AgentInput = {
  description: string;
  prompt: string;
  subagent_type: string;
  model?: "sonnet" | "opus" | "haiku";
  resume?: string;
  run_in_background?: boolean;
  max_turns?: number;
  name?: string;
  team_name?: string;
  mode?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  isolation?: "worktree";
};
```

---

## 10. The Agent SDK V2 Preview

The V2 interface simplifies multi-turn conversations with `send()`/`stream()` patterns.

### API Surface

```typescript
// One-shot
const result = await unstable_v2_prompt("What is 2 + 2?", {
  model: "claude-opus-4-6"
});

// Multi-turn session
await using session = unstable_v2_createSession({
  model: "claude-opus-4-6"
});

await session.send("Analyze the codebase");
for await (const msg of session.stream()) { /* ... */ }

await session.send("Now fix the issues");
for await (const msg of session.stream()) { /* ... */ }

// Resume
await using resumed = unstable_v2_resumeSession(sessionId, {
  model: "claude-opus-4-6"
});
```

### SDKSession Interface

```typescript
interface SDKSession {
  readonly sessionId: string;
  send(message: string | SDKUserMessage): Promise<void>;
  stream(): AsyncGenerator<SDKMessage, void>;
  close(): void;
}
```

**Warning**: V2 is unstable preview. APIs may change. Some features (fork, advanced streaming input) are V1-only.

**Sources**:
- [TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)

---

## 11. Process Management Patterns

### Spawning Claude Code

The Agent SDK handles process spawning internally, but understanding the pattern is critical for Vantage's Rust side:

```
Node.js process spawns: claude --bare -p "" \
  --input-format stream-json \
  --output-format stream-json \
  --include-partial-messages \
  --replay-user-messages
```

The SDK communicates via:
- **stdin**: NDJSON user messages, control responses, configuration commands
- **stdout**: NDJSON events (all message types above)
- **stderr**: Debug logs (captured by `stderr` callback)

### Graceful Shutdown

1. Send an interrupt signal via `query.interrupt()` or `query.close()`
2. The SDK sends SIGINT to the CLI process
3. CLI finishes current operation and emits `result` message
4. Process exits

### Process Recovery

If the CLI process crashes:
1. Capture the `session_id` from the `system/init` message
2. On restart, use `resume: sessionId` to continue from where it left off
3. The JSONL transcript on disk preserves all history

### AbortController Pattern

```typescript
const controller = new AbortController();

const q = query({
  prompt: generateMessages(),
  options: { abortController: controller }
});

// Later: cancel everything
controller.abort();
```

### Custom Process Spawning (for Tauri)

The SDK supports custom process spawning via `spawnClaudeCodeProcess`:

```typescript
const q = query({
  prompt: "Fix bugs",
  options: {
    spawnClaudeCodeProcess: (spawnOptions) => {
      // Custom spawn logic -- could use Tauri's sidecar system
      const child = spawn(spawnOptions.command, spawnOptions.args, {
        cwd: spawnOptions.cwd,
        env: spawnOptions.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        pid: child.pid,
        kill: (signal) => child.kill(signal),
        on: (event, handler) => child.on(event, handler),
      };
    }
  }
});
```

---

## 12. The Tauri + Agent SDK Bridge Pattern

This is the production-proven architecture used by Anthropic's own Claude Code Desktop and community projects. It is the **recommended architecture for Vantage**.

### Architecture

```
React 19 Frontend (Tauri WebView)
  |
  | Tauri IPC (invoke + emit)
  v
Rust Backend (AgentBridge)
  |
  | stdin/stdout NDJSON over child process pipes
  v
Node.js Sidecar (bridge.js using @anthropic-ai/claude-agent-sdk)
  |
  | Anthropic API calls
  v
Claude API
```

### Three Message Types in the IPC Protocol

| Direction | Type | Example |
|-----------|------|---------|
| Rust -> Node.js | Requests | `create_session`, `send_message`, `interrupt`, `respond_permission` |
| Node.js -> Rust | Responses | Synchronous replies with success/error status |
| Node.js -> Rust | Events | Unsolicited streaming: `agent_message`, `permission_request`, `stream_delta` |

Both responses and events flow through the same stdout pipe. The Rust side distinguishes them by the `type` field.

### Rust Side Implementation Pattern

```rust
use std::process::{Command, Stdio};
use tokio::sync::mpsc;

struct AgentBridge {
    child: Child,
    stdin: ChildStdin,
    event_tx: mpsc::Sender<AgentEvent>,  // Bounded channel (capacity ~1000)
}

impl AgentBridge {
    fn spawn(sidecar_path: &str) -> Result<Self> {
        let mut child = Command::new("node")
            .arg(sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let stdout = child.stdout.take().unwrap();
        let (event_tx, event_rx) = mpsc::channel(1000);

        // Dedicated reader thread for stdout
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let msg: serde_json::Value = serde_json::from_str(&line?)?;
                event_tx.send(msg.into()).await?;
            }
        });

        Ok(Self { child, stdin, event_tx })
    }

    async fn send_message(&mut self, msg: &str) -> Result<()> {
        writeln!(self.stdin, "{}", serde_json::to_string(&json!({
            "type": "send_message",
            "content": msg
        }))?)?;
        self.stdin.flush()?;
        Ok(())
    }
}
```

### Node.js Sidecar Pattern

```typescript
// bridge.js -- The Node.js sidecar
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin });

// Message queue for streaming input
let messageResolve: ((msg: SDKUserMessage) => void) | null = null;

async function* messageGenerator() {
  while (true) {
    const msg = await new Promise<SDKUserMessage>((resolve) => {
      messageResolve = resolve;
    });
    yield msg;
  }
}

// Handle commands from Rust
rl.on("line", (line) => {
  const cmd = JSON.parse(line);
  switch (cmd.type) {
    case "send_message":
      if (messageResolve) {
        messageResolve({
          type: "user",
          message: { role: "user", content: cmd.content },
          parent_tool_use_id: null,
          session_id: ""
        });
      }
      break;
    case "respond_permission":
      // Resolve pending permission promise
      break;
  }
});

// Start agent loop
const q = query({
  prompt: messageGenerator(),
  options: {
    includePartialMessages: true,
    canUseTool: async (toolName, input) => {
      // Send permission request to Rust
      console.log(JSON.stringify({
        type: "permission_request",
        toolName,
        input
      }));
      // Wait for response from Rust
      return await waitForPermissionResponse();
    }
  }
});

for await (const msg of q) {
  // Forward all messages to Rust via stdout
  console.log(JSON.stringify({ type: "agent_message", message: msg }));
}
```

### Key Design Decisions

1. **Bounded channels prevent OOM**: Use capacity ~1000 for backpressure
2. **Dual-dispatch reader**: Every stdout message goes to both event callback AND response channel
3. **Permission flow crosses three layers**: SDK -> Node.js -> Rust -> Tauri emit -> React -> Tauri invoke -> Rust -> Node.js -> SDK
4. **No timeout on permissions**: User can deliberate as long as needed
5. **Delta accumulation in Zustand**: Don't render individual deltas; accumulate in store

**Sources**:
- [Desktop AI IDE Architecture](https://www.sachinadlakha.us/blog/desktop-ai-ide-claude-sdk)

---

## 13. The --permission-prompt-tool Flag

### Overview

The `--permission-prompt-tool` flag delegates permission decisions to an MCP tool. This is an **alternative** to `canUseTool` when using the raw CLI instead of the SDK.

```bash
claude -p --permission-prompt-tool my_mcp_permission_tool "do the task"
```

### How It Works

1. When Claude wants to use a tool that isn't pre-approved, the CLI calls the specified MCP tool
2. The MCP tool receives the tool name and input as parameters
3. The MCP tool returns allow/deny
4. Claude continues or adjusts based on the response

### MCP Tool Response Format

**Allow:**
```json
{
  "behavior": "allow",
  "updatedInput": { "command": "npm test", "description": "Run tests" }
}
```

**Deny:**
```json
{
  "behavior": "deny",
  "message": "Reason for denial"
}
```

### Building a Custom Permission MCP Server

The tool must be registered as an MCP server. Here is a minimal example:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "permission-handler", version: "1.0.0" });

server.tool(
  "check_permission",
  "Handles permission prompts from Claude Code",
  {
    tool_name: z.string(),
    tool_input: z.record(z.unknown())
  },
  async ({ tool_name, tool_input }) => {
    // Your custom logic: check allowlists, send to UI, etc.
    const allowed = await checkWithUI(tool_name, tool_input);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(allowed
          ? { behavior: "allow", updatedInput: tool_input }
          : { behavior: "deny", message: "Denied by policy" }
        )
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Limitations

- **Largely undocumented**: Response format was discovered by community trial-and-error
- **Not needed with SDK**: The `canUseTool` callback is simpler and better supported
- **Static rules take precedence**: If allowedTools/disallowedTools match, MCP tool is never called

**Sources**:
- [GitHub Issue #1175](https://github.com/anthropics/claude-code/issues/1175)
- [mmarcen's test implementation](https://github.com/mmarcen/test_permission-prompt-tool)

---

## 14. Existing Parsers and Libraries

### Official: @anthropic-ai/claude-agent-sdk (TypeScript)

```bash
npm install @anthropic-ai/claude-agent-sdk
```

- **Maintainer**: Anthropic
- **Status**: Production, officially supported
- **GitHub**: https://github.com/anthropics/claude-agent-sdk-typescript
- **What it does**: Full agent lifecycle management; wraps stream-json protocol
- **Use for Vantage**: Primary integration path via Node.js sidecar

### Official: claude-agent-sdk (Python)

```bash
pip install claude-agent-sdk
```

- **Maintainer**: Anthropic
- **GitHub**: https://github.com/anthropics/claude-agent-sdk-python
- **Use for Vantage**: Not directly (Vantage is TypeScript/Rust), but useful for reference

### Community: claude-code-parser (TypeScript)

```bash
npm install claude-code-parser
```

- **Author**: udhaykumarbala
- **Size**: 11 kB, zero dependencies
- **GitHub**: https://github.com/udhaykumarbala/claude-code-parser
- **Docs**: https://udhaykumarbala.github.io/claude-code-parser/
- **Features**:
  - `parseLine()`: Converts NDJSON lines into typed `ClaudeEvent` objects
  - `Translator`: Stateful deduplication with multi-agent content fingerprinting
  - `createMessage()`: Constructs stdin messages (user, approve, deny)
  - Handles verbose mode deduplication (cumulative snapshot problem)
  - Handles polymorphic `tool_result.content`
  - Handles double-encoded `result` fields
- **Use for Vantage**: Useful reference for protocol edge cases; may be used directly if bypassing SDK

### Community: @lasercat/claude-code-sdk-ts

- Fluent, chainable TypeScript SDK wrapper
- Provides `.asText()`, `.allowTools()` etc.
- Multi-level logging plus live `onMessage`/`onToolUse` callbacks

### Community: @instantlyeasy/claude-code-sdk-ts

- Fluent TypeScript SDK with streaming events
- CLI-compatible observability

### Community: claude-clean

- **GitHub**: https://github.com/ariel-frischer/claude-clean
- Beautiful terminal parser for Claude Code's streaming JSON output
- Transforms messy JSON logs into formatted terminal output

### Community: claude-code-sdk-go (Go)

- **Package**: github.com/yukifoo/claude-code-sdk-go
- Go implementation for server-side integration

---

## 15. The --sdk-url WebSocket Protocol (Undocumented)

### Overview

The `--sdk-url` flag (hidden with `.hideHelp()` in Commander) transforms Claude Code into a **WebSocket client**:

```bash
claude --sdk-url ws://localhost:3456/ws/cli/session-123
```

The terminal disappears; the CLI connects to the WebSocket and streams NDJSON over it.

### Message Format

Same NDJSON as `--output-format stream-json`, but transported over WebSocket instead of stdout.

### Companion's Usage

```
Browser (React)
  <-> ws://localhost:3456/ws/browser/:session
Companion Server (Bun + Hono)
  <-> ws://localhost:3456/ws/cli/:session
Claude Code CLI (--sdk-url ws://localhost:3456/ws/cli/:session)
```

### Warning

**This flag is NOT officially supported by Anthropic.** If they remove it, tools depending on it break. The Agent SDK is the officially supported programmatic interface. Vantage should **not** use this flag.

---

## 16. CLI Flags Reference (Integration-Relevant)

| Flag | Description | Default |
|------|-------------|---------|
| `-p` / `--print` | Non-interactive mode | -- |
| `--bare` | Skip auto-discovery (hooks, skills, plugins, MCP, CLAUDE.md) | false |
| `--output-format <fmt>` | `text`, `json`, or `stream-json` | `text` |
| `--input-format <fmt>` | `text` or `stream-json` | `text` |
| `--include-partial-messages` | Include streaming events (requires stream-json) | false |
| `--include-hook-events` | Include hook lifecycle events | false |
| `--replay-user-messages` | Echo user messages back on stdout | false |
| `--verbose` | Full turn-by-turn output | false |
| `--session-id <uuid>` | Use specific session UUID | auto-generated |
| `--continue` / `-c` | Continue most recent session | -- |
| `--resume <id>` / `-r` | Resume specific session | -- |
| `--fork-session` | Fork when resuming | false |
| `--name <name>` / `-n` | Set session display name | -- |
| `--model <model>` | Model override | default |
| `--max-turns <n>` | Limit agentic turns | unlimited |
| `--max-budget-usd <n>` | Maximum spend | unlimited |
| `--allowedTools <tools>` | Pre-approve tools | -- |
| `--disallowedTools <tools>` | Always deny tools | -- |
| `--permission-mode <mode>` | Permission mode | `default` |
| `--permission-prompt-tool <tool>` | MCP tool for permissions | -- |
| `--mcp-config <file>` | MCP server configuration | -- |
| `--agents <json>` | Define custom subagents | -- |
| `--system-prompt <text>` | Replace entire system prompt | -- |
| `--append-system-prompt <text>` | Append to system prompt | -- |
| `--json-schema <schema>` | Structured output schema | -- |
| `--no-session-persistence` | Don't persist to disk | false |
| `--effort <level>` | low/medium/high/max | -- |
| `--worktree <name>` / `-w` | Start in isolated git worktree | -- |
| `--debug` | Debug mode with category filtering | false |

---

## 17. Critical Implementation Decisions for Vantage

### Decision 1: Use the Agent SDK, Not Raw CLI

The Agent SDK (`@anthropic-ai/claude-agent-sdk`) is the officially supported interface. It wraps the same stream-json protocol internally but provides:
- Complete TypeScript types
- `canUseTool` callback (no raw control_request parsing)
- Session management built in
- Hook system
- MCP server management
- Abort/interrupt support
- Custom process spawning

### Decision 2: Node.js Sidecar Architecture

Vantage should use the same architecture as Claude Code Desktop:

```
React Frontend (Tauri WebView)
  <-> Tauri IPC (invoke/emit)
Rust Backend (SessionManager + AgentBridge)
  <-> stdin/stdout NDJSON
Node.js Sidecar (bridge.js with Agent SDK)
  <-> Anthropic API
```

The sidecar can be bundled as part of the Tauri app using `tauri-plugin-shell` or similar.

### Decision 3: Bounded Channels for Backpressure

Use Rust's `tokio::sync::mpsc::channel(1000)` for event flow from the sidecar to the frontend. This prevents OOM if the frontend can't consume events fast enough.

### Decision 4: Permission Flow

```
Agent SDK canUseTool fires
  -> Node.js sidecar emits permission_request on stdout
  -> Rust reader thread picks up, sends via Tauri emit
  -> React renders permission dialog
  -> User clicks Allow/Deny
  -> React calls Tauri invoke
  -> Rust writes permission response to sidecar stdin
  -> Node.js sidecar resolves pending Promise
  -> Agent SDK continues or aborts
```

No timeout on user decisions. The Promise in the sidecar holds until resolved.

### Decision 5: Delta Accumulation Strategy

Don't render individual `stream_event` deltas. Accumulate them in a Zustand store:

```typescript
// In React, accumulate deltas
interface MessageBlock {
  type: 'text' | 'tool_use' | 'thinking';
  content: string;  // Accumulated
  toolName?: string;
  toolInput?: string;  // Accumulated JSON
}

interface ConversationState {
  messages: Array<{
    role: 'user' | 'assistant';
    blocks: MessageBlock[];
  }>;
}
```

### Decision 6: Session Management

- Store session IDs in Vantage's own SQLite database (via rusqlite)
- Map Vantage project concepts to Claude Code sessions
- Support resume, fork, and continue
- Display session history using `listSessions()` and `getSessionMessages()`

### Decision 7: Multi-Agent Support

For multi-agent scenarios (parallel sessions):
- Each session gets its own Node.js sidecar process
- Or share one sidecar with multiplexed sessions (using `session_id` to route)
- Use `parent_tool_use_id` to track subagent messages
- Use git worktrees (`--worktree` flag) for file-level isolation

### Decision 8: Error Recovery

- Capture `session_id` immediately from `system/init`
- If sidecar crashes, restart and `resume` the session
- If API errors occur, the SDK handles retries (up to 10 with exponential backoff)
- Monitor `system/api_retry` events to show retry status in UI
- Use `maxBudgetUsd` to prevent runaway costs

### Decision 9: Authentication

Two options:
1. **API Key**: Set `ANTHROPIC_API_KEY` in the sidecar's environment
2. **OAuth Token Reuse**: Read from system Keychain (as described in Desktop AI IDE blog). Clear `ANTHROPIC_API_KEY` to force CLI auth mode, consuming subscription quota instead of API credits.

### Decision 10: V2 SDK Consideration

The V2 SDK preview (`unstable_v2_createSession`) offers a cleaner multi-turn API. However, since Vantage will have a long development cycle:
- Start with V1 (stable, full feature set)
- Plan migration path to V2 when it stabilizes
- The `send()`/`stream()` pattern maps naturally to Vantage's IPC model

---

## Appendix A: Complete Stream Event Types (Claude API)

| Event Type | Description | Key Fields |
|------------|-------------|------------|
| `message_start` | Start of new message | `message` object |
| `content_block_start` | Start of content block | `index`, `content_block` (type: text/tool_use) |
| `content_block_delta` | Incremental update | `index`, `delta` (text_delta or input_json_delta) |
| `content_block_stop` | End of content block | `index` |
| `message_delta` | Message-level update | `delta.stop_reason`, `usage` |
| `message_stop` | End of message | -- |

## Appendix B: Tool Input/Output Quick Reference

| Tool | Input Type | Key Fields |
|------|-----------|------------|
| `Bash` | `BashInput` | command, timeout, description, run_in_background |
| `Read` | `FileReadInput` | file_path, offset, limit, pages |
| `Write` | `FileWriteInput` | file_path, content |
| `Edit` | `FileEditInput` | file_path, old_string, new_string, replace_all |
| `Glob` | `GlobInput` | pattern, path |
| `Grep` | `GrepInput` | pattern, path, glob, output_mode |
| `Agent` | `AgentInput` | description, prompt, subagent_type, model, isolation |
| `WebSearch` | `WebSearchInput` | query, allowed_domains, blocked_domains |
| `WebFetch` | `WebFetchInput` | url, prompt |
| `AskUserQuestion` | `AskUserQuestionInput` | questions[].question/header/options/multiSelect |
| `TodoWrite` | `TodoWriteInput` | todos[].content/status/activeForm |

## Appendix C: Known Streaming Limitations

1. **Extended thinking + streaming**: When `maxThinkingTokens` is explicitly set, `StreamEvent` messages are NOT emitted. Only complete messages arrive.
2. **Structured output**: JSON result appears only in `ResultMessage.structured_output`, not as streaming deltas.
3. **Verbose mode deduplication**: Assistant messages in verbose mode are cumulative snapshots requiring dedup logic.

## Appendix D: Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key for authentication |
| `CLAUDE_CODE_USE_BEDROCK=1` | Use Amazon Bedrock |
| `CLAUDE_CODE_USE_VERTEX=1` | Use Google Vertex AI |
| `CLAUDE_CODE_USE_FOUNDRY=1` | Use Azure AI Foundry |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Compaction trigger % (default 95) |
| `DISABLE_AUTO_COMPACT=1` | Disable auto-compaction |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | Enable Agent Teams |
| `CLAUDE_AGENT_SDK_CLIENT_APP` | Identify your app in User-Agent header |

---

**Sources**:
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Agent SDK TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- [Streaming Output](https://platform.claude.com/docs/en/agent-sdk/streaming-output)
- [Streaming vs Single Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
- [Configure Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Handle Approvals and User Input](https://platform.claude.com/docs/en/agent-sdk/user-input)
- [Work with Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Run Claude Code Programmatically](https://code.claude.com/docs/en/headless)
- [GitHub Issue #24594 - input-format stream-json undocumented](https://github.com/anthropics/claude-code/issues/24594)
- [GitHub Issue #1175 - permission-prompt-tool docs](https://github.com/anthropics/claude-code/issues/1175)
- [Desktop AI IDE Architecture Blog](https://www.sachinadlakha.us/blog/desktop-ai-ide-claude-sdk)
- [claude-code-parser library](https://github.com/udhaykumarbala/claude-code-parser)
- [Opcode (Tauri 2 GUI)](https://github.com/winfunc/opcode)
- [mmarcen's permission-prompt-tool test](https://github.com/mmarcen/test_permission-prompt-tool)
