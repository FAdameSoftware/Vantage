# Vantage Phase 5: P1 Differentiating Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the P1 features that differentiate Vantage from existing Claude Code GUIs -- multi-agent orchestration, kanban board, worktree isolation, project-wide search, CLAUDE.md editor, and MCP management.

**Architecture:** Multi-agent orchestration uses the existing Claude process manager with per-agent git worktrees. An agents store coordinates state across sessions. Kanban board uses dnd-kit for drag-and-drop. Search shells out to ripgrep for performance. MCP management reads/writes JSON config files.

**Tech Stack:** dnd-kit (already installed), git worktrees, ripgrep, Monaco Editor (for CLAUDE.md), react-markdown (already installed), Tauri notifications plugin

---

### Task 1: Agents Store + Multi-Session Infrastructure

**Files:**
- Create: `src/stores/agents.ts`
- Modify: `src/stores/conversation.ts`
- Modify: `src/lib/protocol.ts`
- Modify: `src/hooks/useClaude.ts`

This task creates the foundational Zustand store for managing multiple concurrent Claude agents. The current conversation store (`src/stores/conversation.ts`) handles a single session -- messages, streaming state, pending permissions -- all as top-level fields. For multi-agent support, we need an agents store that tracks each agent's metadata (name, status, worktree, task, cost) and a way for the existing conversation infrastructure to route events to the correct agent's conversation state. The agents store is the central coordination point for all subsequent P1 features.

The existing `SessionManager` in Rust (`src-tauri/src/claude/session.rs`) already supports multiple concurrent processes via a `HashMap<String, ClaudeProcess>`. The existing `useClaude` hook (`src/hooks/useClaude.ts`) already listens to Tauri events like `claude_message`, `claude_permission_request`, and `claude_status`. The current gap is that event payloads need a `sessionId` field so the frontend can route them to the correct agent's state, and the conversation store needs to support per-agent message arrays.

- [ ] **Step 1: Create the agents Zustand store**

Create `src/stores/agents.ts`. This is the core data structure for multi-agent orchestration. Every other P1 feature reads from this store.

```typescript
import { create } from "zustand";

// ── Agent status lifecycle ──────────────────────────────────────────

export type AgentStatus =
  | "idle"
  | "working"
  | "waiting_permission"
  | "reviewing"
  | "completed"
  | "error"
  | "stalled";

// ── Kanban column ───────────────────────────────────────────────────

export type KanbanColumn = "backlog" | "in_progress" | "review" | "done";

// ── Agent color assignment (for file ownership dots) ────────────────

const AGENT_COLORS = [
  "var(--color-blue)",
  "var(--color-green)",
  "var(--color-peach)",
  "var(--color-mauve)",
  "var(--color-pink)",
  "var(--color-teal)",
  "var(--color-yellow)",
  "var(--color-flamingo)",
  "var(--color-sky)",
  "var(--color-lavender)",
] as const;

// ── Timeline event (for agent timeline view, Task 4) ────────────────

export interface AgentTimelineEvent {
  id: string;
  timestamp: number;
  type: "file_read" | "file_edit" | "bash_command" | "thinking" | "tool_call" | "error" | "permission" | "message";
  summary: string;
  detail?: string;
  /** Tool name, if applicable */
  toolName?: string;
  /** File path, if applicable */
  filePath?: string;
}

// ── Agent definition ────────────────────────────────────────────────

export interface Agent {
  /** Unique agent ID (UUID) */
  id: string;
  /** Human-readable name (e.g., "Backend Agent", "Test Writer") */
  name: string;
  /** Current status in the lifecycle */
  status: AgentStatus;
  /** The internal session ID from SessionManager (maps to ClaudeProcess) */
  sessionId: string | null;
  /** Git worktree path for this agent (null if using main working tree) */
  worktreePath: string | null;
  /** Git branch name for this agent's worktree */
  branchName: string | null;
  /** Files this agent has read or modified (tracked from tool call events) */
  assignedFiles: string[];
  /** Task description -- what this agent is working on */
  taskDescription: string;
  /** Kanban column for the board */
  column: KanbanColumn;
  /** Cumulative cost in USD for this agent's session */
  cost: number;
  /** Cumulative token counts */
  tokens: { input: number; output: number };
  /** When this agent was created */
  createdAt: number;
  /** When this agent last had activity */
  lastActivityAt: number;
  /** Assigned color (CSS variable) for file ownership visualization */
  color: string;
  /** Model being used (e.g., "claude-sonnet-4-20250514") */
  model?: string;
  /** Chronological event log */
  timeline: AgentTimelineEvent[];
  /** Error message, if status is "error" */
  errorMessage?: string;
}

// ── Store state and actions ─────────────────────────────────────────

export interface AgentsState {
  /** All agents, keyed by agent ID */
  agents: Map<string, Agent>;

  /** Ordered list of agent IDs per kanban column (for drag-and-drop ordering) */
  columnOrder: Record<KanbanColumn, string[]>;

  /** Maximum concurrent agents allowed */
  maxConcurrentAgents: number;

  // ── CRUD actions ──

  /** Create a new agent and add to backlog */
  createAgent: (params: {
    name: string;
    taskDescription: string;
    model?: string;
  }) => string; // returns agent ID

  /** Remove an agent entirely (should stop session first) */
  removeAgent: (agentId: string) => void;

  /** Update an agent's status */
  updateAgentStatus: (agentId: string, status: AgentStatus, errorMessage?: string) => void;

  /** Link a Claude session to an agent */
  linkSession: (agentId: string, sessionId: string) => void;

  /** Link a worktree to an agent */
  linkWorktree: (agentId: string, worktreePath: string, branchName: string) => void;

  /** Update cost and token tracking for an agent */
  updateAgentCost: (agentId: string, cost: number, tokens: { input: number; output: number }) => void;

  /** Track a file that an agent is reading or modifying */
  trackFile: (agentId: string, filePath: string) => void;

  /** Add a timeline event to an agent */
  addTimelineEvent: (agentId: string, event: Omit<AgentTimelineEvent, "id" | "timestamp">) => void;

  /** Move an agent to a different kanban column */
  moveAgent: (agentId: string, toColumn: KanbanColumn, toIndex?: number) => void;

  /** Reorder agents within a column (for drag-and-drop) */
  reorderInColumn: (column: KanbanColumn, orderedIds: string[]) => void;

  // ── Queries ──

  /** Get all agents as an array */
  getAgentsList: () => Agent[];

  /** Get agents in a specific column, in order */
  getAgentsInColumn: (column: KanbanColumn) => Agent[];

  /** Get the agent associated with a session ID */
  getAgentBySessionId: (sessionId: string) => Agent | undefined;

  /** Get agents that have modified a specific file (for conflict detection) */
  getAgentsForFile: (filePath: string) => Agent[];

  /** Get the count of currently active (working/waiting) agents */
  getActiveAgentCount: () => number;

  /** Check if a file is touched by multiple agents (conflict) */
  hasFileConflict: (filePath: string) => boolean;
}
```

Implement the store with `create<AgentsState>()((set, get) => ({ ... }))`.

Key implementation details:

- `createAgent`: Generate a UUID with `crypto.randomUUID()`. Assign a color from `AGENT_COLORS` using `agents.size % AGENT_COLORS.length`. Initialize with `column: "backlog"`, `status: "idle"`, `sessionId: null`, `worktreePath: null`, empty `assignedFiles` and `timeline`. Append the new ID to `columnOrder.backlog`. Return the new agent ID.

- `removeAgent`: Delete from the `agents` map. Remove the ID from whichever `columnOrder` array it appears in.

- `updateAgentStatus`: Set `agent.status` and `agent.lastActivityAt = Date.now()`. If transitioning to `"error"`, store the optional `errorMessage`.

- `linkSession`: Set `agent.sessionId` to the given value.

- `linkWorktree`: Set `agent.worktreePath` and `agent.branchName`.

- `updateAgentCost`: Increment `agent.cost` and `agent.tokens`.

- `trackFile`: Add the file path to `agent.assignedFiles` if not already present. Update `lastActivityAt`.

- `addTimelineEvent`: Create the event with `id: crypto.randomUUID()` and `timestamp: Date.now()`. Append to `agent.timeline`. Update `lastActivityAt`.

- `moveAgent`: Remove the agent ID from its current column in `columnOrder`. Insert into the target column at `toIndex` (or append if not specified). Update `agent.column`. If moving to `"in_progress"`, set status to `"working"`. If moving to `"done"`, set status to `"completed"`.

- `reorderInColumn`: Replace `columnOrder[column]` with the new ordered array.

- `getAgentsList`: Return `[...agents.values()]`.

- `getAgentsInColumn`: Map `columnOrder[column]` IDs to agents from the map, filtering out any undefined (defensive).

- `getAgentBySessionId`: Find the agent whose `sessionId` matches.

- `getAgentsForFile`: Filter all agents whose `assignedFiles` includes the given path.

- `getActiveAgentCount`: Count agents with status `"working"` or `"waiting_permission"`.

- `hasFileConflict`: Return `getAgentsForFile(filePath).length > 1`.

Initialize `columnOrder` as:
```typescript
columnOrder: {
  backlog: [],
  in_progress: [],
  review: [],
  done: [],
},
```

Initialize `maxConcurrentAgents` to `3`.

- [ ] **Step 2: Add sessionId to Tauri event payloads**

The Rust side already emits events like `claude_message` and `claude_permission_request`. Currently the frontend listens globally and routes everything to a single conversation store. For multi-agent, every event payload must include the `session_id` so the frontend can route to the correct agent.

Modify `src-tauri/src/claude/protocol.rs`:

Check the existing `ClaudeEventPayload` struct. It should already include a `session_id` field (it was designed for multi-session). If not, add `pub session_id: String` to `ClaudeEventPayload` and `PermissionRequestPayload`.

Verify that `src-tauri/src/claude/process.rs` includes the session ID when emitting events via `app_handle.emit(...)`. The `ClaudeProcess::spawn` method already receives a `session_id` parameter -- ensure this is passed through to all emitted event payloads.

Modify `src/lib/protocol.ts`:

Ensure the TypeScript types for `ClaudeEventPayload` and `PermissionRequestPayload` include `session_id: string`. Check the existing definitions -- if they already have this field, no changes needed.

- [ ] **Step 3: Create per-agent conversation state management**

The current `useConversationStore` at `src/stores/conversation.ts` is a single flat store. For multi-agent, we have two options:

**Option A (recommended): Agent-keyed conversation map inside the agents store.**

Add to `src/stores/agents.ts` a separate slice for per-agent conversations, or create a lightweight companion store:

Create a helper file `src/stores/agentConversations.ts`:

```typescript
import { create } from "zustand";
import type { ConversationMessage, SessionMetadata, ResultSummary, ActiveBlock } from "@/stores/conversation";
import type { ConnectionStatus } from "@/stores/conversation";

export interface AgentConversationState {
  messages: ConversationMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStartedAt: number | null;
  activeBlocks: Map<number, ActiveBlock>;
  activeMessageId: string | null;
  session: SessionMetadata | null;
  totalCost: number;
  totalTokens: { input: number; output: number };
  lastResult: ResultSummary | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
}

const createDefaultState = (): AgentConversationState => ({
  messages: [],
  isStreaming: false,
  isThinking: false,
  thinkingStartedAt: null,
  activeBlocks: new Map(),
  activeMessageId: null,
  session: null,
  totalCost: 0,
  totalTokens: { input: 0, output: 0 },
  lastResult: null,
  connectionStatus: "disconnected",
  connectionError: null,
});

interface AgentConversationsStore {
  /** Per-agent conversation state, keyed by agent ID */
  conversations: Map<string, AgentConversationState>;

  /** Get or create conversation state for an agent */
  getConversation: (agentId: string) => AgentConversationState;

  /** Set conversation state for an agent (used by event handlers) */
  updateConversation: (agentId: string, updater: (prev: AgentConversationState) => Partial<AgentConversationState>) => void;

  /** Remove conversation state when an agent is deleted */
  removeConversation: (agentId: string) => void;
}

export const useAgentConversationsStore = create<AgentConversationsStore>()((set, get) => ({
  conversations: new Map(),

  getConversation: (agentId) => {
    const existing = get().conversations.get(agentId);
    if (existing) return existing;
    const fresh = createDefaultState();
    set((state) => {
      const next = new Map(state.conversations);
      next.set(agentId, fresh);
      return { conversations: next };
    });
    return fresh;
  },

  updateConversation: (agentId, updater) => {
    set((state) => {
      const current = state.conversations.get(agentId) ?? createDefaultState();
      const updates = updater(current);
      const next = new Map(state.conversations);
      next.set(agentId, { ...current, ...updates });
      return { conversations: next };
    });
  },

  removeConversation: (agentId) => {
    set((state) => {
      const next = new Map(state.conversations);
      next.delete(agentId);
      return { conversations: next };
    });
  },
}));
```

This keeps the existing `useConversationStore` intact for the primary (non-agent) session and provides parallel per-agent state for multi-agent sessions.

- [ ] **Step 4: Update useClaude hook to support multi-agent event routing**

Modify `src/hooks/useClaude.ts` to handle session-routed events.

The current `useClaude` hook listens to `claude_message` events and dispatches to the single conversation store. For multi-agent, it needs to:

1. Check if the event's `session_id` matches any agent's `sessionId` in the agents store.
2. If it matches an agent, route the event to `useAgentConversationsStore.updateConversation(agentId, ...)` using the same delta accumulation logic.
3. If it does not match any agent (i.e., it is the primary session), continue dispatching to `useConversationStore` as before.
4. For agent events, also update the agents store: set status to `"working"` on `stream_event`, set `"waiting_permission"` on `permission_request`, extract cost from `result` messages.

Add a new helper function at the top of the file:

```typescript
import { useAgentConversationsStore } from "@/stores/agentConversations";
import { useAgentsStore } from "@/stores/agents";

function routeAgentEvent(sessionId: string, handler: (agentId: string) => void): boolean {
  const agent = useAgentsStore.getState().getAgentBySessionId(sessionId);
  if (agent) {
    handler(agent.id);
    return true;
  }
  return false;
}
```

In the `claude_message` listener, before the existing switch statement, extract the session ID from the payload. If `routeAgentEvent` returns true, handle the event through the agent conversation store instead. The delta accumulation logic (from `handleStreamEvent`, `handleAssistantMessage`, `handleResult`) needs to be refactored into pure functions that can be called with either the global store or the agent conversation store.

For timeline tracking: when a `stream_event` with `content_block_start` of type `tool_use` arrives for an agent, call `addTimelineEvent` with the tool name. When a `result` arrives, call `updateAgentCost`.

Do NOT remove or break the existing single-session flow. The primary chat panel should continue working exactly as it does today. Multi-agent routing is additive.

- [ ] **Step 5: Add agent-aware actions to the useClaude hook**

Add new exported functions from `useClaude`:

```typescript
/** Start a session specifically for an agent */
const startAgentSession = useCallback(
  async (agentId: string, cwd: string) => {
    const agentsStore = useAgentsStore.getState();
    agentsStore.updateAgentStatus(agentId, "working");

    try {
      const sessionId = await invoke<string>("claude_start_session", {
        cwd,
        sessionId: null,
        resume: false,
      });
      agentsStore.linkSession(agentId, sessionId);
    } catch (err) {
      agentsStore.updateAgentStatus(agentId, "error", String(err));
    }
  },
  []
);

/** Send a message to a specific agent's session */
const sendAgentMessage = useCallback(
  async (agentId: string, content: string) => {
    const agent = useAgentsStore.getState().agents.get(agentId);
    if (!agent?.sessionId) return;

    useAgentConversationsStore.getState().updateConversation(agentId, (prev) => ({
      messages: [...prev.messages, {
        id: crypto.randomUUID(),
        role: "user" as const,
        text: content,
        thinking: "",
        toolCalls: [],
        timestamp: Date.now(),
        parentToolUseId: null,
      }],
    }));

    try {
      await invoke("claude_send_message", {
        sessionId: agent.sessionId,
        content,
      });
    } catch (err) {
      useAgentsStore.getState().updateAgentStatus(agentId, "error", String(err));
    }
  },
  []
);

/** Stop an agent's session */
const stopAgentSession = useCallback(
  async (agentId: string) => {
    const agent = useAgentsStore.getState().agents.get(agentId);
    if (!agent?.sessionId) return;

    try {
      await invoke("claude_stop_session", { sessionId: agent.sessionId });
    } catch {
      // Session may already be dead
    }

    useAgentsStore.getState().updateAgentStatus(agentId, "completed");
    useAgentsStore.getState().linkSession(agentId, "");
  },
  []
);
```

Return these new functions alongside the existing ones:

```typescript
return {
  startSession,
  sendMessage,
  respondPermission,
  interruptSession,
  stopSession,
  sessionId: sessionIdRef,
  // Multi-agent
  startAgentSession,
  sendAgentMessage,
  stopAgentSession,
};
```

**Acceptance criteria:**
- Agents store can create, update, and remove agents
- Each agent has a unique color, ID, and tracks its own files and timeline
- Kanban column ordering is maintained
- Events from agent sessions route to the correct agent's conversation state
- The existing primary session (non-agent) continues working unchanged
- Agent cost and status updates automatically from session events

---

### Task 2: Git Worktree Management (Rust)

**Files:**
- Create: `src-tauri/src/worktree.rs`
- Modify: `src-tauri/src/lib.rs`

This task adds git worktree commands to the Rust backend. Each agent gets its own isolated worktree so it can make changes without interfering with other agents or the main working directory. Worktrees share the `.git/objects` database (space-efficient) but have independent working directories, indexes, and HEAD refs. On Windows, worktrees must be on the same NTFS volume as the main repository -- the commands validate this.

The implementation shells out to `git.exe` rather than using the `git2` crate, consistent with the existing `src-tauri/src/git.rs` module which already uses `Command::new("git")`. This avoids adding the heavy `git2` dependency and ensures compatibility with all git features including worktrees.

- [ ] **Step 1: Create the worktree Rust module**

Create `src-tauri/src/worktree.rs`:

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeInfo {
    /// Absolute path to the worktree directory
    pub path: String,
    /// Branch name checked out in this worktree
    pub branch: Option<String>,
    /// HEAD commit hash
    pub head: String,
    /// Whether this is the main worktree
    pub is_main: bool,
    /// Whether the worktree is locked
    pub is_locked: bool,
    /// Disk usage in bytes (0 if not calculated)
    pub disk_usage_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeCreateResult {
    /// Path to the newly created worktree
    pub path: String,
    /// Branch name
    pub branch: String,
}
```

Implement these public functions (all shell out to `git.exe` via `std::process::Command`):

| Function | Git Command | Notes |
|----------|-------------|-------|
| `create_worktree(repo_path, branch_name, worktree_path)` | `git worktree add -b {branch} {path} HEAD` | Validate same-volume on Windows (compare drive letters). If branch exists, retry without `-b`. |
| `list_worktrees(repo_path)` | `git worktree list --porcelain` | Parse porcelain output: blocks separated by blank lines, extract `worktree`, `HEAD`, `branch` (strip `refs/heads/`), `locked` fields. First entry is `is_main: true`. |
| `remove_worktree(repo_path, worktree_path, force)` | `git worktree remove {path} [--force]` | Force flag removes even with uncommitted changes. |
| `get_worktree_disk_usage(path)` | Rust `std::fs` recursive walk | Sum `metadata.len()` for all files, skip `.git` file. |
| `validate_same_volume(path_a, path_b)` | N/A (Rust path logic) | On Windows: compare drive letter prefixes. On non-Windows: always true. |
| `get_worktree_changes(worktree_path)` | `git diff --name-only HEAD` + `git diff --name-only --cached HEAD` | Combine and deduplicate both lists. |

- [ ] **Step 2: Register worktree commands in lib.rs**

Modify `src-tauri/src/lib.rs`:

1. Add `mod worktree;` at the top, alongside the existing `mod claude;`, `mod files;`, etc.

2. Create Tauri command wrappers:

```rust
// ── Worktree Commands ──────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
fn create_worktree(
    repo_path: String,
    branch_name: String,
    worktree_path: String,
) -> Result<worktree::WorktreeCreateResult, String> {
    worktree::create_worktree(&repo_path, &branch_name, &worktree_path)
}

#[tauri::command]
#[specta::specta]
fn list_worktrees(repo_path: String) -> Result<Vec<worktree::WorktreeInfo>, String> {
    worktree::list_worktrees(&repo_path)
}

#[tauri::command]
#[specta::specta]
fn remove_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    worktree::remove_worktree(&repo_path, &worktree_path, force)
}

#[tauri::command]
#[specta::specta]
fn get_worktree_disk_usage(worktree_path: String) -> Result<u64, String> {
    worktree::get_worktree_disk_usage(&worktree_path)
}

#[tauri::command]
#[specta::specta]
fn get_worktree_changes(worktree_path: String) -> Result<Vec<String>, String> {
    worktree::get_worktree_changes(&worktree_path)
}
```

3. Add all five commands to the `tauri_specta::collect_commands!` macro invocation in the `run()` function:

```rust
tauri_specta::collect_commands![
    // ... existing commands ...
    create_worktree,
    list_worktrees,
    remove_worktree,
    get_worktree_disk_usage,
    get_worktree_changes,
],
```

- [ ] **Step 3: Add worktree path generation helper**

Add a utility function to `src-tauri/src/worktree.rs` that generates a standard worktree path for Vantage agents:

```rust
/// Generate a worktree path for an agent.
/// Places worktrees in a `.vantage-worktrees/` directory adjacent to the repo.
///
/// Example: repo at C:/Projects/myapp -> C:/Projects/.vantage-worktrees/agent-backend-1234
pub fn agent_worktree_path(repo_path: &str, agent_name: &str, agent_id: &str) -> String {
    let repo = Path::new(repo_path);
    let parent = repo.parent().unwrap_or(repo);
    let sanitized_name = agent_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>();
    let short_id = &agent_id[..8.min(agent_id.len())];
    let worktree_dir = parent.join(".vantage-worktrees").join(format!("{}-{}", sanitized_name, short_id));
    worktree_dir.to_string_lossy().to_string()
}

/// Generate a branch name for an agent worktree.
/// Format: vantage/agent-name-shortid
pub fn agent_branch_name(agent_name: &str, agent_id: &str) -> String {
    let sanitized_name = agent_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>();
    let short_id = &agent_id[..8.min(agent_id.len())];
    format!("vantage/{}-{}", sanitized_name, short_id)
}
```

Also expose these as Tauri commands:

```rust
#[tauri::command]
#[specta::specta]
fn get_agent_worktree_path(repo_path: String, agent_name: String, agent_id: String) -> String {
    worktree::agent_worktree_path(&repo_path, &agent_name, &agent_id)
}

#[tauri::command]
#[specta::specta]
fn get_agent_branch_name(agent_name: String, agent_id: String) -> String {
    worktree::agent_branch_name(&agent_name, &agent_id)
}
```

Add these to `collect_commands!` as well.

**Acceptance criteria:**
- `create_worktree` creates a new git worktree with a new branch at the specified path
- `list_worktrees` returns all worktrees with branch, HEAD hash, and lock status
- `remove_worktree` cleans up a worktree (with optional force)
- Same-volume validation prevents cross-drive worktree creation on Windows
- Disk usage calculation works for worktree directories
- `get_worktree_changes` returns modified files in a worktree
- Agent-specific path and branch name generators produce clean, unique names
- All commands are registered with tauri-specta and generate TypeScript bindings

---

### Task 3: Agent Kanban Board

**Files:**
- Create: `src/components/agents/KanbanBoard.tsx`
- Create: `src/components/agents/AgentCard.tsx`
- Create: `src/components/agents/CreateAgentDialog.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx`

This task implements the visual kanban board for managing agents. It has four columns (Backlog, In Progress, Review, Done) with draggable agent cards. Each card shows the agent's name, task, status, file count, and cost. The board uses `@dnd-kit/core` and `@dnd-kit/sortable` (already in `package.json` dependencies from Phase 1 setup) for drag-and-drop between columns and within columns. A "Create Agent" button opens a dialog for configuring a new agent. Clicking a card navigates to the agent's detail view (timeline + conversation, built in Task 4).

- [ ] **Step 1: Install dnd-kit if not already present**

Check if `@dnd-kit/core` and `@dnd-kit/sortable` are in `package.json`. They were listed in the tech stack but may not have been installed yet. If missing, install them:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Verify the install succeeded by checking `node_modules/@dnd-kit/core` exists.

- [ ] **Step 2: Create the AgentCard component**

Create `src/components/agents/AgentCard.tsx`.

This component renders a single agent as a kanban card. It uses `useSortable` from `@dnd-kit/sortable` so it can be dragged between columns and reordered within a column.

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bot, AlertCircle, Clock, FileCode, DollarSign, Loader2, CheckCircle2, Pause } from "lucide-react";
import type { Agent, AgentStatus } from "@/stores/agents";
```

**Props:**
```typescript
interface AgentCardProps {
  agent: Agent;
  onClick: (agentId: string) => void;
}
```

**Visual design:**
- Card background: `var(--color-surface-0)` with a 2px left border in the agent's assigned color.
- Card layout: vertical stack.
  - **Top row**: Agent name (bold, truncated) + status icon (right-aligned).
  - **Middle**: Task description (2 lines max, text-xs, `var(--color-subtext-1)`).
  - **Bottom row**: Three badges in a horizontal flex:
    - File count: `<FileCode size={12} />` + `agent.assignedFiles.length`
    - Cost: `<DollarSign size={12} />` + `$${agent.cost.toFixed(2)}`
    - Elapsed time: `<Clock size={12} />` + formatted duration since `createdAt`
- If status is `"waiting_permission"` or `"error"`, show an attention badge: a small colored dot (red for error, yellow for permission) in the top-right corner of the card.

**Status icons mapping:**

| Status | Icon | Color |
|--------|------|-------|
| `idle` | `<Pause size={14} />` | `var(--color-overlay-1)` |
| `working` | `<Loader2 size={14} className="animate-spin" />` | `var(--color-blue)` |
| `waiting_permission` | `<AlertCircle size={14} />` | `var(--color-yellow)` |
| `reviewing` | `<Clock size={14} />` | `var(--color-peach)` |
| `completed` | `<CheckCircle2 size={14} />` | `var(--color-green)` |
| `error` | `<AlertCircle size={14} />` | `var(--color-red)` |
| `stalled` | `<AlertCircle size={14} />` | `var(--color-peach)` |

**Drag behavior:**
- Use `useSortable({ id: agent.id, data: { type: "agent", agent } })`.
- Apply `transform` and `transition` styles from `useSortable` via `CSS.Transform.toString(transform)`.
- Set `opacity: 0.5` when `isDragging` is true.
- The card's outer div gets `ref={setNodeRef}`, `style={{ transform, transition, opacity }}`, and `{...attributes}` and `{...listeners}` spread on the drag handle area (the top row).

**Click behavior:**
- Click anywhere on the card (not on the drag handle) calls `onClick(agent.id)`.
- The drag handle is the top portion (agent name row). The rest of the card is clickable.
- For simplicity, make the entire card both draggable and clickable. dnd-kit differentiates between a click and a drag by movement threshold.

**Elapsed time formatting:**
Create a helper that takes a timestamp and returns a human-readable duration:
```typescript
function formatElapsed(createdAt: number): string {
  const seconds = Math.floor((Date.now() - createdAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
```

- [ ] **Step 3: Create the KanbanBoard component**

Create `src/components/agents/KanbanBoard.tsx`.

This is the main board layout with four columns and drag-and-drop orchestration.

```tsx
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useAgentsStore, type KanbanColumn } from "@/stores/agents";
import { AgentCard } from "./AgentCard";
```

**Column definitions:**

```typescript
const COLUMNS: { id: KanbanColumn; title: string; color: string }[] = [
  { id: "backlog", title: "Backlog", color: "var(--color-overlay-1)" },
  { id: "in_progress", title: "In Progress", color: "var(--color-blue)" },
  { id: "review", title: "Review", color: "var(--color-yellow)" },
  { id: "done", title: "Done", color: "var(--color-green)" },
];
```

**Layout:**
- Horizontal flex container with 4 equal-width columns.
- Each column has a header (title + count badge) and a scrollable card list.
- Column background: `var(--color-mantle)` with 1px border `var(--color-surface-0)`.
- Column header: title text in `var(--color-subtext-0)`, count badge with the column's accent color.
- A "Create Agent" button (`<Plus />` icon) in the Backlog column header.

**Droppable columns:**
Each column is a droppable zone. Use `useDroppable({ id: column.id })` to make each column a drop target.

Wrap each column's card list in `<SortableContext items={agentIds} strategy={verticalListSortingStrategy}>`.

**Drag-and-drop handlers:**

`onDragStart`: Store the active drag item ID in local state for the `DragOverlay`.

`onDragOver`: When dragging over a different column, optimistically move the agent to the new column in the store. Use the agents store's `moveAgent` action.

`onDragEnd`: Finalize the position. If the agent was dropped in a new position within the same column, call `reorderInColumn`. If dropped in a different column, the move was already done in `onDragOver`.

**DragOverlay**: Render a semi-transparent copy of the `AgentCard` being dragged, using `createPortal` to avoid z-index issues.

**Sensors configuration:**
```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }, // 8px movement before drag starts (allows clicks)
  }),
  useSensor(KeyboardSensor)
);
```

**Empty column state:**
When a column has no agents, show a dashed-border placeholder div with "No agents" text in `var(--color-overlay-1)`. Make sure the droppable zone still has a minimum height so agents can be dropped into empty columns.

- [ ] **Step 4: Create the CreateAgentDialog component**

Create `src/components/agents/CreateAgentDialog.tsx`.

This is a modal dialog for creating a new agent. It uses the shadcn Dialog component.

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
```

**Props:**
```typescript
interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Form fields:**
1. **Agent Name** (required): Text input. Placeholder: "e.g., Backend API, Test Writer, UI Refactor". Max 50 characters.
2. **Task Description** (required): Textarea. Placeholder: "Describe what this agent should work on...". Max 500 characters.
3. **Model** (optional): A simple select or text input. Options: "claude-sonnet-4-20250514" (default), "claude-opus-4-20250514". For now, just a text input with a sensible default since the model is passed to Claude CLI and new models appear frequently.

**Behavior:**
- On submit: call `useAgentsStore.getState().createAgent({ name, taskDescription, model })`.
- Close the dialog.
- Show a Sonner toast: "Agent '{name}' created in Backlog".
- Focus the name input when the dialog opens.

**Validation:**
- Name is required. Show red border and error text if empty on submit attempt.
- Task description is required. Same validation pattern.

**Style:**
- Dialog background: `var(--color-surface-0)`.
- Standard Catppuccin color scheme consistent with the PermissionDialog and other existing dialogs.

- [ ] **Step 5: Wire KanbanBoard into PrimarySidebar**

Modify `src/components/layout/PrimarySidebar.tsx`:

1. Import the `KanbanBoard` component:
   ```tsx
   import { KanbanBoard } from "@/components/agents/KanbanBoard";
   ```

2. Replace the placeholder content for the "agents" panel. Currently, the `PrimarySidebar` renders a generic placeholder paragraph when `activeItem === "agents"`. Change this to render the `KanbanBoard`:

In the content section where the existing code has:
```tsx
{activeItem === "explorer" ? (
  <FileExplorer />
) : (
  <div className="flex items-center justify-center h-full p-4">
    <p ...>{config.description}</p>
  </div>
)}
```

Change to:
```tsx
{activeItem === "explorer" ? (
  <FileExplorer />
) : activeItem === "agents" ? (
  <KanbanBoard />
) : (
  <div className="flex items-center justify-center h-full p-4">
    <p ...>{config.description}</p>
  </div>
)}
```

3. Update the agents panel config description to remove the placeholder text since we now have real content.

**Acceptance criteria:**
- Four-column kanban board renders in the Agents sidebar panel
- Agent cards display name, task, status icon, file count, cost, and elapsed time
- Cards can be dragged between columns and reordered within columns
- Moving to "In Progress" sets agent status to "working"
- Moving to "Done" sets agent status to "completed"
- "Create Agent" button opens a dialog with name, task, and model fields
- Creating an agent adds a card to the Backlog column
- Clicking a card (without dragging) is distinguishable from dragging via the 8px activation constraint

---

### Task 4: Agent Timeline View

**Files:**
- Create: `src/components/agents/AgentTimeline.tsx`
- Create: `src/components/agents/AgentDetailPanel.tsx`
- Modify: `src/components/agents/KanbanBoard.tsx`

This task builds the chronological event stream for each agent and an agent detail panel that shows the timeline alongside the agent's conversation. When a user clicks an agent card on the kanban board, the view transitions to the agent detail panel. Events are tracked in the agents store's `timeline` array (populated by the event routing from Task 1).

- [ ] **Step 1: Create the AgentTimeline component**

Create `src/components/agents/AgentTimeline.tsx`.

This component renders a vertical timeline of events for a single agent, with auto-scroll to the latest event.

```tsx
import { useEffect, useRef } from "react";
import {
  FileText,
  Pencil,
  Terminal,
  Brain,
  Wrench,
  AlertCircle,
  Shield,
  MessageSquare,
} from "lucide-react";
import type { AgentTimelineEvent } from "@/stores/agents";
```

**Props:**
```typescript
interface AgentTimelineProps {
  events: AgentTimelineEvent[];
}
```

**Layout:**
- A vertical scrollable container.
- Each event is a horizontal row with:
  - **Time column** (left, fixed 60px width): formatted as `HH:MM:SS` in `var(--color-overlay-1)`, text-xs.
  - **Icon column** (16px): event type icon, colored by type.
  - **Content column** (flex-1): summary text. If `detail` exists, the row is expandable (click to toggle detail view below the summary).
  - A thin vertical line connecting events (the "timeline spine"), rendered as a `2px` border-left on the icon column's container, color `var(--color-surface-1)`.

**Event type icons:**

| Type | Icon | Color |
|------|------|-------|
| `file_read` | `<FileText size={14} />` | `var(--color-blue)` |
| `file_edit` | `<Pencil size={14} />` | `var(--color-green)` |
| `bash_command` | `<Terminal size={14} />` | `var(--color-mauve)` |
| `thinking` | `<Brain size={14} />` | `var(--color-overlay-1)` |
| `tool_call` | `<Wrench size={14} />` | `var(--color-teal)` |
| `error` | `<AlertCircle size={14} />` | `var(--color-red)` |
| `permission` | `<Shield size={14} />` | `var(--color-yellow)` |
| `message` | `<MessageSquare size={14} />` | `var(--color-text)` |

**Auto-scroll:**
- Use a `ref` on the scroll container.
- When `events.length` changes, scroll to the bottom if the user was already at the bottom (within 50px threshold). If the user has scrolled up, do not auto-scroll (respect their position).
- Check scroll position: `container.scrollHeight - container.scrollTop - container.clientHeight < 50`.

**Expandable detail:**
- Use local state `expandedIds: Set<string>` to track which events are expanded.
- Clicking an event row toggles its ID in the set.
- When expanded, show the `detail` text below the summary in a `pre` block with `text-xs`, `var(--color-subtext-0)`, and `var(--color-surface-0)` background with rounded corners and padding.

**Empty state:**
When `events` is empty, show a centered message: "No activity yet. Start the agent to see events here."

**Time formatting:**
```typescript
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
```

- [ ] **Step 2: Create the AgentDetailPanel component**

Create `src/components/agents/AgentDetailPanel.tsx`.

This component shows a full detail view for a single agent, combining the timeline with agent metadata and controls. It replaces the kanban board view when an agent card is clicked.

```tsx
import { ArrowLeft, Play, Square, Trash2 } from "lucide-react";
import { useAgentsStore, type Agent } from "@/stores/agents";
import { AgentTimeline } from "./AgentTimeline";
```

**Props:**
```typescript
interface AgentDetailPanelProps {
  agentId: string;
  onBack: () => void;
}
```

**Layout (vertical stack):**

1. **Header bar** (h-9, same as sidebar headers):
   - Back button (`<ArrowLeft size={14} />`) that calls `onBack`.
   - Agent name (bold, truncated).
   - Agent status badge (colored pill with status text).

2. **Agent metadata section** (compact, border-bottom):
   - Task description (2-3 lines, `text-xs`).
   - Row of stats: Files touched, Cost, Tokens (input/output), Created time.
   - Worktree path (if linked, shown as a truncated path with a copy button).

3. **Action buttons** (horizontal row):
   - **Start** (`<Play />`, green): Visible when status is `idle` or `backlog`. Starts the agent session.
   - **Stop** (`<Square />`, red): Visible when status is `working` or `waiting_permission`. Stops the session.
   - **Delete** (`<Trash2 />`, red outline): Always visible. Confirms before deleting.

4. **Timeline** (flex-1, scrollable):
   - Render `<AgentTimeline events={agent.timeline} />`.

**Start agent flow:**
When the user clicks "Start":
1. If no worktree is linked, use `invoke("get_agent_worktree_path", ...)` and `invoke("create_worktree", ...)` to create one. Then `linkWorktree` in the agents store.
2. Call `startAgentSession(agentId, worktreePath)` from the `useClaude` hook (from Task 1, Step 5).
3. Move the agent to "In Progress" column.
4. Send the task description as the first message to the agent.

**Stop agent flow:**
When the user clicks "Stop":
1. Call `stopAgentSession(agentId)` from the `useClaude` hook.
2. The agent status updates to "completed" (handled in the hook).

**Delete agent flow:**
1. Show a confirmation dialog (use `window.confirm` for simplicity, or a Sonner toast with undo).
2. If confirmed, stop the session if active, remove the worktree (`invoke("remove_worktree", { repoPath, worktreePath, force: true })`), and call `removeAgent(agentId)`.
3. Call `onBack` to return to the kanban view.

- [ ] **Step 3: Integrate the detail panel with the kanban board**

Modify `src/components/agents/KanbanBoard.tsx`:

1. Add local state for the selected agent:
   ```typescript
   const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
   ```

2. When an agent card is clicked, set `selectedAgentId`.

3. Conditionally render: if `selectedAgentId` is not null, render `<AgentDetailPanel agentId={selectedAgentId} onBack={() => setSelectedAgentId(null)} />` instead of the kanban columns.

4. This creates a simple navigation pattern: kanban board -> agent detail -> back to kanban.

**Acceptance criteria:**
- Agent timeline shows chronological events with icons, timestamps, and summaries
- Events are expandable to show full detail
- Auto-scroll follows new events unless the user has scrolled up
- Agent detail panel shows metadata, controls, and timeline
- Start button creates a worktree and starts an agent session
- Stop button halts the agent session
- Delete button cleans up worktree and removes the agent
- Clicking a card on the kanban board navigates to the detail panel
- Back button returns to the kanban board

---

### Task 5: Conflict Detection

**Files:**
- Create: `src/components/agents/ConflictBanner.tsx`
- Modify: `src/components/files/FileTreeNode.tsx`
- Modify: `src/stores/agents.ts`

This task implements file ownership visualization and multi-agent overlap warnings. It is deliberately kept simple for P1 -- no Clash integration yet. Instead, we use the file tracking already built into the agents store (each agent's `assignedFiles` array) to detect when two agents have modified the same file and display warnings in the UI.

- [ ] **Step 1: Add conflict detection queries to the agents store**

The agents store from Task 1 already has `getAgentsForFile` and `hasFileConflict`. Now add a few more queries to `src/stores/agents.ts`:

```typescript
/** Get all file conflicts: files touched by more than one agent */
getConflictingFiles: () => {
  const agents = [...get().agents.values()];
  const fileCounts = new Map<string, string[]>(); // filePath -> agentIds

  for (const agent of agents) {
    for (const file of agent.assignedFiles) {
      const existing = fileCounts.get(file) ?? [];
      existing.push(agent.id);
      fileCounts.set(file, existing);
    }
  }

  const conflicts: Array<{ filePath: string; agentIds: string[] }> = [];
  for (const [filePath, agentIds] of fileCounts) {
    if (agentIds.length > 1) {
      conflicts.push({ filePath, agentIds });
    }
  }
  return conflicts;
},

/** Get the agent color for a file (first agent that owns it), or null */
getFileOwnerColor: (filePath: string) => {
  const agents = [...get().agents.values()];
  const owner = agents.find((a) => a.assignedFiles.includes(filePath));
  return owner?.color ?? null;
},

/** Get all agents that own a file, with colors */
getFileOwners: (filePath: string) => {
  const agents = [...get().agents.values()];
  return agents
    .filter((a) => a.assignedFiles.includes(filePath))
    .map((a) => ({ id: a.id, name: a.name, color: a.color }));
},
```

- [ ] **Step 2: Add agent ownership dots to the file explorer**

Modify `src/components/files/FileTreeNode.tsx`.

Currently, `FileTreeNode` renders a file or folder with an icon, name, and optionally a git status indicator. Add agent ownership dots next to the git status.

Import the agents store:
```tsx
import { useAgentsStore } from "@/stores/agents";
```

Inside the `FileTreeNode` component, query for file owners:
```typescript
const fileOwners = useAgentsStore((s) => s.getFileOwners(node.path));
const hasConflict = fileOwners.length > 1;
```

Render ownership dots after the file name (and after the git status badge, if present):

```tsx
{/* Agent ownership dots */}
{fileOwners.length > 0 && (
  <span className="flex items-center gap-0.5 ml-1 shrink-0" title={
    hasConflict
      ? `Conflict: ${fileOwners.map(o => o.name).join(", ")}`
      : `Owner: ${fileOwners[0].name}`
  }>
    {fileOwners.map((owner) => (
      <span
        key={owner.id}
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: owner.color }}
      />
    ))}
    {hasConflict && (
      <AlertTriangle size={12} style={{ color: "var(--color-yellow)" }} />
    )}
  </span>
)}
```

Import `AlertTriangle` from `lucide-react`.

The dots show at a glance which agent(s) own each file. A warning icon appears when multiple agents touch the same file.

- [ ] **Step 3: Create the ConflictBanner component**

Create `src/components/agents/ConflictBanner.tsx`.

This component renders a warning banner at the top of the kanban board when file conflicts exist.

```tsx
import { AlertTriangle } from "lucide-react";
import { useAgentsStore } from "@/stores/agents";

export function ConflictBanner() {
  const conflicts = useAgentsStore((s) => s.getConflictingFiles());

  if (conflicts.length === 0) return null;

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 text-xs rounded-md mx-2 mb-2"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-yellow) 15%, transparent)",
        border: "1px solid var(--color-yellow)",
        color: "var(--color-text)",
      }}
    >
      <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-yellow)" }} />
      <div>
        <div className="font-semibold" style={{ color: "var(--color-yellow)" }}>
          File Conflicts Detected
        </div>
        <ul className="mt-1 space-y-0.5">
          {conflicts.slice(0, 5).map((c) => {
            const agentNames = c.agentIds
              .map((id) => useAgentsStore.getState().agents.get(id)?.name ?? "Unknown")
              .join(", ");
            return (
              <li key={c.filePath}>
                <span className="font-mono">{c.filePath.split("/").pop()}</span>
                {" — "}
                <span style={{ color: "var(--color-subtext-1)" }}>{agentNames}</span>
              </li>
            );
          })}
          {conflicts.length > 5 && (
            <li style={{ color: "var(--color-subtext-1)" }}>
              ...and {conflicts.length - 5} more
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire ConflictBanner into the KanbanBoard**

Modify `src/components/agents/KanbanBoard.tsx`:

Import and render the `ConflictBanner` above the kanban columns:

```tsx
import { ConflictBanner } from "./ConflictBanner";

// Inside the KanbanBoard render:
return (
  <div className="flex flex-col h-full overflow-hidden">
    <ConflictBanner />
    <div className="flex flex-1 overflow-hidden gap-2 p-2">
      {/* ... kanban columns ... */}
    </div>
  </div>
);
```

**Acceptance criteria:**
- Files in the explorer show colored ownership dots when an agent has modified them
- A warning icon appears next to files touched by multiple agents
- Hovering ownership dots shows a tooltip with agent name(s)
- A conflict banner appears at the top of the kanban board listing conflicting files
- The conflict banner only shows when conflicts exist
- Up to 5 conflicts are listed with "and N more" for overflow

---

### Task 6: Multi-File Diff Review Panel

**Files:**
- Create: `src/components/diff/MultiFileDiffReview.tsx`
- Create: `src/components/diff/DiffFileTree.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx`
- Modify: `src/components/agents/AgentDetailPanel.tsx`

This task builds the multi-file diff review panel that shows all changed files across an agent's worktree. It has a file tree on the left showing changed files with `+N -M` counts, a diff viewer on the right for the selected file (reusing the existing `DiffViewer` component from Phase 4), and "Viewed" checkmarks to track review progress. This is accessible from the agent detail panel and represents the core review workflow for agent output.

- [ ] **Step 1: Create the DiffFileTree component**

Create `src/components/diff/DiffFileTree.tsx`.

This component renders a tree of changed files for review.

```tsx
import { Check, FileCode, ChevronRight, ChevronDown } from "lucide-react";
```

**Props:**
```typescript
interface DiffFileEntry {
  /** Relative file path */
  path: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
}

interface DiffFileTreeProps {
  files: DiffFileEntry[];
  selectedPath: string | null;
  viewedPaths: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleViewed: (path: string) => void;
}
```

**Layout:**
- A vertical scrollable list of files.
- Each row shows:
  - A checkmark button: green `<Check />` if viewed, empty circle if not. Click toggles viewed status.
  - File icon (from the existing `FileIcon` component at `src/components/files/FileIcon.tsx` if it accepts an extension, or a generic `<FileCode />`).
  - File name (bold) with parent directory path in `var(--color-subtext-0)` below it (text-xs).
  - Right-aligned diff stats: `+{additions}` in green, `-{deletions}` in red.
- Selected file row has `var(--color-surface-1)` background.
- Viewed files have `opacity: 0.6` on the row to de-emphasize.

**No directory grouping for P1** -- just a flat list sorted by path. Directory grouping can be a P2 enhancement.

- [ ] **Step 2: Create the MultiFileDiffReview component**

Create `src/components/diff/MultiFileDiffReview.tsx`.

This is the main review panel that combines the file tree with the diff viewer.

```tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffFileTree, type DiffFileEntry } from "./DiffFileTree";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { CheckCircle2 } from "lucide-react";
```

**Props:**
```typescript
interface MultiFileDiffReviewProps {
  /** Path to the worktree or repo to diff */
  worktreePath: string;
  /** Optional: base to diff against (default: HEAD) */
  baseBranch?: string;
}
```

**State:**
```typescript
const [files, setFiles] = useState<DiffFileEntry[]>([]);
const [selectedPath, setSelectedPath] = useState<string | null>(null);
const [viewedPaths, setViewedPaths] = useState<Set<string>>(new Set());
const [originalContent, setOriginalContent] = useState<string>("");
const [modifiedContent, setModifiedContent] = useState<string>("");
const [loading, setLoading] = useState(true);
```

**Loading changed files:**

On mount, call the Rust `get_worktree_changes` command to get the list of changed files. Then for each file, get diff stats by running a new Rust command (see Step 3).

For P1, a simpler approach: use `get_worktree_changes` to get the file list, and show `+0 -0` for stats initially. Diff stats can be calculated when a file is selected.

```typescript
useEffect(() => {
  async function loadChanges() {
    try {
      const changedFiles = await invoke<string[]>("get_worktree_changes", {
        worktreePath,
      });
      const entries: DiffFileEntry[] = changedFiles.map((path) => ({
        path,
        additions: 0,
        deletions: 0,
      }));
      setFiles(entries);
      if (entries.length > 0) {
        setSelectedPath(entries[0].path);
      }
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }
  loadChanges();
}, [worktreePath]);
```

**Loading diff for selected file:**

When `selectedPath` changes, load the original (HEAD) and modified (working tree) versions:

```typescript
useEffect(() => {
  if (!selectedPath) return;
  async function loadDiff() {
    try {
      // Get the HEAD version
      const original = await invoke<string>("git_show_file", {
        worktreePath,
        filePath: selectedPath,
        ref: "HEAD",
      });
      // Get the working tree version
      const modified = await invoke<{ content: string }>("read_file", {
        path: `${worktreePath}/${selectedPath}`,
      });
      setOriginalContent(original);
      setModifiedContent(modified.content);
    } catch {
      setOriginalContent("");
      setModifiedContent("");
    }
  }
  loadDiff();
}, [selectedPath, worktreePath]);
```

**Layout (horizontal split):**
- Left pane (250px, resizable): `<DiffFileTree />` with a header showing "N files changed" and a progress indicator ("M of N reviewed").
- Right pane (flex-1): The existing `DiffViewer` component from `src/components/editor/DiffViewer.tsx`, passed `originalContent` and `modifiedContent`.

**Action buttons (in the header):**
- "Accept All": Placeholder for now (will integrate with git merge in future).
- "Reject All": Placeholder.
- Progress: "Viewed: 3/7 files" counter.

**Toggle viewed:**
```typescript
const toggleViewed = useCallback((path: string) => {
  setViewedPaths((prev) => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });
}, []);
```

- [ ] **Step 3: Add git_show_file Rust command**

Modify `src-tauri/src/git.rs` to add a command that retrieves a file's content at a specific git ref:

```rust
/// Get file content at a specific git ref (e.g., HEAD, branch name, commit hash).
pub fn show_file(cwd: &str, file_path: &str, git_ref: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["show", &format!("{}:{}", git_ref, file_path)])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git show: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // File doesn't exist at that ref (new file) -- return empty string
        if stderr.contains("does not exist") || stderr.contains("not found") {
            Ok(String::new())
        } else {
            Err(format!("git show failed: {}", stderr))
        }
    }
}
```

Register in `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
#[specta::specta]
fn git_show_file(cwd: String, file_path: String, git_ref: String) -> Result<String, String> {
    git::show_file(&cwd, &file_path, &git_ref)
}
```

Add `git_show_file` to `collect_commands!`.

- [ ] **Step 4: Wire into the agent detail panel**

Modify `src/components/agents/AgentDetailPanel.tsx`:

Add a "Review Changes" button in the action buttons row. When clicked, it opens the `MultiFileDiffReview` panel below the timeline (or replaces the timeline view temporarily).

```tsx
import { MultiFileDiffReview } from "@/components/diff/MultiFileDiffReview";

// Add local state:
const [showDiffReview, setShowDiffReview] = useState(false);

// Render conditionally:
{agent.worktreePath && showDiffReview ? (
  <MultiFileDiffReview worktreePath={agent.worktreePath} />
) : (
  <AgentTimeline events={agent.timeline} />
)}
```

Add a toggle button in the action bar:
```tsx
{agent.worktreePath && (
  <button onClick={() => setShowDiffReview(!showDiffReview)}>
    {showDiffReview ? "Show Timeline" : "Review Changes"}
  </button>
)}
```

**Acceptance criteria:**
- Changed files list loads from the agent's worktree
- Selecting a file shows a side-by-side diff using the existing DiffViewer
- "Viewed" checkmarks track review progress per file
- Progress counter shows "N of M reviewed"
- The diff review panel is accessible from the agent detail view
- `git_show_file` correctly retrieves file content at HEAD for comparison

---

### Task 7: Project-Wide Search (Ctrl+Shift+F)

**Files:**
- Create: `src-tauri/src/search.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/components/search/SearchPanel.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx`
- Modify: `src/hooks/useKeybindings.ts`

This task implements project-wide search, activated by Ctrl+Shift+F. The search backend uses ripgrep (`rg`) for performance, with a fallback to the `grep` crate or a manual walk using the `ignore` crate if ripgrep is not installed. Results are displayed in a panel in the primary sidebar, grouped by file with line numbers, and clicking a result opens the file at the matching line.

- [ ] **Step 1: Create the search Rust module**

Create `src-tauri/src/search.rs`:

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchMatch {
    /// Absolute path to the file
    pub file_path: String,
    /// 1-based line number
    pub line_number: u32,
    /// The full line text (trimmed of trailing newline)
    pub line_text: String,
    /// Column offset of the match start (0-based)
    pub column_start: u32,
    /// Length of the match
    pub match_length: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchResult {
    /// Grouped matches by file
    pub files: Vec<SearchFileResult>,
    /// Total match count across all files
    pub total_matches: u32,
    /// Whether the search was truncated (hit the limit)
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchFileResult {
    pub file_path: String,
    pub matches: Vec<SearchMatch>,
}
```

**Primary search function:** Implement `search_project(...)` that tries ripgrep first, falls back to the ignore crate.

**Ripgrep search (`search_with_ripgrep`):**
1. Build a `Command::new("rg")` with `--json`, `--max-count 100`, `--max-columns 500`.
2. Add `--fixed-strings` if not regex mode, `--ignore-case` if not case-sensitive, `--glob` if filter provided.
3. Run with `query` and `root` as positional args.
4. ripgrep exits with 1 for no matches (ok), 2 for errors.
5. Parse the NDJSON output: filter for `"type": "match"` messages, extract `data.path.text`, `data.line_number`, `data.lines.text`, `data.submatches[0].start` and `end` for column/length.
6. Group matches by file into a `HashMap<String, Vec<SearchMatch>>`, build the `SearchResult`.

**Fallback search (`search_with_ignore_crate`):**
1. Use `ignore::WalkBuilder::new(root).hidden(false).git_ignore(true).build()` to walk files.
2. Read each file as UTF-8 (skip binary files that fail `read_to_string`).
3. For each line, check if the query exists (case-insensitive via `to_lowercase()` if needed).
4. Collect matches into the same `SearchResult` structure.
5. Stop at `max_results`.

- [ ] **Step 2: Register search command in lib.rs**

Modify `src-tauri/src/lib.rs`:

1. Add `mod search;` at the top.

2. Create the Tauri command wrapper:

```rust
#[tauri::command]
#[specta::specta]
fn search_project(
    root: String,
    query: String,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<String>,
    max_results: Option<u32>,
) -> Result<search::SearchResult, String> {
    search::search_project(
        &root,
        &query,
        is_regex,
        case_sensitive,
        glob_filter.as_deref(),
        max_results.unwrap_or(1000),
    )
}
```

3. Add `search_project` to `collect_commands!`.

- [ ] **Step 3: Create the SearchPanel component**

Create `src/components/search/SearchPanel.tsx`.

This is the frontend for project-wide search, rendered in the primary sidebar when the "Search" activity bar item is active.

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, FileCode, ChevronRight, ChevronDown, CaseSensitive, Regex, Filter } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
```

**State:**
```typescript
const [query, setQuery] = useState("");
const [isRegex, setIsRegex] = useState(false);
const [caseSensitive, setCaseSensitive] = useState(false);
const [globFilter, setGlobFilter] = useState("");
const [results, setResults] = useState<SearchResult | null>(null);
const [loading, setLoading] = useState(false);
const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
```

**Search input area (top):**
- Main search input: text field with placeholder "Search". Debounced to 300ms.
- Three toggle buttons to the right of the input:
  - **Case Sensitive** (`Aa` icon or `<CaseSensitive />`): toggles `caseSensitive`.
  - **Regex** (`.*` icon or `<Regex />`): toggles `isRegex`.
  - **Glob Filter** (`<Filter />`): toggles visibility of a second input for glob patterns (e.g., `*.ts`, `*.{ts,tsx}`).
- When glob filter is visible, show a second input below with placeholder "e.g., *.ts, *.{tsx,jsx}".

**Debounced search execution:**
- Use a `useRef` for a timeout handle and a `useCallback` for `executeSearch`.
- Skip queries shorter than 2 chars.
- Call `invoke("search_project", { root: projectRootPath, query, isRegex, caseSensitive, globFilter, maxResults: 1000 })`.
- On success, set results and auto-expand the first 5 file groups.
- Debounce: in a `useEffect` watching `[query, executeSearch]`, clear previous timeout and set a new 300ms timeout before calling `executeSearch`.

**Results display (scrollable area below input):**

- **Summary line**: "N results in M files" or "No results" in `var(--color-subtext-0)`.

- **File groups**: Each file is a collapsible section.
  - **File header row** (clickable to expand/collapse):
    - Chevron icon (right when collapsed, down when expanded).
    - File icon.
    - File name (bold) + relative directory path (dimmed).
    - Match count badge on the right.
  - **Match rows** (when expanded):
    - Line number (right-aligned, fixed width, `var(--color-overlay-1)`).
    - Line text with the matching portion highlighted in `var(--color-yellow)` background.
    - Clicking a match row opens the file in the editor at that line.

**Click-to-navigate:**
Create a `handleMatchClick(filePath, lineNumber)` callback:
1. Read the file via `invoke("read_file", { path: filePath })`.
2. Derive the file name, extension, and language from the path (use a simple extension-to-language map for ts/tsx/js/jsx/rs/py/json/md/css/html/toml/yaml).
3. Call `useEditorStore.getState().openFile(...)` to open the file.
4. After a 100ms timeout (to let Monaco mount), get the editor via `monaco.editor.getEditors()`, call `revealLineInCenter(lineNumber)` and `setPosition({ lineNumber, column: 1 })`.

**Match highlighting:**
Create a `HighlightedLine` component that splits `text` into three parts (before, match, after) using `start` and `length`, wrapping the match in a `<mark>` with `var(--color-yellow) 30%` background.

- [ ] **Step 4: Wire SearchPanel into PrimarySidebar**

Modify `src/components/layout/PrimarySidebar.tsx`:

Import the SearchPanel:
```tsx
import { SearchPanel } from "@/components/search/SearchPanel";
```

Add it to the conditional rendering:
```tsx
{activeItem === "explorer" ? (
  <FileExplorer />
) : activeItem === "agents" ? (
  <KanbanBoard />
) : activeItem === "search" ? (
  <SearchPanel />
) : (
  <div className="flex items-center justify-center h-full p-4">
    <p ...>{config.description}</p>
  </div>
)}
```

- [ ] **Step 5: Wire Ctrl+Shift+F keybinding**

Modify `src/hooks/useKeybindings.ts`:

The Ctrl+Shift+F keybinding should switch the activity bar to "search" and focus the search input.

Find the existing Ctrl+Shift+F placeholder (or add a new binding):

```typescript
{
  key: "f",
  ctrl: true,
  shift: true,
  action: () => {
    useLayoutStore.getState().setActiveActivityBarItem("search");
    // Focus the search input after the panel renders
    setTimeout(() => {
      const input = document.querySelector('[data-search-input]') as HTMLInputElement;
      input?.focus();
    }, 50);
  },
  description: "Search in Files",
},
```

In the `SearchPanel`, add `data-search-input` attribute to the main search input element.

**Acceptance criteria:**
- Ctrl+Shift+F opens the search panel and focuses the input
- Typing a query (min 2 chars) searches the project with 300ms debounce
- Results are grouped by file with match count badges
- File groups are collapsible (first 5 auto-expanded)
- Clicking a match opens the file in the editor at the matching line
- Matching text is highlighted in yellow
- Case sensitivity and regex toggles work
- Glob filter input allows narrowing search to specific file types
- Fallback to ignore-crate search works if ripgrep is not installed
- Search handles large projects without freezing the UI (Rust-side execution)

---

### Task 8: CLAUDE.md Editor

**Files:**
- Create: `src/components/settings/ClaudeMdEditor.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx`

This task creates a dedicated editor for the project's `CLAUDE.md` file with a live markdown preview. CLAUDE.md is the primary way developers configure Claude Code's behavior for a project. Opcode proved this feature is highly valued by users (Research: 08-synthesis, Lesson 1). The editor reuses the existing Monaco Editor wrapper and the MarkdownPreview component from Phase 4.

- [ ] **Step 1: Create the ClaudeMdEditor component**

Create `src/components/settings/ClaudeMdEditor.tsx`.

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, FileText, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { toast } from "sonner";
```

**State:**
```typescript
const [content, setContent] = useState("");
const [savedContent, setSavedContent] = useState("");
const [showPreview, setShowPreview] = useState(true);
const [loading, setLoading] = useState(true);
const [filePath, setFilePath] = useState<string | null>(null);
const [exists, setExists] = useState(false);
const isDirty = content !== savedContent;
```

**File detection on mount:**

When the component mounts, search for CLAUDE.md in the project root:

```typescript
useEffect(() => {
  async function detectClaudeMd() {
    const rootPath = useLayoutStore.getState().projectRootPath;
    if (!rootPath) {
      setLoading(false);
      return;
    }

    const claudeMdPath = `${rootPath}/CLAUDE.md`;
    try {
      const result = await invoke<{ content: string }>("read_file", {
        path: claudeMdPath,
      });
      setContent(result.content);
      setSavedContent(result.content);
      setFilePath(claudeMdPath);
      setExists(true);
    } catch {
      // File doesn't exist -- offer to create it
      setFilePath(claudeMdPath);
      setExists(false);
      setContent(CLAUDE_MD_TEMPLATE);
      setSavedContent("");
    }
    setLoading(false);
  }
  detectClaudeMd();
}, []);
```

**Default template for new CLAUDE.md files:**

```typescript
const CLAUDE_MD_TEMPLATE = `# Project Instructions

## Overview
<!-- Describe your project and its purpose -->

## Code Style
<!-- Describe coding conventions, patterns to follow -->

## Important Files
<!-- List key files and their purposes -->

## Testing
<!-- Describe testing approach and commands -->

## Common Tasks
<!-- List frequent development tasks and how to do them -->
`;
```

**Save handler:**

```typescript
const handleSave = useCallback(async () => {
  if (!filePath) return;
  try {
    if (!exists) {
      await invoke("create_file", { path: filePath });
    }
    await invoke("write_file", { path: filePath, content });
    setSavedContent(content);
    setExists(true);
    toast.success("CLAUDE.md saved");
  } catch (err) {
    toast.error(`Failed to save: ${err}`);
  }
}, [filePath, content, exists]);
```

**Revert handler:**

```typescript
const handleRevert = useCallback(() => {
  setContent(savedContent);
}, [savedContent]);
```

**Layout:**

- **Header bar** (h-9):
  - Title: "CLAUDE.md" with a `<FileText />` icon.
  - Dirty indicator (dot) if `isDirty`.
  - Toggle preview button: `<Eye />` / `<EyeOff />`.
  - Save button: `<Save />` (enabled only when dirty). Keyboard shortcut: Ctrl+S within this component.
  - Revert button: `<RotateCcw />` (enabled only when dirty).

- **Editor area** (flex-1):
  - If `showPreview` is true: horizontal split with Monaco on the left and MarkdownPreview on the right.
  - If `showPreview` is false: Monaco full width.
  - Render Monaco with `language="markdown"` and `value={content}` and `onChange={setContent}`.

**Monaco editor integration:**

Use the existing `@monaco-editor/react` package. Render a `<MonacoEditor>` (or the raw `@monaco-editor/react` `Editor` component) with:
- `language="markdown"`
- `theme="catppuccin-mocha"` (or the custom theme registered in MonacoEditor.tsx)
- `value={content}`
- `onChange={(value) => setContent(value ?? "")}`
- `options={{ minimap: { enabled: false }, wordWrap: "on", lineNumbers: "on", fontSize: 13 }}`

**Markdown preview:**

Reuse the existing `MarkdownPreview` component from `src/components/editor/MarkdownPreview.tsx`. Pass `content={content}`.

If `MarkdownPreview` expects different props, adapt accordingly. Check the existing component's interface.

**Empty state (no project open):**

If `projectRootPath` is null, show: "Open a project folder to edit CLAUDE.md".

**Ctrl+S within the editor:**

Add an `onKeyDown` handler on the container div that intercepts Ctrl+S and calls `handleSave`:

```typescript
const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    handleSave();
  }
}, [handleSave]);
```

- [ ] **Step 2: Wire ClaudeMdEditor into the PrimarySidebar settings panel**

Modify `src/components/layout/PrimarySidebar.tsx`:

Import:
```tsx
import { ClaudeMdEditor } from "@/components/settings/ClaudeMdEditor";
```

Add to the conditional rendering:
```tsx
{activeItem === "explorer" ? (
  <FileExplorer />
) : activeItem === "agents" ? (
  <KanbanBoard />
) : activeItem === "search" ? (
  <SearchPanel />
) : activeItem === "settings" ? (
  <ClaudeMdEditor />
) : (
  <div className="flex items-center justify-center h-full p-4">
    <p ...>{config.description}</p>
  </div>
)}
```

Note: The settings panel is being used for CLAUDE.md editing as the primary P1 feature. MCP management (Task 9) will also go in this panel area as a tabbed interface.

**Acceptance criteria:**
- CLAUDE.md editor opens when the Settings activity bar item is selected
- Auto-detects CLAUDE.md in the project root
- Creates a template if CLAUDE.md doesn't exist
- Monaco editor with markdown syntax highlighting
- Live markdown preview in split view (toggleable)
- Save button writes to disk and shows success toast
- Revert button restores saved content
- Dirty indicator shows unsaved changes
- Ctrl+S saves within the editor

---

### Task 9: MCP Server Management

**Files:**
- Create: `src-tauri/src/mcp.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/components/settings/McpManager.tsx`
- Modify: `src/components/settings/ClaudeMdEditor.tsx` (add tab navigation)

This task provides a UI for viewing and managing MCP (Model Context Protocol) server configurations. Claude Code uses two config files: `~/.claude/mcp-config.json` (global, user-level) and `.mcp.json` (project-level, in the project root). The MCP manager reads both files, displays configured servers, and allows adding/removing/editing server entries.

- [ ] **Step 1: Create the MCP Rust module**

Create `src-tauri/src/mcp.rs`:

**Struct:** `McpServerConfig` with fields: `name: String`, `command: String`, `args: Vec<String>`, `env: Option<HashMap<String, String>>`, `source: String` ("global" or "project"). Derive `Serialize, Deserialize, Type`.

**Functions:**

`read_global_config()` -- reads `~/.claude/mcp-config.json` via `dirs::home_dir()`. Returns `Vec<McpServerConfig>`.

`read_project_config(project_root)` -- reads `{project_root}/.mcp.json`. Returns `Vec<McpServerConfig>`.

Both use a shared `read_mcp_config_file(path, source)` that:
1. Returns empty vec if file doesn't exist.
2. Parses JSON, extracts `mcpServers` object.
3. Iterates entries, extracting `command`, `args` array, and optional `env` object.
4. Tags each entry with the `source` ("global" or "project").

`write_server_config(project_root, name, command, args, env, target)`:
1. Determine path based on `target` ("global" -> `~/.claude/mcp-config.json`, "project" -> `{root}/.mcp.json`).
2. Read existing file or create `{ "mcpServers": {} }`.
3. Build the server entry JSON object with command, args, and optional env.
4. Insert into `mcpServers` under the given name.
5. Write back as pretty-printed JSON.

`remove_server_config(project_root, name, target)`:
1. Same path resolution as write.
2. Read and parse the JSON.
3. Remove the named entry from `mcpServers`.
4. Write back.

- [ ] **Step 2: Register MCP commands in lib.rs**

Modify `src-tauri/src/lib.rs`:

1. Add `mod mcp;` at the top.

2. Create Tauri command wrappers:

```rust
#[tauri::command]
#[specta::specta]
fn read_mcp_servers(project_root: Option<String>) -> Result<Vec<mcp::McpServerConfig>, String> {
    let mut all_servers = mcp::read_global_config()?;
    if let Some(root) = &project_root {
        let project_servers = mcp::read_project_config(root)?;
        all_servers.extend(project_servers);
    }
    Ok(all_servers)
}

#[tauri::command]
#[specta::specta]
fn add_mcp_server(
    project_root: Option<String>,
    name: String,
    command: String,
    args: Vec<String>,
    env: Option<std::collections::HashMap<String, String>>,
    target: String,
) -> Result<(), String> {
    mcp::write_server_config(
        project_root.as_deref(),
        &name,
        &command,
        &args,
        env.as_ref(),
        &target,
    )
}

#[tauri::command]
#[specta::specta]
fn remove_mcp_server(
    project_root: Option<String>,
    name: String,
    target: String,
) -> Result<(), String> {
    mcp::remove_server_config(project_root.as_deref(), &name, &target)
}
```

3. Add all three to `collect_commands!`.

- [ ] **Step 3: Create the McpManager component**

Create `src/components/settings/McpManager.tsx`.

```tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Server, Globe, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

**Types:**
```typescript
interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string> | null;
  source: string; // "global" | "project"
}
```

**State:**
```typescript
const [servers, setServers] = useState<McpServerConfig[]>([]);
const [loading, setLoading] = useState(true);
const [addDialogOpen, setAddDialogOpen] = useState(false);
const [expandedServer, setExpandedServer] = useState<string | null>(null);
```

**Load servers on mount:**
```typescript
const loadServers = useCallback(async () => {
  try {
    const projectRoot = useLayoutStore.getState().projectRootPath;
    const result = await invoke<McpServerConfig[]>("read_mcp_servers", {
      projectRoot,
    });
    setServers(result);
  } catch {
    setServers([]);
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => { loadServers(); }, [loadServers]);
```

**Server list layout:**
- Each server is a card with:
  - **Header row**: Server name (bold), source badge ("Global" with `<Globe />` or "Project" with `<FolderOpen />`), expand/collapse chevron, delete button.
  - **Expanded detail** (when `expandedServer === name`):
    - Command: `server.command`
    - Args: `server.args.join(" ")`
    - Environment variables table (if any).

**Add server dialog:**
- Fields: Name, Command, Args (comma-separated or space-separated), Target (Global/Project radio buttons).
- On submit: call `invoke("add_mcp_server", ...)`, then `loadServers()`.

**Remove server:**
- Click the trash icon, confirm with a toast or `window.confirm`, then call `invoke("remove_mcp_server", ...)`, then `loadServers()`.

**Empty state:**
"No MCP servers configured. Click + to add one."

- [ ] **Step 4: Add tabbed settings panel**

Modify `src/components/settings/ClaudeMdEditor.tsx` or create a wrapper component.

Currently the settings panel shows the CLAUDE.md editor. Now it needs to show both the CLAUDE.md editor and the MCP manager. Add a simple tab bar at the top with two tabs:

1. **CLAUDE.md** -- the existing CLAUDE.md editor
2. **MCP Servers** -- the McpManager component

Create a wrapper or modify the PrimarySidebar rendering for `activeItem === "settings"`:

```tsx
// In PrimarySidebar.tsx, replace the ClaudeMdEditor render with:
activeItem === "settings" ? (
  <SettingsPanel />
) : ...
```

Create `src/components/settings/SettingsPanel.tsx`:

```tsx
import { useState } from "react";
import { ClaudeMdEditor } from "./ClaudeMdEditor";
import { McpManager } from "./McpManager";

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<"claude-md" | "mcp">("claude-md");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div
        className="flex items-center gap-0 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <button
          onClick={() => setActiveTab("claude-md")}
          className="px-3 py-1.5 text-xs font-medium"
          style={{
            color: activeTab === "claude-md" ? "var(--color-text)" : "var(--color-overlay-1)",
            borderBottom: activeTab === "claude-md" ? "2px solid var(--color-blue)" : "2px solid transparent",
          }}
        >
          CLAUDE.md
        </button>
        <button
          onClick={() => setActiveTab("mcp")}
          className="px-3 py-1.5 text-xs font-medium"
          style={{
            color: activeTab === "mcp" ? "var(--color-text)" : "var(--color-overlay-1)",
            borderBottom: activeTab === "mcp" ? "2px solid var(--color-blue)" : "2px solid transparent",
          }}
        >
          MCP Servers
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "claude-md" ? <ClaudeMdEditor /> : <McpManager />}
      </div>
    </div>
  );
}
```

Update `PrimarySidebar.tsx` to import and render `SettingsPanel` instead of `ClaudeMdEditor` directly.

**Acceptance criteria:**
- MCP servers load from both `~/.claude/mcp-config.json` and `.mcp.json`
- Each server displays its name, command, args, and source (global/project)
- Servers are expandable to show full configuration details
- "Add Server" dialog creates a new entry in the chosen config file
- "Remove Server" deletes the entry and refreshes the list
- Settings panel has tabs for CLAUDE.md and MCP Servers
- Changes to MCP config files are written correctly as formatted JSON

---

### Task 10: System Notifications

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`
- Create: `src/hooks/useAgentNotifications.ts`
- Modify: `src/App.tsx`

This task adds system-level notifications for agent events: task completed, error, permission needed, and agent stalled. It uses the Tauri notification plugin for OS-level notifications (taskbar/system tray) and the existing Sonner toast system for in-app notifications.

- [ ] **Step 1: Install the Tauri notification plugin**

Add the plugin to `src-tauri/Cargo.toml`:

```toml
[dependencies]
# ... existing dependencies ...
tauri-plugin-notification = "2"
```

Install the JavaScript counterpart:

```bash
npm install @tauri-apps/plugin-notification
```

- [ ] **Step 2: Register the notification plugin**

Modify `src-tauri/src/lib.rs`:

Add the notification plugin to the Tauri builder chain. Find the `tauri::Builder::default()` section and add:

```rust
.plugin(tauri_plugin_notification::init())
```

After the existing `.plugin(tauri_plugin_dialog::init())` line.

- [ ] **Step 3: Update capabilities**

Modify `src-tauri/capabilities/default.json`:

Add the notification permission:

```json
{
  "permissions": [
    "core:default",
    "opener:default",
    "store:default",
    "pty:default",
    "dialog:default",
    "notification:default"
  ]
}
```

- [ ] **Step 4: Create the agent notifications hook**

Create `src/hooks/useAgentNotifications.ts`.

This hook watches the agents store for status changes and fires notifications.

```typescript
import { useEffect, useRef } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import { useAgentsStore, type Agent, type AgentStatus } from "@/stores/agents";

const STALL_THRESHOLD_MS = 60_000;

export function useAgentNotifications() {
  const prevStatusesRef = useRef<Map<string, AgentStatus>>(new Map());

  // Watch for agent status changes via useAgentsStore.subscribe()
  // Compare each agent's current status vs. prevStatusesRef:
  //   - working -> completed: notifyAgentCompleted (toast.success + system notification with cost/files)
  //   - any -> error: notifyAgentError (toast.error + system notification with error message)
  //   - any -> waiting_permission: notifyAgentNeedsPermission (toast.warning + system notification)
  // Clean up removed agents from the ref.

  // Stall detection: setInterval every 30s
  // For each agent with status "working" and lastActivityAt > 60s ago:
  //   - Call notifyAgentStalled (toast.warning + system notification)
  //   - Set agent status to "stalled"

  // Helper: sendSystemNotification(title, body)
  //   - Check isPermissionGranted(), requestPermission() if needed
  //   - Call sendNotification({ title, body })
  //   - Silently fail if unavailable
}
```

**Notification functions** (called from the subscriber):

| Event | Toast | System Notification |
|-------|-------|-------------------|
| Completed | `toast.success` with cost and file count, 8s duration | "Agent Completed" |
| Error | `toast.error` with error message, 10s duration | "Agent Error" |
| Permission | `toast.warning`, 15s duration | "Permission Needed" |
| Stalled | `toast.warning` with inactivity duration, 10s duration | "Agent Stalled" |

- [ ] **Step 5: Wire the notifications hook into the app**

Modify `src/App.tsx`:

Import and call the hook:

```tsx
import { useAgentNotifications } from "@/hooks/useAgentNotifications";

function App() {
  useKeybindings();
  useAgentNotifications();

  return (
    <>
      <IDELayout />
      <CommandPalette />
      <PermissionDialog />
      <Toaster ... />
    </>
  );
}
```

**Acceptance criteria:**
- Sonner toasts fire for agent completed, error, permission needed, and stalled events
- System notifications fire alongside toasts (when permission is granted)
- Stall detection triggers after 60 seconds of inactivity on a working agent
- Notification permission is requested on first trigger
- Completed notifications include cost and file count
- Error notifications include the error message
- Stalled agents have their status updated to "stalled" in the store

---

### Task 11: Integration, Testing, and Polish

**Files:**
- Modify: Various files for bug fixes and polish
- Modify: `src/components/layout/ActivityBar.tsx` (badge counts)
- Modify: `src/components/layout/StatusBar.tsx` (agent summary)

This task covers integration testing of all P1 features, adding badge counts to the activity bar, agent summary in the status bar, and verifying the production build.

- [ ] **Step 1: Add badge counts to the Activity Bar**

Modify `src/components/layout/ActivityBar.tsx`:

Import the agents store:
```tsx
import { useAgentsStore } from "@/stores/agents";
```

Add agent attention count (agents needing permission or in error state):

```typescript
const attentionCount = useAgentsStore((s) => {
  const agents = [...s.agents.values()];
  return agents.filter(
    (a) => a.status === "waiting_permission" || a.status === "error" || a.status === "stalled"
  ).length;
});
```

Render a badge on the Agents icon when `attentionCount > 0`:

```tsx
{/* Inside the agents button */}
<div className="relative">
  <Bot size={20} />
  {attentionCount > 0 && (
    <span
      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
      style={{
        backgroundColor: "var(--color-red)",
        color: "var(--color-crust)",
      }}
    >
      {attentionCount}
    </span>
  )}
</div>
```

- [ ] **Step 2: Add agent summary to the Status Bar**

Modify `src/components/layout/StatusBar.tsx`:

Import the agents store:
```tsx
import { useAgentsStore } from "@/stores/agents";
```

Add an agent status summary on the right side of the status bar (before or after the model name):

```typescript
const activeCount = useAgentsStore((s) => s.getActiveAgentCount());
const agentsList = useAgentsStore((s) => s.getAgentsList());
const totalAgents = agentsList.length;
const reviewCount = agentsList.filter((a) => a.status === "reviewing").length;
```

Render when agents exist:
```tsx
{totalAgents > 0 && (
  <span
    className="flex items-center gap-1 text-xs cursor-pointer"
    style={{ color: "var(--color-subtext-0)" }}
    onClick={() => {
      // Switch to agents panel
      useLayoutStore.getState().setActiveActivityBarItem("agents");
    }}
    title="Click to view agents"
  >
    <Bot size={12} />
    {activeCount > 0 && <span>{activeCount} running</span>}
    {reviewCount > 0 && <span>, {reviewCount} review</span>}
    {activeCount === 0 && reviewCount === 0 && <span>{totalAgents} agents</span>}
  </span>
)}
```

- [ ] **Step 3: End-to-end verification**

Verify each P1 feature works correctly:

**Multi-agent (Tasks 1-2):**
1. Create 2 agents via the kanban board's Create Agent dialog.
2. Verify both appear in the Backlog column.
3. Drag one agent to In Progress -- verify status changes to "working".
4. Verify the agent gets a unique color.

**Kanban board (Task 3):**
1. Drag agents between all four columns.
2. Verify reordering within a column works.
3. Verify the column counts update.

**Agent timeline (Task 4):**
1. Click an agent card to open the detail panel.
2. Verify the back button returns to the kanban.
3. Verify timeline renders events with correct icons and timestamps.

**Conflict detection (Task 5):**
1. Create two agents and manually add the same file to both agents' `assignedFiles`.
2. Verify the conflict banner appears on the kanban board.
3. Verify ownership dots appear in the file explorer.

**Multi-file diff review (Task 6):**
1. Create a worktree, make a change, verify the diff review panel shows it.
2. Verify clicking a file shows the diff.
3. Verify "Viewed" checkmarks toggle and the progress counter updates.

**Project search (Task 7):**
1. Press Ctrl+Shift+F -- verify the search panel opens.
2. Type a search query -- verify results appear grouped by file.
3. Click a result -- verify the file opens at the correct line.
4. Test regex mode and case sensitivity toggles.
5. Test glob filter.

**CLAUDE.md editor (Task 8):**
1. Click Settings in the activity bar.
2. Verify CLAUDE.md loads (or the template appears for new projects).
3. Edit content, verify dirty indicator appears.
4. Save with Ctrl+S, verify toast and dirty indicator clears.
5. Toggle preview on/off.

**MCP management (Task 9):**
1. Switch to the MCP Servers tab.
2. Verify existing servers load from config files.
3. Add a new server, verify it appears in the list and is written to disk.
4. Remove a server, verify it disappears and is removed from the config file.

**Notifications (Task 10):**
1. Verify Sonner toasts appear for agent status changes.
2. Verify system notification permission is requested.
3. Verify stall detection triggers after 60 seconds of inactivity.

- [ ] **Step 4: Production build**

Run the production build:

```bash
npm run build
npx tauri build
```

Verify:
1. No TypeScript compilation errors.
2. No Rust compilation errors.
3. The binary launches and all P1 features are functional.
4. Check binary size has not ballooned unreasonably (should be under 50MB).

- [ ] **Step 5: Tag phase-5-complete**

Once all features are verified:

```bash
git add -A
git commit -m "feat: complete Phase 5 — P1 differentiating features

Multi-agent orchestration with kanban board, git worktree isolation,
conflict detection, project-wide search, CLAUDE.md editor, MCP server
management, agent timeline, multi-file diff review, and system
notifications."

git tag phase-5-complete
```

**Acceptance criteria:**
- All 10 P1 features are implemented and functional
- Activity bar shows badge count for agents needing attention
- Status bar shows agent summary
- No compilation errors in TypeScript or Rust
- Production build completes successfully
- Binary size is reasonable
- Tagged as phase-5-complete
