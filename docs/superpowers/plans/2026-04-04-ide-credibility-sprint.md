# Sprint: IDE Credibility

**Date:** 2026-04-04
**Predecessor:** Wire-the-Gap sprint (completed)
**Goal:** Make Vantage feel like a real IDE, not a prototype with nice scaffolding

---

## Context

The Wire-the-Gap sprint delivered:
- Monaco TS intelligence (autocomplete, hover, diagnostics)
- @-mentions in chat (@file, @selection, @terminal, @git, @folder)
- Git write operations + Source Control panel
- Format on save, editor split, replace in files
- 26 slash commands with local handlers
- Quick question wired to Claude
- Workspace model with per-project persistence

The market research is blunt: "LSP/autocomplete are non-negotiable for IDE credibility" and "speed of execution matters more than feature completeness." The feature gap report identifies the remaining daily-driver pain points. This sprint targets the items that make a developer open Vantage and think "this is a real tool" rather than "this is impressive for a prototype."

**Sprint duration:** 2 weeks
**Priority logic:** Each task was selected because a developer would hit the gap multiple times per day. Cosmetic or niche features are excluded.

---

## Tasks

### 1. Hooks Management UI (P0 -- Claude Code differentiator)

**Why:** Hooks (PreToolUse, PostToolUse, Notification, Stop) are what make Claude Code sticky for power users. Auto-approve patterns, post-edit lint runs, custom validations. Zero support currently despite hooks being a core Claude Code feature. The feature gap report ranks this #6 overall, but for the "delegator" audience (our target), it is arguably top 3.

**What to build:**
- New `HooksManager` component under `src/components/settings/`
- Read/write `~/.claude/settings.json` hooks array via new Rust commands (`read_hooks_config`, `write_hooks_config`)
- List existing hooks with event type, matcher pattern, and command
- Add/edit/delete individual hooks with a form (event dropdown, matcher glob input, command input)
- Add a "Hooks" tab to `SettingsPanel` (currently has: CLAUDE.md, MCP Servers, Plugins, Spec Viewer)
- Show active hook count in the status bar near the connection indicator

**Rust backend:** `src-tauri/src/plugins.rs` already reads `settings.json` and parses hook metadata from plugin manifests. Extend with dedicated `read_hooks_config` / `write_hooks_config` commands that target the top-level `hooks` key in `~/.claude/settings.json`.

**Acceptance criteria:**
- Can view all configured hooks
- Can add a new hook (PreToolUse, PostToolUse, Notification, Stop events)
- Can edit matcher pattern and command for existing hooks
- Can delete a hook
- Changes persist to `~/.claude/settings.json`

**Effort:** 3-4 days

---

### 2. Editor Breadcrumb Navigation -- Make It Interactive (P0 -- navigation)

**Why:** Breadcrumbs already render in `EditorArea.tsx` but they are static text. In every real IDE, clicking a breadcrumb segment opens a dropdown showing sibling files/folders for fast navigation. Without this, breadcrumbs are decorative.

**What to build:**
- Make each breadcrumb segment clickable
- On click, show a dropdown listing sibling entries at that directory level (from `get_directory_children`)
- Clicking a sibling file opens it in the editor; clicking a sibling folder navigates the breadcrumb
- Show the current symbol name as the rightmost breadcrumb segment (use Monaco's `DocumentSymbolProvider` via `editor.getModel()?.getLanguageId()` and `monaco.languages.getDocumentSymbolProvider()`)

**Acceptance criteria:**
- Clicking a directory segment in the breadcrumb shows sibling files/folders
- Clicking a file in the dropdown opens it
- Symbol breadcrumb segment appears for TS/JS files (function/class name at cursor)

**Effort:** 2 days

---

### 3. Go-to-Definition Cross-File (P0 -- code intelligence)

**Why:** Monaco's TS worker provides go-to-definition within a single file, but cross-file navigation requires the TS worker to know about other project files. Without this, F12/Ctrl+Click on an import does nothing -- the single most frustrating gap for any TypeScript developer.

**What to build:**
- On workspace open, scan `tsconfig.json` (or infer from project root) and register key project files with `monaco.languages.typescript.typescriptDefaults.addExtraLib()` so the TS worker resolves cross-file imports
- Use the project index (`get_project_index`) to identify `.ts`/`.tsx` files and feed their contents to the TS worker
- Register a `DefinitionProvider` fallback for non-TS languages that does a regex-based symbol search (using the existing `project_search` Rust command) and opens the result
- Wire `editor.addAction` for "Go to Definition" (F12) and "Peek Definition" (Alt+F12) to Monaco's built-in definition lookup, which will now resolve cross-file

**Acceptance criteria:**
- F12 on an imported symbol navigates to its definition in another file
- Ctrl+Click on an import opens the target file
- Works for TS/JS imports within the project

**Effort:** 3-4 days

---

### 4. Conversation Search and Message Editing (P1 -- chat usability)

**Why:** Long Claude conversations become unusable without search. And the inability to edit a sent message and regenerate from that point means every typo or unclear prompt requires a new message, wasting tokens and breaking flow.

**What to build:**
- **Conversation search:** Add a search input at the top of `ChatPanel` (Ctrl+Shift+F in chat panel). Filter messages by text content. Highlight matches and scroll-to-match.
- **Message editing:** Add an "Edit" button on user messages in `MessageBubble`. Clicking it makes the message editable inline. On save, truncate the conversation to that point and re-send the edited message to Claude.
- **Response regeneration:** Add a "Regenerate" button on the last assistant message. Re-sends the last user message.

**Acceptance criteria:**
- Can search conversation text and jump to matching messages
- Can edit a previously sent user message
- Editing a message truncates history and re-sends
- Can regenerate the last assistant response

**Effort:** 3-4 days

---

### 5. Terminal Split and Find (P1 -- terminal parity)

**Why:** Developers frequently need two terminals visible simultaneously (e.g., dev server + test runner). And searching terminal output for an error message is a constant operation. Both are missing.

**What to build:**
- **Split terminal:** Add a split button to `TerminalPanel` toolbar. Splits the terminal area horizontally, showing two `TerminalInstance` components side by side. Each gets its own PTY session.
- **Terminal find:** Add Ctrl+F search within terminal output using xterm.js `SearchAddon`. Show a find bar overlay similar to Monaco's find widget.
- **Shell profiles:** The shell picker dropdown already exists (reads `get_default_shell`). Extend it to show all detected shells (PowerShell, Git Bash, CMD, WSL if available) with icons and allow setting a default.

**Acceptance criteria:**
- Can split terminal view to show two terminals side by side
- Can Ctrl+F to search within terminal output
- Shell picker shows all detected shells

**Effort:** 3 days

---

### 6. Settings Editor (P1 -- configuration)

**Why:** The current `SettingsPanel` only has CLAUDE.md, MCP Servers, Plugins, and Spec Viewer. There is no way to view or edit Vantage's own settings (font size, theme, tab size, etc.) through the UI -- users have to know about the Zustand store defaults. Every IDE has a settings UI.

**What to build:**
- New `GeneralSettings` component that renders the settings from `useSettingsStore` as a searchable, categorized form
- Categories: Editor (font, tab size, word wrap, minimap, line numbers, vim mode), Appearance (theme, font size), Terminal (default shell, font size), Chat (ultrathink default, effort level), Formatting (format on save, formatter)
- Each setting shows its current value, a control (toggle, dropdown, number input), and a reset-to-default button
- Search box at the top to filter settings by name
- Add as the first tab in `SettingsPanel` (rename current panel to "Preferences" with General as default view)

**Acceptance criteria:**
- All Zustand settings store values are viewable and editable through the UI
- Settings persist across sessions (via workspace store)
- Can search/filter settings by name
- Reset individual settings to defaults

**Effort:** 2-3 days

---

### 7. Keyboard Shortcuts Viewer and Editor (P2 -- power users)

**Why:** `useKeybindings.ts` defines all keyboard shortcuts but there is no way to discover or customize them. Power users expect a keybindings panel.

**What to build:**
- New `KeybindingsPanel` component showing all registered keybindings in a searchable table (columns: Command, Keybinding, Source)
- Read the current bindings from `useKeybindings` definitions
- Allow overriding individual bindings via a `keybindings.json` file in the workspace (read/write through the workspace store's file persistence)
- "Record shortcut" mode: click a binding's key cell, press the desired keys, save
- Add to command palette: "Open Keyboard Shortcuts"

**Acceptance criteria:**
- Can view all keybindings in a searchable table
- Can override a keybinding with a custom key combination
- Overrides persist in workspace config

**Effort:** 2-3 days

---

### 8. Status Bar -- Clickable and Contextual (P2 -- polish)

**Why:** The status bar shows useful info (branch, cursor, language, cost, vim mode) but most items are not clickable. In VS Code, every status bar item does something on click. This is a small thing that makes a big impression.

**What to build:**
- **Git branch click:** Opens the branch picker (quick-switch or create branch) via command palette filtered to git commands
- **Language click:** Opens language mode picker (Monaco's `editor.getAction('editor.action.changeLanguageMode')`)
- **Errors/Warnings click:** Opens the Problems panel (or scrolls to first diagnostic in the active file)
- **Line/Col click:** Opens "Go to Line" dialog (`editor.getAction('editor.action.gotoLine')`)
- **Encoding/EOL indicators:** Add encoding (UTF-8) and EOL (LF/CRLF) display with click-to-change
- **Notification bell:** Add a notification icon that shows unread count from toast history; clicking opens a notification history dropdown

**Acceptance criteria:**
- All status bar items respond to click with a relevant action
- Notification bell shows count and history dropdown
- Encoding and EOL indicators present

**Effort:** 2 days

---

### 9. Minimap Click Navigation and Bracket Matching (P2 -- editor feel)

**Why:** The minimap renders but clicking a region in it does not scroll to that location. Bracket matching highlights exist (via `bracketPairColorization`) but there is no "Jump to Matching Bracket" command. Both are small but signal "real editor."

**What to build:**
- **Minimap navigation:** This should already work with Monaco's built-in minimap -- verify and fix if broken. The `minimap: { enabled: minimapEnabled }` option is set but confirm that `minimap.renderCharacters`, `minimap.side`, and click-to-scroll all work. If the minimap slider is not draggable, check if `minimap.showSlider: 'always'` is needed.
- **Jump to matching bracket:** Register a keybinding (Ctrl+Shift+\) that invokes Monaco's built-in `editor.getAction('editor.action.jumpToBracket')`. Add to command palette.
- **Bracket pair guides:** Already enabled via `guides.bracketPairs`. Verify the visual rendering matches the theme colors.

**Acceptance criteria:**
- Clicking minimap scrolls to that location
- Ctrl+Shift+\ jumps to matching bracket
- Bracket pairs visually highlighted with theme-consistent colors

**Effort:** 1 day (mostly verification, minimal new code)

---

### 10. Notification Center (P2 -- system coherence)

**Why:** Vantage uses `sonner` toasts for notifications, but they are ephemeral -- once dismissed, they are gone. A notification center aggregates all notifications (file save confirmations, git operations, Claude responses, errors) into a reviewable list. This matters because Claude operations can be long-running and a user who steps away needs to see what happened.

**What to build:**
- New `notificationStore` (Zustand) that captures all `toast()` calls with timestamp, type, and message
- `NotificationCenter` component: a dropdown panel anchored to the status bar bell icon (from task 8)
- Shows last 50 notifications, grouped by time (Today, Earlier)
- Click a notification to navigate to the relevant context (file, chat message, terminal)
- "Clear all" and "Mark all read" actions
- Badge count on the bell icon for unread notifications

**Acceptance criteria:**
- All toast notifications are captured in the store
- Notification center shows history with timestamps
- Unread badge count updates in real time
- Can clear notification history

**Effort:** 2 days

---

## Sprint Summary

| # | Task | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | Hooks management UI | P0 | 3-4d | Claude Code power users need this |
| 2 | Interactive breadcrumbs | P0 | 2d | Navigation fundamentals |
| 3 | Go-to-definition cross-file | P0 | 3-4d | "Is this a real IDE?" litmus test |
| 4 | Conversation search + edit + regen | P1 | 3-4d | Chat usability for long sessions |
| 5 | Terminal split + find | P1 | 3d | Terminal parity |
| 6 | Settings editor UI | P1 | 2-3d | Configuration without guessing |
| 7 | Keybindings viewer/editor | P2 | 2-3d | Power user expectation |
| 8 | Status bar -- clickable | P2 | 2d | Polish that signals quality |
| 9 | Minimap + bracket matching | P2 | 1d | Editor feel verification |
| 10 | Notification center | P2 | 2d | System coherence |

**Total estimated effort:** 23-30 dev-days (~2 weeks at pace)

---

## What This Sprint Does NOT Include (and Why)

- **LSP for non-TS languages:** Cross-file go-to-definition (task 3) addresses the TS/JS case, which covers Vantage's own codebase and most of the target audience. Full LSP client infrastructure for Rust/Python/Go is a multi-week effort that belongs in a dedicated "Language Intelligence" sprint.
- **Inline AI autocomplete (ghost text):** Requires direct API integration, breaking the CLI-only architecture. Phase 6 material per the feature gap analysis.
- **Debugging (DAP):** 3-6 months of effort. Developers can keep VS Code open for debugging.
- **Multi-provider / BYOK:** Important strategically but not an IDE credibility issue. Next sprint.
- **Plugin/extension API:** Person-years of effort. Not now.

---

## Exit Criteria

After this sprint, a developer should be able to:
1. Configure Claude Code hooks without leaving Vantage
2. Navigate a TypeScript codebase using F12 / go-to-definition across files
3. Click breadcrumbs to navigate the file tree
4. Search their conversation history and edit/regenerate messages
5. Run two terminals side by side and search terminal output
6. Change any Vantage setting through a proper settings UI
7. Discover and customize keyboard shortcuts
8. Click any status bar item and have it do something useful
9. Review missed notifications in a notification center

If those nine things work, Vantage stops feeling like a prototype and starts feeling like a daily-driver IDE for Claude Code power users.

---

## Sequencing Recommendation

**Week 1 (P0 + start P1):** Tasks 1, 2, 3, 6 -- hooks UI, breadcrumbs, go-to-def, settings editor. These are the hardest and highest impact. Go-to-definition (task 3) has the most unknowns (TS worker file registration limits, performance with large projects) so start it early.

**Week 2 (P1 + P2):** Tasks 4, 5, 7, 8, 9, 10 -- chat improvements, terminal improvements, keybindings, status bar, minimap verification, notification center. These are more straightforward UI work with fewer backend unknowns.

Tasks 8, 9, and 10 can be parallelized. Task 9 is mostly verification work and may take under an hour if Monaco's defaults already work correctly.
