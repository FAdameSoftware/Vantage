# Vantage

A desktop IDE built around Claude Code CLI using Tauri v2 + React 19 + TypeScript.

## Architecture

- **Desktop shell**: Tauri v2 (Rust backend + WebView2 on Windows)
- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + shadcn/ui v4
- **State**: Zustand v5 (layout, editor, settings, conversation, agents stores)
- **Editor**: Monaco Editor via @monaco-editor/react
- **Terminal**: xterm.js 5.x with WebGL renderer + tauri-plugin-pty (ConPTY)
- **Claude integration**: Spawns `claude` CLI with `--output-format stream-json`

## Project Structure

```
src/                    # React frontend
  components/
    layout/             # IDELayout, ActivityBar, StatusBar, sidebars
    editor/             # MonacoEditor, EditorTabs, DiffViewer, MarkdownPreview
    terminal/           # TerminalInstance, TerminalTabs
    chat/               # ChatPanel, MessageBubble, ToolCallCard, CodeBlock
    agents/             # KanbanBoard, AgentTreeView, AgentTimeline, VerificationDashboard
    files/              # FileExplorer, FileTreeNode, FileIcon
    search/             # SearchPanel
    settings/           # SettingsPanel, ClaudeMdEditor, McpManager, SpecViewer
    permissions/        # PermissionDialog
    diff/               # MultiFileDiffReview, DiffFileTree
    analytics/          # UsageDashboard, CostChart, ModelDistribution
    shared/             # CommandPalette, PrerequisiteCheck, ErrorBoundary
    dev/                # DevPanel (dev mode only)
  stores/               # Zustand stores (layout, editor, settings, conversation, agents, etc.)
  hooks/                # React hooks (useClaude, useTerminal, useFileTree, useGitStatus, etc.)
  lib/                  # Utilities (protocol types, tauriMock, theme, spec parser, etc.)
src-tauri/              # Rust backend
  src/
    files/              # File tree, watcher, CRUD operations
    terminal/           # PTY manager, shell detection
    claude/             # Process manager, protocol, session discovery
    git.rs              # Git operations (branch, status, log, blame)
    search.rs           # Project search (ripgrep + ignore fallback)
    worktree.rs         # Git worktree management
    workspace.rs        # Workspace file I/O (~/.vantage/)
    indexer.rs          # Codebase indexing
    plugins.rs          # Plugin discovery and management
    session_search.rs   # JSONL session search
    prerequisites.rs    # First-launch checks
    mcp.rs              # MCP config read/write
    merge_queue.rs      # Quality gates, merge, rebase
    checkpoint.rs       # Git tag checkpoints
    analytics.rs        # Usage analytics aggregation
    claude_settings.rs  # Read/write ~/.claude/settings.json
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-04-04-vantage-design.md`
- Sprint plans: `docs/superpowers/plans/`
- Testing strategy: `docs/testing/testing-strategy.md`
- Workspace design: `docs/specs/workspace-model-design.md`
- Audit reports: `External-Teams/Audit-Team/`
- Research: `research/` (10 documents, 480KB+)

## Commands

```bash
npm run dev           # Vite dev server only (no Tauri)
npm run tauri dev     # Full Tauri dev mode (needs cargo on PATH)
npm run build         # Vite production build
npx vitest run        # Run frontend tests (355 tests, 22 files)
npx playwright test   # Run E2E tests (needs Vite server running)
npm run lint:security # Semgrep security scan (TypeScript + React rules)
cd src-tauri && cargo test  # Run Rust backend tests (76 tests)
```

## Features

### Editor
- Monaco Editor with Catppuccin Mocha/Latte/High Contrast themes
- Cross-file TypeScript intelligence (addExtraLib for project files)
- Inline AI edit (Ctrl+K — select code, type prompt, get diff)
- Editor split groups (Split Right / Split Down)
- Markdown preview (split view for .md files)
- Interactive breadcrumbs (clickable segments, sibling file dropdown)
- Minimap with click navigation, bracket pair colorization
- Vim mode toggle, format on save (Prettier)
- Diff viewer with accept/reject for Claude's edits

### Chat / Claude Integration
- Claude Code CLI via stream-json protocol
- @-mentions (@file, @selection, @terminal, @git, @folder)
- Image/screenshot paste (clipboard + drag-and-drop)
- 26+ slash commands with local handlers
- /btw quick question overlay (zero-context-cost)
- Inline AI edit (Ctrl+K)
- Ultrathink toggle, effort level selector, plan mode
- Targeted /compact with preservation input
- Permission dialog with risk-level color coding
- Session timeline with visual checkpoints
- Activity trail (files Claude touched)
- Token attribution per message (expandable cost breakdown)
- Conversation search, message editing, response regeneration
- Session management (resume, search, fork)

### Terminal
- xterm.js with WebGL renderer + ConPTY
- Multiple tabs with shell picker (PowerShell, Git Bash, CMD)
- Terminal split view
- Ctrl+F find bar
- Command blocks (group output by command, copy/re-run)
- AI command suggestions on error

### Multi-Agent
- Kanban board (Backlog/In Progress/Review/Done) with drag-and-drop
- Agent hierarchy (coordinator/specialist/verifier roles)
- Agent tree view with status propagation
- Git worktree isolation per agent
- Merge queue with quality gates
- Verification dashboard
- Writer/Reviewer one-click workflow
- File conflict detection with ownership indicators

### Project Management
- Workspace model (per-project state persistence)
- File explorer with lazy-loading, context menus, git status
- Project-wide search with regex + replace in files
- Git integration (branch, status, log, blame, stage/commit/push/pull)
- Source Control panel
- Codebase indexing (language distribution, dependencies)

### Settings & Configuration
- Searchable preferences editor
- Keybindings viewer/editor with custom overrides
- Hooks editor (CRUD for Claude Code hooks)
- CLAUDE.md editor with live preview
- MCP server management
- Plugin discovery + store browser
- Spec Viewer (BMAD document sharding)

### UI
- Catppuccin Mocha (dark), Latte (light), High Contrast themes
- Custom Windows title bar with window controls
- Zen mode (Ctrl+Shift+Z — distraction-free editing)
- Workspace metadata sidebar (git, ports, cost, agents)
- Command palette (Ctrl+Shift+P commands, Ctrl+P files, Ctrl+G goto)
- Notification center with history
- Clickable status bar (every item has an action)
- Coding buddy widget (Inkwell the turtle)
- Usage dashboard with charts
```

## Key Patterns

- **Tauri IPC**: All Rust commands use tauri-specta for type-safe bindings. Invoke with `import { invoke } from "@tauri-apps/api/core"`.
- **Tauri events**: File changes, Claude messages use `import { listen } from "@tauri-apps/api/event"`.
- **Theme**: Catppuccin Mocha (dark default), Latte (light), High Contrast. All colors via CSS custom properties (`--color-base`, `--color-text`, etc.).
- **Mock layer**: `src/lib/tauriMock.ts` mocks all Tauri APIs for browser-based testing. Auto-activates when not in Tauri.
- **Error boundary**: Wraps the entire app. Shows error message instead of blank screen.

## Testing

- Unit tests: `src/stores/__tests__/` — Vitest with jsdom
- Component tests: `src/components/__tests__/` — Testing Library + Vitest
- Edge case tests: `src/stores/__tests__/edge-cases.test.ts`, `src/__tests__/ipc-edge-cases.test.ts`
- E2E tests: `e2e/vantage.spec.ts` — Playwright against browser mock
- Accessibility tests: `e2e/accessibility.spec.ts` — axe-core WCAG audits
- Rust tests: `src-tauri/src/` — `#[cfg(test)]` modules (path validation, git injection, merge queue)
- Visual testing: Chrome DevTools MCP tools for screenshots and interaction
- The Tauri mock layer ensures the full UI renders in a browser without Tauri

## Critical Gotchas

- **NEVER test only against mocks** — the Tauri mock layer hides IPC mismatches. Always verify with `npm run tauri dev`.
- **Tauri IPC names** — Rust fn `claude_start_session` is invoked as `invoke("claude_start_session")`. The name matches the Rust function exactly.
- **specta RC** — pinned to `=2.0.0-rc.24`. Don't use `skip_serializing_if` on specta::Type structs.
- **Cargo on Windows** — use `/c/Users/ferpu/.cargo/bin/cargo` in bash, or `$env:PATH += ";$env:USERPROFILE\.cargo\bin"` in PowerShell.
- **MCP servers on Windows** — `.mcp.json` must use `"command": "cmd", "args": ["/c", "npx", ...]` wrapper.
- **react-resizable-panels v4.9** — API uses `Group`/`Separator`, not `PanelGroup`/`PanelResizeHandle`. Don't use `useDefaultLayout` — it corrupts stored sizes.
- **Security** — validate ALL inputs at Rust boundary. Never pass user strings to `Command::new()` shell. Use arg tokenization.
- **Hardening** — do a security + integration pass every 2-3 feature phases. Don't build 9 phases without stopping.

## Workspace Model

- State persists per-project at `~/.vantage/workspaces/<base64url-encoded-path>.json`
- 8 stores are workspace-scoped (editor, conversation, agents, layout, mergeQueue, verification, usage, agentConversations)
- 1 store is global (settings — theme, font, vim mode)
- Auto-saves with 2-second debounce on store changes
- `resetToDefaults()` on all workspace stores when switching projects
- Single-instance per project — no file locking, running two Vantage windows on same project will corrupt workspace state

## Windows Notes

- Cargo must be on PATH for `npm run tauri dev` (add `$env:USERPROFILE\.cargo\bin` to PATH)
- ConPTY for terminal emulation (via portable-pty)
- Git Bash required for Claude Code CLI
- File paths normalized to forward slashes at IPC boundary
