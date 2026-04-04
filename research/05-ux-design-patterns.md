# Vantage Research -- UX & Design Patterns for an AI-Native IDE

> Wave 2 research compiled April 2026 for the Vantage project -- a Tauri v2 + React desktop IDE built around Claude Code CLI.

---

## Table of Contents

1. [IDE UX Patterns and Best Practices](#1-ide-ux-patterns-and-best-practices)
2. [AI-Specific UX Patterns](#2-ai-specific-ux-patterns)
3. [Multi-Agent UX](#3-multi-agent-ux)
4. [Design Systems for Desktop Apps](#4-design-systems-for-desktop-apps)
5. [Reference UIs to Study](#5-reference-uis-to-study)
6. [Actionable Recommendations for Vantage](#6-actionable-recommendations-for-vantage)

---

## 1. IDE UX Patterns and Best Practices

### 1.1 The VS Code Layout Anatomy (Industry Standard)

VS Code has established the dominant layout model that nearly every modern editor references. Understanding it deeply is essential because users will subconsciously measure Vantage against it.

**Six Core Regions:**

| Region | Position | Purpose | Toggle Key |
|--------|----------|---------|------------|
| **Title Bar** | Top | Window controls, menu bar, breadcrumbs, layout customize button | -- |
| **Activity Bar** | Far left (or top/bottom) | Icon-based navigation between View Containers (Explorer, Search, Git, Debug, Extensions) | -- |
| **Primary Sidebar** | Left of editor | Renders Views for the selected Activity Bar item (file tree, search results, git changes) | Cmd+B / Ctrl+B |
| **Editor Area** | Center | Tabbed code editors, split groups, minimap, sticky scroll, breadcrumbs | -- |
| **Panel** | Below editor | Terminal, Problems, Output, Debug Console as tabbed views | Cmd+J / Ctrl+J |
| **Status Bar** | Bottom | Git branch, line/col, language, encoding, indentation, errors/warnings, extension indicators | -- |
| **Secondary Sidebar** | Right of editor | Optional second sidebar (often used for Chat/Copilot) | Cmd+Shift+B |

**Key Architectural Concepts:**

- **Containers vs. Items**: The layout is built on two primitives. *Containers* are the major regions (Activity Bar, Sidebars, Panel, Editor). *Items* are what goes inside them (Views, Editors, Terminals). Items are draggable between containers.
- **View Containers**: Extensions register View Containers (icons in the Activity Bar) which hold one or more Views (tree views, webview views, welcome views).
- **Editor Groups**: The editor area supports arbitrary grid layouts -- horizontal splits, vertical splits, and nested combinations. Each group holds tabs. Users can split via Cmd+\\ or drag tabs to edges.
- **Floating Windows**: Since VS Code 1.85, editor tabs can be dragged out into independent floating windows. Floating windows support "Always on Top" pinning. Terminals and Copilot chat can also float.

**Tab Management:**

- Preview mode (italic tab title) for single-click browsing; double-click to pin
- Pinned tabs can live on a separate row above regular tabs
- Tab wrapping mode for many open files (`wrapTabs` setting)
- Custom tab labels via path-based patterns (useful for monorepos with many `index.tsx` files)
- Drag-and-drop reordering within and between groups
- Multi-select tabs with Ctrl/Cmd+Click and Shift+Click

**Minimap and Navigation:**

- Minimap: Right-side code outline rendering a zoomed-out view of the file; click to jump
- Sticky Scroll: Nested scope headers (function/class names) stay pinned at top of editor during scroll
- Breadcrumbs: File path + symbol hierarchy navigation bar above editor content
- Outline View: Symbol tree in the sidebar for the active editor

### 1.2 JetBrains Layout Patterns

JetBrains IDEs (IntelliJ, WebStorm, PyCharm) use a similar but distinct layout:

- **Tool Windows** instead of View Containers: Numbered and toggled via Alt+[number] shortcuts (Alt+1 = Project, Alt+9 = Git, etc.)
- **Docked / Floating / Windowed modes** for each tool window -- more flexible than VS Code's fixed regions
- **Run/Debug tool window** at bottom with tabbed configurations
- **Navigation Bar** at top (optional) as a horizontal breadcrumb-style file path
- **Toolbox Window**: AI assistant in a dedicated tool window, often pinned to the right sidebar
- **Intelligent Editor Actions**: Light bulb (Alt+Enter) for context actions, intentions, and quick fixes
- **Double-Shift (Search Everywhere)**: The JetBrains equivalent of VS Code's Command Palette, but also searches files, symbols, actions, and settings in a single unified search

### 1.3 Zed's Minimal Design

Zed takes a deliberately minimal approach, inspired more by Sublime Text than VS Code:

- **No Activity Bar by default**: Navigation is keyboard-driven; panels open via shortcuts, not persistent icon bars
- **Workspace structure**: Project panel (file tree), editor panes, terminal panel, agent panel, and an optional outline view
- **GPUI Framework**: Custom GPU-accelerated UI framework written in Rust. Renders at 120 FPS using a hybrid immediate/retained mode architecture. Each UI primitive (rect, glyph, image) is rendered as a GPU shader, enabling video-game-level smoothness.
- **Collaboration-first**: Real-time multiplayer editing with shared cursors, follow mode, and voice channels built in
- **Agent Panel**: A dedicated panel for AI agent interaction (see Section 2 for details)
- **Inline Assistant**: Select code, press Ctrl+Enter, type a prompt, and the AI replaces the selection inline -- no separate panel needed
- **Minimal chrome**: No icons-only activity bar, no status bar clutter. The philosophy is "get out of your face" -- visible UI should directly serve the current task

### 1.4 Command Palette Patterns

The command palette is arguably the single most important IDE UX pattern. Every IDE user expects it.

**Standard Implementation (Cmd+Shift+P / Ctrl+Shift+P):**

- Modal overlay appearing near the top of the editor
- Text input with fuzzy search across all registered commands
- Results list with keyboard navigation (arrow keys + Enter)
- Command categories or groups for organization
- Recently used commands surfaced first
- Keybinding hints shown next to each command

**Variations Across Editors:**

| Editor | Trigger | Features |
|--------|---------|----------|
| VS Code | Cmd+Shift+P (commands), Cmd+P (files), Cmd+Shift+O (symbols), Ctrl+G (go to line) | Each prefix (>, @, #, :) switches the palette mode |
| JetBrains | Double-Shift | Unified search: files, symbols, actions, settings in one palette |
| Zed | Cmd+Shift+P | Similar to VS Code but with Zed-specific actions |
| Linear | Cmd+K | Global command menu; keyboard-first navigation for every action |
| Raycast/Alfred | Global hotkey | OS-level command palette pattern, influences IDE palettes |

**React Implementation Libraries:**

- **cmdk** (by Paco): The dominant library, powers Linear, Raycast, and Vercel. Unstyled, composable, accessible. Uses `command-score` for fuzzy matching. shadcn/ui wraps this as its Command component.
- **kbar**: Alternative with built-in hotkey support, scoping, undo/redo. Good for nested command hierarchies.
- **react-cmdk**: Purpose-built for VS Code-style palettes with sections, keyboard nav, and Tailwind styling.
- **better-cmdk**: AI-powered variant that adds natural language command search.

**For Vantage**: Use shadcn/ui's Command component (wraps cmdk). Support multiple modes: commands (>), files, symbols, and a natural language mode that routes to Claude.

### 1.5 Essential Keybindings

Every IDE/code editor must support these keybinding categories. Users who cannot find their muscle-memory shortcuts will immediately reject the tool.

**Tier 1 -- Non-Negotiable (must ship in v1):**

| Category | Shortcut (Mac / Win) | Action |
|----------|----------------------|--------|
| Command Palette | Cmd+Shift+P / Ctrl+Shift+P | Open command palette |
| Quick Open | Cmd+P / Ctrl+P | Open file by name |
| Toggle Sidebar | Cmd+B / Ctrl+B | Show/hide primary sidebar |
| Toggle Panel | Cmd+J / Ctrl+J | Show/hide bottom panel |
| Toggle Terminal | Cmd+\` / Ctrl+\` | Show/hide integrated terminal |
| New Terminal | Cmd+Shift+\` / Ctrl+Shift+\` | Create new terminal instance |
| Split Editor | Cmd+\\ / Ctrl+\\ | Split editor vertically |
| Close Tab | Cmd+W / Ctrl+W | Close current editor tab |
| Save | Cmd+S / Ctrl+S | Save current file |
| Undo/Redo | Cmd+Z / Ctrl+Z, Cmd+Shift+Z / Ctrl+Y | Standard undo/redo |
| Find | Cmd+F / Ctrl+F | Find in file |
| Find & Replace | Cmd+H / Ctrl+H | Find and replace in file |
| Find in Files | Cmd+Shift+F / Ctrl+Shift+F | Search across project |
| Go to Line | Ctrl+G / Ctrl+G | Jump to line number |
| Go to Definition | F12 | Navigate to symbol definition |
| Comment Line | Cmd+/ / Ctrl+/ | Toggle line comment |
| Move Line | Alt+Up/Down | Move current line up or down |
| Duplicate Line | Shift+Alt+Down | Duplicate current line below |
| Multi-cursor | Cmd+D / Ctrl+D | Select next occurrence |
| Select All Occurrences | Cmd+Shift+L / Ctrl+Shift+L | Select all occurrences |
| Format Document | Shift+Alt+F | Auto-format entire document |
| Editor Group Switch | Cmd+1/2/3 / Ctrl+1/2/3 | Focus editor group 1/2/3 |

**Tier 2 -- Expected (ship soon after v1):**

| Category | Shortcut | Action |
|----------|----------|--------|
| Zen Mode | Cmd+K Z | Full-screen distraction-free editing |
| Fold/Unfold | Cmd+Shift+[ / ] | Collapse/expand code block |
| Go to Symbol | Cmd+Shift+O / Ctrl+Shift+O | Navigate to symbol in file |
| Peek Definition | Alt+F12 | Inline peek at definition |
| Rename Symbol | F2 | Rename across project |
| Quick Fix | Cmd+. / Ctrl+. | Show code actions |
| Toggle Word Wrap | Alt+Z | Toggle word wrap in editor |

**Tier 3 -- Advanced (vim/emacs modes):**

- Vim keybindings mode (modal editing: normal, insert, visual, command)
- Emacs keybindings mode (Ctrl+A/E for line start/end, Ctrl+K to kill line, etc.)
- Custom keybinding configuration via JSON file

### 1.6 Split Views, Drag-and-Drop, and Floating Panels

**Split View Patterns:**

- **Horizontal split**: Side-by-side editors (most common for diff views)
- **Vertical split**: Top-bottom editors (useful for test + implementation)
- **Grid layout**: Arbitrary 2D grid of editor groups (VS Code supports this)
- **Split in group**: Divide a single editor tab without creating a new group (VS Code: Cmd+K Cmd+Shift+\\)

**Drag-and-Drop Behaviors:**

- Drag tab to edge of editor area to create new split
- Drag tab between groups to move it
- Drag tab outside window to create floating window
- Drag views between sidebars (Primary to Secondary)
- Drop zone indicators (highlight edges when dragging over them)

**React Layout Libraries for Implementation:**

| Library | Best For | Key Features |
|---------|----------|-------------|
| **react-resizable-panels** (bvaughn) | VS Code-style resizable splits | Used by shadcn/ui Resizable component. Supports horizontal/vertical, min/max constraints, collapse, keyboard resize, layout persistence. 1800+ npm dependents. |
| **Dockview** | Full IDE-like docking layout | Zero-dependency. Tabs, groups, grids, splitviews, drag-and-drop, floating panels, popout windows. Some internals inspired by VS Code source. React/Vue/Angular/vanilla TS. MIT licensed. |
| **Allotment** | VS Code-exact look and feel | Derived from VS Code's own split view code. TypeScript-first. Snap behavior, min/max per pane. |

**Recommendation for Vantage**: Start with **react-resizable-panels** via shadcn/ui's Resizable component for the core split layout. Evaluate **Dockview** for the full docking/floating/popout experience if users demand VS Code-level layout flexibility.

### 1.7 Activity Bar and Sidebar Patterns

**VS Code Activity Bar Best Practices:**

- Icons should be 24x24px with a 1px stroke weight (Codicon icon set)
- Activity Bar supports two sizes: large (default) and compact
- Each icon corresponds to a View Container in the sidebar
- Badge indicators (numbers) show counts: git changes, search results, errors
- The Activity Bar can be positioned: left edge (default), top of sidebar, bottom of sidebar, or hidden entirely

**Sidebar Content Patterns:**

- **Tree Views**: Collapsible hierarchy (file explorer, symbol outline, git changes)
- **List Views**: Flat or grouped lists (search results, problems, extensions)
- **Welcome Views**: Empty state with action buttons (when no project is open)
- **Webview Views**: Custom HTML content embedded in sidebar
- **Section headers** with collapse toggle and action buttons (filter, sort, refresh)

**For Vantage, the Activity Bar should include:**

1. Explorer (file tree)
2. Search (find in files)
3. Source Control (git)
4. AI Agents (agent sessions -- Vantage's differentiator)
5. Extensions/Settings

### 1.8 Status Bar Patterns

The status bar is a dense information strip. Key items shown (left-to-right):

**Left side (workspace-scoped):**
- Git branch name + sync status (arrows for ahead/behind)
- Errors and warnings count (click to open Problems panel)
- Running tasks / build status

**Right side (file-scoped):**
- Line and column number (Ln X, Col Y)
- Selection count (when text selected)
- Indentation (Spaces: 2 / Tab Size: 4)
- Encoding (UTF-8)
- End of line sequence (LF / CRLF)
- Language mode (TypeScript, Rust, etc.)
- Formatter / linter status
- AI status indicator (Copilot enabled/disabled)

**For Vantage, add these AI-specific status bar items:**
- Active agent count and status (0 idle, 2 running, 1 needs attention)
- Token usage / cost for current session
- Claude connection status (connected/disconnected/rate-limited)

---

## 2. AI-Specific UX Patterns

### 2.1 How Leading AI IDEs Present Suggestions

#### GitHub Copilot -- Ghost Text Inline Suggestions

The industry standard for code completion:

- **Ghost text**: Dimmed/grayed-out text appearing inline at cursor position
- **Accept**: Press Tab to accept the entire suggestion
- **Partial accept**: Cmd+Right (Ctrl+Right) to accept word-by-word, or accept line-by-line
- **Reject**: Press Escape or keep typing (suggestion auto-dismisses)
- **Cycle alternatives**: Alt+[ / Alt+] to see other completions
- **Visual distinction**: Ghost text uses a distinct color (typically lighter/dimmer than regular code) and optionally a subtle background highlight

**Key UX principle**: Suggestions appear *inline* at the cursor, not in a separate panel. This keeps the developer's eyes on their code. The suggestion is a natural extension of what they're typing.

#### Cursor -- Multi-Modal AI Interaction

Cursor pioneered the "autonomy slider" concept with three interaction levels:

1. **Tab Completion** (lowest autonomy):
   - Specialized low-latency model predicts not just next tokens but next *edit locations*
   - Predicts cursor position changes and multi-location edits
   - 45-50% acceptance rate (higher than Copilot's ~40-42%)
   - Ghost text plus next-edit prediction arrows

2. **Cmd+K Inline Editing** (medium autonomy):
   - Select code, press Cmd+K, type instruction
   - AI generates a diff shown inline in the editor
   - Green highlights for additions, red for deletions
   - Accept/reject buttons appear above the diff
   - Can edit the AI's suggestion before accepting

3. **Composer / Agent Mode** (highest autonomy):
   - Side panel showing AI's plan and multi-file changes
   - Each file change shown as an expandable diff card
   - "Accept All" / "Reject All" buttons, plus per-file accept/reject
   - Agent mode: AI autonomously reads files, runs commands, makes changes
   - Real-time streaming of agent's thought process and actions
   - Checkpoint/rollback to undo agent changes

4. **Background Agents** (Cursor 3, April 2026):
   - Agents clone repo in the cloud and work autonomously
   - Can open pull requests when finished
   - Status shown in a dedicated agents window

5. **Design Mode** (late 2025):
   - Embedded browser preview
   - Click and drag UI elements to annotate what to change
   - "Point and prompt" -- click a component, type what you want changed
   - Transforms a 5-minute explanation into a 10-second interaction

#### Windsurf Cascade -- Flow-Aware Agent

Windsurf's Cascade takes a unique approach:

- **Flow awareness**: Tracks edits, commands, conversation history, clipboard, and terminal to infer intent
- **Real-time edit streaming**: You watch Cascade make changes in real time across files
- **File status badges**: Shows "Edited authService.ts", "Viewed api.ts", "Deleted LoginForm.tsx" with distinct icons for each operation type
- **Suggested actions**: After completing a task, Cascade suggests next steps as clickable buttons
- **Write mode toggle**: Cmd+. switches between read and write modes
- **Parallel agents (Wave 13)**: Side-by-side Cascade panes for multiple agent sessions
- **Git worktree integration**: Each parallel agent gets its own worktree

#### Zed -- Minimalist AI Integration

Zed integrates AI with characteristic restraint:

- **Inline Assistant**: Select code, press Ctrl+Enter, type prompt. AI replaces selection inline. Multiple cursors send the same prompt to each position simultaneously.
- **Agent Panel**: Dedicated panel with streaming responses, tool use indicators, file edit tracking, and checkpoint/restore buttons. Uses @-mentions for context (files, directories, symbols).
- **Text Threads**: Simpler chat-only interface for conversational interactions without tool access
- **Slash Commands**: /file, /diagnostics, /fetch for explicit context injection. Minimalist approach -- user controls exactly what context the AI sees, unlike Cursor/Windsurf's automatic indexing.
- **Tool Permissions**: Confirmation dialogs with "Allow once", "Always for [tool]", and pattern-based approval

### 2.2 Streaming AI Output Display

Streaming is the expected baseline for any AI-powered interface. A non-streaming interface feels broken.

**Core Streaming UX Principles:**

1. **Immediate feedback on submit**: Show a typing indicator / thinking animation within 100ms of the user pressing Enter. The gap between submit and first token (TTFT) can be 200ms-3s. If nothing visible happens, users think submit failed.

2. **Token-by-token rendering**: As tokens arrive, render them incrementally. Avoid buffering entire responses before display.

3. **Avoid layout thrash**: Pre-allocate space or use smooth animations so the UI doesn't jump as content streams in. Auto-scroll should follow the stream but stop if the user scrolls up.

4. **Stop button**: Always provide a visible stop/cancel button during streaming. Users must be able to interrupt bad responses early.

5. **Retry button**: After completion, show a retry/regenerate button. After errors, show retry with the error message.

**Thinking/Reasoning Display:**

Models like Claude emit "thinking" tokens. The established pattern:

- Show a collapsible "Thinking..." block with elapsed time ("Thought for 12 seconds")
- Auto-expand while thinking, auto-collapse when the actual response starts streaming
- Allow manual expand to see the reasoning chain
- Use a visually distinct style (muted colors, smaller font, or different background)

**Skeleton Screens for Complex Output:**

For non-text output (tables, code blocks, diagrams):

- Show skeleton placeholders mimicking the expected layout structure
- Stream text portions while showing loading bars for complex elements
- Never show a loading state for less than ~300ms (sub-second displays feel jarring)

**Streaming Format Patterns:**

| Content Type | Pattern |
|-------------|---------|
| Text response | Token-by-token streaming with auto-scroll |
| Code block | Stream with syntax highlighting applied incrementally; show language label early |
| File edits | Stream the diff, then show accept/reject controls on completion |
| Tool calls | Show tool name + arguments as they stream; show result when complete |
| Multi-step plan | Stream plan steps, then show progress as steps execute |

**For Vantage**: Implement streaming as a first-class primitive. The chat panel should stream text, the editor should stream diffs, and the terminal should stream command output. All three should feel cohesive.

### 2.3 AI Thinking and Progress Indicators

**Levels of Progress Communication:**

| Level | When | Pattern | Example |
|-------|------|---------|---------|
| **Indeterminate** | Waiting for first token | Pulsing dot / typing indicator | "Claude is thinking..." |
| **Phase indicator** | Multi-step operation | Step badges with current step highlighted | "Reading files (2/5) -> Planning -> Editing -> Verifying" |
| **Streaming progress** | Generating response | Growing content + elapsed time | Response streaming with "12s" timer |
| **Tool progress** | Agent using tools | Tool name + status badge | "Running `npm test`..." with spinner |
| **Completion** | Task finished | Checkmark + summary | "3 files edited, 47 lines changed" |

**AWS Cloudscape GenAI Loading Pattern (well-documented):**

Two stages:
1. **Processing**: AI has no output yet. Show avatar + "Generating [artifact]..." text. Use loading bar for non-text.
2. **Generation**: AI starts producing output. Stream text with avatar indicator. Maintain loading state during intermittent slowdowns.

Writing format for loading messages: "[Generating/Loading] [specific artifact]" -- no end punctuation.

**For Vantage**: Show a multi-phase progress indicator in the agent panel. When Claude is reading files, show which files. When editing, show which files are being changed. When running commands, show the command and its output streaming.

### 2.4 Permission / Approval UX

This is critical for trust. When Claude wants to run a command or edit a file, the user must feel in control.

**Three-Tier Approval Model (emerging standard across Claude Code, OpenCode, Codex):**

1. **Ask every time** (default for destructive operations):
   - Modal dialog showing: operation type, tool name, file path/command, diff preview (for edits)
   - Buttons: "Allow", "Deny", "Allow for session", "Always allow"
   - Keyboard shortcuts for quick approval (y/n/a)
   - Dialog blocks all other input until resolved

2. **Allow for session** (user explicitly grants):
   - Subsequent matching operations auto-approved
   - Visual indicator that auto-approval is active
   - Session-scoped (resets when session ends)

3. **Pattern-based rules** (pre-configured):
   - Allowlist patterns: `git status*`, `npm test*`, `cat *` (safe read-only commands)
   - Denylist patterns: `rm -rf *`, `git push --force*` (always block destructive commands)
   - Per-tool rules with glob matching
   - Last matching rule wins

**UX Design for Permission Dialogs:**

- Center the dialog over the active content area
- Show a clear diff preview for file edits (green/red highlighting)
- Show the full command for bash operations
- Use distinct colors for different risk levels:
  - Green border: Read-only operations (safe)
  - Yellow border: Write operations (medium risk)
  - Red border: Destructive operations (high risk)
- Always show the tool name and operation description
- Include a "What will this do?" expandable explanation

**Zed's Approach (good reference):**
- Confirmation menu with approve/deny for current request
- "Always for [tool]" option for persistent approval
- Pattern-based approval extracted from safe command prefixes
- Per-tool blocking rules

**For Vantage**: Implement a three-tier permission system. Default to "ask" for all write/execute operations. Provide a settings page where users can configure patterns. Show a security log of all approved/denied operations.

### 2.5 Diff Presentation for AI Changes

How to show what the AI changed is one of the most critical UX decisions for an AI IDE.

**Presentation Modes (support all three, default to inline):**

#### Inline Diff (Primary -- Cursor/Copilot style)

- Changes shown directly in the editor where they occur
- Added lines: Green background highlight
- Removed lines: Red background with strikethrough (or shown as ghost overlay)
- Modified lines: Split highlight (red for removed portion, green for added)
- Gutter indicators: +/- symbols in the line number gutter
- Accept/Reject buttons floating above each change hunk
- "Accept All" / "Reject All" at the top of the file

#### Side-by-Side Diff (Secondary -- GitHub style)

- Two-column layout: original on left, modified on right
- Aligned line numbers
- Synchronized scrolling
- Best for large, complex changes where inline becomes hard to read
- Toggle via "Unified | Split" button (GitHub pattern)

#### Unified Diff (Tertiary -- Git style)

- Single column with +/- line prefixes
- Context lines (unchanged) around each change hunk
- Collapsible sections for large unchanged regions
- Click to expand collapsed sections
- Best for reviewing multiple files quickly

**Per-Hunk Granular Control:**

This is an active area of development across all AI IDEs (Claude Code issue #31395, OpenAI Codex feature requests, Cursor community forum):

- Each discrete change (hunk) gets its own Accept/Reject buttons
- "Accept All in File" / "Reject All in File" buttons
- "Accept All Across All Files" / "Reject All Across All Files" global buttons
- Ability to edit a hunk before accepting
- Checkpoint/restore to undo an acceptance

**Multi-File Diff View:**

When the AI changes multiple files:

- Show a file list with change counts (e.g., "src/auth.ts +45 -12")
- Each file expandable to show its diff
- Tree view grouping files by directory
- "Review Changes" button that opens a multi-buffer view (Zed's approach)
- Files colored by change magnitude (more changes = more saturated color)

**React Diff Libraries:**

| Library | Features |
|---------|----------|
| **react-diff-view** | Split and unified modes, collapsed code expansion, large diff lazy load, syntax highlighting |
| **@mrrwangju/git-diff-view** | Same-as-GitHub diff view for React/Vue/Solid/Svelte |
| **Monaco Editor's built-in diff** | Side-by-side diff with the full Monaco editing experience |

**For Vantage**: Default to inline diff for single-file changes (keeps user's eyes on the code). Switch to multi-file review panel for agent-mode changes across many files. Always provide per-hunk accept/reject. Include a "Checkpoint" button before applying any AI changes.

---

## 3. Multi-Agent UX

### 3.1 Visualizing Multiple Concurrent Agent Sessions

Running multiple Claude Code agents in parallel is Vantage's core differentiator. The UX for this must be exceptional.

**Existing Approaches in the Wild:**

| Tool | Visualization | Pros | Cons |
|------|--------------|------|------|
| **Nimbalyst** | Kanban board with status columns | Intuitive for task management; drag-drop; session history; diff review per session | Desktop app, not web-only; limited to 2D view |
| **Vibe Kanban** | 6-column kanban (Backlog, In Progress, Review, Done, etc.) | Git worktree isolation per card; diff comparison across agents; role-based auto-assignment | Browser-based; limited to Kanban metaphor |
| **Claude Squad** | Terminal multiplexer with named sessions | Lightweight; tmux-based; SSH support | No visual overview; terminal-only |
| **AMUX** | Web dashboard for tmux-based agents | Live terminal peeking; SQLite CAS kanban; self-healing watchdog | Requires tmux; web dashboard is secondary |
| **Cursor 3 Agents Window** | Dedicated window listing all agents | Shows local, worktree, SSH, cloud agents; status indicators | New (April 2026); limited customization |
| **Windsurf Wave 13** | Side-by-side Cascade panes | Parallel agents with separate terminal profiles | Limited to 2 panes in current UX |

### 3.2 Proposed Multi-Agent Views for Vantage

Vantage should support three complementary views, switchable in the Activity Bar:

#### View 1: Kanban Board (Task Management)

```
+------------------------------------------------------------------+
| Backlog      | In Progress  | In Review    | Done               |
|              |              |              |                    |
| +----------+ | +----------+ | +----------+ | +----------+      |
| | Add auth | | | Refactor | | | Fix API  | | | Add tests|      |
| | endpoint | | | database | | | response | | | for auth |      |
| |          | | |          | | |          | | |          |      |
| | Agent: -- | | | Agent: A | | | Agent: B | | | Agent: C |      |
| | Files: 0 | | | Files: 4 | | | Files: 2 | | | Files: 6 |      |
| | Cost: -- | | | Cost:$0.12| | Cost:$0.08| | | Cost:$0.15|     |
| +----------+ | +----------+ | +----------+ | +----------+      |
+------------------------------------------------------------------+
```

- Cards represent tasks/stories
- Drag cards between columns to change status
- Each card shows: task name, assigned agent, file count, token/cost, elapsed time
- Click card to open agent session in the editor panel
- Color-coded borders by status (gray=backlog, blue=in progress, yellow=review, green=done, red=error)
- Badge indicators when agent needs attention (permission request, error, completion)

#### View 2: Timeline View (Progress Tracking)

```
+------------------------------------------------------------------+
| Agent A: Refactor database                                        |
| [=============================>                    ] 65%          |
| 10:30 Reading schema.ts                                          |
| 10:31 Editing models/user.ts (+45 -12)                          |
| 10:32 Running npm test... [PASS]                                 |
| 10:33 Editing models/post.ts (+23 -8)                            |
|                                                                  |
| Agent B: Fix API response                                         |
| [==================>                               ] 40%          |
| 10:31 Reading api/routes.ts                                      |
| 10:32 NEEDS ATTENTION: Permission to run `npm install`           |
|                                                                  |
| Agent C: Add tests for auth  [COMPLETED]                         |
| [=================================================] 100%         |
| Completed in 3m 42s | Cost: $0.15 | 6 files changed             |
+------------------------------------------------------------------+
```

- Chronological event stream per agent
- Progress bars (indeterminate during open-ended tasks, determinate during known-step tasks)
- Inline alerts for attention-needed events
- Expandable event details (click to see diff, command output, etc.)
- Real-time updates via streaming

#### View 3: Agent Tree (Hierarchical)

```
+------------------------------------------------------------------+
| Coordinator Agent                                                 |
| +-- Agent A: Refactor database [RUNNING]                         |
| |   +-- Subtask: Update schema                                   |
| |   +-- Subtask: Migrate data                                    |
| |   +-- Subtask: Update tests                                    |
| +-- Agent B: Fix API response [NEEDS ATTENTION]                  |
| |   +-- Subtask: Identify issue                                  |
| |   +-- Subtask: Implement fix [BLOCKED]                         |
| +-- Agent C: Add tests [COMPLETED]                               |
+------------------------------------------------------------------+
```

- Shows parent-child agent relationships (coordinator -> specialists)
- Expandable subtask trees
- Status icons per node
- Click to navigate to agent session

### 3.3 File Ownership and Conflict Visualization

When multiple agents work in parallel, showing which files each agent is touching is essential for preventing conflicts.

**File Ownership Sidebar:**

- In the file explorer, show colored dots/badges next to files being edited by agents
- Agent A = blue dot, Agent B = green dot, Agent C = orange dot
- Files touched by multiple agents get a warning icon (potential conflict)
- Hover to see which agent(s) are working on the file and what they're doing

**Conflict Prevention:**

- Pre-merge conflict detection (like the Clash tool) before agents commit
- Visual warning when two agents edit the same file simultaneously
- "Hotspot files" (configs, routing tables, barrel exports) flagged with a distinct icon
- Sequential merge queue visualization showing the order agents will merge

### 3.4 Progress Indicators for Parallel Work

**Global Progress Bar (in status bar):**

- "2 agents running | 1 needs attention | 1 completed"
- Click to expand to the full agent dashboard

**Per-Agent Progress:**

- Spinner/pulsing animation while actively working
- Progress percentage when steps are known
- Elapsed time and estimated time remaining
- Token count / cost running total

**Desktop Notifications:**

- System tray notifications when an agent:
  - Completes its task
  - Encounters an error
  - Needs permission for a destructive operation
  - Has been idle for too long (possible stall)
- In-app toast notifications (using Sonner/shadcn) for less urgent events
- Badge count on the app icon (macOS dock, Windows taskbar)
- Notification center with history of all agent events

**Notification Priority Levels:**

| Priority | Type | Delivery | Example |
|----------|------|----------|---------|
| Critical | Agent error / failure | System notification + in-app alert + sound | "Agent B crashed: npm test failed" |
| High | Needs attention / permission | System notification + in-app toast | "Agent A needs permission to run `rm -rf build/`" |
| Medium | Task completed | In-app toast + badge update | "Agent C completed: 6 files changed" |
| Low | Progress update | Badge update only | "Agent A: 65% complete" |

### 3.5 Agent Session Management

**Session Lifecycle:**

1. **Create**: User creates a task with a description and assigns it to an agent
2. **Configure**: Set working directory, git branch/worktree, allowed tools, context files
3. **Run**: Agent executes autonomously with progress streaming
4. **Review**: User reviews changes in diff view; approves/rejects per hunk
5. **Merge**: Approved changes merged to main branch
6. **Archive**: Session archived with full history for future reference

**Session Persistence:**

- All sessions stored locally (SQLite or filesystem)
- Full conversation history, tool calls, diffs, and decisions
- Resume interrupted sessions
- Branch sessions to try alternative approaches
- Search and filter past sessions

---

## 4. Design Systems for Desktop Apps

### 4.1 shadcn/ui in Tauri -- Compatibility and Approach

shadcn/ui works excellently in Tauri because it's fundamentally just React components + Tailwind CSS + Radix UI primitives -- all of which run perfectly in any web context, including Tauri's WebView2.

**Proven Tauri + shadcn/ui Starters:**

| Template | Stack | Features |
|----------|-------|----------|
| **tauri-ui** (agmmnn) | Tauri + React + shadcn/ui + Tailwind | Custom titlebar, dark/light mode, native-looking window controls, ~2-2.5 MB per platform |
| **tauri-app-template** (kitlib) | Tauri v2 + React 19 + TS + shadcn/ui | TypeScript-first, modern stack |
| **tauri-nextjs-shadcn** | Tauri + Next.js + shadcn/ui + Bun | GitHub Actions CI, cross-platform builds |

**Key Components from shadcn/ui for an IDE:**

| Component | IDE Use Case |
|-----------|-------------|
| **Command** (wraps cmdk) | Command palette |
| **Resizable** (wraps react-resizable-panels) | Split pane layout |
| **Dialog** | Modal dialogs (permission requests, settings) |
| **Alert Dialog** | Destructive operation confirmations |
| **Sheet** | Sliding panels (settings, details) |
| **Tabs** | Editor tabs, panel tabs |
| **Tooltip** | Hover information throughout the UI |
| **Sonner** | Toast notifications |
| **Context Menu** | Right-click menus |
| **Popover** | Hover cards, quick info |
| **Dropdown Menu** | Action menus |
| **Scroll Area** | Scrollable regions with custom scrollbars |
| **Separator** | Visual dividers |
| **Badge** | Status indicators, counts |
| **Progress** | Progress bars |
| **Skeleton** | Loading placeholders |
| **Toggle** | Boolean settings |
| **Toggle Group** | View mode switches (unified/split diff) |
| **Breadcrumb** | File path navigation |
| **Collapsible** | Expandable sections (thinking blocks, file trees) |

**What shadcn/ui does NOT provide (need custom or additional libraries):**

- Code editor (use Monaco or CodeMirror)
- Terminal emulator (use xterm.js)
- File tree (custom tree component or use shadcn Tree -- community component)
- Diff viewer (use react-diff-view or Monaco diff)
- Docking/floating panels (use Dockview)
- Kanban board (custom or use react-beautiful-dnd / dnd-kit)
- Minimap (part of Monaco)

### 4.2 Dark Theme Best Practices for Code Editors

Dark themes are the default for code editors. Getting the dark theme right is essential.

**Background Colors -- Avoid Pure Black:**

- Pure black (#000000) with white text causes visual "halation" (text appears to bleed/fuzz)
- Use very dark gray or tinted dark: #1e1e2e (Catppuccin Mocha), #1e1e1e (VS Code default dark), #282c34 (One Dark)
- Material Design recommends #121212 as a baseline dark background
- Layer surfaces with subtle lightness increments:
  - Base/Background: #1e1e2e
  - Surface 0 (panels): #313244
  - Surface 1 (cards, elevated): #45475a
  - Surface 2 (hover states): #585b70

**Text Hierarchy:**

- Primary text: ~87% opacity white or dedicated text color (#cdd6f4 in Catppuccin)
- Secondary text: ~60% opacity (#a6adc8)
- Disabled/placeholder text: ~38% opacity (#6c7086)
- Never use pure white (#ffffff) for large blocks of text -- use off-white

**Accent Colors:**

- Use the accent color sparingly (active tab indicator, focused borders, links)
- Ensure minimum 4.5:1 contrast ratio against backgrounds (WCAG AA)
- High-contrast mode should reach 7:1 (WCAG AAA)
- Test with color blindness simulators (deuteranopia, protanopia, tritanopia)

**Linear's LCH Color Approach (recommended for Vantage):**

Linear's redesign migrated from HSL to LCH (Lightness-Chroma-Hue) color space because it's perceptually uniform -- a red and yellow at lightness 50 look equally light to the human eye (unlike HSL where they don't). Linear's system uses just three variables (base color, accent color, contrast) to auto-generate an accessible theme. This enables:
- Automatic high-contrast accessibility themes
- Consistent perceived brightness across different hues
- Fewer manually tuned color values

**Theme Variables Strategy:**

Rather than defining 100+ individual color tokens, use a layered approach:
1. Define ~10 semantic tokens (background, foreground, accent, border, muted, etc.)
2. Generate surface layers and state variations automatically
3. Use CSS custom properties for runtime theme switching
4. Support user customization via JSON/TOML settings file

### 4.3 Typography for Code

**Recommended Monospace Fonts (ranked by quality for IDE use):**

| Font | Ligatures | Weights | Languages | Key Feature |
|------|-----------|---------|-----------|-------------|
| **JetBrains Mono** | 142 ligatures | 8 weights + italics | 152 languages | Best readability at small sizes; increased x-height; optimized for long reading sessions |
| **Fira Code** | 200+ ligatures | 6 weights | 40+ languages | Largest ligature set; most popular; clean design |
| **Cascadia Code** | Yes (Cascadia Mono = no ligatures) | 6 weights | 50+ languages | Microsoft's default; ships with Windows Terminal; Nerd Font variant available |
| **Monaspace** | Texture healing, code-specific ligatures | 5 families | Multi | GitHub's font family; 5 variants (Neon, Argon, Xenon, Radon, Krypton) for different contexts |
| **Berkeley Mono** | Yes | Multiple | Multi | Premium ($75); beloved by devs for aesthetics |
| **Iosevka** | Custom builds | Extensive | Extensive | Most customizable; build your own variant; very narrow |
| **Source Code Pro** | No | 7 weights | Multi | Adobe's contribution; clean and readable |

**Font Size Recommendations:**

- Default editor font size: 13-14px (VS Code default is 14px)
- Minimum readable: 11px (for minimap labels, status bar)
- Terminal font size: Same as editor or 1px smaller
- UI font size (menus, sidebars): 12-13px
- Line height: 1.5-1.6 for code (VS Code default is 1.5)

**Ligature Considerations:**

- Ligatures combine multi-character sequences into single glyphs: `!=` becomes a slashed equals, `=>` becomes an arrow, `>=` becomes a proper greater-than-or-equal
- Enable by default but provide a setting to disable
- Common ligature sequences: `->`, `=>`, `!=`, `!==`, `===`, `>=`, `<=`, `|>`, `<|`, `::`, `..`, `...`
- Some developers strongly dislike ligatures (readability preference) -- always optional

**For Vantage**: Default to JetBrains Mono with ligatures enabled. Bundle it with the app so it's always available. Allow users to select any system font.

### 4.4 Color Schemes for Syntax Highlighting

**Two Systems in Modern Editors:**

1. **TextMate Grammars** (lexical/regex-based): The original system. Assigns scopes like `keyword.control.js`, `string.quoted.double`, `entity.name.function`. Themes map scopes to colors.

2. **Semantic Highlighting** (language-server-based): Enriches TextMate colors with semantic information from the language server. Distinguishes between a local variable and a parameter, or a function call and a method call. Falls back to TextMate scopes when semantic data is unavailable.

**Essential Token Categories and Recommended Colors (Mocha-inspired palette):**

| Token Category | TextMate Scope | Suggested Color | Hex (Catppuccin Mocha) |
|---------------|---------------|----------------|----------------------|
| Keywords | `keyword.*` | Mauve/Purple | #cba6f7 |
| Strings | `string.*` | Green | #a6e3a1 |
| Numbers | `constant.numeric.*` | Peach/Orange | #fab387 |
| Comments | `comment.*` | Overlay (muted) | #6c7086 |
| Functions | `entity.name.function` | Blue | #89b4fa |
| Types/Classes | `entity.name.type` | Yellow | #f9e2af |
| Variables | `variable.*` | Text (default) | #cdd6f4 |
| Constants | `constant.*` | Peach | #fab387 |
| Operators | `keyword.operator.*` | Sky/Cyan | #89dceb |
| Properties | `variable.other.property` | Lavender | #b4befe |
| Parameters | `variable.parameter` | Maroon | #eba0ac |
| Decorators | `meta.decorator` | Mauve | #cba6f7 |
| HTML Tags | `entity.name.tag` | Blue | #89b4fa |
| HTML Attributes | `entity.other.attribute-name` | Yellow | #f9e2af |
| CSS Properties | `support.type.property-name` | Blue | #89b4fa |
| Regex | `string.regexp` | Peach | #fab387 |
| Error | `invalid.*` | Red | #f38ba8 |

**Accessibility in Syntax Highlighting:**

- Colorblind-friendly palettes exist (based on Paul Tol's research for data visualization)
- DuoTone approach: Use only 2 hues (7 shades) -- tone down less important tokens (punctuation, brackets) and highlight only important ones (keywords, functions, strings)
- Minimum contrast ratio of 4.5:1 for all syntax colors against the editor background
- Never rely on color alone to convey information -- combine with font weight, style (italic), or underline

**Catppuccin Mocha -- Complete Surface and Accent Palette:**

A reference palette that works well for dark code editors:

| Role | Name | Hex |
|------|------|-----|
| Background | Base | #1e1e2e |
| Elevated background | Mantle | #181825 |
| Deepest background | Crust | #11111b |
| Panel background | Surface 0 | #313244 |
| Card background | Surface 1 | #45475a |
| Hover background | Surface 2 | #585b70 |
| Subtle text | Overlay 0 | #6c7086 |
| Muted text | Overlay 1 | #7f849c |
| Secondary text | Overlay 2 | #9399b2 |
| Tertiary text | Subtext 0 | #a6adc8 |
| Secondary body | Subtext 1 | #bac2de |
| Primary text | Text | #cdd6f4 |
| Accent: warm pink | Rosewater | #f5e0dc |
| Accent: soft pink | Flamingo | #f2cdcd |
| Accent: bright pink | Pink | #f5c2e7 |
| Accent: purple | Mauve | #cba6f7 |
| Accent: red | Red | #f38ba8 |
| Accent: dark pink | Maroon | #eba0ac |
| Accent: orange | Peach | #fab387 |
| Accent: yellow | Yellow | #f9e2af |
| Accent: green | Green | #a6e3a1 |
| Accent: teal | Teal | #94e2d5 |
| Accent: light blue | Sky | #89dceb |
| Accent: medium blue | Sapphire | #74c7ec |
| Accent: blue | Blue | #89b4fa |
| Accent: periwinkle | Lavender | #b4befe |

### 4.5 Accessibility in Code Editors

**WCAG Compliance Requirements:**

- **Keyboard navigation (WCAG 2.1.1, Level A)**: Every interactive element must be operable with keyboard alone. Tab, Enter, Space, Escape, and arrow keys must work for all operations.
- **No keyboard traps (WCAG 2.1.2, Level A)**: Users must always be able to navigate away from any focused element. This is especially important for embedded editors and terminals.
- **Focus indicators (WCAG 2.4.7, Level AA)**: Visible focus outlines on every interactive element. Never use `outline: none` without a replacement.
- **Focus order (WCAG 2.4.3, Level A)**: Tab order follows logical layout (left-to-right, top-to-bottom within each region).
- **Contrast ratio (WCAG 1.4.3, Level AA)**: 4.5:1 for normal text, 3:1 for large text. Test all syntax highlighting colors.
- **Screen reader support**: Use semantic HTML and ARIA attributes. Code editors are complex widgets -- follow the ARIA APG (Authoring Practices Guide).

**ARIA Patterns for IDE Components:**

| Component | ARIA Pattern |
|-----------|-------------|
| Tab bar | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, arrow key navigation |
| Tree view (file explorer) | `role="tree"`, `role="treeitem"`, `aria-expanded`, arrow key navigation |
| Command palette | `role="combobox"` + `role="listbox"`, `aria-activedescendant` for highlighted item |
| Status bar items | `role="status"` for live-updating text, `aria-live="polite"` |
| Notifications | `role="alert"` for critical, `role="status"` for informational |
| Split panels | `role="separator"` for resize handles, `aria-valuenow` for panel size |
| Terminal | Specialized -- xterm.js has built-in accessibility addon |

**High Contrast Mode:**

- Provide a dedicated high-contrast theme (not just "invert colors")
- Borders around all interactive elements
- Distinct background colors for focused elements
- VS Code 2026's approach: New "Editor Appearance" setting lets editor theme differ from IDE theme
- Support `prefers-contrast: more` CSS media query

**For Vantage**: Ship with a high-contrast theme variant. Use `prefers-color-scheme` and `prefers-contrast` to auto-detect user preferences. Test all UI components with keyboard-only navigation before each release.

---

## 5. Reference UIs to Study

### 5.1 Zed's Minimal Design

**What to learn from Zed:**

- **Keyboard-first interaction**: Almost no persistent chrome; panels open via shortcuts and close when not needed
- **GPU-accelerated smoothness**: 120 FPS rendering creates a feeling of responsiveness that users notice subconsciously -- even 60 FPS feels sluggish by comparison
- **Agent Panel design**: Streaming responses with tool use indicators, file edit tracking as an expandable accordion, checkpoint/restore buttons, @-mention context injection, and thumbs up/down feedback
- **Inline Assistant**: Select + Ctrl+Enter + type prompt = inline AI edit. Multi-cursor support sends the same prompt to all positions simultaneously. No separate panel needed for simple edits.
- **Context as text**: Zed treats the entire agent panel chat as one big text file. Context is injected via slash commands (/file, /diagnostics, /fetch). Users have explicit control over what the AI sees, creating trust.
- **Minimal chrome**: No activity bar icons by default. No status bar clutter. Settings via JSON file. The editor surface dominates.
- **Collaboration-native**: Shared cursors, follow mode, voice channels. Designed for pair programming from day one.

**Specific UI elements to reference:**

- The tool use indicator during agent streaming (shows tool name + status inline in the response)
- The "Review Changes" multi-buffer diff view (shows all edits across files in one view)
- The checkpoint/restore button placement (appears after each agent edit)
- The crosshair "follow agent" icon (click to track the agent's file navigation)

### 5.2 VS Code's Extensible Layout

**What to learn from VS Code:**

- **The inverted-L chrome**: Activity Bar + Title Bar form an L-shape that frames the editor. Everything inside is customizable.
- **Drag-and-drop everywhere**: Tabs between groups, views between sidebars, panels to floating windows. The entire layout is rearrangeable.
- **Settings UI + JSON duality**: Graphical settings editor for discovery, raw JSON for power users. Visual Studio 2026 adopted this same approach (redesigned settings with underlying JSON).
- **Extension contribution points**: Extensions declare what they contribute (views, commands, menus, keybindings, themes, languages) and VS Code renders them in the right places. This extensibility model is worth studying even if Vantage doesn't support extensions initially.
- **Custom Layout dialog**: The "Customize Layout" picker in the title bar lets users quickly toggle visibility of all chrome elements and switch between predefined layouts.
- **Editor group grid**: Arbitrary 2D grid of editor groups with drag-to-split, keyboard split, and join operations.
- **Preview tabs**: Single-click opens a preview (italic title); double-click or edit to pin. Prevents tab explosion during browsing.
- **Zen Mode**: Cmd+K Z hides all chrome for distraction-free editing. Panel, sidebar, status bar, activity bar all hidden. Escape to exit.

**Specific patterns to adopt:**

- Primary + Secondary sidebar model (left for navigation, right for AI/chat)
- Floating window support for multi-monitor setups
- Pinned tabs on separate row
- Status bar left/right semantic grouping
- Breadcrumb navigation above editor

### 5.3 Warp Terminal's AI-Native UX

**What to learn from Warp:**

- **Block-based output**: Every command + its output is a discrete "block" that can be individually selected, copied, shared, or annotated. This transforms the terminal from a stream of text into structured, navigable content.
- **Modern input editor**: Multi-line editing, syntax highlighting, and rich completions in the command input -- not the traditional single-line prompt.
- **Agent Mode with notifications**: Warp's agents can work autonomously and send system notifications when they complete or need attention. Desktop notifications for agent status is a pattern Vantage must implement.
- **GPU rendering**: Warp renders at 144+ FPS using Metal (on macOS) with custom GPUI framework. Each primitive (rect, glyph, image) is a GPU shader. This is the same approach as Zed (Warp's GPUI influenced Zed's GPUI).
- **Agent management UI**: Shows status of all running agents with in-app and system notifications. The terminal is natively designed for managing multiple long-running processes.
- **Workflow sharing**: Block-based model enables structured, replayable terminal sessions that can be shared with teammates -- not just screenshots.

**Specific patterns to adopt for Vantage's terminal:**

- Block-based output grouping (command + output as a collapsible unit)
- Rich input editor with syntax highlighting and multi-line support
- Agent status sidebar showing all running processes
- System notification integration for agent events

### 5.4 Linear's Clean Task Management

**What to learn from Linear:**

- **Keyboard-first everything**: Cmd+K command menu, / for filtering, E for quick editing. Nearly every action has a single-key or chord shortcut. Users rarely need the mouse.
- **LCH color system**: Uses perceptually uniform color space with just 3 variables (base, accent, contrast) to generate entire themes, including automatic high-contrast accessibility variants.
- **Inverted-L chrome**: Sidebar + header form an L-shape framing the content. Minimal navigation choices -- the sidebar shows exactly what you need, not everything that exists.
- **Inter Display for headings**: Uses Inter Display for headings (more visual expression) and regular Inter for body text. Typography hierarchy supports the minimal aesthetic.
- **Opinionated workflow**: Rather than offering unlimited customization, Linear makes strong default choices that reduce decision fatigue. The workflow is designed, not configurable.
- **Component-based design system**: Large number of modular components, each designed for a specific content format. Not constrained by a traditional layout grid.
- **Subtle visual refinements**: Vertical and horizontal alignment of labels, icons, buttons. The kind of polish "you'll feel after a few minutes of using the app" rather than immediately see.
- **Dark mode as default**: Dark backgrounds using brand colors at 1-10% lightness (not pure black). Complex gradients for visual depth without clutter.

**Specific patterns to adopt for Vantage's agent management:**

- Kanban board styling: Clean cards with minimal information hierarchy
- Status indicators: Colored dots/borders, not status text labels
- Transition animations: Smooth drag-drop with spring physics
- Filter/sort controls: Inline above the board, not in a modal
- Keyboard shortcuts: Single-key actions within the kanban view

### 5.5 GitHub's Diff Viewer

**What to learn from GitHub:**

- **Unified / Split toggle**: A single button toggles between unified (single-column) and split (side-by-side) diff views. Both modes are first-class.
- **Line-level commenting**: Click a line number to add a comment. Essential for code review workflows.
- **File tree navigation**: Collapsible file tree on the left showing all changed files with change counts.
- **Expand collapsed sections**: Click to reveal hidden unchanged code around changes for more context.
- **Copy button per code block**: Quick access to copy code snippets.
- **Rich diff for non-code files**: Image diffs (side-by-side, onion skin, swipe), CSV diffs, notebook diffs.
- **"Viewed" checkmark per file**: Track progress through large diffs by marking files as reviewed.

**React libraries that replicate GitHub's diff UI:**

- `@mrrwangju/git-diff-view`: React/Vue/Solid component that replicates the GitHub diff view exactly, including split and unified modes
- `react-diff-view`: Supports split/unified modes with collapsed code expansion and syntax highlighting

---

## 6. Actionable Recommendations for Vantage

### 6.1 Layout Architecture

```
+---+---------------------------+---+
| A |        Title Bar          | W |
| c +----------+----------+----+ i |
| t | Primary  |          | Sec| n |
| i | Sidebar  |  Editor  | ond| d |
| v | (Files,  |  Area    | ary| o |
| i | Search,  | (Tabs,   | SB | w |
| t | Git,     |  Splits, | (AI|   |
| y | Agents)  |  Minimap)| Cht| C |
|   |          |          | )  | o |
| B +----------+----------+----+ n |
| a |        Panel              | t |
| r | (Terminal, Problems,      | r |
|   |  Output, Agent Log)       | o |
+---+---------------------------+ l |
|        Status Bar             | s |
+-------------------------------+---+
```

- Use **react-resizable-panels** (via shadcn/ui Resizable) for the primary split layout
- Evaluate **Dockview** for advanced docking, floating windows, and popout support
- Activity Bar: Left edge, 5 icons (Explorer, Search, Git, Agents, Settings)
- Primary Sidebar: View Containers for each Activity Bar item
- Secondary Sidebar: AI Chat / Agent panel (right side, toggleable)
- Panel: Terminal + Problems + Output (tabbed, bottom)
- Status Bar: Git + errors (left), line/col + language + agent status (right)

### 6.2 Component Stack

| Layer | Technology |
|-------|-----------|
| Layout shell | react-resizable-panels or Dockview |
| UI components | shadcn/ui (full component set) |
| Command palette | shadcn/ui Command (wraps cmdk) |
| Code editor | Monaco Editor (or CodeMirror 6) |
| Terminal | xterm.js with WebGL renderer |
| Diff viewer | react-diff-view + Monaco inline diff |
| File tree | Custom tree using shadcn primitives |
| Kanban board | dnd-kit (drag-and-drop) + custom cards |
| Notifications | Sonner (via shadcn) + Tauri system notifications |
| Icons | Lucide React (shadcn default) + Codicons for VS Code compatibility |
| Theming | CSS custom properties + Tailwind + LCH color generation |

### 6.3 Theme System

1. Ship with 3 built-in themes:
   - **Vantage Dark** (default): Based on Catppuccin Mocha palette with custom accent
   - **Vantage Light**: Based on Catppuccin Latte
   - **Vantage High Contrast**: WCAG AAA compliant, 7:1+ contrast ratios
2. Use CSS custom properties for all colors (enables runtime switching)
3. Use LCH color space for theme generation (3 variables: base, accent, contrast)
4. Support `prefers-color-scheme` and `prefers-contrast` media queries
5. Allow user theme customization via JSON settings file
6. Default font: JetBrains Mono (bundled), 14px, ligatures enabled

### 6.4 AI Integration Tiers

Implement Cursor's "autonomy slider" concept:

| Tier | Interaction | Vantage UX |
|------|------------|------------|
| **Tab completion** | Ghost text inline | Dimmed text at cursor, Tab to accept, Cmd+Right for partial, Escape to dismiss |
| **Inline edit** | Select + Cmd+K | Inline diff with accept/reject per hunk |
| **Chat** | Side panel | Streaming chat in Secondary Sidebar, with file/symbol @-mentions |
| **Agent** | Autonomous | Full agent panel with tool visualization, permission dialogs, checkpoint/restore |
| **Multi-agent** | Parallel orchestration | Kanban + timeline + tree views in dedicated Activity Bar section |

### 6.5 Priority Implementation Order

**Phase 1 (MVP):**
- Basic split layout (editor + sidebar + panel)
- Monaco editor with tabs and split views
- Integrated terminal (xterm.js)
- Command palette
- Single Claude Code session (chat + agent mode)
- Basic dark theme
- Essential keybindings (Tier 1)

**Phase 2 (Core AI Features):**
- Multi-agent kanban board
- Permission/approval dialogs
- Inline diff with per-hunk accept/reject
- Streaming AI output with thinking indicators
- File ownership visualization
- System notifications for agent events

**Phase 3 (Polish):**
- Floating windows and popout support
- Vim/Emacs keybinding modes
- Theme customization
- High contrast accessibility theme
- Git integration UI
- Session persistence and search
- Timeline and tree views for agents

**Phase 4 (Differentiation):**
- Coordinator/specialist agent hierarchies
- Conflict detection and resolution UI
- Shared agent sessions (collaboration)
- Design mode (point-and-prompt for UI)
- Background agents (cloud execution)

---

## Sources

### IDE UX and Layout
- [VS Code Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout)
- [VS Code User Interface](https://code.visualstudio.com/docs/getstarted/userinterface)
- [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [VS Code Activity Bar API](https://code.visualstudio.com/api/ux-guidelines/activity-bar)
- [VS Code Status Bar API](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [VS Code Sidebars API](https://code.visualstudio.com/api/ux-guidelines/sidebars)
- [VS Code Keyboard Shortcuts Reference](https://code.visualstudio.com/docs/configure/keybindings)
- [Visual Studio 2026 New UX](https://devblogs.microsoft.com/visualstudio/a-first-look-at-the-all-new-ux-in-visual-studio-2026/)

### AI IDE Design
- [Cursor Features](https://cursor.com/features)
- [Cursor Tab Completion Docs](https://cursor.com/docs/tab/overview)
- [Windsurf Cascade](https://windsurf.com/cascade)
- [Zed AI Agent Panel](https://zed.dev/docs/ai/agent-panel)
- [Zed Inline Assistant](https://zed.dev/docs/ai/inline-assistant)
- [Zed Between Editors and IDEs](https://zed.dev/blog/between-editors-and-ides)
- [GitHub Copilot Inline Suggestions](https://code.visualstudio.com/docs/copilot/ai-powered-suggestions)

### Multi-Agent UX
- [Vibe Kanban](https://vibekanban.com/)
- [Nimbalyst Features](https://nimbalyst.com/features/)
- [Parallel Coding Agents Comparison](https://www.morphllm.com/parallel-coding-agents)
- [Nimbalyst Kanban for AI Agents](https://nimbalyst.com/blog/claude-code-session-kanban-organize-ai-agents/)

### Design Systems
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- [shadcn/ui Resizable](https://ui.shadcn.com/docs/components/radix/resizable)
- [Dockview Layout Manager](https://dockview.dev/)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [Tauri UI (shadcn + Tauri)](https://github.com/agmmnn/tauri-ui)
- [Catppuccin Palette](https://catppuccin.com/palette/)
- [Linear UI Redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear Design Trend Analysis](https://blog.logrocket.com/ux-design/linear-design/)

### Typography and Fonts
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- [Fira Code](https://github.com/tonsky/FiraCode)
- [Best Coding Fonts 2026](https://www.ordoh.com/best-coding-fonts-2026/)

### Streaming and AI UX
- [AI UI Patterns (patterns.dev)](https://www.patterns.dev/react/ai-ui-patterns/)
- [GenAI Loading States (AWS Cloudscape)](https://cloudscape.design/patterns/genai/genai-loading-states/)
- [Streaming UI in AI Applications](https://thefrontkit.com/blogs/what-is-streaming-ui-in-ai-applications)

### Permission and Security
- [Claude Code Security](https://code.claude.com/docs/en/security)
- [OpenCode Permissions](https://opencode.ai/docs/permissions/)
- [AI Agent Access Control (WorkOS)](https://workos.com/blog/ai-agent-access-control)

### Diff Presentation
- [Inline Diff Approval UI (Claude Code)](https://github.com/anthropics/claude-code/issues/31395)
- [Code Surgery: How AI Assistants Make Edits](https://fabianhertwig.com/blog/coding-assistants-file-edits/)
- [react-diff-view](https://github.com/otakustay/react-diff-view)
- [git-diff-view](https://github.com/MrWangJustToDo/git-diff-view)
- [GitHub Split Diffs](https://github.blog/news-insights/product-news/introducing-split-diffs-in-github-desktop/)

### Architecture References
- [Zed GPUI Framework](https://zed.dev/blog/videogame)
- [Warp Architecture](https://www.warp.dev/blog/how-warp-works)
- [Warp 2.0 Agentic Environment](https://www.warp.dev/blog/reimagining-coding-agentic-development-environment)

### Accessibility
- [WCAG Keyboard Navigation](https://www.levelaccess.com/blog/keyboard-navigation-complete-web-accessibility-guide/)
- [VS Code Semantic Highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
- [Colorblind-Friendly Theme](https://github.com/givensuman/colorblind-theme)
- [Syntax Highlighting Color Selection](https://motlin.medium.com/how-to-pick-colors-for-a-syntax-highlighting-theme-96d3e06c19dc)
