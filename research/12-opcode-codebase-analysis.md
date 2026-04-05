# Opcode Codebase Analysis

Deep analysis of the Opcode project (21k-star open-source Claude Code GUI) for patterns, solutions, and code worth adapting for Vantage.

**Repository**: github.com/mufeedvh/opcode  
**Stack**: Tauri 2 + React 18 + TypeScript + Zustand 5 + Tailwind CSS 4 + shadcn/ui  
**License**: AGPL-3.0

---

## 1. Usage / Cost Tracking

### How They Get the Data

Opcode reads usage data directly from Claude Code's JSONL session files on disk (`~/.claude/projects/*/**.jsonl`). This is the **same approach Vantage uses**, but their Rust implementation has several refinements worth copying.

**Key file**: `src-tauri/src/commands/usage.rs`

Their Rust backend:
1. Walks `~/.claude/projects/` with `walkdir` to find all `.jsonl` files
2. Parses each JSONL line looking for `message.usage` fields (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
3. Extracts the `costUSD` field from the stream if present; otherwise calculates cost from hardcoded per-model pricing constants
4. Deduplicates entries using `message.id + requestId` composite hash
5. Extracts the actual project path from `cwd` field in JSONL entries (not from the encoded directory name)

**Pricing constants** (worth keeping updated):
```rust
// Claude 4 pricing (per million tokens)
const OPUS_4_INPUT_PRICE: f64 = 15.0;
const OPUS_4_OUTPUT_PRICE: f64 = 75.0;
const OPUS_4_CACHE_WRITE_PRICE: f64 = 18.75;
const OPUS_4_CACHE_READ_PRICE: f64 = 1.50;

const SONNET_4_INPUT_PRICE: f64 = 3.0;
const SONNET_4_OUTPUT_PRICE: f64 = 15.0;
const SONNET_4_CACHE_WRITE_PRICE: f64 = 3.75;
const SONNET_4_CACHE_READ_PRICE: f64 = 0.30;
```

**Key insight**: They use `costUSD` from the JSONL when available (Claude CLI provides this), falling back to manual calculation. This is more accurate than always calculating manually.

### Data Model

```rust
struct UsageStats {
    total_cost: f64,
    total_tokens: u64,
    total_input_tokens: u64,
    total_output_tokens: u64,
    total_cache_creation_tokens: u64,
    total_cache_read_tokens: u64,
    total_sessions: u64,
    by_model: Vec<ModelUsage>,
    by_date: Vec<DailyUsage>,
    by_project: Vec<ProjectUsage>,
}
```

Three Tauri commands exposed:
- `get_usage_stats(days)` -- overall stats with optional day filter
- `get_usage_by_date_range(start, end)` -- date range filter
- `get_session_stats(since, until, order)` -- per-session breakdown

### Frontend Display

**Key file**: `src/components/UsageDashboard.tsx`

- 5-tab layout: Overview, By Model, By Project, By Session, Timeline
- Summary cards: Total Cost, Total Sessions, Total Tokens, Avg Cost/Session
- Timeline chart is a pure CSS bar chart (no chart library for this) with hover tooltips
- Client-side caching with 10-minute TTL (`Map<string, { data, timestamp }>`)
- Lazy tab rendering: tabs are only rendered when first visited, then cached with `display: none`
- Pagination (10 items per page) for projects and sessions lists

**Token counter**: A separate `TokenCounter` component shows a floating pill at bottom-right with current session token count, calculated from `message.usage` in the stream.

### How This Differs from Vantage

Vantage has a similar `analytics.rs` that reads JSONL files, but Opcode's implementation has:
- **Deduplication** via message ID + request ID hash (we should add this)
- **costUSD fallback** from the stream (more accurate than always calculating)
- **walkdir** for recursive JSONL discovery vs our manual directory traversal
- **Client-side data caching** to avoid re-fetching on tab switches
- **Lazy tab rendering** pattern for the dashboard tabs

### Code to Adapt

The deduplication logic and `costUSD` fallback from `usage.rs` lines 170-199 should be ported to Vantage's `analytics.rs`. The client-side cache pattern from `UsageDashboard.tsx` is also worth adopting.

---

## 2. Layout System

### Architecture

Opcode does **not** have a traditional IDE layout with resizable panels. Instead, it uses a **tab-based interface** similar to a browser.

**Key files**:
- `src/contexts/TabContext.tsx` -- Tab state management via React Context
- `src/hooks/useTabState.ts` -- Tab operations hook
- `src/components/TabManager.tsx` -- Tab bar with drag-to-reorder
- `src/components/TabContent.tsx` -- Tab panel renderer with lazy loading

### Tab System

```typescript
interface Tab {
  id: string;
  type: 'chat' | 'agent' | 'agents' | 'projects' | 'usage' | 'mcp' | 'settings' | 'claude-md' | ...;
  title: string;
  sessionId?: string;
  status: 'active' | 'idle' | 'running' | 'complete' | 'error';
  hasUnsavedChanges: boolean;
  order: number;
}
```

Key features:
- **Drag-to-reorder** using `framer-motion`'s `Reorder` component (not a dedicated DnD library)
- **Tab persistence** via `TabPersistenceService` (localStorage)
- **Session persistence** via `SessionPersistenceService` (localStorage) -- restores chat sessions across restarts
- **Lazy loading** of heavy components via `React.lazy()` in `TabContent.tsx`
- **Max 20 tabs** hard limit
- **Keyboard shortcuts**: Ctrl+T (new tab), Ctrl+W (close), Ctrl+Tab/Shift+Tab (navigate), Ctrl+1-9 (jump to tab)
- **Status indicators** on tabs: spinner for running, red dot for error, blue dot for unsaved changes

### How They Handle the Titlebar

`CustomTitlebar.tsx` uses `data-tauri-drag-region` for window dragging and `getCurrentWindow()` from `@tauri-apps/api/window` for minimize/maximize/close. Navigation buttons (Settings, Agents, Usage, CLAUDE.md, MCP, Info) are in a dropdown menu on the titlebar.

### How This Differs from Vantage

Vantage has a full IDE layout with:
- Activity bar (left icon strip)
- Sidebar panels (file explorer, search, etc.)
- Editor groups with resizable splits
- Terminal panel at bottom

Opcode is simpler -- it's essentially a **multi-tab chat client** with settings/agent pages, not an IDE. They don't have:
- No file explorer
- No Monaco editor
- No terminal emulator
- No resizable panels at all
- No split views (except a preview split using a custom `SplitPane` component)

**Takeaway**: Their tab system is well-implemented and the `Reorder` pattern from framer-motion is cleaner than what we'd get from a DnD library. The lazy loading pattern for tab content is smart. But their layout is too simple for Vantage's needs -- we need to keep our panel-based approach.

### Worth Adapting

- The `TabPersistenceService` / `SessionPersistenceService` pattern for restoring state across restarts
- The `React.lazy()` pattern for loading heavy tab content on demand
- The framer-motion `Reorder.Item` for tab drag-and-drop (simpler than react-dnd)

---

## 3. Claude Code CLI Communication

### Process Spawning

**Key file**: `src-tauri/src/commands/claude.rs` (function `spawn_claude_process`)

Three commands for starting Claude:
```rust
// New session
execute_claude_code(app, project_path, prompt, model)
// Continue conversation (same project, new prompt)  
continue_claude_code(app, project_path, prompt, model)
// Resume specific session by ID
resume_claude_code(app, project_path, session_id, prompt, model)
```

All three build args and call `spawn_claude_process()`. The command construction:

```rust
let args = vec![
    "-p".to_string(),           // prompt flag
    prompt.clone(),
    "--model".to_string(),
    model.clone(),
    "--output-format".to_string(),
    "stream-json".to_string(),
    "--verbose".to_string(),
    "--dangerously-skip-permissions".to_string(),  // SECURITY NOTE
];
```

**Critical difference from Vantage**: They use `--dangerously-skip-permissions` to bypass all permission prompts. This means they never show permission dialogs. This is a **major security concern** but simplifies their implementation significantly.

### Stream Parsing

The `spawn_claude_process` function:
1. Spawns the process with piped stdout/stderr
2. Stores the `Child` in `ClaudeProcessState` (global Tauri state, `Arc<Mutex<Option<Child>>>`)
3. Registers with `ProcessRegistry` for session tracking
4. Spawns two tokio tasks -- one for stdout lines, one for stderr lines
5. **Session ID extraction**: Parses each stdout line as JSON, looking for `type: "system", subtype: "init"` to extract the `session_id`
6. Emits events to frontend with session isolation: `claude-output:{session_id}`, `claude-error:{session_id}`, `claude-complete:{session_id}`
7. Also emits generic events (`claude-output`, `claude-error`, `claude-complete`) for backward compatibility

### Frontend Event Handling

**Key file**: `src/components/ClaudeCodeSession.tsx`

The frontend sets up a two-phase listener strategy:
1. **Phase 1 (Generic listeners)**: Listen on `claude-output` (no session suffix) to catch the very first `system:init` message regardless of session ID
2. **Phase 2 (Session-specific)**: Once the init message provides the actual session ID, dynamically switch to `claude-output:{sessionId}` listeners and remove the generic ones

This solves the race condition where Claude might emit a new session ID even when `--resume` is used.

```typescript
// Phase 1: Generic listener catches init
const genericOutputUnlisten = await listen('claude-output', async (event) => {
  handleStreamMessage(event.payload);
  // Extract session_id from init message, then switch to scoped listeners
  const msg = JSON.parse(event.payload);
  if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
    await attachSessionSpecificListeners(msg.session_id);
  }
});
```

### Process Cancellation

`cancel_claude_execution` uses a multi-method approach:
1. Try `ProcessRegistry.kill_process(run_id)` via session ID lookup
2. Fall back to `ClaudeProcessState.current_process.kill()`
3. Last resort: `taskkill /F /PID` (Windows) or `kill -KILL` (Unix)
4. Always emits cancellation events regardless of success

### Session Management

- `load_session_history(session_id, project_id)` reads the JSONL file for a session and returns all entries
- `list_running_claude_sessions()` queries ProcessRegistry for active ClaudeSession entries
- Session reconnection: checks if a session is still running and re-attaches listeners

### API Adapter (Tauri vs Web)

**Key file**: `src/lib/apiAdapter.ts`

Opcode has a dual-mode adapter that detects whether it's running in Tauri or a web browser:
- **Tauri mode**: Uses `invoke()` directly
- **Web mode**: Maps Tauri commands to REST API endpoints, uses WebSocket for streaming commands

This is interesting because they also ship a web server (`web_server.rs`) that serves the same API over HTTP/WebSocket, enabling phone/browser access to a locally-running instance.

### How This Differs from Vantage

Key differences:
1. **No permission handling** -- they skip all permissions with `--dangerously-skip-permissions`
2. **No PTY** -- they don't have a terminal; all communication is via `--output-format stream-json`
3. **Simpler process model** -- single global `ClaudeProcessState` with one active process (plus registry for agents)
4. **Web mode support** -- dual Tauri/REST adapter is unique to Opcode
5. **No tauri-specta** -- they use raw `#[tauri::command]` without type generation

### Code to Adapt

- The **two-phase listener strategy** (generic then session-specific) is a great pattern we should use
- The **multi-method cancellation** approach is more robust than a single kill
- The **ProcessRegistry** pattern for tracking multiple concurrent sessions is clean

---

## 4. File Explorer

### Their Approach

Opcode does **not have a file explorer** in the traditional sense. They have two file-browsing components:

#### FilePicker (`src/components/FilePicker.tsx`)

A modal file browser for selecting project directories:
- Calls `list_directory_contents(path)` Tauri command
- Simple file/folder listing with icon mapping by extension
- **Global caches**: `globalDirectoryCache` and `globalSearchCache` (Map objects that persist across component instances)
- Search capability with fuzzy matching
- No git status indicators
- No lazy loading of deep trees -- just loads the current directory

#### Rust Backend (`list_directory_contents` in claude.rs)

Simple `fs::read_dir()` that returns `Vec<FileEntry>`:
```rust
struct FileEntry {
    name: String,
    path: String,
    is_directory: bool,
    size: u64,
    extension: Option<String>,
}
```

No git integration, no ignore rules, no recursive loading.

### How This Differs from Vantage

Vantage's file explorer is **far more sophisticated**:
- Lazy-loading tree with expand/collapse
- Git status indicators (modified, untracked, etc.)
- Context menus (new file, rename, delete, etc.)
- File watcher for real-time updates
- Ignore-aware (respects .gitignore)

**Takeaway**: Nothing to copy here. Vantage's file explorer is already more capable.

---

## 5. Notable Features We Don't Have (or Could Improve)

### 5.1 Checkpoint / Timeline System

**Key files**: `src-tauri/src/checkpoint/` (mod.rs, manager.rs, state.rs, storage.rs)

Opcode has a full checkpoint system with:
- **File snapshots** at each checkpoint (compressed with zstd, integrity via SHA-256)
- **Timeline tree** structure (supports branching/forking)
- **4 checkpoint strategies**: Manual, PerPrompt, PerToolUse, Smart
- **Checkpoint diffing** between any two points
- **Fork from checkpoint** to create alternative conversation branches
- **Auto-cleanup** of old checkpoints

Frontend components:
- `TimelineNavigator.tsx` -- Visual tree of checkpoints with expand/collapse
- `CheckpointSettings.tsx` -- Settings panel for checkpoint strategy

**Comparison with Vantage**: We have `checkpoint.rs` with git tag-based checkpoints. Opcode's approach is file-snapshot-based (stores actual file contents, not git tags). Their approach is more portable but uses more storage. Their fork/branch capability and the Smart strategy are features we should consider.

### 5.2 Agent System with SQLite Persistence

**Key files**: `src-tauri/src/commands/agents.rs`, `src/components/Agents.tsx`, `src/components/AgentExecution.tsx`

Opcode uses **SQLite** (via `rusqlite`) for:
- Agent definitions (name, icon, system_prompt, model, hooks)
- Agent runs (task, status, session_id, metrics)
- App settings (claude_binary_path, proxy settings)

Agents can be:
- Created locally with custom system prompts
- Imported from GitHub (community agent gallery)
- Exported to JSON files
- Run with real-time metrics (duration, tokens, cost)

**Comparison with Vantage**: We have a more complex multi-agent system (Kanban, hierarchy, worktrees) but their SQLite persistence and GitHub import/export is slick. We should consider SQLite for agent persistence instead of JSON workspace files.

### 5.3 Web Server Mode

**Key file**: `src-tauri/src/web_server.rs`

They ship an Axum-based web server that:
- Serves the same React frontend
- Exposes all Tauri commands as REST endpoints
- Uses WebSocket for streaming Claude output
- Allows access from phone/browser on LAN

This is unique and could be interesting for Vantage -- "access your IDE from your phone" -- but is a low priority feature.

### 5.4 Claude Binary Discovery

**Key file**: `src-tauri/src/claude_binary.rs`

Sophisticated binary detection:
- Checks stored path in SQLite first
- Discovers all system installations (NVM, Homebrew, system PATH, `~/.claude/local`, `~/.local/bin`)
- Compares versions and selects the highest
- `ClaudeVersionSelector` component lets users pick which installation to use
- Handles PATH issues on macOS (where GUI apps have limited PATH)

**Comparison with Vantage**: We have `prerequisites.rs` that checks for Claude, but their version-aware selection and multi-installation support is more robust.

### 5.5 Hooks Editor

**Key file**: `src/components/HooksEditor.tsx`

Full CRUD editor for Claude Code hooks:
- Event types: PreToolUse, PostToolUse, Notification, Stop, SubagentStop
- Matcher patterns for tool names
- Command configuration with timeout
- Template system with pre-built hooks
- Validation via `validate_hook_command` backend call
- Supports project, local, and user scopes

**Comparison with Vantage**: We have a hooks editor too, but their template system and validation are nice touches.

### 5.6 Slash Commands Manager

**Key files**: `src-tauri/src/commands/slash_commands.rs`, `src/components/SlashCommandsManager.tsx`, `src/components/SlashCommandPicker.tsx`

They parse Claude Code's slash command markdown files:
- Reads from `~/.claude/.commands/` (user) and `.claude/commands/` (project)
- Parses YAML frontmatter for `allowed-tools` and `description`
- Detects bash commands (`!`), file references (`@`), and argument placeholders (`$ARGUMENTS`)
- Autocomplete picker triggered by `/` in the prompt input
- CRUD management UI

**Comparison with Vantage**: We handle slash commands in our chat system, but their dedicated picker and management UI are better structured.

### 5.7 Prompt Queuing

In `ClaudeCodeSession.tsx`, if the user sends a prompt while Claude is still running:
```typescript
if (isLoading) {
  const newPrompt = { id: generateId(), prompt, model };
  setQueuedPrompts(prev => [...prev, newPrompt]);
  return;
}
```

Queued prompts are processed sequentially when the current response completes. The queue is visible and collapsible in the UI. This is a nice UX pattern we should adopt.

### 5.8 Thinking Mode Selector

`FloatingPromptInput.tsx` has a thinking mode picker:
```typescript
type ThinkingMode = "auto" | "think" | "think_hard" | "think_harder" | "ultrathink";
```

Each mode appends a phrase to the prompt that triggers extended thinking. This maps to our "effort level selector" concept.

### 5.9 Model Switcher per Message

The floating prompt input lets users choose between Sonnet and Opus on a per-message basis. The model selection is part of the `handleSendPrompt(prompt, model)` signature.

### 5.10 PostHog Analytics

**Key file**: `src/lib/analytics/index.ts`

They use PostHog for analytics with:
- Consent management (opt-in)
- Event sanitization (remove PII)
- Screen tracking
- Feature adoption tracking
- Journey milestone tracking
- Resource monitoring (CPU, memory)

This is for their hosted analytics, not for user-facing cost tracking. We don't need this, but the consent management pattern is good if we ever add telemetry.

### 5.11 Proxy Settings

`src/components/ProxySettings.tsx` and `src-tauri/src/commands/proxy.rs`

They support HTTP/HTTPS proxy configuration that's applied at startup. Stored in SQLite. This is useful for corporate environments.

### 5.12 Virtual Scrolling for Messages

`ClaudeCodeSession.tsx` uses `@tanstack/react-virtual` for virtualizing the message list:
```typescript
const rowVirtualizer = useVirtualizer({
  count: displayableMessages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 150,
  overscan: 5,
});
```

This is critical for long conversations. We should adopt this pattern for our chat panel.

---

## 6. Rust Backend Architecture

### Command Structure

```
src-tauri/src/
  commands/
    mod.rs          -- Module declarations only
    claude.rs       -- ~1400 lines: projects, sessions, CLAUDE.md, hooks, checkpoints, process spawning
    agents.rs       -- Agent CRUD, execution, SQLite operations
    mcp.rs          -- MCP server management (delegates to `claude mcp` CLI subcommand)
    usage.rs        -- JSONL parsing and usage aggregation
    slash_commands.rs -- Slash command discovery and CRUD
    storage.rs      -- Generic SQLite table management
    proxy.rs        -- Proxy configuration
  process/
    mod.rs
    registry.rs     -- ProcessRegistry for tracking active processes
  checkpoint/
    mod.rs          -- Types (Checkpoint, FileSnapshot, TimelineNode, etc.)
    manager.rs      -- Checkpoint creation/restoration logic
    state.rs        -- Global checkpoint state
    storage.rs      -- Checkpoint file I/O with zstd compression
  claude_binary.rs  -- Binary discovery across NVM, Homebrew, system
  lib.rs            -- Minimal: module declarations + Tauri builder
  main.rs           -- Full Tauri setup with all state initialization and command registration
```

### State Management (Rust side)

Four pieces of global Tauri state:
1. `ClaudeProcessState` -- `Arc<Mutex<Option<Child>>>` for the current Claude process
2. `ProcessRegistryState` -- `Arc<ProcessRegistry>` for tracking all running processes
3. `AgentDb` -- `Mutex<rusqlite::Connection>` for SQLite operations
4. `CheckpointState` -- Checkpoint manager state

### Process Management

`ProcessRegistry` (`src-tauri/src/process/registry.rs`) is a well-designed component:
- HashMap of `run_id -> ProcessHandle` (info + child handle + live output buffer)
- Auto-incrementing IDs starting at 1,000,000 for non-agent processes
- Methods: `register_process`, `register_claude_session`, `kill_process`, `get_running_*`, `append_live_output`
- Kill sequence: `child.start_kill()` -> wait 5s -> `taskkill /F /PID` fallback -> `kill -KILL` fallback
- Cross-platform kill handling

### Security Patterns

**Mostly absent.** Their security posture is weak:
- No input validation on file paths
- `--dangerously-skip-permissions` on all Claude invocations
- No path traversal prevention
- No shell injection prevention (they use `arg()` correctly though, not shell strings)
- Direct `fs::read_to_string` and `fs::write` without sanitization

**Vantage is ahead here.** We validate inputs at the Rust boundary, use arg tokenization, and have permission dialogs. Don't copy their security (non-)patterns.

### Dependencies Worth Noting

Rust:
- `walkdir` for recursive file discovery (we use manual recursion in some places)
- `rusqlite` with `bundled` feature for SQLite (we don't use SQLite)
- `zstd` for checkpoint compression
- `sha2` for file integrity hashing
- `uuid` for checkpoint IDs
- `serde_yaml` for slash command frontmatter
- `which` for binary discovery
- `axum` + `tower-http` for web server mode

Frontend:
- `@tanstack/react-virtual` for message list virtualization
- `@uiw/react-md-editor` for CLAUDE.md editing
- `framer-motion` for animations and tab reordering
- `react-syntax-highlighter` with Prism for code blocks
- `diff` for file diff visualization in tool widgets
- `posthog-js` for analytics
- `date-fns` for timestamp formatting
- `react-markdown` + `remark-gfm` for message rendering
- `recharts` (imported but appears lightly used)

### How This Differs from Vantage

Vantage's backend is more modular:
- Separate files per domain (files/, terminal/, claude/, git.rs, search.rs, etc.)
- tauri-specta for type-safe bindings
- More sophisticated file watching and git integration
- PTY terminal management
- Workspace persistence model

Opcode's backend is simpler but has some good patterns:
- SQLite for structured data (agents, settings) -- cleaner than JSON files
- ProcessRegistry is well-isolated and reusable
- Checkpoint system with compression and integrity verification

---

## 7. Summary of What to Adapt

### High Priority (direct code reuse)

| Feature | Source File | Adaptation |
|---------|-----------|------------|
| JSONL deduplication (message_id + request_id) | `usage.rs:170-199` | Port to `analytics.rs` |
| costUSD fallback from stream | `usage.rs:192-198` | Port to `analytics.rs` |
| Two-phase event listeners (generic then scoped) | `ClaudeCodeSession.tsx:529-602` | Port to `useClaude.ts` |
| Multi-method process cancellation | `claude.rs:1018-1149` | Port to `claude/` process manager |
| Virtual scrolling for messages | `ClaudeCodeSession.tsx:263-268` | Add `@tanstack/react-virtual` to ChatPanel |
| Prompt queuing | `ClaudeCodeSession.tsx:498-507` | Add to conversation store |
| Client-side usage data caching | `UsageDashboard.tsx:24-89` | Add to UsageDashboard |
| Lazy tab content loading | `TabContent.tsx:13-21` | Add `React.lazy` for heavy panels |

### Medium Priority (pattern adaptation)

| Feature | Notes |
|---------|-------|
| SQLite for structured data | Consider for agents, settings persistence instead of JSON |
| Session persistence service | Restore chat sessions across app restarts |
| Checkpoint fork/branch | Add branching to our checkpoint system |
| Slash command picker with autocomplete | Improve our slash command UX |
| Claude binary version selection | Multi-version support for prerequisites |
| ProcessRegistry pattern | Clean process tracking abstraction |

### Low Priority (nice to have)

| Feature | Notes |
|---------|-------|
| Web server mode | Access from phone/browser |
| GitHub agent import/export | Community agent sharing |
| Proxy settings | Corporate environment support |
| PostHog-style analytics | Only if we add telemetry |
| framer-motion Reorder for tabs | Prettier tab dragging |

### What NOT to Copy

- Their `--dangerously-skip-permissions` approach -- we need proper permission handling
- Their lack of input validation -- our security is better
- Their layout system -- too simple for an IDE
- Their file browsing -- ours is already superior
- Their lack of terminal -- we need PTY support
- Their React 18 patterns -- we're on React 19

---

## 8. Architecture Comparison

| Aspect | Opcode | Vantage |
|--------|--------|---------|
| **Purpose** | Chat-focused Claude GUI | Full IDE replacement |
| **Layout** | Tab-based (browser-like) | Panel-based (VSCode-like) |
| **Editor** | None (markdown editor only) | Monaco Editor |
| **Terminal** | None | xterm.js + ConPTY PTY |
| **File Explorer** | Basic file picker modal | Full lazy-loading tree |
| **Claude CLI** | `--dangerously-skip-permissions` | Permission dialog system |
| **State** | React Context + Zustand + SQLite | Zustand stores + workspace JSON |
| **Type Safety** | Raw `#[tauri::command]` | tauri-specta type generation |
| **Message Rendering** | react-markdown + tool widgets | Custom MessageBubble + ToolCallCard |
| **Message Virtualization** | @tanstack/react-virtual | Not yet (should add) |
| **Git Integration** | None | Branch, status, log, blame, stage/commit |
| **Multi-Agent** | Agents with SQLite + GitHub import | Kanban + hierarchy + worktrees |
| **Checkpoints** | File snapshots + zstd compression | Git tag-based |
| **MCP** | Delegates to `claude mcp` subcommand | Direct config read/write |
| **Hooks** | Full CRUD editor with templates | Editor with CRUD |
| **Search** | Basic file search | ripgrep + ignore fallback |
| **Theming** | System dark/light | Catppuccin Mocha/Latte/HC |
| **Testing** | None visible | 362 frontend + 76 Rust tests |
| **Security** | Minimal | Input validation + arg tokenization |
| **Web Mode** | Axum web server + WebSocket | None (Tauri only) |
| **Analytics** | PostHog telemetry | Local usage dashboard |

**Bottom line**: Opcode is a polished chat client for Claude Code. Vantage is a full IDE. The architectures are fundamentally different, but Opcode has several well-implemented patterns in the areas where our features overlap (usage tracking, CLI communication, session management, checkpoint system) that are worth porting.
