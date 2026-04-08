/**
 * Workspace Manager Store
 *
 * Orchestrates project-scoped state: opening/closing workspaces,
 * persisting state to disk, managing the recent projects list,
 * and auto-saving on store changes.
 */

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { normalizePath } from "@/lib/paths";

import type {
  WorkspaceFile,
  RecentProject,
  SerializedMessage,
  SerializedToolCall,
  SerializedAgent,
  SerializedAgentConversation,
} from "@/lib/workspaceTypes";
import {
  loadOrCreateWorkspace,
  saveWorkspace,
  loadRecentProjects,
  touchRecentProject,
  saveRecentProjects,
} from "@/lib/workspaceStorage";

import { useLayoutStore } from "./layout";
import { useEditorStore } from "./editor";
import { useConversationStore } from "./conversation";
import type { ConversationMessage, ToolCall } from "./conversation";
import { useAgentsStore } from "./agents";
import type { Agent, AgentTimelineEvent } from "./agents";
import { useMergeQueueStore } from "./mergeQueue";
import { useVerificationStore } from "./verification";
import { useUsageStore } from "./usage";
import { useAgentConversationsStore } from "./agentConversations";

// ─── Constants ─────────────────────────────────────────────────────

/** Debounce delay for auto-save in milliseconds */
const AUTO_SAVE_DEBOUNCE_MS = 2000;

/** Maximum number of messages to persist per workspace */
const MAX_PERSISTED_MESSAGES = 200;

/** Maximum number of timeline events per agent to persist */
const MAX_TIMELINE_EVENTS = 200;

// ─── Store interface ───────────────────────────────────────────────

export interface WorkspaceManagerState {
  /** The currently active project path (null = no project open) */
  currentProjectPath: string | null;
  /** List of recently opened projects */
  recentProjects: RecentProject[];
  /** Whether workspace state is currently being saved */
  isSaving: boolean;
  /** Whether workspace state is currently being loaded */
  isLoading: boolean;

  // ── Lifecycle actions ──

  /** Open a workspace for a given project path */
  openProject: (projectPath: string) => Promise<void>;
  /** Close the current workspace (save first, then reset all stores) */
  closeProject: () => Promise<void>;
  /** Save the current workspace state to disk */
  saveCurrentWorkspace: () => Promise<void>;
  /** Load the recent projects list from disk */
  loadRecentProjectsList: () => Promise<void>;
  /** Remove a project from the recent projects list */
  removeRecentProject: (projectPath: string) => Promise<void>;
  /** Pin/unpin a project in the recent projects list */
  togglePinProject: (projectPath: string) => Promise<void>;
  /** Mark workspace dirty — triggers debounced auto-save */
  markDirty: () => void;
  /** Start auto-save subscriptions on workspace-scoped stores */
  startAutoSave: () => () => void;
}

// ─── Serialization helpers ─────────────────────────────────────────

function serializeMessage(msg: ConversationMessage): SerializedMessage {
  return {
    id: msg.id,
    role: msg.role,
    text: msg.text,
    // Thinking text is NOT persisted (ephemeral, potentially large)
    toolCalls: msg.toolCalls.map(serializeToolCall),
    model: msg.model,
    timestamp: msg.timestamp,
    parentToolUseId: msg.parentToolUseId,
  };
}

function serializeToolCall(tc: ToolCall): SerializedToolCall {
  return {
    id: tc.id,
    name: tc.name,
    inputJson: tc.inputJson,
    output: tc.output,
    isError: tc.isError,
  };
}

function deserializeMessage(msg: SerializedMessage): ConversationMessage {
  return {
    id: msg.id,
    role: msg.role,
    text: msg.text,
    thinking: "", // Not persisted
    toolCalls: msg.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      input: safeParseJson(tc.inputJson),
      inputJson: tc.inputJson,
      output: tc.output,
      isError: tc.isError ?? false,
      isExecuting: false,
    })),
    model: msg.model,
    timestamp: msg.timestamp,
    parentToolUseId: msg.parentToolUseId,
  };
}

function safeParseJson(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json || "{}") as Record<string, unknown>;
  } catch (err) {
    console.warn("safeParseJson: failed to parse tool call inputJson —", err);
    return {};
  }
}

function serializeAgent(agent: Agent): SerializedAgent {
  // Downgrade running/waiting statuses to idle (session is dead on restore)
  const status =
    agent.status === "working" || agent.status === "waiting_permission" || agent.status === "reviewing" || agent.status === "stalled"
      ? "idle"
      : (agent.status as "idle" | "completed" | "error");

  return {
    id: agent.id,
    name: agent.name,
    status,
    taskDescription: agent.taskDescription,
    column: agent.column,
    branchName: agent.branchName,
    worktreePath: agent.worktreePath,
    assignedFiles: agent.assignedFiles,
    cost: agent.cost,
    tokens: { ...agent.tokens },
    createdAt: agent.createdAt,
    lastActivityAt: agent.lastActivityAt,
    color: agent.color,
    model: agent.model,
    role: agent.role,
    parentId: agent.parentId,
    childIds: [...agent.childIds],
    timeline: agent.timeline.slice(-MAX_TIMELINE_EVENTS).map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      type: e.type,
      summary: e.summary,
    })),
    errorMessage: agent.errorMessage,
    checkpoint: agent.checkpoint ? { ...agent.checkpoint } : undefined,
  };
}

// ─── State collection ──────────────────────────────────────────────

function collectWorkspaceState(projectPath: string): WorkspaceFile {
  const layout = useLayoutStore.getState();
  const editor = useEditorStore.getState();
  const conversation = useConversationStore.getState();
  const agents = useAgentsStore.getState();
  const agentConversations = useAgentConversationsStore.getState();
  const mergeQueue = useMergeQueueStore.getState();
  const verification = useVerificationStore.getState();

  return {
    version: 1,
    projectPath,
    lastSavedAt: new Date().toISOString(),
    layout: {
      primarySidebarVisible: layout.primarySidebarVisible,
      secondarySidebarVisible: layout.secondarySidebarVisible,
      panelVisible: layout.panelVisible,
      activeActivityBarItem: layout.activeActivityBarItem,
      primarySidebarSize: layout.primarySidebarSize,
      secondarySidebarSize: layout.secondarySidebarSize,
      panelSize: layout.panelSize,
      primarySidebarPixelWidth: layout.primarySidebarPixelWidth,
      secondarySidebarPixelWidth: layout.secondarySidebarPixelWidth,
      horizontalLayout: layout.horizontalLayout,
      verticalLayout: layout.verticalLayout,
      activePanelTab: layout.activePanelTab,
      agentsViewMode: layout.agentsViewMode,
      previewUrl: layout.previewUrl,
      previewActive: layout.previewActive,
      viewMode: layout.viewMode,
    },
    editor: {
      // Cursor position is transient — not worth per-tab persistence complexity.
      // All tabs get a default position on restore.
      tabs: editor.tabs.map((t) => ({
        id: t.id,
        path: t.path,
        name: t.name,
        language: t.language,
        isPreview: t.isPreview,
        cursorPosition: { line: 1, column: 1 },
        scrollTop: undefined,
      })),
      activeTabId: editor.activeTabId,
      markdownPreviewTabIds: [...editor.markdownPreviewTabs],
    },
    chat: {
      lastSessionId: conversation.session?.sessionId ?? null,
      lastCliSessionId: conversation.session?.cliSessionId ?? null,
      messages: conversation.messages.slice(-MAX_PERSISTED_MESSAGES).map(serializeMessage),
      totalCost: conversation.totalCost,
      totalTokens: { ...conversation.totalTokens },
    },
    agents: {
      agents: [...agents.agents.values()].map(serializeAgent),
      columnOrder: {
        backlog: [...agents.columnOrder.backlog],
        in_progress: [...agents.columnOrder.in_progress],
        review: [...agents.columnOrder.review],
        done: [...agents.columnOrder.done],
      },
    },
    agentConversations: {
      conversations: Object.fromEntries(
        [...agentConversations.conversations.entries()].map(([agentId, conv]) => [
          agentId,
          {
            messages: conv.messages.slice(-MAX_PERSISTED_MESSAGES).map(serializeMessage),
            totalCost: conv.totalCost,
            totalTokens: { ...conv.totalTokens },
          } satisfies SerializedAgentConversation,
        ]),
      ),
    },
    mergeQueue: {
      entries: mergeQueue.entries.map((e) => ({
        id: e.id,
        agentId: e.agentId,
        agentName: e.agentName,
        branchName: e.branchName,
        worktreePath: e.worktreePath,
        status: e.status,
        position: e.position,
        addedAt: e.addedAt,
        mergedAt: e.mergedAt,
      })),
      defaultGates: [...mergeQueue.defaultGates],
    },
    verification: {
      agents: Object.fromEntries(
        [...verification.agents.entries()].map(([id, v]) => [
          id,
          {
            agentId: v.agentId,
            agentName: v.agentName,
            worktreePath: v.worktreePath,
            checks: v.checks.map((c) => ({
              name: c.name,
              command: c.command,
              status: c.status,
              exitCode: c.exitCode,
              durationMs: c.durationMs,
              lastRunAt: c.lastRunAt,
            })),
            overallStatus: v.overallStatus,
            lastRunAt: v.lastRunAt,
          },
        ]),
      ),
    },
    terminal: {
      tabs: [],
      activeTabId: null,
    },
  };
}

// ─── State application ─────────────────────────────────────────────

async function applyWorkspaceState(ws: WorkspaceFile): Promise<void> {
  // 1. Layout
  useLayoutStore.setState({
    primarySidebarVisible: ws.layout.primarySidebarVisible,
    secondarySidebarVisible: ws.layout.secondarySidebarVisible,
    panelVisible: ws.layout.panelVisible,
    activeActivityBarItem: ws.layout.activeActivityBarItem,
    primarySidebarSize: ws.layout.primarySidebarSize,
    secondarySidebarSize: ws.layout.secondarySidebarSize,
    panelSize: ws.layout.panelSize,
    primarySidebarPixelWidth: ws.layout.primarySidebarPixelWidth ?? 240,
    secondarySidebarPixelWidth: ws.layout.secondarySidebarPixelWidth ?? 300,
    horizontalLayout: ws.layout.horizontalLayout ?? [15, 60, 25],
    verticalLayout: ws.layout.verticalLayout ?? [70, 30],
    activePanelTab: ws.layout.activePanelTab,
    agentsViewMode: ws.layout.agentsViewMode,
    previewUrl: ws.layout.previewUrl,
    previewActive: ws.layout.previewActive,
    viewMode: ws.layout.viewMode ?? "claude",
    projectRootPath: ws.projectPath,
  });

  // 2. Editor — re-open tabs by reading content from disk
  const editorStore = useEditorStore.getState();
  editorStore.closeAllTabs();
  for (const tab of ws.editor.tabs) {
    try {
      const result = await invoke<{ content: string; language: string }>("read_file", {
        path: tab.path,
      });
      editorStore.openFile(tab.path, tab.name, tab.language, result.content, tab.isPreview);
    } catch {
      // File may have been deleted — skip silently
      console.warn(`Workspace restore: could not open ${tab.path}`);
    }
  }
  if (ws.editor.activeTabId) {
    // Only set active tab if it was successfully opened
    const currentTabs = useEditorStore.getState().tabs;
    if (currentTabs.some((t) => t.id === ws.editor.activeTabId)) {
      editorStore.setActiveTab(ws.editor.activeTabId!);
    }
  }
  // Restore markdown preview state
  for (const tabId of ws.editor.markdownPreviewTabIds) {
    const currentTabs = useEditorStore.getState().tabs;
    if (currentTabs.some((t) => t.id === tabId)) {
      editorStore.toggleMarkdownPreview(tabId);
    }
  }

  // 3. Conversation — restore messages for display continuity
  useConversationStore.getState().clearConversation();
  useConversationStore.setState({
    messages: ws.chat.messages.map(deserializeMessage),
    totalCost: ws.chat.totalCost,
    totalTokens: { ...ws.chat.totalTokens },
    session: ws.chat.lastSessionId
      ? {
          sessionId: ws.chat.lastSessionId,
          cliSessionId: ws.chat.lastCliSessionId ?? undefined,
        }
      : null,
  });

  // 4. Agents — restore from serialized state
  const agentsMap = new Map<string, Agent>();
  for (const sa of ws.agents.agents) {
    const agent: Agent = {
      id: sa.id,
      name: sa.name,
      status: sa.status,
      sessionId: null, // Sessions cannot be restored
      worktreePath: sa.worktreePath,
      branchName: sa.branchName,
      assignedFiles: sa.assignedFiles,
      taskDescription: sa.taskDescription,
      column: sa.column,
      cost: sa.cost,
      tokens: { ...sa.tokens },
      createdAt: sa.createdAt,
      lastActivityAt: sa.lastActivityAt,
      color: sa.color,
      model: sa.model,
      role: sa.role,
      parentId: sa.parentId,
      childIds: [...sa.childIds],
      pipeline: null, // Pipeline config is not persisted
      timeline: sa.timeline.map(
        (e): AgentTimelineEvent => ({
          id: e.id,
          timestamp: e.timestamp,
          type: e.type as AgentTimelineEvent["type"],
          summary: e.summary,
        }),
      ),
      errorMessage: sa.errorMessage,
      checkpoint: sa.checkpoint ? { ...sa.checkpoint } : undefined,
    };
    agentsMap.set(agent.id, agent);
  }
  useAgentsStore.setState({
    agents: agentsMap,
    columnOrder: {
      backlog: [...(ws.agents.columnOrder.backlog ?? [])],
      in_progress: [...(ws.agents.columnOrder.in_progress ?? [])],
      review: [...(ws.agents.columnOrder.review ?? [])],
      done: [...(ws.agents.columnOrder.done ?? [])],
    },
  });

  // 5. Merge queue — restore entries and default gates
  if (ws.mergeQueue) {
    useMergeQueueStore.setState({
      entries: ws.mergeQueue.entries.map((e) => ({
        ...e,
        gates: [],
        status: e.status as import("./mergeQueue").MergeQueueEntry["status"],
      })),
      defaultGates: [...ws.mergeQueue.defaultGates],
    });
  }

  // 6. Verification — restore agent verification state
  if (ws.verification) {
    const verMap = new Map<string, import("./verification").AgentVerification>();
    for (const [id, v] of Object.entries(ws.verification.agents)) {
      verMap.set(id, {
        agentId: v.agentId,
        agentName: v.agentName,
        worktreePath: v.worktreePath,
        checks: v.checks.map((c) => ({
          ...c,
          status: c.status as import("./verification").CheckStatus,
        })),
        overallStatus: v.overallStatus as import("./verification").CheckStatus,
        lastRunAt: v.lastRunAt,
      });
    }
    useVerificationStore.setState({ agents: verMap });
  }

  // 7. Agent conversations — restore per-agent messages
  if (ws.agentConversations) {
    const convMap = new Map<string, import("./agentConversations").AgentConversationState>();
    for (const [agentId, serialized] of Object.entries(ws.agentConversations.conversations)) {
      convMap.set(agentId, {
        messages: serialized.messages.map(deserializeMessage),
        isStreaming: false,
        isThinking: false,
        thinkingStartedAt: null,
        activeBlocks: new Map(),
        activeMessageId: null,
        session: null,
        totalCost: serialized.totalCost,
        totalTokens: { ...serialized.totalTokens },
        lastResult: null,
        connectionStatus: "disconnected",
        connectionError: null,
        pendingPermission: null,
      });
    }
    useAgentConversationsStore.setState({ conversations: convMap });
  }
}

// ─── Debounce helper ───────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(saveFn: () => Promise<void>): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveFn().catch((err) => {
      console.error("Auto-save failed:", err);
    });
  }, AUTO_SAVE_DEBOUNCE_MS);
}

// ─── Extract project name from path ────────────────────────────────

function projectName(projectPath: string): string {
  const normalized = normalizePath(projectPath).replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "Untitled";
}

// ─── Store implementation ──────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceManagerState>()(
  (set, get) => ({
    currentProjectPath: null,
    recentProjects: [],
    isSaving: false,
    isLoading: false,

    async openProject(projectPath: string) {
      const { currentProjectPath } = get();

      set({ isLoading: true });

      try {
        // 1. Save current workspace if switching
        if (currentProjectPath) {
          try {
            const state = collectWorkspaceState(currentProjectPath);
            await saveWorkspace(currentProjectPath, state);
          } catch (err) {
            console.error("Failed to save previous workspace:", err);
          }
        }

        // 2. Reset all workspace-scoped stores
        useLayoutStore.getState().resetToDefaults();
        useEditorStore.getState().resetToDefaults();
        useConversationStore.getState().resetToDefaults();
        useAgentsStore.getState().resetToDefaults();
        useMergeQueueStore.getState().resetToDefaults();
        useVerificationStore.getState().resetToDefaults();
        useUsageStore.getState().reset();
        useAgentConversationsStore.getState().resetToDefaults();

        // 3. Load workspace for the new project
        const ws = await loadOrCreateWorkspace(projectPath);

        // 4. Apply loaded state to all stores
        await applyWorkspaceState(ws);

        // 5. Update recent projects list
        const name = projectName(projectPath);
        const updated = await touchRecentProject(projectPath, name);
        set({ recentProjects: updated });

        // 6. Update window title
        try {
          await getCurrentWindow().setTitle(`${name} - Vantage`);
        } catch {
          // Non-critical — may fail in browser mock
        }

        // 7. Set the current project path
        set({ currentProjectPath: projectPath });

        // 8. File watcher is started by useFileTree hook when projectRootPath changes.
        // Do NOT start it here to avoid double-registration (useFileTree owns the watcher lifecycle).
      } finally {
        set({ isLoading: false });
      }
    },

    async closeProject() {
      const { currentProjectPath } = get();

      if (currentProjectPath) {
        // Save before closing
        try {
          const state = collectWorkspaceState(currentProjectPath);
          await saveWorkspace(currentProjectPath, state);
        } catch (err) {
          console.error("Failed to save workspace on close:", err);
        }

        // Stop file watcher
        try {
          await invoke("stop_file_watcher");
        } catch {
          // Non-critical
        }

        // Stop Claude sessions
        try {
          await invoke("claude_stop_all_sessions");
        } catch {
          // Non-critical
        }
      }

      // Reset all stores
      useLayoutStore.getState().resetToDefaults();
      useEditorStore.getState().resetToDefaults();
      useConversationStore.getState().resetToDefaults();
      useAgentsStore.getState().resetToDefaults();
      useMergeQueueStore.getState().resetToDefaults();
      useVerificationStore.getState().resetToDefaults();
      useUsageStore.getState().reset();
      useAgentConversationsStore.getState().resetToDefaults();

      // Clear the project path in layout store
      useLayoutStore.setState({ projectRootPath: null });

      // Reset window title
      try {
        await getCurrentWindow().setTitle("Vantage");
      } catch {
        // Non-critical
      }

      set({ currentProjectPath: null });
    },

    async saveCurrentWorkspace() {
      const { currentProjectPath, isSaving } = get();
      if (!currentProjectPath || isSaving) return;

      set({ isSaving: true });
      try {
        const state = collectWorkspaceState(currentProjectPath);
        await saveWorkspace(currentProjectPath, state);
      } catch (err) {
        console.error("Failed to save workspace:", err);
        const message = err instanceof Error ? err.message : String(err);
        toast.error("Failed to save workspace", { description: message });
      } finally {
        set({ isSaving: false });
      }
    },

    async loadRecentProjectsList() {
      try {
        const projects = await loadRecentProjects();
        set({ recentProjects: projects });
      } catch (err) {
        console.error("Failed to load recent projects:", err);
      }
    },

    async removeRecentProject(projectPath: string) {
      const { recentProjects } = get();
      const normalized = normalizePath(projectPath);
      const updated = recentProjects.filter(
        (p) => normalizePath(p.path) !== normalized,
      );
      set({ recentProjects: updated });
      await saveRecentProjects(updated).catch((err) => {
        console.error("Failed to save recent projects:", err);
      });
    },

    async togglePinProject(projectPath: string) {
      const { recentProjects } = get();
      const normalized = normalizePath(projectPath);
      const updated = recentProjects.map((p) =>
        normalizePath(p.path) === normalized
          ? { ...p, pinned: !p.pinned }
          : p,
      );
      set({ recentProjects: updated });
      await saveRecentProjects(updated).catch((err) => {
        console.error("Failed to save recent projects:", err);
      });
    },

    markDirty() {
      const { currentProjectPath } = get();
      if (!currentProjectPath) return;
      debouncedSave(() => get().saveCurrentWorkspace());
    },

    startAutoSave() {
      const markDirty = () => get().markDirty();

      // Subscribe to workspace-scoped store changes using Zustand's basic
      // subscribe(listener) API. We track previous snapshot values manually
      // to avoid saving on every state change (e.g., content edits, streaming).
      const unsubs: Array<() => void> = [];

      // Editor: tab open/close, active tab change (NOT content — too frequent)
      let prevEditorSnap = {
        tabIds: useEditorStore.getState().tabs.map((t) => t.id).join(","),
        activeTabId: useEditorStore.getState().activeTabId,
      };
      unsubs.push(
        useEditorStore.subscribe((state) => {
          const tabIds = state.tabs.map((t) => t.id).join(",");
          const activeTabId = state.activeTabId;
          if (tabIds !== prevEditorSnap.tabIds || activeTabId !== prevEditorSnap.activeTabId) {
            prevEditorSnap = { tabIds, activeTabId };
            markDirty();
          }
        }),
      );

      // Layout: sidebar/panel changes
      let prevLayoutSnap = (() => {
        const s = useLayoutStore.getState();
        return `${s.primarySidebarVisible}|${s.secondarySidebarVisible}|${s.panelVisible}|${s.activeActivityBarItem}|${s.primarySidebarSize}|${s.secondarySidebarSize}|${s.panelSize}|${s.activePanelTab}|${s.agentsViewMode}|${s.primarySidebarPixelWidth}|${s.secondarySidebarPixelWidth}|${s.horizontalLayout.join(",")}|${s.verticalLayout.join(",")}`;
      })();
      unsubs.push(
        useLayoutStore.subscribe((state) => {
          const snap = `${state.primarySidebarVisible}|${state.secondarySidebarVisible}|${state.panelVisible}|${state.activeActivityBarItem}|${state.primarySidebarSize}|${state.secondarySidebarSize}|${state.panelSize}|${state.activePanelTab}|${state.agentsViewMode}|${state.primarySidebarPixelWidth}|${state.secondarySidebarPixelWidth}|${state.horizontalLayout.join(",")}|${state.verticalLayout.join(",")}`;
          if (snap !== prevLayoutSnap) {
            prevLayoutSnap = snap;
            markDirty();
          }
        }),
      );

      // Conversation: message count changes (not every streaming delta)
      let prevMsgCount = useConversationStore.getState().messages.length;
      unsubs.push(
        useConversationStore.subscribe((state) => {
          if (state.messages.length !== prevMsgCount) {
            prevMsgCount = state.messages.length;
            markDirty();
          }
        }),
      );

      // Agents: agent count changes
      let prevAgentCount = useAgentsStore.getState().agents.size;
      unsubs.push(
        useAgentsStore.subscribe((state) => {
          if (state.agents.size !== prevAgentCount) {
            prevAgentCount = state.agents.size;
            markDirty();
          }
        }),
      );

      // Return cleanup function
      return () => {
        unsubs.forEach((unsub) => unsub());
        if (saveTimer !== null) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
      };
    },
  }),
);
