# Comprehensive UI/UX Audit Report

**Date**: 2026-04-08
**Auditor**: Claude Opus 4.6 (automated visual + code audit)
**Method**: Live browser interaction via Playwright MCP against Vite dev server (mock mode)
**Screenshots**: `audit-screenshots/01-28` (28 screenshots captured)

---

## Executive Summary

Vantage presents a well-structured, feature-rich IDE shell with two distinct operational modes (Claude-first and IDE-first), comprehensive menu systems, and a deep command palette. The dark Catppuccin Mocha theme is polished. The mock layer covers **87% of Rust backend commands** (71/81), enabling meaningful browser-based testing. However, several UX issues, missing mock coverage (especially PTY/terminal), and layout concerns were identified.

**Severity Legend**: P0 = blocking, P1 = high-impact UX issue, P2 = medium, P3 = minor polish

---

## 1. Welcome Dialog & First-Run Experience

**Screenshot**: `01-welcome-dialog.png`, `02-welcome-dialog-detail.png`

### What Works
- Clean modal with three prerequisite checks (Node.js, Claude CLI, Git)
- Green checkmarks with version numbers in muted gray
- "Check Again" button with refresh icon, "Continue" with accent styling
- Proper backdrop overlay dimming the main UI

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 1 | P3 | "All prerequisites are met." is passive. Consider "Ready to go!" or "All systems ready" for a warmer first impression |
| 2 | P2 | No error/warning state was testable in mock — unclear what happens if a prerequisite fails. Needs red/yellow state with actionable guidance (e.g., "Install Node.js: https://nodejs.org") |
| 3 | P3 | Dialog lacks a version number or build info. Users filing bugs won't know which version they're on |

---

## 2. Title Bar & Top Navigation

**Screenshot**: `04-title-bar.png`, `07-file-menu.png` through `12-help-menu.png`

### Layout
```
[V logo] [File Edit View Go Terminal Help] [Claude | IDE toggle] [    Vantage    ] [_ [] X]
```

### What Works
- Custom Windows title bar with proper window controls (minimize, maximize, close)
- Claude/IDE mode toggle prominently placed with icon+text tabs
- "Vantage" title centered between menu bar and window controls
- All 6 menus functional with keyboard shortcuts displayed

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 4 | P2 | **Terminal menu items lack keyboard shortcuts**. "New Terminal", "Split Terminal", "Clear Terminal", "Kill Terminal" show no shortcuts. VS Code uses Ctrl+Shift+` for new terminal. These are high-frequency actions that need shortcuts |
| 5 | P3 | **Help menu is sparse** — only "Keyboard Shortcuts", "Documentation", "About Vantage". Missing: "Report Issue", "Release Notes", "Tips & Tricks" |
| 6 | P3 | "Go" menu feels like a VS Code carryover. Consider merging into "Edit" or "View" — 4 items don't justify their own menu |
| 7 | P2 | **Claude/IDE toggle position conflicts with menu bar** — it sits between the menu items and the window title. In a glance, it looks like a menu item rather than a mode switch. Consider moving it right of the title, or giving it more visual differentiation (e.g., a pill/segment control with stronger visual weight) |

---

## 3. Dual-Mode Layout (Claude vs IDE)

### Claude Mode
**Screenshot**: `03-main-ide-view.png`
```
[Activity Bar (4 icons)] [Chat Panel (full width)] [Terminal/Bottom Panel]
```
- 4 activity bar icons: Chat, Files, Agents, Settings
- Chat takes 100% of content area
- Bottom panel: Terminal, Browser, Verification tabs

### IDE Mode
**Screenshot**: `13-ide-mode.png`
```
[Activity Bar (7 icons)] [Sidebar] [Editor Area] [Chat Sidebar] [Terminal/Bottom]
```
- 7 activity bar icons: Explorer, Search, Source Control, Agents, Usage, Plugins + Settings at bottom
- File explorer sidebar, Monaco editor center, chat as right sidebar
- Welcome tab with breadcrumbs: `_vantage: > welcome`

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 8 | P1 | **Activity bar icons change completely between modes** — Claude mode has 4 icons (Chat, Files, Agents, Settings), IDE mode has 7 (Explorer, Search, Source Control, Agents, Usage, Plugins, Settings). This is disorienting. Users switching modes will lose spatial memory of where icons are |
| 9 | P1 | **No Source Control or Search in Claude mode activity bar**. These are high-frequency actions that shouldn't require switching to IDE mode. Consider a unified activity bar with optional collapse |
| 10 | P2 | **IDE mode opens a new terminal** (Terminal 2, Terminal 3) each time you switch modes, rather than reusing existing terminals. After a few toggles you accumulate orphaned terminal tabs |
| 11 | P2 | Claude mode header shows "CLAUDE" text + toolbar buttons. IDE mode header shows "CHAT" text + different toolbar. The naming is inconsistent — is it "Claude" or "Chat"? Pick one |
| 12 | P3 | Breadcrumbs in IDE mode show `_vantage: > welcome` with an underscore prefix. This looks like an internal path leaked into the UI |

---

## 4. Chat Panel & Claude Integration

**Screenshot**: `24-slash-commands.png`, `25-at-mentions.png`

### What Works
- Chat welcome screen with icon, heading, description, and 4 quick-action chips
- Quick-action chips have distinct icons: sparkle (Explain), bug (Find bugs), cube (Add feature), pencil (Write tests)
- Keyboard hints: `Ctrl+Shift+P Command palette`, `@ Mention files`, `/ Slash commands`
- @ mentions popup: @file (Browse), @selection, @terminal, @git, @folder
- / slash commands popup: well-organized alphabetical list with descriptions
- Chat input has thinking mode toggle (Auto), send button (disabled when empty)
- Header toolbar: Plan mode switch, Search, Execution map, Build & Review, Compact, Sessions

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 13 | P2 | **Send button shows no visual affordance** — it's just an icon with no tooltip visible. New users may not realize Shift+Enter is for newline vs Enter for send |
| 14 | P2 | **Chat input has leftover `@` character** after dismissing the @ menu with Escape. The popup closes but the trigger character remains, requiring manual deletion |
| 15 | P2 | **No visible session indicator** in Claude mode. The session status is only in the status bar at the very bottom ("Ready", "$0.0000"). New users won't notice it. Consider a subtle session badge near the chat header |
| 16 | P3 | **Quick-action chips layout** — 2 rows of 2 centered. Works for 4 items but won't scale. If more are added, consider a horizontal scroll or grid |
| 17 | P3 | The "Build & Review" button in the header uses an orange/accent color. This draws attention disproportionately — it looks like an alert or active state rather than a workflow trigger |

---

## 5. Command Palette

**Screenshot**: `23-command-palette.png`

### What Works
- Opens with Ctrl+Shift+P, standard IDE convention
- `>` prefix for commands, matching VS Code's convention
- 7 command categories: View (13), Preferences (7), Terminal (1), Editor (30+), Application (1), Help (1), File (1)
- 50+ total commands with keyboard shortcuts displayed
- Clean filtering and category headers

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 18 | P2 | **Terminal category has only 1 command** (New Terminal). Missing: Clear Terminal, Split Terminal, Kill Terminal, Focus Terminal. These exist in the Terminal menu but not the command palette |
| 19 | P2 | **No Claude/Chat commands** in the palette. Missing: New Session, Resume Session, Compact, Toggle Plan Mode, Set Effort Level, Switch Model. These are core Vantage workflows that should be palette-accessible |
| 20 | P3 | Application category has only "Check for Updates" and Help has only "Welcome". These feel empty. Consider merging into a single "General" category |
| 21 | P3 | Command palette doesn't support fuzzy search (e.g., typing "tb" to find "Toggle Primary Sidebar"). Standard in modern IDEs |

---

## 6. Sidebar Panels (IDE Mode)

### Explorer
**Screenshot**: `13-ide-mode.png`
- Shows "No folder open" with "Open Folder" button — correct empty state
- Clean icon + header treatment

### Search
**Screenshot**: `14-search-panel.png`
- Search input with case-sensitivity toggle (Aa) and sort button
- Minimal but functional

### Source Control
**Screenshot**: `15-source-control.png`
- Two tabs: "Source Control" and "History"
- Shows "Open a folder to view source control" — correct empty state

### Agents
**Screenshot**: `16-agents-panel.png`
- Kanban board: BACKLOG (0), IN PROGRESS (0), REVIEW (0), DONE (0)
- Header: "0 agents", "Build & Review" button, "+ Create Agent"
- View toggle buttons (grid/list)

### Usage
**Screenshot**: `17-usage-panel.png`
- Time range tabs: Last 7d, Last 30d, All time
- Summary cards (4) with icons
- Detail cards: Daily Cost, Cost by Model, Sessions per Day

### Plugins
**Screenshot**: `18-plugins-panel.png`
- Installed Plugins (2): context7 v1.2.0, chrome-devtools-mcp v2.0.1
- User Skills (1): my-workflow
- "Store" button for browsing available plugins

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 22 | P1 | **Usage panel overflows the sidebar width**. Summary cards are cut off on the right side — text like "Total..." is truncated. The Usage panel was designed for a wider area and doesn't adapt to sidebar constraints |
| 23 | P2 | **Search panel lacks a "Replace" toggle** visible in the sidebar. The replace-in-files feature exists (Ctrl+Shift+F routes to it) but the sidebar search panel only shows search |
| 24 | P3 | **Agents panel**: The Kanban column headers (BACKLOG, IN PROGRESS, REVIEW, DONE) are ALL CAPS, which feels heavy. Consider sentence case or title case for a calmer visual |
| 25 | P3 | **Plugins panel**: Version badges (v1.2.0, v2.0.1) are hard to read — small blue text on dark background. Consider a subtle bordered badge |

---

## 7. Settings Panel

**Screenshot**: `19-settings-panel.png`, `21-keybindings.png`, `22-claudemd-editor.png`

### What Works
- Three well-organized tabs: Preferences, Keybindings, CLAUDE.md
- Preferences: Searchable, grouped by Appearance + Editor sections
- 15+ settings with appropriate controls (toggles, dropdowns, number inputs)
- Keybindings: Tabular layout with Command, Keybinding columns, edit icons
- CLAUDE.md: Shows helpful "Open a project folder to edit CLAUDE.md" message

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 26 | P2 | **Settings tab label "CLAU..." is truncated** — it shows "CLAU" instead of "CLAUDE.md". The tab area is too narrow. Consider an icon-only approach or abbreviating to "CLAUDE" |
| 27 | P2 | **Settings panel is not scrollable** or scroll didn't work correctly — the Vim Mode toggle at the bottom was barely visible, suggesting content extends past the viewport with no clear scroll indicator |
| 28 | P3 | **No "Reset to defaults" button** anywhere in settings. Users who change multiple settings have no quick way to restore defaults |
| 29 | P3 | **Keybindings page**: The third column header ("Shortcut" or something) is cut off. Need to verify column widths adapt to sidebar size |

---

## 8. Terminal Panel

**Screenshot**: `03-main-ide-view.png` (bottom panel)

### What Works
- Three panel tabs: Terminal, Browser, Verification
- Terminal tabs with shell type indicator (PowerShell)
- Action buttons: New Terminal (+), Clear, Split, Maximize, Close (Ctrl+J)
- Tab close buttons per terminal

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 30 | P1 | **Terminal shows "Process exited with code null"** immediately. In browser mock mode, the PTY plugin is completely unmocked, causing: (1) spawn returns null, (2) read attempts fail, (3) xterm throws TypeError. Users testing in browser mode see a broken terminal |
| 31 | P1 | **Console error in mock mode**: `TypeError: Cannot read properties of null (reading 'length')` at `useTerminal.ts:68`. The terminal hook doesn't guard against null PTY data |
| 32 | P2 | **Terminal accumulates on mode switch** — switching Claude/IDE modes creates new terminal instances (Terminal 1, Terminal 2, Terminal 3...) without cleaning up |

---

## 9. Status Bar

**Screenshot**: `05-status-bar.png`

### Layout (Claude Mode)
```
Left:  [0 errors] [0 warnings] [turtle zzz...] [bell] [46%] [not indexed icon]
Right: [Ln 1, Col 1] [Wrap: Off] [Plain Text] [Ready] [$0.0000] [High v] [opus-4-6]
```

### Layout (IDE Mode — additional items)
```
Right: [Ln 1, Col 1] [LF] [UTF-8] [Spaces: 2] [Wrap: Off] [Plain Text] [Ready] [$0.0000] [High v] [opus-4-6]
```

### What Works
- Every item is a button with click action (excellent!)
- Inkwell turtle widget (zzz... when idle)
- Error/warning counters with icons
- Session cost tracking ($0.0000)
- Effort level selector with dropdown arrow
- Model indicator (opus-4-6)

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 33 | P2 | **46% indicator is cryptic**. It represents plan usage (from mock data) but has no label or tooltip visible at a glance. A battery-style icon helps but most users won't know what "46%" means without hovering |
| 34 | P2 | **"Project not indexed" indicator** is just a small icon with no text. New users won't understand this icon. Consider adding text or making it a clickable "Index Project" action |
| 35 | P3 | **Inkwell turtle** takes real estate in the status bar. While charming, "turtle zzz..." doesn't convey useful information. Consider making it appear only on hover or in a tooltip |
| 36 | P3 | **Status bar items differ between Claude and IDE modes** — IDE mode adds LF, UTF-8, Spaces:2 that Claude mode doesn't show. This makes sense contextually but is another inconsistency between modes |

---

## 10. Theme Support

**Screenshots**: `03-main-ide-view.png` (dark), `27-light-theme.png` (light), `28-high-contrast.png` (high contrast)

### What Works
- Three themes: Dark (Catppuccin Mocha), Light (Catppuccin Latte), High Contrast (WCAG AAA)
- Theme switching via command palette works instantly
- All UI elements adapt to theme changes

### Issues
| # | Severity | Issue |
|---|----------|-------|
| 37 | P2 | **Dev Panel overlay doesn't respect theme** — remains dark-styled in light/high-contrast modes. Minor since it's dev-only, but worth noting for consistency |
| 38 | P3 | **High Contrast theme is visually similar to Light theme** in the screenshot. Expected more dramatic contrast differences (black backgrounds, bright borders). May need stronger differentiation to serve its WCAG AAA purpose |

---

## 11. Frontend-Backend Connectivity Analysis

### Rust Backend Commands: 81 total
(78 in `lib.rs` + 3 in `workspace.rs`)

### Mock Coverage: 71 of 81 commands (87.6%)

### Commands WITHOUT Mocks (10 commands)
These return `null` silently in browser mode:

| Command | Category | Impact |
|---------|----------|--------|
| `create_checkpoint` | Checkpoints | Agent checkpoint creation silently fails |
| `list_checkpoints` | Checkpoints | Session timeline shows no checkpoints |
| `detect_quality_gates` | Merge Queue | Quality gate detection returns null |
| `run_quality_gate` | Merge Queue | Running gates fails silently |
| `merge_branch` | Merge Queue | Merge operations fail silently |
| `get_default_shell` | Terminal | Falls back to null instead of a default |
| `get_session_stats` | Analytics | Session stats panel shows empty data |
| `get_worktree_disk_usage` | Worktrees | Disk usage display shows nothing |
| `list_worktrees` | Worktrees | Worktree list always empty |
| `remove_worktree` | Worktrees | Removal silently fails |

### Unmocked Plugin Commands (critical gap)
The PTY (terminal) plugin is completely unmocked:
- `plugin:pty|spawn` — terminal creation fails
- `plugin:pty|read` — reading terminal output fails with TypeError
- `plugin:pty|write` — not called (no shell to write to)
- `plugin:pty|resize` — no-ops on null
- `plugin:pty|kill` — no-ops on null
- `plugin:pty|exitstatus` — returns null

**Result**: Terminal panel is non-functional in browser mock mode, showing "Process exited with code null" and generating console errors.

### Frontend-Only Features (UI exists, no real backend)
These features render UI from mock data but would need real Tauri to function:
1. **File explorer tree** — shows mock file tree, not real filesystem
2. **Monaco editor content** — shows hardcoded sample content
3. **Git operations** — all return mock data (branch "main", empty status)
4. **Plugin list** — shows hardcoded context7 + chrome-devtools-mcp
5. **Usage analytics** — returns empty arrays (shows "No data available")
6. **Claude chat** — session starts (mock ID) but no real Claude process

### Backend-Only Features (Rust exists, no visible UI / never invoked)
1. `get_worktree_disk_usage` — no UI element displays disk usage
2. `get_session_stats` — bindings wrapper exists but never invoked from any component
3. `get_default_shell` — terminal uses `list_shells` instead; this command is dead code
4. `create_checkpoint` — bindings wrapper exists but never invoked (only restore/delete are called)
5. `list_checkpoints` — bindings wrapper exists but never called from UI
6. `list_worktrees` — bindings wrapper exists but never invoked from UI

### Broken Subsystems in Browser Mode (no mock, UI exists)
1. **Checkpoint system** — `CheckpointControls.tsx` calls restore/delete (mocked) but create/list have NO mock. Users can delete checkpoints but never see or create them
2. **Merge queue** — `MergeQueuePanel.tsx` calls `run_quality_gate`, `detect_quality_gates`, `merge_branch` — all 3 unmocked. Quality gate verification completely non-functional
3. **Session search** — returns empty arrays; session search panel shows no results

### Top invoke() Callers (by frequency)
| Command | Files Calling It | Total Invocations |
|---------|-----------------|-------------------|
| `get_file_tree` | 7 files (MentionAutocomplete, EditorArea, SpecViewer, CommandPalette, useFileTree, useCrossFileIntelligence, mentionResolver) | 7+ |
| `write_file` | 5 files (EditorTabs, MultiFileDiffReview, PopoutEditor, menuDefinitions, ipc) | 6+ |
| `claude_send_message` | 4 files (useClaude, useClaudeSession, useAgentRouting, quickQuestion) | 5+ |
| `stop_file_watcher` | 2 files (useFileTree, workspace) | 4+ |
| `claude_start_session` | 3 files (useClaude, useAgentRouting, useClaudeSession) | 3+ |

---

## 12. Console Errors Observed

| Time | Error | Source |
|------|-------|--------|
| 6.4s | `TypeError: Cannot read properties of null (reading 'length')` | `useTerminal.ts:68` — xterm tries to write null PTY data |
| Repeated | Same TypeError on every mode switch | PTY spawn returns null in mock |

**Root Cause**: `useTerminal.ts:68` calls `terminal.write(data)` without guarding `data` for null. The PTY mock returns null for `read`, which xterm cannot handle.

**Fix**: Add `if (data != null) terminal.write(data)` guard in `useTerminal.ts:68`.

---

## 13. Design & Aesthetic Assessment

### Strengths
- **Catppuccin Mocha** is an excellent dark theme choice — warm, readable, distinctive from VS Code's cold blue-gray
- **Activity bar icons** are clean and well-differentiated (Lucide icon set)
- **Chat welcome screen** is inviting with centered layout and helpful quick-actions
- **Status bar** is information-dense without feeling cluttered
- **Menu dropdowns** have good spacing, icon alignment, and shortcut display
- **Command palette** categorization is superior to VS Code's flat list

### Concerns
- **Two-mode identity crisis** — Claude mode and IDE mode feel like two different apps. The activity bar, headers, sidebar content, and even status bar items change. Consider a unified layout with configurable panel visibility
- **Information density varies wildly** — the Usage panel tries to cram charts into a sidebar, while the Claude mode chat area has vast empty space. Layout should adapt to content needs
- **Dev Panel** sticks around unless manually closed. It overlaps the header toolbar buttons (Build & Review, Compact, Sessions are hidden behind it). This is a dev-mode-only concern but still a usability gap

---

## 14. Recommendations (Priority-Ordered)

### P0 — Must Fix
1. **Add PTY mock** to `tauriMock.ts` — mock `plugin:pty|spawn/read/write/kill/resize/exitstatus` so the terminal doesn't error in browser mode
2. **Guard null PTY data** in `useTerminal.ts:68` — add null check before `terminal.write()`

### P1 — High Impact
3. **Unify the activity bar** between Claude and IDE modes — use the same 7 icons with context-appropriate content
4. **Fix Usage panel sidebar overflow** — make the summary cards wrap or stack vertically
5. **Add 10 missing mock handlers** for checkpoints, merge queue, worktrees, session stats, default shell

### P2 — Medium Impact
6. Add keyboard shortcuts to Terminal menu items
7. Add Claude/Chat commands to the command palette (New Session, Resume, Compact, etc.)
8. Fix Claude/IDE mode toggle position — differentiate it from menu items
9. Fix the CLAUDE.md tab truncation in Settings
10. Make the 46% plan usage indicator self-explanatory (add label or tooltip)
11. Prevent terminal tab accumulation on mode switch
12. Clean up `@` character persistence after dismissing @ menu

### P3 — Polish
13. Warm up the welcome dialog message
14. Add version info to welcome dialog
15. Merge sparse menu categories (Go into Edit/View, Application+Help into General)
16. Make Inkwell turtle less intrusive in status bar
17. Improve High Contrast theme differentiation from Light theme
18. Clean up breadcrumb `_vantage:` prefix in IDE mode

---

## Appendix: Screenshot Index

| # | Filename | Content |
|---|----------|---------|
| 01 | `01-welcome-dialog.png` | Full-screen welcome dialog |
| 02 | `02-welcome-dialog-detail.png` | Welcome dialog zoomed |
| 03 | `03-main-ide-view.png` | Main Claude mode view |
| 04 | `04-title-bar.png` | Title bar detail |
| 05 | `05-status-bar.png` | Status bar detail |
| 06 | `06-activity-bar.png` | Activity bar (Claude mode) |
| 07 | `07-file-menu.png` | File menu dropdown |
| 08 | `08-edit-menu.png` | Edit menu dropdown |
| 09 | `09-view-menu.png` | View menu dropdown |
| 10 | `10-go-menu.png` | Go menu dropdown |
| 11 | `11-terminal-menu.png` | Terminal menu dropdown |
| 12 | `12-help-menu.png` | Help menu dropdown |
| 13 | `13-ide-mode.png` | Full IDE mode view |
| 14 | `14-search-panel.png` | Search sidebar |
| 15 | `15-source-control.png` | Source Control sidebar |
| 16 | `16-agents-panel.png` | Agents Kanban board |
| 17 | `17-usage-panel.png` | Usage Analytics panel |
| 18 | `18-plugins-panel.png` | Plugins panel |
| 19 | `19-settings-panel.png` | Settings - Preferences |
| 20 | `20-settings-scrolled.png` | Settings scrolled |
| 21 | `21-keybindings.png` | Settings - Keybindings |
| 22 | `22-claudemd-editor.png` | Settings - CLAUDE.md |
| 23 | `23-command-palette.png` | Command Palette |
| 24 | `24-slash-commands.png` | Chat / slash commands |
| 25 | `25-at-mentions.png` | Chat @ mentions |
| 26 | `26-dev-panel.png` | Dev Panel overlay |
| 27 | `27-light-theme.png` | Light theme (Catppuccin Latte) |
| 28 | `28-high-contrast.png` | High Contrast theme |

---

## Appendix: Full Rust Command Inventory (81 commands)

**File Operations (8)**: get_file_tree, get_directory_children, read_file, write_file, create_file, create_dir, delete_file, delete_dir, rename_path, format_file, start_file_watcher, stop_file_watcher

**Git Operations (18)**: get_git_branch, get_git_status, git_log, git_blame, git_diff_commit, git_diff_working, git_diff_staged, git_diff_stat, git_show_file, git_stage, git_unstage, git_commit, git_push, git_pull, git_create_branch, git_list_branches, git_checkout_branch, get_worktree_changes

**Claude Session (12)**: claude_start_session, claude_send_message, claude_respond_permission, claude_interrupt_session, claude_stop_session, claude_stop_all_sessions, claude_list_active_sessions, claude_is_session_alive, claude_list_sessions, claude_single_shot, search_sessions, get_project_usage

**Merge Queue (4)**: detect_quality_gates, run_quality_gate, merge_branch, rebase_branch

**Worktrees (6)**: create_worktree, list_worktrees, remove_worktree, get_agent_worktree_path, get_agent_branch_name, get_worktree_disk_usage

**Checkpoints (4)**: create_checkpoint, list_checkpoints, restore_checkpoint, delete_checkpoint

**Search (2)**: search_project, replace_in_files

**Settings & Config (6)**: read_claude_settings, write_claude_settings, read_mcp_config, write_mcp_config, read_theme_file, write_theme_file, get_theme_file_path

**Plugins (4)**: list_installed_plugins, list_installed_skills, get_plugin_config, toggle_plugin, install_plugin

**Analytics (4)**: get_analytics, get_plan_usage, get_pr_list, get_session_stats

**Workspace (3)**: read_workspace_file, write_workspace_file, list_workspace_files

**System (5)**: check_prerequisites, list_shells, get_default_shell, index_project, get_project_index
