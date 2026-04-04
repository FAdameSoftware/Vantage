import { useEffect, useRef, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  useConversationStore,
  type SessionMetadata,
  type ActiveBlock,
} from "@/stores/conversation";
import { useSettingsStore } from "@/stores/settings";
import { useAgentsStore } from "@/stores/agents";
import { useAgentConversationsStore } from "@/stores/agentConversations";
import type {
  ClaudeOutputMessage,
  PermissionRequestPayload,
  ClaudeStatusPayload,
  StreamEventMessage,
  AssistantMessage,
  ResultMessage,
  SystemInitMessage,
  ContentBlockStartBlock,
} from "@/lib/protocol";
import type { AgentConversationState } from "@/stores/agentConversations";

// ─── Helper: generate a simple unique ID ─────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Helper: route an event to the correct agent (if any) ───────────────────

function routeAgentEvent(
  sessionId: string | undefined,
  handler: (agentId: string) => void,
): boolean {
  if (!sessionId) return false;
  const agent = useAgentsStore.getState().getAgentBySessionId(sessionId);
  if (agent) {
    handler(agent.id);
    return true;
  }
  return false;
}

// ─── Helper: apply a stream event to an AgentConversationState snapshot ─────

function applyStreamEventToSnapshot(
  prev: AgentConversationState,
  msg: StreamEventMessage,
  sessionModel: string | undefined,
): Partial<AgentConversationState> {
  const event = msg.event;

  switch (event.type) {
    case "message_start": {
      return {
        isStreaming: true,
        activeBlocks: new Map(),
        activeMessageId: event.message.id,
        connectionStatus: "streaming",
      };
    }

    case "content_block_start": {
      const block = event.content_block as ContentBlockStartBlock;
      const newBlock: ActiveBlock = {
        index: event.index,
        type: block.type as "text" | "thinking" | "tool_use",
        text:
          block.type === "text"
            ? block.text
            : block.type === "thinking"
              ? block.thinking
              : "",
        toolUseId: block.type === "tool_use" ? block.id : undefined,
        toolName: block.type === "tool_use" ? block.name : undefined,
        inputJson: "",
        isComplete: false,
      };
      const isThinking = block.type === "thinking";
      const nextBlocks = new Map(prev.activeBlocks);
      nextBlocks.set(event.index, newBlock);
      return {
        activeBlocks: nextBlocks,
        isThinking: isThinking ? true : prev.isThinking,
        thinkingStartedAt: isThinking
          ? (prev.thinkingStartedAt ?? Date.now())
          : prev.thinkingStartedAt,
      };
    }

    case "content_block_delta": {
      const { index, delta } = event;
      const existing = prev.activeBlocks.get(index);
      if (!existing) return {};
      const updated: ActiveBlock = { ...existing };
      if (delta.type === "text_delta") {
        updated.text += delta.text;
      } else if (delta.type === "thinking_delta") {
        updated.text += delta.thinking;
      } else if (delta.type === "input_json_delta") {
        updated.inputJson += delta.partial_json;
      }
      const nextBlocks = new Map(prev.activeBlocks);
      nextBlocks.set(index, updated);
      return { activeBlocks: nextBlocks };
    }

    case "content_block_stop": {
      const { index } = event;
      const existing = prev.activeBlocks.get(index);
      if (!existing) return {};
      const updated: ActiveBlock = { ...existing, isComplete: true };
      const nextBlocks = new Map(prev.activeBlocks);
      nextBlocks.set(index, updated);
      const isThinkingEnding = existing.type === "thinking";
      return {
        activeBlocks: nextBlocks,
        isThinking: isThinkingEnding ? false : prev.isThinking,
        thinkingStartedAt: isThinkingEnding ? null : prev.thinkingStartedAt,
      };
    }

    case "message_delta": {
      return {};
    }

    case "message_stop": {
      const assembled = assembleMessageFromBlocks(
        prev.activeMessageId ?? generateId(),
        prev.activeBlocks,
        sessionModel,
        msg.parent_tool_use_id ?? null,
        undefined,
      );
      return {
        messages: [...prev.messages, assembled],
        isStreaming: false,
        isThinking: false,
        thinkingStartedAt: null,
        activeBlocks: new Map(),
        activeMessageId: null,
        connectionStatus: "ready",
      };
    }

    default:
      return {};
  }
}

// ─── Helper: assemble activeBlocks into a ConversationMessage ────────────────

function assembleMessageFromBlocks(
  messageId: string,
  activeBlocks: Map<number, ActiveBlock>,
  model: string | undefined,
  parentToolUseId: string | null,
  stopReason: string | undefined,
) {
  const sortedBlocks = [...activeBlocks.values()].sort(
    (a, b) => a.index - b.index,
  );
  let text = "";
  let thinking = "";
  const toolCalls: import("@/stores/conversation").ToolCall[] = [];

  for (const block of sortedBlocks) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "thinking") {
      thinking += block.text;
    } else if (block.type === "tool_use") {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(block.inputJson || "{}") as Record<string, unknown>;
      } catch {
        // leave as empty object if JSON is malformed
      }
      toolCalls.push({
        id: block.toolUseId ?? generateId(),
        name: block.toolName ?? "",
        input,
        inputJson: block.inputJson,
        isExecuting: false,
      });
    }
  }

  return {
    id: messageId,
    role: "assistant" as const,
    text,
    thinking,
    toolCalls,
    model,
    timestamp: Date.now(),
    parentToolUseId,
    stopReason,
  };
}

// ─── Helper: extract a ConversationMessage from an AssistantMessage ──────────

function extractFromAssistantMsg(msg: AssistantMessage) {
  let text = "";
  let thinking = "";
  const toolCalls: import("@/stores/conversation").ToolCall[] = [];

  for (const block of msg.message.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "thinking") {
      thinking += block.thinking;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input,
        inputJson: JSON.stringify(block.input),
        isExecuting: false,
      });
    }
  }

  return {
    id: msg.message.id,
    role: "assistant" as const,
    text,
    thinking,
    toolCalls,
    model: msg.message.model,
    usage: msg.message.usage,
    timestamp: Date.now(),
    parentToolUseId: msg.parent_tool_use_id,
    stopReason: msg.message.stop_reason,
  };
}

// ─── Tauri event bridge ─────────────────────────────────────────────────────

export function useClaude() {
  const sessionIdRef = useRef<string | null>(null);

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
  const addUserMessage = useConversationStore((s) => s.addUserMessage);
  const setSession = useConversationStore((s) => s.setSession);
  const clearConversation = useConversationStore((s) => s.clearConversation);

  // ── Set up Tauri event listeners ──

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    async function setupListeners() {
      // claude_message — the main message bus
      const unlistenMessage = await listen<ClaudeOutputMessage>(
        "claude_message",
        (event) => {
          const msg = event.payload;

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
      unlisteners.push(unlistenStatus);
    }

    setupListeners();

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [
    handleSystemInit,
    handleStreamEvent,
    handleAssistantMessage,
    handleResult,
    setPendingPermission,
    setConnectionStatus,
  ]);

  // ── Action: start a session ──

  const startSession = useCallback(
    async (cwd: string, resumeSessionId?: string) => {
      setConnectionStatus("starting");
      try {
        const settings = useSettingsStore.getState();
        const id = await invoke<string>("start_claude_session", {
          cwd,
          resumeSessionId: resumeSessionId ?? null,
          effortLevel: settings.effortLevel,
          planMode: settings.planMode,
          fromPr: null,
        });
        sessionIdRef.current = id;
        const session: SessionMetadata = {
          sessionId: id,
          cwd,
        };
        setSession(session);
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [setConnectionStatus, setSession],
  );

  // ── Action: send a message (auto-starts session if needed) ──

  const sendMessage = useCallback(
    async (content: string, cwd?: string) => {
      // If no active session, auto-start one first
      if (!sessionIdRef.current) {
        const sessionCwd =
          cwd ??
          useConversationStore.getState().session?.cwd ??
          "C:/CursorProjects/Vantage";
        setConnectionStatus("starting");
        try {
          const settings = useSettingsStore.getState();
          const id = await invoke<string>("start_claude_session", {
            cwd: sessionCwd,
            resumeSessionId: null,
            effortLevel: settings.effortLevel,
            planMode: settings.planMode,
            fromPr: null,
          });
          sessionIdRef.current = id;
          const session: SessionMetadata = {
            sessionId: id,
            cwd: sessionCwd,
          };
          setSession(session);
        } catch (err) {
          setConnectionStatus("error", String(err));
          return;
        }
      }

      // Optimistically add the user message to the store
      addUserMessage(content);
      try {
        await invoke("send_claude_message", {
          sessionId: sessionIdRef.current,
          message: content,
        });
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [addUserMessage, setConnectionStatus, setSession],
  );

  // ── Action: respond to a permission request ──

  const respondPermission = useCallback(
    async (
      allow: boolean,
      updatedInput?: Record<string, unknown>,
      denyReason?: string,
    ) => {
      if (!sessionIdRef.current) return;
      try {
        await invoke("claude_respond_permission", {
          sessionId: sessionIdRef.current,
          allow,
          updatedInput: updatedInput ?? null,
          denyReason: denyReason ?? null,
        });
        setPendingPermission(null);
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [setPendingPermission, setConnectionStatus],
  );

  // ── Action: interrupt (stop streaming) ──

  const interruptSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await invoke("claude_interrupt_session", {
        sessionId: sessionIdRef.current,
      });
    } catch (err) {
      setConnectionStatus("error", String(err));
    }
  }, [setConnectionStatus]);

  // ── Action: stop session completely ──

  const stopSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await invoke("claude_stop_session", {
        sessionId: sessionIdRef.current,
      });
    } catch {
      // Ignore errors on stop — session may already be dead
    }
    sessionIdRef.current = null;
    clearConversation();
  }, [clearConversation]);

  // ── Multi-agent: start a session for a specific agent ──

  const startAgentSession = useCallback(async (agentId: string, cwd: string) => {
    const agentsStore = useAgentsStore.getState();
    agentsStore.updateAgentStatus(agentId, "working");

    try {
      const sessionId = await invoke<string>("claude_start_session", {
        cwd,
        sessionId: null,
        resume: false,
        effortLevel: useSettingsStore.getState().effortLevel,
        planMode: false,
        fromPr: null,
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
    } catch {
      // Session may already be dead
    }

    useAgentsStore.getState().updateAgentStatus(agentId, "completed");
    useAgentsStore.getState().linkSession(agentId, "");
  }, []);

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
}
