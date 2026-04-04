# Vantage Design Specification

**Version**: 1.0
**Date**: 2026-04-04
**Status**: Implementation-Ready
**Author**: Design Phase (synthesized from 432KB of research across 8 files)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Claude Code Integration](#4-claude-code-integration)
5. [UI Layout and Components](#5-ui-layout-and-components)
6. [Keybindings](#6-keybindings)
7. [Theme System](#7-theme-system)
8. [Data Model](#8-data-model)
9. [Windows-Specific Handling](#9-windows-specific-handling)
10. [Error Handling](#10-error-handling)
11. [Feature Priority](#11-feature-priority)
12. [Non-Goals](#12-non-goals)
13. [Security Considerations](#13-security-considerations)
14. [Testing Strategy](#14-testing-strategy)
15. [Success Criteria](#15-success-criteria)

---

## 1. Overview

### What Vantage Is

Vantage is a desktop IDE for Windows 11 built around Claude Code CLI. It replaces the terminal-based Claude Code experience with a visual workspace that provides a code editor, integrated terminal, file explorer, permission management, diff review, and multi-agent orchestration -- all in a single application. Vantage uses the Claude Agent SDK as its integration layer, the same architecture Anthropic uses in their own Claude Code Desktop app.

Vantage is not a chat wrapper. It is a workspace. The code editor occupies the center, the chat panel lives in a collapsible secondary sidebar, and the terminal sits in a bottom panel. Every interaction -- editing, reviewing diffs, approving permissions, managing agents -- happens without leaving the window. The value proposition is the best possible Claude Code IDE on Windows, not a generic AI coding tool.

### Target User Profile

Professional developers on Windows 11 who use Claude Code daily. They want VS Code-level editing with native Claude Code integration, inline diff review for AI-generated changes, and the ability to run 3-5 parallel agent sessions with visual orchestration. They are comfortable with keyboard shortcuts and expect snappy performance. They do not want telemetry, cloud dependencies, or forced accounts.

### Design Principles

1. **Editor-first, not chat-first.** The code editor dominates the layout. Chat is a tool, not the product. Developers spend 80% of their time reading and editing code. (Research: 08-synthesis Q2)

2. **Intercept the protocol, don't wrap the terminal.** Vantage parses Claude Code's structured output to provide inline diffs, permission dialogs, and tool call visualization. A terminal wrapper cannot do this. (Research: 08-synthesis Lesson 5)

3. **Ship weekly, not perfectly.** Opcode stalled for 7 months and lost community trust. Consistent shipping cadence matters more than feature completeness. (Research: 08-synthesis Lesson 3)

4. **Do fewer things excellently.** Claude Code only. One integration path. One design language. CodePilot's 17 providers and 248 open issues demonstrate the cost of scope creep. (Research: 08-synthesis Lesson 11)

5. **Review is the bottleneck, not generation.** 96% of developers don't fully trust AI code. Vantage must make review fast: per-hunk accept/reject, multi-file review panels, inline comments that become follow-up prompts. (Research: 08-synthesis Lesson 8)

6. **Safety by default.** Permission mode defaults to "ask." No tool execution without explicit user approval or pre-configured rules. Trust is earned through transparency. (Research: 08-synthesis Q6)

7. **Windows-native, not cross-platform-compromised.** Path normalization, ConPTY handling, Git Bash detection, file locking retry -- every Windows quirk is handled explicitly, not papered over. (Research: 07-windows-specific)

---

## 2. Architecture

### 2.1 Process Model

```
+--------------------------------------------------------------+
|                    VANTAGE APPLICATION                        |
|                                                              |
|  +--------------------------------------------------------+  |
|  | TAURI MAIN PROCESS (Rust)                               |  |
|  |                                                         |  |
|  |  SessionManager    -- orchestrates all Claude sessions  |  |
|  |  AgentBridge[]     -- one per active Claude session     |  |
|  |  FileWatcher       -- notify crate, debounced           |  |
|  |  GitService        -- git2 reads + git.exe mutations    |  |
|  |  PTYManager        -- portable-pty via tauri-plugin-pty |  |
|  |  SettingsStore     -- rusqlite (SQLite, bundled)        |  |
|  |  PathNormalizer    -- Windows/POSIX/UNC conversion      |  |
|  |  PrerequisiteCheck -- first-launch validation           |  |
|  |  UpdateChecker     -- tauri-plugin-updater              |  |
|  +-----+------+------+------+------+---------------------+  |
|        |      |      |      |      |                         |
|        v      |      v      |      v                         |
|  +-----+--+  |  +---+---+  |  +---+---+                     |
|  |WebView2|  |  | PTY 1 |  |  | PTY 2 |   (user terminals)  |
|  |(React) |  |  |ConPTY |  |  |ConPTY |                      |
|  +--------+  |  +-------+  |  +-------+                      |
|              |             |                                  |
|  +-----------+-------------+-------------------------------+  |
|  | NODE.JS SIDECAR PROCESS(ES)                             |  |
|  | (one per active Claude session)                         |  |
|  |                                                         |  |
|  |  bridge.js                                              |  |
|  |    - imports @anthropic-ai/claude-agent-sdk             |  |
|  |    - query() async generator loop per session           |  |
|  |    - canUseTool -> stdout NDJSON -> Rust -> React       |  |
|  |    - streamInput() for multi-turn conversations         |  |
|  |    - Session resume/fork/continue support               |  |
|  +-----+---------------------------------------------------+  |
|        |                                                      |
+--------|------------------------------------------------------+
         v
   Anthropic API (Claude)
```

**Key decisions** (Research: 08-synthesis sec. 2.1):

- **One Node.js sidecar per active session.** The Agent SDK's `query()` returns a single async generator per session. Multiplexing is possible but fragile. Memory cost is ~50MB per sidecar, acceptable for 3-5 concurrent sessions (250MB total).

- **Rust owns all native resources.** PTY processes, file watchers, git operations, SQLite, and sidecar lifecycle all live in the Rust process. React never touches native resources directly.

- **Single WebView2 window.** No multi-window at 1.0. The single WebView contains the full IDE layout. Floating windows can come later via Tauri's multi-window support.

### 2.2 Data Flow: User Input to Claude Response

```
User types prompt in chat input (React)
  |
  v
React dispatches via Zustand action -> conversationStore.sendMessage()
  |
  v
Tauri invoke('send_message', { sessionId, content })
  |
  v
Rust SessionManager routes to correct AgentBridge
  |
  v
AgentBridge writes NDJSON to sidecar stdin:
  {"type":"send_message","content":"Fix the auth bug"}
  |
  v
Node.js sidecar calls query.streamInput() with user message
  |
  v
Agent SDK sends to Anthropic API
  |
  v
Claude processes and streams response
  |
  v
Agent SDK yields SDKMessage objects
  |
  v
Node.js sidecar serializes to NDJSON, writes to stdout:
  {"type":"agent_message","message":{...SDKMessage...}}
  |
  v
Rust AgentBridge reader thread (tokio::spawn) parses NDJSON line
  |
  v
Rust emits via Tauri Channel: on_event.send(AgentEvent { sessionId, message })
  |
  v
React Channel listener receives, dispatches to conversationStore
  |
  v
Zustand store accumulates deltas into message blocks
  |
  v
React re-renders ChatPanel with new content (selector-based)
```

### 2.3 Data Flow: Permission Request to Approval

```
Agent SDK canUseTool fires in Node.js sidecar
  |
  v
Sidecar writes to stdout:
  {"type":"permission_request","toolName":"Bash","input":{"command":"rm -rf build/"}}
  |
  v
Rust reader thread picks up NDJSON line, emits Tauri event:
  app.emit("permission_request", PermissionPayload { sessionId, toolName, input })
  |
  v
React event listener triggers permissionStore.showDialog()
  |
  v
React renders PermissionDialog:
  - Tool name and description
  - Input preview (command text or diff for edits)
  - Risk-level color border (green/yellow/red)
  - Buttons: Allow | Deny | Allow for Session | Create Rule
  |
  v
User clicks Allow
  |
  v
React calls Tauri invoke('respond_permission', {
  sessionId, behavior: "allow", updatedInput: {...}
})
  |
  v
Rust writes response to sidecar stdin:
  {"type":"respond_permission","behavior":"allow","updatedInput":{...}}
  |
  v
Node.js sidecar resolves pending canUseTool Promise
  |
  v
Agent SDK continues tool execution

(No timeout on user decisions -- the Promise holds indefinitely)
```

### 2.4 Data Flow: File Change to UI Update

```
User or Claude edits a file on disk
  |
  v
notify crate (directory-level watcher, 200ms debounce) fires event
  |
  v
Rust FileWatcher filters by .gitignore rules (ignore crate)
  |
  v
Rust emits Tauri event: app.emit("file_changed", { path, kind })
  |
  v
React event listener dispatches to editorStore and fileTreeStore
  |
  v
editorStore: If file is open in a tab, mark as externally modified
  - If tab is not dirty: silently reload content
  - If tab is dirty: show "File changed on disk. Reload?" notification
  |
  v
fileTreeStore: Update tree node (add/remove/rename)
  - Invalidate TanStack Query cache for the parent directory
```

### 2.5 IPC Patterns: When to Use Which

| Direction | Mechanism | When to Use | Examples |
|-----------|-----------|-------------|---------|
| React -> Rust | **Commands** (`invoke()`) | Request/response. All user-initiated actions. | `send_message`, `respond_permission`, `write_terminal`, `read_file`, `git_status`, `open_file`, `save_file` |
| Rust -> React | **Events** (`emit()`) | Low-frequency notifications, small payloads. | `file_changed`, `settings_changed`, `permission_request`, `sidecar_crashed` |
| Rust -> React (streaming) | **Channels** | High-throughput streaming data. | `terminal_output`, `agent_message_stream`, `file_tree_batch_update` |
| Rust -> Node.js sidecar | **stdin NDJSON** | Commands to the Agent SDK. | `send_message`, `respond_permission`, `interrupt`, `configure` |
| Node.js sidecar -> Rust | **stdout NDJSON** | All agent events, responses. | `agent_message`, `permission_request`, `stream_delta`, `result` |

**Performance priority** (Research: 03-tauri sec. 5):
- Terminal I/O: Channels (highest throughput, guaranteed ordering)
- Claude streaming: Channels (high throughput, index-based)
- File changes: Events (low frequency, JSON payloads)
- User actions: Commands (request/response, type-safe via tauri-specta)

### 2.6 State Management: Six Zustand Stores

| Store | File | Responsibility | Primary Update Source |
|-------|------|---------------|---------------------|
| `conversationStore` | `stores/conversation.ts` | Messages, streaming deltas, thinking blocks, tool calls per session | Tauri Channels from sidecar |
| `sessionsStore` | `stores/sessions.ts` | Active session list, session metadata, history browser | Tauri Commands (list/resume) |
| `agentsStore` | `stores/agents.ts` | Multi-agent kanban state, task cards, agent status, conflict matrix | Filesystem watching of `~/.claude/teams/` |
| `editorStore` | `stores/editor.ts` | Open files, tab order, dirty state, cursor positions, split groups | Monaco Editor events |
| `layoutStore` | `stores/layout.ts` | Panel sizes, sidebar visibility, active activity bar item | User interaction, persisted via Tauri Store plugin |
| `settingsStore` | `stores/settings.ts` | Theme, font size, keybindings, permission rules | Rust-side SQLite settings store |

**Key patterns** (Research: 08-synthesis sec. 2.4):

- **Delta accumulation**: `stream_event` deltas accumulate in `conversationStore`. Components read assembled blocks, not individual deltas. This prevents render thrash during streaming.
- **Selector-based subscriptions**: Components subscribe to specific slices via Zustand selectors to minimize re-renders during high-frequency streaming.
- **Optimistic UI**: Permission dialogs and terminal input use optimistic updates with rollback on error.
- **Persistence**: `layoutStore` and `settingsStore` persist to Tauri's Store plugin. Session data persists via SQLite.

### 2.7 Persistence Strategy

| Data Type | Storage | Format | Reason |
|-----------|---------|--------|--------|
| Session metadata | SQLite (`sessions` table) | Relational rows | Structured queries, sorting, filtering |
| User settings | SQLite (`settings` table) | Key-value JSON | Fast reads, transactional writes |
| Usage statistics | SQLite (`usage_stats` table) | Time-series rows | Aggregation queries |
| Agent tasks | SQLite (`agent_tasks` table) | Status-tracked rows | Status queries, ordering |
| Layout state | Tauri Store plugin | JSON file | Simple key-value, no queries needed |
| Keybindings | Filesystem | `keybindings.json` | User-editable, human-readable |
| Theme overrides | Filesystem | `theme.json` | User-editable, human-readable |
| Session transcripts | Filesystem (read-only) | JSONL at `~/.claude/projects/` | Claude Code owns these files |

---

## 3. Tech Stack

### 3.1 Complete Dependency List

#### Frontend (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | `^19.0.0` | UI framework |
| `react-dom` | `^19.0.0` | DOM rendering |
| `typescript` | `^5.7.0` | Type safety |
| `vite` | `^7.0.0` | Bundler |
| `@anthropic-ai/claude-agent-sdk` | `0.2.62` (pinned exact) | Agent SDK for sidecar |
| `zustand` | `^5.0.0` | State management |
| `@tanstack/react-query` | `^5.0.0` | Server state / caching |
| `tailwindcss` | `^4.0.0` | Styling |
| `monaco-editor` | `^0.52.0` | Code editor |
| `vite-plugin-monaco-editor` | `^1.1.0` | Monaco Vite integration |
| `@xterm/xterm` | `^5.5.0` | Terminal emulator |
| `@xterm/addon-webgl` | `^0.18.0` | GPU-accelerated terminal rendering |
| `@xterm/addon-fit` | `^0.10.0` | Terminal auto-resize |
| `@xterm/addon-search` | `^0.15.0` | In-terminal text search |
| `@xterm/addon-web-links` | `^0.11.0` | Clickable URLs in terminal |
| `react-resizable-panels` | `^4.9.0` | Split pane layout (via shadcn Resizable) |
| `cmdk` | `^1.0.0` | Command palette (via shadcn Command) |
| `react-diff-view` | `^3.2.0` | Multi-file diff review |
| `shiki` | `^3.0.0` | Syntax highlighting in chat |
| `react-markdown` | `^9.0.0` | Markdown rendering |
| `remark-gfm` | `^4.0.0` | GitHub Flavored Markdown |
| `rehype-raw` | `^7.0.0` | Raw HTML in markdown |
| `@dnd-kit/core` | `^6.3.0` | Drag-and-drop (kanban) |
| `@dnd-kit/sortable` | `^10.0.0` | Sortable lists (kanban columns) |
| `sonner` | `^2.0.0` | Toast notifications |
| `lucide-react` | `^0.470.0` | Icons |
| `@radix-ui/react-*` | latest | UI primitives (via shadcn) |
| `@tauri-apps/api` | `^2.2.0` | Tauri frontend API |
| `@tauri-apps/plugin-notification` | `^2.2.0` | System notifications |
| `@tauri-apps/plugin-store` | `^2.2.0` | Persistent key-value store |
| `@tauri-apps/plugin-updater` | `^2.3.0` | Auto-update |

#### Rust Backend (Cargo.toml)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | `^2.2` | Application framework |
| `tauri-plugin-pty` | `^0.1` | PTY bridge (depends on portable-pty ^0.9) |
| `tauri-specta` | `^2.0` | Type-safe IPC generation |
| `specta` | `^2.0` | Type export for TypeScript |
| `specta-typescript` | `^0.0.7` | TypeScript codegen |
| `notify` | `^9.0` | File system watching |
| `notify-debouncer-full` | `^0.4` | Event debouncing |
| `ignore` | `^0.4` | .gitignore-aware file walking |
| `git2` | `^0.19` | Git operations (reads) |
| `rusqlite` | `^0.32` | SQLite (bundled feature) |
| `tokio` | `^1.42` | Async runtime (full features) |
| `serde` | `^1.0` | Serialization |
| `serde_json` | `^1.0` | JSON serialization |
| `tauri-plugin-notification` | `^2.2` | System notifications |
| `tauri-plugin-store` | `^2.2` | Key-value persistence |
| `tauri-plugin-updater` | `^2.3` | Auto-update |

### 3.2 Starter Template

Start from `dannysmith/tauri-template` (Research: 03-tauri sec. 8, 08-synthesis sec. 1.5). It provides:

- Tauri v2 + React 19 + TypeScript + Vite 7 + shadcn/ui v4
- tauri-specta for type-safe IPC
- Zustand v5 + TanStack Query v5
- Command Palette, Quick Pane, global shortcuts
- Platform-aware keyboard shortcuts + native menus
- Settings dialog with Rust-side persistence
- Collapsible sidebars via resizable panels
- Light/dark theme with system detection
- Auto-updater via GitHub Releases
- Structured logging, crash recovery
- Multi-window support
- Platform-specific title bars

### 3.3 Build Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| Rust (MSVC) | stable, `x86_64-pc-windows-msvc` | Backend compilation |
| Node.js | ^20.0 or ^22.0 | Sidecar runtime, npm |
| npm | ^10.0 | Package management |
| Visual Studio Build Tools | 2022+ | C++ "Desktop development" workload |
| Git for Windows | ^2.45 | Required by Claude Code |

---

## 4. Claude Code Integration

### 4.1 Primary Path: Agent SDK via Node.js Sidecar

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is the officially supported integration, used by Anthropic's own Claude Code Desktop. It wraps the raw stream-json NDJSON protocol with typed events, permission callbacks, session management, and hook support. (Research: 06-stream-json sec. 1, 08-synthesis Lesson 2)

### 4.2 Sidecar Lifecycle

**Spawn:**

```typescript
// bridge.js -- Node.js sidecar entry point
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin });
let messageResolve: ((msg: SDKUserMessage) => void) | null = null;
let permissionResolve: ((result: PermissionResult) => void) | null = null;

async function* messageGenerator(): AsyncGenerator<SDKUserMessage> {
  while (true) {
    const msg = await new Promise<SDKUserMessage>((resolve) => {
      messageResolve = resolve;
    });
    yield msg;
  }
}

rl.on("line", (line: string) => {
  const cmd = JSON.parse(line);
  switch (cmd.type) {
    case "send_message":
      if (messageResolve) {
        messageResolve({
          type: "user",
          message: { role: "user", content: cmd.content },
          parent_tool_use_id: null,
          session_id: "",
        });
        messageResolve = null;
      }
      break;
    case "respond_permission":
      if (permissionResolve) {
        permissionResolve(cmd.result);
        permissionResolve = null;
      }
      break;
    case "interrupt":
      activeQuery?.interrupt();
      break;
  }
});

const activeQuery = query({
  prompt: messageGenerator(),
  options: {
    cwd: process.env.VANTAGE_CWD,
    includePartialMessages: true,
    resume: process.env.VANTAGE_RESUME_SESSION || undefined,
    canUseTool: async (toolName, input, options) => {
      process.stdout.write(
        JSON.stringify({
          type: "permission_request",
          toolName,
          input,
          toolUseID: options.toolUseID,
          agentID: options.agentID,
          suggestions: options.suggestions,
        }) + "\n"
      );
      return new Promise<PermissionResult>((resolve) => {
        permissionResolve = resolve;
      });
    },
  },
});

for await (const msg of activeQuery) {
  process.stdout.write(
    JSON.stringify({ type: "agent_message", message: msg }) + "\n"
  );
}

process.stdout.write(JSON.stringify({ type: "sidecar_exit" }) + "\n");
```

**Rust-side spawn** (Research: 06-stream-json sec. 12):

```rust
struct AgentBridge {
    child: Child,
    stdin: ChildStdin,
    event_tx: mpsc::Sender<AgentEvent>,
    session_id: Option<String>,
}

impl AgentBridge {
    fn spawn(sidecar_path: &str, cwd: &str, resume: Option<&str>) -> Result<Self> {
        let mut cmd = Command::new("node");
        cmd.arg(sidecar_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("VANTAGE_CWD", cwd);

        if let Some(session_id) = resume {
            cmd.env("VANTAGE_RESUME_SESSION", session_id);
        }

        let mut child = cmd.spawn()?;
        let stdout = child.stdout.take().unwrap();
        let (event_tx, _event_rx) = mpsc::channel(1000); // Bounded channel

        // Dedicated reader thread
        let tx = event_tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if let Ok(msg) = serde_json::from_str::<AgentEvent>(&line) {
                    let _ = tx.send(msg).await;
                }
            }
        });

        Ok(Self {
            child,
            stdin: child.stdin.take().unwrap(),
            event_tx,
            session_id: None,
        })
    }
}
```

**Restart after crash:**

1. Detect crash: stdout pipe closes, process exits with non-zero status.
2. Capture the `session_id` from the last `system/init` message.
3. Spawn new sidecar with `VANTAGE_RESUME_SESSION=<session_id>`.
4. SDK reconnects using the JSONL transcript on disk.
5. Show toast: "Claude session recovered."

**Shutdown:**

1. On Vantage exit, call `query.close()` on each sidecar.
2. SDK sends SIGINT to the Claude CLI process.
3. Wait 5 seconds for graceful exit.
4. If still alive, kill the process tree.
5. Clean up orphaned Node.js processes by PID tracking.

### 4.3 Message Types and Handling

The sidecar emits NDJSON on stdout. Each line has a `type` field:

| Sidecar stdout `type` | Handling |
|----------------------|----------|
| `agent_message` with `message.type === "system"` and `subtype === "init"` | Store `session_id`, `model`, `claude_code_version`, `tools`. Update `sessionsStore`. |
| `agent_message` with `message.type === "assistant"` | Complete assistant turn. Append to `conversationStore`. |
| `agent_message` with `message.type === "stream_event"` | Delta accumulation. Update current message block in `conversationStore`. |
| `agent_message` with `message.type === "result"` | Session complete. Extract `total_cost_usd`, `usage`, `num_turns`. Update `sessionsStore` and status bar. |
| `agent_message` with `message.type === "system"` and `subtype === "api_retry"` | Show toast: "Rate limited. Retrying in {retry_delay_ms}ms (attempt {attempt}/{max_retries})." |
| `agent_message` with `message.type === "system"` and `subtype === "compact_boundary"` | Show indicator in chat: "Context compacted at {pre_tokens} tokens." |
| `permission_request` | Trigger `PermissionDialog` via `permissionStore`. |
| `sidecar_exit` | Session ended. Update status. |

### 4.4 Permission Handling

The `canUseTool` callback in the sidecar produces a `permission_request`. The Rust side emits a Tauri event. React renders a `PermissionDialog`.

**PermissionResult type** (Research: 06-stream-json sec. 9):

```typescript
type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
    };
```

**Permission evaluation order** (Research: 02-internals sec. 7):

1. Deny rules (always win, cannot be overridden by hooks)
2. Allow rules (pre-approve matching patterns)
3. `canUseTool` callback (prompt user via PermissionDialog)

**Default permission mode**: `default` (ask for everything not pre-approved).

**Pre-configured safe patterns** (Research: 08-synthesis Q6):

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(npm test)",
      "Bash(npm run lint)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force *)"
    ]
  }
}
```

### 4.5 Session Management

**Create:** Spawn new sidecar without `VANTAGE_RESUME_SESSION`. SDK creates a new session, writes JSONL to `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`.

**Resume:** Spawn sidecar with `VANTAGE_RESUME_SESSION=<session-id>`. SDK reloads context from JSONL file.

**Continue:** Spawn sidecar with `VANTAGE_RESUME_SESSION=latest`. SDK finds the most recent session for the CWD.

**Fork:** Spawn sidecar with both `VANTAGE_RESUME_SESSION` and `VANTAGE_FORK=true`. SDK copies history into a new session, leaving the original unchanged.

**Session discovery** (Research: 06-stream-json sec. 7):

```typescript
import {
  listSessions,
  getSessionMessages,
} from "@anthropic-ai/claude-agent-sdk";

const sessions = await listSessions({ dir: "/path/to/project", limit: 50 });
```

### 4.6 Delta Accumulation Strategy

Stream events arrive as individual `content_block_delta` messages. Rendering each one individually causes render thrash. Instead (Research: 08-synthesis sec. 2.4, Decision 5):

1. `conversationStore` maintains an `activeBlocks` map keyed by `(sessionId, messageId, blockIndex)`.
2. On `content_block_start`: create a new empty block entry.
3. On `content_block_delta`:
   - For `text_delta`: append `delta.text` to the block's accumulated text.
   - For `input_json_delta`: append `delta.partial_json` to the block's accumulated JSON string.
   - For `thinking_delta`: append `delta.thinking` to the block's accumulated thinking text.
4. On `content_block_stop`: mark the block as complete.
5. On `message_stop`: assemble all blocks into a complete message. Move from `activeBlocks` to the `messages` array.

Components subscribe to `activeBlocks` via selectors. Only the streaming message re-renders during streaming.

### 4.7 Fallback: Raw CLI for One-Shot Operations

For lightweight operations where spawning a full SDK session is overkill (Research: 08-synthesis sec. 1.4):

```bash
claude -p "Summarize this file" --output-format stream-json --verbose src/auth.ts
```

Used for: quick file analysis, one-shot questions, session listing. Spawned via Rust `Command::new("claude")` with stdout parsing.

### 4.8 Session History: JSONL Parsing

To browse past sessions without spawning Claude Code (Research: 02-internals sec. 8):

**Directory structure:**
```
~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
```

**Path encoding:** Replace every non-alphanumeric character with `-`:
- `C:\Users\me\project` becomes `C--Users-me-project`

**Record types in JSONL:**
- `user` -- user messages
- `assistant` -- assistant messages (with `content` array of text, tool_use, thinking blocks)
- `tool_result` -- tool execution results
- `system` (subtype `init`) -- session initialization
- `system` (subtype `compact_boundary`) -- context compaction marker
- `session_start` -- session continuation/resume marker

**UUID chain reconstruction:**
1. Parse all JSONL files for the project.
2. Build a `parentUuid -> childUuid` map.
3. Follow the UUID chain chronologically.
4. Filter out records where `isCompactSummary === true`.
5. If first `sessionId` differs from filename ID, skip prefix messages (they are duplicates from the parent session).

---

## 5. UI Layout and Components

### 5.1 Overall Layout

```
+---+-------------------------------+---+
| A |         Title Bar             |   |
| c +----------+------------+------+   |
| t | Primary  |            | Sec. |   |
| i | Sidebar  |   Editor   | Side |   |
| v | (Files,  |   Area     | bar  |   |
| i | Search,  |  (Tabs,    | (AI  |   |
| t | Git,     |   Splits,  | Chat)|   |
| y | Agents)  |   Minimap) |      |   |
|   |          |            |      |   |
| B +----------+------------+------+   |
| a |          Panel                |   |
| r |  (Terminal, Output, Problems) |   |
+---+-------------------------------+   |
|          Status Bar               |   |
+-----------------------------------+---+
```

All six regions use `react-resizable-panels` (via shadcn Resizable). Panel sizes persist in `layoutStore`. (Research: 05-ux sec. 1.1, 6.1)

### 5.2 Activity Bar

**Position:** Far left, vertical, 48px wide.
**Icons** (top to bottom):

| Icon | Label | View | Keyboard |
|------|-------|------|----------|
| `files` (Lucide) | Explorer | File tree | Ctrl+Shift+E |
| `search` (Lucide) | Search | Find in files | Ctrl+Shift+F |
| `git-branch` (Lucide) | Source Control | Git panel | Ctrl+Shift+G |
| `bot` (Lucide) | Agents | Agent dashboard / kanban | Ctrl+Shift+A |
| `settings` (Lucide) | Settings | Settings dialog | Ctrl+, |

**Behavior:**
- Click an icon to toggle its sidebar view.
- Click the active icon again to collapse the primary sidebar.
- Badge indicators show counts: git changes, search results, agents needing attention.
- The active icon has a left border accent (`--color-blue`, 2px).

### 5.3 File Explorer

**Component:** `FileExplorer` in `components/files/`

**Tree loading** (Research: 03-tauri sec. 4):
- Rust command `list_directory(path, depth)` uses the `ignore` crate (same as ripgrep).
- Initial load: 2 levels deep from project root.
- Expand on demand: click a directory to load its children lazily.
- Automatically respects `.gitignore`, `.ignore`, and global gitignore.
- Collapsed state persists in `layoutStore`.

**Visual indicators:**
- File icons by extension (use a simple icon mapping, not full VS Code icon theme).
- Git status: `M` (modified, yellow), `A` (added, green), `D` (deleted, red), `?` (untracked, grey).
- Agent ownership dots: colored circles next to files being edited by agents (P1 feature).

**Context menu** (right-click):
- Open in Editor
- Open to the Side
- Copy Path
- Copy Relative Path
- Rename (F2)
- Delete (Del, with confirmation dialog)
- Reveal in File Explorer (opens Windows Explorer)

**Drag behavior:** Drag a file node onto the editor area to open it in a new tab.

### 5.4 Code Editor

**Component:** `MonacoWrapper` in `components/editor/`

**Core features:**
- Monaco Editor with full IntelliSense, syntax highlighting, find/replace, minimap.
- Tab bar above editor. Tabs show filename, dirty indicator (dot), and close button.
- Preview mode: single-click opens an italic-titled preview tab. Double-click or edit to pin.
- Split views: horizontal and vertical splits via Ctrl+\\ or drag-to-edge.
- Breadcrumb navigation: file path segments above the editor content.
- Minimap: right-side code outline, click to jump.

**Vite integration** (Research: 03-tauri sec. 3):
```typescript
// vite.config.ts
import monacoEditorPlugin from "vite-plugin-monaco-editor";

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: [
        "editorWorkerService",
        "typescript",
        "json",
        "css",
        "html",
      ],
    }),
  ],
});
```

**WebView2 headers for SharedArrayBuffer** (if needed):
```json
{
  "app": {
    "security": {
      "headers": {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    }
  }
}
```

**Monaco editor props:**

```typescript
interface MonacoWrapperProps {
  filePath: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  diffOriginal?: string; // If set, render inline diff mode
}
```

### 5.5 Terminal Panel

**Component:** `TerminalPanel` in `components/terminal/`

**Stack** (Research: 03-tauri sec. 2, 07-windows sec. 1):
- xterm.js 5.x with WebGL renderer (`@xterm/addon-webgl`)
- PTY backend: `tauri-plugin-pty` (wraps `portable-pty` ^0.9 using ConPTY)
- Shell detection: PowerShell 7 > Windows PowerShell 5.1 > Git Bash > CMD

**Tab management:**
- Multiple terminal tabs.
- New terminal: Ctrl+Shift+\` or "+" button.
- Each tab shows shell name and optional title.
- Close tab: click X or Ctrl+W when terminal is focused.

**Terminal configuration:**

```typescript
const terminalOptions: ITerminalOptions = {
  fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
  fontSize: 14,
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: "block",
  scrollback: 10000,
  theme: {
    background: "#1e1e2e", // Catppuccin Base
    foreground: "#cdd6f4", // Catppuccin Text
    cursor: "#f5e0dc", // Catppuccin Rosewater
    selectionBackground: "#45475a80", // Catppuccin Surface 1 + alpha
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
};
```

**ConPTY gotchas** (Research: 07-windows sec. 1.4):
- Use `CREATE_NO_WINDOW` flag when spawning to suppress cmd window flash.
- Handle `webglcontextlost` event by falling back to canvas renderer.
- Do not rely on custom DCS escape sequences (ConPTY swallows them).
- Implement periodic ConPTY state resets if terminal rendering drifts.

### 5.6 Chat Panel (Secondary Sidebar)

**Component:** `ChatPanel` in `components/chat/`

**Position:** Right-side secondary sidebar, toggleable with Ctrl+Shift+B.

**Message types rendered:**

| Message Type | Rendering |
|-------------|-----------|
| User message | Right-aligned bubble, user's text |
| Assistant text | Left-aligned, markdown rendered via `react-markdown` + `remark-gfm` |
| Thinking block | Collapsible block: "Thought for Xs" header. Auto-expanded while thinking, auto-collapsed when response starts. Muted styling (smaller font, `--color-surface-0` background). (Research: 05-ux sec. 2.2, 08-synthesis Q7) |
| Tool call | Inline card: tool name badge, input preview (truncated), expand to see full input/output. Color-coded by tool type. |
| Code block | Syntax highlighted via Shiki. Copy button (top-right). "Apply to Editor" button if the code matches an open file. Language label. |
| Error | Red-bordered card with error message and retry button. |
| Streaming text | Token-by-token rendering with auto-scroll. Auto-scroll pauses if user scrolls up. Stop button visible during streaming. |

**Chat input:**
- Multi-line text area at the bottom (Shift+Enter for newline, Enter to send).
- Send button (arrow icon) and stop button (square icon, visible during streaming).
- File/symbol mention support: type `@` to autocomplete files and symbols.
- Slash commands: `/help`, `/compact`, `/cost`, `/clear`.

**Cost display:**
- After each `result` message, show: "Cost: $X.XX | Turns: N | Duration: Xs"
- Running total visible in status bar.

### 5.7 Permission Dialog

**Component:** `PermissionDialog` in `components/permissions/`

**Trigger:** `permission_request` event from sidecar.

**Layout:**

```
+--------------------------------------------------+
| [Risk Level Color Bar]                            |
|                                                   |
|  Tool: Bash                                       |
|  Operation: Execute shell command                 |
|                                                   |
|  +----------------------------------------------+ |
|  | $ rm -rf build/                               | |
|  |                                               | |
|  +----------------------------------------------+ |
|                                                   |
|  [What will this do?] (expandable)               |
|                                                   |
|  +--------+  +------+  +---------+  +----------+ |
|  | Allow  |  | Deny |  | Allow   |  | Create   | |
|  |  (Y)   |  | (N)  |  | Session |  | Rule     | |
|  |        |  |      |  |  (S)    |  |          | |
|  +--------+  +------+  +---------+  +----------+ |
+--------------------------------------------------+
```

**Risk level colors** (Research: 05-ux sec. 2.4):
- Green top bar: Read-only operations (Read, Glob, Grep)
- Yellow top bar: Write operations (Edit, Write, Bash non-destructive)
- Red top bar: Destructive operations (Bash with `rm`, `git push --force`, etc.)

**For file edits (Edit, Write tools):** Show an inline diff preview below the tool input. Green for additions, red for deletions.

**Keyboard shortcuts:**
- `Y` or `Enter`: Allow
- `N` or `Escape`: Deny
- `S`: Allow for session
- `R`: Open rule creation dialog

**The dialog is modal and blocks all other input until resolved.** The SDK's `canUseTool` Promise holds indefinitely -- there is no timeout.

### 5.8 Diff Viewer

**Component:** `DiffViewer` in `components/diff/`

**Two modes** (Research: 05-ux sec. 2.5):

**Inline Diff (default for single-file changes):**
- Monaco Editor's built-in inline diff view.
- Green background for additions, red for deletions.
- Per-hunk Accept/Reject buttons floating above each change.
- "Accept All" / "Reject All" buttons at the top of the file.
- Gutter indicators: `+`/`-` symbols.

**Multi-File Review Panel (for agent changes across files, P1):**
- Left tree: list of changed files with `+N -M` counts.
- Right panel: diff for the selected file.
- "Viewed" checkmark per file to track review progress.
- Toggle between unified and split diff modes.
- Uses `react-diff-view` for the multi-file experience.

### 5.9 Command Palette

**Component:** `CommandPalette` in `components/shared/`

**Trigger:** Ctrl+Shift+P

**Modes** (Research: 05-ux sec. 1.4):

| Prefix | Mode | Source |
|--------|------|--------|
| `>` | Commands | Registered command actions |
| (none) | Files | Project files via `ignore` crate walk |
| `@` | Symbols | Monaco symbols in current file |
| `:` | Go to line | Line number input |
| (natural language) | Claude | Route to active chat session |

**Implementation:** shadcn Command component (wraps cmdk). Fuzzy matching via `command-score`. Recently used items surface first. Keybinding hints shown next to each command.

### 5.10 Status Bar

**Component:** `StatusBar` in `components/layout/`

**Left side (workspace-scoped):**
- Git branch name + sync indicator (arrows for ahead/behind)
- Error/warning count (click to open Problems panel)
- Claude session status indicator

**Right side (file/session-scoped):**
- Line and column: `Ln X, Col Y`
- Language mode (click to change)
- Encoding: `UTF-8`
- Line endings: `LF` / `CRLF`
- Active model name: `claude-opus-4-6`
- Session token cost: `$0.12`
- Agent status summary: `2 running, 1 review` (when agents active)

### 5.11 Markdown Preview

**Component:** `MarkdownPreview` in `components/editor/`

**Trigger:** Open any `.md` file, click "Preview" button in tab bar.

**Features:**
- Live preview of `.md` files rendered via `react-markdown` + `remark-gfm` + `rehype-raw`.
- Side-by-side with the editor (split view).
- Synchronized scrolling.
- GFM support: tables, task lists, strikethrough, autolinks.
- Code blocks syntax highlighted via Shiki.

### 5.12 Git Panel

**Component:** `GitPanel` in `components/git/`

**Activity Bar item:** Source Control (Ctrl+Shift+G)

**Features (P0):**
- Branch name display with dropdown selector.
- Staged / Unstaged file lists with git status indicators.
- Diff stats per file (`+N -M`).
- Click a file to open its diff in the editor.
- Stage / Unstage buttons per file.

**Features (P1):**
- Commit input with message box.
- Push/Pull buttons.
- Git log viewer.
- Inline blame annotations.

### 5.13 Agent Dashboard

**Component:** `AgentDashboard` in `components/agents/`

**Activity Bar item:** Agents (Ctrl+Shift+A)

**Kanban Board (P1)** (Research: 05-ux sec. 3.2):

Four columns: Backlog | In Progress | Review | Done

Each card shows:
- Task name (editable)
- Assigned agent name
- File count badge
- Running cost ($X.XX)
- Elapsed time
- Status color border (grey/blue/yellow/green/red)
- Badge when agent needs attention (permission, error)

Drag-and-drop between columns via `@dnd-kit/core`.

**Timeline View (P1):**
- Chronological event stream per agent.
- Events: file reads, edits, commands with timestamps.
- Expandable event details (click to see diff, command output).
- Progress bars (indeterminate or percentage).
- Inline alerts for attention-needed events.

**File Ownership Visualization:**
- In the file explorer, colored dots next to files being edited by agents.
- Agent A = blue, Agent B = green, Agent C = orange, etc.
- Files touched by multiple agents get a warning icon.
- Hover for agent name and operation description.

---

## 6. Keybindings

### 6.1 Tier 1: Non-Negotiable (Ship in 1.0)

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+P | Open command palette |
| Ctrl+P | Quick open file |
| Ctrl+B | Toggle primary sidebar |
| Ctrl+Shift+B | Toggle secondary sidebar (chat) |
| Ctrl+J | Toggle bottom panel |
| Ctrl+\` | Toggle terminal |
| Ctrl+Shift+\` | New terminal tab |
| Ctrl+\\ | Split editor vertically |
| Ctrl+W | Close current tab |
| Ctrl+S | Save current file |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Ctrl+F | Find in file |
| Ctrl+H | Find and replace in file |
| Ctrl+Shift+F | Find in files (project search) |
| Ctrl+G | Go to line |
| F12 | Go to definition |
| Ctrl+/ | Toggle line comment |
| Alt+Up/Down | Move line up/down |
| Shift+Alt+Down | Duplicate line |
| Ctrl+D | Select next occurrence |
| Ctrl+Shift+L | Select all occurrences |
| Shift+Alt+F | Format document |
| Ctrl+1/2/3 | Focus editor group 1/2/3 |
| Ctrl+Shift+E | Focus file explorer |
| Ctrl+Shift+G | Focus source control |
| Ctrl+Shift+A | Focus agent dashboard |
| Ctrl+, | Open settings |
| Escape | Close dialog / cancel |
| Enter | Submit chat / confirm |

### 6.2 Tier 2: Expected (Ship Soon After 1.0)

| Shortcut | Action |
|----------|--------|
| Ctrl+K Z | Zen mode |
| Ctrl+Shift+[ / ] | Fold/Unfold code block |
| Ctrl+Shift+O | Go to symbol in file |
| Alt+F12 | Peek definition |
| F2 | Rename symbol |
| Ctrl+. | Quick fix / code actions |
| Alt+Z | Toggle word wrap |
| Ctrl+Tab | Cycle through open tabs |
| Ctrl+Shift+Tab | Cycle through open tabs (reverse) |

### 6.3 Configuration

Keybindings are configurable via `keybindings.json` in Vantage's config directory:

```json
[
  {
    "key": "ctrl+shift+p",
    "command": "commandPalette.open"
  },
  {
    "key": "ctrl+b",
    "command": "layout.togglePrimarySidebar"
  }
]
```

Users override defaults by adding entries to this file. The last matching entry wins.

---

## 7. Theme System

### 7.1 Default Theme: Vantage Dark (Catppuccin Mocha Inspired)

(Research: 05-ux sec. 4.2, 4.4)

All colors are defined as CSS custom properties on `:root`. Components reference these variables, never hardcoded hex values.

### 7.2 Surface Layering

| CSS Variable | Role | Hex |
|-------------|------|-----|
| `--color-base` | Editor background, primary surface | `#1e1e2e` |
| `--color-mantle` | Sidebar background, elevated panels | `#181825` |
| `--color-crust` | Activity bar, deepest surfaces | `#11111b` |
| `--color-surface-0` | Panel backgrounds, cards | `#313244` |
| `--color-surface-1` | Card backgrounds, elevated elements | `#45475a` |
| `--color-surface-2` | Hover states, active items | `#585b70` |
| `--color-overlay-0` | Subtle borders, disabled text | `#6c7086` |
| `--color-overlay-1` | Muted text, placeholder text | `#7f849c` |
| `--color-overlay-2` | Secondary labels | `#9399b2` |

### 7.3 Text Hierarchy

| CSS Variable | Role | Hex |
|-------------|------|-----|
| `--color-text` | Primary text, body content | `#cdd6f4` |
| `--color-subtext-1` | Secondary body text | `#bac2de` |
| `--color-subtext-0` | Tertiary text, labels | `#a6adc8` |

### 7.4 Accent Colors

| CSS Variable | Role | Hex | Use |
|-------------|------|-----|-----|
| `--color-blue` | Primary accent | `#89b4fa` | Active states, links, focus rings |
| `--color-peach` | Warning | `#fab387` | Warning indicators, numbers |
| `--color-red` | Error/danger | `#f38ba8` | Errors, destructive actions, deleted lines |
| `--color-green` | Success | `#a6e3a1` | Success indicators, added lines, strings |
| `--color-mauve` | Keywords | `#cba6f7` | Keywords in syntax, decorators |
| `--color-yellow` | Caution/types | `#f9e2af` | Types in syntax, caution indicators |
| `--color-teal` | Info | `#94e2d5` | Information badges |
| `--color-sky` | Operators | `#89dceb` | Operators in syntax |
| `--color-lavender` | Properties | `#b4befe` | Properties, secondary accent |
| `--color-rosewater` | Cursor | `#f5e0dc` | Terminal cursor, warm accents |
| `--color-flamingo` | Soft accent | `#f2cdcd` | Subtle highlights |
| `--color-pink` | Agent markers | `#f5c2e7` | Agent-related indicators |
| `--color-maroon` | Parameters | `#eba0ac` | Parameters in syntax |
| `--color-sapphire` | Tertiary accent | `#74c7ec` | Tertiary accent, links |

### 7.5 Syntax Highlighting Token Colors

| Token Category | TextMate Scope | Color Variable |
|---------------|---------------|---------------|
| Keywords | `keyword.*` | `--color-mauve` |
| Strings | `string.*` | `--color-green` |
| Numbers | `constant.numeric.*` | `--color-peach` |
| Comments | `comment.*` | `--color-overlay-0` |
| Functions | `entity.name.function` | `--color-blue` |
| Types/Classes | `entity.name.type` | `--color-yellow` |
| Variables | `variable.*` | `--color-text` |
| Constants | `constant.*` | `--color-peach` |
| Operators | `keyword.operator.*` | `--color-sky` |
| Properties | `variable.other.property` | `--color-lavender` |
| Parameters | `variable.parameter` | `--color-maroon` |
| Decorators | `meta.decorator` | `--color-mauve` |
| HTML Tags | `entity.name.tag` | `--color-blue` |
| HTML Attributes | `entity.other.attribute-name` | `--color-yellow` |
| Regex | `string.regexp` | `--color-peach` |
| Invalid | `invalid.*` | `--color-red` |

### 7.6 CSS Custom Properties Declaration

```css
:root {
  /* Surfaces */
  --color-base: #1e1e2e;
  --color-mantle: #181825;
  --color-crust: #11111b;
  --color-surface-0: #313244;
  --color-surface-1: #45475a;
  --color-surface-2: #585b70;
  --color-overlay-0: #6c7086;
  --color-overlay-1: #7f849c;
  --color-overlay-2: #9399b2;

  /* Text */
  --color-text: #cdd6f4;
  --color-subtext-1: #bac2de;
  --color-subtext-0: #a6adc8;

  /* Accents */
  --color-rosewater: #f5e0dc;
  --color-flamingo: #f2cdcd;
  --color-pink: #f5c2e7;
  --color-mauve: #cba6f7;
  --color-red: #f38ba8;
  --color-maroon: #eba0ac;
  --color-peach: #fab387;
  --color-yellow: #f9e2af;
  --color-green: #a6e3a1;
  --color-teal: #94e2d5;
  --color-sky: #89dceb;
  --color-sapphire: #74c7ec;
  --color-blue: #89b4fa;
  --color-lavender: #b4befe;

  /* Semantic aliases */
  --color-primary: var(--color-blue);
  --color-warning: var(--color-peach);
  --color-error: var(--color-red);
  --color-success: var(--color-green);
  --color-info: var(--color-teal);

  /* Borders */
  --color-border: var(--color-surface-0);
  --color-border-focus: var(--color-blue);

  /* Typography */
  --font-mono: "JetBrains Mono", "Cascadia Code", "Fira Code", monospace;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-size-editor: 14px;
  --font-size-ui: 13px;
  --font-size-small: 12px;
  --line-height-editor: 1.5;
}
```

Theme switching replaces the CSS custom property values at runtime. Future themes (Vantage Light, High Contrast) redefine these same variables.

---

## 8. Data Model

### 8.1 SQLite Schema

```sql
-- Sessions table: metadata for Claude Code sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                    -- session UUID
  project_path TEXT NOT NULL,             -- absolute path to project directory
  encoded_cwd TEXT NOT NULL,              -- Claude Code's encoded CWD (e.g., "C--Users-me-proj")
  display_name TEXT,                      -- user-assigned session name
  slug TEXT,                              -- human-readable slug (e.g., "zesty-singing-newell")
  model TEXT NOT NULL,                    -- model used (e.g., "claude-opus-4-6-20250415")
  status TEXT NOT NULL DEFAULT 'active',  -- active, completed, error, archived
  total_cost_usd REAL DEFAULT 0.0,       -- accumulated cost
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  num_turns INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,               -- ISO 8601 UTC
  updated_at TEXT NOT NULL,               -- ISO 8601 UTC
  parent_session_id TEXT,                 -- if resumed/forked from another session
  jsonl_path TEXT,                        -- path to the .jsonl file on disk
  summary TEXT                            -- last assistant message or result text (truncated)
);

CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

-- Settings table: key-value store for all preferences
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                    -- JSON-encoded value
  scope TEXT NOT NULL DEFAULT 'user',     -- user, project, session
  updated_at TEXT NOT NULL
);

-- Usage statistics: per-session cost tracking
CREATE TABLE usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cost_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL              -- ISO 8601 UTC
);

CREATE INDEX idx_usage_session ON usage_stats(session_id);
CREATE INDEX idx_usage_recorded ON usage_stats(recorded_at);

-- Agent tasks: kanban board state
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,                    -- task UUID
  project_path TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog', -- backlog, in_progress, review, done, error
  assigned_agent TEXT,                    -- agent name or session ID
  session_id TEXT REFERENCES sessions(id),
  worktree_path TEXT,                     -- git worktree path if isolated
  files_changed INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0           -- position within column
);

CREATE INDEX idx_tasks_project ON agent_tasks(project_path);
CREATE INDEX idx_tasks_status ON agent_tasks(status);
```

### 8.2 JSONL Session Parsing Types

```typescript
// Core JSONL record (every line in the .jsonl file)
interface JSONLRecord {
  type: "user" | "assistant" | "tool_result" | "system" | "session_start";
  sessionId: string;
  timestamp: string; // ISO 8601
  uuid: string;
  parentUuid: string | null;
}

interface UserRecord extends JSONLRecord {
  type: "user";
  message: {
    role: "user";
    content: string | ContentBlock[];
  };
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;
}

interface AssistantRecord extends JSONLRecord {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
}

interface ToolResultRecord extends JSONLRecord {
  type: "tool_result";
  toolUseId: string;
  content: string;
  durationMs: number;
}

interface SystemInitRecord extends JSONLRecord {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: string[];
  model: string;
  permissionMode: string;
  claude_code_version: string;
}

interface CompactBoundaryRecord extends JSONLRecord {
  type: "system";
  subtype: "compact_boundary";
  logicalParentUuid: string;
  compactMetadata: {
    trigger: "auto" | "manual";
    preTokens: number;
  };
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking"; thinking: string; signature?: string };
```

### 8.3 File Tree Model

```typescript
interface FileNode {
  name: string;
  path: string; // Absolute path, Windows-normalized
  isDir: boolean;
  children?: FileNode[]; // null until expanded (lazy loading)
  gitStatus?: "M" | "A" | "D" | "?" | "R" | null;
  agentOwners?: string[]; // Agent session IDs editing this file
}
```

### 8.4 Conversation Model

```typescript
interface ConversationMessage {
  id: string; // UUID
  sessionId: string;
  role: "user" | "assistant" | "system";
  blocks: MessageBlock[];
  timestamp: string;
  isStreaming: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}

type MessageBlock =
  | { type: "text"; text: string }
  | {
      type: "thinking";
      thinking: string;
      durationMs: number;
      isCollapsed: boolean;
    }
  | {
      type: "tool_call";
      toolName: string;
      toolUseId: string;
      input: Record<string, unknown>;
      status: "pending" | "running" | "success" | "error" | "denied";
      result?: string;
      durationMs?: number;
    }
  | {
      type: "code";
      language: string;
      code: string;
      filePath?: string; // If code maps to a known file
    }
  | {
      type: "error";
      errorType: string;
      message: string;
    };

// Delta accumulation buffer (only for the currently streaming message)
interface StreamingState {
  activeMessageId: string | null;
  activeBlocks: Map<
    number, // block index
    {
      type: "text" | "thinking" | "tool_call";
      accumulatedText: string;
      accumulatedJson: string;
      isComplete: boolean;
    }
  >;
}
```

---

## 9. Windows-Specific Handling

### 9.1 Path Normalization Module

(Research: 07-windows sec. 3.1, 08-synthesis sec. 6)

Every IPC boundary between React, Rust, Node.js sidecar, and Claude Code must go through path normalization. Claude Code's file tools expect Windows paths; its Bash tool uses Git Bash POSIX paths.

```rust
// src-tauri/src/files/paths.rs

/// Normalize a path for display and IPC.
/// Converts to Windows format with backslashes.
pub fn normalize_to_windows(path: &str) -> String {
    let path = path.replace('/', "\\");
    // Handle Git Bash POSIX paths: /c/Users/... -> C:\Users\...
    if path.starts_with("\\") && path.len() > 2 && path.chars().nth(2) == Some('\\') {
        let drive = path.chars().nth(1).unwrap().to_uppercase().next().unwrap();
        return format!("{}:{}", drive, &path[2..]);
    }
    path
}

/// Convert a Windows path to POSIX format for Git Bash.
pub fn normalize_to_posix(path: &str) -> String {
    let path = path.replace('\\', "/");
    // C:/Users/... -> /c/Users/...
    if path.len() >= 3 && path.chars().nth(1) == Some(':') {
        let drive = path.chars().next().unwrap().to_lowercase().next().unwrap();
        return format!("/{}{}", drive, &path[2..]);
    }
    path
}

/// Encode a path for Claude Code session directory naming.
/// Replaces every non-alphanumeric character with '-'.
pub fn encode_for_session_dir(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect()
}

/// Strip UNC extended-length prefix if present.
pub fn strip_unc_prefix(path: &str) -> &str {
    path.strip_prefix("\\\\?\\").unwrap_or(path)
}
```

### 9.2 ConPTY Considerations

(Research: 07-windows sec. 1)

- ConPTY filters unrecognized VT escape sequences. Do not use custom DCS codes.
- OSC codes mostly pass through but may arrive out-of-order. Use forced flushing.
- The `CREATE_NO_WINDOW` flag must be set when spawning ConPTY processes to suppress the cmd window flash.
- ConPTY caches terminal grid state. Implement periodic resets if rendering drifts.
- Thread safety: one ConPTY instance per terminal tab. Do not share across threads.
- `portable-pty` automatically selects ConPTY on Windows 10 1809+ and Windows 11.

### 9.3 Git Bash Detection

(Research: 07-windows sec. 5.1)

At first launch and on each startup, locate Git Bash:

```rust
fn detect_git_bash() -> Option<PathBuf> {
    // 1. Check CLAUDE_CODE_GIT_BASH_PATH env var
    if let Ok(path) = std::env::var("CLAUDE_CODE_GIT_BASH_PATH") {
        let p = PathBuf::from(&path);
        if p.exists() { return Some(p); }
    }

    // 2. Standard installation paths
    let standard_paths = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ];
    for path in &standard_paths {
        let p = PathBuf::from(path);
        if p.exists() { return Some(p); }
    }

    // 3. Derive from git.exe location
    if let Ok(output) = Command::new("where.exe").arg("git").output() {
        if let Ok(git_path) = String::from_utf8(output.stdout) {
            let git_path = git_path.trim();
            // git.exe is at C:\Program Files\Git\cmd\git.exe
            // bash.exe is at C:\Program Files\Git\bin\bash.exe
            if let Some(parent) = PathBuf::from(git_path).parent().and_then(|p| p.parent()) {
                let bash = parent.join("bin").join("bash.exe");
                if bash.exists() { return Some(bash); }
            }
        }
    }

    None
}
```

If Git Bash is not found, show a blocking dialog: "Git for Windows is required. Install via `winget install Git.Git` or download from git-scm.com."

Set `CLAUDE_CODE_GIT_BASH_PATH` in the environment passed to all sidecar processes.

### 9.4 File Locking Retry Logic

(Research: 07-windows sec. 3.3)

Windows uses mandatory file locking. Wrap all file operations with retry:

```rust
use std::thread::sleep;
use std::time::Duration;

const RETRY_DELAYS: [Duration; 3] = [
    Duration::from_millis(100),
    Duration::from_millis(500),
    Duration::from_millis(2000),
];

fn retry_file_op<T, F: Fn() -> std::io::Result<T>>(op: F) -> std::io::Result<T> {
    let mut last_err = None;
    for (i, delay) in RETRY_DELAYS.iter().enumerate() {
        match op() {
            Ok(val) => return Ok(val),
            Err(e) => {
                if e.raw_os_error() == Some(32) /* ERROR_SHARING_VIOLATION */
                    || e.raw_os_error() == Some(33) /* ERROR_LOCK_VIOLATION */
                {
                    last_err = Some(e);
                    if i < RETRY_DELAYS.len() - 1 {
                        sleep(*delay);
                    }
                } else {
                    return Err(e);
                }
            }
        }
    }
    Err(last_err.unwrap())
}
```

### 9.5 WebView2 Validation

(Research: 07-windows sec. 2)

WebView2 is preinstalled on Windows 11. Validate at startup:

1. Check WebView2 presence via registry or `GetAvailableCoreWebView2BrowserVersionString`.
2. If absent (edge case), the Tauri NSIS installer includes a downloaded bootstrapper that installs it.
3. Use feature detection in JavaScript, not version sniffing. Test all CSS/JS features used.
4. Handle `webglcontextlost` event for xterm.js by falling back to canvas renderer.

### 9.6 First-Launch Prerequisite Checker

(Research: 07-windows sec. 9.6)

On first launch, Vantage runs a prerequisite check and shows results in a setup wizard:

| Check | Method | Failure Action |
|-------|--------|---------------|
| Git for Windows installed | `where.exe git` | Prompt: "Install Git for Windows" with `winget install Git.Git` command |
| Git Bash accessible | Scan standard paths | Prompt: "Configure Git Bash path" |
| Claude Code installed | `where.exe claude` + `claude --version` | Prompt: "Install Claude Code" with `winget install Anthropic.ClaudeCode` |
| Claude Code on PATH | `claude --version` succeeds | Warn about PATH configuration |
| Long paths enabled | Registry `HKLM\...\FileSystem\LongPathsEnabled` | Warn: "Enable long paths for best experience" |
| WebView2 version | Feature detection | Auto-install via bootstrapper |
| Git configuration | `git config core.autocrlf` | Recommend `* text=auto eol=lf` in `.gitattributes` |

Results are displayed in a checklist dialog. Green checkmarks for passing, red X for failing with actionable instructions. The user can proceed with warnings but not with errors (missing Git, missing Claude Code).

---

## 10. Error Handling

### 10.1 API Errors

(Research: 06-stream-json sec. 3.5, 08-synthesis Q10)

| Error Type | Detection | User-Facing Response |
|-----------|-----------|---------------------|
| Rate limit (`429`) | `system/api_retry` event | Toast: "Rate limited. Retrying in {delay}s (attempt {n}/{max})." Non-blocking. |
| Authentication failed | `error` field on `SDKAssistantMessage` | Blocking dialog: "Authentication failed. Check your API key with `claude auth status`." |
| Billing error | `error` field | Blocking dialog: "Billing issue. Check your Anthropic account at console.anthropic.com." |
| Server error (`500`) | `system/api_retry` event | Toast: "Anthropic server error. Retrying..." Auto-retry up to 10 times. |
| Max turns exceeded | `result` with `subtype: "error_max_turns"` | In-chat message: "Reached maximum turns ({n}). Send another message to continue." |
| Max budget exceeded | `result` with `subtype: "error_max_budget_usd"` | In-chat message: "Budget limit reached ($X.XX). Adjust in settings to continue." |
| Network disconnection | sidecar stdout closes unexpectedly | Toast: "Connection lost. Attempting to reconnect..." Attempt sidecar restart with session resume. |

All retries follow exponential backoff. If all retries fail, show a blocking error dialog with the error type, a suggestion, and a "Retry" button.

### 10.2 Sidecar Crashes

(Research: 08-synthesis Risk 7)

**Detection:**
- stdout pipe closes (reader thread receives EOF).
- Process exits with non-zero status.
- Watchdog: if no stdout for 60 seconds, check process health via PID.

**Recovery:**
1. Capture the `session_id` from the last `system/init` message (stored in `sessionsStore`).
2. Show toast: "Claude session disconnected. Recovering..."
3. Spawn new sidecar with `VANTAGE_RESUME_SESSION=<session_id>`.
4. SDK reloads context from the JSONL transcript on disk.
5. Show toast: "Session recovered." (or "Recovery failed." with retry button).

**Prevention:**
- Use `AbortController` for graceful shutdown.
- On Vantage exit, enumerate and kill all child Node.js processes by tracked PIDs.
- Bounded channels (capacity 1000) prevent OOM from backpressure.

### 10.3 File System Errors

| Error | Detection | Response |
|-------|-----------|----------|
| File locked by another process | `ERROR_SHARING_VIOLATION` (OS error 32) | Retry 3 times (100ms, 500ms, 2000ms). If still locked: "File is locked by another process. Close the other application and try again." |
| Permission denied | OS error 5 | "Permission denied: {path}. Check file permissions." |
| File not found | OS error 2 | "File not found: {path}." Refresh file tree. |
| Path too long | OS error 206 | "Path exceeds Windows limit. Enable long path support or shorten the path." |
| Disk full | OS error 112 | "Disk full. Free up space and try again." |
| File watcher overflow | `notify` reports 0 bytes returned | Silently trigger a full directory rescan. Log the event. |

### 10.4 WebView2 Issues

| Issue | Detection | Response |
|-------|-----------|----------|
| WebGL context lost | `webglcontextlost` event on xterm.js | Fall back to canvas renderer. Log warning. |
| GPU acceleration disabled | Feature detection at startup | Show info toast: "GPU acceleration unavailable. Terminal performance may be reduced." |
| WebView2 missing | Tauri runtime check | NSIS installer auto-installs WebView2 via bootstrapper. |

---

## 11. Feature Priority

### P0: Must Have for 1.0

These are table-stakes. Vantage cannot ship without them.

| # | Feature | Acceptance Criteria |
|---|---------|-------------------|
| 1 | **Single Claude Code chat session** | User can type a prompt, see streaming text response with thinking blocks and tool call visualization. Token-by-token rendering with auto-scroll. Stop button works. Retry button works. Cost displayed per message and in status bar. |
| 2 | **Integrated terminal** | At least 2 terminal tabs. PowerShell and Git Bash available. xterm.js WebGL rendering. Resize works. Copy/paste works. Search works (Ctrl+Shift+F within terminal). |
| 3 | **Monaco code editor with tabs and split views** | Open files from file tree and from Claude's edits. Syntax highlighting for TS, JS, Python, Rust, CSS, HTML, JSON, Markdown, YAML, TOML at minimum. Find/replace with regex. Minimap. Breadcrumbs. Split vertical and horizontal. Tab close, tab reorder. Dirty indicator. |
| 4 | **File explorer with lazy-loading tree** | Loads first 2 levels on project open. Expands on click. Respects .gitignore. Open, rename, delete with confirmation. Drag file to editor to open. Git status indicators (M/A/D/?). Context menu with standard operations. |
| 5 | **Command palette** | Ctrl+Shift+P opens. Fuzzy search across commands. File mode (no prefix), command mode (> prefix), go-to-line (: prefix). Keybinding hints visible. Recently used items first. Escape to close. |
| 6 | **Permission/approval dialog** | Modal dialog with tool name, input preview, risk-level color. Allow/Deny/Allow-for-Session buttons with keyboard shortcuts (Y/N/S). Diff preview for file edits. No timeout. Blocks all input until resolved. |
| 7 | **Inline diff for AI edits** | Per-hunk accept/reject buttons. Green/red highlighting. "Accept All" / "Reject All" per file. Monaco inline diff mode. |
| 8 | **Session management** | List past sessions. Resume a session. Continue most recent session. Fork a session. Display session name, date, cost, model, turn count. |
| 9 | **Dark theme** | Catppuccin Mocha-inspired. All CSS custom properties defined. No pure black backgrounds. Proper text hierarchy (3 levels). Accent colors for all semantic states. |
| 10 | **Essential keybindings** | All Tier 1 keybindings from section 6.1 functional. |
| 11 | **Streaming output display** | Token-by-token rendering in chat. Auto-scroll follows stream. User scroll-up pauses auto-scroll. Thinking indicator with elapsed time. Stop button visible during streaming. |
| 12 | **Cost/token tracking** | Per-session cost in status bar. Per-message cost in chat. Extracted from `result` messages. Model name in status bar. |
| 13 | **First-launch prerequisite check** | Validates Git, Claude Code, WebView2, long paths. Shows checklist with pass/fail. Blocks launch on critical failures. Provides installation commands. |
| 14 | **Basic git integration** | Branch name in status bar. Git status indicators on files in explorer. |

### P1: Should Have for 1.0

These differentiate Vantage from existing tools.

| # | Feature |
|---|---------|
| 15 | Multi-session parallel agents (3-5 concurrent sessions) |
| 16 | Agent kanban board (Backlog/In Progress/Review/Done columns) |
| 17 | Git worktree isolation per agent (same-volume validation) |
| 18 | Conflict detection (file ownership visualization, multi-agent overlap warning) |
| 19 | Multi-file diff review panel (file tree + diff + "Viewed" checkmarks) |
| 20 | System notifications (task completed, error, needs permission, stalled) |
| 21 | CLAUDE.md editor with live preview |
| 22 | MCP server management UI |
| 23 | Agent timeline view (chronological event stream per agent) |
| 24 | Project-wide search (Ctrl+Shift+F with regex, results panel, click to navigate) |

### P2: Nice to Have (Post-1.0)

| # | Feature |
|---|---------|
| 25 | Light theme (Catppuccin Latte) |
| 26 | High contrast theme (WCAG AAA, 7:1+) |
| 27 | Vim keybinding mode |
| 28 | Floating windows / popout tabs |
| 29 | Theme customization via JSON |
| 30 | Session search and filtering (full-text search across history) |
| 31 | LSP integration (language server bridge to Monaco) |
| 32 | Git log/blame/stash UI |
| 33 | Checkpoint/restore for agent changes |
| 34 | Auto-update via GitHub Releases |
| 35 | Usage analytics dashboard (per-model cost tracking) |

### P3: Future Vision

| # | Feature |
|---|---------|
| 36 | Coordinator/specialist/verifier agent hierarchy |
| 37 | Sequential merge queue with quality gates |
| 38 | Agent tree view (hierarchical parent-child) |
| 39 | Role-based agent routing (AGENTS.md rules) |
| 40 | Embedded browser preview |
| 41 | BMAD-style document sharding |
| 42 | Verification dashboard |
| 43 | Design mode (point-and-prompt for UI) |
| 44 | Background cloud agents |

---

## 12. Non-Goals (Explicit Exclusions)

These are deliberately out of scope for Vantage 1.0 and should not be discussed as features:

| Exclusion | Reason |
|-----------|--------|
| **Multi-provider support** | Claude Code only. CodePilot's 17-provider approach led to 248 open issues. (Research: 08-synthesis Lesson 11, Q5) |
| **VS Code extension compatibility** | Would require an extension host and the full VS Code extension API. SideX attempts this with a Node.js sidecar but it is immensely complex. Not worth the effort for 1.0. |
| **Mobile app** | Desktop IDE. Touch-based code editing is a different product. |
| **Cloud deployment** | Vantage runs locally. No server component, no SaaS, no accounts. |
| **Plugin/extension marketplace** | Not for 1.0. The architecture should be extensible (command registration, view containers), but no public extension API or marketplace. |
| **macOS or Linux support** | Windows 11 only. Cross-platform is a future consideration. WebView2 is Windows-only; macOS would need WebKit, Linux would need WebKitGTK. |
| **Tab completion / ghost text** | Ghost text inline suggestions (Copilot-style) require a low-latency model endpoint and tight editor integration. Defer to P2 or later. Vantage's AI interaction is chat-first and agent-first. |
| **Real-time collaboration** | No multiplayer editing. Zed's collaboration model is interesting but orthogonal to Vantage's mission. |
| **Custom AI model support** | No OpenAI, Gemini, local models, or other providers. Claude Code handles model selection internally. |

---

## 13. Security Considerations

### 13.1 No Telemetry

Vantage collects zero telemetry, analytics, or usage data. No network requests are made except to the Anthropic API (through Claude Code) and to the update endpoint (for checking Vantage versions).

### 13.2 No Data Collection

- No crash reports sent to any server.
- No feature usage tracking.
- No A/B testing infrastructure.
- All data stays on the user's machine.

### 13.3 Local-Only Storage

- SQLite database stored in `%APPDATA%\Vantage\`.
- Configuration files in `%APPDATA%\Vantage\config\`.
- Session transcripts owned by Claude Code at `~/.claude/projects/`.
- No cloud sync, no remote backup.

### 13.4 API Key Handling

**Vantage never touches API keys.** Claude Code handles its own authentication. The Agent SDK inherits auth from the Claude Code CLI configuration (`~/.claude/`). Vantage passes environment variables through to the sidecar but never reads, stores, or transmits API keys.

If the sidecar reports an `authentication_failed` error, Vantage displays a dialog directing the user to run `claude auth status` in their terminal.

### 13.5 Permission System Defaults

- Default permission mode: `default` (ask for everything).
- Pre-configured allow rules for read-only operations (Read, Glob, Grep).
- Pre-configured allow rules for safe git commands (status, diff, log).
- Pre-configured deny rules for destructive commands (rm -rf, git push --force).
- Users can escalate to `acceptEdits` via a toggle in the status bar.
- `bypassPermissions` mode is available but requires explicit settings change. A prominent warning is shown when enabled.

### 13.6 Sidecar Isolation

- Node.js sidecar processes run with the same user privileges as Vantage.
- Sidecar code (`bridge.js`) is bundled with Vantage and is not user-modifiable.
- Communication between Rust and sidecar is via stdin/stdout pipes (no network sockets).
- Tauri's ACL system restricts which frontend APIs can call which Rust commands.

---

## 14. Testing Strategy

### 14.1 Vitest for React Component Tests

| Test Category | Tool | Coverage Target |
|--------------|------|-----------------|
| Zustand stores | Vitest + Testing Library | 90% branch coverage |
| React components (non-editor) | Vitest + Testing Library | 80% branch coverage |
| IPC type definitions | Vitest (type assertion tests) | 100% type coverage |
| Path normalization utilities | Vitest | 100% branch coverage |
| Delta accumulation logic | Vitest | 95% branch coverage |

**Key test scenarios:**
- `conversationStore`: delta accumulation, message assembly, streaming state transitions.
- `PermissionDialog`: renders correct risk level, handles all button actions, keyboard shortcuts work.
- `FileExplorer`: lazy loading, git status indicators, context menu actions.
- `CommandPalette`: fuzzy search, mode switching, keyboard navigation.

### 14.2 Tauri WebDriver for E2E (Windows)

Use `@tauri-apps/driver` with WebDriver protocol:

| E2E Scenario | Steps |
|-------------|-------|
| First launch | Verify prerequisite checker runs. Verify setup wizard appears. |
| Open project | Open a directory. Verify file tree loads. Verify git branch shows in status bar. |
| Chat session | Send a prompt. Verify streaming response appears. Verify cost updates in status bar. |
| Permission flow | Trigger a permission request. Verify dialog appears. Click Allow. Verify tool executes. |
| Terminal | Open terminal. Type a command. Verify output appears. Resize. Verify fit. |
| Editor | Open a file. Edit it. Verify dirty indicator. Save. Verify dirty indicator clears. |

### 14.3 Rust Unit Tests

| Module | Test Focus |
|--------|-----------|
| `files/paths.rs` | Path normalization: Windows to POSIX, POSIX to Windows, UNC stripping, session dir encoding. Edge cases: drive letters, spaces, special characters. |
| `files/watcher.rs` | Debouncing behavior, .gitignore filtering, event deduplication. |
| `bridge/protocol.rs` | NDJSON serialization/deserialization. All message types round-trip correctly. |
| `bridge/agent_bridge.rs` | Spawn, send message, receive event, handle crash, shutdown. Mock sidecar process. |
| `git/operations.rs` | Status, diff, log parsing. Handle CRLF, locked files, missing git. |
| `db/store.rs` | CRUD operations for all tables. Migration forward/backward. |
| `prerequisites.rs` | Detection of Git, Claude Code, WebView2, long paths. Mock registry/PATH. |

### 14.4 Manual Testing Protocol

These cannot be fully automated and require manual verification:

| Area | Manual Test |
|------|------------|
| Terminal rendering | Verify xterm.js renders correctly with WebGL. Test 256-color and true-color output. Test Unicode rendering. Verify resize behavior. |
| Monaco editor | Verify syntax highlighting for 10+ languages. Verify IntelliSense popup works. Verify find/replace with regex. Verify minimap renders. |
| Multi-agent | Run 3 concurrent agent sessions. Verify all three stream independently. Verify kanban board updates. Verify file ownership dots appear. |
| Long sessions | Run a session for 30+ minutes. Verify no memory leaks. Verify context compaction boundary appears correctly. |
| Recovery | Kill the sidecar process. Verify Vantage detects the crash. Verify session resumes. |
| Windows specifics | Test on clean Windows 11 install. Test with and without Git Bash. Test with long paths disabled. Test with Windows Defender real-time scanning enabled. |

---

## 15. Success Criteria

### What 1.0 Looks Like

Vantage 1.0 is ready when:

1. A developer can open a project, start a Claude Code session, receive streaming responses with tool call visualization, approve/deny permissions via the dialog, review AI-generated diffs with per-hunk accept/reject, edit code in Monaco, run terminal commands, and manage session history -- all without leaving the application.

2. All 14 P0 features pass their acceptance criteria (section 11).

3. Cold startup time is under 2 seconds on a machine with an SSD.

4. Idle memory usage is under 150 MB (Vantage + one inactive sidecar).

5. The application does not crash or hang during a 60-minute session with active Claude Code usage.

6. All Tier 1 keybindings work correctly.

7. The dark theme passes WCAG AA contrast requirements (4.5:1 for text, 3:1 for UI elements).

8. First-launch prerequisite checker catches all missing dependencies and provides actionable installation instructions.

9. The binary is code-signed (OV certificate minimum) and installs via NSIS without errors.

10. The application can be updated via the Tauri auto-updater.

### When It's Ready to Replace Cursor

Vantage can replace Cursor for a Claude Code user when:

1. All P0 and P1 features are implemented and stable.
2. Multi-agent orchestration works reliably with 3-5 concurrent sessions.
3. The diff review experience is as fast as or faster than Cursor's.
4. Session management (resume, fork, browse history) works reliably.
5. The kanban board provides meaningful visibility into parallel agent work.
6. File ownership visualization prevents the most common multi-agent conflict (two agents editing the same file).

The target timeline: P0 complete in 6 weeks. P1 complete in 12 weeks. Polish and P2 features ongoing after that. Ship the first public build at week 4 with P0 features at 80% completion. Ship weekly thereafter.

---

## Appendix A: File System Layout

```
vantage/
├── src/                          # React frontend
│   ├── components/
│   │   ├── layout/               # IDELayout, ActivityBar, StatusBar, Sidebar
│   │   ├── editor/               # MonacoWrapper, TabBar, Breadcrumbs, MarkdownPreview
│   │   ├── terminal/             # TerminalPanel, TerminalTab
│   │   ├── chat/                 # ChatPanel, MessageList, MessageBubble, ChatInput
│   │   ├── agents/               # AgentDashboard, KanbanBoard, AgentCard, Timeline
│   │   ├── diff/                 # DiffViewer, InlineDiff, MultiFileDiff
│   │   ├── permissions/          # PermissionDialog, SecurityLog
│   │   ├── files/                # FileExplorer, FileTree, FileNode
│   │   ├── git/                  # GitPanel, BranchSelector, DiffStats
│   │   ├── settings/             # SettingsDialog, ThemePicker
│   │   └── shared/               # Loading, ErrorBoundary, CommandPalette
│   ├── stores/
│   │   ├── conversation.ts       # Zustand: messages, streaming state, delta accumulation
│   │   ├── sessions.ts           # Zustand: active sessions, history
│   │   ├── agents.ts             # Zustand: multi-agent state, kanban
│   │   ├── editor.ts             # Zustand: open files, tabs, dirty state
│   │   ├── layout.ts             # Zustand: panel sizes, visibility
│   │   └── settings.ts           # Zustand: user preferences, theme
│   ├── hooks/
│   │   ├── useTerminal.ts        # xterm.js lifecycle management
│   │   ├── useAgent.ts           # Agent session management
│   │   ├── useFileTree.ts        # Lazy file tree loading
│   │   └── useKeyBindings.ts     # Global keyboard shortcut handling
│   ├── lib/
│   │   ├── ipc.ts                # Type-safe Tauri IPC wrappers (from tauri-specta)
│   │   ├── protocol.ts           # NDJSON message type definitions
│   │   ├── paths.ts              # Path normalization utilities (frontend side)
│   │   └── theme.ts              # Theme switching, CSS variable management
│   ├── App.tsx
│   └── main.tsx
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/             # Tauri IPC command handlers
│   │   │   ├── session.rs        # create_session, send_message, interrupt
│   │   │   ├── terminal.rs       # spawn_terminal, write_terminal, resize
│   │   │   ├── files.rs          # read_file, write_file, list_directory
│   │   │   ├── git.rs            # git_status, git_diff, git_log, git_branch
│   │   │   ├── settings.rs       # get_settings, set_settings
│   │   │   └── permissions.rs    # respond_permission
│   │   ├── bridge/
│   │   │   ├── agent_bridge.rs   # Node.js sidecar management
│   │   │   ├── session_manager.rs# Multi-session orchestration
│   │   │   └── protocol.rs       # NDJSON serialization types
│   │   ├── terminal/
│   │   │   ├── pty_manager.rs    # PTY lifecycle, ConPTY integration
│   │   │   └── shell_detect.rs   # Detect available shells on Windows
│   │   ├── files/
│   │   │   ├── watcher.rs        # File system watcher (notify crate)
│   │   │   ├── tree.rs           # File tree builder (ignore crate)
│   │   │   └── paths.rs          # Windows/POSIX path normalization
│   │   ├── git/
│   │   │   ├── operations.rs     # git2 reads + git.exe shell-out
│   │   │   └── worktree.rs       # Worktree management for agents
│   │   ├── db/
│   │   │   ├── store.rs          # SQLite via rusqlite
│   │   │   └── migrations.rs     # Schema migrations
│   │   └── prerequisites.rs      # First-launch dependency checks
│   ├── sidecar/
│   │   └── bridge.js             # Node.js Agent SDK bridge
│   ├── capabilities/
│   │   └── main-window.json      # Tauri ACL permissions
│   └── Cargo.toml
│
├── public/
│   └── fonts/
│       └── JetBrainsMono/        # Bundled editor font (4 weights + italic)
│
├── tauri.conf.json               # Tauri configuration
├── vite.config.ts                # Vite bundler configuration
├── package.json                  # Frontend dependencies
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.ts            # Tailwind configuration
└── CLAUDE.md                     # Project instructions for Claude Code
```

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Agent SDK** | `@anthropic-ai/claude-agent-sdk` -- Anthropic's official TypeScript SDK for programmatic Claude Code integration. |
| **Sidecar** | A Node.js child process running `bridge.js` that wraps the Agent SDK. One per active Claude session. |
| **NDJSON** | Newline-Delimited JSON. Each line is a self-contained JSON object terminated with `\n`. |
| **ConPTY** | Windows Console Pseudo-Terminal API. The Windows equivalent of Unix PTY. |
| **AgentBridge** | Rust struct managing a single Node.js sidecar process (spawn, communicate, restart, shutdown). |
| **SessionManager** | Rust struct orchestrating multiple AgentBridge instances across concurrent sessions. |
| **Delta accumulation** | Strategy of buffering individual streaming tokens and assembling them into complete message blocks before rendering. |
| **Worktree** | A git worktree -- a separate working directory linked to the same repository. Used to isolate parallel agent work. |
| **Channel** | Tauri v2 IPC primitive for high-throughput streaming from Rust to the frontend. |
| **Command** | Tauri v2 IPC primitive for request/response calls from the frontend to Rust. |
| **Event** | Tauri v2 IPC primitive for fire-and-forget notifications in either direction. |
