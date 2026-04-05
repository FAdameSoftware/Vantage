# Cool Features Sprint -- Steal the Best Ideas

**Date:** 2026-04-04
**Sprint goal:** Take the 10 coolest features from Cursor, Zed, Warp, Opcode, claude-devtools, cmux, and others. Build them into Vantage. No strategy, no "differentiation" -- just things that would make using Vantage every day genuinely fun.
**Estimated effort:** 3-4 weeks (10 tasks, parallelizable across 3 tracks)

---

## What We Already Have (so we don't rebuild it)

| Feature | Status | Commit |
|---------|--------|--------|
| @-mentions (@file, @selection, @terminal, @git, @folder) | Done | 1da7ff9 |
| Monaco TS intelligence (autocomplete, errors, hover) | Done | 120920a |
| Cross-file go-to-definition | Done | 293ea6b |
| Breadcrumb navigation | Done | 81fc43b |
| Terminal split view + find bar | Done | a561719 |
| Agent kanban board | Done | 6728033 |
| Checkpoint system (git tag based) | Done | backend exists |
| Usage analytics dashboard | Done | phase 8 |
| Multi-file diff review | Done | febc083 |
| Format on save (Prettier) | Done | 8b2b5bc |
| Editor split groups | Done | 447d312 |
| Git write ops (stage, commit, push, pull, branch) | Done | a3f4a3e |
| Notification center | Done | 887ff42 |

---

## The 10 Features We're Stealing

### Task 1: Inline AI Edit (Cmd+K / Ctrl+K)

**Stolen from:** Cursor
**What it does:** Select some code, press Ctrl+K, type a natural language instruction ("add error handling", "convert to async", "add types"), and Claude rewrites just that selection. The diff appears inline -- accept or reject with one keystroke.
**Why it's cool:** This is the single most-used AI feature in Cursor. It turns Claude from a chat buddy into a surgical editing tool. You never leave the editor.

#### Implementation

1. Register `Ctrl+K` keybinding in `MonacoEditor.tsx` that captures current selection
2. Show a floating input bar above the selection (like Monaco's find widget but for prompts)
3. On submit, send the selected code + prompt + surrounding file context to Claude CLI with `--print` flag (single-shot, no conversation)
4. Parse the response, create a Monaco inline diff decoration showing old vs. new
5. Accept (Enter) applies the edit, Reject (Escape) restores original
6. If no selection, treat it as "edit at cursor position" (generate code from prompt)

#### Files to create/modify

- `src/components/editor/InlineEditBar.tsx` -- floating prompt input widget
- `src/components/editor/InlineEditDiff.tsx` -- inline diff decorations
- `src/hooks/useInlineEdit.ts` -- orchestrates selection capture, Claude call, diff display
- `src/components/editor/MonacoEditor.tsx` -- register Ctrl+K action
- `src-tauri/src/claude/mod.rs` -- add `claude_single_shot` command (one-off `claude --print`)

#### Acceptance criteria

- [ ] Ctrl+K with selection shows floating prompt bar
- [ ] Ctrl+K without selection shows prompt bar at cursor line
- [ ] Submitting prompt shows inline diff within 2-3 seconds
- [ ] Enter accepts, Escape rejects
- [ ] Works on any file type, not just TypeScript

---

### Task 2: Command Blocks in Terminal

**Stolen from:** Warp
**What it does:** Instead of a wall of scrollback text, the terminal groups output by command. Each command you run becomes a collapsible "block" with a header showing the command, exit code, and duration. You can copy the output of a single command, re-run it, or bookmark it.
**Why it's cool:** Terminal scrollback is chaos. Command blocks turn it into structured, scannable history. You can find "that build output from 5 minutes ago" instantly.

#### Implementation

1. Use xterm.js shell integration sequences (OSC 133) to detect command start/end boundaries
2. When a command boundary is detected, create a block object: `{ command, startLine, endLine, exitCode, duration, timestamp }`
3. Render block headers as xterm.js decorations (or overlay divs positioned via terminal viewport)
4. Add a "blocks" sidebar/overlay in `TerminalTabs.tsx` listing all commands with timestamps
5. Click a block header to scroll to it; click "copy" to copy just that block's output
6. Add "re-run" button that pastes the command and hits enter

#### Files to create/modify

- `src/components/terminal/CommandBlock.tsx` -- block header overlay component
- `src/components/terminal/CommandBlockList.tsx` -- sidebar listing all blocks
- `src/hooks/useCommandBlocks.ts` -- parses OSC 133 sequences, manages block state
- `src/components/terminal/TerminalInstance.tsx` -- integrate block detection
- `src/stores/terminalStore.ts` -- add blocks array per terminal tab

#### Acceptance criteria

- [ ] Commands in bash/zsh (with shell integration) produce visible block headers
- [ ] Block header shows command text, exit code (green/red), and wall-clock duration
- [ ] Click block header scrolls to that command
- [ ] "Copy output" copies just that block's text
- [ ] Blocks list panel shows command history with timestamps
- [ ] Graceful degradation: terminals without shell integration just work normally (no blocks)

---

### Task 3: Execution Map (Tool Call Graph)

**Stolen from:** claude-devtools / Clauductor
**What it does:** Visualizes a Claude conversation as a directed graph. Each node is a tool call (Read file, Write file, Bash, etc.). Edges show the execution order. You can see at a glance: "Claude read 3 files, then wrote 2, then ran tests, then fixed 1 file." Nodes are color-coded by tool type and sized by token cost.
**Why it's cool:** When Claude is done with a complex task, the chat transcript is 200 messages long. The execution map shows you what actually happened in 5 seconds. It's like a flight recorder for AI coding sessions.

#### Implementation

1. The conversation store already tracks tool calls in message objects. Extract them into a flat list: `{ tool, args_summary, result_summary, tokens_in, tokens_out, timestamp }`
2. Build a graph layout using dagre (or elkjs) for automatic node positioning
3. Render with React + SVG (no heavy graph library needed for this scale)
4. Node colors: blue=Read, green=Write, orange=Bash, purple=Search, gray=other
5. Node size proportional to token cost
6. Click a node to scroll to that message in the chat panel
7. Add as a tab in the secondary sidebar (alongside chat)

#### Files to create/modify

- `src/components/chat/ExecutionMap.tsx` -- the graph visualization
- `src/components/chat/ExecutionMapNode.tsx` -- individual node component
- `src/lib/executionGraph.ts` -- extracts tool calls from conversation, builds graph data
- `src/components/layout/SecondarySidebar.tsx` -- add "Map" tab
- `package.json` -- add `dagre` or `@dagrejs/dagre` dependency

#### Acceptance criteria

- [ ] After any Claude conversation with tool calls, switching to "Map" tab shows a graph
- [ ] Nodes are color-coded by tool type
- [ ] Node size reflects token cost
- [ ] Clicking a node scrolls chat to that message
- [ ] Graph auto-layouts without overlapping nodes
- [ ] Empty conversations show a "no tool calls yet" placeholder

---

### Task 4: Workspace Metadata Sidebar

**Stolen from:** cmux
**What it does:** A thin sidebar strip (or overlay) that shows everything about your current workspace at a glance: git branch + ahead/behind count, open PR status, active dev server ports, running background processes, Claude session cost so far, and per-terminal notifications (e.g., "build failed in Terminal 2").
**Why it's cool:** You're juggling a branch, a PR, a dev server, and Claude. Instead of checking 4 different places, it's all in one persistent strip. cmux calls this the "workspace context" and it's the thing people love most about it.

#### Implementation

1. Create a collapsible metadata panel at the top of the primary sidebar (above the file explorer)
2. Sections:
   - **Git:** branch name, ahead/behind remote, dirty file count (already have `get_git_branch` and `get_git_status` backend)
   - **PR:** if a PR is open for this branch, show title + review status (use `get_pr_list` backend -- needs filtering by current branch)
   - **Ports:** scan for listening ports (new Rust command: `list_listening_ports` using `netstat` or `/proc/net/tcp`)
   - **Processes:** list running terminal commands with PID and duration (from command blocks, Task 2)
   - **Claude:** active session status, tokens used this session, estimated cost (from conversation store)
   - **Alerts:** unread terminal notifications (build failures, test results) from notification center
3. Auto-refresh every 5 seconds for git/ports, real-time for Claude/terminal

#### Files to create/modify

- `src/components/layout/WorkspaceMetadata.tsx` -- the metadata panel
- `src/components/layout/MetadataSection.tsx` -- collapsible section component
- `src/components/layout/PrimarySidebar.tsx` -- embed metadata panel at top
- `src-tauri/src/system.rs` -- new file: `list_listening_ports` command
- `src/hooks/useWorkspaceMetadata.ts` -- aggregates data from git, conversation, terminal stores

#### Acceptance criteria

- [ ] Metadata panel visible at top of primary sidebar
- [ ] Git section shows branch + dirty count, updates on file save
- [ ] Claude section shows token count and cost for active session
- [ ] Ports section lists dev servers (localhost:3000, localhost:5173, etc.)
- [ ] Clicking git branch opens branch switcher
- [ ] Panel is collapsible to save space

---

### Task 5: Image/Screenshot Paste into Chat

**Stolen from:** Cursor
**What it does:** Paste an image (screenshot, diagram, error popup) directly into the chat input. Claude sees it and can reference it. "Here's the error dialog I'm seeing" + paste screenshot. "Here's the design mockup" + paste Figma export.
**Why it's cool:** Half the time you want to show Claude something visual -- a broken UI, an error screenshot, a design comp. Describing it in words is slow and lossy. Just paste the image.

#### Implementation

1. Listen for `paste` events on the ChatInput textarea that contain image data
2. Extract the image as a base64 data URL from the clipboard
3. Show a thumbnail preview in the chat input area (below the text)
4. Also support drag-and-drop of image files onto the chat panel
5. When sending the message, include the image as a base64-encoded content block in the Claude CLI input
6. Claude Code CLI supports `--input-format` with image content blocks -- verify and use the correct format
7. Display sent images in message bubbles as inline thumbnails (click to enlarge)

#### Files to create/modify

- `src/components/chat/ChatInput.tsx` -- add paste/drop handlers, thumbnail preview
- `src/components/chat/ImagePreview.tsx` -- thumbnail with remove button
- `src/components/chat/MessageBubble.tsx` -- render image content blocks
- `src/hooks/useImagePaste.ts` -- clipboard and drag-drop handling
- `src/lib/protocol.ts` -- add image content block type

#### Acceptance criteria

- [ ] Ctrl+V with a screenshot in clipboard shows thumbnail in chat input
- [ ] Dragging an image file onto chat shows thumbnail
- [ ] Clicking "X" on thumbnail removes it before sending
- [ ] Sent images appear in the message bubble
- [ ] Claude responds with awareness of the image content
- [ ] Multiple images can be attached to one message

---

### Task 6: AI Command Suggestions in Terminal

**Stolen from:** Warp
**What it does:** When you start typing in the terminal, or after an error, a ghost-text suggestion appears showing the command Claude thinks you want. Press Tab to accept. "Permission denied" -> suggests `sudo !!`. You type `git` and it suggests `git status` based on context. You type `npm` and it suggests `npm run dev` because that's your project's start script.
**Why it's cool:** You know what you want to do but forget the exact flags. Or you just ran something that failed and Claude already knows the fix. It's like Copilot but for your terminal.

#### Implementation

1. After each command completes (using command block boundaries from Task 2), if exit code != 0, send the failed command + last 20 lines of output to Claude with a system prompt: "Suggest a fix command. Reply with ONLY the command, nothing else."
2. For proactive suggestions: when the user pauses typing for 500ms, send the partial command + recent terminal context to Claude for completion
3. Render the suggestion as dimmed ghost text after the cursor position in the terminal (using xterm.js decorations)
4. Tab accepts the suggestion (writes it to the PTY), Escape dismisses
5. Keep suggestions lightweight: use `claude --print -p "..." --max-tokens 100` for speed
6. Add a toggle in settings to enable/disable terminal AI suggestions

#### Files to create/modify

- `src/components/terminal/TerminalSuggestion.tsx` -- ghost text overlay
- `src/hooks/useTerminalSuggestions.ts` -- triggers suggestions, manages state
- `src/components/terminal/TerminalInstance.tsx` -- integrate suggestion display
- `src/stores/settingsStore.ts` -- add `terminalAiSuggestions: boolean` setting
- `src/components/settings/PreferencesEditor.tsx` -- add toggle

#### Acceptance criteria

- [ ] After a failed command, a suggestion appears within 2 seconds
- [ ] Ghost text is visually distinct (dimmed/italic)
- [ ] Tab accepts, Escape dismisses
- [ ] Proactive suggestions appear while typing (after 500ms pause)
- [ ] Settings toggle enables/disables the feature
- [ ] Suggestions don't fire for every keystroke (debounced, rate-limited)

---

### Task 7: Zen Mode

**Stolen from:** VS Code / Zed
**What it does:** One keystroke (Ctrl+Shift+Z or a command palette entry) strips away everything -- sidebar, status bar, activity bar, terminal, tabs -- and gives you just the editor, full-screen, centered, with generous padding. Optionally keeps the chat panel visible as a slim overlay. Another keystroke brings everything back.
**Why it's cool:** When you're deep-reading a file or writing something from scratch, all the IDE chrome is visual noise. Zen mode is the "do not disturb" for coding. Zed's minimal UI philosophy taken to the extreme.

#### Implementation

1. Add a `zenMode` boolean to the layout store
2. When activated: hide activity bar, primary sidebar, secondary sidebar, status bar, terminal panel, editor tabs. Set editor to fill the entire window with max-width ~900px centered.
3. Optionally (user preference): keep a mini chat floating in the bottom-right corner
4. Show a subtle "Press Escape to exit Zen Mode" hint that fades after 3 seconds
5. Register Ctrl+Shift+Z keybinding and add to command palette
6. Preserve all panel states so they restore exactly when exiting

#### Files to create/modify

- `src/stores/layoutStore.ts` -- add `zenMode` state and `toggleZenMode()` action
- `src/components/layout/IDELayout.tsx` -- conditionally hide all chrome when zenMode is true
- `src/components/layout/ZenModeOverlay.tsx` -- the "press Escape to exit" hint
- `src/components/editor/MonacoEditor.tsx` -- adjust editor container for centered layout
- `src/lib/keybindings.ts` -- register Ctrl+Shift+Z
- `src/components/shared/CommandPalette.tsx` -- add "Toggle Zen Mode" entry

#### Acceptance criteria

- [ ] Ctrl+Shift+Z toggles zen mode
- [ ] In zen mode: only the editor is visible, centered with max-width
- [ ] Escape exits zen mode
- [ ] All panels restore to their previous state on exit
- [ ] Command palette has "Toggle Zen Mode" entry
- [ ] Editor tabs are hidden (current file stays open)

---

### Task 8: Session Timeline with Visual Checkpoints

**Stolen from:** Opcode
**What it does:** A horizontal timeline at the top (or bottom) of the chat panel showing every checkpoint Claude created during the session. Each checkpoint is a dot on the timeline with a label ("before refactor", "added auth", "tests passing"). Hover to see a diff summary. Click to restore. Drag to compare two checkpoints side-by-side.
**Why it's cool:** Opcode's killer feature is making the "undo" visible. Instead of "I hope Claude didn't break something," you can see every save point and jump between them. It turns a scary autonomous session into something you can scrub through like a video timeline.

#### Implementation

1. The checkpoint backend already exists (`create_checkpoint`, `list_checkpoints`, `restore_checkpoint`)
2. Build a horizontal timeline component that queries `list_checkpoints` and displays them as dots on a line
3. Each dot: label, timestamp, hover tooltip with changed file count
4. Click a dot: show a confirmation dialog, then `restore_checkpoint`
5. Shift+click two dots: open a diff view comparing those two checkpoints (use `git diff tag1 tag2`)
6. Auto-create checkpoints: hook into the conversation store -- when Claude completes a tool call that writes files, auto-create a checkpoint with the tool description as the label
7. Place the timeline above the chat messages in `ChatPanel.tsx`

#### Files to create/modify

- `src/components/chat/SessionTimeline.tsx` -- the horizontal timeline
- `src/components/chat/CheckpointDot.tsx` -- individual checkpoint marker
- `src/components/chat/ChatPanel.tsx` -- embed timeline above messages
- `src/hooks/useSessionTimeline.ts` -- manages checkpoint data, auto-creation logic
- `src-tauri/src/checkpoint.rs` -- add `diff_checkpoints(tag1, tag2)` command
- `src/stores/conversationStore.ts` -- add auto-checkpoint trigger on file-write tool calls

#### Acceptance criteria

- [ ] Timeline appears above chat with dots for each checkpoint
- [ ] Dots have labels and timestamps on hover
- [ ] Clicking a dot offers to restore that checkpoint
- [ ] Shift+clicking two dots shows a diff between them
- [ ] Auto-checkpoints are created when Claude writes files
- [ ] Timeline scrolls horizontally when there are many checkpoints

---

### Task 9: Token Attribution per Turn

**Stolen from:** claude-devtools
**What it does:** Each message in the chat shows a small token count badge: "1.2K in / 3.4K out / $0.02". Expanding it shows a breakdown: how many tokens came from the system prompt, from file contents, from the user message, and from tool results. You can see exactly which messages are expensive.
**Why it's cool:** You're spending real money on Claude. This tells you where the money goes. "Oh, that one file read cost 8K tokens because the file was huge." It makes token usage tangible and helps you write better prompts.

#### Implementation

1. Claude CLI's stream-json output already includes `usage` fields on assistant messages (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
2. Parse and store these per-message in the conversation store (they may already be partially captured)
3. Add a small badge on each `MessageBubble` showing input/output tokens and estimated cost
4. Cost calculation: use model pricing from settings (default: Sonnet 4 pricing)
5. Click the badge to expand a detailed breakdown panel
6. Add a running total in the status bar (already partially there -- enhance it)
7. In the expanded view, show which tool results contributed the most tokens

#### Files to create/modify

- `src/components/chat/TokenBadge.tsx` -- the per-message token badge
- `src/components/chat/TokenBreakdown.tsx` -- expanded detail panel
- `src/components/chat/MessageBubble.tsx` -- embed TokenBadge
- `src/stores/conversationStore.ts` -- ensure usage data is captured per message
- `src/lib/pricing.ts` -- model pricing constants and cost calculation
- `src/components/layout/StatusBar.tsx` -- enhance running total display

#### Acceptance criteria

- [ ] Every assistant message shows a token badge (e.g., "1.2K / 3.4K")
- [ ] Badge shows estimated cost (e.g., "$0.02")
- [ ] Clicking badge expands to show input/output/cache breakdown
- [ ] Status bar shows running session total
- [ ] Cost calculation uses correct model pricing
- [ ] Tool-heavy turns visibly show higher token counts

---

### Task 10: Activity Trail (Files Claude Touched)

**Stolen from:** markes76/claude-code-gui
**What it does:** A live-updating panel that shows every file Claude has read, created, edited, or deleted during the current session. Each entry shows the file path, the action (read/write/create/delete), a timestamp, and a one-click "open in editor" and "show diff" action. It's basically an audit log for file operations.
**Why it's cool:** After Claude finishes a big task, you want to know: "What files did you actually touch?" Instead of scrolling through the chat looking for tool calls, the activity trail gives you a clean list. Click any file to see exactly what changed.

#### Implementation

1. Hook into the conversation store's message stream. Filter for tool calls of type `Read`, `Write`, `Edit`, `MultiEdit`, `Bash` (extract file paths from bash commands that write files)
2. Build a deduplicated, time-ordered list: `{ path, action, timestamp, diffAvailable }`
3. For write/edit actions, store the before/after state (or just the diff) so clicking "show diff" works
4. Render as a simple list in a new sidebar tab (or as a panel in the secondary sidebar)
5. Color-code by action: blue=read, green=create, yellow=edit, red=delete
6. Add a "Open all modified files" button that opens tabs for every file Claude wrote to

#### Files to create/modify

- `src/components/chat/ActivityTrail.tsx` -- the file activity list
- `src/components/chat/ActivityTrailItem.tsx` -- individual file entry
- `src/hooks/useActivityTrail.ts` -- extracts file operations from conversation
- `src/components/layout/SecondarySidebar.tsx` -- add "Trail" tab
- `src/stores/conversationStore.ts` -- add activity extraction logic

#### Acceptance criteria

- [ ] Activity trail panel shows all files Claude interacted with
- [ ] Entries are color-coded by action type
- [ ] Click a file path to open it in the editor
- [ ] "Show diff" opens the diff viewer for that file
- [ ] "Open all modified" opens tabs for all written files
- [ ] Trail updates in real-time as Claude works

---

## Execution Order

These tasks have some dependencies but are mostly parallelizable:

```
Track A (Editor):       Task 1 (Inline Edit) -> Task 7 (Zen Mode)
Track B (Terminal):     Task 2 (Command Blocks) -> Task 6 (AI Suggestions)
Track C (Chat/Panels):  Task 9 (Token Attribution) -> Task 3 (Execution Map) -> Task 10 (Activity Trail)
Independent:            Task 4 (Workspace Metadata), Task 5 (Image Paste), Task 8 (Session Timeline)
```

Task 2 (Command Blocks) should go first because Task 6 (AI Suggestions) depends on its command boundary detection. Task 9 (Token Attribution) should go before Task 3 (Execution Map) because the token data informs node sizing in the graph.

### Sprint priority if we have to cut scope

**Must ship (the 5 that change daily use the most):**
1. Task 1 -- Inline AI Edit (Ctrl+K)
2. Task 2 -- Command Blocks
3. Task 5 -- Image Paste into Chat
4. Task 9 -- Token Attribution
5. Task 10 -- Activity Trail

**Should ship (make the product feel polished and fun):**
6. Task 7 -- Zen Mode
7. Task 4 -- Workspace Metadata
8. Task 8 -- Session Timeline

**Nice to have (impressive but complex):**
9. Task 3 -- Execution Map
10. Task 6 -- AI Terminal Suggestions

---

## What We Considered But Didn't Pick

| Feature | Source | Why not this sprint |
|---------|--------|-------------------|
| Tab autocomplete (AI predicts next edit) | Cursor | Requires a fast, specialized model and deep Monaco integration. Inline Edit (Ctrl+K) gives 80% of the value with 20% of the effort. Revisit after Ctrl+K ships. |
| Collaborative editing | Zed | Massive infrastructure (CRDT, server, auth, presence). Cool but not a solo-dev feature. Revisit when Vantage has users. |
| GPU-accelerated text rendering | Zed | We use WebView2 + Monaco, not a custom renderer. We'd need to rebuild the editor from scratch. Not happening. |
| Workflow bookmarks (save/replay terminal sequences) | Warp | Command blocks (Task 2) are the foundation. Bookmarks can layer on top in a future sprint. |
| Visual editors (diagrams, mockups) | Nimbalyst | Cool but a completely different product direction. Would need diagram libraries, canvas rendering, export. Maybe later. |
| iOS companion app | Nimbalyst | Native iOS app is a separate project entirely. CloudCLI proves web/mobile access is desirable, but this sprint is about the desktop experience. |
| Sub-threads (branch conversations) | AgentRove | Interesting but needs conversation model rework. The current linear chat model works fine for now. |
| Blazing fast startup | Zed | Tauri already starts fast (~1-2 seconds). Optimizing further is diminishing returns compared to adding features. |
| Docker sandbox isolation | AgentRove | Great for security but heavy infrastructure. Claude CLI already has its own permission model. |

---

## Success Metric

After this sprint, a developer using Vantage for a full day should be able to:
1. Select code and ask Claude to transform it without leaving the editor
2. Find any command they ran in the terminal without scrolling
3. See exactly what Claude did as a visual graph
4. Know at a glance: what branch am I on, is my server running, how much have I spent
5. Paste a screenshot into chat and ask Claude about it
6. Get terminal command suggestions when something fails
7. Enter a distraction-free mode for focused reading/writing
8. Scrub through Claude's work like a video timeline
9. See the token cost of every single message
10. Get a clean list of every file Claude touched
