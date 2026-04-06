# Full Codebase Simplify Audit

> **Date:** 2026-04-06
> **Scope:** Entire `src/` frontend codebase (~50+ files reviewed)
> **Reviewer:** Claude Code (automated, 3 parallel agents: reuse, quality, efficiency)
> **Mode:** Report only — no changes made

---

## Table of Contents

- [Part 1: Code Reuse](#part-1-code-reuse-opportunities)
- [Part 2: Code Quality](#part-2-code-quality-issues)
- [Part 3: Efficiency](#part-3-efficiency-issues)
- [Prioritized Action Plan](#prioritized-action-plan)

---

# Part 1: Code Reuse Opportunities

## P0 — Highest Impact

### 1.1 Path normalization duplicated 30+ times
The pattern `.replace(/\\/g, "/")` is inlined everywhere instead of a single `normalizePath()` utility.

**Files (partial list):**
- `src/stores/editor.ts:202,246`
- `src/hooks/useActivityTrail.ts:79`
- `src/hooks/useClaude.ts:284`
- `src/hooks/useCrossFileIntelligence.ts:73,83,243,258`
- `src/hooks/useGitStatus.ts:70`
- `src/components/files/FileExplorer.tsx:312,313,461`
- `src/components/files/FileTreeNode.tsx:66`
- `src/components/editor/MonacoEditor.tsx:185`
- `src/components/editor/EditorTabs.tsx:516,517`
- `src/components/search/SearchPanel.tsx:81,82`
- `src/components/chat/MentionAutocomplete.tsx:39,40`
- `src/components/chat/ToolCallCard.tsx:67`
- `src/components/shared/CommandPalette.tsx:79,80`
- `src/components/git/GitLogPanel.tsx:232`
- `src/components/git/GitBlameView.tsx:112,113`
- `src/components/layout/TitleBar.tsx:197`
- `src/components/layout/EditorArea.tsx:255`
- `src/stores/workspace.ts:412,562,564,574,576`
- `src/lib/workspaceStorage.ts:24`
- `src/lib/executionGraph.ts:93`
- `src/lib/mentionResolver.ts:143,144`

**Fix:** Create `src/lib/paths.ts` with `normalizePath()`.

### 1.2 `stripModelDate()` defined in 6 places
The regex `.replace(/-\d{8}$/, "")` is duplicated despite already being a named function (`normalizeModelName`) in pricing.ts — but that function is **not exported**.

- `src/lib/pricing.ts:77` — named `normalizeModelName`, NOT exported
- `src/components/agents/AgentDetailPanel.tsx:71` — named `stripModelDate`
- `src/components/chat/ChatPanel.tsx:266` — named `stripModelDate`
- `src/components/analytics/ModelDistribution.tsx:27` — named `stripModelDate`
- `src/components/layout/StatusBar.tsx:635` — inlined in JSX
- `src/components/chat/TokenBadge.tsx:157` — inlined in JSX

**Fix:** Export `normalizeModelName` from `pricing.ts` and import everywhere.

### 1.3 `formatRelativeTime()` duplicated 5 times
Each has the same logic (diffMs -> seconds -> minutes -> hours -> days) with trivial differences.

- `src/components/editor/WelcomeTab.tsx:23-36`
- `src/components/chat/SessionSelector.tsx:38-56`
- `src/components/git/GitLogPanel.tsx:29-52`
- `src/components/git/GitBlameView.tsx:19-31`
- `src/components/shared/NotificationCenter.tsx:20-37`

**Fix:** Create `src/lib/formatters.ts` with `formatRelativeTime()`.

### 1.4 `generateId()` defined in 3 files identically
Plus other files use `crypto.randomUUID()` — two different ID strategies.

- `src/stores/conversation.ts:181`
- `src/hooks/useClaude.ts:29`
- `src/hooks/useImagePaste.ts:40`

**Fix:** Single export in `src/lib/id.ts`.

### 1.5 Stream event handling duplicated between conversation store and useClaude
This is the **single largest duplication** in the codebase:

- `assembleMessage()` — `src/stores/conversation.ts:187-239` vs `assembleMessageFromBlocks()` — `src/hooks/useClaude.ts:157-204`
- `extractFromAssistantMessage()` — `src/stores/conversation.ts:243-293` vs `extractFromAssistantMsg()` — `src/hooks/useClaude.ts:208-257`
- `handleStreamEvent()` — `src/stores/conversation.ts:377-501` vs `applyStreamEventToSnapshot()` — `src/hooks/useClaude.ts:50-153`

**Fix:** Extract shared streaming protocol module to `src/lib/streamProtocol.ts`.

## P1 — High Impact

### 1.6 Basename extraction (10 occurrences)
`.split("/").pop() ?? fallback` repeated across:
- `useClaude.ts:314`, `mentionResolver.ts:143`, `SourceControlPanel.tsx:50`, `GitLogPanel.tsx:233`, `ActivityTrail.tsx:143`, `DiffFileTree.tsx:26,33`, `SearchPanel.tsx:77`, `FileExplorer.tsx:504`, `ConflictBanner.tsx:74`

### 1.7 Relative path computation (4 identical implementations)
- `CommandPalette.tsx:77-85`, `MentionAutocomplete.tsx:37-45`, `GitBlameView.tsx:109-116`, `SearchPanel.tsx:80-92`

### 1.8 Extension-to-language mapping (3 separate lookup tables)
- `ToolCallCard.tsx:75-85`, `MultiFileDiffReview.tsx:25-50`, `GitLogPanel.tsx:56-81`

### 1.9 `flattenTree()` (2 nearly identical implementations)
- `MentionAutocomplete.tsx:25-35`, `CommandPalette.tsx:62-74`

### 1.10 `useClickOutside` manually reimplemented 7+ times
- `NotificationCenter.tsx:176-191`, `EditorArea.tsx:60-76`, `MenuBar.tsx:705-725`, `EditorTabs.tsx:163-171`, `SearchPanel.tsx:208-222`, `CompactDialog.tsx:35`, `SessionSelector.tsx:172`

**Fix:** Create `src/hooks/useClickOutside.ts`.

### 1.11 Popup/dropdown animation configs duplicated 8+ times
Same `opacity: 0→1, y: N, scale: 0.9X` with easing `[0.4, 0, 0.2, 1]` in:
- `StatusBar.tsx:17-20`, `MenuBar.tsx:13-15`, `PermissionDialog.tsx:412-415`, `ChatPanel.tsx:205-208,852-855`, `ThinkingModeSelector.tsx:159-162`, `NotificationCenter.tsx:208-211`, `QuickQuestionOverlay.tsx:80-83`, `ThinkingIndicator.tsx:48`

**Fix:** Create `src/lib/motionVariants.ts` with shared presets.

### 1.12 Reset-all-stores orchestration duplicated in 2 identical blocks
- `src/stores/workspace.ts:443-450` (inside `switchProject`)
- `src/stores/workspace.ts:512-519` (inside `closeProject`)

## P2 — Medium Impact

### 1.13 `<Loader2 className="animate-spin" />` — 25+ occurrences
Every file imports `Loader2` separately. **Fix:** Create `<Spinner />` shared component.

### 1.14 `formatDuration()` duplicated 3 times
- `AgentDetailPanel.tsx:56-66`, `CommandBlock.tsx:17-23`, `usage.ts:176-189`

### 1.15 `formatTimestamp()` / `formatTime()` duplicated 3 times
- `MessageBubble.tsx:13-20`, `AgentTimeline.tsx:42-48`, `CheckpointDot.tsx:11-17`

### 1.16 `saveFile()` IPC pattern duplicated 8+ times
`invoke("write_file", { path, content })` + try/catch + toast repeated in: `EditorTabs.tsx:461`, `PopoutEditor.tsx:67`, `MenuBar.tsx:73,88`, `EditorArea.tsx:311,329,409`, `TitleBar.tsx:53`, `MultiFileDiffReview.tsx:241,268`, `ClaudeMdEditor.tsx:79`

### 1.17 `color-mix(in srgb, ...)` inline styles — 20+ occurrences
Semi-transparent badge backgrounds via `color-mix` in 18+ component files.

### 1.18 Panel border-bottom inline styles — 30+ occurrences
`style={{ borderBottom: "1px solid var(--color-surface-0)" }}` repeated everywhere.

### 1.19 localStorage read/write with JSON.parse/stringify — 3 files
- `useRecentFiles.ts:24,50`, `CommandPalette.tsx:98,113`, `SearchPanel.tsx:28,41`

## P3 — Low Impact

### 1.20 `notifyToast` wrapper is dead code
`src/lib/notifyToast.ts` exists but zero components import it. All 25+ call sites use raw `toast` from sonner. The monkey-patch in `initToastCapture()` bridges this at runtime.

### 1.21 `reset()` vs `resetToDefaults()` naming inconsistency
Seven stores use `resetToDefaults()`, but `usage.ts` uses `reset()`.

### 1.22 `--ease-smooth` CSS variable exists but framer-motion hardcodes the same curve
CSS defines `--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)` but JS code hardcodes `ease: [0.4, 0, 0.2, 1]` in 10+ locations.

### 1.23 `prefers-reduced-motion` CSS doesn't cover framer-motion JS animations
The CSS media query only targets CSS animations. All 9 framer-motion files are unaffected.

---

# Part 2: Code Quality Issues

## HIGH Severity

### 2.1 StatusBar.tsx — 1,136 lines (god component)
Contains the main StatusBar, PLUS 4 dropdown sub-components (`BranchPickerDropdown`, `ModelSelectorDropdown`, `LanguageSelectorDropdown`, `TabSizeSelectorDropdown`), PLUS utility functions, PLUS a `useWindowWidth` hook.

### 2.2 CommandPalette.tsx — 1,070 lines (god component)
Contains the main palette, PLUS `CommandsView`, `FilesView`, `GotoView`, `RecentView`, PLUS command definitions, file tree flattening, and file opening logic.

### 2.3 ChatPanel.tsx — 890 lines with 6 inline sub-components
Defines `SessionInfoBadge`, `TypingDots`, `ExportMenu`, `StreamingPreview`, `ChatSearchBar`, `ModelSelector` — all inline. Each has its own state.

### 2.4 conversation.ts — 686 lines (god store)
Handles stream events, message assembly, session metadata, permission requests, cost tracking, connection status, checkpoints, and message pinning. Stream protocol handling and message assembly should be extracted.

### 2.5 Triple-tracked cost/token state
- `src/stores/conversation.ts:126-127` — `totalCost` and `totalTokens`
- `src/stores/usage.ts:26-31` — `totalCostUsd`, `inputTokens`, `outputTokens`
- `src/stores/agentConversations.ts:20-21` — per-agent `totalCost` and `totalTokens`
- StatusBar uses `usageTotalCost || totalCost` fallback, papering over the discrepancy.

### 2.6 Model lists defined in 2 places with mismatched values
- `src/components/chat/ChatPanel.tsx:399-403` — `CLAUDE_MODELS` array (uses `value` key)
- `src/components/layout/StatusBar.tsx:844-848` — `AVAILABLE_MODELS` array (uses `id` key, different model versions)

## MEDIUM Severity

### 2.7 `isStreaming` stored separately from `connectionStatus`
- `src/stores/conversation.ts:114` — `isStreaming: boolean`
- `src/stores/conversation.ts:133` — `connectionStatus: ConnectionStatus`
- `isStreaming` is always `connectionStatus === "streaming"`. Could be derived.

### 2.8 Custom event bus bypasses React data flow with stringly-typed events
- `StatusBar.tsx:270` dispatches `vantage:toggle-notification-center`
- `NotificationCenter.tsx:172` listens for it
- `CommandPalette.tsx:598,620` dispatches `vantage:open-spec-viewer`, `vantage:open-keybindings`
- `SettingsPanel.tsx:29,36` listens for these
- `useClaude.ts:888,916` listens for `vantage:investigate`, `vantage:agent-auto-start`
- No TypeScript type safety. Misspelled event names silently fail.

### 2.9 `GateStatus` and `CheckStatus` are identical types defined separately
- `src/stores/mergeQueue.ts:5` — `"pending" | "running" | "passed" | "failed" | "skipped"`
- `src/stores/verification.ts:5` — exact same union

### 2.10 Stores directly reach into other stores' internals
- `agents.ts:673-674` — directly manipulates `useAgentConversationsStore`'s Map, bypassing its `resetToDefaults()`
- `conversation.ts:374,572,609` — `clearConversation()` and `handleResult()` directly call `useUsageStore.getState()`

### 2.11 Missing error boundaries around crash-prone components
Not wrapped:
- `ChatPanel.tsx` — if MessageBubble/ToolCallCard/StreamingPreview throws during streaming
- `KanbanBoard.tsx`, `AgentTreeView.tsx` — agent panels receive real-time CLI events
- `TerminalInstance.tsx` — xterm.js WebGL can throw
- `McpManager.tsx`, `PluginManager.tsx` — invoke Tauri commands with potentially unexpected data

### 2.12 useClaude.ts — 935 lines (oversized hook)
Handles session management, message routing for main + agent conversations, permission handling, diff capture, and event listeners. Agent event routing (lines 370-530) should be extracted.

### 2.13 MenuBar.tsx — 828 lines
All menu definitions are inline function returns. Menu data should be a separate module.

### 2.14 Elapsed time timer duplicated in 3 components
- `ChatPanel.tsx:39-53` (SessionInfoBadge) — 1-second interval
- `StatusBar.tsx:136-153` — 1-second interval
- `UsagePanel.tsx:36-37` — 1-second interval

### 2.15 `selectTabList` creates new arrays on every call
`src/stores/editor.ts:165-172` — The selector uses `.map()` creating a new array reference. File includes a WARNING comment but doesn't enforce. Consumers using `useEditorStore(selectTabList)` directly risk infinite re-renders.

## LOW Severity

### 2.16 `notifications.unreadCount` is derived from `notifications` array
`src/stores/notifications.ts:21,47-48` — Stored separately but recomputed on every mutation as `updated.filter((n) => !n.read).length`. Textbook derived state.

### 2.17 Feature/task references in comments
- `conversation.ts:419-422` — references "Race condition fix (2E)" — task ID not defined in codebase
- `ChatPanel.tsx:22,145` — references "Feature 2", "Feature 5" from external system

### 2.18 No-op useEffect
`ChatPanel.tsx:473-475` — `useEffect(() => { setInstalledSkills([]); }, [])` sets state to `[]`, but initial state is already `[]`.

### 2.19 `role="application"` on root container
`IDELayout.tsx:236,246` — Tells screen readers to stop intercepting keyboard events for the entire app. Should only be on Monaco/xterm widgets. Also missing from zen mode branch (line 217).

---

# Part 3: Efficiency Issues

## HIGH Severity

### 3.1 EditorTabs subscribes to full `tabs` array — re-renders on every keystroke
`src/components/editor/EditorTabs.tsx:401` — `const tabs = useEditorStore((s) => s.tabs)` includes `content` and `savedContent` for every file. Every keystroke triggers `updateContent`, creating a new array reference.

**Same issue in:** `EditorArea.tsx:277`, `TabSwitcher.tsx:14`

### 3.2 TitleBar subscribes to full `tabs` for a boolean check
`src/components/layout/TitleBar.tsx:13` — `s.tabs.some((t) => t.isDirty)` re-evaluates on every keystroke.

### 3.3 StreamingPreview subscribes to entire `activeBlocks` Map
`src/components/chat/ChatPanel.tsx:234` — `activeBlocks` is replaced with `new Map()` on every `content_block_delta` (hundreds/second). The render then does `[...values()].sort()` creating new arrays.

### 3.4 `activeBlocks` Map copied on every streaming delta
`src/stores/conversation.ts:418-440` — Every `content_block_delta` creates `new Map(state.activeBlocks)`. Hundreds of times per second during streaming.

### 3.5 Agents store: every mutation copies the entire Map
`src/stores/agents.ts` — 13 actions follow `const next = new Map(state.agents); next.set(...); return { agents: next }`. O(n) per mutation, significant GC pressure with many agents.

### 3.6 Agent timeline events grow without bound
`src/stores/agents.ts:524` — `timeline: [...agent.timeline, event]` appends with no cap. Workspace serializer caps at 200, but in-memory store has no limit.

### 3.7 Monaco namespace imported in 6 files
`import * as monaco from "monaco-editor"` pulls ~3MB into each chunk. `CommandPalette.tsx` and `StatusBar.tsx` only use `KeyMod`/`KeyCode` constants — they shouldn't need the full bundle.

### 3.8 Sequential awaits that could be parallel
`src/hooks/useClaude.ts:785-792`:
```ts
const worktreePath = await invoke("get_agent_worktree_path", ...);
const branchName = await invoke("get_agent_branch_name", ...);
```
Independent calls — should use `Promise.all`.

### 3.9 Git polling: 5-second interval + file_changed event = double refresh
`src/hooks/useGitStatus.ts:87-107` — Polls every 5s AND listens for `file_changed` events. No guard to skip poll if event-driven refresh just ran.

### 3.10 StatusBar git diff stat polled every 5s without no-op guard
`src/components/layout/StatusBar.tsx:78-108` — Always calls `setDiffStat()` even when values haven't changed. Triggers re-render every 5 seconds unconditionally.

## MEDIUM Severity

### 3.11 ChatPanel subscribes to `pinnedMessageIds` Set without shallow comparison
`ChatPanel.tsx:463` — Any pin/unpin creates a new Set, triggering full ChatPanel re-render including the entire message list.

### 3.12 MonacoEditor: 18 individual `useSettingsStore` subscriptions
`MonacoEditor.tsx:115-132` — 18 separate `useSettingsStore` calls, each a separate subscription. A single shallow-compared object selector would reduce to one.

### 3.13 StatusBar: 15+ individual store subscriptions
`StatusBar.tsx:50-120` — ~15 individual field subscriptions across 6 stores.

### 3.14 ReactMarkdown `components` prop creates new objects every render
`MessageBubble.tsx:389-487` — Object literal with 14 arrow functions created inside render. Should be extracted to module-level constant or memoized.

### 3.15 Sequential file reads in workspace restore
`workspace.ts:283-293` — Each tab file read sequentially in a for loop. Could be parallelized with `Promise.allSettled`.

### 3.16 Sequential git branch + status calls
`useGitStatus.ts:52-63` — `git_branch` and `git_status` are independent. Could run in parallel. Runs every 5 seconds.

### 3.17 Conversation messages array grows without bound in-memory
`conversation.ts:349,488` — Messages appended with no in-memory cap. Workspace serializer limits persistence to 200, but live store grows indefinitely.

### 3.18 `pendingDiffTimeouts` Map never cleared on project switch
`useClaude.ts:263` — Module-level Map only cleared on hook cleanup. Project switch may not trigger unmount.

### 3.19 `filterTree` recursive on every keystroke (no debounce)
`FileExplorer.tsx:441-444` — Walks entire tree on every character typed in filter input. Large projects could lag.

### 3.20 WorkspaceMetadata port detection scans DOM every 5 seconds
`WorkspaceMetadata.tsx:33-47` — Queries `document.querySelector(".xterm-screen")?.textContent` every 5s. Creates new array reference even when ports haven't changed.

### 3.21 Three independent 1-second intervals for elapsed time
`ChatPanel.tsx:40-53`, `StatusBar.tsx:136-153`, `UsagePanel.tsx:36-37` — Each causes its own subtree re-render.

### 3.22 `recharts` imported eagerly for analytics
~50KB gzipped, used only in analytics views that aren't rendered on initial load. Should be lazy-loaded.

### 3.23 `framer-motion` in 9 eagerly-loaded components
~40KB gzipped, imported in initial-load components (StatusBar, ChatPanel, MenuBar). Several only use simple fade/slide that could be CSS.

## LOW Severity

### 3.24 `handleAssistantMessage` re-maps entire messages array
`conversation.ts:521-548` — O(n) per assistant message for conversations with hundreds of messages.

### 3.25 `useActivityTrail` recomputes from all messages on every change
`useActivityTrail.ts:108` — Linear scan over all messages and tool calls on every message change.

### 3.26 `backdrop-blur-sm` on ChatPanel header
`ChatPanel.tsx:617` — Compositing operation that could cause jank on lower-end systems with many messages scrolling behind it.

---

# Prioritized Action Plan

## Tier 1 — High-impact, moderate effort

| # | Action | Files touched | Findings addressed |
|---|--------|--------------|-------------------|
| 1 | Create `src/lib/paths.ts` (`normalizePath`, `basename`, `relativePath`) | 40+ consumers | 1.1, 1.6, 1.7, 2.4 |
| 2 | Extract streaming protocol to `src/lib/streamProtocol.ts` | conversation.ts, useClaude.ts | 1.5, 2.1, 3.3, 3.4 |
| 3 | Fix EditorTabs/EditorArea/TabSwitcher selectors (metadata-only) | 3 files | 3.1, 3.2 |
| 4 | Throttle/debounce `StreamingPreview` re-renders | ChatPanel.tsx | 3.3, 3.4 |
| 5 | Consolidate cost/token tracking to single source of truth | conversation.ts, usage.ts | 2.5 |

## Tier 2 — High-impact, higher effort

| # | Action | Files touched | Findings addressed |
|---|--------|--------------|-------------------|
| 6 | Split StatusBar.tsx (1,136 lines) into sub-component files | 5+ new files | 2.1, 3.13 |
| 7 | Split CommandPalette.tsx (1,070 lines) into shell + sub-views | 5+ new files | 2.2 |
| 8 | Split ChatPanel.tsx (890 lines) — extract 6 inline components | 6+ new files | 2.3 |
| 9 | Create `src/lib/formatters.ts` (`formatRelativeTime`, `formatDuration`, `formatTimestamp`) | 11 consumers | 1.3, 1.14, 1.15 |
| 10 | Create `src/lib/motionVariants.ts` + `<MotionConfig reducedMotion="user">` | 9 framer-motion consumers | 1.11, 1.22, 1.23 |

## Tier 3 — Medium-impact, low effort

| # | Action | Files touched | Findings addressed |
|---|--------|--------------|-------------------|
| 11 | Export `normalizeModelName` from pricing.ts | 6 consumers | 1.2 |
| 12 | Create `useClickOutside` hook | 7 consumers | 1.10 |
| 13 | Add no-op guards to polling (StatusBar, WorkspaceMetadata, useGitStatus) | 3 files | 3.9, 3.10, 3.20, 3.21 |
| 14 | Parallelize sequential awaits (`Promise.all`) | useClaude.ts, workspace.ts, useGitStatus.ts | 3.8, 3.15, 3.16 |
| 15 | Create shared `<Spinner />` component | 25+ consumers | 1.13 |
| 16 | Create `src/lib/languages.ts` (single extension-to-language map) | 3 consumers | 1.8 |
| 17 | Cap in-memory timeline events and messages arrays | agents.ts, conversation.ts | 3.6, 3.17 |
| 18 | Lazy-load recharts for analytics views | analytics components | 3.22 |
| 19 | Extract Monaco keybinding constants to avoid full namespace import | CommandPalette.tsx, StatusBar.tsx | 3.7 |
| 20 | Unify `GateStatus`/`CheckStatus` into shared type | mergeQueue.ts, verification.ts | 2.9 |

## Tier 4 — Low-impact cleanup

| # | Action | Findings addressed |
|---|--------|--------------------|
| 21 | Remove dead `notifyToast` code | 1.20 |
| 22 | Rename `usage.ts` `reset()` to `resetToDefaults()` | 1.21 |
| 23 | Extract `resetAllWorkspaceStores()` helper | 1.12 |
| 24 | Unify model lists (ChatPanel vs StatusBar) | 2.6 |
| 25 | Add typed event system for custom events | 2.8 |
| 26 | Derive `isStreaming` from `connectionStatus` | 2.7 |
| 27 | Derive `unreadCount` from notifications array | 2.16 |
| 28 | Remove no-op useEffect in ChatPanel | 2.18 |
| 29 | Remove stale task/feature references in comments | 2.17 |
| 30 | Fix `role="application"` scope | 2.19 |

---

## Statistics

| Category | HIGH | MEDIUM | LOW | Total |
|----------|------|--------|-----|-------|
| Reuse    | 5    | 11     | 4   | 20    |
| Quality  | 6    | 11     | 4   | 21    |
| Efficiency | 10 | 13     | 3   | 26    |
| **Total** | **21** | **35** | **11** | **67** |
