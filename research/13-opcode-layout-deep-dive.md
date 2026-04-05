# Opcode Layout Deep Dive: UI Architecture Analysis

**Date:** 2026-04-04
**Purpose:** Exhaustive analysis of Opcode's UI layout, component structure, and UX patterns to inform Vantage's Claude-first layout redesign.

---

## 1. Overall Architecture

### 1.1 Tech Stack
- **Frontend:** React 18 + TypeScript + Vite 6
- **Styling:** Tailwind CSS v4 + shadcn/ui (Radix primitives)
- **Animation:** Framer Motion (used everywhere -- page transitions, tab reordering, message entry/exit, button micro-interactions)
- **State:** React Context (TabContext, ThemeContext) + Zustand (agentStore, sessionStore)
- **Virtualization:** @tanstack/react-virtual (for message lists)
- **Backend:** Tauri v2 (Rust) with SQLite
- **Analytics:** PostHog
- **Icons:** lucide-react throughout

### 1.2 Provider Hierarchy
```
React.StrictMode
  PostHogProvider
    ErrorBoundary
      AnalyticsErrorBoundary
        App
          ThemeProvider          -- theme state (dark/gray/light/white/custom)
            OutputCacheProvider  -- caches expensive renders
              TabProvider        -- all tab state
                AppContent       -- actual app layout
                StartupIntro     -- boot animation overlay
```

### 1.3 Key Insight: No Sidebar, No Panels
Opcode has **zero sidebars**. There is no activity bar, no file explorer, no source control panel, no search panel. The entire app is organized around **browser-style tabs** with a custom titlebar. This is a fundamentally different philosophy from VS Code clones.

---

## 2. Layout Structure

### 2.1 Top-Level Layout (App.tsx)
```
+--------------------------------------------------+
| CustomTitlebar (h-11, macOS traffic lights + icons)|
+--------------------------------------------------+
| TabManager (h-8, horizontal scrolling tabs)       |
+--------------------------------------------------+
|                                                    |
|              TabContent (flex-1)                   |
|      (renders active tab's component)              |
|                                                    |
+--------------------------------------------------+
```

The entire layout is a **vertical flex column** with three layers:
1. **Custom titlebar** (44px) -- draggable, macOS-style traffic lights left, action icons right
2. **Tab bar** (32px) -- horizontal scrolling, reorderable via drag
3. **Content area** (remaining space) -- renders the active tab's component

There is **no sidebar, no bottom panel, no status bar**. Content takes 100% of the horizontal space.

### 2.2 View Router
The `App.tsx` has a `View` type with 14 possible views, but defaults to `"tabs"` which is the tab-based interface. Legacy views (welcome, projects, editor, etc.) are still in the code but the tab system superseded them. The tab system renders all content through `TabContent`.

### 2.3 Custom Titlebar (CustomTitlebar.tsx)
- **Height:** `h-11` (44px)
- **Left:** macOS traffic light buttons (close/minimize/maximize) -- 12px circles with colored backgrounds
- **Center:** Empty (title is commented out)
- **Right:** Icon buttons in two groups separated by a vertical divider:
  - Primary: Agents (Bot), Usage Dashboard (BarChart3)
  - Secondary: Settings (Settings), More dropdown (MoreVertical)
  - The "More" dropdown contains: CLAUDE.md, MCP Servers, About
- **Drag region:** Uses `data-tauri-drag-region` and `tauri-drag`/`tauri-no-drag` CSS classes
- **Styling:** `bg-background/95 backdrop-blur-sm`, `border-b border-border/50`
- **Tooltips:** Uses custom `TooltipSimple` from tooltip-modern
- **Animation:** `motion.button` with `whileTap={{ scale: 0.97 }}` on all buttons

**Key pattern: Navigation lives in the titlebar, not in a sidebar.** The titlebar doubles as the app's global navigation.

---

## 3. Tab System

### 3.1 Tab Types (12 types)
```typescript
type TabType = 'chat' | 'agent' | 'agents' | 'projects' | 'usage' |
               'mcp' | 'settings' | 'claude-md' | 'claude-file' |
               'agent-execution' | 'create-agent' | 'import-agent';
```

### 3.2 Tab Data Model (TabContext.tsx)
```typescript
interface Tab {
  id: string;
  type: TabType;
  title: string;
  sessionId?: string;         // for chat tabs
  sessionData?: any;          // full session object
  agentRunId?: string;        // for agent tabs
  agentData?: any;            // for agent-execution
  claudeFileId?: string;      // for claude-file tabs
  initialProjectPath?: string;
  projectPath?: string;
  status: 'active' | 'idle' | 'running' | 'complete' | 'error';
  hasUnsavedChanges: boolean;
  order: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.3 Tab Singleton Pattern
Several tab types are singletons -- if you try to create one that already exists, it switches to the existing tab instead:
- `agents`, `usage`, `mcp`, `settings`, `claude-md` -- all singletons
- `chat`, `projects`, `agent` -- can have multiples

### 3.4 Tab Bar UI (TabManager.tsx)
- **Height:** 32px (`h-8`)
- **Reordering:** Uses Framer Motion's `Reorder.Group` / `Reorder.Item` for drag-and-drop
- **Each tab:** 120-220px wide, shows icon + title + status indicator + close button
- **Active tab:** `bg-card text-card-foreground` with a 2px primary-colored bottom border (via `before:bg-primary`)
- **Inactive tab:** `bg-transparent text-muted-foreground hover:bg-muted/40`
- **Close button:** Visible only on hover or when active
- **Status indicators:** Spinner for running, red circle for error, small dot for unsaved changes
- **Overflow:** Horizontal scroll with fade gradients and scroll arrow buttons
- **New tab button:** `+` icon right after the last tab

### 3.5 Keyboard Shortcuts
```
Ctrl+T          -- New project tab
Ctrl+W          -- Close current tab
Ctrl+Tab        -- Next tab
Ctrl+Shift+Tab  -- Previous tab
Ctrl+1 thru 9   -- Switch to tab by index
```

### 3.6 Tab Persistence
- Tabs are saved to localStorage with 500ms debounce
- Restored on app restart including session data for chat tabs
- `beforeunload` handler saves immediately

### 3.7 Tab Content Rendering (TabContent.tsx)
- Each tab type maps to a lazily-loaded component
- Active tab is visible, inactive tabs get `hidden` class (kept in DOM for state preservation)
- Entry animation: `opacity: 0, y: 8` -> `opacity: 1, y: 0` (150ms)
- Uses React `Suspense` with a spinner fallback for lazy-loaded components
- Empty state: "No projects open" with a "New Project" button

### 3.8 Tab-Content Communication
Heavy use of `CustomEvent` dispatched on `window`:
- `create-chat-tab`, `close-current-tab`, `switch-to-next-tab`
- `open-session-in-tab`, `open-claude-file`, `open-agent-execution`
- `claude-session-selected`, `close-tab`, `switch-to-tab`

This event-bus pattern allows cross-component communication without prop drilling.

---

## 4. Chat/Conversation View (ClaudeCodeSession.tsx)

### 4.1 Layout Structure
This is the core component. Its layout:

```
+--------------------------------------------------+
|  (No header bar -- removed in current version)    |
+--------------------------------------------------+
|                                                    |
|         Virtual Scrolling Message List              |
|         (max-w-6xl mx-auto px-4 pt-8)             |
|                                                    |
|         Messages rendered via StreamMessage         |
|         Virtualized with @tanstack/react-virtual    |
|                                                    |
|         Loading spinner (rotating-symbol)           |
|                                                    |
+--------------------------------------------------+
|  [Queued Prompts -- floating above input]          |
+--------------------------------------------------+
|  [FloatingPromptInput -- fixed at bottom]          |
+--------------------------------------------------+
|  [Scroll arrows -- fixed bottom-right]             |
+--------------------------------------------------+
|  [Timeline sidebar -- optional, right side, w-96]  |
+--------------------------------------------------+
```

### 4.2 Message Area
- **Container:** `flex-1 overflow-y-auto relative pb-20` with `contain: 'strict'`
- **Inner wrapper:** `max-w-6xl mx-auto px-4 pt-8 pb-4` -- centered, max 72rem wide
- **Virtualization:** `useVirtualizer` with 150px estimated row size, 5 overscan
- **Each message:** Absolutely positioned, measured dynamically via `measureElement`
- **Auto-scroll:** Scrolls to bottom on new messages using both virtualizer.scrollToIndex and raw scrollTo
- **Empty state:** Terminal icon + "Ready to start coding" + "Enter a prompt below"

### 4.3 Message Rendering (StreamMessage.tsx)
Messages are rendered based on type:

**Assistant messages:**
- Wrapped in `Card` with `border-primary/20 bg-primary/5`
- Bot icon (h-5 w-5) + content in a flex row
- Text content rendered as Markdown (react-markdown + remark-gfm + syntax highlighting)
- Tool uses rendered as specialized widgets (see 4.4)
- Token usage shown at bottom: "Tokens: X in, Y out"

**User messages:**
- Wrapped in `Card` with `border-muted-foreground/20 bg-muted/20`
- User icon + content
- Command messages parsed from XML tags (`<command-name>`, `<command-message>`)
- Tool results matched back to tool calls by `tool_use_id`

**Result messages:**
- Green card for success, red for error
- Shows cost, duration, turns, token counts

**System messages:**
- `SystemInitializedWidget` for init (shows session ID, model, cwd, tools)

### 4.4 Tool Widgets (ToolWidgets.tsx -- ~32,000 tokens, massive file)
Every Claude Code tool has a dedicated widget:
- **BashWidget** -- collapsible terminal-style output with command display
- **ReadWidget** -- file icon + path, collapsible file content with syntax highlighting
- **ReadResultWidget** -- numbered lines display
- **WriteWidget** -- file creation display with content preview
- **EditWidget** -- shows file path, old/new strings with diff view (uses `diff` library)
- **MultiEditWidget** -- multiple edits in one file
- **GlobWidget** -- search pattern + matched files list
- **GrepWidget** -- pattern + results
- **LSWidget/LSResultWidget** -- directory tree display
- **TodoWidget** -- styled todo list with status icons and priority badges
- **TaskWidget** -- sub-agent task display
- **MCPWidget** -- MCP tool calls
- **ThinkingWidget** -- collapsible thinking block
- **WebSearchWidget/WebFetchWidget** -- web operation displays
- **CommandWidget/CommandOutputWidget** -- slash command displays
- **SummaryWidget** -- compact summary
- **SystemReminderWidget** -- system reminder display
- **EditResultWidget/MultiEditResultWidget** -- shows results after edits

Each widget is collapsible, has appropriate icons, and shows both the tool input and result inline.

### 4.5 Floating Prompt Input (FloatingPromptInput.tsx -- ~13,000 tokens)
This is a major component. Key features:

**Layout:**
- Fixed at the bottom of the screen (not part of flex flow)
- Backdrop blur, rounded corners, shadow
- Auto-resizes from 48px to 240px based on content

**Features:**
- **Model picker:** Sonnet vs Opus selection with popover
- **Thinking mode selector:** 5 levels (Auto, Think, Think Hard, Think Harder, Ultrathink) with visual bar indicators
- **@ mentions:** Typing `@` triggers a file picker popup (searches project files)
- **Slash commands:** Typing `/` triggers a slash command picker
- **Image paste/drag:** Supports image drag-and-drop and clipboard paste, shows image previews
- **Expand mode:** Toggle to full-screen editor overlay
- **Cancel button:** Shows stop button during streaming
- **Send button:** Arrow icon, disabled when empty or loading

**Thinking Mode Visual:**
```
Level 0: Auto    [    ] (all bars gray)
Level 1: Think   [#   ] (1 bar lit)
Level 2: Think+  [##  ] (2 bars lit)
Level 3: Think++ [### ] (3 bars lit)
Level 4: Ultra   [####] (all bars lit)
```

### 4.6 Prompt Queue
When Claude is already processing, new prompts are queued:
- Floating panel above the prompt input
- Shows queued prompts with model badge and remove button
- Collapsible
- Auto-processes next prompt when current completes

### 4.7 Timeline/Checkpoints (right sidebar)
- Triggered by GitBranch button in session header
- Takes up `sm:mr-96` (384px) from the right side of the content area
- Shows checkpoint history with create/restore/fork/diff actions
- Not a separate panel -- it pushes the content area left via margin

### 4.8 Split Preview
- When a URL is detected in terminal output, offers to open a split preview
- Uses custom `SplitPane` component (drag-resizable divider)
- Left: message list, Right: WebviewPreview (iframe-based browser)
- Can be maximized to full screen

---

## 5. Session Management

### 5.1 Project List (ProjectList.tsx)
- Simple list/card view of projects from `~/.claude/projects/`
- Each project shows name + truncated path
- Pagination (5 per page, expandable to 10)
- "Open Project" button triggers native folder picker dialog

### 5.2 Session List (SessionList.tsx)
- Grid layout: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Each session card shows: date, first message preview (120 chars), session ID suffix, todo badge
- Pagination: 12 per page
- Click navigates to ClaudeCodeSession with session data
- Includes `ClaudeMemoriesDropdown` for CLAUDE.md files

### 5.3 Session Navigation Flow
```
Projects Tab -> Project List -> Click Project -> Session List -> Click Session -> Chat Tab
                                                                -> "New Session" -> Chat Tab (no session)
```

When navigating from projects to a session, the **same tab transforms** -- the projects tab's type changes to `'chat'` via `updateTab`. This avoids tab proliferation.

### 5.4 Session Resume
- Sessions can be resumed by passing a `Session` object
- The component loads history from JSONL via `api.loadSessionHistory`
- Reconnects to active sessions by checking `api.listRunningClaudeSessions`
- Sets up Tauri event listeners for live streaming

---

## 6. Agent System

### 6.1 Agent Definition Format
Agents are stored in SQLite and exported as `.opcode.json`:
```json
{
  "version": 1,
  "exported_at": "ISO timestamp",
  "agent": {
    "name": "Git Commit Bot",
    "icon": "bot",
    "model": "sonnet",
    "system_prompt": "...",
    "default_task": "Push all changes."
  }
}
```

### 6.2 Agent UI (Agents.tsx, CCAgents.tsx)
Two versions exist:
- **Agents.tsx** (tab-based) -- used in the tab system, has tabs for "My Agents" and "Running"
- **CCAgents.tsx** (standalone) -- older full-page version with back button, used from welcome screen

Agent grid: cards with icon, name, model badge, run/edit/delete actions.

### 6.3 Agent Execution
- Agents run in the same `ClaudeCodeSession` but with a custom system prompt
- Agent execution opens in a dedicated tab (type: `agent-execution`)
- `ExecutionControlBar` -- floating pill at bottom during execution showing time, tokens, stop button
- Background execution supported -- agents run in separate processes

### 6.4 Agent Import/Export
- Import from file (native dialog)
- Import from GitHub (GitHubAgentBrowser component)
- Export to `.opcode.json` file

---

## 7. Settings and Configuration

### 7.1 Settings Panel (Settings.tsx)
Renders as a full tab, organized with inner tabs:
- **General:** Claude binary path, version selector, theme picker
- **Permissions:** Allow/deny rules for Claude settings
- **Environment:** Environment variables
- **Hooks:** HooksEditor (CRUD for Claude Code hooks)
- **Slash Commands:** SlashCommandsManager
- **Proxy:** ProxySettings
- **Storage:** StorageTab (data management)

### 7.2 Theme System (ThemeContext.tsx)
- **4 built-in themes:** dark, gray (default), light, white
- **1 custom theme:** user-defined via color pickers
- All colors defined as OKLCH values in CSS custom properties
- Theme classes: `.theme-dark`, `.theme-gray`, `.theme-light`, `.theme-white`, `.theme-custom`
- Custom theme applies CSS variables dynamically via JavaScript

### 7.3 Color Palette (styles.css)
All themes use OKLCH color space with a blue-gray hue angle (240):
```css
--color-background: oklch(0.18 0.01 240);  /* gray theme */
--color-foreground: oklch(0.95 0.01 240);
--color-card: oklch(0.23 0.01 240);
--color-primary: oklch(0.95 0.01 240);
--color-border: oklch(0.32 0.01 240);
```

The "gray" default theme is warmer/lighter than a pure dark theme -- more like VS Code's default dark but slightly raised.

---

## 8. Animation and Micro-Interaction Patterns

### 8.1 Framer Motion Usage
Opcode uses Framer Motion extensively:

**Page transitions:**
```typescript
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.15 }}
```

**Button interactions:**
```typescript
<motion.button whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
```

**List stagger:**
```typescript
transition={{ duration: 0.3, delay: index * 0.05 }}
```

**Tab reorder:** Uses `Reorder.Group` / `Reorder.Item` with 100ms transitions.

### 8.2 Custom Animations (shimmer.css)
- **Rotating symbol:** `::before` pseudo-element cycles through `◐◓◑◒` characters -- used as loading indicator
- **Shimmer hover:** Diagonal light sweep on card hover
- **Shimmer text:** Gradient text sweep for brand text
- **Brand text:** Layered solid + shimmer overlay for flicker-free brand animation

### 8.3 Consistent Timing
- `0.15` duration for most transitions (150ms)
- `0.3` for page-level animations
- `0.1` for tab reorder
- Spring physics for execution control bar entrance

### 8.4 AnimatePresence Pattern
Used everywhere for enter/exit animations. Mode is typically `"wait"` for page transitions and `"popLayout"` for lists.

---

## 9. CSS and Styling Approach

### 9.1 Global Styles (styles.css -- ~400 lines)
- Tailwind v4 with `@theme` directive for design tokens
- **All focus styles removed globally** -- no outlines, no rings (controversial accessibility choice)
- macOS-specific: subtle inner box-shadow for window border
- Custom scrollbar classes: `scrollbar-hide`, `scrollbar-thin`
- Typography utility classes: `.text-display-1` through `.text-caption`
- Tauri drag region helpers: `.tauri-drag`, `.tauri-no-drag`
- Transparent window support for rounded corners

### 9.2 Key Design Tokens
```css
--radius-sm: 0.25rem;
--radius-base: 0.375rem;
--radius-md: 0.5rem;
--radius-lg: 0.75rem;
--radius-xl: 1rem;
--font-sans: "Inter", system-font-stack;
--font-mono: ui-monospace, SFMono-Regular, etc;
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### 9.3 UI Component Library
Standard shadcn/ui components: Button, Card, Dialog, DropdownMenu, Input, Label, Popover, RadioGroup, ScrollArea, Select, Switch, Tabs, Textarea, Toast, Tooltip, Badge, Pagination.

Plus custom components:
- `SplitPane` -- drag-resizable horizontal split with keyboard support
- `tooltip-modern` -- `TooltipSimple` wrapper for easier usage

---

## 10. Key UX Patterns Worth Adopting

### 10.1 Chat-First, Full-Width Design
The chat view takes **100% of the content area width** (max-w-6xl centered). No sidebar competes for space. This gives Claude's responses and tool outputs maximum room to breathe.

### 10.2 Tab-as-Navigation
Instead of sidebar navigation, everything opens in tabs. Settings, Usage, MCP, Agents, CLAUDE.md -- all are tabs. This means you can have a chat session AND settings open simultaneously without modal interference.

### 10.3 In-Place Tab Transformation
When you click a session from the Projects tab, the **tab itself transforms** from type `'projects'` to type `'chat'`. This prevents tab explosion while maintaining context.

### 10.4 Floating Prompt Bar
The prompt input is **not** part of the flex layout -- it floats at the bottom. This means it stays fixed even as the message list scrolls. It also auto-resizes and has an expand-to-full mode.

### 10.5 Tool Widgets with Inline Results
Every tool call has a dedicated widget that shows both the invocation AND the result inline. No separate panel needed. The BashWidget shows the command and its output together; the EditWidget shows the diff right there.

### 10.6 Prompt Queuing
Users can submit prompts while Claude is still working. They appear in a floating queue above the input and auto-execute sequentially.

### 10.7 URL Detection and Split Preview
When terminal output contains a URL (e.g., localhost:3000), the app offers to split the view and show a live preview. This bridges coding and previewing without leaving the session.

### 10.8 Thinking Mode Selector
The 5-level thinking intensity selector with visual bar indicators is a nice UX for controlling Claude's reasoning depth without typing text commands.

---

## 11. What Opcode Does NOT Have

Understanding gaps is equally important:

1. **No Monaco editor** -- Opcode has no code editor at all. It's purely a chat/agent interface.
2. **No file explorer** -- No tree view of project files. Files are only seen through tool widgets.
3. **No terminal emulator** -- No xterm.js, no PTY. Bash commands run through Claude's tools.
4. **No git integration UI** -- No source control panel, no diff viewer (beyond tool widgets).
5. **No search panel** -- No project-wide search. Search happens through Claude's Grep tool.
6. **No status bar** -- No bottom bar with git branch, line numbers, etc.
7. **No split editor** -- No side-by-side file editing.
8. **No command palette** -- No Ctrl+Shift+P fuzzy finder.
9. **No breadcrumbs** -- No file path navigation.
10. **No vim mode** -- No editor key bindings.

---

## 12. Architectural Decisions and Trade-offs

### 12.1 Event Bus via CustomEvent
Opcode communicates between distant components using `window.dispatchEvent(new CustomEvent(...))`. This is used for tab operations, session navigation, agent execution, and more. It avoids prop drilling but creates an implicit dependency graph that's hard to trace.

**For Vantage:** Our Zustand stores are a better pattern for this. Keep explicit store subscriptions.

### 12.2 Lazy Loading
All heavy components (ClaudeCodeSession, AgentExecution, Settings, etc.) are lazy-loaded via `React.lazy()` in TabContent.tsx. This keeps initial bundle small.

### 12.3 Virtual Scrolling
Message lists use `@tanstack/react-virtual` with dynamic measurement. This is essential for long sessions with hundreds of messages.

### 12.4 Session Persistence
Tab state is saved to localStorage. Chat sessions store minimal data (sessionId, projectPath, message count) for restoration.

### 12.5 Tauri/Web Compatibility
Conditional imports check for `window.__TAURI__` and fall back to DOM event listeners. This allows the app to run in a browser without Tauri.

---

## 13. Implications for Vantage Redesign

### 13.1 What to Adopt
1. **Chat takes center stage** -- Make the chat panel full-width when active, not squeezed into a sidebar.
2. **Tab system for everything** -- Settings, agents, usage should be tabs, not modal views.
3. **Floating prompt input** -- Fixed at bottom, auto-resizable, with model/thinking selectors.
4. **Tool widgets with inline results** -- Show tool invocations and results together, not in separate panels.
5. **Virtual scrolling for messages** -- Essential for long sessions.
6. **Prompt queuing** -- Let users stack up prompts.
7. **Tab persistence** -- Save and restore tab state across sessions.
8. **Thinking mode UI** -- The 5-level selector with visual bars.

### 13.2 What to Keep from Vantage
1. **Monaco editor** -- Vantage's killer feature. Opcode doesn't have one.
2. **Terminal emulator** -- xterm.js with ConPTY is essential for a dev tool.
3. **File explorer** -- Developers need to browse project files.
4. **Git integration** -- Source control panel, diff viewer, blame.
5. **Command palette** -- Ctrl+Shift+P is muscle memory.
6. **Status bar** -- Git branch, cursor position, language mode.
7. **Multi-agent visualization** -- Kanban, tree view, merge queue.

### 13.3 Proposed Hybrid Layout
```
+------------------------------------------------------------------+
| Custom Titlebar (draggable, window controls)                      |
+------------------------------------------------------------------+
| Tab Bar (chat sessions, settings, agents, editor groups)          |
+------+-------------------------------------------+-------+--------+
|      |                                           |       |        |
| Act. |      Primary Content Area                 | Side  | (opt)  |
| Bar  |   (Chat OR Editor, full width)            | Panel | Time-  |
| (48px)|                                          |       | line   |
|      |                                           |       |        |
|      +-------------------------------------------+       |        |
|      | [Floating Prompt Input]                   |       |        |
+------+-------------------------------------------+-------+--------+
| Status Bar                                                        |
+------------------------------------------------------------------+
```

Key changes from current Vantage:
- Chat is NOT a sidebar -- it's a primary content area that can take full width
- Activity bar is minimal (icons only, like VS Code but thinner)
- Side panels (file explorer, search) are collapsible and optional
- Editor and Chat can coexist as tabs or split views
- Floating prompt input for chat (not embedded in a panel)

### 13.4 Layout Modes
Consider implementing switchable modes:
1. **Chat Mode** -- Full-width chat, no editor (like Opcode)
2. **Code Mode** -- Editor takes center, chat in sidebar (like current Vantage)
3. **Split Mode** -- Editor left, chat right (balanced)
4. **Zen Mode** -- Full-screen editor or chat, no chrome

---

## 14. Component Inventory

### 14.1 Complete Source File List
```
src/
  App.tsx                          -- Root layout, view router
  main.tsx                         -- Entry point, providers
  styles.css                       -- Global styles, themes
  assets/shimmer.css               -- Custom animations
  
  components/
    CustomTitlebar.tsx              -- Window titlebar with nav icons
    TabManager.tsx                  -- Tab bar with drag reorder
    TabContent.tsx                  -- Tab content router
    ClaudeCodeSession.tsx           -- Core chat session (750+ lines)
    StreamMessage.tsx               -- Message renderer (740 lines)
    ToolWidgets.tsx                 -- 22 tool widgets (1500+ lines)
    ToolWidgets.new.tsx             -- Newer version (unused?)
    FloatingPromptInput.tsx         -- Prompt bar (600+ lines)
    Topbar.tsx                      -- Version status (deprecated)
    SessionList.tsx                 -- Session grid
    ProjectList.tsx                 -- Project list
    Settings.tsx                    -- Settings panel
    Agents.tsx                      -- Agent management (tab version)
    CCAgents.tsx                    -- Agent management (standalone)
    CreateAgent.tsx                 -- Agent creation form
    AgentExecution.tsx              -- Agent run UI
    AgentRunOutputViewer.tsx        -- Agent output display
    AgentRunsList.tsx               -- Agent run history
    AgentRunView.tsx                -- Single run view
    AgentsModal.tsx                 -- Agent picker modal
    TimelineNavigator.tsx           -- Checkpoint timeline
    CheckpointSettings.tsx          -- Checkpoint config
    UsageDashboard.tsx              -- Usage analytics
    MCPManager.tsx                  -- MCP server management
    MCPServerList.tsx               -- MCP server list
    MCPAddServer.tsx                -- Add MCP server form
    MCPImportExport.tsx             -- MCP import/export
    MarkdownEditor.tsx              -- CLAUDE.md editor
    ClaudeFileEditor.tsx            -- Claude file editor
    ClaudeMemoriesDropdown.tsx      -- CLAUDE.md file picker
    ClaudeVersionSelector.tsx       -- Claude binary selector
    ClaudeBinaryDialog.tsx          -- Binary path dialog
    FilePicker.tsx                  -- File/folder picker
    FilePicker.optimized.tsx        -- Optimized version
    GitHubAgentBrowser.tsx          -- GitHub agent import
    HooksEditor.tsx                 -- Hooks CRUD
    IconPicker.tsx                  -- Agent icon picker
    ImagePreview.tsx                -- Image preview in prompts
    SlashCommandPicker.tsx          -- / command autocomplete
    SlashCommandsManager.tsx        -- Slash command management
    WebviewPreview.tsx              -- URL preview iframe
    NFOCredits.tsx                  -- About/credits
    StartupIntro.tsx                -- Boot animation
    ErrorBoundary.tsx               -- Error boundary
    AnalyticsErrorBoundary.tsx      -- Analytics error handler
    AnalyticsConsent.tsx            -- Analytics opt-in
    ExecutionControlBar.tsx         -- Floating execution status
    RunningClaudeSessions.tsx       -- Active session list
    TokenCounter.tsx                -- Token display
    StorageTab.tsx                  -- Data management
    ProxySettings.tsx               -- Proxy config
    ProjectSettings.tsx             -- Per-project settings
    PreviewPromptDialog.tsx         -- Preview URL prompt
    
    claude-code-session/
      MessageList.tsx               -- Virtualized message list
      PromptQueue.tsx               -- Queued prompts display
      SessionHeader.tsx             -- Session header bar
      useCheckpoints.ts             -- Checkpoint hook
      useClaudeMessages.ts          -- Message processing hook
    
    ui/                             -- shadcn/ui components
      badge, button, card, dialog, dropdown-menu, input,
      label, pagination, popover, radio-group, scroll-area,
      select, split-pane, switch, tabs, textarea, toast,
      tooltip, tooltip-modern
    
    widgets/
      BashWidget.tsx                -- Bash tool widget
      LSWidget.tsx                  -- LS tool widget
      TodoWidget.tsx                -- Todo tool widget
  
  contexts/
    TabContext.tsx                   -- Tab state management
    ThemeContext.tsx                 -- Theme state management
  
  hooks/
    useTabState.ts                  -- Tab operations hook
    useTheme.ts                     -- Theme hook
    useAnalytics.ts                 -- Analytics tracking
    useApiCall.ts                   -- API call wrapper
    useDebounce.ts                  -- Debounce hook
    useLoadingState.ts              -- Loading state hook
    usePagination.ts                -- Pagination hook
    usePerformanceMonitor.ts        -- Perf monitoring
  
  stores/
    agentStore.ts                   -- Agent state
    sessionStore.ts                 -- Session state
  
  services/
    sessionPersistence.ts           -- Session save/restore
    tabPersistence.ts               -- Tab save/restore
  
  lib/
    api.ts                          -- Tauri IPC / web fallback
    apiAdapter.ts                   -- Web mode initialization
    api-tracker.ts                  -- API call tracking
    claudeSyntaxTheme.ts            -- Syntax highlighting theme
    date-utils.ts                   -- Date formatting
    hooksManager.ts                 -- Hooks file management
    linkDetector.tsx                -- URL detection
    outputCache.tsx                 -- Render caching
    utils.ts                        -- cn() and utilities
    analytics/                      -- PostHog analytics
```

---

## 15. Summary: The Opcode Philosophy

Opcode's design philosophy can be summarized as: **"Claude IS the IDE."**

There is no editor, no terminal, no file explorer -- because Claude handles all of that through its tools. The UI exists solely to:
1. Show you what Claude is doing (message stream with tool widgets)
2. Let you tell Claude what to do (floating prompt input)
3. Manage your sessions and agents (tabs and project lists)

This is the polar opposite of VS Code clones that bolt a chat sidebar onto an editor. Opcode instead built a chat interface and bolted nothing else onto it.

**For Vantage's redesign:** The goal should be a hybrid -- the best of both worlds. Chat should be able to take center stage (like Opcode) but should also coexist with a proper editor, terminal, and file explorer (like VS Code). The key insight from Opcode is that the chat deserves **primary real estate**, not a 300px sidebar.
