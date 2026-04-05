# Critical Path Roadmap: Closing the Gap

This document prioritizes what Vantage should build to reach viability as a replacement for VS Code/Cursor + Claude Code Desktop. Features are ordered by **impact on adoption** and grouped into phases.

---

## Phase 0: Quick Wins (1-2 weeks each)

These are features where infrastructure already exists but UI/wiring is missing. Highest ROI.

### 0.1 Enable Monaco Built-ins
**Effort: Days | Impact: MAJOR**

Monaco Editor already has many features that Vantage may not be configuring:
- [ ] **Find/Replace in file** (Ctrl+F, Ctrl+H) — verify it works, add menu entry
- [ ] **Multi-cursor** (Alt+Click, Ctrl+D) — verify keybindings work
- [ ] **Code folding** — verify fold controls appear in gutter
- [ ] **Column/box selection** (Shift+Alt+drag) — verify
- [ ] **Select all occurrences** (Ctrl+Shift+L) — verify
- [ ] **Monaco's built-in TypeScript/JavaScript IntelliSense** — Monaco bundles a TypeScript worker that provides completions, diagnostics, and go-to-definition for TS/JS. **Verify if this is enabled.** If not, enabling it would be one of the highest-impact quick wins.

### 0.2 Wire Checkpoint UI
**Effort: 1 week | Impact: CRITICAL**

Backend already has: `create_checkpoint`, `list_checkpoints`, `restore_checkpoint`, `delete_checkpoint`
- [ ] Add checkpoint timeline in conversation panel
- [ ] "Rewind to here" button on each checkpoint
- [ ] Auto-create checkpoints before major operations
- [ ] Wire to `/rewind` command

### 0.3 Wire Session Search UI
**Effort: 1 week | Impact: MAJOR**

Backend already has: `search_sessions`, `get_session_stats`
- [ ] Add session browser panel
- [ ] Full-text search across past sessions
- [ ] Session metadata display (cost, model, duration)
- [ ] One-click resume

### 0.4 Add More Slash Commands
**Effort: 1 week | Impact: CRITICAL**

Most commands just need to send the right message/flag to the Claude CLI session:
- [ ] `/fast` — toggle fast mode
- [ ] `/effort` — set effort level
- [ ] `/export` — export conversation
- [ ] `/copy` — copy response to clipboard
- [ ] `/rename` — rename session
- [ ] `/context` — show context usage
- [ ] `/diff` — show uncommitted changes
- [ ] `/branch` — fork conversation
- [ ] `/usage` — show rate limits
- [ ] `/tasks` — list background tasks

### 0.5 Wire Plugin/Skill Discovery
**Effort: 1 week | Impact: MAJOR**

Backend already has: `list_installed_plugins`, `list_installed_skills`
- [ ] Populate ChatPanel's `installedSkills` from backend
- [ ] Show installed plugins in PluginManager with real data
- [ ] Enable `/skills` command

---

## Phase 1: Core IDE Features (2-4 weeks each)

### 1.1 Basic Git Operations UI
**Effort: 2-3 weeks | Impact: CRITICAL**

Add git operations beyond read-only views:
- [ ] **Stage/unstage files** — add Rust commands, wire to file explorer checkboxes
- [ ] **Commit dialog** — message input + staged file list + commit button
- [ ] **Branch management** — create, switch, delete from UI
- [ ] **Push/Pull/Fetch** — buttons in status bar or source control panel
- [ ] **Gutter indicators** — colored bars for changed/added/removed lines
- [ ] **Inline diff** — toggle between side-by-side and inline in diff viewer

### 1.2 @-Mentions for Chat Context
**Effort: 2 weeks | Impact: CRITICAL**

This is the #1 missing AI feature across both competitors:
- [ ] `@filename` — attach file content to message
- [ ] `@foldername` — attach directory listing
- [ ] `@selection` — attach current editor selection
- [ ] `@terminal` — attach recent terminal output
- [ ] Autocomplete dropdown when typing `@`
- [ ] Visual tags showing attached context

### 1.3 Editor Split / Groups
**Effort: 2 weeks | Impact: CRITICAL**

VS Code's split editor is heavily used:
- [ ] Split horizontally (Ctrl+\)
- [ ] Split vertically
- [ ] Drag tabs between groups
- [ ] Independent scroll positions per group
- [ ] Grid layout support

### 1.4 Replace in Files
**Effort: 1 week | Impact: MAJOR**

Search panel exists but has no replace:
- [ ] Add replace input field
- [ ] Preview replacements
- [ ] Replace one / replace all
- [ ] Undo support

### 1.5 Split Terminals
**Effort: 1 week | Impact: MAJOR**

- [ ] Split terminal pane side-by-side
- [ ] Independent PTY per split
- [ ] Resizable split divider

---

## Phase 2: Intelligence Layer (1-3 months)

### 2.1 TypeScript/JavaScript Language Intelligence
**Effort: 2-4 weeks | Impact: BLOCKER-solving**

Monaco bundles a TypeScript worker. If Vantage isn't using it, enabling it gives:
- Autocomplete for TS/JS
- Diagnostic errors/warnings
- Go to definition (within file)
- Hover information

For cross-file intelligence (project-wide), need:
- [ ] Configure Monaco's TypeScript worker with project tsconfig.json
- [ ] Feed workspace files to the TS worker via Monaco's `addExtraLib()`
- [ ] Or use `monaco-languageclient` with a full TypeScript language server

### 2.2 LSP Client for Other Languages
**Effort: 4-8 weeks | Impact: BLOCKER-solving**

For Python, Rust, Go, etc.:
- [ ] Implement `monaco-languageclient` bridge
- [ ] Rust backend manages language server processes
- [ ] WebSocket bridge between frontend Monaco and backend language servers
- [ ] Support for: Python (Pyright), Rust (rust-analyzer), Go (gopls)
- [ ] Language server auto-detection based on project files

### 2.3 Expose Claude's LSP Tool
**Effort: 1-2 weeks | Impact: MAJOR**

As a quick supplement to full LSP:
- [ ] "Go to Definition" command that invokes Claude's LSP tool via the session
- [ ] "Find References" command
- [ ] "Get Diagnostics" command
- [ ] Results displayed in Monaco (goto position, highlight references)

### 2.4 Format on Save
**Effort: 2 weeks | Impact: CRITICAL**

- [ ] Detect project formatters (prettier, eslint --fix, rustfmt, etc.)
- [ ] Run formatter on save
- [ ] Configuration for which formatter to use
- [ ] Or: use Monaco's built-in formatter APIs with language-specific formatters

---

## Phase 3: Hooks & Automation (2-4 weeks)

### 3.1 Hooks System
**Effort: 2-3 weeks | Impact: CRITICAL**

- [ ] Read hook configuration from `.claude/settings.json`
- [ ] Execute `command` handlers on events
- [ ] Execute `http` handlers on events
- [ ] Hook result handling (approve/deny/modify for PreToolUse)
- [ ] UI for viewing active hooks
- [ ] UI for configuring hooks (or use settings file)

### 3.2 Persistent Permission Rules
**Effort: 1-2 weeks | Impact: MAJOR**

- [ ] Read permission rules from settings files
- [ ] Pattern matching (`Bash(npm run *)`, `Edit(/src/**/*.ts)`)
- [ ] Apply rules before showing permission dialog
- [ ] UI for managing permission rules

### 3.3 Scheduled Tasks
**Effort: 2 weeks | Impact: MAJOR**

- [ ] `/schedule` command integration
- [ ] Scheduled task list UI
- [ ] Create/edit/delete scheduled tasks
- [ ] Status monitoring

---

## Phase 4: Debugging (2-4 months)

### 4.1 DAP Client (Node.js/TypeScript first)
**Effort: 6-8 weeks | Impact: BLOCKER-solving**

Start with Node.js debugging only:
- [ ] DAP client implementation in Rust backend
- [ ] Breakpoint management in Monaco (gutter clicks)
- [ ] Variables panel
- [ ] Call stack panel
- [ ] Watch expressions panel
- [ ] Debug console (REPL)
- [ ] Launch configuration (launch.json equivalent)
- [ ] Step over/into/out controls

### 4.2 Additional Debug Adapters
**Effort: 2-4 weeks per language | Impact: MAJOR**

- [ ] Python (debugpy)
- [ ] Rust (codelldb or probe-rs)
- [ ] Go (delve)
- [ ] Chrome/Edge (built-in CDP)

---

## Phase 5: Ecosystem & Extensions (Ongoing)

### 5.1 Built-in Formatter/Linter Integration
**Effort: 2-3 weeks | Impact: CRITICAL**

Instead of an extension system, build in the top tools:
- [ ] Prettier integration (format JS/TS/CSS/HTML/JSON/MD)
- [ ] ESLint integration (lint JS/TS)
- [ ] Detect project config files (.prettierrc, .eslintrc)
- [ ] Run on save / on demand

### 5.2 MCP as Extension Mechanism
**Effort: 3-4 weeks | Impact: MAJOR**

- [ ] MCP server lifecycle management (start/stop/restart)
- [ ] MCP tool discovery and UI
- [ ] MCP resource browsing
- [ ] MCP prompt integration as commands
- [ ] One-click MCP server install

### 5.3 Test Explorer
**Effort: 3-4 weeks | Impact: CRITICAL**

- [ ] Parse test output (Jest, Vitest, pytest, cargo test)
- [ ] Test tree view in sidebar
- [ ] Run individual tests from UI
- [ ] Test status indicators
- [ ] Test output panel
- [ ] Re-run on file change

---

## Phase 6: Advanced Features (3-6 months)

### 6.1 Inline AI Autocomplete
**Effort: 4-6 weeks | Impact: CRITICAL**

Ghost-text suggestions like Copilot/Cursor Tab:
- [ ] Completion API integration (Claude or third-party)
- [ ] Debounced trigger on typing pause
- [ ] Ghost text rendering in Monaco
- [ ] Tab to accept, Escape to dismiss
- [ ] Multi-line suggestion support

### 6.2 Inline Edit (Ctrl+K equivalent)
**Effort: 3-4 weeks | Impact: CRITICAL**

- [ ] Select code → prompt bar appears
- [ ] Send selection + prompt to Claude
- [ ] Show inline diff preview
- [ ] Accept/reject buttons
- [ ] Keyboard shortcuts

### 6.3 Remote Development
**Effort: 2-3 months | Impact: CRITICAL for teams**

- [ ] SSH connection management
- [ ] File operations over SSH
- [ ] Terminal over SSH
- [ ] Claude session on remote machine

### 6.4 PR Monitoring & Auto-fix
**Effort: 3-4 weeks | Impact: CRITICAL**

- [ ] GitHub PR list view
- [ ] CI status monitoring
- [ ] Auto-fix failing checks via Claude
- [ ] Auto-merge when ready
- [ ] PR comment integration

---

## Timeline Estimate

| Phase | Duration | Cumulative | Feature Parity After |
|-------|----------|------------|---------------------|
| Phase 0: Quick Wins | 2-4 weeks | 4 weeks | ~35% |
| Phase 1: Core IDE | 6-10 weeks | 14 weeks | ~45% |
| Phase 2: Intelligence | 6-12 weeks | 26 weeks | ~55% |
| Phase 3: Hooks/Automation | 4-6 weeks | 32 weeks | ~62% |
| Phase 4: Debugging | 8-16 weeks | 48 weeks | ~72% |
| Phase 5: Ecosystem | 8-12 weeks | 60 weeks | ~80% |
| Phase 6: Advanced | 12-24 weeks | 84 weeks | ~90% |

**Estimated time to 80% feature parity: ~15 months with a small team (2-3 engineers)**

---

## What NOT to Build

Some gaps should be accepted rather than closed:

1. **Full VS Code extension compatibility** — Too expensive. Use MCP and built-in features instead.
2. **Live Share equivalent** — Niche feature. Not worth the effort for initial viability.
3. **Codespaces/cloud dev environments** — Defer to Claude Code's cloud sessions.
4. **50,000 extensions** — Impossible. Focus on the top 20 use cases.
5. **Multi-root workspaces** — Low priority. Single project focus is fine initially.
6. **Settings sync** — Use CLAUDE.md and project files instead.
