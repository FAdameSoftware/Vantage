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
    prerequisites.rs    # First-launch checks
    mcp.rs              # MCP config read/write
    merge_queue.rs      # Quality gates, merge, rebase
    checkpoint.rs       # Git tag checkpoints
    analytics.rs        # Usage analytics aggregation
```

## Commands

```bash
npm run dev           # Vite dev server only (no Tauri)
npm run tauri dev     # Full Tauri dev mode (needs cargo on PATH)
npm run build         # Vite production build
npx vitest run        # Run unit tests (337 tests)
npx playwright test   # Run E2E tests (needs Vite server running)
npm run lint:security # Semgrep security scan (TypeScript + React rules)
```

## Key Patterns

- **Tauri IPC**: All Rust commands use tauri-specta for type-safe bindings. Invoke with `import { invoke } from "@tauri-apps/api/core"`.
- **Tauri events**: File changes, Claude messages use `import { listen } from "@tauri-apps/api/event"`.
- **Theme**: Catppuccin Mocha (dark default), Latte (light), High Contrast. All colors via CSS custom properties (`--color-base`, `--color-text`, etc.).
- **Mock layer**: `src/lib/tauriMock.ts` mocks all Tauri APIs for browser-based testing. Auto-activates when not in Tauri.
- **Error boundary**: Wraps the entire app. Shows error message instead of blank screen.

## Testing

- Unit tests: `src/stores/__tests__/` — Vitest with jsdom
- E2E tests: `e2e/vantage.spec.ts` — Playwright against browser mock
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

## Windows Notes

- Cargo must be on PATH for `npm run tauri dev` (add `$env:USERPROFILE\.cargo\bin` to PATH)
- ConPTY for terminal emulation (via portable-pty)
- Git Bash required for Claude Code CLI
- File paths normalized to forward slashes at IPC boundary
