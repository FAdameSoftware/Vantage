# Vantage IDE Remediation Plan

**Created**: 2026-04-04
**Based on**: Third-party BMAD audit + internal quality audit
**Scope**: All remaining unfixed findings after commits e86b9ee, 796922f, 2ca72b7

---

## Already Fixed (DO NOT re-fix)

These were addressed in the three fix commits and are excluded from this plan:

| Finding | Commit |
|---------|--------|
| Shell injection in merge_queue.rs | e86b9ee |
| Git injection in git.rs/checkpoint.rs/worktree.rs | e86b9ee |
| Path traversal in files/operations.rs | e86b9ee |
| CSP enabled in tauri.conf.json | e86b9ee |
| .worktreeinclude path validation | e86b9ee |
| Error swallowing in 5 frontend files | e86b9ee |
| Unsafe .unwrap() in plugins.rs | e86b9ee |
| IPC command name mismatch (useClaude.ts) | 796922f / 2ca72b7 |
| Event payload deserialization | 796922f / 2ca72b7 |
| Hardcoded CWD fallback | 796922f / 2ca72b7 |
| Diff viewer wired to Claude tool results | 796922f / 2ca72b7 |
| Auto-update plugin guarded | 796922f |
| Agent worktree creation on session start | 796922f |
| Plugin store install runs real command | 796922f |
| Diff accept/reject all functional | 796922f |
| Session permission tracking | 796922f |
| Browser prompt/confirm replaced with themed dialogs | 796922f |

---

## Prioritization Principles

1. Memory leaks degrade every session -- fix before adding features
2. Race conditions cause data corruption -- fix before adding concurrent state
3. Core workflow gaps (save, streaming recovery) block real usage
4. Backend tests should be written WITH each fix, not as a separate phase
5. Architectural changes (workspace model, typed errors) come after stability
6. Each batch contains only items that are independent of each other

---

## Batch 1: Memory Leaks and Interval Cleanup

**Rationale**: These degrade the app over every minute of usage. No feature work should proceed until the app stops leaking. All items are independent and parallelizable. Write a Rust unit test for the file watcher alongside the fix.

### 1A. Fix useGitStatus interval accumulation
- **File**: `src/hooks/useGitStatus.ts`
- **Problem**: `setInterval` at line 66 is set inside a `useEffect` keyed on `[refresh]`. When `rootPath` changes, `refresh` changes (new useCallback identity), creating a new interval. The cleanup function clears the old interval via `intervalRef`, but the ref is overwritten before cleanup runs in the same render cycle. Additionally, the `file_changed` listener at line 73 accumulates on every re-mount.
- **Fix**: Clear the existing interval at the START of the effect (before setting a new one). Remove the 5-second polling entirely -- rely on `file_changed` events plus a single debounced refresh. Add `rootPath` as a dependency for the event listener effect so it re-subscribes properly.
- **Complexity**: Small
- **Test**: Unit test that mounts the hook, changes rootPath 5 times, and asserts only 1 active interval exists.

### 1B. Fix useKeybindings event listener thrashing
- **File**: `src/hooks/useKeybindings.ts`
- **Problem**: The `keybindings` array is declared inline inside the hook body (lines ~50-220) without `useMemo`. Every render creates a new array reference, which changes `handleKeyDown` (line 239 depends on `[keybindings]`), which triggers the `useEffect` at line 242 to remove and re-add the event listener.
- **Fix**: Wrap the `keybindings` array declaration in `useMemo` with its actual dependencies (the action callbacks). The action callbacks are already memoized via `useCallback`, so the array will be stable.
- **Complexity**: Small
- **Test**: None needed (React rendering behavior).

### 1C. Fix useFileTree watcher leak on path change
- **File**: `src/hooks/useFileTree.ts`
- **Problem**: Both `setRootPath` (line 84) and the `storeProjectRootPath` sync effect (line 68) call `invoke("start_file_watcher")` without stopping the previous watcher first. The Rust side stores only one debouncer (watcher.rs:99-114), so the old watcher is replaced at the Rust level, but the frontend has no guarantee of this.
- **Fix**: Call `invoke("stop_file_watcher")` before `invoke("start_file_watcher")` in both code paths. The existing unmount cleanup at line 170 remains as final cleanup.
- **Complexity**: Small
- **Test**: Integration test that switches root paths and verifies only one watcher is active.

### 1D. Fix useVimMode listener cleanup
- **File**: `src/hooks/useVimMode.ts`
- **Problem**: The `adapter.on("vim-mode-change", ...)` listener at line 56 is attached inside a dynamic `import()` callback. The cleanup at line 76 calls `adapter.dispose()` which should remove listeners, but if the import resolves after the effect cleanup has already run (race), the listener is orphaned.
- **Fix**: Check the `disposed` flag before attaching the listener (it already exists at line 49 but the listener attachment doesn't check it). Also explicitly call `adapter.off("vim-mode-change")` in cleanup before dispose.
- **Complexity**: Small

### 1E. Fix editor store Set collections never cleaned
- **File**: `src/stores/editor.ts`
- **Problem**: `markdownPreviewTabs` (Set) and `popoutTabs` (Set) at lines 133-134 grow forever. When tabs are closed, `closeTab` removes the tab from `tabs[]` but does not remove the tab ID from these Sets. Over many tab open/close cycles, the Sets accumulate stale IDs.
- **Fix**: In the `closeTab` action, also delete the closed tab ID from `markdownPreviewTabs` and `popoutTabs`. Add a `clearSession` action that resets both Sets.
- **Complexity**: Small
- **Test**: Unit test: open tab, mark as preview, close tab, assert Set is empty.

### 1F. Fix useAgentNotifications stall timer leak edge case
- **File**: `src/hooks/useAgentNotifications.ts`
- **Problem**: If the Zustand subscribe callback throws (e.g., accessing a deleted agent), stall timers set at line 95 are never cleared because the error exits the loop before reaching the cleanup block at line 123. The unmount cleanup at line 140 handles the normal case, but a thrown error during a status transition leaves the timer running until unmount.
- **Fix**: Wrap the per-agent loop body in a try/catch so one agent's error doesn't prevent cleanup of other agents' timers.
- **Complexity**: Small

---

## Batch 2: Race Conditions and Session Safety

**Rationale**: These cause data corruption and user confusion. Must be resolved before the workspace model adds more concurrent state. Items are independent. Write Rust tests for process lifecycle alongside the fix.

### 2A. Add session state machine to useClaude
- **File**: `src/hooks/useClaude.ts`
- **Problem**: `startSession` and `sendMessage` can both call `invoke("claude_start_session")` concurrently. If the user types a message while a session is starting, `sendMessage` sees `sessionIdRef.current === null` and starts a second session. Two sessions run in parallel, each emitting events to the same conversation store.
- **Fix**: Add a session state enum (`idle | starting | ready | streaming | error`) tracked in a ref. `sendMessage` should await the existing `startSession` promise if state is `starting` rather than starting a new session. Use a promise ref that `sendMessage` can await.
- **Unblocks**: Batch 5 agent auto-start improvements, conversation persistence.
- **Complexity**: Medium
- **Test**: Unit test: call sendMessage while startSession is pending, assert only one IPC call is made.

### 2B. Fix useFloatingWindow popout init race
- **File**: `src/hooks/useFloatingWindow.ts`
- **Problem**: Line 105 uses `setTimeout(500)` to delay sending `popout-init` data, hoping the window's JS has loaded. If the window loads faster or slower, the data arrives too early (lost) or too late (blank editor).
- **Fix**: Listen for a `popout-ready` event from the popout window. The popout window should emit this event after its React app mounts. Only then emit `popout-init`. Add a timeout (5s) that closes the popout and shows an error toast if ready never fires.
- **Complexity**: Medium
- **Files also affected**: `src/components/editor/PopoutEditor.tsx` (must emit `popout-ready` on mount)

### 2C. Fix streaming pipeline error recovery in useClaude
- **File**: `src/hooks/useClaude.ts`
- **Problem**: If a stream error occurs mid-message (e.g., Claude process crashes), the conversation store retains the partially-assembled `activeBlocks` and the connection status stays `streaming` forever. There is no timeout or heartbeat to detect a dead stream.
- **Fix**: Add a streaming watchdog timer. If no stream event arrives for 30 seconds while status is `streaming`, set status to `error` with a descriptive message, finalize any partial message with an "[interrupted]" marker, and clear `activeBlocks`. Also handle the `claude_status` event to detect session termination.
- **Unblocks**: Reliable chat usage for real work.
- **Complexity**: Medium
- **Test**: Unit test: start streaming, emit no events for 30s, assert status is `error` and activeBlocks are cleared.

### 2D. Fix concurrent event routing for agent conversations
- **Files**: `src/hooks/useClaude.ts`, `src/stores/agentConversations.ts`
- **Problem**: When multiple agents stream simultaneously, `handleStreamEvent` routes based on `session_id` but does not lock the target conversation. Two near-simultaneous events for the same agent can interleave, causing block assembly corruption.
- **Fix**: Add a per-agent message queue. Events are pushed to the queue and processed sequentially per agent (simple mutex pattern using a Promise chain per session ID).
- **Complexity**: Medium

### 2E. Fix mergeQueue position desync
- **File**: `src/stores/mergeQueue.ts`
- **Problem**: Concurrent reorder + remove operations can leave gaps or duplicates in queue positions because the remove action adjusts positions based on pre-removal state.
- **Fix**: After any mutation (remove, reorder, status change), normalize all positions to be sequential (0, 1, 2, ...) based on current order.
- **Complexity**: Small
- **Test**: Unit test: add 5 items, remove item 2, reorder item 4, assert positions are [0,1,2,3].

---

## Batch 3: Core Workflow Completeness

**Rationale**: These are the features that make Vantage usable as an actual IDE rather than a demo. Each is independent. Write backend tests alongside Rust-side changes.

### 3A. Implement file save (Ctrl+S and auto-save)
- **Files**: `src/components/editor/MonacoEditor.tsx`, `src/hooks/useKeybindings.ts`, `src/stores/editor.ts`
- **Problem**: Monaco `onChange` updates the store's `content` field but never writes to disk. Edits vanish on close.
- **Fix**: Add a `saveFile` action to the editor store that calls `invoke("write_file", { path, content })` and updates `savedContent`. Wire Ctrl+S in useKeybindings to call `saveFile(activeTabId)`. Add an optional auto-save (2s debounce after last keystroke, behind a setting). Add save confirmation dialog on dirty tab close.
- **Unblocks**: Real file editing workflow. Everything else is secondary to this.
- **Complexity**: Medium
- **Test**: E2E test: open file, edit, Ctrl+S, re-read file, assert content matches.

### 3B. Wire tool result output to conversation display
- **Files**: `src/stores/conversation.ts`, `src/hooks/useClaude.ts`
- **Problem**: `ToolCall.output` and `ToolCall.isError` are never populated. Users see tool names but not results.
- **Fix**: In `handleStreamEvent`, when processing a `tool_result` block, find the matching `ToolCall` by `tool_use_id` and update its `output` and `isError` fields. The `ToolCallCard` component already has rendering logic for output.
- **Complexity**: Small
- **Test**: Unit test: process a stream with tool_use followed by tool_result, assert output is populated.

### 3C. Conversation persistence
- **Files**: `src/stores/conversation.ts`, new file `src/lib/conversationStorage.ts`
- **Problem**: Closing the app loses all conversation history. There is no way to resume or review past conversations.
- **Fix**: Persist conversations to IndexedDB (not localStorage -- messages can be large). Save after each `message_stop` event. Load the most recent conversation on app start. Add a "New Conversation" action that archives the current one.
- **Complexity**: Medium
- **Test**: Unit test: add messages, call persist, clear store, call load, assert messages restored.

### 3D. Add error boundaries around crash-prone components
- **Files**: New wrapper components for `MonacoEditor`, `SearchPanel`, `FileExplorer`
- **Problem**: A crash in Monaco (e.g., corrupt file content), SearchPanel (e.g., invalid regex), or FileExplorer (e.g., permission denied) takes down the entire app.
- **Fix**: Create a reusable `<ComponentErrorBoundary>` that catches errors and renders a "Something went wrong" message with a retry button. Wrap MonacoEditor, SearchPanel, and FileExplorer. Log caught errors.
- **Complexity**: Small
- **Test**: Unit test: render error boundary with a throwing child, assert fallback is shown.

### 3E. Add JSON parse error logging in conversation store
- **File**: `src/stores/conversation.ts`
- **Problem**: Line 179 catches JSON parse errors and silently returns `{}`. Corrupted tool inputs are processed without any indication of data loss.
- **Fix**: Log the parse error with `console.warn` including the raw JSON string (truncated to 200 chars). Set the tool call's `isError` flag. Show a subtle indicator in the ToolCallCard.
- **Complexity**: Small
- **Test**: Unit test: process a tool_use block with invalid JSON, assert warning is logged and isError is true.

### 3F. Add network timeout to pluginRegistry fetch
- **File**: `src/lib/pluginRegistry.ts`
- **Problem**: The `fetch()` call at line 61 has no timeout. If npmjs.org is slow or unreachable, the UI hangs indefinitely.
- **Fix**: Use `AbortController` with a 10-second timeout. On timeout, throw a descriptive error that the UI can display.
- **Complexity**: Small
- **Test**: Unit test with mocked fetch that never resolves, assert AbortError after 10s.

---

## Batch 4: Rust Backend Hardening + Tests

**Rationale**: The backend has zero test coverage. These items harden the backend and establish a testing foundation. Each module's tests can be written in parallel. Backend tests MUST be written with the fixes, not after.

### 4A. Add Rust tests for file operations + fix atomic writes
- **File**: `src-tauri/src/files/operations.rs`
- **Problem**: `fs::write()` can corrupt files on crash mid-write. No tests exist for the path validation added in e86b9ee.
- **Fix**: Replace `fs::write()` with write-to-temp-then-rename (atomic write pattern). Add `#[cfg(test)]` module with tests for: path validation rejects `../`, write is atomic (kill mid-write, file is intact), read returns correct content, delete removes file.
- **Complexity**: Medium
- **Test**: 8-10 unit tests.

### 4B. Add Rust tests for git operations
- **File**: `src-tauri/src/git.rs`
- **Problem**: No tests for ref/hash validation added in e86b9ee. Blame parser is fragile.
- **Fix**: Add `#[cfg(test)]` module with tests for: valid/invalid ref validation, valid/invalid hash validation, git status parsing (mock porcelain output), blame parser edge cases. Use a temp git repo fixture.
- **Complexity**: Medium
- **Test**: 10-12 unit tests.

### 4C. Add Rust tests for merge_queue command validation
- **File**: `src-tauri/src/merge_queue.rs`
- **Problem**: No tests for the command whitelist added in e86b9ee. No timeout on gate execution.
- **Fix**: Add a 60-second timeout to gate command execution (use `tokio::time::timeout`). Add tests for: allowed commands pass, disallowed commands rejected, metacharacter commands rejected, timeout fires on slow commands.
- **Complexity**: Medium
- **Test**: 6-8 unit tests.

### 4D. Fix process cleanup reliability
- **File**: `src-tauri/src/claude/process.rs`
- **Problem**: `Drop` implementation uses `try_lock()` which may fail. `start_kill()` is async but `Drop` is sync. PID reuse attack risk with `libc::kill()`.
- **Fix**: Implement an app-level process registry (HashMap of session_id -> PID) in the Tauri AppState. On Tauri shutdown event, iterate and kill all registered processes. Replace `libc::kill` with checking `/proc/{pid}/cmdline` (Linux) or querying the process name (Windows) before sending signal. On Windows, use `TerminateProcess` with the process handle instead of PID.
- **Complexity**: Large
- **Test**: Integration test: start 3 sessions, trigger cleanup, assert all processes terminated.

### 4E. Add rate limiting to file watcher events
- **File**: `src-tauri/src/files/watcher.rs`
- **Problem**: No rate limiting -- bulk operations (e.g., `npm install`) can emit 1000+ events/sec, overwhelming the frontend.
- **Fix**: Add a token bucket rate limiter (max 10 events/sec with burst of 20). Coalesce rapid events into a single "multiple files changed" event.
- **Complexity**: Medium
- **Test**: Unit test: emit 100 events in 1 second, assert <=30 events delivered.

### 4F. Fix symlink following in tree.rs
- **File**: `src-tauri/src/files/tree.rs`
- **Problem**: `WalkBuilder` follows symlinks, risking infinite loops and directory escapes.
- **Fix**: Set `follow_links(false)` on the WalkBuilder. Mark symlinks with `is_symlink: true` in the FileNode (already exists in the struct). Add a depth limit of 20 levels.
- **Complexity**: Small
- **Test**: Unit test: create a symlink loop, assert tree build terminates.

---

## Batch 5: Frontend State Quality and Missing Validations

**Rationale**: These are important quality improvements that reduce re-renders, prevent subtle bugs, and improve resilience. All are independent.

### 5A. Add Zustand selectors to editor store
- **File**: `src/stores/editor.ts`
- **Problem**: Components subscribing to `tabs` re-render on ANY tab content change because there are no selector functions. A keystroke in tab A re-renders the tab bar, file explorer, and status bar.
- **Fix**: Export selector functions: `selectActiveTab`, `selectTabNames`, `selectDirtyTabIds`, `selectActiveTabContent`. Update all consuming components to use these selectors.
- **Complexity**: Medium (many consuming components to update)

### 5B. Fix circular dependency between conversation and usage stores
- **Files**: `src/stores/conversation.ts`, `src/stores/usage.ts`
- **Problem**: `conversation.ts` calls `useUsageStore.getState()` directly. If usage ever imports conversation, it will deadlock or throw.
- **Fix**: Extract cost tracking into a standalone `trackCost(tokens, model)` function that conversation calls. Usage store subscribes to a "cost-event" rather than being called directly.
- **Complexity**: Small

### 5C. Add input field focus check to useKeybindings
- **File**: `src/hooks/useKeybindings.ts`
- **Problem**: Keybindings fire while typing in input fields, modals, and search boxes.
- **Fix**: In `handleKeyDown`, check if `event.target` is an `<input>`, `<textarea>`, or `[contenteditable]` element. If so, only process keybindings that have an explicit `globalScope: true` flag (like Ctrl+Shift+P for command palette). Skip all others.
- **Complexity**: Small

### 5D. Fix settings store NaN/Infinity validation
- **File**: `src/stores/settings.ts`
- **Problem**: Numeric setters accept NaN and Infinity without validation.
- **Fix**: Add a `clampNumber(value, min, max, default)` helper. Apply to `fontSize`, `terminalFontSize`, `terminalScrollback`, and any other numeric settings.
- **Complexity**: Small
- **Test**: Unit test: set fontSize to NaN, assert it becomes the default.

### 5E. Clean up orphaned agent conversations
- **Files**: `src/stores/agents.ts`, `src/stores/agentConversations.ts`
- **Problem**: When an agent is deleted, its conversation entry in `agentConversations` is never removed. Over many agent create/delete cycles, the store accumulates dead data.
- **Fix**: In the `removeAgent` action (agents.ts), also call `agentConversations.getState().removeConversation(agentId)`. Add `removeConversation` to the agentConversations store.
- **Complexity**: Small
- **Test**: Unit test: create agent, add conversation messages, delete agent, assert conversation is gone.

### 5F. Expand agent color palette
- **File**: `src/stores/agents.ts`
- **Problem**: Only 10 colors with modulo cycling. Agent 11 gets the same color as agent 1.
- **Fix**: Expand to 20 colors. Use a "least recently used" selection algorithm instead of cycling.
- **Complexity**: Small

---

## Batch 6: Backend Architecture Improvements

**Rationale**: These are deeper architectural improvements that benefit from the stability fixes in Batches 1-4. They involve cross-cutting concerns.

### 6A. Implement typed error enum for Rust backend
- **Files**: New `src-tauri/src/error.rs`, updates to all command handlers
- **Problem**: All commands return `Result<T, String>`. Errors are opaque strings that the frontend cannot classify (e.g., "is this a permission error or a not-found error?").
- **Fix**: Create `VantageError` enum with variants: `NotFound`, `PermissionDenied`, `InvalidInput(String)`, `GitError(String)`, `IoError(String)`, `ProcessError(String)`, `Timeout`. Implement `Into<tauri::InvokeError>`. Migrate all commands incrementally.
- **Complexity**: Large (touches many files, but each file is a small change)

### 6B. Add unbounded stderr protection
- **File**: `src-tauri/src/claude/process.rs`
- **Problem**: `eprintln!()` for all stderr output with no limit. A misbehaving Claude process could fill the log.
- **Fix**: Buffer stderr, limit to last 100 lines. Emit a `claude_stderr` event to the frontend (rate-limited to 1/sec) so errors are visible. Truncate individual lines to 1000 chars.
- **Complexity**: Small

### 6C. Add search result limit
- **File**: `src-tauri/src/search.rs`
- **Problem**: No limit on ripgrep results. A broad search in a large repo returns unbounded JSON.
- **Fix**: Add a `max_results: usize` parameter (default 500). Stop parsing after the limit. Return a `truncated: bool` flag so the UI can show "showing 500 of N results".
- **Complexity**: Small

### 6D. Add session crash detection
- **File**: `src-tauri/src/claude/session.rs`
- **Problem**: Session start returns an ID before verifying Claude CLI actually started. If Claude is not installed or crashes immediately, the session appears active.
- **Fix**: After spawning, wait up to 5 seconds for the first `system_init` event. If no init arrives, return an error. Periodically check if the child process is still alive (every 10s) and emit a `session_crashed` event if not.
- **Complexity**: Medium

---

## Batch 7: Accessibility and UX Polish

**Rationale**: These improve the app for keyboard users and screen reader users. Lower priority than stability and core workflow, but important for a professional IDE. All items are independent.

### 7A. Add keyboard navigation to file explorer
- **Files**: `src/components/files/FileExplorer.tsx`, `src/components/files/FileTreeNode.tsx`
- **Fix**: Add `role="tree"` to the file list container, `role="treeitem"` to each node. Implement arrow key navigation (Up/Down to move, Left/Right to collapse/expand, Enter to open). Track focused node in state.
- **Complexity**: Medium

### 7B. Add keyboard navigation to search results
- **File**: `src/components/search/SearchPanel.tsx`
- **Fix**: Add `role="listbox"` to results container. Arrow keys navigate between results. Enter opens the file at the selected result.
- **Complexity**: Medium

### 7C. Add ARIA roles to SlashAutocomplete
- **File**: `src/components/chat/SlashAutocomplete.tsx`
- **Fix**: Add `role="listbox"` to the popup, `role="option"` to each item, `aria-activedescendant` on the input tracking the highlighted item.
- **Complexity**: Small

### 7D. Add focus trapping to modal dialogs
- **Files**: `src/components/shared/CommandPalette.tsx`, `src/components/permissions/PermissionDialog.tsx`, `src/components/agents/CreateAgentDialog.tsx`
- **Fix**: Use a focus trap library (e.g., `focus-trap-react`) to prevent Tab from escaping modal dialogs. Restore focus to the triggering element on close.
- **Complexity**: Small per dialog

### 7E. Replace inline styles with Tailwind classes
- **Files**: ~20 components with inline styles
- **Problem**: ~200 inline styles bypass Tailwind, making theming inconsistent and increasing CSS specificity conflicts.
- **Fix**: Audit components for `style={}` props, replace with equivalent Tailwind classes. For dynamic values that must remain as styles (e.g., calculated widths from resize), keep the inline style but document why.
- **Complexity**: Medium (many files, each change is small)

---

## Batch 8: Feature Completions (Post-Stability)

**Rationale**: These add new capabilities that were scaffolded but never completed. They depend on the stability fixes in Batches 1-4 being done first.

### 8A. Conversation virtualization for 1000+ messages
- **Files**: `src/components/chat/ChatPanel.tsx`
- **Problem**: Long conversations render all messages, causing DOM bloat and slow scrolling.
- **Fix**: Use `react-window` or `@tanstack/virtual` to virtualize the message list. Only render messages in the viewport +/- 5 items buffer.
- **Complexity**: Medium

### 8B. Git mutation operations (commit, branch, merge)
- **Files**: `src-tauri/src/git.rs`, new `src/components/git/GitCommitPanel.tsx`
- **Problem**: Git integration is read-only. Users cannot commit, switch branches, or merge from the IDE.
- **Fix**: Add Rust commands: `git_commit(cwd, message, files)`, `git_checkout(cwd, branch)`, `git_create_branch(cwd, name)`. Add a commit panel UI accessed from the git status bar item.
- **Complexity**: Large

### 8C. File operations in file explorer (create, rename, delete)
- **Files**: `src/components/files/FileExplorer.tsx`
- **Problem**: Context menu actions for create/rename/delete exist but were wired to browser dialogs, now replaced with themed dialogs. However, the actual backend calls may still need verification.
- **Fix**: Verify and complete the backend integration for `create_file`, `create_directory`, `rename_file`, `delete_file`. Handle errors (permission denied, file in use).
- **Complexity**: Small (mostly verification)

### 8D. Agent detail panel wiring
- **Files**: `src/components/agents/AgentTreeView.tsx`, `src/components/agents/AgentDetailPanel.tsx`
- **Problem**: Clicking an agent in the tree view does nothing (TODO at line 309).
- **Fix**: Wire click handler to open the AgentDetailPanel in the secondary sidebar. Pass the selected agent ID.
- **Complexity**: Small

### 8E. Coordinator pipeline implementation
- **Files**: `src/stores/agents.ts`, `src/hooks/useClaude.ts`
- **Problem**: `PipelineConfig` type exists but no code creates pipelines or auto-spawns specialists.
- **Fix**: When a coordinator agent is created with a pipeline config, auto-create child specialist agents per the config. When all specialists complete, auto-trigger verification if `verifierModel` is set. This depends on stable agent sessions (Batch 2A).
- **Complexity**: Large

---

## Execution Summary

| Batch | Theme | Items | Parallelizable | Depends On |
|-------|-------|-------|----------------|------------|
| **1** | Memory leaks | 6 | All parallel | Nothing |
| **2** | Race conditions | 5 | All parallel | Nothing (can run with Batch 1) |
| **3** | Core workflows | 6 | All parallel | Batch 1 (leaks fixed) |
| **4** | Rust hardening + tests | 6 | All parallel | Nothing (can run with Batch 1-2) |
| **5** | State quality | 6 | All parallel | Batch 2 (races fixed) |
| **6** | Backend architecture | 4 | All parallel | Batch 4 (tests exist) |
| **7** | Accessibility | 5 | All parallel | Batch 3 (core workflows) |
| **8** | Feature completions | 5 | All parallel | Batches 1-5 (stability) |

### Optimal Execution Timeline

```
Phase 1 (parallel):  Batch 1 + Batch 2 + Batch 4
Phase 2 (parallel):  Batch 3 + Batch 5
Phase 3 (parallel):  Batch 6 + Batch 7
Phase 4 (parallel):  Batch 8
```

### Total Items: 43 fixes across 8 batches in 4 execution phases

**Estimated effort**:
- Small items (24): ~1-2 hours each
- Medium items (15): ~2-4 hours each
- Large items (4): ~4-8 hours each

**Critical path**: Batches 1+2 (memory leaks + races) -> Batch 3 (core workflows) -> Batch 8 (features). The Rust backend work (Batches 4+6) can proceed on a parallel track throughout.
