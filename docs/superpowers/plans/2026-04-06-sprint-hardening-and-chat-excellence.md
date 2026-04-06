# Sprint: Hardening & Chat Excellence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the critical gap between Vantage and Opcode's chat experience while hardening the codebase against the top findings from four audit reports.

**Architecture:** This sprint focuses on three pillars: (1) specialized tool call widgets that transform the chat into a rich development feed, (2) view integration so the IDE reacts to Claude's actions in real-time, and (3) message list virtualization for production-scale conversations. God-component splitting (StatusBar, ChatPanel, CommandPalette) is included as essential prep work.

**Tech Stack:** React 19, TypeScript 5.6, Zustand 5, Framer Motion, @tanstack/react-virtual, Monaco Editor, xterm.js, Tailwind CSS 4, Catppuccin themes

---

## Sprint Backlog

### Epic 1: Specialized Tool Widgets (Priority: P0 — Highest Impact)
The comparative analysis identifies tool visualization as "the single largest gap in the chat-first experience." Current `ToolCallCard.tsx` is 717 lines with ~7 generic types. Target: 12+ purpose-built widgets.

### Epic 2: View Integration (Priority: P0)
When Claude reads/edits/writes files or runs bash, the IDE should react in real-time without requiring manual navigation.

### Epic 3: Message Virtualization (Priority: P0)
Non-negotiable for production use. Long sessions choke without windowing.

### Epic 4: God Component Splitting (Priority: P1)
StatusBar (1,136 lines), ChatPanel (890 lines), CommandPalette (1,070 lines) need decomposition before further feature work.

### Epic 5: Performance (Priority: P1)
Streaming re-render throttling, polling guards, selector optimization.

### Epic 6: Remaining Audit Fixes (Priority: P2)
Stale closure, form validation, error surfacing, useTerminal proper cleanup.

---

## Task Dependency Graph

```
Task 1 (Split ToolCallCard) ─────┐
Task 2 (ReadWidget)               ├──► Task 8 (View Integration)
Task 3 (BashWidget)               │
Task 4 (EditWidget)               │
Task 5 (WriteWidget)              │
Task 6 (GrepWidget + GlobWidget)  │
Task 7 (TodoWidget + AgentWidget) ┘

Task 9 (Message Virtualization) ←── independent

Task 10 (Split StatusBar)  ┐
Task 11 (Split ChatPanel)  ├──► Task 14 (Streaming throttle)
Task 12 (Split CommandPalette) ┘

Task 13 (Polling guards) ←── independent
Task 15 (Remaining fixes) ←── independent
```

---

## Task 1: Split ToolCallCard into Widget Architecture

**Priority:** P0 | **Story Points:** 5 | **Dependencies:** None

**Goal:** Refactor the 717-line monolithic ToolCallCard into a plugin-style widget architecture where each tool type has its own dedicated renderer.

**Files:**
- Refactor: `src/components/chat/ToolCallCard.tsx` (strip to ~100-line shell)
- Create: `src/components/chat/widgets/index.ts` (widget registry)
- Create: `src/components/chat/widgets/GenericWidget.tsx` (fallback)
- Create: `src/components/chat/widgets/WidgetShell.tsx` (shared header/expand/collapse)
- Move: `src/components/chat/widgets/InlineDiffPreview.tsx` (extracted from ToolCallCard)

**Acceptance Criteria:**
- ToolCallCard becomes a thin dispatcher: lookup widget by tool name, render it
- WidgetShell handles expand/collapse animation, header with icon/label/status, "Open in Editor" click
- GenericWidget renders the current JSON fallback
- InlineDiffPreview extracted as standalone component
- All existing tool rendering still works identically
- Tests pass

- [ ] **Step 1:** Create `src/components/chat/widgets/WidgetShell.tsx` — shared header/expand/collapse wrapper
- [ ] **Step 2:** Create `src/components/chat/widgets/GenericWidget.tsx` — renders JSON input/output (current fallback)
- [ ] **Step 3:** Create `src/components/chat/widgets/InlineDiffPreview.tsx` — extract from ToolCallCard lines 101-235
- [ ] **Step 4:** Create `src/components/chat/widgets/index.ts` — widget registry mapping tool names to components
- [ ] **Step 5:** Refactor `ToolCallCard.tsx` to use the registry (dispatch to widget by name, fallback to GenericWidget)
- [ ] **Step 6:** Run tests: `npx vitest run --dir src`
- [ ] **Step 7:** Commit: `refactor: extract tool widget architecture from ToolCallCard`

---

## Task 2: ReadWidget — Syntax-Highlighted File Preview

**Priority:** P0 | **Story Points:** 3 | **Dependencies:** Task 1

**Goal:** When Claude uses the `Read` tool, show a syntax-highlighted file preview with line numbers and click-to-open.

**Files:**
- Create: `src/components/chat/widgets/ReadWidget.tsx`
- Modify: `src/components/chat/widgets/index.ts` (register)

**Input data shape:** `{ input: { file_path: string, start_line?: number, end_line?: number }, output: string (file content) }`

**Acceptance Criteria:**
- Shows filename as clickable link (opens in editor)
- Syntax highlighting via CodeBlock component (already exists)
- Shows line number range if partial read
- Collapsed by default, shows "Read [filename] (N lines)" in header
- Click header expands to show content

- [ ] **Step 1:** Create `ReadWidget.tsx` with filename header, line count, CodeBlock for content
- [ ] **Step 2:** Register in `widgets/index.ts`
- [ ] **Step 3:** Test by running app and triggering a Read tool call via Claude
- [ ] **Step 4:** Commit: `feat: add ReadWidget with syntax highlighting and click-to-open`

---

## Task 3: BashWidget — Terminal-Style Output

**Priority:** P0 | **Story Points:** 3 | **Dependencies:** Task 1

**Goal:** When Claude uses `Bash`, show the command prominently with terminal-styled output, exit code indicator, and copy/re-run actions.

**Files:**
- Create: `src/components/chat/widgets/BashWidget.tsx`
- Modify: `src/components/chat/widgets/index.ts`

**Input data shape:** `{ input: { command: string }, output: string (stdout+stderr), isError: boolean }`

**Acceptance Criteria:**
- Command shown in monospace with `$` prefix, clickable to copy
- Output styled as terminal (dark bg, monospace, preserve whitespace/ANSI)
- Error state: red border, error icon
- Success state: green check
- Header shows "Bash: `[command]` — exit 0" or "exit 1"

- [ ] **Step 1:** Create `BashWidget.tsx`
- [ ] **Step 2:** Register in `widgets/index.ts`
- [ ] **Step 3:** Visual test in running app
- [ ] **Step 4:** Commit: `feat: add BashWidget with terminal-styled output and status`

---

## Task 4: EditWidget — Inline Diff with Accept/Reject

**Priority:** P0 | **Story Points:** 3 | **Dependencies:** Task 1

**Goal:** When Claude uses `Edit`, show a rich inline diff with the file path, change summary (+N/-N lines), and accept/reject buttons.

**Files:**
- Create: `src/components/chat/widgets/EditWidget.tsx`
- Modify: `src/components/chat/widgets/index.ts`

**Input data shape:** `{ input: { file_path: string, old_string: string, new_string: string }, output: string }`

**Acceptance Criteria:**
- Header shows filename, +N/-N line counts in green/red
- Collapsed: summary only. Expanded: InlineDiffPreview (from Task 1)
- Accept/Reject buttons when diff is pending
- Click filename opens file in editor

- [ ] **Step 1:** Create `EditWidget.tsx` using InlineDiffPreview extracted in Task 1
- [ ] **Step 2:** Register in `widgets/index.ts`
- [ ] **Step 3:** Visual test
- [ ] **Step 4:** Commit: `feat: add EditWidget with inline diff and accept/reject`

---

## Task 5: WriteWidget — New File Preview

**Priority:** P0 | **Story Points:** 2 | **Dependencies:** Task 1

**Files:**
- Create: `src/components/chat/widgets/WriteWidget.tsx`
- Modify: `src/components/chat/widgets/index.ts`

**Input data shape:** `{ input: { file_path: string, content: string }, output: string }`

- [ ] **Step 1:** Create `WriteWidget.tsx` — file icon, filename link, language badge, syntax-highlighted content preview (collapsed by default)
- [ ] **Step 2:** Register in `widgets/index.ts`
- [ ] **Step 3:** Commit: `feat: add WriteWidget with new file preview`

---

## Task 6: GrepWidget + GlobWidget — Search Results

**Priority:** P1 | **Story Points:** 3 | **Dependencies:** Task 1

**Files:**
- Create: `src/components/chat/widgets/GrepWidget.tsx`
- Create: `src/components/chat/widgets/GlobWidget.tsx`
- Modify: `src/components/chat/widgets/index.ts`

**GrepWidget acceptance criteria:**
- Groups results by file
- Shows matching lines with context, search term highlighted
- Click file to open in editor at matching line

**GlobWidget acceptance criteria:**
- Shows file list as a compact tree
- File count in header
- Click file to open

- [ ] **Step 1:** Create `GrepWidget.tsx`
- [ ] **Step 2:** Create `GlobWidget.tsx`
- [ ] **Step 3:** Register both in `widgets/index.ts`
- [ ] **Step 4:** Commit: `feat: add GrepWidget and GlobWidget for search results`

---

## Task 7: TodoWidget + AgentWidget

**Priority:** P1 | **Story Points:** 3 | **Dependencies:** Task 1

**Files:**
- Create: `src/components/chat/widgets/TodoWidget.tsx`
- Create: `src/components/chat/widgets/AgentWidget.tsx`
- Modify: `src/components/chat/widgets/index.ts`

**TodoWidget:** Status icons (pending/in-progress/done), priority badges, strike-through for completed items.

**AgentWidget:** Nested agent status with name, role badge, token count.

- [ ] **Step 1:** Create `TodoWidget.tsx`
- [ ] **Step 2:** Create `AgentWidget.tsx`
- [ ] **Step 3:** Register both
- [ ] **Step 4:** Commit: `feat: add TodoWidget and AgentWidget for rich tool rendering`

---

## Task 8: View Integration — IDE Reacts to Claude Actions

**Priority:** P0 | **Story Points:** 5 | **Dependencies:** Tasks 2-5

**Goal:** When Claude reads/edits/writes a file, the IDE automatically reacts: open the file, show diff badges, flash terminal indicator.

**Files:**
- Modify: `src/hooks/useClaude.ts` (emit integration events after tool completion)
- Modify: `src/stores/editor.ts` (add `revealFile` action)
- Modify: `src/components/layout/PanelArea.tsx` (terminal tab flash indicator)
- Modify: `src/stores/layout.ts` (add `flashPanelTab` state)

**Acceptance Criteria:**
- When Claude `Read`s a file: editor tab opens in background (doesn't steal focus or switch view)
- When Claude `Edit`s a file: editor tab shows "modified by Claude" indicator
- When Claude runs `Bash`: terminal tab indicator pulses briefly
- These work in BOTH Claude View and IDE View
- No view switching — indicators only

- [ ] **Step 1:** Add `revealFile(path, options)` to editor store that opens a tab without switching view mode
- [ ] **Step 2:** Add `flashPanelTab` state to layout store (tab name + timestamp, auto-clears after 2s)
- [ ] **Step 3:** In `useClaude.ts`, after tool_result events, dispatch integration events based on tool name
- [ ] **Step 4:** In PanelArea, show pulse animation on flashed tab
- [ ] **Step 5:** Visual test: start Claude session, ask it to read a file, verify editor tab opens
- [ ] **Step 6:** Commit: `feat: IDE reacts to Claude tool actions in real-time`

---

## Task 9: Message List Virtualization

**Priority:** P0 | **Story Points:** 5 | **Dependencies:** None (independent)

**Goal:** Replace the full DOM render of chat messages with `@tanstack/react-virtual` windowing.

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx` (message list section)
- Create: `src/components/chat/VirtualMessageList.tsx`

**Acceptance Criteria:**
- Only visible messages + 5 overscan rendered in DOM
- Auto-scroll to bottom during streaming (respects user scroll override)
- Scroll-to-bottom button still works with message count badge
- Search scroll-to-match still works
- Pinned message filtering still works
- Performance: 500+ messages render smoothly

- [ ] **Step 1:** `npm install @tanstack/react-virtual`
- [ ] **Step 2:** Create `VirtualMessageList.tsx` with useVirtualizer, estimateSize, overscan
- [ ] **Step 3:** Implement auto-scroll with user-override detection (same logic as current, adapted for virtualizer)
- [ ] **Step 4:** Wire up search scroll-to-match via `virtualizer.scrollToIndex()`
- [ ] **Step 5:** Replace the messages `.map()` in ChatPanel with VirtualMessageList
- [ ] **Step 6:** Test with long conversation (100+ messages), verify smooth scrolling
- [ ] **Step 7:** Commit: `feat: virtualize chat message list with @tanstack/react-virtual`

---

## Task 10: Split StatusBar (1,136 lines)

**Priority:** P1 | **Story Points:** 5 | **Dependencies:** None

**Files:**
- Refactor: `src/components/layout/StatusBar.tsx` → shell (~200 lines)
- Create: `src/components/layout/statusbar/GitInfo.tsx`
- Create: `src/components/layout/statusbar/EditorInfo.tsx`
- Create: `src/components/layout/statusbar/SessionInfo.tsx`
- Create: `src/components/layout/statusbar/BuddyWidget.tsx`
- Create: `src/components/layout/statusbar/NotificationIndicator.tsx`
- Create: `src/components/layout/statusbar/index.ts`

- [ ] **Step 1:** Create statusbar/ directory
- [ ] **Step 2:** Extract GitInfo (branch picker, diff stats)
- [ ] **Step 3:** Extract EditorInfo (line/col, encoding, language, wrap, tabs/spaces)
- [ ] **Step 4:** Extract SessionInfo (cost, model selector, effort level)
- [ ] **Step 5:** Extract BuddyWidget (Inkwell turtle)
- [ ] **Step 6:** Extract NotificationIndicator
- [ ] **Step 7:** Refactor StatusBar to compose sub-components
- [ ] **Step 8:** Run tests, verify visual parity
- [ ] **Step 9:** Commit: `refactor: split StatusBar into focused sub-components`

---

## Task 11: Split ChatPanel (890 lines)

**Priority:** P1 | **Story Points:** 5 | **Dependencies:** Task 9 (virtualization changes message list)

**Files:**
- Refactor: `src/components/chat/ChatPanel.tsx` → shell (~250 lines)
- Create: `src/components/chat/SessionInfoBadge.tsx` (extracted)
- Create: `src/components/chat/ChatHeader.tsx` (extracted)
- Create: `src/components/chat/StreamingPreview.tsx` (extracted)
- Create: `src/components/chat/ChatSearchBar.tsx` (extracted)
- Create: `src/components/chat/ChatEmptyState.tsx` (extracted + enriched)

- [ ] **Step 1:** Extract SessionInfoBadge to own file
- [ ] **Step 2:** Extract ChatHeader (toolbar with all action buttons)
- [ ] **Step 3:** Extract StreamingPreview
- [ ] **Step 4:** Extract ChatSearchBar
- [ ] **Step 5:** Create ChatEmptyState with branded icon, quick-action pills, feature hints
- [ ] **Step 6:** Refactor ChatPanel to compose extracted components
- [ ] **Step 7:** Tests pass, visual parity
- [ ] **Step 8:** Commit: `refactor: split ChatPanel into focused sub-components`

---

## Task 12: Split CommandPalette (1,070 lines)

**Priority:** P1 | **Story Points:** 3 | **Dependencies:** None

**Files:**
- Refactor: `src/components/shared/CommandPalette.tsx` → shell (~200 lines)
- Create: `src/components/shared/palette/CommandsView.tsx`
- Create: `src/components/shared/palette/FilesView.tsx`
- Create: `src/components/shared/palette/GotoView.tsx`
- Create: `src/components/shared/palette/commandRegistry.ts` (command definitions)

- [ ] **Step 1:** Extract command definitions to `commandRegistry.ts`
- [ ] **Step 2:** Extract CommandsView, FilesView, GotoView
- [ ] **Step 3:** Refactor CommandPalette to dispatch to sub-views
- [ ] **Step 4:** Tests pass
- [ ] **Step 5:** Commit: `refactor: split CommandPalette into registry + sub-views`

---

## Task 13: Polling Guards and Performance Quick Wins

**Priority:** P1 | **Story Points:** 2 | **Dependencies:** None

**Files:**
- Modify: `src/hooks/useGitStatus.ts` (skip poll after event-driven refresh)
- Modify: `src/components/layout/StatusBar.tsx` (no-op guard on diff stat poll)
- Modify: `src/components/layout/WorkspaceMetadata.tsx` (no-op guard on port scan)
- Modify: `src/stores/conversation.ts` (throttle activeBlocks Map copies)

- [ ] **Step 1:** useGitStatus: add lastRefreshAt timestamp, skip 5s poll if refreshed within 3s
- [ ] **Step 2:** StatusBar: compare diffStat before setState to avoid no-op re-renders
- [ ] **Step 3:** WorkspaceMetadata: compare ports array before setState
- [ ] **Step 4:** conversation.ts: batch activeBlocks updates with requestAnimationFrame
- [ ] **Step 5:** Tests pass
- [ ] **Step 6:** Commit: `perf: add polling guards and throttle streaming updates`

---

## Task 14: StreamingPreview Throttle

**Priority:** P1 | **Story Points:** 2 | **Dependencies:** Task 11 (after ChatPanel split)

**Files:**
- Modify: `src/components/chat/StreamingPreview.tsx` (after extraction)
- Modify: `src/stores/conversation.ts` (activeBlocks subscription)

- [ ] **Step 1:** Throttle StreamingPreview re-renders to 60fps max (requestAnimationFrame or 16ms debounce)
- [ ] **Step 2:** Use a ref for activeBlocks content to avoid creating new Map references on every delta
- [ ] **Step 3:** Tests pass
- [ ] **Step 4:** Commit: `perf: throttle streaming preview to 60fps`

---

## Task 15: Remaining Audit Fixes

**Priority:** P2 | **Story Points:** 3 | **Dependencies:** None

**Files:**
- Modify: `src/hooks/useTerminal.ts` (proper cancelled flag for PTY spawn)
- Modify: `src/components/chat/ChatInput.tsx` (fix stale closure in useCallback)
- Modify: `src/components/search/SearchPanel.tsx` (regex validation, replace preview)
- Modify: `src/components/files/FileExplorer.tsx` (filter debounce)

- [ ] **Step 1:** useTerminal: add proper cancelled flag pattern (like useClaude) for PTY spawn race condition
- [ ] **Step 2:** ChatInput: fix useCallback empty dependency array that references `text` and `showSlash`
- [ ] **Step 3:** SearchPanel: add regex syntax validation (try/catch on RegExp construction, show error inline)
- [ ] **Step 4:** FileExplorer: debounce filterTree by 150ms
- [ ] **Step 5:** Tests pass
- [ ] **Step 6:** Commit: `fix: remaining audit fixes — terminal cleanup, stale closures, validation`

---

## Sprint Summary

| Task | Epic | Priority | Points | Dependencies |
|------|------|----------|--------|-------------|
| 1. Split ToolCallCard | Widgets | P0 | 5 | — |
| 2. ReadWidget | Widgets | P0 | 3 | Task 1 |
| 3. BashWidget | Widgets | P0 | 3 | Task 1 |
| 4. EditWidget | Widgets | P0 | 3 | Task 1 |
| 5. WriteWidget | Widgets | P0 | 2 | Task 1 |
| 6. GrepWidget + GlobWidget | Widgets | P1 | 3 | Task 1 |
| 7. TodoWidget + AgentWidget | Widgets | P1 | 3 | Task 1 |
| 8. View Integration | Integration | P0 | 5 | Tasks 2-5 |
| 9. Message Virtualization | Performance | P0 | 5 | — |
| 10. Split StatusBar | Architecture | P1 | 5 | — |
| 11. Split ChatPanel | Architecture | P1 | 5 | Task 9 |
| 12. Split CommandPalette | Architecture | P1 | 3 | — |
| 13. Polling Guards | Performance | P1 | 2 | — |
| 14. Streaming Throttle | Performance | P1 | 2 | Task 11 |
| 15. Remaining Fixes | Hardening | P2 | 3 | — |
| **Total** | | | **52** | |

## Sprint Execution Plan

**Wave 1 (parallel):** Tasks 1, 9, 10, 12, 13, 15 — all independent
**Wave 2 (parallel):** Tasks 2, 3, 4, 5 — depend on Task 1
**Wave 3 (parallel):** Tasks 6, 7, 11 — depend on Tasks 1 or 9
**Wave 4 (sequential):** Task 8 (needs widgets), Task 14 (needs ChatPanel split)

---

*Sprint capacity: ~52 story points across 15 tasks. Target: 4 waves of parallel agent work.*
