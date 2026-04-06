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
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import type {
  ClaudeOutputMessage,
  ClaudeEventPayload,
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
  const toolResults: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = [];

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
    } else if (block.type === "tool_result") {
      toolResults.push({
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      });
    }
  }

  // Attach tool_result output to matching tool_use entries
  for (const result of toolResults) {
    const matchingCall = toolCalls.find((tc) => tc.id === result.tool_use_id);
    if (matchingCall) {
      matchingCall.output = result.content;
      matchingCall.isError = result.is_error ?? false;
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

// ─── Helper: capture pending diffs for Edit/Write tool calls ───────────────

// Track active diff capture timeouts so they can be cancelled on cleanup
// or when a new capture supersedes an old one for the same file.
const pendingDiffTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function cancelAllDiffTimeouts() {
  for (const timer of pendingDiffTimeouts.values()) {
    clearTimeout(timer);
  }
  pendingDiffTimeouts.clear();
}

function capturePendingDiffs(assistantMsg: AssistantMessage) {
  const editorStore = useEditorStore.getState();
  for (const block of assistantMsg.message.content) {
    if (block.type !== "tool_use") continue;
    const toolName = block.name;
    if (toolName !== "Edit" && toolName !== "Write") continue;

    const input = block.input as Record<string, unknown>;
    const filePath = (input.file_path ?? input.path ?? "") as string;
    if (!filePath) continue;

    // Normalize path to match editor tab IDs
    let normalizedPath = filePath.replace(/\\/g, "/");
    if (/^[A-Z]:\//.test(normalizedPath)) {
      normalizedPath = normalizedPath[0].toLowerCase() + normalizedPath.slice(1);
    }

    // Snapshot the current content as "before" from the editor store
    const tab = editorStore.tabs.find((t) => t.id === normalizedPath);
    const beforeContent = tab?.content ?? tab?.savedContent ?? "";

    // Cancel any previous pending capture for the same file (debounce per-file)
    const existing = pendingDiffTimeouts.get(normalizedPath);
    if (existing) {
      clearTimeout(existing);
    }

    // Read the file after the tool has executed to get "after" content.
    // We use invoke("read_file") with a small delay to let the write complete.
    const capturedPath = normalizedPath;
    const timer = setTimeout(async () => {
      pendingDiffTimeouts.delete(capturedPath);
      try {
        const result = await invoke<{ content: string }>("read_file", {
          path: filePath,
        });
        const afterContent = result.content;
        if (afterContent !== beforeContent) {
          useEditorStore.getState().setPendingDiff(
            capturedPath,
            beforeContent,
            afterContent,
            `Claude ${toolName}: ${filePath.split("/").pop() ?? filePath}`,
          );
        }
      } catch {
        // File read failed — skip diff capture
      }
    }, 500);
    pendingDiffTimeouts.set(normalizedPath, timer);
  }
}

// ─── Tauri event bridge ─────────────────────────────────────────────────────

export function useClaude() {
  const sessionIdRef = useRef<string | null>(null);

  // Race condition fix (2A): Prevent concurrent session creation.
  // If sendMessage auto-starts a session while startSession is already in-flight,
  // two sessions would be created in parallel. This ref holds the pending start
  // promise so sendMessage can await it instead of starting a second session.
  const sessionStartPromiseRef = useRef<Promise<string | null> | null>(null);

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

  // ── Action: start a session ──

  const startSession = useCallback(
    async (cwd: string, resumeSessionId?: string, fromPr?: number) => {
      // Race condition fix (2A): If a session start is already in-flight, await it
      // instead of starting a duplicate session.
      if (sessionStartPromiseRef.current) {
        await sessionStartPromiseRef.current;
        return;
      }

      setConnectionStatus("starting");
      const startPromise = (async (): Promise<string | null> => {
        try {
          const settings = useSettingsStore.getState();
          const id = await invoke<string>("claude_start_session", {
            cwd,
            sessionId: resumeSessionId ?? null,
            resume: !!resumeSessionId,
            effortLevel: settings.effortLevel,
            planMode: settings.planMode,
            fromPr: fromPr ?? null,
            skipPermissions: settings.skipPermissions ?? false,
          });
          sessionIdRef.current = id;
          const session: SessionMetadata = {
            sessionId: id,
            cwd,
          };
          setSession(session);
          return id;
        } catch (err) {
          setConnectionStatus("error", String(err));
          return null;
        } finally {
          sessionStartPromiseRef.current = null;
        }
      })();

      sessionStartPromiseRef.current = startPromise;
      await startPromise;
    },
    [setConnectionStatus, setSession],
  );

  // ── Action: send a message (auto-starts session if needed) ──

  const sendMessage = useCallback(
    async (content: string, cwd?: string) => {
      // Race condition fix (2A): If a session start is already in-flight,
      // await it instead of starting a duplicate session. Two rapid sendMessage
      // calls would otherwise both see sessionIdRef.current === null and both
      // invoke claude_start_session, creating two parallel sessions.
      if (!sessionIdRef.current && sessionStartPromiseRef.current) {
        await sessionStartPromiseRef.current;
      }

      // If no active session, auto-start one first
      if (!sessionIdRef.current) {
        const sessionCwd =
          cwd ??
          useConversationStore.getState().session?.cwd ??
          useLayoutStore.getState().projectRootPath ??
          ".";
        setConnectionStatus("starting");

        const startPromise = (async (): Promise<string | null> => {
          try {
            const settings = useSettingsStore.getState();
            const id = await invoke<string>("claude_start_session", {
              cwd: sessionCwd,
              sessionId: null,
              resume: false,
              effortLevel: settings.effortLevel,
              planMode: settings.planMode,
              fromPr: null,
              skipPermissions: settings.skipPermissions ?? false,
            });
            sessionIdRef.current = id;
            const session: SessionMetadata = {
              sessionId: id,
              cwd: sessionCwd,
            };
            setSession(session);
            return id;
          } catch (err) {
            setConnectionStatus("error", String(err));
            return null;
          } finally {
            sessionStartPromiseRef.current = null;
          }
        })();

        sessionStartPromiseRef.current = startPromise;
        const result = await startPromise;
        if (!result) return;
      }

      // Optimistically add the user message to the store
      addUserMessage(content);
      try {
        await invoke("claude_send_message", {
          sessionId: sessionIdRef.current,
          content,
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
      // Read session ID from store (not local ref) so this works from any
      // component that calls useClaude(), including PermissionDialog.
      const sid = sessionIdRef.current ?? useConversationStore.getState().session?.sessionId;
      if (!sid) return;
      try {
        await invoke("claude_respond_permission", {
          sessionId: sid,
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
    } catch (err) {
      // Session may already be dead — log but don't propagate
      console.warn("Failed to stop Claude session (may already be dead):", err);
    }
    sessionIdRef.current = null;
    clearConversation();
  }, [clearConversation]);

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
        // Generate worktree path and branch name via Rust helpers
        const worktreePath = await invoke<string>("get_agent_worktree_path", {
          repoPath: cwd,
          agentName: agent.name,
          agentId: agent.id,
        });
        const branchName = await invoke<string>("get_agent_branch_name", {
          agentName: agent.name,
          agentId: agent.id,
        });

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
