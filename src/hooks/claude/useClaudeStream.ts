/**
 * useClaudeStream — Sets up Tauri event listeners for Claude messages,
 * permissions, and status updates. Routes events to the correct store
 * (main conversation or agent conversation).
 */

import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useConversationStore } from "@/stores/conversation";
import { useAgentsStore } from "@/stores/agents";
import { useAgentConversationsStore } from "@/stores/agentConversations";
import type {
  ClaudeOutputMessage,
  ClaudeEventPayload,
  PermissionRequestPayload,
  ClaudeStatusPayload,
  StreamEventMessage,
  AssistantMessage,
  ResultMessage,
  SystemInitMessage,
} from "@/lib/protocol";
import {
  routeAgentEvent,
  applyStreamEventToSnapshot,
  extractFromAssistantMsg,
  capturePendingDiffs,
  handleViewIntegration,
  cancelAllDiffTimeouts,
} from "./helpers";

export function useClaudeStream() {
  const handleSystemInit = useConversationStore((s) => s.handleSystemInit);
  const handleStreamEvent = useConversationStore((s) => s.handleStreamEvent);
  const handleAssistantMessage = useConversationStore(
    (s) => s.handleAssistantMessage,
  );
  const handleResult = useConversationStore((s) => s.handleResult);
  const setPendingPermission = useConversationStore(
    (s) => s.setPendingPermission,
  );
  const setConnectionStatus = useConversationStore(
    (s) => s.setConnectionStatus,
  );

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    async function setupListeners() {
      // claude_message — the main message bus
      // Rust emits ClaudeEventPayload { session_id, message } — unwrap the envelope
      const unlistenMessage = await listen<ClaudeEventPayload>(
        "claude_message",
        (event) => {
          const payload = event.payload;
          const msg = payload.message as ClaudeOutputMessage;

          switch (msg.type) {
            case "system": {
              if (msg.subtype === "init") {
                const initMsg = msg as SystemInitMessage;
                // Route to agent if session matches
                const routed = routeAgentEvent(
                  initMsg.session_id,
                  (agentId) => {
                    useAgentConversationsStore
                      .getState()
                      .updateConversation(agentId, () => ({
                        session: {
                          sessionId: initMsg.session_id,
                          model: initMsg.model,
                          claudeCodeVersion: initMsg.claude_code_version,
                          tools: initMsg.tools,
                          permissionMode: initMsg.permissionMode,
                          cwd: initMsg.cwd,
                        },
                        connectionStatus: "ready",
                      }));
                  },
                );
                if (!routed) {
                  handleSystemInit(initMsg);
                }
              }
              // api_retry and compact_boundary are informational — ignored for now
              break;
            }

            case "stream_event": {
              const streamMsg = msg as StreamEventMessage;
              const routed = routeAgentEvent(
                streamMsg.session_id,
                (agentId) => {
                  // Update agent status to working
                  useAgentsStore
                    .getState()
                    .updateAgentStatus(agentId, "working");

                  // Track tool_use blocks for timeline
                  if (
                    streamMsg.event.type === "content_block_start" &&
                    streamMsg.event.content_block.type === "tool_use"
                  ) {
                    const toolBlock = streamMsg.event.content_block;
                    useAgentsStore.getState().addTimelineEvent(agentId, {
                      type: "tool_call",
                      summary: `Tool: ${toolBlock.name}`,
                      toolName: toolBlock.name,
                    });
                  }

                  useAgentConversationsStore
                    .getState()
                    .updateConversation(agentId, (prev) => {
                      const sessionModel = prev.session?.model;
                      return applyStreamEventToSnapshot(
                        prev,
                        streamMsg,
                        sessionModel,
                      );
                    });
                },
              );
              if (!routed) {
                handleStreamEvent(streamMsg);
              }
              break;
            }

            case "assistant": {
              const assistantMsg = msg as AssistantMessage;
              const routed = routeAgentEvent(
                assistantMsg.session_id,
                (agentId) => {
                  const assembled = extractFromAssistantMsg(assistantMsg);
                  useAgentConversationsStore
                    .getState()
                    .updateConversation(agentId, (prev) => {
                      const existingIdx = prev.messages.findIndex(
                        (m) => m.id === assembled.id,
                      );
                      if (existingIdx !== -1) {
                        const updated = [...prev.messages];
                        updated[existingIdx] = assembled;
                        return { messages: updated };
                      }
                      return { messages: [...prev.messages, assembled] };
                    });
                },
              );
              if (!routed) {
                handleAssistantMessage(assistantMsg);
              }
              // Capture before/after diffs for Edit/Write tool calls
              capturePendingDiffs(assistantMsg);
              // View Integration: open background tabs, flash terminal indicator
              handleViewIntegration(assistantMsg);
              break;
            }

            case "result": {
              const resultMsg = msg as ResultMessage;
              const routed = routeAgentEvent(
                resultMsg.session_id,
                (agentId) => {
                  // Update agent cost
                  useAgentsStore.getState().updateAgentCost(
                    agentId,
                    resultMsg.total_cost_usd ?? 0,
                    {
                      input: resultMsg.usage?.input_tokens ?? 0,
                      output: resultMsg.usage?.output_tokens ?? 0,
                    },
                  );

                  const summary = {
                    durationMs: resultMsg.duration_ms,
                    durationApiMs: resultMsg.duration_api_ms,
                    numTurns: resultMsg.num_turns,
                    totalCostUsd: resultMsg.total_cost_usd,
                    usage: resultMsg.usage,
                    isError: resultMsg.is_error,
                    errors: resultMsg.errors,
                  };
                  useAgentConversationsStore
                    .getState()
                    .updateConversation(agentId, (prev) => ({
                      lastResult: summary,
                      totalCost:
                        prev.totalCost + (resultMsg.total_cost_usd ?? 0),
                      totalTokens: {
                        input:
                          prev.totalTokens.input +
                          (resultMsg.usage?.input_tokens ?? 0),
                        output:
                          prev.totalTokens.output +
                          (resultMsg.usage?.output_tokens ?? 0),
                      },
                      connectionStatus: "ready",
                      isStreaming: false,
                    }));

                  // Update agent status after result
                  if (!resultMsg.is_error) {
                    useAgentsStore
                      .getState()
                      .updateAgentStatus(agentId, "reviewing");
                  } else {
                    useAgentsStore
                      .getState()
                      .updateAgentStatus(
                        agentId,
                        "error",
                        resultMsg.errors?.[0],
                      );
                  }
                },
              );
              if (!routed) {
                handleResult(resultMsg);
              }
              break;
            }

            default:
              break;
          }
        },
      );
      if (cancelled) { unlistenMessage(); return; }
      unlisteners.push(unlistenMessage);

      // claude_permission_request
      const unlistenPermission = await listen<PermissionRequestPayload>(
        "claude_permission_request",
        (event) => {
          const payload = event.payload;
          const routed = routeAgentEvent(payload.session_id, (agentId) => {
            // Update agent status
            useAgentsStore
              .getState()
              .updateAgentStatus(agentId, "waiting_permission");

            // Store pending permission in the agent's conversation state
            useAgentConversationsStore
              .getState()
              .updateConversation(agentId, () => ({
                pendingPermission: {
                  sessionId: payload.session_id,
                  toolName: payload.tool_name,
                  toolInput: payload.tool_input,
                },
              }));
          });
          if (!routed) {
            setPendingPermission(payload);
          }
        },
      );
      if (cancelled) { unlistenPermission(); return; }
      unlisteners.push(unlistenPermission);

      // claude_status
      const unlistenStatus = await listen<ClaudeStatusPayload>(
        "claude_status",
        (event) => {
          const { status, error } = event.payload;
          const mapped = status as
            | "disconnected"
            | "starting"
            | "ready"
            | "streaming"
            | "error"
            | "stopped";
          setConnectionStatus(mapped, error);
        },
      );
      if (cancelled) { unlistenStatus(); return; }
      unlisteners.push(unlistenStatus);
    }

    setupListeners();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
      // Cancel any pending diff capture timeouts when listeners are torn down
      cancelAllDiffTimeouts();
    };
  }, [
    handleSystemInit,
    handleStreamEvent,
    handleAssistantMessage,
    handleResult,
    setPendingPermission,
    setConnectionStatus,
  ]);
}
