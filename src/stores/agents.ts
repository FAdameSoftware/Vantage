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

// ── Agent role in hierarchy ──────────────────────────────────────────

export type AgentRole = "coordinator" | "specialist" | "verifier" | "builder";

// ── Pipeline configuration (for coordinator agents) ──────────────────

export interface PipelineConfig {
  /** Task descriptions for each specialist to be created */
  specialists: string[];
  /** Model to use for auto-created verifier agents */
  verifierModel?: string;
  /** Whether to auto-merge branches after verification passes */
  autoMerge: boolean;
}

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
  type:
    | "file_read"
    | "file_edit"
    | "bash_command"
    | "thinking"
    | "tool_call"
    | "error"
    | "permission"
    | "message";
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
  /** Role in the agent hierarchy */
  role: AgentRole;
  /** Parent agent ID (null for top-level agents) */
  parentId: string | null;
  /** Child agent IDs (for coordinators) */
  childIds: string[];
  /** Pipeline config (for coordinators): defines specialist→verifier flow */
  pipeline: PipelineConfig | null;
  /** Chronological event log */
  timeline: AgentTimelineEvent[];
  /** Error message, if status is "error" */
  errorMessage?: string;
  /** Checkpoint created before agent started working */
  checkpoint?: {
    tagName: string;
    commitHash: string;
    createdAt: string;
  };
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
    role?: AgentRole;
    parentId?: string | null;
  }) => string; // returns agent ID

  /** Create a child agent under a coordinator */
  createChildAgent: (
    parentId: string,
    params: { name: string; taskDescription: string; role: AgentRole; model?: string },
  ) => string | null; // returns agent ID or null if parent is not a coordinator

  /** Remove an agent entirely (should stop session first) */
  removeAgent: (agentId: string) => void;

  /** Change an agent's role */
  setAgentRole: (agentId: string, role: AgentRole) => void;

  /** Promote an agent to coordinator role */
  promoteToCoordinator: (agentId: string) => void;

  /** Update an agent's status */
  updateAgentStatus: (
    agentId: string,
    status: AgentStatus,
    errorMessage?: string,
  ) => void;

  /** Link a Claude session to an agent */
  linkSession: (agentId: string, sessionId: string) => void;

  /** Link a worktree to an agent */
  linkWorktree: (
    agentId: string,
    worktreePath: string,
    branchName: string,
  ) => void;

  /** Update cost and token tracking for an agent */
  updateAgentCost: (
    agentId: string,
    cost: number,
    tokens: { input: number; output: number },
  ) => void;

  /** Track a file that an agent is reading or modifying */
  trackFile: (agentId: string, filePath: string) => void;

  /** Add a timeline event to an agent */
  addTimelineEvent: (
    agentId: string,
    event: Omit<AgentTimelineEvent, "id" | "timestamp">,
  ) => void;

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

  /** Get all direct children of an agent */
  getChildAgents: (parentId: string) => Agent[];

  /** Get the parent agent of a given agent */
  getParent: (agentId: string) => Agent | undefined;

  /** Get all top-level agents (no parent) */
  getRootAgents: () => Agent[];

  /** Set checkpoint metadata for an agent */
  setCheckpoint: (
    agentId: string,
    checkpoint: { tagName: string; commitHash: string; createdAt: string },
  ) => void;

  /** Clear checkpoint metadata for an agent */
  clearCheckpoint: (agentId: string) => void;
}

// ── Store implementation ────────────────────────────────────────────

export const useAgentsStore = create<AgentsState>()((set, get) => ({
  agents: new Map(),
  columnOrder: {
    backlog: [],
    in_progress: [],
    review: [],
    done: [],
  },
  maxConcurrentAgents: 3,

  createAgent({ name, taskDescription, model, role = "builder", parentId = null }) {
    const id = crypto.randomUUID();
    const { agents } = get();
    const colorIndex = agents.size % AGENT_COLORS.length;
    const color = AGENT_COLORS[colorIndex];
    const now = Date.now();

    const agent: Agent = {
      id,
      name,
      status: "idle",
      sessionId: null,
      worktreePath: null,
      branchName: null,
      assignedFiles: [],
      taskDescription,
      column: "backlog",
      cost: 0,
      tokens: { input: 0, output: 0 },
      createdAt: now,
      lastActivityAt: now,
      color,
      model,
      role,
      parentId,
      childIds: [],
      pipeline: null,
      timeline: [],
    };

    set((state) => {
      const next = new Map(state.agents);
      next.set(id, agent);

      // If this agent has a parent, add it to the parent's childIds
      if (parentId) {
        const parent = next.get(parentId);
        if (parent) {
          next.set(parentId, {
            ...parent,
            childIds: [...parent.childIds, id],
          });
        }
      }

      return {
        agents: next,
        columnOrder: {
          ...state.columnOrder,
          backlog: [...state.columnOrder.backlog, id],
        },
      };
    });

    return id;
  },

  createChildAgent(parentId, params) {
    const { agents } = get();
    const parent = agents.get(parentId);
    if (!parent || parent.role !== "coordinator") return null;
    return get().createAgent({ ...params, parentId });
  },

  removeAgent(agentId) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};

      // Collect all IDs to remove (the agent + all descendants)
      const toRemove = new Set<string>();
      const queue = [agentId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        toRemove.add(current);
        const node = state.agents.get(current);
        if (node) {
          for (const childId of node.childIds) queue.push(childId);
        }
      }

      const next = new Map(state.agents);

      // Remove all collected agents
      for (const id of toRemove) next.delete(id);

      // If the removed agent had a parent, remove it from parent's childIds
      if (agent.parentId) {
        const parent = next.get(agent.parentId);
        if (parent) {
          next.set(agent.parentId, {
            ...parent,
            childIds: parent.childIds.filter((id) => id !== agentId),
          });
        }
      }

      // Remove all deleted IDs from every column's order
      const nextColumnOrder = Object.fromEntries(
        (Object.entries(state.columnOrder) as [KanbanColumn, string[]][]).map(
          ([col, ids]) => [col, ids.filter((id) => !toRemove.has(id))],
        ),
      ) as Record<KanbanColumn, string[]>;

      return { agents: next, columnOrder: nextColumnOrder };
    });
  },

  updateAgentStatus(agentId, status, errorMessage) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, {
        ...agent,
        status,
        lastActivityAt: Date.now(),
        ...(status === "error" ? { errorMessage } : {}),
      });

      // Auto-trigger verifier when a specialist completes
      if (status === "completed" && agent.role === "specialist" && agent.parentId) {
        const siblings = [...next.values()].filter(
          (a) =>
            a.parentId === agent.parentId &&
            a.role === "verifier" &&
            a.status === "idle",
        );
        for (const verifier of siblings) {
          next.set(verifier.id, {
            ...verifier,
            status: "working",
            lastActivityAt: Date.now(),
          });
        }
      }

      return { agents: next };
    });
  },

  linkSession(agentId, sessionId) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, { ...agent, sessionId });
      return { agents: next };
    });
  },

  linkWorktree(agentId, worktreePath, branchName) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, { ...agent, worktreePath, branchName });
      return { agents: next };
    });
  },

  updateAgentCost(agentId, cost, tokens) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, {
        ...agent,
        cost: agent.cost + cost,
        tokens: {
          input: agent.tokens.input + tokens.input,
          output: agent.tokens.output + tokens.output,
        },
      });
      return { agents: next };
    });
  },

  trackFile(agentId, filePath) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      if (agent.assignedFiles.includes(filePath)) return {};
      const next = new Map(state.agents);
      next.set(agentId, {
        ...agent,
        assignedFiles: [...agent.assignedFiles, filePath],
        lastActivityAt: Date.now(),
      });
      return { agents: next };
    });
  },

  addTimelineEvent(agentId, eventData) {
    const event: AgentTimelineEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...eventData,
    };

    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, {
        ...agent,
        timeline: [...agent.timeline, event],
        lastActivityAt: Date.now(),
      });
      return { agents: next };
    });
  },

  moveAgent(agentId, toColumn, toIndex) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};

      const fromColumn = agent.column;

      // Remove from old column
      const nextColumnOrder = { ...state.columnOrder };
      nextColumnOrder[fromColumn] = nextColumnOrder[fromColumn].filter(
        (id) => id !== agentId,
      );

      // Insert into new column at toIndex or append
      const targetIds = [...nextColumnOrder[toColumn]];
      if (toIndex !== undefined) {
        targetIds.splice(toIndex, 0, agentId);
      } else {
        targetIds.push(agentId);
      }
      nextColumnOrder[toColumn] = targetIds;

      // Update agent's column and status based on destination
      const updatedAgent: Agent = { ...agent, column: toColumn };
      if (toColumn === "in_progress") {
        updatedAgent.status = "working";
      } else if (toColumn === "done") {
        updatedAgent.status = "completed";
      }

      const nextAgents = new Map(state.agents);
      nextAgents.set(agentId, updatedAgent);

      return { agents: nextAgents, columnOrder: nextColumnOrder };
    });
  },

  reorderInColumn(column, orderedIds) {
    set((state) => ({
      columnOrder: { ...state.columnOrder, [column]: orderedIds },
    }));
  },

  getAgentsList() {
    return [...get().agents.values()];
  },

  getAgentsInColumn(column) {
    const { agents, columnOrder } = get();
    return columnOrder[column]
      .map((id) => agents.get(id))
      .filter((a): a is Agent => a !== undefined);
  },

  getAgentBySessionId(sessionId) {
    for (const agent of get().agents.values()) {
      if (agent.sessionId === sessionId) return agent;
    }
    return undefined;
  },

  getAgentsForFile(filePath) {
    return get().getAgentsList().filter((a) => a.assignedFiles.includes(filePath));
  },

  getActiveAgentCount() {
    return get()
      .getAgentsList()
      .filter((a) => a.status === "working" || a.status === "waiting_permission")
      .length;
  },

  hasFileConflict(filePath) {
    return get().getAgentsForFile(filePath).length > 1;
  },

  setCheckpoint(agentId, checkpoint) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, { ...agent, checkpoint });
      return { agents: next };
    });
  },

  clearCheckpoint(agentId) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, { ...agent, checkpoint: undefined });
      return { agents: next };
    });
  },

  setAgentRole(agentId, role) {
    set((state) => {
      const agent = state.agents.get(agentId);
      if (!agent) return {};
      const next = new Map(state.agents);
      next.set(agentId, { ...agent, role });
      return { agents: next };
    });
  },

  promoteToCoordinator(agentId) {
    get().setAgentRole(agentId, "coordinator");
  },

  getChildAgents(parentId) {
    return get()
      .getAgentsList()
      .filter((a) => a.parentId === parentId);
  },

  getParent(agentId) {
    const agent = get().agents.get(agentId);
    if (!agent?.parentId) return undefined;
    return get().agents.get(agent.parentId);
  },

  getRootAgents() {
    return get()
      .getAgentsList()
      .filter((a) => a.parentId === null);
  },
}));
