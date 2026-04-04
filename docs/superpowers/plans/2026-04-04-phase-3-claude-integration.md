# Vantage Phase 3: Claude Code Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Claude Code CLI into Vantage via the stream-json protocol, enabling real-time chat with streaming responses, permission handling, and session management.

**Architecture:** Rust backend spawns Claude Code CLI as a child process with `--output-format stream-json`. NDJSON output is parsed line-by-line and emitted as Tauri events. Frontend accumulates streaming deltas in a Zustand conversation store. User input and permission responses flow back via CLI stdin.

**Tech Stack:** Claude Code CLI (stream-json protocol), Tauri child process management, Zustand v5, react-markdown, shiki (syntax highlighting in chat), sonner (toasts)

---

### Task 1: Claude Code Process Manager (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/claude/mod.rs`
- Create: `src-tauri/src/claude/protocol.rs`
- Create: `src-tauri/src/claude/process.rs`
- Create: `src-tauri/src/claude/session.rs`
- Modify: `src-tauri/src/lib.rs`

This task builds the Rust backend that spawns Claude Code CLI as a child process, communicates over stdin/stdout using the stream-json NDJSON protocol, parses every message type, and emits Tauri events to the frontend. It also tracks active sessions and their process handles.

- [ ] **Step 1: Add process management dependencies to Cargo.toml**

Open `src-tauri/Cargo.toml` and add these dependencies to the existing `[dependencies]` section. The `dirs` crate is for finding `~/.claude/projects/`. The `uuid` crate generates session IDs.

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-store = "2"
tauri-specta = { version = "=2.0.0-rc.24", features = ["derive", "typescript"] }
specta = { version = "=2.0.0-rc.24", features = ["derive"] }
specta-typescript = "0.0.11"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
ignore = "0.4"
notify-debouncer-full = "0.7"
tauri-plugin-pty = "0.2"
tauri-plugin-dialog = "2"
# --- Phase 3 additions ---
dirs = "6"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: Create claude module directory and `mod.rs`**

Create the directory `src-tauri/src/claude/` and add the module file.

Create `src-tauri/src/claude/mod.rs`:

```rust
pub mod process;
pub mod protocol;
pub mod session;
```

- [ ] **Step 3: Create `src-tauri/src/claude/protocol.rs` -- NDJSON message type definitions**

This file defines all the serde structs for messages flowing in both directions over the stream-json protocol. Every struct derives `Serialize`, `Deserialize`, `Clone`, `Debug`, and `specta::Type` so TypeScript bindings are auto-generated.

Create `src-tauri/src/claude/protocol.rs` with these types:

**Outgoing (stdin) messages:**
- `UserInputMessage` -- sends user text to CLI. Format: `{"type":"user","message":{"role":"user","content":"..."},"parent_tool_use_id":null}`
- `ControlResponseMessage` -- responds to permission requests. Has `allow(updated_input)` and `deny(reason)` constructors. Format: `{"type":"control_response","behavior":"allow|deny",...}`

**Incoming (stdout) messages -- `ClaudeMessage` enum with `#[serde(tag = "type")]`:**
- `System(SystemMessage)` -- subtype "init" (session_id, model, tools, version, cwd, permissionMode, mcp_servers, etc.), subtype "api_retry" (attempt, max_retries, retry_delay_ms, error), subtype "compact_boundary" (compact_metadata with trigger and pre_tokens)
- `Assistant(AssistantMessage)` -- uuid, session_id, parent_tool_use_id, message (AnthropicMessage with id, role, model, content Vec of ContentBlock, stop_reason, usage)
- `User(UserEchoMessage)` -- echo of user messages with isReplay flag
- `Result(ResultMessage)` -- subtype (success/error_max_turns/error_during_execution/etc.), duration_ms, duration_api_ms, is_error, num_turns, total_cost_usd, usage, modelUsage, permission_denials, errors
- `StreamEvent(StreamEventMessage)` -- event as `serde_json::Value` (raw streaming event parsed on frontend), parent_tool_use_id, uuid, session_id
- `ControlRequest(ControlRequestMessage)` -- tool_name, tool_input as `serde_json::Value`
- `Status(StatusMessage)` -- message string
- `TaskStarted/TaskProgress/TaskNotification` -- background task lifecycle

**ContentBlock enum with `#[serde(tag = "type")]`:**
- `Text { text }`, `ToolUse { id, name, input: Value }`, `ToolResult { tool_use_id, content: Value, is_error }`, `Thinking { thinking, signature }`

**Tauri event payloads:**
- `ClaudeEventPayload { session_id, message: ClaudeMessage }`
- `PermissionRequestPayload { session_id, tool_name, tool_input: Value }`
- `ClaudeStatusPayload { session_id, status, error }`

All structs derive `Serialize, Deserialize, Clone, Debug, specta::Type`. Use `#[serde(skip_serializing_if = "Option::is_none")]` on optional fields. Use `serde_json::Value` for deeply nested/version-dependent fields (event, tool_input, content in ToolResult) to maintain forward compatibility.

**Critical implementation note:** If `#[serde(tag = "type")]` on `ClaudeMessage` fails at runtime because some CLI message types have unexpected fields, implement a fallback `parse_claude_message(line: &str) -> Result<ClaudeMessage, String>` that parses to `serde_json::Value` first, matches on the `type` field string, then deserializes the specific variant. Update `process.rs` to use this fallback instead of direct `serde_json::from_str`.

- [ ] **Step 4: Create `src-tauri/src/claude/process.rs` -- spawn and manage Claude Code CLI**

This is the core process manager. Create `src-tauri/src/claude/process.rs` with a `ClaudeProcess` struct containing:

**Fields:**
- `child: Child` -- the spawned CLI process
- `stdin: Arc<Mutex<ChildStdin>>` -- for sending NDJSON to CLI
- `session_id: Arc<Mutex<Option<String>>>` -- CLI-assigned session ID (from init)
- `is_alive: Arc<Mutex<bool>>` -- process liveness flag

**`spawn()` method:**
1. Determine CLI binary name: `claude.exe` on Windows, `claude` otherwise
2. Build `Command` with args: `-p ""`, `--output-format stream-json`, `--input-format stream-json`, `--verbose`, `--include-partial-messages`, `--replay-user-messages`
3. Add session flags: if resume with session_id use `--resume <id>`, if resume without id use `--continue`, if session_id without resume use `--session-id <id>`
4. Set `current_dir(cwd)`, configure `stdin/stdout/stderr` as `Stdio::piped()`
5. On Windows: use `CommandExt::creation_flags(CREATE_NO_WINDOW)` (0x08000000) to suppress console flash
6. Spawn the process; return helpful error if binary not found on PATH
7. Take ownership of stdin, stdout, stderr from child
8. Emit "starting" status via `app_handle.emit("claude_status", ...)`
9. Spawn **stdout reader Tokio task**: `BufReader::new(tokio::process::ChildStdout::from_std(stdout))`, read lines, parse each as `ClaudeMessage`, extract session_id from system/init, emit "ready" status on init, emit `claude_permission_request` event on ControlRequest, emit `claude_message` event for all messages. On parse failure: log error and emit `claude_raw_message` with raw line for debugging. On EOF: set is_alive=false, emit "stopped" status.
10. Spawn **stderr reader Tokio task**: read lines, log them, emit "error" status if line contains error keywords.

**`send_message()` method:** Create `UserInputMessage`, serialize to JSON, write as single line to stdin with newline, flush.

**`send_permission_response()` method:** Create `ControlResponseMessage` (allow or deny), serialize, write to stdin.

**`write_stdin()` helper:** Generic method that serializes any `Serialize` type to JSON, appends newline, writes to locked stdin, flushes.

**`interrupt()` method:** On Unix: send SIGINT via `libc::kill`. On Windows: since CREATE_NO_WINDOW means no console, we cannot send Ctrl+C. Instead, drop the stdin lock to signal EOF. Session state is preserved in JSONL file.

**`stop()` method:** Kill the child process, wait briefly for exit.

**`Drop` impl:** Kill child process when ClaudeProcess is dropped.

- [ ] **Step 5: Create `src-tauri/src/claude/session.rs` -- session tracking and discovery**

Create `src-tauri/src/claude/session.rs` with:

**`SessionInfo` struct** (derives specta::Type for TS bindings): session_id, file_path, last_modified (Unix timestamp), file_size, first_message (Option), line_count.

**`SessionManager` struct:**
- `processes: Arc<Mutex<HashMap<String, ClaudeProcess>>>` -- active sessions
- `app_handle: AppHandle`
- Methods: `new()`, `start_session(cwd, session_id?, resume?) -> internal_id`, `send_message(id, content)`, `send_permission_response(id, allow, input, reason)`, `interrupt_session(id)`, `stop_session(id)`, `stop_all()`, `list_active()`, `is_session_alive(id)`, `get_cli_session_id(id)`
- `start_session` generates UUID via `uuid::Uuid::new_v4()`, calls `ClaudeProcess::spawn()`, inserts into HashMap

**Session discovery functions:**
- `encode_cwd_for_session_path(cwd) -> String` -- replace every non-alphanumeric char with `-` (e.g., `C:\Users\me\project` -> `C--Users-me-project`)
- `get_claude_projects_dir() -> PathBuf` -- `dirs::home_dir()` + `.claude/projects/`
- `get_session_dir_for_project(cwd) -> PathBuf` -- projects dir + encoded CWD
- `list_sessions_for_project(cwd) -> Vec<SessionInfo>` -- scan JSONL files in session dir, extract metadata, parse first user message from first 50 lines, sort by last_modified descending

- [ ] **Step 6: Register claude module and add Tauri commands to `lib.rs`**

Update `src-tauri/src/lib.rs`:

1. Add `mod claude;` at the top
2. Add imports: `claude::protocol::*`, `claude::session::{self, SessionInfo, SessionManager}`, `tokio::sync::Mutex as TokioMutex`
3. Add these Tauri commands (all `#[tauri::command] #[specta::specta]`):
   - `claude_start_session(app_handle, cwd, session_id: Option, resume: bool) -> String` -- locks TokioMutex<SessionManager>, calls start_session
   - `claude_send_message(app_handle, session_id, content) -> ()` -- sends user message
   - `claude_respond_permission(app_handle, session_id, allow, updated_input: Option<Value>, deny_reason: Option) -> ()` -- responds to permission
   - `claude_interrupt_session(app_handle, session_id) -> ()` -- interrupts generation
   - `claude_stop_session(app_handle, session_id) -> ()` -- stops and removes session
   - `claude_list_active_sessions(app_handle) -> Vec<String>` -- lists active IDs
   - `claude_list_sessions(cwd) -> Vec<SessionInfo>` -- lists past sessions from disk (synchronous, no session manager needed)
   - `claude_is_session_alive(app_handle, session_id) -> bool` -- checks liveness
4. Register all Claude commands in `tauri_specta::collect_commands![]`
5. In `setup()` closure, create `SessionManager::new(app.handle().clone())` and call `app.manage(TokioMutex::new(session_manager))`
6. Keep all existing file, watcher, and terminal commands unchanged

- [ ] **Step 7: Verify Rust compilation**

```bash
cd C:/CursorProjects/Vantage/src-tauri && cargo check
```

Fix any compilation errors. Common issues:
- `tokio::process::ChildStdout::from_std` requires `features = ["full"]` on Tokio (already set)
- `specta::Type` derive on enums with `serde_json::Value` may need `specta(transparent)` or switching to `String` for raw JSON
- If `serde(tag = "type")` fails for `ClaudeMessage`, implement the `parse_claude_message` fallback described in Step 3

---

### Task 2: Conversation Store (Zustand)

**Files:**
- Create: `src/stores/conversation.ts`
- Create: `src/lib/protocol.ts`

This task builds the frontend state management for Claude conversations. The store accumulates streaming deltas into complete message blocks, tracks session metadata and cost, and provides actions for the chat UI.

- [ ] **Step 1: Create `src/lib/protocol.ts` -- TypeScript message type definitions**

Create `src/lib/protocol.ts` with TypeScript types mirroring the Rust protocol types:

**Content blocks:** `TextBlock`, `ToolUseBlock`, `ToolResultBlock`, `ThinkingBlock`, union `ContentBlock`

**Usage:** `UsageInfo { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }`

**Message types:**
- `SystemInitMessage` (type "system", subtype "init") with session_id, model, tools, version, cwd, permissionMode, mcp_servers, etc.
- `SystemApiRetryMessage` (subtype "api_retry") with attempt, max_retries, retry_delay_ms, error
- `SystemCompactMessage` (subtype "compact_boundary") with compact_metadata
- `AssistantMessage` with uuid, session_id, parent_tool_use_id, message (AnthropicMessage)
- `ResultMessage` with subtype, duration_ms, total_cost_usd, usage, num_turns, is_error, errors
- `StreamEventMessage` with event (StreamEvent union), parent_tool_use_id, uuid, session_id
- `ControlRequestMessage` with tool_name, tool_input
- `StatusMessage` with message string

**Stream events union `StreamEvent`:**
- `message_start` with message stub (id, role, model)
- `content_block_start` with index and ContentBlockStart (text/tool_use/thinking)
- `content_block_delta` with index and ContentDelta (text_delta/input_json_delta/thinking_delta)
- `content_block_stop` with index
- `message_delta` with stop_reason and usage
- `message_stop`

**Tauri event payloads:** `ClaudeEventPayload`, `PermissionRequestPayload`, `ClaudeStatusPayload`

- [ ] **Step 2: Create `src/stores/conversation.ts` -- the core conversation store**

Create `src/stores/conversation.ts` with Zustand store:

**Types:**
- `ToolCall { id, name, input, inputJson, output?, isError?, isExecuting }`
- `ConversationMessage { id, role: "user"|"assistant"|"system"|"result", text, thinking, toolCalls, model?, usage?, timestamp, parentToolUseId, stopReason? }`
- `ActiveBlock { index, type, text, toolUseId?, toolName?, inputJson, isComplete }` -- internal streaming accumulator
- `SessionMetadata { sessionId, cliSessionId?, model?, claudeCodeVersion?, tools?, permissionMode?, cwd? }`
- `ResultSummary { durationMs, durationApiMs, numTurns, totalCostUsd, usage?, isError, errors? }`

**State:**
- `messages: ConversationMessage[]` -- all messages in order
- `isStreaming, isThinking, thinkingStartedAt` -- streaming UI state
- `activeBlocks: Map<number, ActiveBlock>` -- accumulator for stream deltas
- `activeMessageId` -- current streaming message ID
- `session: SessionMetadata | null` -- from system/init
- `totalCost, totalTokens: { input, output }` -- cumulative
- `lastResult: ResultSummary | null`
- `connectionStatus: "disconnected"|"starting"|"ready"|"streaming"|"error"|"stopped"`
- `connectionError: string | null`
- `pendingPermission: { sessionId, toolName, toolInput } | null`

**Actions:**
- `addUserMessage(text)` -- create user message with generated ID, append to messages
- `handleSystemInit(msg)` -- store session metadata, set status to "ready"
- `handleStreamEvent(event)` -- the core delta accumulation logic:
  - `message_start`: set isStreaming=true, clear activeBlocks, store activeMessageId
  - `content_block_start`: create new ActiveBlock entry in Map
  - `content_block_delta`: append delta text/json/thinking to existing block
  - `content_block_stop`: mark block complete, end thinking state if it was thinking
  - `message_stop`: assemble all activeBlocks into ConversationMessage (sort by index, concatenate text/thinking, parse tool_use JSON inputs), append to messages, clear streaming state
- `handleAssistantMessage(msg)` -- complete assistant turn from verbose mode. Reconciles with stream-assembled message (replaces if found by ID or recent timestamp, otherwise appends). Extracts text, thinking, toolCalls from content blocks.
- `handleResult(msg)` -- store ResultSummary, accumulate totalCost and totalTokens, set status to "ready"
- `setPendingPermission(permission | null)` -- for PermissionDialog
- `setConnectionStatus(status, error?)` -- update connection state
- `clearConversation()` -- reset all state for new session
- `setSession(session)` -- set session metadata

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd C:/CursorProjects/Vantage && npx tsc --noEmit
```

---

### Task 3: Chat UI Components

**Files:**
- Create: `src/components/chat/ChatPanel.tsx`
- Create: `src/components/chat/MessageBubble.tsx`
- Create: `src/components/chat/ToolCallCard.tsx`
- Create: `src/components/chat/CodeBlock.tsx`
- Create: `src/components/chat/ThinkingIndicator.tsx`
- Create: `src/components/chat/ChatInput.tsx`
- Create: `src/hooks/useClaude.ts`

This task builds all the chat UI components and the hook that bridges Tauri events to the Zustand store.

- [ ] **Step 1: Install chat rendering dependencies**

```bash
cd C:/CursorProjects/Vantage && npm install react-markdown remark-gfm rehype-raw shiki
```

- [ ] **Step 2: Create `src/hooks/useClaude.ts` -- Tauri event bridge**

Create `src/hooks/useClaude.ts` -- a hook that:

1. **Listens for Tauri events** via `listen()` from `@tauri-apps/api/event`:
   - `claude_message`: routes by `message.type` to store handlers (system->handleSystemInit for init, toast for api_retry/compact_boundary; stream_event->handleStreamEvent; assistant->handleAssistantMessage; result->handleResult)
   - `claude_permission_request`: calls `setPendingPermission(event.payload)`
   - `claude_status`: calls `setConnectionStatus(status, error)`, shows toast on error/stopped
2. **Provides action functions:**
   - `startSession(cwd, resumeSessionId?)` -- invokes `claude_start_session`, stores internal ID in ref, calls setSession
   - `sendMessage(content)` -- calls `addUserMessage` optimistically, then invokes `claude_send_message`
   - `respondPermission(allow, updatedInput?, denyReason?)` -- invokes `claude_respond_permission`, clears pendingPermission
   - `interruptSession()` -- invokes `claude_interrupt_session`
   - `stopSession()` -- invokes `claude_stop_session`, clears ref
3. Uses `useRef` for sessionId (avoids stale closure issues)
4. Cleans up all listeners in effect cleanup

- [ ] **Step 3: Create `src/components/chat/ThinkingIndicator.tsx`**

Simple component showing "Thinking... Ns" with a pulsing Brain icon. Takes `startedAt: number` prop. Uses `setInterval` (100ms) to update elapsed seconds display.

- [ ] **Step 4: Create `src/components/chat/CodeBlock.tsx`**

Syntax-highlighted code block using shiki. Props: `code, language?, filename?`.

Features:
- Async shiki highlighting via `codeToHtml(code, { lang, theme: "catppuccin-mocha" })` in useEffect
- Fallback to plain `<pre><code>` if shiki fails
- Header bar with language label and filename
- Copy button (clipboard API, shows Check icon for 2s after copy)
- "Open in editor" button (if filename provided) -- reads file via `invoke("read_file")`, opens in editor store
- Shiki HTML rendered via `innerHTML` assignment on a container div (the HTML is generated from trusted code input, not user-supplied HTML)

- [ ] **Step 5: Create `src/components/chat/ToolCallCard.tsx`**

Expandable card for tool call visualization. Props: `toolCall: ToolCall`.

Features:
- `toolMeta` record mapping tool names to Lucide icons, colors, and labels (Read=blue FileText, Write/Edit=yellow Pencil, Bash=red Terminal, Grep=green Search, Glob=teal FolderOpen, Agent=mauve Bot)
- Collapsed: icon + tool label + one-line input summary + "running" badge if executing
- Expanded: full input + output sections with tool-specific rendering:
  - Bash: CodeBlock with shell language for command
  - Read: file path text
  - Edit: file path + red block for old_string + green block for new_string (diff preview)
  - Write: file path + CodeBlock with detected language
  - Default: JSON CodeBlock
- Chevron toggle for expand/collapse
- Left border colored by tool type

- [ ] **Step 6: Create `src/components/chat/MessageBubble.tsx`**

Renders a single ConversationMessage. Props: `message: ConversationMessage`.

**User messages:** Right-aligned bubble with user icon, plain text with whitespace preserved.

**Assistant messages:**
- Collapsible thinking section (Brain icon, "Thought process" label, click to toggle, muted styling with mauve left border)
- Text content rendered via `ReactMarkdown` with `remarkGfm` plugin. Custom `code` component: inline code gets default styling, fenced code blocks (detected by `language-*` className) route to `CodeBlock` component
- Tool call cards: map over `toolCalls` array rendering `ToolCallCard` for each
- Token usage display (if available): total tokens count

Apply Tailwind prose classes for markdown styling matching Catppuccin theme.

- [ ] **Step 7: Create `src/components/chat/ChatInput.tsx`**

Text input area. Props: `onSend, onStop, isStreaming, disabled`.

Features:
- Auto-resizing textarea (max 200px) using scrollHeight measurement in useEffect
- Enter sends message (calls onSend with trimmed text, clears input)
- Shift+Enter inserts newline
- Send button: blue when text present, grey when empty, disabled when no text
- Stop button: red square icon, shown instead of send button during streaming, calls onStop
- Placeholder changes based on state: "Connecting..." / "Claude is responding..." / "Ask Claude anything..."
- "Shift+Enter for newline" / "Ctrl+C to stop" hint text below input
- Focus textarea on mount

- [ ] **Step 8: Create `src/components/chat/ChatPanel.tsx` -- the main chat container**

Main chat component replacing SecondarySidebar placeholder.

Features:
- **Header:** Chat icon + "CHAT" label, model name badge (stripped of date suffix), New Session button (Plus icon)
- **Message list:** scrollable container with auto-scroll (using ref + scrollIntoView). Auto-scroll pauses when user scrolls up (detected via scroll event checking distance from bottom). Resumes when user scrolls back to bottom.
- **Empty state:** when no messages and disconnected, shows MessageSquare icon + "Start a Claude Code session" text + "Start Session" button. When connected but no messages: "Ask Claude anything about your codebase."
- **Streaming preview:** while streaming, show accumulated text from activeBlocks (text type, not complete) with blinking cursor indicator
- **Thinking indicator:** shown when isThinking=true with thinkingStartedAt
- **Cost display:** if totalCost > 0, show "Session cost: $X.XXXX" between messages and input
- **ChatInput** at bottom
- Calls `useClaude()` hook to initialize event bridge
- Start session action: `startSession(session?.cwd ?? "C:/CursorProjects/Vantage")`

- [ ] **Step 9: Verify all chat components compile**

```bash
cd C:/CursorProjects/Vantage && npx tsc --noEmit
```

---

### Task 4: Permission Dialog

**Files:**
- Create: `src/components/permissions/PermissionDialog.tsx`

- [ ] **Step 1: Create `src/components/permissions/PermissionDialog.tsx`**

Modal permission dialog overlaying the entire app.

**Risk classification (`getRiskLevel`):**
- Safe (green): Read, Glob, Grep, WebSearch, WebFetch
- Write (yellow): Edit, Write, NotebookEdit, Agent, non-destructive Bash
- Destructive (red): Bash matching patterns `rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`, `drop table`, `format [drive]:`

**Layout:**
- Fixed overlay with dark backdrop (rgba 0,0,0,0.6)
- Centered dialog with max-w-lg, rounded corners, mantle background
- Risk-level color bar (1px) at top (green/yellow/red)
- Header: tool icon (10x10 circle with surface-0 bg) + tool name + risk level label with shield icon
- Input preview section: tool-specific rendering (same patterns as ToolCallCard -- Bash shows command, Edit shows diff, Write shows content, Read shows path, default shows JSON)
- Three action buttons: Allow (green, key Y/Enter), Deny (red, key N/Escape), Session (surface-1 bg, key S)
- Each button shows keyboard shortcut in a kbd element

**Keyboard shortcuts:** useEffect with keydown listener (capture phase) when pendingPermission is non-null. Y/Enter -> allow, N/Escape -> deny, S -> allow session.

**Data flow:** Reads `pendingPermission` from conversation store. Calls `respondPermission` from `useClaude` hook. Returns null when no pending permission.

- [ ] **Step 2: Wire PermissionDialog into the app**

Add to `src/App.tsx` as a sibling to IDELayout:

```tsx
import { PermissionDialog } from "@/components/permissions/PermissionDialog";
// In return JSX: <PermissionDialog /> after <IDELayout />
```

---

### Task 5: Session Management

**Files:**
- Create: `src/components/chat/SessionSelector.tsx`

- [ ] **Step 1: Create `src/components/chat/SessionSelector.tsx`**

Dropdown for browsing and resuming past sessions.

**Trigger:** Button with History icon, "Sessions" label, ChevronDown.

**Dropdown content:**
- Click-away backdrop (fixed inset-0 z-40)
- Dropdown panel (absolute, right-aligned, w-80, z-50, mantle bg)
- "New session" button at top (Plus icon, blue text)
- Session list: loaded via `invoke<SessionInfo[]>("claude_list_sessions", { cwd })` when dropdown opens
- Each session: Play icon + first_message preview (truncated) + relative time (formatRelativeTime) + turn count (MessageSquare icon + line_count)
- Click to resume: stop current session, clear conversation, start new session with resumeSessionId

**formatRelativeTime:** <60s "just now", <1h "Nm ago", <24h "Nh ago", <7d "Nd ago", else locale date string.

- [ ] **Step 2: Add SessionSelector to ChatPanel header**

Import and render `<SessionSelector cwd={session?.cwd ?? "..."}/>` in the ChatPanel header, next to the model badge.

---

### Task 6: Status Bar Integration

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`

- [ ] **Step 1: Update StatusBar with live Claude data**

Replace hardcoded status placeholders with live data from conversation store:

1. Import `useConversationStore`, subscribe to: connectionStatus, totalCost, totalTokens, session, isStreaming
2. Claude status indicator (replace static "Ready"):
   - Streaming: spinning Loader2 (animate-spin), blue, "Streaming"
   - Ready: Zap icon, green, "Ready"
   - Starting: spinning Loader2, yellow, "Starting"
   - Error: XCircle, red, "Error"
   - Disconnected/Stopped: WifiOff, grey, "Disconnected"
3. Cost display: `$${totalCost.toFixed(totalCost > 0 ? 4 : 2)}`
4. Token count: show when > 0, format with K/M suffixes (>=1M: "1.2M", >=1K: "15.2K", else raw)
5. Model name: `session?.model` stripped of date suffix (regex `/-\d{8}$/`)

---

### Task 7: Wire Chat into Layout

**Files:**
- Modify: `src/components/layout/SecondarySidebar.tsx`
- Modify: `src/hooks/useKeybindings.ts`
- Modify: `src/stores/layout.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace SecondarySidebar placeholder with ChatPanel**

Replace entire `src/components/layout/SecondarySidebar.tsx`:

```tsx
import { ChatPanel } from "@/components/chat/ChatPanel";

export function SecondarySidebar() {
  return <ChatPanel />;
}
```

- [ ] **Step 2: Add PermissionDialog to the app root**

In `src/App.tsx`, render `<PermissionDialog />` after `<IDELayout />`.

- [ ] **Step 3: Add Ctrl+L keybinding to focus chat input**

In `src/hooks/useKeybindings.ts`, add to the keybindings array:

```typescript
{
  key: "l",
  ctrl: true,
  action: () => {
    const layout = useLayoutStore.getState();
    if (!layout.secondarySidebarVisible) {
      layout.toggleSecondarySidebar();
    }
    setTimeout(() => {
      const textarea = document.querySelector(
        '[placeholder*="Ask Claude"]'
      ) as HTMLTextAreaElement | null;
      textarea?.focus();
    }, 100);
  },
  description: "Focus Chat Input",
},
```

- [ ] **Step 4: Open secondary sidebar by default on first launch**

In `src/stores/layout.ts`, change default: `secondarySidebarVisible: true`

- [ ] **Step 5: Verify the layout integration**

```bash
cd C:/CursorProjects/Vantage && npx tsc --noEmit
```

---

### Task 8: Integration Testing

- [ ] **Step 1: Verify Rust compilation and TypeScript binding generation**

```bash
cd C:/CursorProjects/Vantage/src-tauri && cargo check
cd C:/CursorProjects/Vantage && npx tsc --noEmit
```

- [ ] **Step 2: Verify the Claude CLI is available**

```bash
claude --version
```

- [ ] **Step 3: Verify chat sends and receives messages**

Open Vantage, click "Start Session", send a message. Verify thinking indicator, streaming text, and final markdown rendering.

- [ ] **Step 4: Verify permission dialog appears and responds**

Ask Claude to create/edit a file. Verify dialog shows with correct tool name, input preview, and risk level. Test Allow (Y), Deny (N), and keyboard shortcuts.

- [ ] **Step 5: Verify session resume works**

Start a session, have a conversation, stop it. Open session selector, verify past sessions listed. Click to resume, verify Claude has prior context.

- [ ] **Step 6: Verify cost tracking updates**

After a response, check status bar for: cost, token count, model name, and status transitions (Streaming -> Ready).

- [ ] **Step 7: Verify streaming display**

Send a query producing a long response. Verify: token-by-token display, auto-scroll, scroll-up pauses, stop button visible and functional.

- [ ] **Step 8: Verify tool call cards**

Ask Claude to read a file (blue Read card), edit a file (yellow Edit card with diff). Verify expand/collapse works.

- [ ] **Step 9: Verify code blocks**

Ask Claude for a code example. Verify syntax highlighting (Catppuccin Mocha colors), language label, copy button.

- [ ] **Step 10: Production build test**

```bash
cd C:/CursorProjects/Vantage && npm run build
cd C:/CursorProjects/Vantage/src-tauri && cargo build --release
```

---

## Appendix A: Architecture Decisions

**Why spawn the CLI directly instead of the Agent SDK sidecar?**
The design spec recommends the SDK sidecar as the primary path. For Phase 3 v1, direct CLI spawning has fewer moving parts: no Node.js sidecar to bundle, no SDK version pinning, no bridge.js. The stream-json protocol provides streaming output, permission handling via control_request/control_response, and session management via --session-id/--resume. The SDK sidecar is planned for Phase 4.

**Why accumulate deltas in the store?**
Rendering each content_block_delta causes one re-render per token. Accumulating in activeBlocks and assembling on message_stop prevents render thrash. Components read assembled blocks via selectors.

**Why Tauri events instead of channels?**
Tauri events are simpler and sufficient for Claude's ~30-100 tokens/second. Channels can be introduced in Phase 4 if profiling shows overhead.

**Why serde_json::Value for stream events and tool inputs?**
The CLI's deeply nested, version-dependent streaming events would break with strict typing when Claude Code updates. Value provides forward compatibility. The frontend parses with TypeScript's flexible type system.

## Appendix B: Protocol Quick Reference

**Start bidirectional session:**
```
claude -p "" --output-format stream-json --input-format stream-json --verbose --include-partial-messages --replay-user-messages
```

**Send message (stdin):** `{"type":"user","message":{"role":"user","content":"..."},"parent_tool_use_id":null}`

**Allow tool (stdin):** `{"type":"control_response","behavior":"allow","updatedInput":{...}}`

**Deny tool (stdin):** `{"type":"control_response","behavior":"deny","message":"reason"}`

**Resume session:** Add `--resume <session-uuid>` to CLI args

**Session files:** `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`

**CWD encoding:** Replace non-alphanumeric with `-`. `C:\Users\me\project` -> `C--Users-me-project`

**Stream event flow:** `message_start -> content_block_start -> content_block_delta... -> content_block_stop -> message_delta -> message_stop -> assistant`
