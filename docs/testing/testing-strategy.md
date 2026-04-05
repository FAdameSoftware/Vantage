# Vantage Testing Strategy

Comprehensive testing plan for the Vantage desktop IDE (Tauri v2 + React 19 + TypeScript + Rust).

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Testing Pyramid for Desktop IDEs](#2-testing-pyramid-for-desktop-ides)
3. [Current State Assessment](#3-current-state-assessment)
4. [Testing Categories and Tooling](#4-testing-categories-and-tooling)
5. [Test Case Design Methodology](#5-test-case-design-methodology)
6. [Test Suites by Feature Area](#6-test-suites-by-feature-area)
7. [Test Case Tables](#7-test-case-tables)
8. [Infrastructure and Configuration](#8-infrastructure-and-configuration)
9. [CI/CD Integration](#9-cicd-integration)
10. [Metrics and Coverage Goals](#10-metrics-and-coverage-goals)

---

## 1. Testing Philosophy

### Guiding Principles

- **Test the contract, not the implementation.** Tests should verify observable behavior (rendered output, state transitions, IPC payloads) rather than internal implementation details.
- **Mock at the boundary.** The Tauri IPC layer is the natural seam between the frontend and backend. The existing `tauriMock.ts` layer is the correct abstraction for browser-mode tests. Rust unit tests cover the other side of the seam independently.
- **Prefer fast, deterministic tests.** The majority of test execution time should be in Vitest unit and component tests (sub-second per suite). E2E and visual tests are slower and reserved for critical user journeys.
- **Fail fast, debug easily.** Tests should produce clear failure messages. Snapshot tests are avoided for anything that changes frequently. Assertions are explicit and describe intent.
- **Tests are documentation.** Test names read as specifications. A developer unfamiliar with a feature should be able to understand its behavior by reading its test suite.

### Risk-Based Prioritization

Test investment is proportional to the risk profile of each area:

| Risk Area | Impact | Likelihood | Test Priority |
|-----------|--------|------------|---------------|
| Data loss (unsaved edits, file corruption) | Critical | Medium | P0 |
| Claude session management (crash, hang) | Critical | Medium | P0 |
| Permission system bypass | Critical | Low | P0 |
| Multi-agent state corruption | High | Medium | P0 |
| File tree synchronization | High | Medium | P1 |
| Editor tab state management | High | Medium | P1 |
| Terminal lifecycle | Medium | Low | P1 |
| Theme/settings persistence | Low | Low | P2 |
| Layout/resize cosmetics | Low | Low | P2 |
| Analytics accuracy | Low | Low | P2 |

---

## 2. Testing Pyramid for Desktop IDEs

Desktop IDE applications have a specific testing profile that differs from web applications. The key distinctions are:

- **Deep state machines** (editor tabs, sessions, agents) require exhaustive unit testing.
- **IPC boundary** between frontend and backend is a critical integration seam.
- **OS-level interactions** (PTY, file system, process management) require native-side testing.
- **Visual complexity** (themes, syntax highlighting, layout) benefits from screenshot regression.
- **Keyboard-driven workflows** require E2E testing of keyboard shortcuts and focus management.

### Recommended Distribution

```
                    /\
                   /  \        Visual/A11y (5%)
                  /----\       ~ 25 tests
                 /      \
                / E2E    \     End-to-End (10%)
               /  (full   \    ~ 50 tests
              /   flows)   \
             /--------------\
            /                \
           / Integration      \   Integration (20%)
          /  (component+store  \   ~ 100 tests
         /   +mock IPC)         \
        /------------------------\
       /                          \
      /     Unit Tests             \   Unit (65%)
     /   (stores, utilities,        \   ~ 350 tests
    /    parsers, pure functions)    \
   /----------------------------------\
```

| Layer | Count Target | Execution Time | Runs When |
|-------|-------------|----------------|-----------|
| Unit | ~350 tests | < 10 seconds | Every save (watch mode), pre-commit |
| Integration | ~100 tests | < 30 seconds | Pre-commit, CI |
| E2E | ~50 tests | < 3 minutes | CI, pre-merge |
| Visual/A11y | ~25 tests | < 2 minutes | CI, weekly full run |

**Total target: ~525 tests** (up from the current 114 unit + 12 E2E = 126).

---

## 3. Current State Assessment

### What Exists Today

**Unit tests (114 tests across 5 store test files):**
- `src/stores/__tests__/editor.test.ts` -- 12 tests covering tab management, dirty state, path normalization
- `src/stores/__tests__/conversation.test.ts` -- 37 tests covering streaming, deltas, results, permissions, sessions
- `src/stores/__tests__/layout.test.ts` -- 7 tests covering sidebar/panel toggles, sizing
- `src/stores/__tests__/agents.test.ts` -- 41 tests covering CRUD, kanban, worktree linking, file tracking, timeline
- `src/stores/__tests__/settings.test.ts` -- 10 tests covering defaults, clamping, toggles, effort level

**E2E tests (12 tests in 1 spec file):**
- `e2e/vantage.spec.ts` -- App loading, activity bar, sidebar switching, command palette, status bar, keyboard shortcuts, theme cycling, prerequisite dialog, console error check, screenshot capture

**Test infrastructure:**
- Vitest v4.1.2 with jsdom environment configured in `vite.config.ts`
- Playwright v1.59.1 with Chromium project, targeting Vite dev server on port 1420
- `@testing-library/react` v16.3.2 and `@testing-library/jest-dom` v6.9.1 installed but not yet used
- Tauri mock layer (`src/lib/tauriMock.ts`) enables full UI rendering in browser

### Gaps to Fill

| Gap | Priority | Effort |
|-----|----------|--------|
| No component tests (Testing Library) | P0 | Medium |
| No tests for 6 stores (commandPalette, agentConversations, mergeQueue, verification, usage, quickQuestion) | P0 | Low |
| No tests for hooks (useClaude, useTerminal, useFileTree, useKeybindings, etc.) | P1 | Medium |
| No tests for utility modules (protocol parser, theme, bmadSharding, agentsmd, pluginRegistry, slashCommands) | P1 | Low |
| No integration tests (component + store + mock IPC) | P1 | High |
| No visual regression tests | P2 | Medium |
| No accessibility tests | P2 | Medium |
| No performance benchmarks | P2 | Low |
| No Rust backend unit tests (cargo test) | P1 | High |
| E2E tests only cover basic rendering, not user flows | P1 | Medium |

---

## 4. Testing Categories and Tooling

### 4.1 Unit Tests

**Scope:** Pure functions, store logic, parsers, protocol types, utility functions.

**Tool:** Vitest v4.1.2 (already installed)

**Configuration:** `vite.config.ts` `test` block with `jsdom` environment.

**What to test:**
- All Zustand store actions and computed selectors
- Protocol message parsing and validation
- Path normalization utilities
- Theme CSS variable generation
- BMAD sharding logic
- agents.md parser
- Plugin registry operations
- Slash command parsing
- File icon mapping

**Patterns:**
```typescript
// Store test pattern (already established)
import { describe, it, expect, beforeEach } from "vitest";
import { useMyStore } from "../myStore";

describe("myStore", () => {
  beforeEach(() => {
    useMyStore.setState({ /* reset */ });
  });

  it("does the thing when action is called", () => {
    useMyStore.getState().myAction(input);
    expect(useMyStore.getState().someField).toBe(expected);
  });
});
```

### 4.2 Component Tests

**Scope:** Individual React components rendered in isolation with mocked stores and IPC.

**Tools:**
- Vitest (test runner)
- `@testing-library/react` v16.3.2 (already installed, not yet used)
- `@testing-library/jest-dom` v6.9.1 (already installed, custom matchers)
- `@testing-library/user-event` (needs installation -- simulates realistic user interactions)

**What to test:**
- Component renders without crashing
- Correct content based on props
- User interactions trigger correct store actions
- Conditional rendering based on state
- Error states display correctly
- Loading states display correctly
- Keyboard navigation works

**Pattern:**
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ActivityBar } from "../ActivityBar";

// Mock the store
vi.mock("@/stores/layout", () => ({
  useLayoutStore: vi.fn(() => ({
    activeActivityBarItem: "explorer",
    setActiveActivityBarItem: vi.fn(),
  })),
}));

describe("ActivityBar", () => {
  it("renders all 5 activity bar buttons", () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText("Explorer")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    // ...
  });

  it("calls setActiveActivityBarItem when button clicked", async () => {
    const user = userEvent.setup();
    render(<ActivityBar />);
    await user.click(screen.getByLabelText("Search"));
    // verify store action was called
  });
});
```

**Needed installation:**
```bash
npm install -D @testing-library/user-event
```

### 4.3 Integration Tests

**Scope:** Component trees that span multiple components, connected to real Zustand stores, with the Tauri mock layer active.

**Tools:**
- Vitest (test runner)
- `@testing-library/react` (rendering)
- Real Zustand stores (not mocked)
- `tauriMock.ts` (mocked Tauri IPC, already exists)

**What to test:**
- File explorer click opens file in editor tab
- Chat input sends message and conversation store updates
- Activity bar click changes sidebar content
- Command palette action triggers correct behavior
- Settings change propagates to editor and terminal
- Agent creation appears in kanban board

**Pattern:**
```typescript
// Integration test -- real stores, mocked IPC
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDELayout } from "@/components/layout/IDELayout";
import { useEditorStore } from "@/stores/editor";

// Ensure mock layer is active
import "@/lib/initMocks";

describe("File Explorer -> Editor integration", () => {
  beforeEach(() => {
    useEditorStore.getState().closeAllTabs();
  });

  it("clicking a file in explorer opens it as a tab", async () => {
    const user = userEvent.setup();
    render(<IDELayout />);
    
    // Click a file node
    await user.click(screen.getByText("main.tsx"));
    
    // Editor tab should appear
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /main.tsx/ })).toBeInTheDocument();
    });
  });
});
```

### 4.4 End-to-End Tests

**Scope:** Full application flows tested through the browser against the Vite dev server with the Tauri mock layer.

**Tool:** Playwright v1.59.1 (already installed and configured)

**What to test:**
- Complete user journeys (open app -> open folder -> edit file -> save)
- Multi-step workflows (create agent -> assign task -> monitor progress)
- Keyboard-driven workflows (command palette -> navigate -> execute)
- Error recovery (session crash -> reconnect -> resume)
- Cross-component interactions (drag agent in kanban -> verify timeline update)

**Configuration already in place:** `e2e/playwright.config.ts` targets `http://localhost:1420`.

### 4.5 Visual Regression Tests

**Scope:** Screenshot comparison to detect unintended visual changes across themes.

**Tools:**
- Playwright `toHaveScreenshot()` (built-in, no additional dependency)
- Or: `@storybook/test-runner` + Chromatic (if Storybook is adopted later)

**What to test:**
- Each theme variant (Dark, Light, High Contrast) full-app screenshot
- Activity bar icon states (active, hover, normal)
- Editor with syntax highlighting (multiple languages)
- Chat panel with messages, tool calls, thinking indicators
- Dialog states (permissions, create agent, settings)
- Error boundary fallback UI

**Pattern:**
```typescript
// In Playwright E2E
test("dark theme visual baseline", async ({ page }) => {
  await page.goto("/");
  await dismissPrereqDialog(page);
  await expect(page).toHaveScreenshot("dark-theme-full.png", {
    maxDiffPixelRatio: 0.01,
  });
});
```

### 4.6 Accessibility Tests

**Scope:** WCAG 2.1 AA compliance for all interactive elements.

**Tools:**
- `@axe-core/playwright` -- automated accessibility audits in E2E tests
- `vitest-axe` or `jest-axe` -- component-level a11y checks in unit tests
- Manual testing with screen readers (NVDA on Windows)

**Needed installation:**
```bash
npm install -D @axe-core/playwright jest-axe
```

**What to test:**
- All interactive elements have accessible names (aria-label, aria-labelledby)
- Focus management after dialog open/close
- Keyboard navigation through all panels (tab order, arrow keys in tree views)
- Color contrast ratios meet AA standard (4.5:1 for normal text, 3:1 for large)
- Screen reader announces state changes (streaming status, tab switching)
- Skip links for keyboard users

**Pattern:**
```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("app has no critical accessibility violations", async ({ page }) => {
  await page.goto("/");
  await dismissPrereqDialog(page);
  
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  
  expect(results.violations).toEqual([]);
});
```

### 4.7 Performance Tests

**Scope:** Render time, memory usage, and interaction responsiveness.

**Tools:**
- Playwright `page.metrics()` for page-level performance
- Vitest `bench` API for micro-benchmarks
- React Profiler integration for component render timing
- Chrome DevTools Performance API (via existing DevTools MCP)

**What to test:**
- Initial app load under 2 seconds
- File tree renders 1000+ nodes without jank (< 16ms frame time)
- Editor tab switch under 100ms
- Chat message stream renders without dropped frames
- Agent kanban with 20+ cards renders under 200ms
- Memory usage stays under 500MB after 1 hour of active use
- No memory leaks from event listeners (terminal, file watcher, Claude events)

**Pattern:**
```typescript
// Vitest bench
import { bench, describe } from "vitest";
import { useEditorStore } from "../editor";

describe("editor store performance", () => {
  bench("open 100 files", () => {
    useEditorStore.getState().closeAllTabs();
    for (let i = 0; i < 100; i++) {
      useEditorStore.getState().openFile(
        `C:/project/file${i}.ts`, `file${i}.ts`, "typescript", `content ${i}`
      );
    }
  });
});
```

### 4.8 Edge Case and Error Handling Tests

**Scope:** Boundary conditions, error paths, and degraded-mode operation.

**Tools:** Vitest (unit level), Playwright (E2E level)

**What to test:**
- Empty/null/undefined inputs to all store actions
- Malformed protocol messages from Claude CLI
- File system permission errors
- Network disconnection mid-stream
- Process crash recovery
- Very large inputs (1MB+ file content, 10000+ message history)
- Unicode, RTL text, emoji in file names and content
- Concurrent operations (multiple agents writing simultaneously)
- Missing dependencies (no git, no Claude CLI, no Node.js)

### 4.9 Rust Backend Tests

**Scope:** All Tauri commands and backend logic.

**Tool:** `cargo test` (Rust built-in test framework)

**What to test:**
- File tree building with various directory structures
- File CRUD operations (including edge cases: symlinks, permissions, encoding)
- Git command parsing (branch, status, log, blame)
- Search with regex patterns
- Claude process spawning and output parsing
- Session lifecycle management
- Worktree creation and cleanup
- MCP config read/write
- Analytics aggregation
- Checkpoint creation and restoration
- Quality gate execution

**Pattern:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_file_tree_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let tree = build_file_tree(dir.path().to_str().unwrap(), 1).unwrap();
        assert!(tree.is_empty());
    }

    #[test]
    fn test_build_file_tree_respects_depth() {
        // ...
    }
}
```

---

## 5. Test Case Design Methodology

### 5.1 Deriving Test Cases from User Stories

Each feature maps to user stories. Test cases are derived by identifying:

1. **Happy path** -- The primary success scenario
2. **Alternative paths** -- Valid but non-primary flows
3. **Error paths** -- Invalid inputs, failures, timeouts
4. **Edge cases** -- Boundary conditions, empty states, maximum capacity

**Example: "As a developer, I want to open a file in the editor."**

| Path | Test Case |
|------|-----------|
| Happy | Click file in explorer -> opens in new tab, content displayed |
| Happy | Click already-open file -> switches to existing tab |
| Alternative | Open file via command palette -> same result |
| Alternative | Open file via double-click (pins preview tab) |
| Error | File has been deleted since tree loaded -> error toast |
| Error | File is binary/too large -> appropriate message |
| Edge | File path contains spaces and unicode |
| Edge | 50 tabs already open -> still works, scrollable tabs |
| Edge | File has no extension -> default language mode |

### 5.2 Equivalence Partitioning

Inputs are divided into classes where all values in a class are expected to produce equivalent behavior. One representative value from each class is tested.

**Example: Font size setting (valid range 8-32)**

| Partition | Representative Value | Expected Behavior |
|-----------|---------------------|-------------------|
| Below minimum | 5 | Clamps to 8 |
| At minimum boundary | 8 | Accepts 8 |
| Normal range | 16 | Accepts 16 |
| At maximum boundary | 32 | Accepts 32 |
| Above maximum | 50 | Clamps to 32 |
| Non-integer | 14.5 | Rounds or rejects |
| Negative | -1 | Clamps to 8 |

### 5.3 Boundary Value Analysis

Test at and immediately around boundaries of valid ranges.

**Example: Tab size (valid range 1-8)**

| Boundary | Values to Test | Expected |
|----------|---------------|----------|
| Min-1 | 0 | Clamps to 1 |
| Min | 1 | Accepts |
| Min+1 | 2 | Accepts |
| Max-1 | 7 | Accepts |
| Max | 8 | Accepts |
| Max+1 | 9, 10 | Clamps to 8 |

### 5.4 Decision Table Testing

For features with multiple conditions affecting the outcome.

**Example: Opening a file in the editor**

| Condition | C1 | C2 | C3 | C4 | C5 |
|-----------|----|----|----|----|-----|
| File already open? | No | Yes | No | No | No |
| Preview tab exists? | No | No | Yes | No | Yes |
| Opening as preview? | No | No | No | Yes | Yes |
| **Action** | | | | | |
| Create new tab | X | | | | |
| Switch to existing | | X | | | |
| Create new tab (keep preview) | | | X | | |
| Create preview tab | | | | X | |
| Replace existing preview | | | | | X |

### 5.5 State Transition Testing

For stateful components and processes, model the states and transitions explicitly.

**Claude Session State Machine:**

```
[disconnected] --start--> [starting] --init--> [ready]
[ready] --send_message--> [streaming]
[streaming] --message_stop--> [ready]
[streaming] --permission_request--> [waiting_permission]
[waiting_permission] --respond--> [streaming]
[streaming] --result--> [ready]
[ready] --stop--> [disconnected]
[any] --error--> [error]
[error] --retry--> [starting]
```

Each transition becomes a test case. Invalid transitions (e.g., sending a message while disconnected) also become test cases to verify they are properly rejected or ignored.

**Agent Kanban State Machine:**

```
[backlog] --move--> [in_progress] (sets status=working)
[backlog] --move--> [review]
[backlog] --move--> [done] (sets status=completed)
[in_progress] --move--> [review] (sets status=reviewing)
[in_progress] --move--> [done] (sets status=completed)
[in_progress] --move--> [backlog] (sets status=idle)
[review] --move--> [done] (sets status=completed)
[review] --move--> [in_progress] (sets status=working)
[done] --move--> [backlog] (sets status=idle)
```

**Editor Tab State Machine:**

```
[no_tabs] --open_file--> [tab_clean]
[tab_clean] --edit--> [tab_dirty]
[tab_dirty] --save--> [tab_clean]
[tab_dirty] --edit_to_original--> [tab_clean]
[tab_clean] --close--> [no_tabs | neighbor_active]
[tab_dirty] --close--> [confirm_dialog]
[confirm_dialog] --save_and_close--> [no_tabs | neighbor_active]
[confirm_dialog] --discard--> [no_tabs | neighbor_active]
[confirm_dialog] --cancel--> [tab_dirty]
```

---

## 6. Test Suites by Feature Area

### 6.1 File Operations

**Unit tests (store level):**
- File tree node expansion/collapse
- File icon resolution by extension
- Path normalization (backslash -> forward slash)

**Component tests:**
- FileExplorer renders tree structure
- FileTreeNode shows correct icon and name
- FileTreeNode click triggers file open
- FileTreeNode context menu renders actions (rename, delete, new file)
- Empty project shows "Open Folder" prompt

**Integration tests:**
- Click file -> editor tab opens with content
- Rename file -> tab title updates
- Delete file -> tab closes
- Create new file -> appears in tree and opens in editor
- File watcher event -> tree updates

**E2E tests:**
- Full flow: open folder -> navigate tree -> open file -> edit -> save
- Drag and drop file (if supported)

### 6.2 Editor

**Unit tests (store level):**
- Open/close/switch tabs
- Dirty state tracking
- Preview tab behavior (replace, pin)
- Close all tabs
- Tab ordering and neighbor selection on close
- Cursor position tracking

**Component tests:**
- EditorTabs renders correct tabs with correct styling (active, dirty, preview)
- MonacoEditor loads with correct language and content
- DiffViewer renders side-by-side diffs
- MarkdownPreview renders markdown correctly

**Integration tests:**
- Settings change (font size, theme) propagates to Monaco editor
- Vim mode toggle enables/disables vim keybindings
- Multiple tabs with dirty state -> close all triggers confirm dialogs

**E2E tests:**
- Open file, edit content, save with Ctrl+S
- Switch between tabs with keyboard (Ctrl+Tab)
- Close tab with Ctrl+W
- Editor zoom with Ctrl+/Ctrl-

### 6.3 Terminal

**Unit tests:**
- Shell detection logic
- Terminal tab management
- Terminal resize dimensions calculation

**Component tests:**
- TerminalInstance renders xterm container
- TerminalTabs shows active terminal, add button
- Terminal tab close button works

**Integration tests:**
- Create terminal -> PTY spawns -> output appears
- Multiple terminal tabs -> independent sessions
- Terminal resize -> PTY dimensions update

**E2E tests:**
- Open terminal panel -> type command -> see output
- Multiple terminals -> switch between them
- Terminal persists across panel toggle

### 6.4 Chat (Claude Integration)

**Unit tests (store level):**
- Message creation (user messages, assistant messages)
- Stream event handling (message_start, content_block_delta, message_stop)
- Thinking delta accumulation
- Tool call accumulation
- Cost/token tracking
- Session init handling
- Permission request/response lifecycle
- Connection status transitions
- Conversation clearing

**Component tests:**
- ChatPanel renders messages list
- MessageBubble renders user vs assistant messages correctly
- CodeBlock renders syntax-highlighted code
- ToolCallCard shows tool name, input, and output
- ThinkingIndicator shows during thinking blocks
- ChatInput handles text entry, submit, and Shift+Enter for newlines
- PermissionDialog shows tool name, input, allow/deny buttons
- SessionSelector renders available sessions
- SlashAutocomplete shows command suggestions

**Integration tests:**
- Type message -> submit -> streaming events -> message appears
- Permission request -> dialog shown -> approve -> streaming resumes
- Session selector -> pick session -> conversation loads

**E2E tests:**
- Full conversation flow: send message -> receive streamed response -> see cost update
- Permission flow: message triggers tool -> permission dialog -> approve -> tool result shown
- Session management: start new, resume existing, switch between

### 6.5 Multi-Agent Orchestration

**Unit tests (store level):**
- Agent CRUD (create, remove, update status)
- Kanban column management (move, reorder)
- Worktree linking
- File tracking and conflict detection
- Timeline event recording
- Session linking
- Agent cost tracking
- Active agent counting

**Component tests:**
- KanbanBoard renders 4 columns with correct agents
- AgentCard shows name, status, progress
- AgentTreeView renders hierarchical agent view
- AgentTimeline shows events in order
- AgentDetailPanel shows full agent info
- CreateAgentDialog validates input
- ConflictBanner appears when file conflict detected
- CheckpointControls shows create/restore/list
- MergeQueuePanel shows quality gates and merge button
- VerificationDashboard shows gate results
- WriterReviewerLauncher creates paired agents

**Integration tests:**
- Create agent -> appears in kanban backlog
- Drag agent to in_progress -> status changes to working
- Agent tracks file -> conflict banner appears when second agent tracks same file
- Checkpoint create -> appears in list -> restore works

**E2E tests:**
- Full agent workflow: create -> assign task -> move through kanban -> complete
- Multi-agent: create 3 agents -> run concurrently -> verify progress tracking

### 6.6 Search

**Unit tests:**
- Search query parsing (regex vs literal)
- Result grouping by file

**Component tests:**
- SearchPanel renders input and options (regex, case-sensitive)
- Search results render with file grouping and line numbers
- Clicking result opens file at correct line

**Integration tests:**
- Type query -> results appear -> click result -> file opens in editor at line

**E2E tests:**
- Full search flow: Ctrl+Shift+F -> type query -> navigate results

### 6.7 Settings

**Unit tests (store level):**
- All setting getters/setters
- Value clamping (font size, tab size)
- Theme cycling
- Effort level and plan mode

**Component tests:**
- SettingsPanel renders all setting groups
- ClaudeMdEditor loads and saves content
- McpManager lists servers, add/remove
- SpecViewer renders spec content
- PluginManager shows installed plugins with toggle
- PluginStore lists available plugins

**Integration tests:**
- Change theme -> CSS variables update on document root
- Change font size -> editor and terminal font sizes update
- Toggle minimap -> editor minimap shows/hides

**E2E tests:**
- Open settings -> change theme -> verify visual change
- Open settings -> change font size -> verify editor text size

### 6.8 Git Integration

**Unit tests:**
- Git status parsing
- Git log entry parsing
- Git blame line parsing
- Branch name extraction

**Component tests:**
- GitLogPanel renders commit list with hash, message, author, date
- GitBlameView renders blame annotations per line
- ResumeFromPR renders PR list

**Integration tests:**
- Git status change -> file tree decorations update
- Click commit in log -> diff view opens

**E2E tests:**
- View git log -> click commit -> see diff
- View blame for current file

### 6.9 Command Palette

**Unit tests (store level):**
- Command registration and filtering
- Recent commands tracking
- Command execution

**Component tests:**
- CommandPalette renders input and command list
- Typing filters commands
- Arrow keys navigate, Enter executes
- Escape closes palette

**Integration tests:**
- Command palette -> "Toggle Minimap" -> minimap toggles
- Command palette -> file search -> opens file

**E2E tests:**
- Ctrl+Shift+P -> type command -> execute -> verify effect

### 6.10 Layout

**Unit tests (store level):**
- Sidebar toggle
- Panel toggle
- Size persistence
- Activity bar item selection

**Component tests:**
- IDELayout renders all areas (title, activity, sidebar, editor, panel, status)
- ActivityBar renders buttons with correct active state
- StatusBar shows line/column, connection status, cost, model
- TitleBar renders app name and window controls
- PrimarySidebar renders correct content for active item
- SecondarySidebar renders chat panel

**Integration tests:**
- Toggle sidebar -> layout resizes correctly
- Toggle panel -> editor area expands
- Resize handle -> sizes update in store

**E2E tests:**
- Ctrl+B toggles sidebar
- Ctrl+J toggles panel
- Drag resize handle -> panels resize

### 6.11 Error Handling and Edge Cases

**Unit tests:**
- ErrorBoundary catches and displays errors
- Store actions handle null/undefined gracefully
- Protocol parser rejects malformed messages

**Component tests:**
- ErrorBoundary renders fallback UI
- PrerequisiteCheck shows failures

**Integration tests:**
- Simulated IPC failure -> error toast appears
- Missing Claude CLI -> appropriate warning
- No git repo -> git features gracefully disabled

**E2E tests:**
- App loads without crashing (already exists)
- No console errors from missing APIs (already exists)

---

## 7. Test Case Tables

### 7.1 File Operations (FO)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| FO-001 | Unit | Open file creates tab with correct metadata | Editor store reset | Call `openFile("C:/p/main.ts", "main.ts", "typescript", "code")` | Tab created with name "main.ts", isDirty=false, correct content | P0 |
| FO-002 | Unit | Open existing file switches to its tab | Two files already open | Call `openFile` with path of first file | activeTabId switches to first file, tab count unchanged | P0 |
| FO-003 | Unit | Path backslash normalization | None | Call `openFile("C:\\p\\main.ts", ...)` | Tab path is "C:/p/main.ts", id is "c:/p/main.ts" | P0 |
| FO-004 | Unit | Close tab selects neighbor | Three tabs open, third active | Call `closeTab` on third tab | Second tab becomes active, tab count is 2 | P0 |
| FO-005 | Unit | Close all tabs resets state | Multiple tabs open | Call `closeAllTabs()` | tabs=[], activeTabId=null | P0 |
| FO-006 | Unit | Update content sets dirty flag | One clean tab open | Call `updateContent` with different content | isDirty=true | P0 |
| FO-007 | Unit | Reverting content clears dirty flag | One dirty tab open | Call `updateContent` with original content | isDirty=false | P0 |
| FO-008 | Unit | Mark saved resets dirty and updates savedContent | Dirty tab | Call `markSaved` with current content | isDirty=false, savedContent matches | P0 |
| FO-009 | Unit | Preview tab replaced by next preview | One preview tab open | Open another file as preview | Only 1 tab, showing new file | P1 |
| FO-010 | Unit | Pin preview tab converts to permanent | Preview tab open | Call `pinTab` | isPreview=false | P1 |
| FO-011 | Unit | getActiveTab returns null when no tabs | Empty editor | Call `getActiveTab()` | Returns null | P1 |
| FO-012 | Component | FileExplorer renders tree nodes | Mock file tree data | Render FileExplorer | Shows directory and file nodes with correct names | P0 |
| FO-013 | Component | FileTreeNode click triggers openFile | File node rendered | Click file node | openFile called with correct path | P0 |
| FO-014 | Component | FileTreeNode shows correct icon | Various file extensions | Render nodes for .ts, .css, .json, .md | Correct icon for each extension | P2 |
| FO-015 | Component | Empty project shows Open Folder | No folder opened | Render FileExplorer | Shows "Open Folder" prompt | P1 |
| FO-016 | Integration | File click opens editor tab | App rendered, mock tree loaded | Click "main.tsx" in tree | Editor tab appears with "main.tsx", content loaded | P0 |
| FO-017 | Integration | File watcher event updates tree | File watcher active | Emit file change event | Tree re-renders with updated entry | P1 |
| FO-018 | E2E | Open folder -> navigate -> open file | App loaded | Click Explorer -> expand folder -> click file | File opens in editor with content | P0 |
| FO-019 | Edge | File with unicode name | Unicode file in tree | Open file with name "README_ja.md" | Tab shows correct name, content loads | P2 |
| FO-020 | Edge | Very long file path | Deep directory structure | Open file at 250+ char path | Tab opens, path truncated in tab tooltip | P2 |

### 7.2 Editor (ED)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| ED-001 | Unit | Tab switch updates activeTabId | Multiple tabs open | Call `setActiveTab` | activeTabId changes to specified tab | P0 |
| ED-002 | Unit | Closing dirty tab (store level) | Dirty tab open | Call `closeTab` on dirty tab | Tab closes (confirm dialog is UI responsibility) | P0 |
| ED-003 | Component | EditorTabs renders active tab with visual distinction | 3 tabs, second active | Render EditorTabs | Second tab has active styling | P0 |
| ED-004 | Component | EditorTabs dirty indicator | One dirty tab | Render EditorTabs | Dirty tab shows dot/indicator | P0 |
| ED-005 | Component | EditorTabs close button | Tab rendered | Click close button on tab | closeTab action called | P0 |
| ED-006 | Component | MonacoEditor renders with content | Tab with content | Render MonacoEditor with tab data | Monaco container rendered, content set | P0 |
| ED-007 | Component | DiffViewer shows two panes | Diff data provided | Render DiffViewer | Left (original) and right (modified) panes visible | P1 |
| ED-008 | Component | MarkdownPreview renders headings and code blocks | Markdown content | Render MarkdownPreview | Formatted output with styled headings and code | P1 |
| ED-009 | Integration | Settings font size change updates editor | Settings panel open | Change editor font size to 18 | Monaco editor font size updates | P1 |
| ED-010 | Integration | Vim mode toggle | Vim mode off | Toggle vim mode on | Vim keybindings active (normal mode indicator visible) | P1 |
| ED-011 | E2E | Edit file and save with Ctrl+S | File open in editor | Type content -> press Ctrl+S | Dirty indicator clears, file saved | P0 |
| ED-012 | E2E | Switch tabs with Ctrl+Tab | Multiple files open | Press Ctrl+Tab | Next tab becomes active | P1 |
| ED-013 | E2E | Close tab with Ctrl+W | File open in editor | Press Ctrl+W | Tab closes, neighbor becomes active | P1 |
| ED-014 | Edge | Open 50+ files | Empty editor | Open 50 files sequentially | All tabs accessible via scrolling, no crash | P2 |
| ED-015 | Edge | Open very large file (5MB+) | Empty editor | Open 5MB file | Loads without freezing UI, may show warning | P2 |
| ED-016 | Edge | Open binary file | Empty editor | Open .png file | Shows "Binary file" message instead of Monaco | P2 |

### 7.3 Terminal (TM)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| TM-001 | Unit | Shell detection returns at least one shell | OS has shells | Call list_shells() | Returns non-empty list with valid shell paths | P1 |
| TM-002 | Unit | Default shell returns valid shell | OS has shells | Call get_default_shell() | Returns shell with non-empty path and name | P1 |
| TM-003 | Component | TerminalTabs renders add button | Terminal area visible | Render TerminalTabs | "+" button visible for creating new terminal | P1 |
| TM-004 | Component | TerminalInstance renders xterm container | Terminal created | Render TerminalInstance | DOM element with xterm class exists | P1 |
| TM-005 | Integration | Create terminal tab | Panel visible | Click "+" in terminal tabs | New terminal tab appears, xterm instance created | P1 |
| TM-006 | Integration | Multiple terminals independent | Two terminals open | Switch between tabs | Each shows its own content/history | P1 |
| TM-007 | E2E | Terminal panel shows and accepts input | App loaded | Toggle panel with Ctrl+J -> focus terminal | Terminal visible, can type text | P1 |
| TM-008 | Edge | Terminal resize on panel resize | Terminal active | Drag panel resize handle | Terminal reflows text, no corruption | P2 |
| TM-009 | Edge | Close last terminal tab | One terminal open | Close the terminal tab | Terminal area shows empty state or auto-creates new | P2 |

### 7.4 Chat / Claude Integration (CH)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| CH-001 | Unit | addUserMessage creates correct message | Store reset | Call addUserMessage("Hello") | messages[0]: role=user, text="Hello", unique id, timestamp | P0 |
| CH-002 | Unit | Stream event message_start sets isStreaming | Store reset | Handle message_start event | isStreaming=true | P0 |
| CH-003 | Unit | Text deltas accumulate correctly | Stream started | Handle multiple text_delta events | Assembled text matches concatenation | P0 |
| CH-004 | Unit | Tool use blocks accumulate JSON deltas | Stream started with tool_use block | Handle input_json_delta events | Tool call has correct name and parsed input | P0 |
| CH-005 | Unit | Thinking deltas accumulate and set isThinking | Stream started with thinking block | Handle thinking_delta events | Thinking text correct, isThinking true during, false after stop | P0 |
| CH-006 | Unit | message_stop finalizes message and clears streaming | Stream with content | Handle message_stop | isStreaming=false, message in messages array | P0 |
| CH-007 | Unit | handleResult updates cost and tokens | Store reset | Handle result with cost=0.05, tokens | totalCost=0.05, totalTokens match | P0 |
| CH-008 | Unit | Cost accumulates across results | One result already processed | Handle second result | totalCost is sum of both | P0 |
| CH-009 | Unit | handleSystemInit stores session metadata | Store reset | Handle system init message | Session stored with correct id, model, cwd | P0 |
| CH-010 | Unit | setPendingPermission stores permission request | Store reset | Call with Bash tool permission | pendingPermission has toolName, toolInput, sessionId | P0 |
| CH-011 | Unit | setPendingPermission(null) clears | Permission pending | Call setPendingPermission(null) | pendingPermission=null | P0 |
| CH-012 | Unit | clearConversation resets all state | Full state populated | Call clearConversation() | messages=[], cost=0, tokens=0, session=null, etc. | P0 |
| CH-013 | Unit | handleAssistantMessage appends new message | Store reset | Handle assistant message | messages[0] with correct text | P0 |
| CH-014 | Unit | handleAssistantMessage reconciles existing message | Message already exists with same id | Handle updated assistant message | messages[0] text updated, length still 1 | P0 |
| CH-015 | Unit | Connection status transitions | Store reset | Set status to starting -> ready -> streaming -> ready | Each status correctly stored | P0 |
| CH-016 | Unit | Connection error recorded | Store reset | Set status to error with message | connectionError contains message | P0 |
| CH-017 | Unit | Error result stores error info | Store reset | Handle error result | lastResult.isError=true, errors array populated | P0 |
| CH-018 | Component | ChatPanel renders message list | Messages in store | Render ChatPanel | All messages visible in correct order | P0 |
| CH-019 | Component | MessageBubble user vs assistant styling | User and assistant messages | Render both | Different visual styles for each role | P0 |
| CH-020 | Component | CodeBlock renders with syntax highlighting | Message with code fence | Render CodeBlock | Syntax-highlighted code displayed | P1 |
| CH-021 | Component | ToolCallCard shows tool name and input | Tool call in message | Render ToolCallCard | Tool name, formatted input visible | P1 |
| CH-022 | Component | ThinkingIndicator shows during thinking | isThinking=true | Render ThinkingIndicator | Animated indicator visible | P1 |
| CH-023 | Component | ChatInput handles text entry and submit | Chat panel visible | Type text and press Enter | onSubmit called with text, input clears | P0 |
| CH-024 | Component | ChatInput Shift+Enter adds newline | Chat panel visible | Type text, press Shift+Enter | Newline inserted, form not submitted | P1 |
| CH-025 | Component | PermissionDialog shows tool info | Permission pending | Render PermissionDialog | Tool name, input details, Allow/Deny buttons visible | P0 |
| CH-026 | Component | PermissionDialog allow button calls respond | Dialog shown | Click "Allow" | Permission response sent with allow=true | P0 |
| CH-027 | Component | PermissionDialog deny button calls respond | Dialog shown | Click "Deny" | Permission response sent with allow=false | P0 |
| CH-028 | Component | SessionSelector renders sessions | Sessions available | Render SessionSelector | Session list visible with ids/timestamps | P1 |
| CH-029 | Component | SlashAutocomplete shows suggestions | User types "/" | Render with "/" input | Autocomplete dropdown visible with commands | P1 |
| CH-030 | Integration | Send message -> streaming -> message appears | Session connected | Type and submit message | User message appears, then streaming assistant message builds | P0 |
| CH-031 | Integration | Permission flow blocks and resumes | Streaming active | Permission request arrives -> approve | Streaming resumes after approval | P0 |
| CH-032 | E2E | Full conversation flow | App loaded, session mock | Type message -> submit -> see response stream -> cost updates | Complete flow works | P0 |
| CH-033 | E2E | Permission dialog flow | Session mock with tool use | Send message that triggers tool -> dialog appears -> approve -> result shown | Permission flow works end-to-end | P0 |
| CH-034 | Edge | Rapid message sending | Session active | Send 10 messages in quick succession | All messages queued and processed in order | P1 |
| CH-035 | Edge | Very long assistant response | Stream active | 50KB+ response streaming | Renders without freezing, auto-scrolls | P2 |
| CH-036 | Edge | Malformed stream event | Stream active | Handle event with missing fields | Silently ignored, no crash | P0 |
| CH-037 | Edge | Session disconnected mid-stream | Streaming active | Simulate process exit | isStreaming clears, error status shown, partial message preserved | P0 |

### 7.5 Multi-Agent Orchestration (AG)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| AG-001 | Unit | createAgent returns unique ID | Store reset | Call createAgent | Non-empty string ID returned | P0 |
| AG-002 | Unit | createAgent initializes in backlog | Store reset | Call createAgent | Agent column=backlog, status=idle | P0 |
| AG-003 | Unit | createAgent adds to backlog column order | Store reset | Call createAgent | columnOrder.backlog contains new ID | P0 |
| AG-004 | Unit | removeAgent cleans up map and columns | Agent exists | Call removeAgent | Agent removed from map and column order | P0 |
| AG-005 | Unit | removeAgent is no-op for nonexistent ID | Store reset | Call removeAgent("ghost") | No error thrown | P1 |
| AG-006 | Unit | updateAgentStatus sets all valid statuses | Agent exists | Set each of 7 statuses | Each status correctly stored | P0 |
| AG-007 | Unit | updateAgentStatus stores error message | Agent exists | Set status to "error" with message | errorMessage stored | P0 |
| AG-008 | Unit | moveAgent between columns | Agent in backlog | Move to in_progress | Agent in new column, removed from old, status=working | P0 |
| AG-009 | Unit | moveAgent to done sets completed | Agent in any column | Move to done | status=completed | P0 |
| AG-010 | Unit | moveAgent with toIndex | Agent exists, target column has items | Move to position 0 | Agent at index 0 in target column | P1 |
| AG-011 | Unit | reorderInColumn changes order | 2 agents in backlog | Reverse order | Column order reversed | P1 |
| AG-012 | Unit | linkSession sets sessionId | Agent exists | Call linkSession | sessionId updated | P0 |
| AG-013 | Unit | linkWorktree sets path and branch | Agent exists | Call linkWorktree | worktreePath and branchName updated | P0 |
| AG-014 | Unit | trackFile adds unique files | Agent exists | Track 2 files, one duplicate | assignedFiles has 2 entries | P0 |
| AG-015 | Unit | hasFileConflict detects multi-agent overlap | 2 agents track same file | Call hasFileConflict | Returns true | P0 |
| AG-016 | Unit | hasFileConflict returns false for single agent | 1 agent tracks file | Call hasFileConflict | Returns false | P1 |
| AG-017 | Unit | addTimelineEvent appends with id and timestamp | Agent exists | Add 2 events | Timeline has 2 entries in order, each with id and timestamp | P1 |
| AG-018 | Unit | updateAgentCost accumulates | Agent exists | Two cost updates | Cost and tokens are sums | P1 |
| AG-019 | Unit | getActiveAgentCount counts working/waiting | 3 agents with different statuses | Call getActiveAgentCount | Counts only working + waiting_permission | P1 |
| AG-020 | Unit | getAgentBySessionId finds correct agent | Agent with linked session | Call with session ID | Returns correct agent | P0 |
| AG-021 | Unit | getAgentBySessionId returns undefined for missing | No matching session | Call with unknown ID | Returns undefined | P1 |
| AG-022 | Unit | Unique colors assigned to agents | Store reset | Create 8 agents | Each has a color, first 8 are all different | P2 |
| AG-023 | Component | KanbanBoard renders 4 columns | Agents in various columns | Render KanbanBoard | Backlog, In Progress, Review, Done columns visible | P0 |
| AG-024 | Component | AgentCard shows name and status | Agent data | Render AgentCard | Name, status badge, color indicator visible | P0 |
| AG-025 | Component | CreateAgentDialog validates required fields | Dialog open | Submit with empty name | Validation error shown | P1 |
| AG-026 | Component | ConflictBanner shows when conflict exists | File conflict detected | Render ConflictBanner | Warning banner visible with file name | P1 |
| AG-027 | Component | AgentTimeline renders events | Agent with timeline | Render AgentTimeline | Events shown in chronological order | P1 |
| AG-028 | Integration | Create agent appears in kanban | App rendered | Fill create dialog and submit | New card appears in backlog column | P0 |
| AG-029 | Integration | Move agent in kanban updates store | Agent in backlog | Drag to in_progress (or programmatic move) | Column and status update in store | P0 |
| AG-030 | E2E | Full agent workflow | App loaded | Create agent -> assign -> monitor -> complete | Agent moves through kanban lifecycle | P1 |
| AG-031 | Edge | Create agent at max concurrent limit | maxConcurrentAgents=3, 3 already working | Create and start 4th | Warning or queuing behavior | P2 |
| AG-032 | Edge | Remove agent with active session | Agent has linked session | Remove agent | Session cleanup handled | P1 |

### 7.6 Search (SR)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| SR-001 | Unit | search_project returns matches | Files exist with known content | Call with literal query | Results contain expected files and line numbers | P0 |
| SR-002 | Unit | search_project regex mode | Files exist | Call with regex pattern, is_regex=true | Regex matches returned | P1 |
| SR-003 | Unit | search_project case sensitivity | Files with mixed case | Call with case_sensitive=true and false | Results differ based on flag | P1 |
| SR-004 | Unit | search_project respects max_results | Many matches | Call with max_results=5 | At most 5 results returned | P1 |
| SR-005 | Unit | search_project glob filter | Files of various types | Call with glob_filter="*.ts" | Only .ts files in results | P1 |
| SR-006 | Component | SearchPanel renders input and toggles | Search view active | Render SearchPanel | Input field, regex toggle, case toggle visible | P0 |
| SR-007 | Component | Search results grouped by file | Results available | Render results | Results grouped under file headers with line numbers | P1 |
| SR-008 | Integration | Type query -> results appear | App with folder open | Type in search input | Results appear below after debounce | P0 |
| SR-009 | Integration | Click result opens file at line | Results visible | Click a result entry | File opens in editor, cursor at correct line | P0 |
| SR-010 | E2E | Full search flow via Ctrl+Shift+F | App loaded | Press Ctrl+Shift+F -> type query -> click result | Search opens, results shown, file opens at line | P1 |
| SR-011 | Edge | Search with empty query | Search panel open | Submit empty string | No results, no error | P2 |
| SR-012 | Edge | Search with invalid regex | Regex mode on | Submit "[invalid" | Error message shown, no crash | P1 |
| SR-013 | Edge | Search in project with 10000+ files | Large project | Submit common query | Results return within 5 seconds, no freeze | P2 |

### 7.7 Settings (ST)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| ST-001 | Unit | Defaults are correct | Fresh store | Read all default values | theme=vantage-dark, fontSize=14, tabSize=2, etc. | P0 |
| ST-002 | Unit | Font size clamps below minimum | Store ready | Set font size to 5 | Clamped to 8 | P0 |
| ST-003 | Unit | Font size clamps above maximum | Store ready | Set font size to 50 | Clamped to 32 | P0 |
| ST-004 | Unit | Tab size clamps below minimum | Store ready | Set tab size to 0 | Clamped to 1 | P0 |
| ST-005 | Unit | Tab size clamps above maximum | Store ready | Set tab size to 10 | Clamped to 8 | P0 |
| ST-006 | Unit | Boolean toggles work | Store ready | Toggle wordWrap, minimap, lineNumbers, insertSpaces | Each toggles correctly | P0 |
| ST-007 | Unit | Effort level accepts valid values | Store ready | Set to "low", "medium", "high" | Each accepted | P1 |
| ST-008 | Unit | Plan mode toggles | Store ready | Set to true then false | Each state stored | P1 |
| ST-009 | Component | SettingsPanel renders all groups | Settings view active | Render SettingsPanel | Editor, terminal, Claude, appearance sections visible | P1 |
| ST-010 | Component | Theme picker shows options | Settings panel open | Render theme section | Dark, Light, High Contrast options | P1 |
| ST-011 | Integration | Theme change updates CSS variables | App rendered | Change theme to light | document root has theme-light class | P0 |
| ST-012 | Integration | Font size change updates editor | Editor open | Change font size to 18 | Monaco editor reflects new size | P1 |
| ST-013 | E2E | Theme cycling with keyboard | App loaded | Press Ctrl+Shift+Alt+K three times | Dark -> Light -> High Contrast -> Dark | P1 |
| ST-014 | E2E | Settings persistence across reload | App loaded | Change setting -> reload page | Setting persists (via store persistence) | P1 |
| ST-015 | Edge | Font size at exact boundaries | Store ready | Set to 8 and 32 | Both accepted without clamping | P2 |
| ST-016 | Edge | Negative font size | Store ready | Set to -5 | Clamped to 8 | P2 |

### 7.8 Git Integration (GI)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| GI-001 | Unit | get_git_branch returns branch info | Inside git repo | Call get_git_branch | Returns name, optional upstream, ahead/behind counts | P1 |
| GI-002 | Unit | get_git_status returns file statuses | Modified files in repo | Call get_git_status | List of files with correct status codes (M, A, D, ??) | P1 |
| GI-003 | Unit | git_log returns entries | Repo with commits | Call git_log with limit=5 | Up to 5 entries with hash, message, author, date | P1 |
| GI-004 | Unit | git_blame returns line annotations | File with history | Call git_blame | Each line annotated with hash, author, date | P1 |
| GI-005 | Component | GitLogPanel renders commit list | Log data available | Render GitLogPanel | Commits shown with hash, message, author | P1 |
| GI-006 | Component | GitBlameView renders annotations | Blame data available | Render GitBlameView | Each line shows blame info | P1 |
| GI-007 | Component | ResumeFromPR renders PR list | PRs available | Render ResumeFromPR | PR numbers, titles, branches visible | P1 |
| GI-008 | Integration | Branch display in status bar | Folder open in git repo | Check status bar | Current branch name visible | P1 |
| GI-009 | Integration | Git status decorations on file tree | Modified files exist | View file explorer | Modified files show status indicators | P1 |
| GI-010 | E2E | View git log panel | App with git repo | Click Source Control -> view log | Log entries displayed | P2 |
| GI-011 | Edge | Non-git directory | Folder is not a repo | Open folder | Git features gracefully hidden or show "Not a git repo" | P1 |
| GI-012 | Edge | Detached HEAD state | Repo in detached HEAD | Check branch display | Shows commit hash instead of branch name | P2 |

### 7.9 Command Palette (CP)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| CP-001 | Unit | Command filtering by query | Commands registered | Filter with "toggle" | Only commands containing "toggle" returned | P0 |
| CP-002 | Unit | Empty query returns all commands | Commands registered | Filter with "" | All commands returned | P1 |
| CP-003 | Component | Palette opens and shows input | Command palette triggered | Render CommandPalette | Input field focused, command list visible | P0 |
| CP-004 | Component | Typing filters command list | Palette open | Type "theme" | Only theme-related commands shown | P0 |
| CP-005 | Component | Arrow keys navigate commands | Palette open with results | Press ArrowDown | Highlight moves to next command | P1 |
| CP-006 | Component | Enter executes highlighted command | Command highlighted | Press Enter | Command executes, palette closes | P0 |
| CP-007 | Component | Escape closes palette | Palette open | Press Escape | Palette hidden | P0 |
| CP-008 | E2E | Full command palette flow | App loaded | Ctrl+Shift+P -> type "Toggle Panel" -> Enter | Panel toggles | P0 |
| CP-009 | E2E | File quick open | App loaded | Ctrl+P -> type filename | File list appears, select opens file | P1 |
| CP-010 | Edge | No matching commands | Palette open | Type "xyznonexistent" | Empty state message shown | P2 |

### 7.10 Layout (LY)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| LY-001 | Unit | Primary sidebar toggle | Sidebar visible | Call togglePrimarySidebar | Sidebar hidden | P0 |
| LY-002 | Unit | Secondary sidebar toggle | Sidebar visible | Call toggleSecondarySidebar | Sidebar hidden | P0 |
| LY-003 | Unit | Panel toggle | Panel visible | Call togglePanel | Panel hidden | P0 |
| LY-004 | Unit | Activity bar item switch opens sidebar | Sidebar open, explorer active | Set item to "search" | Sidebar stays open, item changes | P0 |
| LY-005 | Unit | Clicking active item collapses sidebar | Sidebar open, explorer active | Set item to "explorer" | Sidebar collapses | P0 |
| LY-006 | Unit | Size setters update values | Default sizes | Set primary=30, secondary=35, panel=40 | All sizes updated | P1 |
| LY-007 | Component | IDELayout renders all areas | Default layout | Render IDELayout | Title bar, activity bar, sidebar, editor, panel, status bar all visible | P0 |
| LY-008 | Component | ActivityBar renders 5 buttons | Default state | Render ActivityBar | Explorer, Search, Source Control, Agents, Settings buttons | P0 |
| LY-009 | Component | StatusBar shows expected info | Default state | Render StatusBar | Line/Col, Ready status, $0.0000 cost, model name | P0 |
| LY-010 | E2E | Ctrl+B toggles sidebar | App loaded | Press Ctrl+B twice | Sidebar hides then reappears | P0 |
| LY-011 | E2E | Ctrl+J toggles panel | App loaded | Press Ctrl+J twice | Panel hides then reappears | P0 |
| LY-012 | E2E | Activity bar clicks switch sidebar content | App loaded | Click Search, then Explorer | Sidebar content changes each time | P0 |
| LY-013 | Edge | All panels collapsed | All visible | Toggle all off | Only activity bar and editor area visible, no crash | P2 |

### 7.11 Error Handling and Edge Cases (EH)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| EH-001 | Unit | Error boundary catches render error | Component that throws | Render ErrorBoundary wrapping throwing component | Fallback UI shown with error message | P0 |
| EH-002 | Unit | Store actions handle null input | Store ready | Call actions with null/undefined where unexpected | No crash, graceful handling | P0 |
| EH-003 | Unit | Protocol parser rejects invalid message type | None | Parse message with unknown type | Returns error or ignores gracefully | P0 |
| EH-004 | Unit | Protocol parser handles missing fields | None | Parse stream event missing required fields | No crash, partial data handled | P0 |
| EH-005 | Component | ErrorBoundary renders fallback UI | Error triggered | Trigger error in child component | Error message and recovery option shown | P0 |
| EH-006 | Component | PrerequisiteCheck shows failures | One check failing | Render with failed prerequisite | Failed check shown with error detail | P1 |
| EH-007 | Integration | IPC failure shows error | Tauri mock returns error | Trigger IPC call that fails | Error toast or message appears | P1 |
| EH-008 | Integration | Missing Claude CLI | Prerequisites check finds no claude | App loads | Warning shown, chat disabled or shows install prompt | P1 |
| EH-009 | Integration | No git repository | Folder has no .git | Open non-git folder | Git features disabled, no error | P1 |
| EH-010 | E2E | App loads without console errors | Fresh start | Load app, wait 2s | No critical console errors | P0 |
| EH-011 | E2E | Rapid keyboard shortcut firing | App loaded | Press Ctrl+B 20 times quickly | App responsive, sidebar toggles correctly | P1 |
| EH-012 | Edge | Empty project (no files) | Open empty directory | View file explorer | Empty state shown cleanly | P1 |
| EH-013 | Edge | 10000+ messages in conversation | Long session | Scroll conversation with 10K messages | Renders without freeze (virtualization needed) | P2 |
| EH-014 | Edge | All stores at maximum capacity | All features heavily used | Normal operations | No memory leaks, app responsive | P2 |
| EH-015 | Edge | Window resize to minimum | App loaded | Resize window to 800x600 | Layout adapts, nothing cut off or overlapping | P2 |
| EH-016 | Edge | Window resize to very small | App loaded | Resize to 400x300 | Graceful degradation, no crash | P2 |

### 7.12 Analytics (AN)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| AN-001 | Unit | get_analytics returns summary | Analytics data exists | Call get_analytics(7) | Returns summary with cost, tokens, sessions | P2 |
| AN-002 | Component | UsageDashboard renders charts | Analytics data available | Render UsageDashboard | Cost chart, model distribution, sessions per day visible | P2 |
| AN-003 | Component | CostChart renders with data | Cost data | Render CostChart | Chart with axes and data points | P2 |
| AN-004 | Component | ModelDistribution shows breakdown | Model usage data | Render ModelDistribution | Pie/bar chart with model names and percentages | P2 |
| AN-005 | Edge | Analytics with no data | No sessions | Render dashboard | Shows empty state, not error | P2 |

### 7.13 Visual Regression (VR)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| VR-001 | Visual | Dark theme full app | App loaded, dark theme | Screenshot full page | Matches baseline within 1% pixel diff | P1 |
| VR-002 | Visual | Light theme full app | App loaded, light theme | Screenshot full page | Matches baseline | P1 |
| VR-003 | Visual | High contrast theme full app | App loaded, HC theme | Screenshot full page | Matches baseline | P1 |
| VR-004 | Visual | Editor with syntax highlighting | TypeScript file open | Screenshot editor area | Correct syntax colors for theme | P2 |
| VR-005 | Visual | Chat with mixed content | Messages with code, tool calls, thinking | Screenshot chat panel | All elements styled correctly | P2 |
| VR-006 | Visual | Kanban board with agents | Multiple agents across columns | Screenshot kanban | Cards styled correctly with status colors | P2 |
| VR-007 | Visual | Permission dialog | Permission pending | Screenshot dialog | Dialog styled correctly with tool info | P2 |
| VR-008 | Visual | Settings panel | Settings open | Screenshot settings | Form elements styled and aligned | P2 |

### 7.14 Accessibility (A11Y)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| A11Y-001 | A11y | No critical WCAG violations | App loaded | Run axe-core scan | Zero critical violations | P1 |
| A11Y-002 | A11y | Activity bar buttons have labels | App loaded | Check all activity bar buttons | Each has aria-label | P1 |
| A11Y-003 | A11y | Dialog focus trap | Dialog open | Press Tab repeatedly | Focus stays within dialog | P1 |
| A11Y-004 | A11y | Editor tabs keyboard navigation | Multiple tabs | Press Tab/Arrow keys in tab bar | Can navigate between tabs with keyboard | P1 |
| A11Y-005 | A11y | Status bar has role="status" | App loaded | Check status bar | Has role="status" and aria-label | P1 |
| A11Y-006 | A11y | Color contrast dark theme | Dark theme active | Run contrast check | All text meets 4.5:1 ratio | P1 |
| A11Y-007 | A11y | Color contrast light theme | Light theme active | Run contrast check | All text meets 4.5:1 ratio | P1 |
| A11Y-008 | A11y | Color contrast high contrast theme | HC theme active | Run contrast check | All text meets 7:1 ratio | P1 |
| A11Y-009 | A11y | Keyboard shortcut discovery | App loaded | Open command palette | All shortcuts listed with their keybindings | P2 |
| A11Y-010 | A11y | Focus visible indicator | Tab through app | Press Tab | Visible focus ring on every focusable element | P1 |
| A11Y-011 | A11y | Screen reader announces streaming | Screen reader active | Start a Claude response | Status change announced to screen reader | P2 |
| A11Y-012 | A11y | File tree keyboard navigation | Explorer active | Use arrow keys in file tree | Navigate tree, Enter opens file, Space toggles folder | P1 |

### 7.15 Performance (PF)

| ID | Category | Description | Preconditions | Steps | Expected Result | Priority |
|----|----------|-------------|---------------|-------|-----------------|----------|
| PF-001 | Perf | App initial load time | Cold start | Measure time from navigation to "Vantage" text visible | Under 2 seconds | P1 |
| PF-002 | Perf | Tab switch time | 10 tabs open | Switch tabs, measure render time | Under 100ms | P2 |
| PF-003 | Perf | Open 100 files benchmark | Empty editor | Benchmark opening 100 files | Under 500ms total | P2 |
| PF-004 | Perf | Conversation store with 1000 messages | Reset store | Add 1000 messages, measure | Under 2 seconds | P2 |
| PF-005 | Perf | File tree with 1000 nodes | Large mock tree | Render file explorer | Under 500ms render time | P2 |
| PF-006 | Perf | Kanban with 50 agents | 50 agents created | Render KanbanBoard | Under 300ms render time | P2 |
| PF-007 | Perf | Search results with 500 matches | Search executed | Render search results | Under 200ms render time | P2 |
| PF-008 | Perf | Memory after 100 tab open/close cycles | App loaded | Open and close 100 tabs sequentially | Memory within 50MB of starting point | P2 |
| PF-009 | Perf | Streaming 10KB message render | Stream active | Stream 10KB of text | No dropped frames (60fps maintained) | P2 |
| PF-010 | Perf | Theme switch time | App loaded | Switch theme | Under 100ms visual update | P2 |

---

## 8. Infrastructure and Configuration

### 8.1 Vitest Configuration

The current configuration in `vite.config.ts` is adequate. No changes needed for unit and component tests:

```typescript
test: {
  environment: "jsdom",
  globals: true,
  exclude: ["e2e/**", "node_modules/**"],
  setupFiles: ["./src/test-setup.ts"], // ADD THIS
}
```

**New file needed: `src/test-setup.ts`**
```typescript
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});

// Ensure mock layer is active for integration tests
import "./lib/initMocks";
```

### 8.2 Playwright Configuration

The current `e2e/playwright.config.ts` is well-configured. Add visual regression and accessibility capabilities:

```typescript
// Add to existing config
use: {
  baseURL: "http://localhost:1420",
  trace: "on-first-retry",
  screenshot: "only-on-failure",
},
expect: {
  toHaveScreenshot: {
    maxDiffPixelRatio: 0.01,
  },
},
```

### 8.3 File Organization

```
src/
  test-setup.ts                         # Vitest setup (new)
  stores/__tests__/
    editor.test.ts                      # (exists)
    conversation.test.ts                # (exists)
    layout.test.ts                      # (exists)
    agents.test.ts                      # (exists)
    settings.test.ts                    # (exists)
    commandPalette.test.ts              # (new)
    agentConversations.test.ts          # (new)
    mergeQueue.test.ts                  # (new)
    verification.test.ts                # (new)
    usage.test.ts                       # (new)
    quickQuestion.test.ts               # (new)
  hooks/__tests__/
    useClaude.test.ts                   # (new)
    useKeybindings.test.ts              # (new)
    useFileTree.test.ts                 # (new)
    useTerminal.test.ts                 # (new)
    useGitStatus.test.ts                # (new)
    useVimMode.test.ts                  # (new)
  lib/__tests__/
    protocol.test.ts                    # (new)
    tauriMock.test.ts                   # (new)
    agentsmd.test.ts                    # (new)
    pluginRegistry.test.ts              # (new)
    slashCommands.test.ts               # (new)
    bmadSharding.test.ts                # (new)
    themeCustomization.test.ts          # (new)
    utils.test.ts                       # (new)
  components/__tests__/
    layout/
      ActivityBar.test.tsx              # (new)
      StatusBar.test.tsx                # (new)
      IDELayout.test.tsx                # (new)
      PrimarySidebar.test.tsx           # (new)
    editor/
      EditorTabs.test.tsx               # (new)
      MonacoEditor.test.tsx             # (new)
    chat/
      ChatPanel.test.tsx                # (new)
      ChatInput.test.tsx                # (new)
      MessageBubble.test.tsx            # (new)
      ToolCallCard.test.tsx             # (new)
      PermissionDialog.test.tsx         # (new)
    agents/
      KanbanBoard.test.tsx              # (new)
      AgentCard.test.tsx                # (new)
      CreateAgentDialog.test.tsx        # (new)
    files/
      FileExplorer.test.tsx             # (new)
      FileTreeNode.test.tsx             # (new)
    search/
      SearchPanel.test.tsx              # (new)
    shared/
      CommandPalette.test.tsx           # (new)
      ErrorBoundary.test.tsx            # (new)
      PrerequisiteCheck.test.tsx        # (new)
    settings/
      SettingsPanel.test.tsx            # (new)
e2e/
  playwright.config.ts                  # (exists)
  vantage.spec.ts                       # (exists - basic rendering)
  flows/
    file-operations.spec.ts             # (new)
    chat-conversation.spec.ts           # (new)
    agent-workflow.spec.ts              # (new)
    search.spec.ts                      # (new)
    settings-persistence.spec.ts        # (new)
    command-palette.spec.ts             # (new)
  visual/
    themes.spec.ts                      # (new)
    components.spec.ts                  # (new)
  accessibility/
    wcag-audit.spec.ts                  # (new)
    keyboard-navigation.spec.ts         # (new)
  performance/
    load-time.spec.ts                   # (new)
    interaction-speed.spec.ts           # (new)
src-tauri/
  src/files/tests.rs                    # (new - Rust unit tests)
  src/git_tests.rs                      # (new)
  src/search_tests.rs                   # (new)
  src/claude/tests.rs                   # (new)
```

### 8.4 NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "npx vitest run",
    "test:watch": "npx vitest",
    "test:coverage": "npx vitest run --coverage",
    "test:e2e": "npx playwright test --config e2e/playwright.config.ts",
    "test:e2e:ui": "npx playwright test --config e2e/playwright.config.ts --ui",
    "test:e2e:visual": "npx playwright test --config e2e/playwright.config.ts e2e/visual/",
    "test:e2e:a11y": "npx playwright test --config e2e/playwright.config.ts e2e/accessibility/",
    "test:all": "npx vitest run && npx playwright test --config e2e/playwright.config.ts",
    "test:rust": "cd src-tauri && cargo test"
  }
}
```

### 8.5 Additional Dependencies Needed

```bash
# Component testing (user interaction simulation)
npm install -D @testing-library/user-event

# Accessibility testing
npm install -D @axe-core/playwright jest-axe

# Coverage reporting
npm install -D @vitest/coverage-v8
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx vitest run --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --config e2e/playwright.config.ts
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  rust-tests:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cd src-tauri && cargo test
```

### 9.2 Pre-Commit Hook

```bash
# .husky/pre-commit (or equivalent)
npx vitest run --bail 1
```

### 9.3 Pre-Merge Gate

All tests must pass before merging to main:
- Unit tests (Vitest): 100% pass rate required
- E2E tests (Playwright): 100% pass rate required
- Rust tests (cargo test): 100% pass rate required
- Visual regression: Manual review of screenshot diffs if any
- Coverage: Minimum 60% line coverage (growing toward 80%)

---

## 10. Metrics and Coverage Goals

### 10.1 Coverage Targets by Phase

| Phase | Timeline | Unit Coverage | Integration Count | E2E Count | Total Tests |
|-------|----------|--------------|-------------------|-----------|-------------|
| Current | Now | ~30% (5 stores) | 0 | 12 | 126 |
| Phase 1 | +2 weeks | 50% (all stores + libs) | 20 | 12 | ~250 |
| Phase 2 | +4 weeks | 65% (+ component tests) | 50 | 25 | ~380 |
| Phase 3 | +8 weeks | 75% (+ hooks, integration) | 80 | 40 | ~480 |
| Phase 4 | +12 weeks | 80% (+ visual, a11y, perf) | 100 | 50 | ~525 |

### 10.2 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Line coverage (frontend) | 80% | `vitest --coverage` |
| Branch coverage (frontend) | 70% | `vitest --coverage` |
| Line coverage (Rust) | 60% | `cargo tarpaulin` |
| Test execution time (unit) | < 10 seconds | CI timing |
| Test execution time (E2E) | < 3 minutes | CI timing |
| Flaky test rate | < 2% | Track retry rate in CI |
| Mean time to fix failing test | < 1 day | Process metric |
| Test-to-code ratio | > 1.5:1 | LOC comparison |

### 10.3 What NOT to Test

To avoid wasted effort, explicitly exclude:

- **Third-party library internals**: Monaco Editor rendering details, xterm.js terminal behavior, shadcn/ui component styling. These libraries have their own test suites.
- **CSS pixel values**: Fragile and theme-dependent. Use visual regression instead.
- **Tauri framework behavior**: Plugin initialization, window management, IPC transport. Tauri is tested by its maintainers.
- **Implementation details**: Internal store data structures, private helper functions. Test through public APIs.
- **Autogenerated code**: TypeScript bindings from specta (`src/bindings.ts`), shadcn/ui component files in `src/components/ui/`.

### 10.4 Implementation Priority Order

For maximum risk reduction per effort invested:

1. **Remaining store tests** (P0, low effort) -- 6 untested stores
2. **Utility/library tests** (P1, low effort) -- protocol parser, agentsmd, slashCommands
3. **Core component tests** (P0, medium effort) -- ChatInput, PermissionDialog, EditorTabs, FileExplorer
4. **E2E user flow tests** (P0, medium effort) -- conversation flow, permission flow, file open/edit/save
5. **Integration tests** (P1, medium effort) -- component + store + mock IPC combinations
6. **Rust backend tests** (P1, high effort) -- file ops, git parsing, search
7. **Accessibility tests** (P1, low effort) -- axe-core scans, keyboard navigation
8. **Visual regression baselines** (P2, medium effort) -- theme screenshots
9. **Performance benchmarks** (P2, low effort) -- store operations, render timing

---

## Appendix A: Test ID Reference

| Prefix | Feature Area | Section |
|--------|-------------|---------|
| FO | File Operations | 7.1 |
| ED | Editor | 7.2 |
| TM | Terminal | 7.3 |
| CH | Chat / Claude | 7.4 |
| AG | Multi-Agent | 7.5 |
| SR | Search | 7.6 |
| ST | Settings | 7.7 |
| GI | Git Integration | 7.8 |
| CP | Command Palette | 7.9 |
| LY | Layout | 7.10 |
| EH | Error Handling | 7.11 |
| AN | Analytics | 7.12 |
| VR | Visual Regression | 7.13 |
| A11Y | Accessibility | 7.14 |
| PF | Performance | 7.15 |

## Appendix B: Summary Statistics

| Category | P0 | P1 | P2 | Total |
|----------|----|----|-----|-------|
| File Operations | 9 | 6 | 5 | 20 |
| Editor | 5 | 6 | 5 | 16 |
| Terminal | 0 | 6 | 3 | 9 |
| Chat / Claude | 21 | 9 | 7 | 37 |
| Multi-Agent | 12 | 12 | 8 | 32 |
| Search | 2 | 6 | 5 | 13 |
| Settings | 5 | 5 | 6 | 16 |
| Git Integration | 0 | 8 | 4 | 12 |
| Command Palette | 4 | 3 | 3 | 10 |
| Layout | 5 | 2 | 6 | 13 |
| Error Handling | 4 | 6 | 6 | 16 |
| Analytics | 0 | 0 | 5 | 5 |
| Visual Regression | 0 | 3 | 5 | 8 |
| Accessibility | 0 | 9 | 3 | 12 |
| Performance | 0 | 1 | 9 | 10 |
| **Total** | **67** | **82** | **80** | **229** |

Note: These 229 documented test cases expand to approximately 525 individual test assertions when accounting for parameterized tests, boundary value variants, and multiple assertions per case.
