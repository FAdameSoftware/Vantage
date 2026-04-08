/**
 * Workspace Model — Type Definitions
 *
 * Defines the shape of per-project workspace state that gets persisted
 * to ~/.vantage/workspaces/<encoded-path>.json.
 *
 * These types are the serialization format — they differ from the live
 * Zustand store types in important ways (no file content, no transient
 * streaming state, running agents downgraded to idle, etc.).
 */

// ─── Top-level workspace file ──────────────────────────────────────

export interface WorkspaceFile {
  /** Schema version for forward-compatible migrations */
  version: 1;
  /** Absolute path to the project root directory (forward-slash normalized) */
  projectPath: string;
  /** ISO 8601 timestamp of last save */
  lastSavedAt: string;

  layout: WorkspaceLayout;
  editor: WorkspaceEditorState;
  chat: WorkspaceChatState;
  agents: WorkspaceAgentState;
  agentConversations?: WorkspaceAgentConversationsState;
  mergeQueue?: WorkspaceMergeQueueState;
  verification?: WorkspaceVerificationState;
  terminal: WorkspaceTerminalState;
}

// ─── Layout (workspace-scoped portion of layout store) ─────────────

export interface WorkspaceLayout {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
  activeActivityBarItem: "explorer" | "search" | "git" | "agents" | "usage" | "plugins" | "settings";
  primarySidebarSize: number;
  secondarySidebarSize: number;
  panelSize: number;
  /** @deprecated Kept for migration from old workspace files */
  primarySidebarPixelWidth?: number;
  /** @deprecated Kept for migration from old workspace files */
  secondarySidebarPixelWidth?: number;
  /** Persisted percentage-based layout for outer horizontal group [primarySidebar, center, rightPanel] */
  horizontalLayout?: number[];
  /** Persisted percentage-based layout for center vertical group [editor, bottomPanel] */
  verticalLayout?: number[];
  activePanelTab: "terminal" | "browser" | "verification";
  agentsViewMode: "kanban" | "tree";
  previewUrl: string | null;
  previewActive: boolean;
  /** Active view mode — "claude" (chat-first) or "ide" (traditional editor) */
  viewMode?: "claude" | "ide";
}

// ─── Editor tabs ───────────────────────────────────────────────────

export interface WorkspaceEditorState {
  /** Ordered list of open tabs (content NOT stored — re-read from disk) */
  tabs: WorkspaceTabEntry[];
  /** ID of the active tab (null if no tabs) */
  activeTabId: string | null;
  /** Set of tab IDs with markdown preview active */
  markdownPreviewTabIds: string[];
}

export interface WorkspaceTabEntry {
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

// ─── Chat / Conversation ───────────────────────────────────────────

export interface WorkspaceChatState {
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

export interface SerializedMessage {
  id: string;
  role: "user" | "assistant" | "system" | "result";
  text: string;
  /** Tool calls (thinking text is NOT persisted — ephemeral, potentially large) */
  toolCalls: SerializedToolCall[];
  model?: string;
  timestamp: number;
  parentToolUseId: string | null;
}

export interface SerializedToolCall {
  id: string;
  name: string;
  /** Stringified input (not parsed object — avoids re-serialization issues) */
  inputJson: string;
  output?: string;
  isError?: boolean;
}

// ─── Agents ────────────────────────────────────────────────────────

export interface WorkspaceAgentState {
  /** Serialized agents (running agents become "idle" on restore) */
  agents: SerializedAgent[];
  /** Column ordering */
  columnOrder: Record<"backlog" | "in_progress" | "review" | "done", string[]>;
}

export interface SerializedAgent {
  id: string;
  name: string;
  /** Persisted status — running agents become "idle" on restore */
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

// ─── Agent Conversations ──────────────────────────────────────────

export interface WorkspaceAgentConversationsState {
  /** Per-agent conversations, keyed by agent ID */
  conversations: Record<string, SerializedAgentConversation>;
}

export interface SerializedAgentConversation {
  messages: SerializedMessage[];
  totalCost: number;
  totalTokens: { input: number; output: number };
}

// ─── Terminal ──────────────────────────────────────────────────────

// ─── Merge Queue ──────────────────────────────────────────────────

export interface WorkspaceMergeQueueState {
  entries: {
    id: string;
    agentId: string;
    agentName: string;
    branchName: string;
    worktreePath: string;
    status: string;
    position: number;
    addedAt: number;
    mergedAt?: number;
  }[];
  defaultGates: { name: string; command: string }[];
}

// ─── Verification ─────────────────────────────────────────────────

export interface WorkspaceVerificationState {
  agents: Record<string, {
    agentId: string;
    agentName: string;
    worktreePath: string;
    checks: {
      name: string;
      command: string;
      status: string;
      exitCode?: number;
      durationMs?: number;
      lastRunAt?: number;
    }[];
    overallStatus: string;
    lastRunAt?: number;
  }>;
}

// ─── Terminal ─────────────────────────────────────────────────────

export interface WorkspaceTerminalState {
  /** Terminal tab configurations (not the PTY state — that cannot be serialized) */
  tabs: WorkspaceTerminalTab[];
  /** ID of the active terminal tab */
  activeTabId: string | null;
}

export interface WorkspaceTerminalTab {
  id: string;
  name: string;
  /** Shell type (bash, powershell, cmd) */
  shellType?: string;
  /** Working directory at time of save */
  cwd: string;
}

// ─── Recent Projects ───────────────────────────────────────────────

export interface RecentProject {
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

export interface RecentProjectsFile {
  version: 1;
  projects: RecentProject[];
}

// ─── Default factory ───────────────────────────────────────────────

/** Create a default workspace state for a new project. */
export function createDefaultWorkspaceFile(projectPath: string): WorkspaceFile {
  return {
    version: 1,
    projectPath,
    lastSavedAt: new Date().toISOString(),
    layout: {
      primarySidebarVisible: true,
      secondarySidebarVisible: true,
      panelVisible: true,
      activeActivityBarItem: "explorer",
      primarySidebarSize: 20,
      secondarySidebarSize: 25,
      panelSize: 30,
      activePanelTab: "terminal",
      agentsViewMode: "kanban",
      previewUrl: null,
      previewActive: false,
    },
    editor: {
      tabs: [],
      activeTabId: null,
      markdownPreviewTabIds: [],
    },
    chat: {
      lastSessionId: null,
      lastCliSessionId: null,
      messages: [],
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
    },
    agents: {
      agents: [],
      columnOrder: {
        backlog: [],
        in_progress: [],
        review: [],
        done: [],
      },
    },
    agentConversations: {
      conversations: {},
    },
    terminal: {
      tabs: [],
      activeTabId: null,
    },
  };
}
