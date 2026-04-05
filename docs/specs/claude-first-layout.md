# Claude-First Layout Design

**Status**: Draft -- awaiting review before implementation
**Date**: 2026-04-04
**Supersedes**: `ui-redesign.md` (layout sections only; menu bar, welcome tab, and responsive behavior from that spec are preserved and integrated here)
**Depends on**: `vantage-2.0-evolution.md` (virtual scrolling, prompt queuing, rich tool widgets already landed)

---

## 0. The Core Insight

The user spends 90% of their time talking to Claude, not editing code. Vantage's current layout puts the editor at center and Claude in a 25% sidebar. That is backwards.

Opcode proved the right default: full-width chat, no sidebar clutter. But Opcode has no editor, no terminal, no file explorer. It is a chat client, not an IDE.

Vantage must be both. The design introduces two switchable views sharing a single state model:

| View | Default for | Chat area | Editor area | Terminal |
|------|------------|-----------|-------------|----------|
| **Claude View** | Chatting with Claude | Full-width, centered | Auto-opens on demand | Collapsible bottom strip |
| **IDE View** | Manual coding | Right sidebar | Full-width center | Bottom panel |

The user switches with **Ctrl+1** (Claude View) and **Ctrl+2** (IDE View). A toggle button in the title bar provides mouse access. The transition is a smooth 200ms layout morph, not a page replacement.

---

## 1. Claude View (Default)

This is the primary view. It opens on launch. It is the view the user sees 90% of the time.

### 1.1 Layout Diagram

```
+--------------------------------------------------------------+
| [V] File Edit View Go Terminal Help     [*Claude* | IDE] - X |  <- TitleBar (36px)
+--+-----------------------------------------------------------+
|  |                                                            |
|  |                                                            |
|N |          +----- max-w-3xl (768px) centered ------+         |
|a |          |                                       |         |
|v |          |  [System] Session started with...     |         |
|  |          |                                       |         |
|S |          |  [You] Build me a login page          |         |
|t |          |                                       |         |
|r |          |  [Claude] I'll create the component.  |         |
|i |          |    [Edit] src/Login.tsx  [+142 -0]    |         |
|p |          |    [Bash] npm test -- --run            |         |
|  |          |                                       |         |
|  |          |  +--- File Preview (auto-opened) ---+ |         |
|  |          |  | src/Login.tsx  [Accept] [Reject]  | |         |
|  |          |  | (Monaco read-only, diff gutter)   | |         |
|  |          |  +-----------------------------------+ |         |
|  |          |                                       |         |
|  |          +---------------------------------------+         |
|  |                                                            |
|  +------------------------------------------------------------+
|  | [Terminal] [Problems] [Output]          (collapsible, 0px) |
|  +------------------------------------------------------------+
|  | +--------------------------------------------------------+ |
|  | | Chat Input (floating, full-width, auto-resize)         | |
|  | | [@] [/] [model: sonnet] [think: ##--] [effort: high]   | |
|  | +--------------------------------------------------------+ |
+--+------------------------------------------------------------+
| Claude: streaming... | main | 0E 0W | $0.12 | 3.2k tokens    |
+--------------------------------------------------------------+
```

### 1.2 Key Properties

**Chat area**: Takes 100% of the content width. Messages render inside a centered column (`max-w-3xl mx-auto`, 768px). This matches Opcode's approach and provides comfortable reading width. On very wide monitors (>2560px), the max-width could be bumped to `max-w-4xl` (896px) via a user preference.

**Navigation strip** (left, 48px): Minimal icon column. Four icons:
- Chat (MessageSquare) -- switches to Claude View (active indicator)
- Files (Files) -- switches to IDE View and opens file explorer
- Agents (Bot) -- opens agent panel as an overlay or switches to IDE View
- Settings (Settings) -- opens settings

The nav strip is NOT the full activity bar from IDE View. It has fewer items and no badges by default. It exists to provide escape hatches to other parts of the app.

**File preview**: When Claude edits a file, a read-only Monaco preview appears inline in the chat message stream. It is NOT a separate panel -- it is rendered inside the message bubble for that tool call, showing the diff with accept/reject buttons. This keeps the user's eye on the conversation flow. See section 4 for the full auto-open behavior.

**Terminal**: Collapsed to 0px by default in Claude View. When Claude runs a Bash command, the terminal auto-expands to ~150px showing the relevant output. When the command completes, the terminal stays visible for 3 seconds, then auto-collapses unless the user has interacted with it (clicked, scrolled, typed). The user can manually expand it at any time.

**Chat input**: Floating at the bottom of the content area, NOT part of the flex layout flow. It has a backdrop blur, auto-resizes from 48px (single line) to 240px (multiline), and includes the model picker, thinking mode selector, @-mention trigger, and slash command trigger -- all from the existing `ChatInput` component. In Claude View, the input is wider (full content width minus nav strip) than in IDE View (where it's confined to the chat sidebar).

**Bottom panel tabs**: Terminal, Problems, Output tabs sit in a collapsed strip above the chat input. Clicking a tab expands the panel. This is the same `PanelArea` component as IDE View, just with `collapsedSize={0}` as the default.

### 1.3 What is NOT Visible in Claude View

- File explorer tree (available via nav strip -> IDE View)
- Editor tabs / breadcrumbs (files open inline in chat)
- Search panel
- Git panel
- Full activity bar with badges

These are all accessible by switching to IDE View. The point of Claude View is focus: you are talking to Claude, and everything else gets out of the way.

---

## 2. IDE View

This is the traditional layout for when the user needs to browse code, manually edit files, or do work that does not involve Claude. It is the current Vantage layout with one change: the chat panel is promoted to a proper right sidebar rather than a squeezed afterthought.

### 2.1 Layout Diagram

```
+--------------------------------------------------------------+
| [V] File Edit View Go Terminal Help     [Claude | *IDE*] - X |
+--+-----------+-------------------------------+---------------+
|  |           | Tab: Login.tsx | App.tsx | +   |               |
|A | Explorer  | src > components > Login.tsx  |               |
|c |           +-------------------------------+    Chat       |
|t | src/      |                               |    Panel      |
|i |  compone  |    Monaco Editor              |    (360px     |
|v |    Login  |    (full editing)              |     default,  |
|i |    App.ts |                               |     resize-   |
|t |  hooks/   |                               |     able)     |
|y |  stores/  |                               |               |
|  |  lib/     +-------------------------------+               |
|B |           | Terminal | Problems | Output   |               |
|a |           |                               |               |
|r |           | $ npm run dev                 |               |
|  |           | Server running on :5173       |               |
+--+-----------+-------------------------------+---------------+
| br:main | 0E 0W | Ln 12 Col 4 | TS | $0.12 | 3.2k tokens   |
+--------------------------------------------------------------+
```

### 2.2 Key Properties

**Activity bar** (left, 48px): Full activity bar with all icons -- Explorer, Search, Git, Agents, Settings. Badges visible (git changes count, agent status, etc.).

**Primary sidebar** (left, default 240px): File explorer, search, git, agents -- same as today. Collapsible.

**Editor area** (center): Full Monaco editor with tabs, breadcrumbs, split groups. Same as today.

**Chat panel** (right, default 360px): The same ChatPanel component as Claude View, but rendered in sidebar mode. The message column does NOT have a max-width constraint -- it fills the available sidebar width. The chat input sits at the bottom of the sidebar, not floating. Collapsible via Ctrl+Shift+C.

**Bottom panel**: Terminal, Problems, Output. Spans only the editor column width (not under the chat panel). Same as the current ui-redesign.md spec.

**Key difference from current layout**: The chat panel default width is 360px (up from 300px) with a minimum of 280px. This gives Claude's messages room to breathe even in sidebar mode.

---

## 3. View Switching Mechanism

### 3.1 Toggle Button

A segmented control in the title bar:

```
  [ Claude | IDE ]
     ^        ^
  active    inactive
```

The active segment has `bg-primary/20 text-primary` styling. The inactive segment has `text-muted-foreground hover:text-foreground`. The toggle sits to the left of the window controls.

Implementation: a `<div>` with two `<button>` children, not a radio group. `role="tablist"` with `role="tab"` children for accessibility.

### 3.2 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+1 | Switch to Claude View |
| Ctrl+2 | Switch to IDE View |
| Ctrl+Shift+L | Toggle between views (cycles) |

These shortcuts are registered at the window level and work regardless of focus. They do NOT conflict with Monaco's Ctrl+1 (which requires the editor to have focus and is not bound by default in our config).

### 3.3 State Persistence

The active view is stored in the layout store:

```typescript
activeView: "claude" | "ide"
```

It persists across restarts via workspace state. A fresh workspace defaults to `"claude"`.

### 3.4 Transition Animation

When switching views, the layout morphs over 200ms using CSS transitions on the panel sizes. This is NOT a React component swap -- both views share the same component tree. The "switch" is actually a coordinated resize of all panels:

**Claude -> IDE transition** (200ms):
1. Nav strip widens into full activity bar (48px, unchanged, but badges fade in)
2. Primary sidebar expands from 0px to stored width (e.g., 240px)
3. Chat panel shrinks from 100% to stored sidebar width (e.g., 360px)
4. Editor area fades in between sidebar and chat (opacity 0 -> 1)
5. Bottom panel stays at its current height

**IDE -> Claude transition** (200ms):
1. Primary sidebar collapses to 0px
2. Editor area fades out (opacity 1 -> 0)
3. Chat panel expands to fill the content area
4. Activity bar badges fade out
5. Bottom panel optionally collapses (if user preference "auto-collapse terminal in Claude View" is on)

The transitions use `react-resizable-panels` programmatic resize via `panel.resize(percentage)` calls, combined with CSS `transition: opacity 200ms` on the editor area. This avoids the jank of re-mounting components.

### 3.5 What State Transfers Between Views

All state is shared. Switching views does NOT:
- Close editor tabs
- Kill terminal sessions
- Reset chat history
- Change the active file
- Lose scroll positions

Switching views DOES:
- Change which panels are visible and their sizes
- Change the chat input width/position
- Change the activity bar item set
- Save the previous view's panel sizes for restoration

The layout store maintains two sets of panel sizes:

```typescript
claudeViewLayout: {
  bottomPanelHeight: number;  // percentage, default 0
}
ideViewLayout: {
  primarySidebarWidth: number;   // percentage, default 15
  chatSidebarWidth: number;      // percentage, default 25
  bottomPanelHeight: number;     // percentage, default 30
}
```

---

## 4. Auto-Open Behavior (UI Follows Claude)

This is the magic that makes Claude View feel alive. The UI reacts to Claude's actions in real time.

### 4.1 File Edit -> Inline Preview

When Claude edits a file (Edit, Write, or MultiEdit tool call):

1. The tool call card in the chat stream shows the file path, change summary (+X -Y lines), and an "Open Preview" button.
2. Below the tool call card, an inline Monaco viewer renders automatically. It shows the file in read-only diff mode (left: before, right: after) at a fixed height of 300px with scrolling.
3. Two buttons appear: **Accept** (applies the change) and **Reject** (reverts it).
4. If the user is in IDE View, the file also opens in an editor tab (same as today).
5. If the user is in Claude View, the file does NOT open in a tab -- the inline preview is sufficient.

The inline preview is a lightweight component (`InlineDiffPreview`) that uses Monaco's diff editor in embedded mode. It shares the same Monaco instance pool as the main editor to avoid loading multiple Monaco runtimes.

### 4.2 File Read -> Collapsible Code Block

When Claude reads a file:

1. The tool call card shows the file path and line range.
2. A collapsible syntax-highlighted code block renders below, showing the file content. Collapsed by default if the content is >50 lines.
3. Clicking the file path opens the file in the editor (in IDE View) or scrolls to it (in Claude View, if it was previously previewed).

### 4.3 Bash Command -> Terminal Expansion

When Claude runs a Bash command:

1. In Claude View: the bottom panel auto-expands to ~150px, showing the terminal tab. The command output appears in real time. After the command completes, a 3-second timer starts. If the user does not interact with the terminal, it collapses back to 0px. If the command fails (exit code != 0), the terminal stays expanded and a red indicator appears.
2. In IDE View: the terminal behavior is unchanged (it stays at its current size).

The auto-expand/collapse is controlled by a `terminalAutoMode` flag in the layout store, default `true`. Users who find it distracting can turn it off in Settings > Editor > Terminal Auto-Collapse.

### 4.4 Search/Grep -> Results in Chat

When Claude searches with Grep or Glob:

1. Results render inline as a collapsible list of file matches with line previews.
2. Clicking a result opens the file at that line (in IDE View: editor tab; in Claude View: inline preview).

### 4.5 Auto-Open Suppression

The user can disable all auto-open behavior with a single toggle:

- Settings > Chat > "Auto-open file previews" (default: on)
- Settings > Chat > "Auto-expand terminal" (default: on)

When disabled, tool call cards show only the summary text, and the user must click to expand.

---

## 5. Component Hierarchy

### 5.1 Unified Component Tree

Both views share a single component tree. The view switch is a layout change, not a route change.

```
<App>
  <ErrorBoundary>
    <IDELayout>
      <TitleBar>
        <MenuBar />
        <DragRegion />
        <ViewToggle />              // NEW: [Claude | IDE] segmented control
        <WindowControls />
      </TitleBar>

      <div.main-content>
        <NavigationStrip              // NEW: replaces ActivityBar in Claude View
          mode={activeView}           //   "claude" -> 4 icons, no badges
        />                            //   "ide" -> full activity bar

        <Group direction="horizontal" id="main-layout">

          {/* Primary Sidebar -- collapsed in Claude View */}
          <Panel id="primary-sidebar"
            ref={primaryPanelRef}
            collapsible
            collapsedSize={0}
          >
            <PrimarySidebar />
          </Panel>
          <Separator />

          {/* Center Column */}
          <Panel id="center">
            <Group direction="vertical" id="center-vertical">

              {/* Editor -- hidden in Claude View, visible in IDE View */}
              <Panel id="editor"
                ref={editorPanelRef}
                collapsible
                collapsedSize={0}
              >
                <EditorArea />
              </Panel>
              <Separator />

              {/* Chat Content -- visible in Claude View only */}
              {/* In IDE View, this panel is collapsed to 0 */}
              <Panel id="chat-content"
                ref={chatContentPanelRef}
                collapsible
                collapsedSize={0}
              >
                <ChatContentArea />   // NEW: full-width chat for Claude View
              </Panel>
              <Separator />

              {/* Bottom Panel */}
              <Panel id="bottom-panel"
                ref={bottomPanelRef}
                collapsible
                collapsedSize={0}
              >
                <PanelArea />
              </Panel>

            </Group>
          </Panel>
          <Separator />

          {/* Right Sidebar (Chat in IDE View) -- collapsed in Claude View */}
          <Panel id="right-panel"
            ref={rightPanelRef}
            collapsible
            collapsedSize={0}
          >
            <SecondarySidebar />      // Contains ChatPanel in sidebar mode
          </Panel>

        </Group>
      </div.main-content>

      <StatusBar />
    </IDELayout>
  </ErrorBoundary>
</App>
```

### 5.2 The Critical Design: ChatPanel Reuse

The `ChatPanel` component renders in TWO locations but is only MOUNTED in one at a time:

1. **Claude View**: Mounted inside `ChatContentArea` (center column, full-width). The chat input floats at the bottom.
2. **IDE View**: Mounted inside `SecondarySidebar` (right panel, sidebar-width). The chat input is inline at the bottom of the sidebar.

The `ChatPanel` accepts a `mode` prop:

```typescript
interface ChatPanelProps {
  mode: "full" | "sidebar";
}
```

- `mode="full"`: Messages centered at `max-w-3xl`, floating input, inline file previews enabled.
- `mode="sidebar"`: Messages fill available width, inline input, file previews compact.

The conversation store state is shared -- switching views does NOT restart or reset the chat. Messages, scroll position, and input draft are preserved because the same Zustand store backs both render modes.

### 5.3 NavigationStrip (New Component)

Replaces `ActivityBar` as a polymorphic component:

```typescript
interface NavigationStripProps {
  mode: "claude" | "ide";
}
```

**Claude mode** (4 icons, no badges):
```
  [Chat]      <- active indicator (left border highlight)
  [Files]     <- click switches to IDE View + opens explorer
  [Agents]    <- click opens agent overlay OR switches to IDE View
  [Settings]  <- click opens settings overlay
```

**IDE mode** (5 icons, badges):
```
  [Explorer]  <- with file count badge when collapsed
  [Search]
  [Git]       <- with changes count badge
  [Agents]    <- with running agent count badge
  ----
  [Settings]
```

Both modes use the same 48px wide strip. The icon set changes, but the strip itself does not resize. This prevents layout shift during transitions.

### 5.4 ChatContentArea (New Component)

A wrapper around `ChatPanel` that adds Claude View-specific chrome:

```typescript
function ChatContentArea() {
  return (
    <div className="flex flex-col h-full w-full relative"
         style={{ backgroundColor: "var(--color-base)" }}>
      {/* Session header: session name, model badge, timeline toggle */}
      <ChatSessionHeader />

      {/* Message area with centered column */}
      <ChatPanel mode="full" />
    </div>
  );
}
```

### 5.5 InlineDiffPreview (New Component)

Renders inside tool call cards in the chat when Claude edits a file:

```typescript
interface InlineDiffPreviewProps {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  language: string;
  onAccept: () => void;
  onReject: () => void;
}
```

Uses Monaco's `DiffEditor` in embedded mode with:
- `renderSideBySide={false}` (inline diff, saves horizontal space)
- `readOnly={true}`
- `maxHeight={300}` with overflow scroll
- Catppuccin theme matching the app theme
- Accept/Reject buttons in a toolbar above the diff

---

## 6. State Management

### 6.1 Layout Store Additions

```typescript
// New fields added to LayoutState
interface LayoutState {
  // ... existing fields ...

  /** The active view mode */
  activeView: "claude" | "ide";

  /** Stored panel sizes for Claude View (restored when switching to Claude) */
  claudeViewLayout: {
    bottomPanelHeight: number;  // percentage, default 0 (collapsed)
  };

  /** Stored panel sizes for IDE View (restored when switching to IDE) */
  ideViewLayout: {
    primarySidebarWidth: number;   // percentage, default 15
    rightPanelWidth: number;       // percentage, default 25
    bottomPanelHeight: number;     // percentage, default 30
  };

  /** Whether the terminal auto-expands/collapses in Claude View */
  terminalAutoMode: boolean;

  /** Whether file previews auto-open inline in Claude View */
  autoOpenPreviews: boolean;

  // Actions
  setActiveView: (view: "claude" | "ide") => void;
  switchToClaudeView: () => void;
  switchToIdeView: () => void;
}
```

### 6.2 View Switch Logic

```typescript
switchToClaudeView: () => {
  const state = get();

  // Save current IDE panel sizes
  const ideLayout = {
    primarySidebarWidth: state.horizontalLayout[0] ?? 15,
    rightPanelWidth: state.horizontalLayout[2] ?? 25,
    bottomPanelHeight: state.verticalLayout[1] ?? 30,
  };

  set({
    activeView: "claude",
    ideViewLayout: ideLayout,
    // In Claude View: no primary sidebar, no right panel,
    // chat content takes center, bottom panel collapsed
    primarySidebarVisible: false,
    secondarySidebarVisible: false,
    panelVisible: state.claudeViewLayout.bottomPanelHeight > 0,
  });

  // Programmatically resize panels via refs
  // (handled in IDELayout useEffect watching activeView)
},

switchToIdeView: () => {
  const state = get();

  // Save current Claude View bottom panel height
  const claudeLayout = {
    bottomPanelHeight: state.panelVisible ? (state.verticalLayout[1] ?? 0) : 0,
  };

  set({
    activeView: "ide",
    claudeViewLayout: claudeLayout,
    primarySidebarVisible: true,
    secondarySidebarVisible: true,
    panelVisible: state.ideViewLayout.bottomPanelHeight > 0,
  });
},
```

### 6.3 Conversation Store: No Changes

The conversation store does not change. It already manages messages, session state, streaming status, etc. Both view modes read from the same store. The `ChatPanel` component subscribes to the same selectors regardless of its `mode` prop.

### 6.4 Editor Store: Minor Change

When Claude edits a file in Claude View, the editor store still tracks the file as "touched by Claude" (for the activity trail). But it does NOT auto-open a new tab. The `autoOpenEditorTab` behavior is gated:

```typescript
// In the tool call handler:
if (layoutStore.getState().activeView === "ide") {
  editorStore.getState().openFile(filePath);
} else {
  // Claude View: file preview is handled inline in the chat message
  editorStore.getState().markFileTouched(filePath);
}
```

---

## 7. Chat Input Design

### 7.1 Two Rendering Modes

The `ChatInput` component already exists. It gains a `floating` prop:

```typescript
interface ChatInputProps {
  floating?: boolean;  // true in Claude View, false in IDE View
}
```

**Floating mode** (`floating={true}`, Claude View):
- `position: absolute; bottom: 0; left: 0; right: 0`
- `margin: 0 auto; max-width: 768px` (matches message column width)
- `backdrop-filter: blur(12px)`
- `background: var(--color-base)/80`
- `border-radius: 12px` (top corners only)
- `box-shadow: 0 -4px 20px rgba(0,0,0,0.15)`
- The message list has `padding-bottom: 80px` to prevent messages from being hidden behind the input.

**Inline mode** (`floating={false}`, IDE View):
- Normal flex child at the bottom of the chat sidebar
- `background: var(--color-surface-0)`
- `border-top: 1px solid var(--color-surface-1)`
- Same controls, but more compact (icons only, no labels)

### 7.2 Input Features (Both Modes)

All existing features work in both modes:
- @-mentions (@file, @selection, @terminal, @git, @folder)
- Slash commands (/compact, /btw, etc.)
- Image paste / drag-and-drop
- Model picker (Sonnet/Opus)
- Thinking mode selector (5 levels)
- Effort level selector
- Plan mode toggle
- Auto-resize
- Expand to full-screen editor overlay

### 7.3 Prompt Queue Display

In Claude View, the prompt queue renders as a floating panel above the input (same as Opcode's pattern). In IDE View, it renders above the chat input inside the sidebar.

---

## 8. Keyboard Shortcuts

### 8.1 New Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| Ctrl+1 | Switch to Claude View | Global |
| Ctrl+2 | Switch to IDE View | Global |
| Ctrl+Shift+L | Toggle between Claude/IDE | Global |
| Ctrl+Enter | Send message (in chat input) | Chat input focused |
| Escape | Collapse file preview / terminal | Claude View |

### 8.2 Existing Shortcuts (Unchanged)

| Shortcut | Action | View |
|----------|--------|------|
| Ctrl+Shift+P | Command palette | Both |
| Ctrl+P | Quick open file | Both (opens in editor tab) |
| Ctrl+` | Toggle terminal | Both |
| Ctrl+Shift+C | Toggle chat panel | IDE View only |
| Ctrl+Shift+E | Toggle file explorer | IDE View only |
| Ctrl+Shift+Z | Zen mode | Both |
| Ctrl+Shift+Q | Quick question overlay | Both |

### 8.3 Conflict Resolution

- Ctrl+1/2: In Monaco, Ctrl+1 focuses editor group 1. Since Vantage does not use numbered editor groups (we have split right/down instead), these shortcuts are free. If a user has Monaco focus and presses Ctrl+1, the view switch takes precedence because the handler is registered at the window level with `capture: true`.
- Ctrl+Shift+L: In Monaco, this selects all occurrences of the current selection. However, we use Ctrl+D for that (VS Code default). Ctrl+Shift+L is available.

---

## 9. Responsive Behavior

### 9.1 Claude View Breakpoints

| Width | Behavior |
|-------|----------|
| >= 1400px | Full layout. Message column at max-w-3xl (768px). Nav strip visible. |
| 1000-1399px | Same, but message column may narrow slightly. |
| 800-999px | Nav strip collapses to icon-only (already is). Message column fills width with 16px padding. |
| < 800px | Nav strip hides. Chat is truly full-screen. A floating hamburger button provides access to nav. |

### 9.2 IDE View Breakpoints

Same as the existing `ui-redesign.md` spec (section 8).

### 9.3 Auto-Switching

On very narrow windows (<1000px), the view toggle disappears and the app locks into Claude View. Rationale: a traditional IDE layout with three columns is unusable below 1000px. Claude View's single-column layout scales down gracefully.

---

## 10. Transition Animations

### 10.1 View Switch (200ms)

The transition between views is a coordinated panel resize, not a component swap. This is achieved by:

1. Setting target panel sizes in the layout store.
2. Using `react-resizable-panels` programmatic resize API (`panel.resize(targetPercentage)`) on each panel.
3. Adding `transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1)` to the panel containers during the transition, then removing it after completion.

The CSS transition is applied via a `transitioning` class on the main layout container:

```css
.main-layout.transitioning [data-panel] {
  transition: flex-basis 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

The class is added when the view switch starts and removed 200ms later via `setTimeout`.

### 10.2 Terminal Auto-Expand (150ms)

When the terminal auto-expands in Claude View:
- Height transitions from 0 to 150px over 150ms
- Uses `ease-out` curve (fast start, gentle stop)

When it auto-collapses:
- 3-second delay (during which a subtle "collapsing in 3s" indicator shows)
- Height transitions from current to 0 over 150ms
- Uses `ease-in` curve (gentle start, fast finish)

### 10.3 File Preview Expand (150ms)

Inline diff previews expand from 0 to 300px height:
- `max-height` transition from 0 to 300px over 150ms
- `opacity` transition from 0 to 1 over 100ms (starts 50ms after height)
- Combined effect: the preview "grows in" smoothly

---

## 11. The "Auto" Mode

Beyond the manual Claude/IDE toggle, the UI can react automatically to Claude's actions. This is controlled by a global preference:

**Settings > Chat > Reactive UI** (default: on)

When enabled:

| Claude action | UI reaction |
|---------------|-------------|
| Edits a file | Inline diff preview appears in chat (Claude View) or file opens in tab (IDE View) |
| Reads a file | Collapsible code block in chat |
| Runs a Bash command | Terminal expands in Claude View |
| Creates a file | Inline preview with full content |
| Searches (Grep/Glob) | Results list in chat |
| Starts a subagent | Agent status indicator appears in nav strip |
| Session ends | Summary card with "all files changed" link |

When disabled: Tool call cards show only the text summary. The user clicks to expand individual previews.

### 11.1 Auto Mode Does NOT Switch Views

Critically, auto mode never switches the user from IDE View to Claude View or vice versa. If the user is in IDE View and Claude edits a file, the file opens in an editor tab -- it does not pull the user into Claude View. The auto behavior adapts to the current view, not the other way around.

### 11.2 Focus Protection

Auto-expanding UI elements never steal keyboard focus. If the user is typing in the chat input, a terminal auto-expand does not move focus to the terminal. If the user is editing in Monaco, an inline preview appearing in the chat does not move focus to the chat.

---

## 12. Implementation Plan

### Phase 1: Layout Store + View Toggle (1 day)

**Goal**: Add the `activeView` state and toggle UI. No layout changes yet.

**Changes**:
1. Add `activeView`, `claudeViewLayout`, `ideViewLayout`, `terminalAutoMode`, `autoOpenPreviews` to `src/stores/layout.ts`.
2. Add `switchToClaudeView()`, `switchToIdeView()`, `setActiveView()` actions.
3. Create `src/components/layout/ViewToggle.tsx` -- segmented control component.
4. Add `ViewToggle` to `TitleBar.tsx`.
5. Register Ctrl+1, Ctrl+2, Ctrl+Shift+L shortcuts in `IDELayout.tsx`.

**Testing**: Toggle button renders, keyboard shortcuts work, store state changes. No visual layout change yet.

### Phase 2: NavigationStrip (0.5 days)

**Goal**: Replace `ActivityBar` with a polymorphic `NavigationStrip`.

**Changes**:
1. Create `src/components/layout/NavigationStrip.tsx` that accepts `mode: "claude" | "ide"`.
2. In Claude mode: show Chat, Files, Agents, Settings icons.
3. In IDE mode: show Explorer, Search, Git, Agents, Settings icons (same as current `ActivityBar`).
4. Update `IDELayout.tsx` to use `NavigationStrip` instead of `ActivityBar`.

**Testing**: Both icon sets render correctly. Clicking icons triggers appropriate actions.

### Phase 3: ChatContentArea + ChatPanel Modes (2 days)

**Goal**: Create the full-width chat rendering mode.

**Changes**:
1. Create `src/components/chat/ChatContentArea.tsx` -- wrapper with session header.
2. Add `mode: "full" | "sidebar"` prop to `ChatPanel`.
3. In `mode="full"`: center messages at `max-w-3xl`, use floating input, enable inline previews.
4. In `mode="sidebar"`: current behavior (fill width, inline input).
5. Add `ChatContentArea` as a new panel in the center column of `IDELayout.tsx`.

**Testing**: ChatPanel renders in both modes. Messages display correctly. Input works in both positions.

### Phase 4: View Switch Wiring (1 day)

**Goal**: Make the toggle actually switch the layout.

**Changes**:
1. In `IDELayout.tsx`, add a `useEffect` that watches `activeView` and programmatically resizes panels:
   - Claude View: collapse primary sidebar, collapse right panel, expand chat-content panel, collapse editor panel.
   - IDE View: expand primary sidebar, expand right panel, collapse chat-content panel, expand editor panel.
2. Add the `transitioning` CSS class for smooth animation.
3. Save/restore panel sizes per view.

**Testing**: Switching views animates smoothly. Panel sizes persist. No component unmounting (verify with React DevTools).

### Phase 5: InlineDiffPreview (1.5 days)

**Goal**: Show file diffs inline in chat messages during Claude View.

**Changes**:
1. Create `src/components/chat/InlineDiffPreview.tsx` using Monaco's diff editor in embedded mode.
2. Modify `ToolCallCard.tsx` to render `InlineDiffPreview` for Edit/Write/MultiEdit tool calls when in Claude View.
3. Add Accept/Reject buttons with handlers that call the existing diff accept/reject logic.
4. Add collapsible code blocks for Read tool calls.

**Testing**: Edit tool calls show inline diffs. Accept/Reject work. Read tool calls show syntax-highlighted code.

### Phase 6: Terminal Auto-Expand (0.5 days)

**Goal**: Terminal auto-expands on Bash commands in Claude View.

**Changes**:
1. In `IDELayout.tsx`, subscribe to conversation store tool call events.
2. When a Bash tool call starts AND `activeView === "claude"` AND `terminalAutoMode === true`: expand bottom panel to 150px.
3. When the Bash command completes: start a 3-second timer, then collapse if no user interaction.
4. Track user interaction via mouse/keyboard events on the terminal panel.

**Testing**: Terminal expands on Bash. Collapses after 3s. Stays open if user interacts. Respects the preference toggle.

### Phase 7: Polish + Responsive (1 day)

**Goal**: Responsive behavior, edge cases, accessibility.

**Changes**:
1. Add responsive breakpoint handling for Claude View.
2. Add ARIA labels and roles to ViewToggle, NavigationStrip.
3. Test narrow windows (800px, 1024px, 1280px, 1920px, 3840px).
4. Test with screen reader (NVDA on Windows).
5. Add the view toggle to the command palette.
6. Update the welcome screen to default to Claude View.

**Testing**: Full responsive suite. Accessibility audit. Command palette integration.

**Total estimate**: ~7.5 days for the full implementation.

---

## 13. Migration from Current Layout

### 13.1 Workspace State Migration

Existing workspaces have no `activeView` field. On first load:

```typescript
// In layout store initialization:
if (!state.activeView) {
  state.activeView = "claude";  // New default
  state.claudeViewLayout = { bottomPanelHeight: 0 };
  state.ideViewLayout = {
    primarySidebarWidth: state.horizontalLayout[0] ?? 15,
    rightPanelWidth: state.horizontalLayout[2] ?? 25,
    bottomPanelHeight: state.verticalLayout[1] ?? 30,
  };
}
```

This preserves the user's existing panel sizes as the IDE View defaults, and introduces Claude View as the new default.

### 13.2 Feature Flag

The Claude-first layout is behind a feature flag during development:

```typescript
// src/lib/featureFlags.ts
export const CLAUDE_FIRST_LAYOUT = true; // flip to false to revert
```

When `false`, the current layout renders as-is. When `true`, the new dual-view layout activates. This allows safe incremental development on `master`.

### 13.3 Backward Compatibility

All existing keyboard shortcuts continue to work. The command palette still works. The file explorer, search, git, agents, settings -- all still accessible. The only change the user sees on first launch is that chat is now the default center content instead of the editor. Everything else is one click or keystroke away.

---

## 14. Files That Need to Change

### New Files

| File | Purpose |
|------|---------|
| `src/components/layout/ViewToggle.tsx` | [Claude \| IDE] segmented control |
| `src/components/layout/NavigationStrip.tsx` | Polymorphic activity bar (replaces ActivityBar) |
| `src/components/chat/ChatContentArea.tsx` | Full-width chat wrapper for Claude View |
| `src/components/chat/InlineDiffPreview.tsx` | Monaco diff editor embedded in chat messages |
| `src/lib/featureFlags.ts` | Feature flag for gradual rollout |

### Modified Files

| File | Changes |
|------|---------|
| `src/stores/layout.ts` | Add `activeView`, view-specific layouts, `terminalAutoMode`, `autoOpenPreviews`, switch actions |
| `src/components/layout/IDELayout.tsx` | Add chat-content panel to center column, view switch effects, transition animation, terminal auto-expand subscription |
| `src/components/layout/TitleBar.tsx` | Add `ViewToggle` component between drag region and window controls |
| `src/components/chat/ChatPanel.tsx` | Add `mode` prop (`"full"` / `"sidebar"`), conditional centered layout, conditional floating input |
| `src/components/chat/ChatInput.tsx` | Add `floating` prop, conditional absolute positioning and blur backdrop |
| `src/components/chat/ToolCallCard.tsx` | Render `InlineDiffPreview` for edit tools when in Claude View |
| `src/components/layout/StatusBar.tsx` | No structural change, but add Claude streaming indicator prominence in Claude View |

### Preserved Files (No Changes)

| File | Why |
|------|-----|
| `src/components/layout/PrimarySidebar.tsx` | Same component, just collapsed in Claude View |
| `src/components/layout/SecondarySidebar.tsx` | Same component, just collapsed in Claude View |
| `src/components/layout/PanelArea.tsx` | Same component, auto-expand logic is external |
| `src/components/editor/EditorArea.tsx` | Same component, collapsed in Claude View |
| `src/stores/conversation.ts` | Unchanged -- both views share the same state |
| `src/stores/editor.ts` | Minor: gate `autoOpenEditorTab` on view mode |

### Deleted Files

| File | Reason |
|------|--------|
| `src/components/layout/ActivityBar.tsx` | Replaced by `NavigationStrip.tsx` |

---

## 15. Risks and Mitigations

### 15.1 Monaco Memory with Inline Previews

Rendering Monaco diff editors inline in chat messages could create many editor instances, consuming memory.

**Mitigation**: Use a pool of at most 3 inline Monaco instances. Only the most recent 3 file previews have live editors; older ones degrade to static syntax-highlighted code blocks (using the existing CodeBlock component). When a preview scrolls out of the viewport (via virtual scrolling), its Monaco instance is released back to the pool.

### 15.2 Panel Resize Animation Jank

`react-resizable-panels` may not support smooth CSS transitions natively.

**Mitigation**: During the 200ms transition, temporarily set `pointer-events: none` on the layout to prevent resize handle interaction. Use `requestAnimationFrame` to step through intermediate sizes if CSS transitions don't work with the flex-basis values. Fallback: instant snap with a 100ms opacity fade on content areas.

### 15.3 Chat State During View Switch

If the user is mid-message (typing in the input) and switches views, the draft must not be lost.

**Mitigation**: The chat input draft is stored in the conversation store (already the case), not in component local state. When ChatPanel unmounts in one location and mounts in another, it reads the draft from the store. Verify with a test: type text, switch view, verify text is preserved.

### 15.4 Ctrl+1/Ctrl+2 Conflicts

Some users may have muscle memory for Ctrl+1 = first browser tab.

**Mitigation**: These shortcuts are only active inside the Vantage window (not browser). They match the convention of "Ctrl+number = switch to workspace/view" used by VS Code (Ctrl+1 = focus editor group 1) and terminals (Ctrl+1 = tab 1). The keybindings editor allows rebinding.

### 15.5 Dual ChatPanel Mounting

If both `ChatContentArea` and `SecondarySidebar` try to mount `ChatPanel` simultaneously during a transition, there could be duplicate message rendering or event listener conflicts.

**Mitigation**: Only one `ChatPanel` instance is mounted at a time. The transition logic is:
1. Before expanding the new location: mount the ChatPanel there.
2. After collapsing the old location: unmount the ChatPanel from the old location.
3. During the 200ms transition, both containers exist but only one has ChatPanel mounted.

Implementation: a `chatPanelLocation: "center" | "sidebar"` field in the layout store, updated at the START of the transition. ChatContentArea renders ChatPanel only when `chatPanelLocation === "center"`. SecondarySidebar renders ChatPanel only when `chatPanelLocation === "sidebar"`.

---

## 16. Success Criteria

After implementation, the following must be true:

1. **Claude View is the default.** New workspaces open in Claude View with chat taking full width.
2. **View switching is instant.** Ctrl+1 and Ctrl+2 switch views in <200ms with no visible jank.
3. **No state loss on switch.** Chat messages, editor tabs, terminal sessions, input drafts all persist across view switches.
4. **Inline previews work.** File edits by Claude show inline diffs with accept/reject in Claude View.
5. **Terminal auto-expands.** Bash commands trigger terminal expansion in Claude View, with auto-collapse after completion.
6. **The chat input feels native.** Floating input in Claude View with blur backdrop. Inline input in IDE View. Both support all features (@-mentions, slash commands, images, model picker).
7. **Keyboard shortcuts work.** Ctrl+1, Ctrl+2, Ctrl+Shift+L all function correctly without conflicts.
8. **IDE View is unchanged.** Users who prefer the traditional layout can Ctrl+2 and never see Claude View.
9. **Responsive at 1024px.** Claude View works at 1024x768. IDE View requires 1280px+.
10. **Zero test regressions.** All 362 frontend tests pass. All 76 Rust tests pass.
11. **Feature-flagged.** Can be disabled by flipping `CLAUDE_FIRST_LAYOUT` to `false`.

---

## 17. Future Directions (Out of Scope for v1)

These are NOT part of this spec but are enabled by the dual-view architecture:

1. **Split View**: Claude View + IDE View side by side on ultrawide monitors. Left half is chat, right half is editor. Not a separate "mode" -- just window management.

2. **Focus Mode**: A third view where only the chat input is visible (no message history, no panels). For quick one-shot questions. Triggered by Ctrl+3 or `/btw`.

3. **Auto-View Switching**: When Claude starts a long multi-file edit, auto-switch to IDE View so the user can watch files change. When the edit completes, auto-switch back to Claude View. Gated behind a preference.

4. **Custom View Layouts**: Let users define their own panel arrangements and save them as named layouts. "My Review Layout" = chat left 40%, editor right 60%, terminal bottom 20%.

5. **Detachable Panels**: Pop chat or terminal into a separate window. Requires Tauri multi-window support.

---

*This design prioritizes the insight that Claude Code users are primarily chatters, not editors. The editor is a tool that supports the conversation, not the other way around. Build Claude View first, make it excellent, and the IDE View is already done -- it is the existing Vantage layout with better proportions.*
