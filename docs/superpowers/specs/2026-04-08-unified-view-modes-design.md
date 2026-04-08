# Unified View Modes Design

**Date:** 2026-04-08
**Status:** Draft — awaiting user review
**Priority:** P0 — core UX, blocks everything else

---

## Problem

Vantage has two completely separate layout trees (`ClaudeViewLayout` and `IDELayout`) that don't share state, don't transition smoothly, and feel like two different apps. Clicking any activity bar item in Claude mode literally calls `setViewMode("ide")` — teleporting the user to a different layout. The NavigationStrip in Claude mode has `targetViewMode: "ide"` hardcoded on 3 of its 4 buttons.

This is the #1 UX complaint. It must be fixed before any other feature work.

## Architecture: One Shell, Three Modes

**One persistent layout shell.** All modes share the same:
- Title bar (with mode selector)
- Activity bar (left edge, same icons in all modes)
- Status bar (bottom)
- Terminal panel (bottom, collapsible)

What changes between modes is **which panels are visible and how they're sized** — not which component tree is mounted. The mode is a layout preset, not a different app. Switching modes never unmounts/remounts the chat, terminal, or any session state.

### Mode type

```typescript
type ViewMode = "command-center" | "copilot" | "tour";
```

Replaces the current `"claude" | "ide"` binary. Tour mode is Phase 3 (documented but not implemented yet).

### Shared Shell Structure

```
┌─────────────────────────────────────────────────────┐
│  Title Bar     [Command Center] [Co-pilot] [Tour]   │
├──┬──────────────────────────────────────────────────┤
│  │                                                  │
│A │   Center area — mode-dependent content           │
│c │                                                  │
│t │   Command Center: chat + monitoring sidebar      │
│i │   Co-pilot: editor + chat panel (right)          │
│v │   Tour: editor (auto-follow) + floating chat     │
│i │                                                  │
│t │                                                  │
│y │                                                  │
│  ├──────────────────────────────────────────────────┤
│B │  Terminal / Browser / Verification               │
│a │                                                  │
│r ├──────────────────────────────────────────────────┤
│  │  Status Bar                                      │
└──┴──────────────────────────────────────────────────┘
```

### Activity Bar Behavior

The activity bar works **the same in all modes**. Clicking an item never changes the view mode. Instead:

- **In Command Center**: sidebar items (Explorer, Search, Git, Plugins, Usage) open as **slide-out overlay drawers** from the left. They overlay the center area without rearranging the layout. Dismiss with Escape or clicking outside. The center chat + monitoring sidebar stay undisturbed.
- **In Co-pilot**: sidebar items work like VS Code — they fill the left primary sidebar panel as a persistent, resizable column.
- **In Tour Mode** (Phase 3): same as Command Center behavior — overlay drawers.

### Component Elimination

- **Delete `NavigationStrip.tsx`** — replaced by the unified activity bar
- **Delete `ClaudeViewLayout.tsx`** — absorbed into the single layout
- **Merge into one `AppLayout.tsx`** — replaces both `IDELayout` and `ClaudeViewLayout`

---

## Mode 1: Command Center

**Philosophy:** You're orchestrating Claude, not editing code. Everything you need to monitor what Claude is doing, how much it's costing, and intervene when needed.

### Layout

```
┌──────────────────────────────────────────────────────┐
│ Activity │  Chat Panel (primary)  │ Command Sidebar  │
│  Bar     │                        │                  │
│          │  - Conversation        │ ┌──────────────┐ │
│ Explorer │  - Streaming preview   │ │Session Metrics│ │
│ Search   │  - Tool call cards     │ │ 5h: 46%      │ │
│ Git      │  - Rich tool widgets   │ │ 7d: 73%      │ │
│ Agents   │                        │ │ $0.25 / sess │ │
│ Usage    │                        │ │ 3.2k tokens  │ │
│ Plugins  │                        │ ├──────────────┤ │
│ ──────── │                        │ │Checkpoint    │ │
│ Settings │                        │ │Timeline      │ │
│          │                        │ │ ● init       │ │
│          │                        │ │ ├─● refactor │ │
│          │                        │ │ └─● fix bug  │ │
│          │                        │ ├──────────────┤ │
│          │                        │ │Activity Feed │ │
│          │  ┌──────────────────┐  │ │ ✎ app.tsx    │ │
│          │  │ [thinking] [model│  │ │ 🔧 npm test  │ │
│          │  │ [prompt input   ]│  │ │ ✎ lib.ts     │ │
│          │  └──────────────────┘  │ └──────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Left ~60-65%**: Chat panel. Wide, focused. Contains the conversation, streaming preview, and prompt input bar.

**Right ~35-40%**: Command sidebar with stacked, collapsible sections:

### Command Sidebar Sections

#### 1. Session Metrics
- Plan usage: 5-hour window (% + countdown), weekly limit (% + reset time)
- Session cost (API-sourced `total_cost_usd`)
- Token counts: input / output / cache read / cache write
- Model in use
- Session duration, turn count
- Compact, always-visible, live-updating

#### 2. Checkpoint Timeline
- Visual tree of session checkpoints (branching on forks)
- Each node: timestamp, description, clickable
- Click to view diff between current state and that checkpoint
- Create checkpoint button (+ auto-checkpoint strategy selector)
- Restore to checkpoint (with confirmation)
- Fork from checkpoint (creates new branch)
- Checkpoint strategies: manual, per_prompt, per_tool_use, smart

#### 3. Activity Feed
- Real-time stream of Claude's actions
- Rich previews (not just "Edited app.tsx" — show the diff snippet)
- Grouped by turn (each Claude response creates a turn group)
- Tool-specific formatting:
  - File edits: mini diff preview
  - Bash commands: command + exit code
  - Search: query + result count
  - File reads: file path + line range
- Clickable: opens file/diff in a transient preview overlay

### Prompt Bar Enhancements (Command Center)

The prompt input bar in Command Center mode includes:

1. **Thinking mode selector** — visible toggle: auto / think / think_hard / think_harder / ultrathink. Replaces the hidden "High" effort level button.
2. **Model selector** — compact Sonnet/Opus/Haiku toggle in the prompt bar
3. **Prompt queue indicator** — when Claude is working, typed messages queue up. Shows "2 queued" badge. Messages fire sequentially when Claude finishes.
4. **@-mentions, slash commands, image paste** — already exist, keep them

### Overlay Drawers (Activity Bar in Command Center)

When you click Explorer/Search/Git etc. in the activity bar while in Command Center:

- A drawer slides in from the left (over the chat panel, not beside it)
- Width: ~300px, with resize handle
- Semi-transparent backdrop (optional, can be disabled)
- Dismiss: Escape, click outside, or click the same activity bar icon again
- The drawer contains the same component that would be in the primary sidebar in Co-pilot mode (FileExplorer, SearchPanel, etc.)
- Clicking a file in the explorer opens a **transient file preview** (read-only overlay, not a full editor tab)

---

## Mode 2: Co-pilot

**Philosophy:** Traditional IDE with Claude as your pair programmer. You and Claude work side by side — you in the editor, Claude in the chat panel.

### Layout

```
┌──────────────────────────────────────────────────────┐
│ Activity │ Primary │     Editor      │   Chat Panel  │
│  Bar     │ Sidebar │                 │               │
│          │         │  Monaco Editor  │  Conversation  │
│ Explorer │ File    │  - Tabs         │  Streaming     │
│ Search   │ Tree    │  - Breadcrumbs  │  Tool cards    │
│ Git      │         │  - Minimap      │               │
│ Agents   │ (or)    │  - Ctrl+K       │  [prompt bar] │
│ Usage    │ Search  │                 │               │
│ Plugins  │ (or)    │                 │               │
│ ──────── │ Git     │                 │               │
│ Settings │ (etc)   │                 │               │
└──────────────────────────────────────────────────────┘
```

This is essentially the current IDE mode, but:

- **Same activity bar** as Command Center (no separate NavigationStrip)
- **Same status bar** with plan usage indicator
- Clicking activity bar items changes the **left primary sidebar** content (like VS Code)
- Chat panel is the **right secondary sidebar** (resizable, collapsible with Ctrl+B)
- All editor features available: tabs, split groups, breadcrumbs, minimap, Vim mode, Ctrl+K inline edit, diff viewer
- The command sidebar sections (metrics, checkpoints, activity feed) can be accessed via the Usage activity bar item or collapsed sections within the chat panel header

### Transition from Command Center to Co-pilot

When switching: the chat panel slides from center to right. The editor appears in the center. The left sidebar materializes. **No component unmounting.** Chat history, session state, streaming — all preserved. It's just a CSS layout transition.

### Transition from Co-pilot to Command Center

The editor slides away. The chat panel expands to center. The command sidebar appears on the right. The left sidebar collapses. Again, no state loss.

---

## Mode 3: Tour Mode (Phase 3 — Future Vision)

**Philosophy:** Claude drives, you watch and direct. Like a Zoom screen-share where Claude is presenting and you can interrupt anytime.

### Concept

Tour Mode starts as Command Center, but when Claude begins working on files:

1. **Editor auto-follows** — the IDE automatically opens each file Claude touches, scrolls to the line being edited, shows diffs appearing character by character
2. **Floating chat overlay** — the chat window becomes a compact, draggable, resizable floating panel (default: bottom-right corner, ~30% width, ~40% height). Stays on top of the editor.
3. **Voice channel** — bidirectional voice communication. User speaks feedback ("I don't like how that function is structured, can you try a different approach?"), Claude responds verbally and adjusts its work in real-time.
4. **Screen annotation layer** — both user and Claude can draw/highlight over the IDE surface. The user can circle a UI element and say "move this here." Claude can highlight code it's about to change.

### Implementation Dependencies (Phase 3)

- Voice API integration (likely Anthropic's voice mode or a TTS/STT bridge)
- Screen capture for Claude vision (so Claude can see annotations)
- Annotation canvas layer (HTML overlay with drawing tools)
- Floating window mechanics (draggable panel with z-index management)
- Editor auto-follow logic (listen to Claude's file operations, open files, scroll to changes)

### Design Constraints for Phase 1-2

All Phase 1-2 work must preserve the ability to add Tour Mode later:

- The chat panel must be extractable from its layout position into a floating container
- The editor must support "follow mode" where an external signal controls which file/line is shown
- The activity feed data structure must support annotation metadata
- The prompt bar must support voice input alongside text

---

## Additional Features (All Modes)

### Prompt Queue
When Claude is actively working (streaming or executing tools), the user can still type and send messages. These queue up and fire sequentially when Claude finishes the current turn.

- Visual: "2 queued" badge on the prompt bar
- Queue is editable: reorder, delete queued messages before they fire
- Cancel queue: button to clear all queued messages

### Claude Binary Selector
In Settings > Preferences, add a section to:
- Detect installed Claude CLI binaries (scan PATH + common locations)
- Display version for each
- Select which one Vantage uses
- Show current version in the status bar

### Rich Tool Widgets
Replace generic JSON tool call cards with specialized visualizations:
- **File edit**: syntax-highlighted diff (add/remove lines)
- **Bash command**: command text + styled output + exit code badge
- **File read**: file path + line range + content preview
- **Search/grep**: query + formatted result list
- **Directory listing**: expandable tree
- **Web fetch**: URL + status code + response preview
- **MCP tool**: server name + tool name + result

### Effort Level / Thinking Mode
Move from hidden setting to **visible prompt bar control**:
- 5 levels: auto, think, think_hard, think_harder, ultrathink
- Visual indicator of current level
- Clickable to cycle or dropdown to select
- The current "High" button in the status bar should actually work (it's reported as non-functional)

---

## Migration Plan

### What Gets Deleted
- `src/components/layout/ClaudeViewLayout.tsx` — absorbed into unified layout
- `src/components/layout/NavigationStrip.tsx` — replaced by unified activity bar
- `ViewMode = "claude" | "ide"` type — replaced by `"command-center" | "copilot" | "tour"`

### What Gets Created
- `src/components/layout/AppLayout.tsx` — single unified layout
- `src/components/layout/CommandSidebar.tsx` — monitoring panel for Command Center
- `src/components/layout/OverlayDrawer.tsx` — slide-out drawer for activity bar in Command Center
- `src/components/layout/FloatingPanel.tsx` — for Tour Mode chat overlay (Phase 3 prep)
- `src/components/chat/PromptQueue.tsx` — queued message management
- `src/components/chat/ThinkingModeSelector.tsx` — prompt bar thinking level control (exists, needs to be moved to prompt bar)
- `src/components/shared/RichToolWidget.tsx` — specialized tool result renderers
- `src/components/timeline/CheckpointTimeline.tsx` — visual checkpoint tree

### What Gets Modified
- `src/stores/layout.ts` — new ViewMode type, overlay drawer state, prompt queue state
- `src/components/layout/ActivityBar.tsx` — works in all modes, no mode switching
- `src/components/layout/TitleBar.tsx` — updated mode toggle (3 modes)
- `src/components/layout/StatusBar.tsx` — effort level button wired up
- `src/components/chat/ChatInput.tsx` — thinking mode selector, model selector, queue indicator
- `src/hooks/useClaude.ts` — prompt queue logic

---

## Implementation Phases

### Phase 1: Command Center (Priority)
1. Create unified `AppLayout.tsx` with shared shell
2. Implement Command Center layout (chat + command sidebar)
3. Build overlay drawer system for activity bar
4. Build Session Metrics panel (plan usage, tokens, cost)
5. Build Checkpoint Timeline UI (wired to existing Rust commands)
6. Enrich Activity Feed with tool-specific previews
7. Add thinking mode selector to prompt bar
8. Implement prompt queue
9. Add Claude binary selector to Settings
10. Wire up effort level button in status bar
11. Delete ClaudeViewLayout + NavigationStrip

### Phase 2: Co-pilot
1. Add Co-pilot layout to `AppLayout.tsx` (editor center, chat right)
2. Implement smooth layout transitions (CSS transitions, no unmount)
3. Ensure all editor features work (tabs, Ctrl+K, diff viewer, etc.)
4. Test mode switching preserves all state

### Phase 3: Tour Mode
1. Floating chat panel (draggable, resizable)
2. Editor auto-follow (opens files Claude touches, scrolls to changes)
3. Voice integration research + implementation
4. Annotation canvas layer
5. Screen capture for Claude vision

---

## Success Criteria

- Switching modes feels instant — no flash, no state loss, no remount
- Activity bar never causes a mode switch
- Chat history, session state, streaming all preserved across mode changes
- Command Center shows everything you need without clicking away
- Plan usage (5h/weekly) visible at a glance in Command Center
- Tool results are visually rich, not generic JSON
- Thinking mode is accessible from the prompt bar
- Prompt queue lets you stack messages while Claude works
