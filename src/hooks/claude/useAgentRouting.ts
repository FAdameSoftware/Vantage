/**
 * useAgentRouting — Multi-agent session management. Handles starting,
 * messaging, and stopping agent-specific Claude sessions, plus event
 * listeners for agent auto-start / investigate workflows.
 */

import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConversationStore } from "@/stores/conversation";
import { useSettingsStore } from "@/stores/settings";
import { useAgentsStore } from "@/stores/agents";
import { useAgentConversationsStore } from "@/stores/agentConversations";
import { useLayoutStore } from "@/stores/layout";

export function useAgentRouting() {
  // ── Multi-agent: start a session for a specific agent ──

  const startAgentSession = useCallback(async (agentId: string, cwd: string) => {
    const agentsStore = useAgentsStore.getState();
    const agent = agentsStore.agents.get(agentId);
    if (!agent) return;

    agentsStore.updateAgentStatus(agentId, "working");

    try {
      // Resolve worktree: use existing one or create a new one
      let worktreeCwd = agent.worktreePath;

      if (!worktreeCwd) {
        // Generate worktree path and branch name via Rust helpers (parallelized)
        const [worktreePath, branchName] = await Promise.all([
          invoke<string>("get_agent_worktree_path", {
            repoPath: cwd,
            agentName: agent.name,
            agentId: agent.id,
          }),
          invoke<string>("get_agent_branch_name", {
            agentName: agent.name,
            agentId: agent.id,
          }),
        ]);

        // Create the worktree
        await invoke<{ path: string; branch: string }>("create_worktree", {
          repoPath: cwd,
          branchName,
          worktreePath,
        });

        // Link worktree to agent in the store
        agentsStore.linkWorktree(agentId, worktreePath, branchName);
        worktreeCwd = worktreePath;
      }

      const sessionId = await invoke<string>("claude_start_session", {
        cwd: worktreeCwd,
        sessionId: null,
        resume: false,
        effortLevel: useSettingsStore.getState().effortLevel,
        planMode: false,
        fromPr: null,
        skipPermissions: useSettingsStore.getState().skipPermissions ?? false,
      });
      agentsStore.linkSession(agentId, sessionId);
    } catch (err) {
      agentsStore.updateAgentStatus(agentId, "error", String(err));
    }
  }, []);

  // ── Multi-agent: send a message to a specific agent's session ──

  const sendAgentMessage = useCallback(
    async (agentId: string, content: string) => {
      const agent = useAgentsStore.getState().agents.get(agentId);
      if (!agent?.sessionId) return;

      useAgentConversationsStore.getState().updateConversation(agentId, (prev) => ({
        messages: [
          ...prev.messages,
          {
            id: crypto.randomUUID(),
            role: "user" as const,
            text: content,
            thinking: "",
            toolCalls: [],
            timestamp: Date.now(),
            parentToolUseId: null,
          },
        ],
      }));

      try {
        await invoke("claude_send_message", {
          sessionId: agent.sessionId,
          content,
        });
      } catch (err) {
        useAgentsStore
          .getState()
          .updateAgentStatus(agentId, "error", String(err));
      }
    },
    [],
  );

  // ── Multi-agent: stop an agent's session ──

  const stopAgentSession = useCallback(async (agentId: string) => {
    const agent = useAgentsStore.getState().agents.get(agentId);
    if (!agent?.sessionId) return;

    try {
      await invoke("claude_stop_session", { sessionId: agent.sessionId });
    } catch (err) {
      // Session may already be dead — log but don't propagate
      console.warn("Failed to stop agent session (may already be dead):", err);
    }

    useAgentsStore.getState().updateAgentStatus(agentId, "completed");
    useAgentsStore.getState().linkSession(agentId, "");
  }, []);

  // ── Listen for "Investigate with Claude" events from file explorer ──

  useEffect(() => {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        agentId: string;
        taskDescription: string;
        cwd: string;
      };
      await startAgentSession(detail.agentId, detail.cwd);
      // Small delay to let session initialize before sending the prompt
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void sendAgentMessage(detail.agentId, detail.taskDescription);
      }, 1000);
    };
    window.addEventListener("vantage:investigate", handler);
    return () => {
      window.removeEventListener("vantage:investigate", handler);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [startAgentSession, sendAgentMessage]);

  // ── Listen for agent auto-start events from CreateAgentDialog ──

  useEffect(() => {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        agentId: string;
        taskDescription: string;
      };
      // Resolve CWD from current session or project root
      const cwd =
        useConversationStore.getState().session?.cwd ??
        useLayoutStore.getState().projectRootPath ??
        ".";
      await startAgentSession(detail.agentId, cwd);
      // Small delay to let session initialize before sending the prompt
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        void sendAgentMessage(detail.agentId, detail.taskDescription);
      }, 1000);
    };
    window.addEventListener("vantage:agent-auto-start", handler);
    return () => {
      window.removeEventListener("vantage:agent-auto-start", handler);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [startAgentSession, sendAgentMessage]);

  return {
    startAgentSession,
    sendAgentMessage,
    stopAgentSession,
  };
}
