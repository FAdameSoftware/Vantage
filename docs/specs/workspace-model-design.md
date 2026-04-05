# Workspace Model Design

**Status**: Design (not yet implemented)
**Author**: Architecture phase
**Date**: 2026-04-04

---

## 1. Problem Statement

Vantage currently operates as a single-instance application with global state. When the user switches from project A to project B:

- All open editor tabs are lost (editor store is in-memory, not persisted per-project)
- Terminal sessions die (PTY processes are tied to the old cwd)
- Chat history is gone (conversation store resets)
- Agent kanban state resets (agents store is in-memory)
- Layout preferences (sidebar widths, panel visibility) are global, not per-project
- The title bar always says "Vantage" with no project context
- There is no "recent projects" list for quick switching

VS Code and Cursor solve this with a workspace model: each window is bound to a single project directory, and all transient state is scoped to and persisted for that directory.

### Current State Audit

| Store | File | Persisted? | Mechanism | Scoped to project? |
|---|---|---|---|---|
| `useLayoutStore` | `stores/layout.ts` | Yes | Zustand `persist` -> `localStorage["vantage-layout"]` | No (global) |
| `useSettingsStore` | `stores/settings.ts` | Yes | Zustand `persist` -> `localStorage["vantage-settings"]` | No (global, intentionally) |
| `useEditorStore` | `stores/editor.ts` | No | In-memory only | No |
| `useConversationStore` | `stores/conversation.ts` | No | In-memory only | No |
| `useAgentsStore` | `stores/agents.ts` | No | In-memory only | No |
| `useAgentConversationsStore` | `stores/agentConversations.ts` | No | In-memory only | No |
| `useMergeQueueStore` | `stores/mergeQueue.ts` | No | In-memory only | No |
| `useVerificationStore` | `stores/verification.ts` | No | In-memory only | No |
| `useUsageStore` | `stores/usage.ts` | No | In-memory only | No |
| `useCommandPaletteStore` | `stores/commandPalette.ts` | No | In-memory only | N/A (transient UI) |
| `useQuickQuestionStore` | `stores/quickQuestion.ts` | No | In-memory only | N/A (transient UI) |

---

## 2. Design Goals

1. **Workspace = project directory** -- opening a folder creates or restores a workspace
2. **Per-workspace persistence** -- tabs, layout, chat sessions, agent state survive app restart
3. **Global preferences stay global** -- theme, font size, vim mode, keybindings are user-level, not project-level
4. **Title bar shows project name** -- `ProjectName - Vantage`
5. **Recent projects** -- track last N opened projects for quick switching
6. **Workspace switch = full state swap** -- closing workspace A, opening workspace B swaps all workspace-scoped state atomically
7. **Future multi-window** -- the design must not preclude one window per workspace later

---

## 3. Storage Architecture

### 3.1 Storage Locations

```
~/.vantage/                              # User-level Vantage config
  global-settings.json                   # Theme, fonts, keybindings (migrated from localStorage)
  recent-projects.json                   # Array of recent project entries
  workspaces/                            # Per-workspace state files
    <base64url(project-path)>.json       # Workspace state for each project
```

**Why `~/.vantage/workspaces/` instead of `.vantage/` in the project root:**

- Does not pollute project directories or `.gitignore` files
- Works for read-only directories, network mounts, monorepo subdirectories
- Single backup/wipe point for all workspace state
- VS Code uses a similar pattern with `~/.vscode/` and internal state DB

The base64url encoding of the project path guarantees a unique, filesystem-safe filename per project directory. Example: `C:/CursorProjects/Vantage` becomes `Qzov Q3Vyc29yUHJvamVjdHMvVmFudGFnZQ.json` (illustrative).

### 3.2 File Formats

#### `recent-projects.json`

```typescript
interface RecentProjectsFile {
  version: 1;
  projects: RecentProject[];
}

interface RecentProject {
  /** Absolute path to the project root (forward-slash normalized) */
  path: string;
  /** Display name (directory basename, or user override) */
  name: string;
  /** Last time this project was opened (ISO 8601) */
  lastOpenedAt: string;
  /** Whether the directory still exists (checked lazily on app start) */
  exists?: boolean;
  /** Pinned to top of recent list */
  pinned: boolean;
}
```

#### `<workspace>.json`

```typescript
interface WorkspaceFile {
  version: 1;
  projectPath: string;
  lastSavedAt: string;
  layout: WorkspaceLayout;
  editor: WorkspaceEditorState;
  chat: WorkspaceChatState;
  agents: WorkspaceAgentState;
  terminal: WorkspaceTerminalState;
}
```

Each sub-object is defined below in Section 4.

---

## 4. WorkspaceState Interface

### 4.1 Complete Type Definitions

```typescript
// ─── Top-level workspace state ──────────────────────────────────────

interface WorkspaceState {
  /** Absolute path to the project root directory */
  projectPath: string;
  /** Schema version for forward-compatible migrations */
  version: 1;
  /** ISO 8601 timestamp of last save */
  lastSavedAt: string;

  layout: WorkspaceLayout;
  editor: WorkspaceEditorState;
  chat: WorkspaceChatState;
  agents: WorkspaceAgentState;
  terminal: WorkspaceTerminalState;
}

// ─── Layout (workspace-scoped portion of layout store) ──────────────

interface WorkspaceLayout {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
  activeActivityBarItem: "explorer" | "search" | "git" | "agents" | "settings";
  primarySidebarSize: number;
  secondarySidebarSize: number;
  panelSize: number;
  activePanelTab: "terminal" | "browser" | "verification";
  agentsViewMode: "kanban" | "tree";
  previewUrl: string | null;
  previewActive: boolean;
}

// ─── Editor tabs ────────────────────────────────────────────────────

interface WorkspaceEditorState {
  /** Ordered list of open tabs (content NOT stored -- re-read from disk) */
  tabs: WorkspaceTabEntry[];
  /** ID of the active tab (null if no tabs) */
  activeTabId: string | null;
  /** Set of tab IDs with markdown preview active */
  markdownPreviewTabIds: string[];
}

interface WorkspaceTabEntry {
  /** Normalized file path used as tab ID */
  id: string;
  /** Full file path (forward-slash normalized) */
  path: string;
  /** Display name (filename) */
  name: string;
  /** Monaco language ID */
  language: string;
  /** Whether this was a preview tab */
  isPreview: boolean;
  /** Cursor position at time of save */
  cursorPosition: { line: number; column: number };
  /** Scroll position (top visible line) */
  scrollTop?: number;
}

// ─── Chat / Conversation ────────────────────────────────────────────

interface WorkspaceChatState {
  /** Claude CLI session ID to attempt resuming */
  lastSessionId: string | null;
  /** CLI-level session ID (from system_init) for session resume */
  lastCliSessionId: string | null;
  /** Serialized conversation messages for display continuity */
  messages: SerializedMessage[];
  /** Cumulative cost for this workspace's sessions */
  totalCost: number;
  /** Cumulative tokens */
  totalTokens: { input: number; output: number };
}

interface SerializedMessage {
  id: string;
  role: "user" | "assistant" | "system" | "result";
  text: string;
  /** Thinking text is NOT persisted (ephemeral, potentially large) */
  toolCalls: SerializedToolCall[];
  model?: string;
  timestamp: number;
  parentToolUseId: string | null;
}

interface SerializedToolCall {
  id: string;
  name: string;
  /** Stringified input (not parsed object -- avoids re-serialization issues) */
  inputJson: string;
  output?: string;
  isError?: boolean;
}

// ─── Agents ─────────────────────────────────────────────────────────

interface WorkspaceAgentState {
  /** Serialized agents (non-active ones only -- running agents cannot be restored) */
  agents: SerializedAgent[];
  /** Column ordering */
  columnOrder: Record<"backlog" | "in_progress" | "review" | "done", string[]>;
}

interface SerializedAgent {
  id: string;
  name: string;
  /** Persisted status -- running agents become "idle" on restore */
  status: "idle" | "completed" | "error";
  taskDescription: string;
  column: "backlog" | "in_progress" | "review" | "done";
  branchName: string | null;
  worktreePath: string | null;
  assignedFiles: string[];
  cost: number;
  tokens: { input: number; output: number };
  createdAt: number;
  lastActivityAt: number;
  color: string;
  model?: string;
  role: "coordinator" | "specialist" | "verifier" | "builder";
  parentId: string | null;
  childIds: string[];
  /** Timeline events are persisted for history (capped at last 200) */
  timeline: Array<{
    id: string;
    timestamp: number;
    type: string;
    summary: string;
  }>;
  errorMessage?: string;
  checkpoint?: {
    tagName: string;
    commitHash: string;
    createdAt: string;
  };
}

// ─── Terminal ───────────────────────────────────────────────────────

interface WorkspaceTerminalState {
  /** Terminal tab configurations (not the PTY state -- that cannot be serialized) */
  tabs: WorkspaceTerminalTab[];
  /** ID of the active terminal tab */
  activeTabId: string | null;
}

interface WorkspaceTerminalTab {
  id: string;
  name: string;
  /** Shell type (bash, powershell, cmd) */
  shellType?: string;
  /** Working directory at time of save */
  cwd: string;
}
```

### 4.2 What is NOT Persisted

| Data | Reason |
|---|---|
| File content in editor tabs | Re-read from disk on restore (content may have changed externally) |
| Thinking text in messages | Ephemeral, potentially very large, no user value on restore |
| Tool call parsed `input` objects | Stored as `inputJson` string instead -- avoids serialization edge cases |
| Active streaming state | `isStreaming`, `activeBlocks`, etc. are transient |
| PTY buffer contents | Terminal scrollback cannot be serialized from xterm.js/ConPTY |
| Pending diffs | Transient UI state, requires active Claude session |
| Command palette state | Transient UI overlay |
| Quick question state | Transient UI overlay |
| Session-allowed tools | Tied to a live session, not meaningful across restarts |
| Agent running state | `working`/`waiting_permission` agents become `idle` on restore (session is dead) |

---

## 5. Store Scoping Classification

### 5.1 Workspace-Scoped (state swapped on project switch)

| Store | What becomes workspace-scoped |
|---|---|
| `useLayoutStore` | Everything except `projectRootPath` itself (which becomes the workspace key) |
| `useEditorStore` | Entire store (tabs, activeTabId, cursor, markdown preview state) |
| `useConversationStore` | Entire store (messages, session, cost, tokens) |
| `useAgentsStore` | Entire store (agents map, column order) |
| `useAgentConversationsStore` | Entire store (per-agent conversations) |
| `useMergeQueueStore` | Entire store (queue entries, default gates) |
| `useVerificationStore` | Entire store (agent verification state) |
| `useUsageStore` | Entire store (session usage tracking) |

### 5.2 Global (shared across all workspaces)

| Store | Reason |
|---|---|
| `useSettingsStore` | User preferences apply everywhere (theme, font, vim mode, etc.) |
| `useCommandPaletteStore` | Transient UI, no persistence needed |
| `useQuickQuestionStore` | Transient UI, no persistence needed |

### 5.3 New Stores Required

| Store | Purpose |
|---|---|
| `useWorkspaceStore` | Workspace lifecycle management (current workspace, recent projects, save/load) |

---

## 6. WorkspaceManager Design

The workspace manager is a **frontend-only** service. It reads/writes JSON files through Tauri's `fs` plugin. No new Rust commands are needed for the core workspace logic.

### 6.1 Store Definition

```typescript
// stores/workspace.ts

interface WorkspaceManagerState {
  /** The currently active workspace (null = no project open, show welcome) */
  currentWorkspace: WorkspaceState | null;
  /** List of recently opened projects */
  recentProjects: RecentProject[];
  /** Whether workspace state is currently being loaded */
  isLoading: boolean;
  /** Whether there are unsaved workspace changes (for debounced auto-save) */
  isDirty: boolean;

  // ── Lifecycle actions ──

  /**
   * Open a workspace for a given project path.
   * 1. Save current workspace (if any)
   * 2. Load workspace file for the new path (or create default)
   * 3. Apply loaded state to all workspace-scoped stores
   * 4. Update recent projects list
   * 5. Update window title
   */
  openWorkspace: (projectPath: string) => Promise<void>;

  /**
   * Save the current workspace state to disk.
   * Collects state from all workspace-scoped stores and writes the JSON file.
   */
  saveWorkspace: () => Promise<void>;

  /**
   * Close the current workspace (save first, then reset all stores).
   */
  closeWorkspace: () => Promise<void>;

  /**
   * Remove a project from the recent projects list.
   */
  removeRecentProject: (projectPath: string) => void;

  /**
   * Pin/unpin a project in the recent projects list.
   */
  togglePinProject: (projectPath: string) => void;

  /**
   * Mark the workspace as dirty (triggers debounced auto-save).
   */
  markDirty: () => void;
}
```

### 6.2 Data Flow: Opening a Workspace

```
User clicks "Open Folder" or selects from Recent Projects
  |
  v
workspaceManager.openWorkspace(projectPath)
  |
  +---> [1] Save current workspace (if any)
  |       |
  |       +---> Collect state from all workspace-scoped stores
  |       +---> Write to ~/.vantage/workspaces/<encoded-old-path>.json
  |
  +---> [2] Reset all workspace-scoped stores to defaults
  |
  +---> [3] Read ~/.vantage/workspaces/<encoded-new-path>.json
  |       |
  |       +---> If exists: parse and validate against schema version
  |       +---> If not exists: create default WorkspaceState
  |
  +---> [4] Apply loaded state to stores
  |       |
  |       +---> layoutStore: restore sidebar/panel state
  |       +---> editorStore: re-open tabs (read content from disk)
  |       +---> conversationStore: restore messages, session info
  |       +---> agentsStore: restore agents (downgrade running -> idle)
  |       +---> usageStore: restore cost/token counters
  |       +---> mergeQueueStore: restore queue entries
  |       +---> verificationStore: restore verification state
  |
  +---> [5] Update recent projects list
  |       |
  |       +---> Add/move to top of recent-projects.json
  |
  +---> [6] Update window title
  |       |
  |       +---> getCurrentWindow().setTitle(`${projectName} - Vantage`)
  |
  +---> [7] Set projectRootPath in layout store
  |
  +---> [8] Start auto-save timer
```

### 6.3 Data Flow: Auto-Save

```
Any workspace-scoped store changes
  |
  v
Store subscriber calls workspaceManager.markDirty()
  |
  v
Debounce timer (2 seconds)
  |
  v
workspaceManager.saveWorkspace()
  |
  +---> Collect state from all stores
  +---> Serialize to WorkspaceFile
  +---> Write to ~/.vantage/workspaces/<encoded-path>.json
  +---> Set isDirty = false
```

### 6.4 Data Flow: App Close

```
Window close event (Tauri onCloseRequested)
  |
  v
workspaceManager.saveWorkspace()  // synchronous-ish, must complete before exit
  |
  v
Allow window to close
```

### 6.5 Key Implementation Functions

```typescript
// ── Path encoding ───────────────────────────────────────────────────

/**
 * Encode a project path into a filesystem-safe filename.
 * Uses base64url encoding of the UTF-8 path bytes.
 */
function encodeWorkspaceId(projectPath: string): string {
  // Normalize: forward slashes, lowercase drive letter
  let normalized = projectPath.replace(/\\/g, "/");
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  // base64url encode (no padding, URL-safe chars)
  return btoa(normalized)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function workspaceFilePath(projectPath: string): string {
  const id = encodeWorkspaceId(projectPath);
  return `${appDataDir}/.vantage/workspaces/${id}.json`;
}

// ── State collection ────────────────────────────────────────────────

/**
 * Snapshot all workspace-scoped stores into a WorkspaceState object.
 */
function collectWorkspaceState(projectPath: string): WorkspaceState {
  const layout = useLayoutStore.getState();
  const editor = useEditorStore.getState();
  const conversation = useConversationStore.getState();
  const agents = useAgentsStore.getState();
  const usage = useUsageStore.getState();
  // ... etc.

  return {
    projectPath,
    version: 1,
    lastSavedAt: new Date().toISOString(),
    layout: {
      primarySidebarVisible: layout.primarySidebarVisible,
      secondarySidebarVisible: layout.secondarySidebarVisible,
      panelVisible: layout.panelVisible,
      activeActivityBarItem: layout.activeActivityBarItem,
      primarySidebarSize: layout.primarySidebarSize,
      secondarySidebarSize: layout.secondarySidebarSize,
      panelSize: layout.panelSize,
      activePanelTab: layout.activePanelTab,
      agentsViewMode: layout.agentsViewMode,
      previewUrl: layout.previewUrl,
      previewActive: layout.previewActive,
    },
    editor: {
      tabs: editor.tabs.map((t) => ({
        id: t.id,
        path: t.path,
        name: t.name,
        language: t.language,
        isPreview: t.isPreview,
        cursorPosition: { line: 1, column: 1 }, // TODO: read from Monaco
        scrollTop: undefined,
      })),
      activeTabId: editor.activeTabId,
      markdownPreviewTabIds: [...editor.markdownPreviewTabs],
    },
    chat: {
      lastSessionId: conversation.session?.sessionId ?? null,
      lastCliSessionId: conversation.session?.cliSessionId ?? null,
      messages: conversation.messages.map(serializeMessage),
      totalCost: conversation.totalCost,
      totalTokens: { ...conversation.totalTokens },
    },
    agents: serializeAgentsState(agents),
    terminal: {
      // Terminal state collected from terminal manager
      tabs: [], // Populated by terminal integration
      activeTabId: null,
    },
  };
}

// ── State application ───────────────────────────────────────────────

/**
 * Apply a loaded WorkspaceState to all workspace-scoped stores.
 */
async function applyWorkspaceState(ws: WorkspaceState): Promise<void> {
  // 1. Layout
  useLayoutStore.setState({
    primarySidebarVisible: ws.layout.primarySidebarVisible,
    secondarySidebarVisible: ws.layout.secondarySidebarVisible,
    panelVisible: ws.layout.panelVisible,
    activeActivityBarItem: ws.layout.activeActivityBarItem,
    primarySidebarSize: ws.layout.primarySidebarSize,
    secondarySidebarSize: ws.layout.secondarySidebarSize,
    panelSize: ws.layout.panelSize,
    activePanelTab: ws.layout.activePanelTab,
    agentsViewMode: ws.layout.agentsViewMode,
    previewUrl: ws.layout.previewUrl,
    previewActive: ws.layout.previewActive,
    projectRootPath: ws.projectPath,
  });

  // 2. Editor -- re-open tabs by reading content from disk
  const editorStore = useEditorStore.getState();
  editorStore.closeAllTabs();
  for (const tab of ws.editor.tabs) {
    try {
      const content = await invoke<string>("read_file", { path: tab.path });
      editorStore.openFile(tab.path, tab.name, tab.language, content, tab.isPreview);
    } catch {
      // File may have been deleted -- skip silently
      console.warn(`Workspace restore: could not open ${tab.path}`);
    }
  }
  if (ws.editor.activeTabId) {
    editorStore.setActiveTab(ws.editor.activeTabId);
  }
  // Restore markdown preview state
  for (const tabId of ws.editor.markdownPreviewTabIds) {
    if (editorStore.tabs.find((t) => t.id === tabId)) {
      editorStore.toggleMarkdownPreview(tabId);
    }
  }

  // 3. Conversation -- restore messages for display continuity
  //    (actual Claude session must be re-established separately)
  const convStore = useConversationStore.getState();
  convStore.clearConversation();
  // Directly set restored state
  useConversationStore.setState({
    messages: ws.chat.messages.map(deserializeMessage),
    totalCost: ws.chat.totalCost,
    totalTokens: ws.chat.totalTokens,
    session: ws.chat.lastSessionId
      ? { sessionId: ws.chat.lastSessionId, cliSessionId: ws.chat.lastCliSessionId ?? undefined }
      : null,
  });

  // 4. Agents -- restore from serialized form
  applyAgentsState(ws.agents);

  // 5. Terminal -- re-create terminal tabs (new PTY processes in restored cwds)
  // This is handled by the terminal integration layer, not the store directly
}
```

---

## 7. Store Integration Changes

### 7.1 Layout Store Changes

The layout store currently persists to `localStorage["vantage-layout"]` via Zustand's `persist` middleware. This must change:

**Before:**
- `persist` middleware writes to localStorage (global)
- `projectRootPath` is stored alongside layout preferences

**After:**
- Remove `persist` middleware from layout store entirely
- Layout state is saved/restored by WorkspaceManager
- `projectRootPath` becomes a derived property (always equals `currentWorkspace.projectPath`)
- Add a `resetToDefaults()` action for workspace close

```typescript
// layout.ts changes (conceptual)

export const useLayoutStore = create<LayoutState>()(
  // NO persist middleware -- workspace manager handles persistence
  (set, get) => ({
    // ... same state and actions ...

    /** Reset all layout state to defaults (called on workspace close) */
    resetToDefaults: () => set({
      primarySidebarVisible: true,
      secondarySidebarVisible: true,
      panelVisible: true,
      activeActivityBarItem: "explorer",
      primarySidebarSize: 20,
      secondarySidebarSize: 25,
      panelSize: 30,
      projectRootPath: null,
      previewUrl: null,
      previewActive: false,
      activePanelTab: "terminal",
      agentsViewMode: "kanban",
    }),
  })
);
```

### 7.2 Settings Store Changes

Settings stay global and keep using `persist` middleware but migrate from `localStorage` to `~/.vantage/global-settings.json`:

**Before:**
- `persist` to `localStorage["vantage-settings"]`

**After:**
- `persist` to `~/.vantage/global-settings.json` via a custom Zustand storage adapter that uses Tauri's fs plugin

```typescript
// Custom storage adapter for Tauri filesystem
const tauriFileStorage: StateStorage = {
  getItem: async (name: string) => {
    try {
      return await invoke<string>("read_text_file", {
        path: `${appDataDir}/${name}.json`
      });
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    await invoke("write_text_file", {
      path: `${appDataDir}/${name}.json`,
      content: value
    });
  },
  removeItem: async (name: string) => {
    await invoke("delete_file", {
      path: `${appDataDir}/${name}.json`
    });
  },
};
```

### 7.3 Editor Store Changes

Add `resetToDefaults()` and serialization helpers:

```typescript
// editor.ts additions

interface EditorState {
  // ... existing ...

  /** Reset all editor state (called on workspace switch) */
  resetToDefaults: () => void;

  /** Get serializable snapshot of tab state (for workspace save) */
  getSerializableState: () => WorkspaceEditorState;
}
```

### 7.4 Conversation Store Changes

Add `resetToDefaults()` and ability to restore from serialized messages:

```typescript
// conversation.ts additions

interface ConversationState {
  // ... existing ...

  /** Reset to defaults (called on workspace switch) */
  resetToDefaults: () => void;

  /** Restore from workspace state (messages + metadata, no live session) */
  restoreFromWorkspace: (state: WorkspaceChatState) => void;
}
```

### 7.5 Auto-Save Wiring

Each workspace-scoped store needs to notify the workspace manager when state changes. This is done via Zustand's `subscribe`:

```typescript
// In workspace store initialization, after opening a workspace:

const unsubscribers: Array<() => void> = [];

unsubscribers.push(
  useLayoutStore.subscribe(() => workspaceManager.markDirty()),
  useEditorStore.subscribe(() => workspaceManager.markDirty()),
  useConversationStore.subscribe(
    (state) => state.messages.length, // Only on message count change, not every stream delta
    () => workspaceManager.markDirty()
  ),
  useAgentsStore.subscribe(() => workspaceManager.markDirty()),
  // ... etc
);

// On workspace close, call all unsubscribers
```

---

## 8. Title Bar Integration

### 8.1 Current State

`TitleBar.tsx` hardcodes the text "Vantage":

```tsx
<span ...>Vantage</span>
```

### 8.2 New Design

```tsx
// TitleBar.tsx changes

export function TitleBar() {
  const projectPath = useLayoutStore((s) => s.projectRootPath);

  // Extract project name from path (last segment)
  const projectName = projectPath
    ? projectPath.replace(/\\/g, "/").split("/").pop()
    : null;

  const title = projectName ? `${projectName} - Vantage` : "Vantage";

  // Also sync to native window title for taskbar/alt-tab
  useEffect(() => {
    getCurrentWindow().setTitle(title);
  }, [title]);

  return (
    <div ...>
      <div ... data-tauri-drag-region>
        <span ...>{title}</span>
      </div>
      <WindowControls />
    </div>
  );
}
```

---

## 9. Recent Projects

### 9.1 Welcome Screen

When no workspace is open (`projectRootPath === null`), the editor area shows a welcome screen with:

1. "Open Folder" button
2. Recent projects list (clickable, with pin/remove)
3. Keyboard shortcut hint (`Ctrl+O` to open folder)

### 9.2 Command Palette Integration

Add workspace commands to the command palette:

- `Workspace: Open Folder` -- trigger folder picker
- `Workspace: Open Recent...` -- show recent projects in palette
- `Workspace: Close Workspace` -- save and close current workspace

### 9.3 Recent Projects Limit

Keep the last **20** projects. Pinned projects do not count toward this limit.

---

## 10. Rust-Side Changes

### 10.1 New Tauri Commands

Minimal new Rust commands are needed. The workspace manager primarily uses existing file I/O commands. However, two utility commands are helpful:

```rust
/// Ensure the ~/.vantage/workspaces/ directory exists
#[tauri::command]
fn ensure_vantage_dirs() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let workspaces_dir = home.join(".vantage").join("workspaces");
    std::fs::create_dir_all(&workspaces_dir)
        .map_err(|e| format!("Failed to create workspaces dir: {e}"))?;
    Ok(())
}

/// Get the platform-specific path to ~/.vantage/
#[tauri::command]
fn get_vantage_data_dir() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let vantage_dir = home.join(".vantage");
    Ok(vantage_dir.to_string_lossy().replace('\\', "/"))
}
```

### 10.2 Window Title on Startup

Update `tauri.conf.json` to support dynamic window titles. The initial title stays "Vantage" and is updated by the frontend once a workspace loads:

```json
{
  "app": {
    "windows": [
      {
        "title": "Vantage",
        ...
      }
    ]
  }
}
```

No change needed -- the frontend calls `getCurrentWindow().setTitle(...)` after workspace load.

---

## 11. Migration Plan

### Phase 1: Foundation (non-breaking)

**Goal:** Add workspace infrastructure without changing existing behavior.

1. Create `src/stores/workspace.ts` with `useWorkspaceStore`
2. Create `src/lib/workspaceStorage.ts` with encode/decode, read/write helpers
3. Add `ensure_vantage_dirs` and `get_vantage_data_dir` Rust commands
4. Add `resetToDefaults()` to layout, editor, conversation, agents stores
5. Add `getSerializableState()` to each workspace-scoped store

**Breaking changes:** None. All stores continue to work as before.

### Phase 2: Persistence (opt-in)

**Goal:** Workspace state is saved and restored.

1. Wire `openWorkspace()` into the existing "Open Folder" flow (currently in `EditorArea.tsx` and `useFileTree.ts`)
2. On folder open: create/load workspace, apply state
3. Add auto-save via store subscriptions (debounced 2s)
4. Add save-on-close via Tauri `onCloseRequested` event
5. Update `TitleBar.tsx` to show project name

**Breaking changes:** Layout store loses `persist` middleware. On first run after this update, previous localStorage state is migrated to a workspace file for the last-opened project path (one-time migration).

### Phase 3: Recent Projects

**Goal:** Recent projects UI is functional.

1. Add `recent-projects.json` read/write in workspace store
2. Update welcome screen (EditorArea's empty state) with recent projects list
3. Add "Open Recent" command to command palette
4. Add pin/remove actions to recent projects

**Breaking changes:** None.

### Phase 4: Settings Migration (optional, low priority)

**Goal:** Global settings stored in filesystem instead of localStorage.

1. Implement `tauriFileStorage` adapter for Zustand persist
2. Migrate settings store from localStorage to `~/.vantage/global-settings.json`
3. One-time migration: read from localStorage, write to file, clear localStorage key

**Breaking changes:** Settings location changes (transparent to user).

### Phase 5: Multi-Window (future)

**Goal:** Each window is its own workspace.

1. Use Tauri's multi-window API to spawn new windows
2. Each window gets its own store instances (Zustand stores become per-window)
3. Add "New Window" command
4. IPC between windows for shared state (e.g., recent projects)

**Breaking changes:** Major refactor of store instantiation. Deferred.

---

## 12. One-Time Migration: localStorage to Workspace Files

On first launch after Phase 2 deployment:

```typescript
async function migrateFromLocalStorage(): Promise<void> {
  const layoutRaw = localStorage.getItem("vantage-layout");
  if (!layoutRaw) return; // Nothing to migrate

  try {
    const layoutData = JSON.parse(layoutRaw);
    const parsed = layoutData?.state ?? layoutData;
    const projectPath = parsed?.projectRootPath;

    if (projectPath) {
      // Create a workspace file from the old localStorage state
      const ws = createDefaultWorkspaceState(projectPath);
      ws.layout = {
        primarySidebarVisible: parsed.primarySidebarVisible ?? true,
        secondarySidebarVisible: parsed.secondarySidebarVisible ?? true,
        panelVisible: parsed.panelVisible ?? true,
        activeActivityBarItem: parsed.activeActivityBarItem ?? "explorer",
        primarySidebarSize: parsed.primarySidebarSize ?? 20,
        secondarySidebarSize: parsed.secondarySidebarSize ?? 25,
        panelSize: parsed.panelSize ?? 30,
        activePanelTab: parsed.activePanelTab ?? "terminal",
        agentsViewMode: parsed.agentsViewMode ?? "kanban",
        previewUrl: parsed.previewUrl ?? null,
        previewActive: parsed.previewActive ?? false,
      };
      await writeWorkspaceFile(projectPath, ws);

      // Seed recent projects with the migrated project
      await addToRecentProjects(projectPath);
    }
  } catch (e) {
    console.warn("localStorage migration failed (non-fatal):", e);
  }

  // Clean up old localStorage keys
  localStorage.removeItem("vantage-layout");
  // Mark migration as complete
  localStorage.setItem("vantage-workspace-migrated", "1");
}
```

---

## 13. File Structure Changes

### New Files

```
src/
  stores/
    workspace.ts              # WorkspaceManager store (useWorkspaceStore)
  lib/
    workspaceStorage.ts       # File I/O helpers: encode path, read/write workspace JSON
    workspaceDefaults.ts      # Default WorkspaceState factory, migration logic
    workspaceTypes.ts         # All TypeScript interfaces from Section 4
  components/
    layout/
      WelcomeScreen.tsx       # Recent projects, open folder (replaces current empty state)

src-tauri/
  src/
    workspace.rs              # ensure_vantage_dirs, get_vantage_data_dir commands
```

### Modified Files

```
src/
  stores/
    layout.ts                 # Remove persist middleware, add resetToDefaults()
    editor.ts                 # Add resetToDefaults(), getSerializableState()
    conversation.ts           # Add resetToDefaults(), restoreFromWorkspace()
    agents.ts                 # Add resetToDefaults(), serialization helpers
    agentConversations.ts     # Add resetToDefaults()
    mergeQueue.ts             # Add resetToDefaults()
    verification.ts           # Add resetToDefaults()
    usage.ts                  # Add resetToDefaults()
    settings.ts               # (Phase 4) Migrate to tauriFileStorage adapter
  components/
    layout/
      TitleBar.tsx            # Show project name in title
      EditorArea.tsx          # Wire openWorkspace into folder open flow
  hooks/
    useFileTree.ts            # Use workspace open flow instead of raw setProjectRootPath
  App.tsx or main entry       # Add migration check on startup, add save-on-close handler

src-tauri/
  src/
    lib.rs                    # Register new workspace commands
```

---

## 14. Edge Cases and Error Handling

### 14.1 Corrupt Workspace File

If `<workspace>.json` fails to parse:
1. Log warning to console
2. Rename corrupt file to `<workspace>.json.corrupt`
3. Create fresh default workspace state
4. Show non-blocking toast: "Workspace state was corrupted and has been reset"

### 14.2 Missing Files on Tab Restore

When restoring editor tabs, files may have been deleted or renamed:
1. Attempt to read each file via `invoke("read_file", ...)`
2. If the read fails, skip the tab silently
3. If the active tab was skipped, activate the next available tab

### 14.3 Workspace File Locked / Write Failure

If saving fails (disk full, permissions, etc.):
1. Log error to console
2. Keep `isDirty = true` so the next auto-save retry will try again
3. On app close, show a warning dialog: "Failed to save workspace state. Close anyway?"

### 14.4 Project Directory Deleted

If a recent project's directory no longer exists:
1. Mark `exists: false` in recent projects (checked lazily)
2. Show the entry grayed out in the recent projects list
3. Clicking it shows a "Directory not found" message with option to remove

### 14.5 Concurrent Instances (Future Multi-Window)

If two windows try to write the same workspace file:
1. Last-write-wins (acceptable for single-window phase)
2. For multi-window: use file locking or a shared IPC channel (deferred to Phase 5)

### 14.6 Very Large Message History

Conversation messages can accumulate significantly. Apply limits:
- Persist at most the **last 500 messages** per workspace
- Older messages are trimmed on save (not during the session)
- Tool call `inputJson` is truncated to 10KB per entry on save

---

## 15. Performance Considerations

### 15.1 Auto-Save Debouncing

The 2-second debounce on auto-save is critical. Without it, every keystroke in the editor (which updates `editorStore.tabs[].content`) would trigger a workspace save. The debounce ensures at most one save per 2 seconds of activity.

Additionally, the conversation store subscriber should only trigger on `messages.length` changes, not on every streaming delta (which fires hundreds of times per second).

### 15.2 Workspace File Size

Expected workspace file sizes:
- Layout: ~500 bytes
- Editor tabs (20 tabs, no content): ~3 KB
- Chat messages (500 messages, truncated tool calls): ~200 KB
- Agents (10 agents with timelines): ~50 KB
- Terminal configs: ~500 bytes
- **Total: ~250 KB typical, ~1 MB worst case**

This is small enough for synchronous file I/O without blocking the UI.

### 15.3 Tab Content Re-Reading

On workspace open, re-reading file content for 20 tabs means 20 `read_file` IPC calls. These should be issued in parallel (via `Promise.all`) and complete in under 100ms on SSD.

---

## 16. Testing Strategy

### Unit Tests

- Workspace state serialization/deserialization round-trips
- Path encoding produces valid filenames
- Store `resetToDefaults()` actually resets all fields
- Migration from localStorage produces valid workspace state
- Corrupt file handling (JSON parse failure, missing fields, wrong version)
- Message/agent serialization edge cases (empty arrays, null fields)

### Integration Tests

- Open folder -> workspace file created
- Close app -> workspace file updated
- Reopen same folder -> state restored (tabs, layout, messages)
- Switch projects -> old state saved, new state loaded
- Delete a file, reopen workspace -> tab gracefully skipped

### E2E Tests (Playwright)

- Open folder from welcome screen -> title bar updates
- Recent projects list shows previously opened project
- Switch projects -> tabs change, sidebar state changes

---

## 17. Open Questions

1. **Should workspace state include scroll positions per editor tab?** Monaco's `saveViewState()` API returns an opaque object. We could serialize it, but it is version-coupled to Monaco. **Recommendation:** Store only cursor line/column and scroll-top line number.

2. **Should chat messages persist thinking text?** It can be very large (100KB+ per message). **Recommendation:** No -- strip on save, accept that expanded thinking is lost across restarts.

3. **Should there be a "workspace settings" concept (like VS Code's `.vscode/settings.json`)?** For example, per-project tab size overrides. **Recommendation:** Defer to a later phase. The settings store is simple and global-only is fine for now.

4. **Should terminal scrollback be persisted?** xterm.js can serialize its buffer, but it is large and version-coupled. **Recommendation:** No -- just store the terminal tab name, shell type, and cwd. Spawn fresh shells on restore.
