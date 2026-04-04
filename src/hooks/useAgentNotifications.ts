import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAgentsStore, type AgentStatus } from "@/stores/agents";

// Dynamically import the notification plugin to avoid issues
// if the plugin is not available during SSR or testing.
async function sendSystemNotification(title: string, body: string) {
  try {
    const {
      isPermissionGranted,
      requestPermission,
      sendNotification,
    } = await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // Notification plugin not available (e.g., in tests or web preview)
  }
}

const STALL_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Watches agent status changes and fires system notifications + toasts.
 *
 * - Agent completes: system notification + toast
 * - Agent errors: system notification + toast
 * - Agent needs permission: toast only (user needs to act in-app)
 * - Agent stalls (no timeline event for 60s): toast warning
 */
export function useAgentNotifications() {
  // Track previous statuses to detect transitions
  const prevStatusesRef = useRef<Map<string, AgentStatus>>(new Map());
  // Track last activity timestamps for stall detection
  const stallTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const unsubscribe = useAgentsStore.subscribe((state) => {
      const prevStatuses = prevStatusesRef.current;
      const nextStatuses = new Map<string, AgentStatus>();

      for (const [agentId, agent] of state.agents) {
        nextStatuses.set(agentId, agent.status);
        const prevStatus = prevStatuses.get(agentId);

        // Only fire on actual status transitions
        if (prevStatus === agent.status) continue;

        // Agent completed
        if (agent.status === "completed" && prevStatus && prevStatus !== "completed") {
          toast.success(`${agent.name} completed`, {
            description: agent.taskDescription.slice(0, 80),
          });
          sendSystemNotification(
            `${agent.name} completed`,
            agent.taskDescription.slice(0, 120)
          );
        }

        // Agent errored
        if (agent.status === "error" && prevStatus && prevStatus !== "error") {
          toast.error(`${agent.name} encountered an error`, {
            description: agent.errorMessage?.slice(0, 80) ?? "Unknown error",
          });
          sendSystemNotification(
            `${agent.name} error`,
            agent.errorMessage?.slice(0, 120) ?? "An error occurred"
          );
        }

        // Agent needs permission (toast only -- user must act in-app)
        if (
          agent.status === "waiting_permission" &&
          prevStatus &&
          prevStatus !== "waiting_permission"
        ) {
          toast.warning(`${agent.name} needs permission`, {
            description: "An action requires your approval",
          });
        }

        // Stall detection: set up timer for working agents
        if (agent.status === "working") {
          // Clear any existing stall timer
          const existingTimer = stallTimersRef.current.get(agentId);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = setTimeout(() => {
            // Re-check the current state when timer fires
            const currentAgent = useAgentsStore.getState().agents.get(agentId);
            if (!currentAgent || currentAgent.status !== "working") return;

            // Check if lastActivityAt is stale
            const elapsed = Date.now() - currentAgent.lastActivityAt;
            if (elapsed >= STALL_TIMEOUT_MS) {
              toast.warning(`${currentAgent.name} may be stalled`, {
                description: "No activity for 60 seconds",
              });

              // Update agent status to stalled
              useAgentsStore.getState().updateAgentStatus(agentId, "stalled");
            }
          }, STALL_TIMEOUT_MS);

          stallTimersRef.current.set(agentId, timer);
        } else {
          // Clear stall timer for non-working agents
          const existingTimer = stallTimersRef.current.get(agentId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            stallTimersRef.current.delete(agentId);
          }
        }
      }

      // Clean up timers for removed agents
      for (const [agentId] of prevStatuses) {
        if (!nextStatuses.has(agentId)) {
          const timer = stallTimersRef.current.get(agentId);
          if (timer) {
            clearTimeout(timer);
            stallTimersRef.current.delete(agentId);
          }
        }
      }

      prevStatusesRef.current = nextStatuses;
    });

    return () => {
      unsubscribe();
      // Clear all stall timers on unmount
      for (const timer of stallTimersRef.current.values()) {
        clearTimeout(timer);
      }
      stallTimersRef.current.clear();
    };
  }, []);
}
