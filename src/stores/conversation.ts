import { create } from "zustand";
import type {
  ContentBlock,
  ContentBlockStartBlock,
  AssistantMessage,
  ResultMessage,
  StreamEventMessage,
  SystemInitMessage,
  PermissionRequestPayload,
} from "@/lib/protocol";
import { useUsageStore } from "./usage";

// ─── Internal streaming accumulator ─────────────────────────────────────────

export interface ActiveBlock {
  index: number;
  type: "text" | "thinking" | "tool_use";
  text: string;
  toolUseId?: string;
  toolName?: string;
  inputJson: string;
  isComplete: boolean;
}

// ─── Tool call (fully assembled) ─────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  inputJson: string;
  output?: string;
  isError?: boolean;
  isExecuting: boolean;
}

// ─── Conversation message (fully assembled from deltas) ──────────────────────

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "result";
  text: string;
  thinking: string;
  toolCalls: ToolCall[];
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  timestamp: number;
  parentToolUseId: string | null;
  stopReason?: string;
}

// ─── Session metadata ────────────────────────────────────────────────────────

export interface SessionMetadata {
  sessionId: string;
  cliSessionId?: string;
  model?: string;
  claudeCodeVersion?: string;
  tools?: string[];
  permissionMode?: string;
  cwd?: string;
}

// ─── Result summary ──────────────────────────────────────────────────────────

export interface ResultSummary {
  durationMs: number;
  durationApiMs?: number;
  numTurns: number;
  totalCostUsd: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  isError: boolean;
  errors?: string[];
}

// ─── Connection status ───────────────────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "starting"
  | "ready"
  | "streaming"
  | "error"
  | "stopped";

// ─── Session checkpoint ──────────────────────────────────────────────────────

export interface ConversationCheckpoint {
  /** Index into the messages array this checkpoint was taken after */
  messageIndex: number;
  /** Wall-clock time of checkpoint creation */
  timestamp: number;
  /** Human-readable label */
  label: string;
}

// ─── Store state & actions ───────────────────────────────────────────────────

export interface ConversationState {
  // Messages
  messages: ConversationMessage[];

  // Streaming UI state
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStartedAt: number | null;

  // Internal streaming accumulator
  activeBlocks: Map<number, ActiveBlock>;
  /** Incremented on activeBlocks mutation to trigger re-renders without cloning the Map */
  activeBlocksVersion: number;
  activeMessageId: string | null;

  // Session info
  session: SessionMetadata | null;

  // Cumulative cost/token tracking
  totalCost: number;
  totalTokens: { input: number; output: number };

  // Last result
  lastResult: ResultSummary | null;

  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Pending permission request
  pendingPermission: {
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  } | null;

  // Session-level auto-approved tools (cleared when session ends)
  sessionAllowedTools: Set<string>;

  // Session timeline checkpoints
  checkpoints: ConversationCheckpoint[];

  // Pinned message IDs
  pinnedMessageIds: Set<string>;

  // ── Actions ──
  addUserMessage: (text: string) => void;
  handleSystemInit: (msg: SystemInitMessage) => void;
  handleStreamEvent: (msg: StreamEventMessage) => void;
  handleAssistantMessage: (msg: AssistantMessage) => void;
  handleResult: (msg: ResultMessage) => void;
  setPendingPermission: (permission: PermissionRequestPayload | null) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  clearConversation: () => void;
  setSession: (session: SessionMetadata) => void;
  allowToolForSession: (toolName: string) => void;
  isToolAllowedForSession: (toolName: string) => boolean;

  /** Create a named checkpoint at the current message index */
  createCheckpoint: (label?: string) => void;
  /** Restore the conversation to the state at a given checkpoint index */
  restoreCheckpoint: (checkpointIndex: number) => void;

  /** Toggle pin status for a message */
  togglePinMessage: (messageId: string) => void;
  /** Check if a message is pinned */
  isMessagePinned: (messageId: string) => boolean;

  /** Reset the conversation store to its default state (used on workspace switch) */
  resetToDefaults: () => void;
}

// ─── Helper: generate a simple unique ID ────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Helper: assemble activeBlocks into a ConversationMessage ───────────────

function assembleMessage(
  messageId: string,
  activeBlocks: Map<number, ActiveBlock>,
  model: string | undefined,
  parentToolUseId: string | null,
  stopReason: string | undefined,
): ConversationMessage {
  const sortedBlocks = [...activeBlocks.values()].sort((a, b) => a.index - b.index);

  let text = "";
  let thinking = "";
  const toolCalls: ToolCall[] = [];

  for (const block of sortedBlocks) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "thinking") {
      thinking += block.text;
    } else if (block.type === "tool_use") {
      let input: Record<string, unknown> = {};
      let parseError = false;
      try {
        input = JSON.parse(block.inputJson || "{}") as Record<string, unknown>;
      } catch (err) {
        parseError = true;
        const truncated = (block.inputJson || "").slice(0, 200);
        console.warn(
          `Failed to parse tool input JSON for ${block.toolName ?? "unknown"}: ${err}. Raw JSON (truncated): ${truncated}`,
        );
      }
      toolCalls.push({
        id: block.toolUseId ?? generateId(),
        name: block.toolName ?? "",
        input,
        inputJson: block.inputJson,
        isError: parseError,
        isExecuting: false,
      });
    }
  }

  return {
    id: messageId,
    role: "assistant",
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

function extractFromAssistantMessage(msg: AssistantMessage): ConversationMessage {
  let text = "";
  let thinking = "";
  const toolCalls: ToolCall[] = [];
  // Collect tool_result blocks to attach to matching tool_use blocks
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
    role: "assistant",
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

// ─── Store definition ────────────────────────────────────────────────────────

const DEFAULT_STATE: Omit<
  ConversationState,
  | "addUserMessage"
  | "handleSystemInit"
  | "handleStreamEvent"
  | "handleAssistantMessage"
  | "handleResult"
  | "setPendingPermission"
  | "setConnectionStatus"
  | "clearConversation"
  | "setSession"
  | "allowToolForSession"
  | "isToolAllowedForSession"
  | "createCheckpoint"
  | "restoreCheckpoint"
  | "togglePinMessage"
  | "isMessagePinned"
  | "resetToDefaults"
> = {
  messages: [],
  isStreaming: false,
  isThinking: false,
  thinkingStartedAt: null,
  activeBlocks: new Map(),
  activeBlocksVersion: 0,
  activeMessageId: null,
  session: null,
  totalCost: 0,
  totalTokens: { input: 0, output: 0 },
  lastResult: null,
  connectionStatus: "disconnected",
  connectionError: null,
  pendingPermission: null,
  sessionAllowedTools: new Set(),
  checkpoints: [],
  pinnedMessageIds: new Set(),
};

export const useConversationStore = create<ConversationState>()(
  (set, get) => ({
  ...DEFAULT_STATE,

  addUserMessage(text: string) {
    const message: ConversationMessage = {
      id: generateId(),
      role: "user",
      text,
      thinking: "",
      toolCalls: [],
      timestamp: Date.now(),
      parentToolUseId: null,
    };
    set((state) => {
      const newMessages = [...state.messages, message];
      // Auto-checkpoint on each user turn so the timeline tracks conversation history
      const label = text.length > 40 ? text.slice(0, 40) + "…" : text;
      const checkpoint: ConversationCheckpoint = {
        messageIndex: newMessages.length - 1,
        timestamp: Date.now(),
        label,
      };
      return {
        messages: newMessages,
        checkpoints: [...state.checkpoints, checkpoint],
      };
    });
  },

  handleSystemInit(msg: SystemInitMessage) {
    const session: SessionMetadata = {
      sessionId: msg.session_id,
      model: msg.model,
      claudeCodeVersion: msg.claude_code_version,
      tools: msg.tools,
      permissionMode: msg.permissionMode,
      cwd: msg.cwd,
    };
    set({ session, connectionStatus: "ready" });
    useUsageStore.getState().startSession();
  },

  handleStreamEvent(msg: StreamEventMessage) {
    const event = msg.event;

    switch (event.type) {
      case "message_start": {
        set({
          isStreaming: true,
          activeBlocks: new Map(),
          activeMessageId: event.message.id,
          connectionStatus: "streaming",
        });
        break;
      }

      case "content_block_start": {
        const block = event.content_block as ContentBlockStartBlock;
        const newBlock: ActiveBlock = {
          index: event.index,
          type: block.type as "text" | "thinking" | "tool_use",
          text: block.type === "text" ? block.text : block.type === "thinking" ? block.thinking : "",
          toolUseId: block.type === "tool_use" ? block.id : undefined,
          toolName: block.type === "tool_use" ? block.name : undefined,
          inputJson: "",
          isComplete: false,
        };

        const isThinking = block.type === "thinking";
        set((state) => {
          const next = new Map(state.activeBlocks);
          next.set(event.index, newBlock);
          return {
            activeBlocks: next,
            isThinking: isThinking ? true : state.isThinking,
            thinkingStartedAt: isThinking ? (state.thinkingStartedAt ?? Date.now()) : state.thinkingStartedAt,
          };
        });
        break;
      }

      case "content_block_delta": {
        const { index, delta } = event;
        set((state) => {
          // Race condition fix (2E): Ignore content_block_delta if no matching block
          // exists in activeBlocks. This can happen if events arrive out of order
          // (e.g., delta before block_start) or if a malformed event references
          // a non-existent index.
          const existing = state.activeBlocks.get(index);
          if (!existing) {
            console.warn(`Ignoring content_block_delta for unknown block index ${index}`);
            return {};
          }
          // Mutate the existing block in-place and bump a version counter
          // to trigger re-renders, avoiding O(n) Map copies on every streaming delta.
          const updated: ActiveBlock = { ...existing };

          if (delta.type === "text_delta") {
            updated.text += delta.text;
          } else if (delta.type === "thinking_delta") {
            updated.text += delta.thinking;
          } else if (delta.type === "input_json_delta") {
            updated.inputJson += delta.partial_json;
          }

          state.activeBlocks.set(index, updated);
          return { activeBlocksVersion: (state.activeBlocksVersion ?? 0) + 1 };
        });
        break;
      }

      case "content_block_stop": {
        const { index } = event;
        set((state) => {
          // Race condition fix (2E): Ignore content_block_stop for unknown indices.
          // This guards against out-of-order events or duplicate stop signals.
          const existing = state.activeBlocks.get(index);
          if (!existing) {
            console.warn(`Ignoring content_block_stop for unknown block index ${index}`);
            return {};
          }
          const updated: ActiveBlock = { ...existing, isComplete: true };
          const next = new Map(state.activeBlocks);
          next.set(index, updated);
          // End thinking state if the stopped block was thinking
          const isThinkingEnding = existing.type === "thinking";
          return {
            activeBlocks: next,
            isThinking: isThinkingEnding ? false : state.isThinking,
            thinkingStartedAt: isThinkingEnding ? null : state.thinkingStartedAt,
          };
        });
        break;
      }

      case "message_delta": {
        // stop_reason is captured here; used when message_stop assembles the message
        break;
      }

      case "message_stop": {
        // Race condition fix (2E): Always reset activeBlocks on message_stop,
        // even if some blocks are incomplete. This prevents the activeBlocks Map
        // from getting into an inconsistent state if events were lost or arrived
        // out of order during streaming.
        const state = get();
        const assembled = assembleMessage(
          state.activeMessageId ?? generateId(),
          state.activeBlocks,
          state.session?.model,
          msg.parent_tool_use_id ?? null,
          undefined, // stop_reason captured separately if needed
        );
        set((prevState) => ({
          messages: [...prevState.messages, assembled],
          isStreaming: false,
          isThinking: false,
          thinkingStartedAt: null,
          activeBlocks: new Map(),
          activeMessageId: null,
          connectionStatus: "ready",
        }));
        break;
      }

      default:
        break;
    }
  },

  handleAssistantMessage(msg: AssistantMessage) {
    const assembled = extractFromAssistantMessage(msg);

    // Also check for tool_result blocks that reference tool_use IDs from
    // previous messages (tool results often arrive in a separate assistant
    // message after the tool_use message).
    const toolResults: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = [];
    for (const block of msg.message.content) {
      if (block.type === "tool_result") {
        toolResults.push({
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        });
      }
    }

    set((state) => {
      let messages = [...state.messages];

      // Attach tool results to matching tool calls in prior messages
      if (toolResults.length > 0) {
        messages = messages.map((m) => {
          if (m.toolCalls.length === 0) return m;
          let changed = false;
          const updatedCalls = m.toolCalls.map((tc) => {
            const result = toolResults.find((r) => r.tool_use_id === tc.id);
            if (result && tc.output === undefined) {
              changed = true;
              return { ...tc, output: result.content, isError: result.is_error ?? false, isExecuting: false };
            }
            return tc;
          });
          return changed ? { ...m, toolCalls: updatedCalls } : m;
        });
      }

      // Try to reconcile: replace an existing message with matching ID
      const existingIdx = messages.findIndex((m) => m.id === assembled.id);
      if (existingIdx !== -1) {
        messages[existingIdx] = assembled;
        return { messages };
      }
      // Otherwise append
      return { messages: [...messages, assembled] };
    });
  },

  handleResult(msg: ResultMessage) {
    const summary: ResultSummary = {
      durationMs: msg.duration_ms,
      durationApiMs: msg.duration_api_ms,
      numTurns: msg.num_turns,
      totalCostUsd: msg.total_cost_usd,
      usage: msg.usage,
      isError: msg.is_error,
      errors: msg.errors,
    };
    set((state) => ({
      lastResult: summary,
      totalCost: state.totalCost + (msg.total_cost_usd ?? 0),
      totalTokens: {
        input: state.totalTokens.input + (msg.usage?.input_tokens ?? 0),
        output: state.totalTokens.output + (msg.usage?.output_tokens ?? 0),
      },
      connectionStatus: "ready",
      isStreaming: false,
    }));
    useUsageStore.getState().addTurnUsage({
      inputTokens: msg.usage?.input_tokens,
      outputTokens: msg.usage?.output_tokens,
      cacheCreation: msg.usage?.cache_creation_input_tokens,
      cacheRead: msg.usage?.cache_read_input_tokens,
      costUsd: msg.total_cost_usd,
    });
  },

  setPendingPermission(permission: PermissionRequestPayload | null) {
    if (permission === null) {
      set({ pendingPermission: null });
    } else {
      set({
        pendingPermission: {
          sessionId: permission.session_id,
          toolName: permission.tool_name,
          toolInput: permission.tool_input,
        },
      });
    }
  },

  setConnectionStatus(status: ConnectionStatus, error?: string) {
    set({
      connectionStatus: status,
      connectionError: error ?? null,
    });
  },

  clearConversation() {
    set({
      ...DEFAULT_STATE,
      activeBlocks: new Map(),
      activeBlocksVersion: 0,
      sessionAllowedTools: new Set(),
      pinnedMessageIds: new Set(),
    });
    useUsageStore.getState().reset();
  },

  setSession(session: SessionMetadata) {
    set({ session });
  },

  allowToolForSession(toolName: string) {
    set((state) => {
      const next = new Set(state.sessionAllowedTools);
      next.add(toolName);
      return { sessionAllowedTools: next };
    });
  },

  isToolAllowedForSession(toolName: string) {
    return get().sessionAllowedTools.has(toolName);
  },

  createCheckpoint(label?: string) {
    const { messages, checkpoints } = get();
    const messageIndex = messages.length - 1;
    const checkpoint: ConversationCheckpoint = {
      messageIndex,
      timestamp: Date.now(),
      label: label ?? `Checkpoint ${checkpoints.length + 1}`,
    };
    set((state) => ({ checkpoints: [...state.checkpoints, checkpoint] }));
  },

  restoreCheckpoint(checkpointIndex: number) {
    const { messages, checkpoints } = get();
    const checkpoint = checkpoints[checkpointIndex];
    if (!checkpoint) return;
    // Slice messages back to the checkpoint's message index (inclusive)
    const slicedMessages = messages.slice(0, checkpoint.messageIndex + 1);
    // Keep only checkpoints up to and including this one
    const slicedCheckpoints = checkpoints.slice(0, checkpointIndex + 1);
    set({
      messages: slicedMessages,
      checkpoints: slicedCheckpoints,
      isStreaming: false,
      isThinking: false,
      thinkingStartedAt: null,
      activeBlocks: new Map(),
      activeMessageId: null,
    });
  },

  togglePinMessage(messageId: string) {
    set((state) => {
      const next = new Set(state.pinnedMessageIds);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return { pinnedMessageIds: next };
    });
  },

  isMessagePinned(messageId: string) {
    return get().pinnedMessageIds.has(messageId);
  },

  resetToDefaults() {
    set({
      ...DEFAULT_STATE,
      activeBlocks: new Map(),
      activeBlocksVersion: 0,
      sessionAllowedTools: new Set(),
      pinnedMessageIds: new Set(),
    });
    useUsageStore.getState().reset();
  },
}));

// Re-export types that downstream modules will need
export type { ContentBlock };
