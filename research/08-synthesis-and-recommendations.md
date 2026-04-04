# Vantage: Synthesis and Recommendations

**Date**: 2026-04-03
**Purpose**: The bridge document between research and design. Consolidates 432KB of research across 8 files into actionable decisions for building Vantage -- a desktop IDE built around Claude Code CLI, targeting Windows, prioritizing quality UX.

---

## Table of Contents

1. [Recommended Tech Stack](#1-recommended-tech-stack)
2. [Architecture Blueprint](#2-architecture-blueprint)
3. [Feature Priority Matrix](#3-feature-priority-matrix)
4. [Lessons From Existing Projects](#4-lessons-from-existing-projects)
5. [Critical Risks and Mitigations](#5-critical-risks-and-mitigations)
6. [Windows Gotchas Checklist](#6-windows-gotchas-checklist)
7. [Open Design Questions](#7-open-design-questions)

---

## 1. Recommended Tech Stack

### 1.1 Application Shell

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| **Desktop framework** | Tauri v2 | 2.x (latest stable) | Consensus across files 00, 01, 03. Opcode (21.3k stars), SideX, Agents UI all prove Tauri works for IDE-class apps. 30-52 MB idle memory vs. 184-300 MB for Electron (file 03 benchmarks). Rust backend is natural for PTY, file watching, and git operations. Anthropic's own Claude Code Desktop uses Tauri 2. |
| **Frontend framework** | React 19 | 19.x | Every successful Claude Code GUI uses React (files 00, 01). CodePilot, Opcode, Companion, Kanna all React-based. Largest ecosystem for IDE components. |
| **Language** | TypeScript 5 | 5.x | Universal across all research subjects. Type safety critical for IPC boundary correctness. |
| **Bundler** | Vite 7 | 7.x | Used by Opcode, Kanna, Companion. Fast HMR critical for IDE development velocity. dannysmith/tauri-template uses Vite 7 (file 03). |
| **UI components** | shadcn/ui v4 | 4.x | Built on Radix UI. Proven in Tauri apps (tauri-ui, dannysmith/tauri-template). Provides Command palette (cmdk), Resizable panels, Dialog, Tabs, Toast (Sonner), Context Menu -- all IDE essentials (file 05). |
| **State management** | Zustand v5 | 5.x | Used by Opcode, Kanna, Companion, and recommended by dannysmith/tauri-template. Lightweight, selector-based, pairs well with streaming data. Claude Code itself uses a Zustand-like store internally (file 02). |
| **Server state** | TanStack Query v5 | 5.x | For session history, file metadata, and cached data. dannysmith/tauri-template includes this. |
| **Styling** | Tailwind CSS v4 | 4.x | Used by every Tauri-based Claude Code GUI. Fast iteration, dark mode support, works perfectly in WebView2 (files 01, 03). |
| **Icons** | Lucide React | latest | shadcn/ui default. Supplement with Codicons for VS Code familiarity. |

### 1.2 Core IDE Components

| Component | Choice | Package | Rationale |
|-----------|--------|---------|-----------|
| **Code editor** | Monaco Editor | `monaco-editor` + `vite-plugin-monaco-editor` | SideX, Agents UI, Montauri, Min Editor all prove Monaco works in Tauri's WebView2. IntelliSense, built-in diff viewer, minimap out of the box. Users expect VS Code-like editing (file 03 sec. 3). CodeMirror 6 is lighter but lacks IntelliSense -- wrong trade-off for an IDE. |
| **Terminal emulator** | xterm.js 5.x (WebGL renderer) | `@xterm/xterm`, `@xterm/addon-webgl`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links` | Industry standard. Used by VS Code, Companion, Kanna, and every terminal-in-browser project. WebGL renderer provides best performance in WebView2. Custom React hook, not a wrapper library (file 03 sec. 2). |
| **PTY backend** | tauri-plugin-pty | `tauri-plugin-pty` v0.1 (depends on `portable-pty` ^0.9) | Turnkey Tauri<->PTY bridge. Falls back to ConPTY on Windows. Start here, drop to raw portable-pty if more control needed (file 03 sec. 2, file 07 sec. 1). |
| **Split layout** | react-resizable-panels | `react-resizable-panels` v4.9 (via shadcn/ui Resizable) | Best maintained, smallest bundle, excellent accessibility, keyboard resize, layout persistence. Used by shadcn/ui. Brian Vaughn (React core) maintains it (file 03 sec. 7, file 05 sec. 1.6). |
| **Command palette** | cmdk (via shadcn Command) | `cmdk` | Powers Linear, Raycast, Vercel. Unstyled, composable, accessible. Support multiple modes: > for commands, plain for files, @ for symbols, natural language for Claude (file 05 sec. 1.4). |
| **Diff viewer** | Monaco inline diff + react-diff-view | `react-diff-view` for multi-file review | Monaco's built-in diff for editor-embedded diffs. react-diff-view for the multi-file review panel. Support unified and split modes (file 05 sec. 2.5). |
| **Syntax highlighting (chat)** | Shiki | `shiki` | VS Code-compatible TextMate grammars. Use for rendering code in chat messages and diff views outside the editor (file 03 sec. 3). |
| **Markdown rendering** | react-markdown | `react-markdown` + `remark-gfm` + `rehype-raw` | Used by Opcode, CodePilot, Companion. Standard for rendering Claude's responses (file 01). |
| **Drag-and-drop** | dnd-kit | `@dnd-kit/core`, `@dnd-kit/sortable` | For kanban board interactions. Used by Kanna. More modern and accessible than react-beautiful-dnd (file 01, file 05). |
| **Notifications** | Sonner (via shadcn) + Tauri notifications | `sonner` + `@tauri-apps/plugin-notification` | In-app toasts via Sonner; system-level notifications via Tauri plugin. Critical for multi-agent status alerts (file 05 sec. 3.4). |

### 1.3 Rust Backend Components

| Component | Choice | Crate | Rationale |
|-----------|--------|-------|-----------|
| **File watching** | notify | `notify` v9 + `notify-debouncer-full` | Standard for Rust file watching. Used by Tauri internally, cargo-watch, deno, rust-analyzer. Must debounce and watch directories, not files (file 03 sec. 4, file 07 sec. 3.2). |
| **File tree** | ignore | `ignore` crate | Same walker as ripgrep. Respects .gitignore automatically. Lazy-load first 2 levels, expand on demand (file 03 sec. 4). |
| **Git integration** | Hybrid: git2-rs + shell out | `git2` for reads; `std::process::Command` for complex ops | git2-rs stable on Windows for status/diff/log. Shell out to git.exe for rebase/merge/push where correctness matters. gix is faster but has Windows-specific bugs (file 03 sec. 4, file 07 sec. 4.5). |
| **Database** | SQLite via rusqlite | `rusqlite` v0.32 (bundled) | Used by Opcode, CodePilot for session/settings storage. Bundled SQLite means no external dependency (file 01). |
| **IPC type safety** | tauri-specta | `tauri-specta` v2 | Generates TypeScript bindings from Rust command signatures at build time. Eliminates type mismatches at the IPC boundary (file 03 sec. 5). |
| **Async runtime** | Tokio | `tokio` (full features) | Required by Tauri. Used by Opcode. Essential for concurrent PTY management, file I/O, and sidecar communication (file 01, 03). |
| **Serialization** | serde | `serde` + `serde_json` | Standard. Required for all IPC, JSONL parsing, and configuration (file 01, 03). |

### 1.4 Claude Code Integration

| Component | Choice | Package | Rationale |
|-----------|--------|---------|-----------|
| **Primary integration** | Claude Agent SDK (TypeScript) via Node.js sidecar | `@anthropic-ai/claude-agent-sdk` ^0.2.x | Officially supported by Anthropic. Provides typed events, `canUseTool` callback for permissions, session management, hook system, MCP server management. This is the exact architecture used by Anthropic's own Claude Code Desktop (file 06 sec. 1, 12). The `--sdk-url` WebSocket protocol is tempting but undocumented and could break (files 01, 06 sec. 15). |
| **Fallback** | Raw CLI with stream-json | `claude -p --output-format stream-json` | For lightweight one-shot operations where spinning up a full SDK session is overkill (file 06 sec. 1, Option C). |
| **Session history** | JSONL file parsing | Direct filesystem reading of `~/.claude/projects/` | For browsing past sessions without spawning Claude Code. Parse JSONL with UUID chain reconstruction (file 02 sec. 8). |
| **Protocol parser (reference)** | claude-code-parser | `claude-code-parser` | Community library handling verbose mode deduplication, polymorphic content, and double-encoded results. Useful reference even if using SDK directly (file 06 sec. 14). |

### 1.5 Starter Template

**Start from `dannysmith/tauri-template`** and extend. It provides (file 03 sec. 8):

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

---

## 2. Architecture Blueprint

### 2.1 Process Model

```
+--------------------------------------------------+
|                 VANTAGE PROCESS                   |
|                                                   |
|  +---------------------------------------------+ |
|  | TAURI MAIN PROCESS (Rust)                    | |
|  |                                              | |
|  |  SessionManager (orchestrates all sessions)  | |
|  |  AgentBridge[] (one per active session)       | |
|  |  FileWatcher (notify crate, debounced)       | |
|  |  GitService (git2 + shelling out to git.exe) | |
|  |  PTYManager (portable-pty, one per terminal) | |
|  |  SettingsStore (rusqlite)                    | |
|  |  UpdateChecker (tauri-plugin-updater)        | |
|  +------+----+----+-----+----+-----------------+ |
|         |    |    |     |    |                    |
|         v    |    |     |    v                    |
|  +------+--+ |  +-+---+ | +----+                  |
|  |WebView2| |  |PTY 1 | | |PTY2|  (terminals)     |
|  |(React) | |  |ConPTY| | |    |                   |
|  +--------+ |  +------+ | +----+                   |
|             |           |                          |
|  +----------+-----------+------------------------+ |
|  | NODE.JS SIDECAR PROCESS(ES)                   | |
|  |                                               | |
|  |  bridge.js (Agent SDK wrapper)                | |
|  |  - Per-session query() loop                   | |
|  |  - canUseTool -> stdout -> Rust -> React      | |
|  |  - streamInput() for multi-turn               | |
|  |  - Session resume/fork support                | |
|  +-----------------------------------------------+ |
|             |                                       |
+-------------|---------------------------------------+
              v
    Anthropic API (Claude)
```

**Key architectural decisions:**

1. **One Node.js sidecar process per active Claude session.** The Agent SDK's `query()` is a single async generator loop per session. Multiple sessions need separate loops. Multiplexing is possible but fragile.

2. **Rust manages all native resources.** PTY processes, file watchers, git operations, and SQLite all live in the Rust process. The React frontend never touches native resources directly.

3. **WebView2 is the sole rendering surface.** No multiple windows at MVP. The single WebView contains the full IDE layout. Floating windows can come later via Tauri's multi-window support.

### 2.2 Data Flow Diagram

```
USER INPUT FLOW (prompt to Claude):
==================================

User types in chat input (React)
    |
    v
React dispatches via Zustand action
    |
    v
Tauri invoke('send_message', { sessionId, content })
    |
    v
Rust SessionManager routes to correct AgentBridge
    |
    v
AgentBridge writes NDJSON to sidecar stdin
    |
    v
Node.js sidecar calls query.streamInput() with user message
    |
    v
Agent SDK sends to Anthropic API
    |
    v
Claude processes and streams response


CLAUDE OUTPUT FLOW (response to user):
======================================

Anthropic API streams response
    |
    v
Agent SDK yields SDKMessage objects
    |
    v
Node.js sidecar serializes to NDJSON, writes to stdout
    |
    v
Rust AgentBridge reader thread parses NDJSON line
    |
    v
Rust emits Tauri event ('agent_event', { sessionId, message })
    |
    v
React event listener receives, dispatches to Zustand store
    |
    v
Zustand store accumulates deltas into message blocks
    |
    v
React re-renders conversation panel with new content


PERMISSION FLOW (tool approval):
================================

Agent SDK canUseTool fires in Node.js sidecar
    |
    v
Sidecar writes { type: "permission_request", toolName, input } to stdout
    |
    v
Rust reader thread picks up, emits Tauri event
    |
    v
React renders permission dialog (tool name, input preview, risk level)
    |
    v
User clicks Allow / Deny
    |
    v
React calls Tauri invoke('respond_permission', { sessionId, behavior, updatedInput })
    |
    v
Rust writes response to sidecar stdin
    |
    v
Node.js sidecar resolves pending canUseTool Promise
    |
    v
Agent SDK continues or aborts tool use

(No timeout on user decisions -- the Promise holds indefinitely)
```

### 2.3 File System Layout

```
vantage/
├── src/                          # React frontend
│   ├── components/
│   │   ├── layout/               # IDELayout, ActivityBar, StatusBar, Sidebar
│   │   ├── editor/               # MonacoWrapper, TabBar, Breadcrumbs
│   │   ├── terminal/             # TerminalPanel, TerminalTab
│   │   ├── chat/                 # ChatPanel, MessageList, MessageBubble
│   │   ├── agents/               # AgentDashboard, KanbanBoard, AgentCard
│   │   ├── diff/                 # DiffViewer, InlineDiff, MultiFileDiff
│   │   ├── permissions/          # PermissionDialog, SecurityLog
│   │   ├── files/                # FileExplorer, FileTree, FileNode
│   │   ├── git/                  # GitPanel, BranchSelector, DiffStats
│   │   ├── settings/             # SettingsDialog, ThemePicker
│   │   └── shared/               # Loading, ErrorBoundary, CommandPalette
│   ├── stores/
│   │   ├── conversation.ts       # Zustand: messages, streaming state
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
│   │   ├── paths.ts              # Path normalization utilities
│   │   └── theme.ts              # LCH color generation, theme switching
│   ├── App.tsx
│   └── main.tsx
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/             # Tauri IPC command handlers
│   │   │   ├── session.rs        # create_session, send_message, interrupt
│   │   │   ├── terminal.rs       # spawn_terminal, write_terminal, resize
│   │   │   ├── files.rs          # read_file, write_file, file_tree
│   │   │   ├── git.rs            # git_status, git_diff, git_log
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
│   │   │   ├── operations.rs     # git2 + shell-out hybrid
│   │   │   └── worktree.rs       # Worktree management for agents
│   │   ├── db/
│   │   │   └── store.rs          # SQLite via rusqlite
│   │   └── prerequisites.rs      # First-launch dependency checks
│   ├── sidecar/
│   │   └── bridge.js             # Node.js Agent SDK bridge
│   ├── capabilities/
│   │   └── main-window.json      # Tauri ACL permissions
│   └── Cargo.toml
│
├── public/
│   └── fonts/
│       └── JetBrainsMono/        # Bundled editor font
│
├── tauri.conf.json
├── vite.config.ts
├── package.json
└── CLAUDE.md                     # Project instructions for Claude Code
```

### 2.4 State Management Strategy

**Zustand stores organized by domain, not by feature:**

| Store | Responsibility | Update Source |
|-------|---------------|--------------|
| `conversation` | Messages, streaming deltas, thinking blocks, tool calls per session | Tauri events from sidecar |
| `sessions` | Active session list, session metadata, history | Tauri commands (list/resume) |
| `agents` | Multi-agent kanban state, task cards, agent status, conflict matrix | Filesystem watching of `~/.claude/teams/` |
| `editor` | Open files, tab order, dirty state, cursor positions | Monaco Editor events |
| `layout` | Panel sizes, sidebar visibility, active activity bar item | User interaction, persisted via Tauri Store plugin |
| `settings` | Theme, font size, keybindings, permission rules | Rust-side settings store |

**Key patterns:**

- **Delta accumulation**: `stream_event` deltas are accumulated in the `conversation` store. Components read accumulated blocks, not individual deltas. This prevents render thrash (file 06 sec. 17, Decision 5).
- **Selector-based subscriptions**: Components subscribe to specific slices of state via Zustand selectors to minimize re-renders during high-frequency streaming.
- **Optimistic UI**: Permission dialogs and terminal input use optimistic updates with rollback on error.
- **Persistence**: Layout and settings stores persist to Tauri's Store plugin. Session data persists via SQLite.

### 2.5 IPC Patterns Between Layers

| Direction | Mechanism | Use Cases |
|-----------|-----------|-----------|
| React -> Rust | Tauri **Commands** (`invoke()`) | send_message, respond_permission, write_terminal, read_file, git_status |
| Rust -> React | Tauri **Events** (`emit()`) | file_changed, agent_status_update, settings_changed |
| Rust -> React (streaming) | Tauri **Channels** | terminal_output, agent_message_stream, file_tree_updates |
| Rust -> Node.js sidecar | stdin NDJSON | send_message, respond_permission, interrupt, configure |
| Node.js sidecar -> Rust | stdout NDJSON | agent_message, permission_request, stream_delta, result |

**Performance priorities:**
- Terminal I/O: Channels (highest throughput, guaranteed ordering)
- Claude streaming: Channels (high throughput)
- File changes: Events (low frequency, small payloads)
- User actions: Commands (request/response, type-safe)

---

## 3. Feature Priority Matrix

### P0: Must Have for 1.0 (Cannot Ship Without These)

These are table-stakes features. Without them, Vantage cannot replace Cursor or even stand as a credible Claude Code GUI.

| # | Feature | Source Files | Notes |
|---|---------|-------------|-------|
| 1 | **Single Claude Code chat session** | 01, 02, 06 | Streaming text, thinking blocks, tool call visualization. The core interaction loop. |
| 2 | **Integrated terminal** (xterm.js + ConPTY) | 03, 07 | PowerShell, Git Bash, CMD. At least 2 tabs. |
| 3 | **Monaco code editor** with tabs and split views | 03, 05 | Open files from chat, from file tree, from Claude's edits. Syntax highlighting, find/replace. |
| 4 | **File explorer** with lazy-loading tree | 03, 05 | Respects .gitignore. Open, rename, delete. Drag to editor. |
| 5 | **Command palette** (Cmd+Shift+P / Ctrl+Shift+P) | 05 | Commands, files, symbols modes. Non-negotiable IDE UX pattern. |
| 6 | **Permission/approval dialog** | 02, 05, 06 | Three-tier: ask, allow-for-session, pattern rules. Color-coded risk levels. Diff preview for edits. |
| 7 | **Inline diff for AI edits** | 05 | Per-hunk accept/reject. Green/red highlighting. "Accept All" / "Reject All" per file. |
| 8 | **Session management** | 02, 06 | List, resume, continue, fork sessions. Session history browser. |
| 9 | **Dark theme** | 05 | Catppuccin Mocha-inspired. Not pure black. Proper text hierarchy. |
| 10 | **Essential keybindings** (Tier 1 from file 05) | 05 | Cmd+B sidebar, Cmd+J panel, Cmd+` terminal, Cmd+W close tab, Cmd+S save, etc. |
| 11 | **Streaming output display** | 05, 06 | Token-by-token rendering, auto-scroll, stop button, thinking indicator with elapsed time. |
| 12 | **Cost/token tracking** in status bar | 01, 02 | Per-session and cumulative. Read from `result` messages. |
| 13 | **First-launch prerequisite check** | 07 | Git for Windows, Claude Code CLI, WebView2 version, long paths, PATH validation. |
| 14 | **Basic git integration** | 03 | Branch name in status bar, git status indicators on files. |

### P1: Should Have for 1.0 (Makes Vantage Genuinely Better Than Cursor)

These features differentiate Vantage from existing tools and justify its existence.

| # | Feature | Source Files | Notes |
|---|---------|-------------|-------|
| 15 | **Multi-session parallel agents** | 00, 01, 04 | Multiple Claude sessions running simultaneously. Each in its own panel or tab. Status overview. |
| 16 | **Agent kanban board** | 04, 05 | Task cards with status columns (Backlog, In Progress, Review, Done). Drag-and-drop. File count, cost per agent. |
| 17 | **Git worktree isolation per agent** | 04, 07 | Automatic worktree creation when spawning agents. Same-volume validation on Windows. Disk usage tracking. |
| 18 | **Conflict detection** (Clash integration) | 04 | Run `clash status --json` periodically. Display conflict matrix in sidebar. Pre-write hook warns before conflicts. |
| 19 | **Multi-file diff review panel** | 05 | Tree view of all changed files with change counts. Each expandable to show diff. "Viewed" checkmark per file. |
| 20 | **System notifications for agent events** | 05 | System tray: task completed, error, needs permission, stalled. Badge count on taskbar. Priority levels. |
| 21 | **CLAUDE.md editor** with live preview | 01 | Opcode proved this is highly valued. Visual editing of project instructions. |
| 22 | **MCP server management UI** | 01, 02 | Visual configuration and status of MCP servers. Connect/disconnect/reconnect. |
| 23 | **Agent timeline view** | 05 | Chronological event stream per agent. File reads, edits, commands with timestamps. |
| 24 | **Search across project** (Ctrl+Shift+F) | 05 | Regex support. Results panel. Click to navigate. |

### P2: Nice to Have (Post-1.0 Polish)

| # | Feature | Source Files | Notes |
|---|---------|-------------|-------|
| 25 | **Light theme** | 05 | Catppuccin Latte-inspired. |
| 26 | **High contrast theme** | 05 | WCAG AAA. 7:1+ contrast. |
| 27 | **Vim keybinding mode** | 02, 05 | Claude Code has full vim mode internally. Vantage should too. |
| 28 | **Floating windows / popout** | 05 | Drag editor tabs to floating windows. Multi-monitor support. |
| 29 | **Theme customization** via JSON settings | 05 | LCH color system with 3 variables (base, accent, contrast). |
| 30 | **Session search and filtering** | 02 | Full-text search across session history. Tag and filter. |
| 31 | **LSP integration** for language intelligence | 03 | Spawn language servers from Rust, bridge to Monaco via Tauri IPC. |
| 32 | **Git log/blame/stash UI** | 03 | Visual git history. Inline blame annotations. |
| 33 | **Checkpoint/restore** for agent changes | 01, 05 | Opcode's timeline/checkpoint system. Branch and restore session states. |
| 34 | **Auto-update** via GitHub Releases | 03, 07 | Tauri updater plugin + NSIS. Code signing with OV cert. |
| 35 | **Usage analytics dashboard** | 01 | Per-model cost tracking, token usage trends. |

### P3: Future Vision (Multi-Agent Orchestration Dream)

| # | Feature | Source Files | Notes |
|---|---------|-------------|-------|
| 36 | **Coordinator/specialist/verifier agent hierarchy** | 04 | Coordinator on Opus, specialists on Sonnet. Role templates. |
| 37 | **Sequential merge queue with quality gates** | 04 | Auto-run tests/lint/security per agent branch before merge. AI code review step. |
| 38 | **Agent tree view** (hierarchical) | 04, 05 | Parent-child agent relationships. Expandable subtask trees. |
| 39 | **Role-based agent routing** | 04 | AGENTS.md routing rules. Map task types to agent configurations. Model routing per task complexity. |
| 40 | **Embedded browser preview** | 01, 04 | Like Vibe Kanban and Nimbalyst. Preview running dev server with devtools. |
| 41 | **BMAD-style document sharding** | 04 | Chunk large specs. Step-file workflows. Menu-driven continuation. |
| 42 | **Verification dashboard** | 04 | Pass/fail per quality gate per agent branch. Test coverage, lint status, review status. |
| 43 | **Mobile companion** (PWA) | 01 | Nimbalyst has iOS. Companion has PWA. Remote session monitoring. |
| 44 | **Design mode** (point-and-prompt) | 05 | Like Cursor 3's design mode. Click UI elements, type changes. |
| 45 | **Background cloud agents** | 05 | Agents running in cloud, opening PRs when done. Like Cursor 3 / Claude Code Web. |

---

## 4. Lessons From Existing Projects

### Lesson 1: Don't Be a Chat Wrapper

**Source**: Files 00, 01 (community sentiment analysis)

The community is actively moving from "chat wrapper" to "workspace." Opcode (21.3k stars) succeeded because it offered checkpoints, analytics, MCP management, and CLAUDE.md editing -- not just a nicer chat UI. Caudex (95 stars) focused narrowly on terminal enhancement and stayed small. Vantage must be a workspace from day one.

### Lesson 2: The SDK Is the Only Sane Integration Path

**Source**: Files 01, 06

Every project that integrated with Claude Code via filesystem scraping (Opcode, claude-devtools) ended up read-only and fragile. Every project that used `--sdk-url` (Companion) built on undocumented APIs. The Claude Agent SDK is the officially supported path, used by Anthropic's own desktop app. It is the only integration that provides bidirectional control, permission callbacks, session management, and structured types. The Node.js sidecar cost (~50MB overhead) is trivially worth it.

### Lesson 3: Opcode Proves Tauri Works, But Stalling Kills

**Source**: File 01 (Opcode analysis)

Opcode's Tauri 2 + React + Rust stack delivered 15-30MB binaries with native performance. Its checkpoint/timeline system, usage analytics, and MCP management proved the feature set works. But development stalled in August 2025 (7+ months of silence despite 262 open issues). Community trust evaporated. **Lesson**: Consistent shipping cadence matters more than feature completeness. Ship early, update weekly.

### Lesson 4: Companion Has the Best Protocol Understanding

**Source**: File 01 (Companion analysis)

Companion's `WEBSOCKET_PROTOCOL_REVERSED.md` is the definitive reference for Claude Code's wire protocol. Their NDJSON streaming, permission gating, session recovery with `--resume`, and recording system are all best-in-class. **Steal**: Their session persistence model, reconnection logic, and the dual-WebSocket architecture (one for browser, one for CLI). **Avoid**: Their browser-only approach -- desktop integration is essential.

### Lesson 5: cmux Proves Terminal-First Is a Dead End for an IDE

**Source**: File 01 (cmux analysis)

cmux (12.5k stars) built the best terminal experience possible with Swift/AppKit + GPU-accelerated Ghostty rendering. But it cannot access Claude Code's internal state (no token/cost visibility), cannot intercept tool calls, and cannot provide inline diffs. **Lesson**: A pure terminal wrapper, no matter how well-built, cannot provide IDE-level features. Vantage must intercept the protocol, not just display the terminal.

### Lesson 6: Event Sourcing Is the Right Data Model

**Source**: File 01 (Kanna analysis), File 02 (JSONL format)

Kanna's event sourcing + CQRS architecture (append-only JSONL, snapshot compaction, derived views) is genuinely innovative. Claude Code itself uses the same pattern -- append-only JSONL session files with UUID-linked records. Vantage should embrace this: store all conversation events as immutable records, derive UI state from them, compact when logs exceed thresholds.

### Lesson 7: 3-5 Agents Is the Sweet Spot

**Source**: File 04 (academic research, Augment Code patterns)

Google/MIT research shows diminishing returns above the 45% single-agent accuracy threshold. Augment Code says 3-4 parallel agents is the practical ceiling when a single reviewer integrates results. Agent Teams' own docs recommend 3-5 teammates. Gas Town's "$100/hour" burn rate at peak shows the cost of over-parallelization. **Lesson**: Design the UI for 3-5 agents comfortably, support up to 10, but don't optimize for 20+.

### Lesson 8: Verification Is the Real Bottleneck

**Source**: File 04 sec. 9

96% of developers don't fully trust AI code. Code review time increases 91% with AI-generated code. PRs increase 98% in volume. The bottleneck is not generation speed -- it's review throughput. Vantage must make review fast: inline diffs with per-hunk accept/reject, multi-file review panels, automated quality gates, and AI-assisted code review before human eyes see the PR.

### Lesson 9: File Ownership Prevents 80% of Merge Conflicts

**Source**: File 04 (Augment Code Pattern 2, Agent Teams best practices)

The #1 multi-agent failure mode is two agents editing the same file. Augment Code, Gas Town, and Claude Code Agent Teams all converge on the same answer: assign file ownership at task decomposition time. Vantage should show file ownership in the file explorer (colored dots per agent) and warn when two agents touch the same file.

### Lesson 10: Nimbalyst's Visual Workspace Is the Right Paradigm

**Source**: File 01 (Nimbalyst analysis)

Nimbalyst's 7+ visual editors (WYSIWYG markdown, Monaco code, CSV, UI mockup, Excalidraw, ERD, Mermaid) and kanban session management prove that the future of AI coding tools is visual workspaces, not chat terminals. They're closed-source and undersized (116 stars), but the feature concepts are correct. Vantage should pursue the same paradigm with open-source execution.

### Lesson 11: CodePilot Shows Feature Bloat Is the Enemy

**Source**: File 01 (CodePilot analysis)

CodePilot tried to be everything: 17+ AI providers, Discord/Telegram/WeChat bridges, generative UI, skills marketplace, three interaction modes. Result: 248 open issues, stale maintenance, BSL-1.1 license uncertainty, and macOS builds not even notarized. **Lesson**: Do fewer things excellently. Claude Code only. One integration path. One design language.

### Lesson 12: The Diff Review Loop Is the Killer Feature

**Source**: File 04 (Vibe Kanban analysis)

Vibe Kanban's inline diff review with comments sent directly to the agent creates a tight feedback loop: agent produces code, human reviews diff, human sends inline comments, agent iterates without losing context. This is more powerful than accept/reject because it provides directional feedback. Vantage should implement this: inline comments on agent diffs that become follow-up prompts.

### Lesson 13: Don't Build Your Own Agent Orchestration Protocol

**Source**: File 04 (Agent Teams analysis)

Claude Code Agent Teams already provides file-based coordination with task JSON, mailbox messaging, flock() locking, dependency tracking, and hook-based quality gates. Vantage should wrap this protocol with a GUI, not replace it. Watch `~/.claude/teams/` and `~/.claude/tasks/` for real-time UI updates. The file-based design is debuggable and transparent.

### Lesson 14: Deferred Tool Loading Saves Context

**Source**: File 02 sec. 6

Claude Code only loads tool names at session start; full schemas are loaded on-demand via `ToolSearchTool`. This saves significant context window space. Vantage's MCP tool configuration should be aware of this pattern -- don't force-load all MCP tool schemas upfront.

---

## 5. Critical Risks and Mitigations

### Risk 1: Agent SDK Breaking Changes (HIGH)

**Threat**: The Claude Agent SDK is pre-1.0 (v0.2.x). Anthropic could change the API surface, message types, or spawning behavior in any release.

**Mitigation**:
- Pin the SDK version in package.json with exact version (`0.2.62`, not `^0.2.62`)
- Abstract the SDK behind a Vantage-specific adapter layer in the Node.js sidecar
- Test against SDK updates in a staging environment before adopting
- Maintain familiarity with the raw stream-json protocol as a fallback
- Monitor `@anthropic-ai/claude-agent-sdk` releases and changelog

### Risk 2: Windows ConPTY Escape Sequence Swallowing (HIGH)

**Threat**: ConPTY filters unrecognized VT escape sequences. Shell integration features relying on custom DCS/OSC codes will silently break. Warp and Windows Terminal both encountered this.

**Mitigation**:
- Do not rely on custom DCS codes through ConPTY
- Use OSC codes (which mostly pass through) with forced flushing
- Implement periodic ConPTY state resets
- Test terminal features extensively on Windows before assuming they work
- Consider running Claude Code through the Agent SDK (not through a terminal PTY) for the chat interaction -- use the terminal only for user shell access

### Risk 3: Claude Code Sandbox Bash on Windows (HIGH)

**Threat**: Claude Code v2.1.59+ uses a bundled linux-gnu sandbox bash on Windows that lacks standard Unix utilities (grep, find, sed) and ignores `CLAUDE_CODE_SHELL`. Many commands fail silently.

**Mitigation**:
- Use the Agent SDK path (which spawns Claude Code itself) rather than trying to control which bash Claude uses
- Ensure Git for Windows is on PATH so Claude Code can find utilities
- Set `CLAUDE_CODE_GIT_BASH_PATH` explicitly in the environment passed to the sidecar
- Implement first-launch detection to verify Git Bash availability
- Monitor Claude Code release notes for sandbox behavior changes

### Risk 4: WebView2 Version Uncertainty (MEDIUM)

**Threat**: WebView2 auto-updates via Evergreen. You cannot predict which Chromium version users have. A WebView2 update could break CSS features, WebGL behavior, or JavaScript APIs you depend on.

**Mitigation**:
- Use feature detection, not version detection
- Test against the last 3 stable WebView2 versions before each release
- Avoid bleeding-edge CSS/JS features
- Set minimum WebView2 version in NSIS installer config
- Maintain a list of WebView2 versions that have known issues

### Risk 5: Multi-Agent Disk Space Exhaustion (MEDIUM)

**Threat**: Git worktrees consume significant disk space. A 2GB codebase can use 9.82 GB in a 20-minute multi-agent session (file 07 sec. 5.4). Windows NTFS has no built-in compression for worktrees.

**Mitigation**:
- Display disk usage per worktree in the agent dashboard
- Implement automatic cleanup of completed/killed agent worktrees
- Warn when available disk space drops below 10 GB
- Provide one-click worktree cleanup command
- Consider limiting default simultaneous agents to 3

### Risk 6: Anthropic Releases a Superior Desktop App (HIGH)

**Threat**: Claude Code Desktop already exists (Electron). Anthropic could ship a polished first-party IDE that makes third-party GUIs irrelevant.

**Mitigation**:
- Differentiate on multi-agent orchestration (Anthropic's desktop app focuses on single sessions)
- Differentiate on Windows-first polish (Anthropic's app is Mac-primary)
- Open source from day one -- community value persists regardless of Anthropic's moves
- Build features Anthropic won't prioritize: multi-provider support, custom agent workflows, deep git integration
- Ship fast and iterate -- first-mover advantage in the multi-agent GUI space

### Risk 7: Node.js Sidecar Reliability (MEDIUM)

**Threat**: The sidecar process could crash, hang, or leak memory during long sessions. Orphaned Node.js processes could persist after Vantage exits.

**Mitigation**:
- Capture session_id from `system/init` immediately for crash recovery
- Implement watchdog pings (if no stdout for 60s, check process health)
- Use `AbortController` for graceful shutdown
- On Vantage exit, enumerate and kill all child processes
- Resume sessions via `options.resume` after sidecar restart
- Bounded channels (capacity ~1000) prevent OOM from backpressure

### Risk 8: Performance Under Multiple Concurrent Agents (MEDIUM)

**Threat**: 5 simultaneous agent sessions = 5 Node.js sidecar processes + 5 Claude API streams + 5 git worktrees + potential terminal PTYs. Memory and CPU could spike.

**Mitigation**:
- Profile memory usage early with 5 concurrent sessions
- Each sidecar process should be ~50MB; total 250MB is acceptable
- Use Zustand selectors aggressively to minimize React re-renders during concurrent streaming
- Consider a shared sidecar with multiplexed sessions (future optimization)
- Set default max concurrent agents to 3, configurable up to 10
- Show resource usage (CPU, memory) in status bar

---

## 6. Windows Gotchas Checklist

These are extracted from file 07 and organized by severity. Every item here MUST be addressed before shipping to Windows users.

### Must-Fix Before MVP

- [ ] **Path normalization module**: Create a Rust utility that converts between Windows (`C:\Users\...`), POSIX (`/c/Users/...`), and UNC (`\\?\C:\...`) paths. Every IPC boundary must go through this. Claude Code's file tools expect Windows paths; its Bash tool uses Git Bash POSIX paths.

- [ ] **Git Bash detection and configuration**: At first launch, locate `bash.exe` from Git for Windows. Set `CLAUDE_CODE_GIT_BASH_PATH` in the environment passed to all Claude Code processes. Fail gracefully with a clear installation prompt if not found.

- [ ] **ConPTY window flash suppression**: Use `CREATE_NO_WINDOW` or `DETACHED_PROCESS` flags when spawning ConPTY processes. The brief cmd window flash is jarring.

- [ ] **File locking retry logic**: Wrap all file I/O (read, write, rename, delete) in retry logic: 3 attempts at 100ms, 500ms, 2000ms delays. Surface clear error messages when lock conflicts persist ("File is locked by another process").

- [ ] **WebView2 presence and version check**: Verify WebView2 is installed and meets minimum version. Windows 11 always has it, but verify anyway. Use feature detection in JavaScript, not version sniffing.

- [ ] **Line ending configuration**: Generate `.gitattributes` with `* text=auto eol=lf` for new Vantage-managed projects. Configure git to use LF internally. Handle CRLF/LF display correctly in the diff viewer.

### Must-Fix Before Stability Release

- [ ] **File watching resilience**: Use `notify` crate with `notify-debouncer-full` at directory level. Supplement with polling (5-second interval) for `~/.claude/` directory changes. Accept that `ReadDirectoryChangesW` drops events under load.

- [ ] **Long path detection**: Check registry `LongPathsEnabled`. Warn users if disabled. Deep `node_modules` paths commonly exceed 260 characters.

- [ ] **SmartScreen handling**: Start with OV code signing certificate. Submit binary to Microsoft for reputation review. Document the SmartScreen warning in installation instructions until reputation builds.

- [ ] **Git performance optimization**: Recommend `core.fsmonitor=true` in Vantage setup wizard. This dramatically speeds up `git status` on large repos via the filesystem monitor daemon.

- [ ] **Worktree same-volume validation**: Before creating git worktrees for agents, verify the target path is on the same NTFS volume as the main repo. NTFS hardlinks (used by worktrees) only work within a volume.

- [ ] **Antivirus documentation**: Document recommended exclusions: Vantage installation directory, project directories, `~/.claude/`, `.git/` directories. AV interference causes ConPTY connection failures, file watching delays, and git lock failures.

### Good-to-Know (Handle Gracefully)

- [ ] **Case sensitivity warnings**: Detect projects with case-conflicting filenames and warn. Don't auto-enable per-directory case sensitivity.

- [ ] **Network drive limitations**: File watching buffer limited to 64KB on network drives. Display a warning when project is on a mapped drive.

- [ ] **Multiple Claude Code installations**: `where.exe claude` to detect conflicts. Claude Desktop app may override the CLI via WindowsApps PATH priority.

- [ ] **Environment variable inheritance**: Vantage must read current PATH at startup. If user installs Git for Windows after launching Vantage, it won't be visible until restart. Detect and prompt.

---

## 7. Open Design Questions

These questions could not be answered by the research alone. They require design-phase decisions, prototyping, or user testing.

### Q1: One Sidecar Per Session vs. Shared Sidecar?

The Agent SDK's `query()` returns an async generator per session. Running 5 sessions means 5 generator loops. Should each run in its own Node.js process (simpler, more isolated, ~50MB each) or should a single Node.js process manage multiple sessions (less overhead, more complex, single point of failure)?

**Recommendation**: Start with one sidecar per session. The memory cost is acceptable (250MB for 5 sessions). Revisit shared sidecar as an optimization if users report memory issues.

### Q2: Editor-First or Chat-First Layout?

Should the default layout give more space to the code editor (like VS Code with Copilot in sidebar) or to the chat panel (like Cursor's Composer)?

**Recommendation**: Editor-first with chat as collapsible secondary sidebar (right side). Developers spend most time reading and editing code, not typing prompts. The chat expands on demand. This matches VS Code's secondary sidebar pattern and Zed's agent panel placement.

### Q3: How to Handle Claude Code Updates?

Claude Code CLI updates frequently. The Agent SDK spawns whatever `claude` binary is on PATH. Should Vantage:
(a) Pin a specific Claude Code version?
(b) Use whatever is installed?
(c) Bundle its own copy?

**Recommendation**: (b) Use whatever is installed, but validate the version at startup. Display the Claude Code version in the status bar. Warn if the version is more than 2 weeks old. Don't bundle -- it creates a maintenance nightmare and may violate Anthropic's distribution terms.

### Q4: How Deeply to Integrate with Agent Teams?

Claude Code Agent Teams uses file-based coordination. Vantage could:
(a) Passively watch the filesystem and display state (read-only overlay)
(b) Actively create/modify team files to orchestrate agents from the GUI
(c) Bypass Agent Teams entirely and implement custom orchestration

**Recommendation**: Start with (a), graduate to (b). Passive file watching is safe and non-invasive. Once the GUI reliably reflects Agent Teams state, add controls to create teams, assign tasks, and send messages by writing to the same JSON files. Never bypass the protocol -- it would fork from Claude Code's own semantics.

### Q5: Should Vantage Support Multiple AI Providers?

CodePilot supports 17+ providers. AionUi supports 15+ CLIs. Should Vantage?

**Recommendation**: No. Claude Code only. Multi-provider support is a distraction that dilutes quality. CodePilot's 248 open issues demonstrate the maintenance cost. Vantage's value proposition is the best possible Claude Code IDE, not a generic AI wrapper. If users want other providers, they can use other tools.

### Q6: What Default Permission Mode?

Claude Code supports: default (ask), acceptEdits, bypassPermissions, dontAsk, plan, auto. What should Vantage default to?

**Recommendation**: `default` mode (ask for everything not pre-approved). Safety is paramount for trust. Pre-configure common safe patterns in allowed rules: `Read *`, `Glob *`, `Grep *`, `Bash(git status)`, `Bash(git diff)`, `Bash(git log)`, `Bash(npm test)`, `Bash(npm run lint)`. Let users escalate to `acceptEdits` via a prominent toggle.

### Q7: How to Handle the "Thinking" Display?

Claude's extended thinking can run for 30+ seconds. How should Vantage display this?

**Recommendation**: Collapsible "Thinking..." block with elapsed timer. Auto-expanded while thinking, auto-collapsed when response starts streaming. Click to expand and see reasoning chain. Use muted styling (smaller font, different background). This is the emerging standard across all AI IDEs (file 05 sec. 2.3).

### Q8: SQLite vs. Filesystem for Vantage's Own Data?

Vantage needs to store: session metadata, layout preferences, permission rules, usage stats, agent configurations. SQLite (like Opcode/CodePilot) or filesystem (like Claude Code itself)?

**Recommendation**: SQLite via rusqlite for structured data (sessions, stats, configurations). Filesystem for user-editable configuration (settings.json, keybindings.json). This matches the pattern established by both VS Code (SQLite for state, JSON for settings) and Claude Code's internals.

### Q9: When to Show the Multi-Agent View?

The kanban board and agent dashboard are complex UI. Should they be:
(a) Always visible as an activity bar section
(b) Hidden until the user starts a second agent
(c) A separate "mode" the user explicitly enters

**Recommendation**: (a) Always visible as an activity bar icon, but the panel starts empty with a welcome/create-first-agent CTA. The kanban view should feel as natural as the file explorer -- always one click away. Hiding it creates friction; a separate mode creates cognitive overhead.

### Q10: How to Handle Rate Limits and API Errors?

Claude Code has built-in retry logic (up to 10 retries with exponential backoff). The SDK surfaces `system/api_retry` events. How should Vantage present these?

**Recommendation**: Show a non-blocking toast notification: "Rate limited. Retrying in 5s (attempt 2/10)." If all retries fail, show a blocking error dialog with: error type, suggestion (check API key, check billing, wait and retry), and a retry button. Never silently swallow API errors.

---

## Summary

Vantage's path is clear: Tauri v2 + React 19 + TypeScript + Claude Agent SDK via Node.js sidecar. The tech stack has been validated by Opcode (Tauri), Companion (Agent SDK protocol), Kanna (event sourcing), and Anthropic's own desktop app (the full architecture). The feature priority is: nail the single-session IDE experience first (P0), then add multi-agent orchestration (P1), then polish and differentiate (P2/P3).

The biggest risks are SDK instability, Windows ConPTY quirks, and the possibility of Anthropic shipping a superior first-party app. The biggest opportunity is that no one has yet built a genuinely great multi-agent orchestration GUI for Claude Code on Windows. The market is wide open.

Ship early. Ship weekly. Don't be a chat wrapper.
