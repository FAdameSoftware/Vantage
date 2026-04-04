import { describe, it, expect, beforeEach } from "vitest";
import { useConversationStore } from "../conversation";
import type { StreamEventMessage, AssistantMessage, ResultMessage, SystemInitMessage } from "@/lib/protocol";

// ─── Reset helper ────────────────────────────────────────────────────────────

function resetStore() {
  useConversationStore.setState({
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
    pendingPermission: null,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useConversationStore", () => {
  beforeEach(resetStore);

  // ── Default state ──────────────────────────────────────────────────────────

  describe("default state", () => {
    it("starts with empty messages", () => {
      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(0);
    });

    it("starts with isStreaming false", () => {
      expect(useConversationStore.getState().isStreaming).toBe(false);
    });

    it("starts with zero cost and tokens", () => {
      const state = useConversationStore.getState();
      expect(state.totalCost).toBe(0);
      expect(state.totalTokens.input).toBe(0);
      expect(state.totalTokens.output).toBe(0);
    });

    it("starts with no session", () => {
      expect(useConversationStore.getState().session).toBeNull();
    });

    it("starts with no pending permission", () => {
      expect(useConversationStore.getState().pendingPermission).toBeNull();
    });

    it("starts with disconnected connection status", () => {
      expect(useConversationStore.getState().connectionStatus).toBe("disconnected");
    });
  });

  // ── addUserMessage ─────────────────────────────────────────────────────────

  describe("addUserMessage", () => {
    it("adds a message with role 'user'", () => {
      useConversationStore.getState().addUserMessage("Hello, Claude");
      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].text).toBe("Hello, Claude");
    });

    it("assigns a unique id and timestamp", () => {
      useConversationStore.getState().addUserMessage("First");
      useConversationStore.getState().addUserMessage("Second");
      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBeTruthy();
      expect(messages[1].id).toBeTruthy();
      expect(messages[0].id).not.toBe(messages[1].id);
      expect(messages[0].timestamp).toBeGreaterThan(0);
    });

    it("adds multiple messages in order", () => {
      useConversationStore.getState().addUserMessage("one");
      useConversationStore.getState().addUserMessage("two");
      const messages = useConversationStore.getState().messages;
      expect(messages[0].text).toBe("one");
      expect(messages[1].text).toBe("two");
    });

    it("sets parentToolUseId to null", () => {
      useConversationStore.getState().addUserMessage("test");
      expect(useConversationStore.getState().messages[0].parentToolUseId).toBeNull();
    });

    it("initialises toolCalls and thinking as empty", () => {
      useConversationStore.getState().addUserMessage("test");
      const msg = useConversationStore.getState().messages[0];
      expect(msg.toolCalls).toHaveLength(0);
      expect(msg.thinking).toBe("");
    });
  });

  // ── startStreaming / stopStreaming (via handleStreamEvent) ─────────────────

  describe("streaming flag via stream events", () => {
    it("sets isStreaming to true on message_start", () => {
      const msg: StreamEventMessage = {
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_01", type: "message", role: "assistant", model: "claude-opus-4-6", content: [] },
        },
      };
      useConversationStore.getState().handleStreamEvent(msg);
      expect(useConversationStore.getState().isStreaming).toBe(true);
    });

    it("clears isStreaming on message_stop and appends assembled message", () => {
      // Start
      const startMsg: StreamEventMessage = {
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_02", type: "message", role: "assistant", model: "claude-opus-4-6", content: [] },
        },
      };
      useConversationStore.getState().handleStreamEvent(startMsg);

      // A text block
      const blockStart: StreamEventMessage = {
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      };
      useConversationStore.getState().handleStreamEvent(blockStart);

      const textDelta: StreamEventMessage = {
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello!" } },
      };
      useConversationStore.getState().handleStreamEvent(textDelta);

      const blockStop: StreamEventMessage = {
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      };
      useConversationStore.getState().handleStreamEvent(blockStop);

      // Stop message
      const stopMsg: StreamEventMessage = {
        type: "stream_event",
        event: { type: "message_stop" },
      };
      useConversationStore.getState().handleStreamEvent(stopMsg);

      const state = useConversationStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe("assistant");
      expect(state.messages[0].text).toBe("Hello!");
    });
  });

  // ── Delta accumulation ────────────────────────────────────────────────────

  describe("delta accumulation", () => {
    it("accumulates text deltas across multiple events", () => {
      const start: StreamEventMessage = {
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_text", type: "message", role: "assistant", model: "m", content: [] },
        },
      };
      useConversationStore.getState().handleStreamEvent(start);

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      });

      for (const chunk of ["Hello", ", ", "world", "!"]) {
        useConversationStore.getState().handleStreamEvent({
          type: "stream_event",
          event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: chunk } },
        });
      }

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "message_stop" },
      });

      const msg = useConversationStore.getState().messages[0];
      expect(msg.text).toBe("Hello, world!");
    });

    it("accumulates tool input JSON deltas", () => {
      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_tool", type: "message", role: "assistant", model: "m", content: [] },
        },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_01", name: "Read", input: {} },
        },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"file_path":' },
        },
      });
      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '"src/main.ts"}' },
        },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "message_stop" },
      });

      const msg = useConversationStore.getState().messages[0];
      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls[0].name).toBe("Read");
      expect(msg.toolCalls[0].input).toEqual({ file_path: "src/main.ts" });
    });

    it("accumulates thinking deltas and sets isThinking during streaming", () => {
      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_think", type: "message", role: "assistant", model: "m", content: [] },
        },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
      });

      expect(useConversationStore.getState().isThinking).toBe(true);

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "Let me think..." },
        },
      });

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      });

      expect(useConversationStore.getState().isThinking).toBe(false);

      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: { type: "message_stop" },
      });

      const msg = useConversationStore.getState().messages[0];
      expect(msg.thinking).toBe("Let me think...");
    });
  });

  // ── handleResult ──────────────────────────────────────────────────────────

  describe("handleResult", () => {
    it("updates totalCost and token counts", () => {
      const result: ResultMessage = {
        type: "result",
        subtype: "success",
        duration_ms: 5000,
        duration_api_ms: 4000,
        is_error: false,
        num_turns: 2,
        total_cost_usd: 0.05,
        usage: { input_tokens: 1000, output_tokens: 200 },
      };
      useConversationStore.getState().handleResult(result);

      const state = useConversationStore.getState();
      expect(state.totalCost).toBeCloseTo(0.05);
      expect(state.totalTokens.input).toBe(1000);
      expect(state.totalTokens.output).toBe(200);
      expect(state.lastResult?.isError).toBe(false);
      expect(state.lastResult?.numTurns).toBe(2);
    });

    it("accumulates cost across multiple result messages", () => {
      const makeResult = (cost: number): ResultMessage => ({
        type: "result",
        subtype: "success",
        duration_ms: 1000,
        is_error: false,
        num_turns: 1,
        total_cost_usd: cost,
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      useConversationStore.getState().handleResult(makeResult(0.01));
      useConversationStore.getState().handleResult(makeResult(0.02));

      expect(useConversationStore.getState().totalCost).toBeCloseTo(0.03);
    });

    it("sets connectionStatus to 'ready' after result", () => {
      const result: ResultMessage = {
        type: "result",
        subtype: "success",
        duration_ms: 1000,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0,
      };
      useConversationStore.getState().handleResult(result);
      expect(useConversationStore.getState().connectionStatus).toBe("ready");
    });

    it("stores error info for error results", () => {
      const result: ResultMessage = {
        type: "result",
        subtype: "error_max_turns",
        duration_ms: 30000,
        is_error: true,
        num_turns: 10,
        total_cost_usd: 0.1,
        errors: ["Maximum number of turns reached"],
      };
      useConversationStore.getState().handleResult(result);
      const lastResult = useConversationStore.getState().lastResult;
      expect(lastResult?.isError).toBe(true);
      expect(lastResult?.errors).toContain("Maximum number of turns reached");
    });
  });

  // ── clearConversation ─────────────────────────────────────────────────────

  describe("clearConversation", () => {
    it("resets all state to defaults", () => {
      // Populate some state
      useConversationStore.getState().addUserMessage("Hello");
      useConversationStore.getState().handleResult({
        type: "result",
        subtype: "success",
        duration_ms: 1000,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.05,
        usage: { input_tokens: 100, output_tokens: 50 },
      });
      useConversationStore.getState().setPendingPermission({
        tool_name: "Bash",
        tool_input: { command: "ls" },
        session_id: "abc",
      });

      // Clear
      useConversationStore.getState().clearConversation();

      const state = useConversationStore.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.totalCost).toBe(0);
      expect(state.totalTokens.input).toBe(0);
      expect(state.totalTokens.output).toBe(0);
      expect(state.lastResult).toBeNull();
      expect(state.pendingPermission).toBeNull();
      expect(state.isStreaming).toBe(false);
      expect(state.session).toBeNull();
      expect(state.connectionStatus).toBe("disconnected");
    });
  });

  // ── setPermissionRequest ──────────────────────────────────────────────────

  describe("setPendingPermission", () => {
    it("sets a pending permission", () => {
      useConversationStore.getState().setPendingPermission({
        tool_name: "Bash",
        tool_input: { command: "rm -rf /tmp/test" },
        session_id: "session-123",
      });

      const perm = useConversationStore.getState().pendingPermission;
      expect(perm).not.toBeNull();
      expect(perm?.toolName).toBe("Bash");
      expect(perm?.toolInput).toEqual({ command: "rm -rf /tmp/test" });
      expect(perm?.sessionId).toBe("session-123");
    });

    it("clears pending permission when passed null", () => {
      useConversationStore.getState().setPendingPermission({
        tool_name: "Write",
        tool_input: { file_path: "/etc/passwd" },
        session_id: "s",
      });
      useConversationStore.getState().setPendingPermission(null);

      expect(useConversationStore.getState().pendingPermission).toBeNull();
    });
  });

  // ── handleSystemInit ──────────────────────────────────────────────────────

  describe("handleSystemInit", () => {
    it("stores session metadata and sets status to ready", () => {
      const init: SystemInitMessage = {
        type: "system",
        subtype: "init",
        session_id: "sess-abc",
        uuid: "u1",
        model: "claude-opus-4-6",
        tools: ["Read", "Write"],
        cwd: "/home/user/project",
        permissionMode: "default",
        claude_code_version: "2.1.88",
      };
      useConversationStore.getState().handleSystemInit(init);

      const state = useConversationStore.getState();
      expect(state.session?.sessionId).toBe("sess-abc");
      expect(state.session?.model).toBe("claude-opus-4-6");
      expect(state.session?.cwd).toBe("/home/user/project");
      expect(state.connectionStatus).toBe("ready");
    });
  });

  // ── handleAssistantMessage ────────────────────────────────────────────────

  describe("handleAssistantMessage", () => {
    it("appends an assistant message when no matching id exists", () => {
      const msg: AssistantMessage = {
        type: "assistant",
        uuid: "u1",
        session_id: "s1",
        parent_tool_use_id: null,
        message: {
          id: "msg_new",
          type: "message",
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "I can help with that." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      };
      useConversationStore.getState().handleAssistantMessage(msg);

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe("I can help with that.");
    });

    it("replaces existing message when id matches (reconciliation)", () => {
      const msg: AssistantMessage = {
        type: "assistant",
        uuid: "u1",
        session_id: "s1",
        parent_tool_use_id: null,
        message: {
          id: "msg_existing",
          type: "message",
          role: "assistant",
          model: "claude-opus-4-6",
          content: [{ type: "text", text: "Initial text" }],
          stop_reason: "end_turn",
        },
      };
      useConversationStore.getState().handleAssistantMessage(msg);

      const updated: AssistantMessage = {
        ...msg,
        message: {
          ...msg.message,
          content: [{ type: "text", text: "Updated text" }],
        },
      };
      useConversationStore.getState().handleAssistantMessage(updated);

      const messages = useConversationStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe("Updated text");
    });
  });

  // ── setConnectionStatus ───────────────────────────────────────────────────

  describe("setConnectionStatus", () => {
    it("updates connection status", () => {
      useConversationStore.getState().setConnectionStatus("starting");
      expect(useConversationStore.getState().connectionStatus).toBe("starting");
    });

    it("records error message when provided", () => {
      useConversationStore.getState().setConnectionStatus("error", "Connection refused");
      const state = useConversationStore.getState();
      expect(state.connectionStatus).toBe("error");
      expect(state.connectionError).toBe("Connection refused");
    });

    it("clears error when no error given", () => {
      useConversationStore.getState().setConnectionStatus("error", "old error");
      useConversationStore.getState().setConnectionStatus("ready");
      expect(useConversationStore.getState().connectionError).toBeNull();
    });
  });
});
