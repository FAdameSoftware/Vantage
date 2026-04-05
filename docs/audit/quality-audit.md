# Vantage IDE Quality Audit

**Date:** 2026-04-04
**Scope:** Full codebase — Rust backend, React frontend, integration layer
**Verdict:** The core architecture is solid and well-structured, but there are several critical IPC mismatches, placeholder features, and integration gaps that would prevent a production-quality user experience.

---

## 1. Critical Issues (Broken / Will Crash at Runtime)

### 1.1 IPC Command Name Mismatch — Chat Will Not Work in Tauri

**Severity: CRITICAL**
**Files:** `src/hooks/useClaude.ts`, `src-tauri/src/lib.rs`, `src/lib/tauriMock.ts`

The frontend `useClaude` hook uses **two different command names** for the same operations depending on the code path, and one set does not match the registered Rust commands:

| Frontend calls (useClaude.ts) | Rust registered command | Match? |
|---|---|---|
| `invoke("start_claude_session", ...)` (lines 513, 546) | `claude_start_session` | NO |
| `invoke("send_claude_message", ...)` (line 568) | `claude_send_message` | NO |
| `invoke("claude_start_session", ...)` (line 639) | `claude_start_session` | YES |
| `invoke("claude_send_message", ...)` (line 675) | `claude_send_message` | YES |

The `startSession()` and `sendMessage()` functions (used by the main chat) call the **wrong** command names (`start_claude_session` / `send_claude_message`), while the agent functions (`startAgentSession` / `sendAgentMessage`) call the **correct** names. This means:

- **The primary chat panel will not work in the real Tauri app.** Sending a message will immediately error.
- **The mock layer hides the bug** because `tauriMock.ts` defines handlers for BOTH the wrong and correct names (lines 216-219).
- The agent multi-session flow (which uses the correct names) would work.

**Fix:** Change `start_claude_session` to `claude_start_session` and `send_claude_message` to `claude_send_message` in the `startSession` and `sendMessage` functions. Also update `tauriMock.ts` to only export the correct names.

### 1.2 Claude Event Payload Deserialization Mismatch

**Severity: HIGH**
**Files:** `src-tauri/src/claude/process.rs` (line 201), `src/lib/protocol.ts`

The Rust backend emits `claude_message` events with a `ClaudeEventPayload` that has two fields: `session_id` (String) and `message` (raw serde_json::Value). But the TypeScript `ClaudeOutputMessage` type in `protocol.ts` does not expect a wrapping `{ session_id, message }` envelope — it defines the message types directly.

The `useClaude` hook listens to `listen<ClaudeOutputMessage>("claude_message", ...)` (line 268), which means `event.payload` will be `{ session_id: "...", message: { type: "system", ... } }`, not a `ClaudeOutputMessage` directly. The hook then checks `msg.type` (line 273), which will be `undefined` because `type` is nested inside `message`.

This bug is masked by the mock layer which never emits these events.

**Fix:** The listener should destructure: `const msg = event.payload.message as ClaudeOutputMessage` or the Rust side should emit the raw message directly.

### 1.3 Auto-Update Will Crash — Plugin Commented Out

**Severity: MEDIUM**
**Files:** `src-tauri/src/lib.rs` (line 607), `src/hooks/useAutoUpdate.ts`

The updater plugin is commented out in `lib.rs`:
```rust
// .plugin(tauri_plugin_updater::Builder::new().build()) // TODO: enable when updater endpoint is configured
```

But `useAutoUpdate.ts` still imports and calls `check()` from `@tauri-apps/plugin-updater`. Without the plugin registered, this call will fail at runtime. The hook silently catches the error, but it imports `relaunch()` from `plugin-process` which is also not registered.

**Fix:** Either uncomment and configure the updater plugin, or remove the `useAutoUpdate` hook entirely until it's ready.

---

## 2. Shortcuts That Need Fixing

### 2.1 Diff Viewer "Accept/Reject All" Are Placeholders

**Files:** `src/components/diff/MultiFileDiffReview.tsx` (lines 227-238)

The "Accept All" button just marks all files as viewed (cosmetic state). "Reject All" just clears the viewed set. Neither actually accepts/rejects changes, merges branches, or modifies files. The code explicitly says "(placeholder)" in the button titles and comments.

### 2.2 Permission Dialog "Allow for Session" Does Nothing Special

**Files:** `src/components/permissions/PermissionDialog.tsx` (line 344-347)

The "Allow for Session" button (keyboard shortcut `S`) is documented as "future work" and currently behaves identically to "Allow" — it does not actually track session-level permissions.

### 2.3 Hardcoded Fallback CWD

**Files:** `src/hooks/useClaude.ts` (lines 542, 109, 124)

When no session CWD is available, the code falls back to `"C:/CursorProjects/Vantage"` — the developer's personal project path. This should fall back to a user-appropriate default or error gracefully.

### 2.4 Agent "Investigate with Claude" Uses setTimeout for Sequencing

**Files:** `src/hooks/useClaude.ts` (lines 716-718)

After starting an agent session, the code uses `setTimeout(() => { ... }, 1000)` to delay sending the initial message. This is fragile — if session initialization takes more or less than 1 second, it will either fail or waste time. Should use an event-driven approach (wait for the session `init` event before sending).

### 2.5 File Explorer Uses `prompt()` and `confirm()` for Dialogs

**Files:** `src/components/files/FileExplorer.tsx` (lines 95, 109, 121, 139)

The file operations (New File, New Folder, Rename, Delete) use browser `prompt()` and `confirm()` dialogs. These are ugly, modal-blocking, and don't match the app's Catppuccin theme. In a Tauri desktop app, these should use custom modal dialogs.

### 2.6 Plugin Store "Install" Just Shows a Toast

**Files:** `src/components/settings/PluginStore.tsx` (line 33)

The Install button in the Plugin Store doesn't actually install anything. It shows a toast saying `Run in terminal: claude plugins add <name>`. This is purely informational — there's no actual installation mechanism.

### 2.7 Browser Preview iframe Limitations

**Files:** `src/components/preview/BrowserPreview.tsx`

The browser preview uses an `<iframe>` with `sandbox` attributes. This will not work for many localhost dev servers due to CORS restrictions, and cannot provide DevTools. History navigation (back/forward) will silently fail for cross-origin content. A proper implementation would use a Tauri WebView or separate window.

---

## 3. Missing Integrations (UI Exists, Backend Wiring Incomplete)

### 3.1 Pending Diff Review from Claude Edits — Not Wired

**Files:** `src/stores/editor.ts` (line 100), `src/components/layout/EditorArea.tsx` (line 145)

Both files contain the same TODO comment:
```
// TODO: wire setPendingDiff from useClaude when a tool result with name
//       "Edit" or "Write" resolves — capture before/after content there.
```

The diff viewer (`DiffViewer`, `setPendingDiff`, `acceptDiff`, `rejectDiff`) is fully built in the editor store and EditorArea component, but `useClaude` never calls `setPendingDiff`. When Claude edits a file, the user sees no diff review — the change just happens silently.

### 3.2 Agent Tree View "Select Agent" Not Wired

**Files:** `src/components/agents/AgentTreeView.tsx` (lines 306-309)

```typescript
// Select agent -- for now, this is a placeholder; in a full implementation
// TODO: wire to secondary sidebar to open AgentDetailPanel
```

Clicking an agent in the tree view does nothing.

### 3.3 Agents Don't Actually Create Worktrees

**Files:** `src/hooks/useClaude.ts` (startAgentSession function)

When starting an agent session, the code calls `claude_start_session` with a CWD but does NOT create a git worktree first. The `linkWorktree` action exists in the agents store, and `create_worktree` exists as a Rust command, but they are never connected in the agent startup flow. Agents all share the same working directory, defeating the purpose of the multi-agent isolation model.

### 3.4 Coordinator Pipeline Config Not Implemented

**Files:** `src/stores/agents.ts`

The `PipelineConfig` type exists with `specialists`, `verifierModel`, and `autoMerge` fields, and agents have a `pipeline` field. But no code ever creates a pipeline, auto-spawns specialists from a coordinator's config, or auto-merges after verification. The coordinator role is cosmetic — it just changes the label.

### 3.5 Tool Result Output Not Captured

**Files:** `src/stores/conversation.ts`, `src/hooks/useClaude.ts`

The `ToolCall` type has `output?: string` and `isError?: boolean` fields, but neither `handleStreamEvent` nor `handleAssistantMessage` ever populates `output` or `isError` on tool calls. Tool results from Claude are not displayed to the user — only the tool name and input are shown.

### 3.6 Merge Queue Panel UI Exists but No Automated Flow

**Files:** `src/components/agents/MergeQueuePanel.tsx`, `src-tauri/src/merge_queue.rs`

The Rust backend has `merge_branch` and `rebase_branch` commands that work. The frontend has a MergeQueuePanel. But there's no automated flow connecting agent completion -> verification -> merge. It's all manual button-clicking.

---

## 4. Code Quality Concerns

### 4.1 Large Components (>300 lines)

The following components exceed 300 lines and should be split:

| Component | Lines | Suggestion |
|---|---|---|
| `SpecViewer.tsx` | 584 | Split into section renderers |
| `CommandPalette.tsx` | 559 | Extract mode handlers into separate files |
| `PermissionDialog.tsx` | 503 | Extract tool preview components |
| `VerificationDashboard.tsx` | 492 | Extract AgentRow, summary into sub-components |
| `McpManager.tsx` | 490 | Extract AddServerDialog into own file |
| `SearchPanel.tsx` | 482 | Extract FileResultGroup into own file |
| `SessionSelector.tsx` | 481 | Extract session list rendering |
| `PluginManager.tsx` | 442 | Extract plugin card components |
| `AgentDetailPanel.tsx` | 429 | Split detail sections |
| `MergeQueuePanel.tsx` | 427 | Extract queue item rendering |
| `MultiFileDiffReview.tsx` | 423 | Already well-structured internally |
| `GitLogPanel.tsx` | 414 | Extract log entry rendering |
| `AgentTreeView.tsx` | 397 | Extract node renderers |
| `ProjectIndex.tsx` | 374 | Extract stat cards |
| `FileExplorer.tsx` | 354 | Extract context menu |
| `PluginStore.tsx` | 340 | Extract plugin card |
| `CreateAgentDialog.tsx` | 330 | Could be simplified |

### 4.2 Duplicated Logic: `assembleMessageFromBlocks`

**Files:** `src/hooks/useClaude.ts` (lines 154-201), `src/stores/conversation.ts` (lines 152-198)

The `assembleMessage` / `assembleMessageFromBlocks` function is duplicated almost verbatim between `useClaude.ts` and `conversation.ts`. Similarly `extractFromAssistantMsg` / `extractFromAssistantMessage`. This should be extracted to a shared utility.

### 4.3 Inconsistent IPC Patterns

Some components call `invoke()` directly (FileExplorer, SearchPanel, EditorArea, McpManager), while others go through hooks (chat uses `useClaude`, terminal uses `useTerminal`, file tree uses `useFileTree`). There's no consistent layer. The hooks pattern is better — direct `invoke` calls make testing harder and scatter IPC knowledge.

### 4.4 Git Status Polling Every 5 Seconds

**Files:** `src/hooks/useGitStatus.ts` (line 66)

The git status hook polls every 5 seconds via `setInterval`. For large repos, this could be expensive. It also listens to `file_changed` events and refreshes on every single file change, which means during active development you could have dozens of redundant `git status` calls.

**Fix:** Remove the 5-second polling interval, rely solely on file-watcher events, and debounce the git status refresh.

### 4.5 Type Assertions in useClaude Event Handling

**Files:** `src/hooks/useClaude.ts`

Multiple lines cast payloads without validation:
```typescript
const initMsg = msg as SystemInitMessage;
const streamMsg = msg as StreamEventMessage;
const assistantMsg = msg as AssistantMessage;
const resultMsg = msg as ResultMessage;
```

If the Rust side sends an unexpected shape, these casts will silently produce wrong data rather than erroring. Should use runtime validation or at minimum null checks.

### 4.6 Monaco Editor getEditors() Hack

**Files:** `src/components/search/SearchPanel.tsx` (lines 186-208)

The search-to-editor navigation uses:
```typescript
(window as unknown as { monaco?: { editor: { getEditors: () => ... } } }).monaco?.editor.getEditors()
```

This reaches through `window` to access Monaco internals — a fragile hack that could break with Monaco version updates.

### 4.7 Settings Store Uses localStorage (Not Tauri Store)

**Files:** `src/stores/settings.ts`, `src/stores/layout.ts`

Both stores use `zustand/persist` with the default `localStorage` storage. While this works in both browser and Tauri modes, it means settings are not stored per-project and won't survive a WebView2 cache clear. The Tauri plugin-store is registered and mocked but not used for these critical stores.

---

## 5. What Actually Works Well

### 5.1 Claude CLI Integration (Rust Backend)

The `ClaudeProcess` and `SessionManager` in Rust are genuinely well-implemented:
- Proper async stdio handling with Tokio
- NDJSON line-by-line parsing with fallback
- Clean process lifecycle (spawn, stdin/stdout/stderr, kill, cleanup)
- Windows-specific `CREATE_NO_WINDOW` flag to suppress console flash
- `Drop` implementation for best-effort cleanup
- Session discovery from `~/.claude/projects/` JSONL files

### 5.2 Terminal Integration

The `useTerminal` hook properly:
- Connects xterm.js to tauri-plugin-pty via the `tauri-pty` npm package
- Handles WebGL fallback to DOM renderer
- Cleans up PTY processes on unmount
- Handles resize propagation
- Updates font/theme without recreating the terminal

### 5.3 File Explorer

The file tree system is complete end-to-end:
- Rust `build_file_tree` and `get_directory_children` with lazy loading
- File watcher with debouncing on the Rust side
- "Open Folder" uses Tauri's native dialog with prompt fallback
- Context menu with New File/Folder, Rename, Delete, Copy Path
- Git status overlays on file nodes
- Agent file conflict detection

### 5.4 Project-Wide Search

Fully functional with a real backend:
- Tries `rg` (ripgrep) first, falls back to the `ignore` crate
- NDJSON output parsing from ripgrep
- Case sensitivity, regex mode, glob filters
- Results grouped by file with match highlighting
- Click-to-navigate to file:line in the editor

### 5.5 MCP Config Manager

Genuinely reads and writes `~/.claude/.mcp.json` and project-level `.mcp.json`:
- Scope separation (user vs project)
- Add/remove/toggle servers
- Proper JSON serialization with error handling

### 5.6 Plugin Discovery

Real implementation that:
- Scans `~/.claude/plugins/` for `plugin.json` manifests
- Parses SKILL.md YAML frontmatter (custom parser, no yaml dependency)
- Reads disabled plugins from `~/.claude/settings.json`
- Plugin Store searches npm registry for `claude-code-plugin` keyword packages

### 5.7 Conversation Store and Streaming

The streaming message accumulation system is well-designed:
- Handles all stream event types (message_start, content_block_start, content_block_delta, content_block_stop, message_stop)
- Properly accumulates text, thinking, and tool_use blocks
- Reconciles streaming deltas with final assistant messages
- Tracks cost and token usage
- Agent message routing based on session ID

### 5.8 Zustand Store Architecture

Clean separation of concerns across stores:
- `conversation` — message history, streaming state
- `agents` — multi-agent lifecycle, kanban, hierarchy
- `editor` — tabs, dirty state, diff review
- `layout` — sidebar/panel visibility, sizes
- `settings` — persisted user preferences
- `usage` — session cost tracking
- `verification` — quality gate status
- `mergeQueue` — detected gates

### 5.9 Testing Infrastructure

- 111 unit tests covering stores and components
- E2E tests with Playwright against the mock layer
- Comprehensive mock layer that covers all Tauri APIs
- Tests validate real behavior (store state changes, component rendering)

### 5.10 Theme System

- Three complete themes (Mocha dark, Latte light, High Contrast)
- All colors via CSS custom properties
- Custom theme file support via `~/.vantage/theme.json`
- Monaco editor themes match the app themes

---

## Summary

| Category | Count |
|---|---|
| Critical (will crash/fail) | 3 |
| Shortcuts needing fixes | 7 |
| Missing integrations | 6 |
| Code quality concerns | 7 |
| Things that work well | 10 |

**Overall assessment:** The project has a solid architectural foundation with well-structured Rust backend code and clean React/Zustand patterns. The core features (file explorer, terminal, search, Claude CLI spawning) are genuinely functional. However, the critical IPC command name mismatch means **the primary chat feature will not work in the actual Tauri app** — it only works through the mock layer. The event payload deserialization issue compounds this. These two bugs together mean the app's flagship feature (Claude chat) is untested in the real environment. The multi-agent system has impressive UI but the backend wiring for worktrees and pipelines is incomplete.

**Priority fixes:**
1. Fix the IPC command name mismatch in `useClaude.ts` (5-minute fix, unblocks everything)
2. Fix the event payload deserialization in the `claude_message` listener
3. Wire `setPendingDiff` from Claude's Edit/Write tool results
4. Create worktrees when starting agent sessions
5. Remove the hardcoded fallback CWD path
