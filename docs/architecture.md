# Vantage — Architecture

---

## Process Model

```
Windows OS
└── Vantage.exe  (Tauri v2 host)
    ├── WebView2             ← React 19 + Vite frontend (this document's UI)
    └── Rust process         ← Tauri backend (IPC bridge, file I/O, PTY, Claude spawn)
        ├── tauri-plugin-pty ← ConPTY sessions (one per terminal tab)
        └── claude.exe       ← Claude Code CLI child process (one per session)
                               (stdin/stdout NDJSON stream-json protocol)
```

The Rust backend is a single OS process. All long-running async work (file watching, PTY I/O, Claude stdout reading) runs on Tokio tasks within that process.

---

## Claude Integration — Data Flow

```
User types message → ChatPanel
  → useConversationStore.sendMessage()
  → invoke("claude_send_message", { session_id, text })
  → Rust: ClaudeProcess writes UserInputMessage JSON to child stdin
  → claude.exe processes message
  → claude.exe writes stream-json lines to stdout
  → Rust: reads lines, parses ClaudeMessage variants
  → app_handle.emit("claude_message", ClaudeEventPayload)
  → Frontend: listen("claude_message") in useClaude hook
  → useConversationStore.handleStreamEvent()
  → React re-renders MessageBubble / ToolCallCard
```

**Permission requests** follow the same path but emit `"claude_permission_request"` events. The frontend shows a `PermissionDialog`, the user approves/denies, and `invoke("claude_respond_permission")` writes a `ControlResponseMessage` back to stdin.

**Session spawn options** (effort level, plan mode) are passed from the `settings` store via `SpawnOptions` when `invoke("claude_start_session")` is called.

---

## IPC Patterns

All Rust functions callable from the frontend use `#[tauri::command]` + `#[specta::specta]`. Specta generates TypeScript bindings. Invoke with:

```ts
import { invoke } from "@tauri-apps/api/core";
await invoke("command_name", { param1: value });
```

**IPC name rule**: Rust function `claude_start_session` → `invoke("claude_start_session")`. The name is the Rust function name verbatim.

Three IPC mechanisms are used:

| Mechanism | Direction | Use case |
|-----------|-----------|----------|
| `invoke` | Frontend → Rust | Request/response: read file, start session, write file |
| `listen` (Tauri events) | Rust → Frontend | Push notifications: Claude messages, file change events, PTY output |
| `@tauri-apps/plugin-dialog` | Frontend → OS | Native file/folder picker dialogs |

**Key IPC commands** (non-exhaustive):

| Command | Description |
|---------|-------------|
| `claude_start_session` | Spawn a claude.exe child process |
| `claude_send_message` | Write a user message to claude.exe stdin |
| `claude_stop_session` | Kill a specific claude.exe child |
| `claude_stop_all_sessions` | Kill all claude.exe children (called on project switch) |
| `claude_respond_permission` | Send allow/deny for a permission request |
| `read_file` | Read file contents + detect language |
| `write_file` | Write file contents to disk |
| `format_file` | Run Prettier on a file (format on save) |
| `get_directory_children` | List files/dirs in a path (used by breadcrumb dropdown) |
| `read_workspace_file` | Read `~/.vantage/workspaces/<name>.json` |
| `write_workspace_file` | Write `~/.vantage/workspaces/<name>.json` |
| `read_mcp_config` | Read merged user + project MCP server list |
| `read_claude_settings` | Read `~/.claude/settings.json` as JSON string |
| `write_claude_settings` | Write `~/.claude/settings.json` |

**Key Tauri events** (Rust → Frontend):

| Event | Payload | Description |
|-------|---------|-------------|
| `claude_message` | `ClaudeEventPayload` | Streaming content/tool call delta from Claude |
| `claude_status` | `ClaudeStatusPayload` | Session lifecycle (started, stopped, error) |
| `claude_permission_request` | `PermissionRequestPayload` | Tool use requiring user approval |
| `file_changed` | path + change type | File watcher notification |

---

## Store Architecture

Vantage uses Zustand v5. Stores are divided into **global** (survives project switch) and **workspace-scoped** (reset + reloaded on project switch).

### Global Store

| Store | File | Persisted | Description |
|-------|------|-----------|-------------|
| `settings` | `stores/settings.ts` | `localStorage` (`vantage-settings`) | Theme, fonts, editor options, vim mode, keybinding overrides |

### Workspace-Scoped Stores

| Store | File | Description |
|-------|------|-------------|
| `layout` | `stores/layout.ts` | Sidebar visibility, panel sizes, active panel tab, zen mode state |
| `editor` | `stores/editor.ts` | Open tabs, active tab, split direction, pending diffs from Claude |
| `conversation` | `stores/conversation.ts` | Claude session messages, streaming accumulators, activity trail |
| `agents` | `stores/agents.ts` | Multi-agent kanban board, agent hierarchy, timelines |
| `mergeQueue` | `stores/mergeQueue.ts` | Merge queue entries, quality gate outcomes |
| `verification` | `stores/verification.ts` | Verification dashboard state |
| `usage` | `stores/usage.ts` | Token and cost records per session |
| `agentConversations` | `stores/agentConversations.ts` | Per-agent conversation histories |

### Supporting Stores (not workspace-persisted)

| Store | Description |
|-------|-------------|
| `commandPalette` | Open/close state and mode for the command palette |
| `quickQuestion` | `/btw` overlay open/close, question text, response |
| `notifications` | Notification center entries and history |
| `workspace` | Orchestrates workspace open/close/save; holds recent projects list |

---

## Workspace Persistence Implementation

The `workspace` store (`stores/workspace.ts`) orchestrates workspace I/O:

1. On `openProject(path)`: encodes path as base64url → loads `~/.vantage/workspaces/<encoded>.json` via `read_workspace_file` IPC → hydrates all 8 workspace-scoped stores → subscribes to store changes for auto-save.
2. On store change: calls `markDirty()` → debounced 2-second timer → serializes all stores to a `WorkspaceFile` object → calls `write_workspace_file` IPC.
3. On `closeProject()`: saves first, then calls `resetToDefaults()` on all workspace-scoped stores.

---

## Mock Layer

`src/lib/tauriMock.ts` intercepts all `invoke` and `listen` calls when the app runs outside Tauri (i.e., `npm run dev` in a browser). The mock activates automatically by detecting `window.__TAURI_INTERNALS__` is absent.

This enables full UI development and testing without a Rust build, but it **hides IPC contract mismatches**. Never rely on mock-only testing for Rust command correctness.

---

## Key Design Decisions

**Tauri over Electron**: Lower memory footprint, OS-native WebView (WebView2 on Windows), and Rust for safe systems-level code. Trade-off: smaller ecosystem, WebView2 version variance on older Windows.

**Claude CLI over direct API**: The `claude` binary handles auth, session history, tool execution policy, and the permission model. Vantage drives it via its stream-json stdio protocol rather than re-implementing those layers.

**Zustand over Redux/Context**: Minimal boilerplate, selector-based subscriptions, and easy `getState()` calls outside React components (used in the workspace auto-save loop and IPC event handlers).

**specta RC pinning**: Tauri-specta is pinned to `=2.0.0-rc.24`. Do not upgrade without testing — RC versions have breaking changes. Avoid `skip_serializing_if` on specta::Type structs.

**react-resizable-panels v4.9 API**: The panel API uses `Group`/`Separator` (not `PanelGroup`/`PanelResizeHandle`). Do not use `useDefaultLayout` — it corrupts stored sizes.
