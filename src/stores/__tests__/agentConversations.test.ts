import { describe, it, expect, beforeEach } from "vitest";
import { useAgentConversationsStore } from "../agentConversations";

describe("agentConversationsStore", () => {
  beforeEach(() => {
    useAgentConversationsStore.setState({
      conversations: new Map(),
    });
  });

  it("has correct default values", () => {
    const state = useAgentConversationsStore.getState();
    expect(state.conversations.size).toBe(0);
  });

  it("getConversation returns a fresh default state for unknown agent", () => {
    const conv = useAgentConversationsStore.getState().getConversation("agent-1");

    expect(conv.messages).toEqual([]);
    expect(conv.isStreaming).toBe(false);
    expect(conv.isThinking).toBe(false);
    expect(conv.thinkingStartedAt).toBeNull();
    expect(conv.activeMessageId).toBeNull();
    expect(conv.session).toBeNull();
    expect(conv.totalCost).toBe(0);
    expect(conv.totalTokens).toEqual({ input: 0, output: 0 });
    expect(conv.lastResult).toBeNull();
    expect(conv.connectionStatus).toBe("disconnected");
    expect(conv.connectionError).toBeNull();
    expect(conv.pendingPermission).toBeNull();
  });

  it("getConversation creates the entry in the store map", () => {
    useAgentConversationsStore.getState().getConversation("agent-1");
    expect(useAgentConversationsStore.getState().conversations.has("agent-1")).toBe(true);
  });

  it("getConversation returns the same state on second call", () => {
    const store = useAgentConversationsStore.getState();
    store.getConversation("agent-1");

    // Mutate via updateConversation
    useAgentConversationsStore.getState().updateConversation("agent-1", () => ({
      isStreaming: true,
    }));

    const conv = useAgentConversationsStore.getState().getConversation("agent-1");
    expect(conv.isStreaming).toBe(true);
  });

  it("updateConversation updates fields for an existing agent", () => {
    useAgentConversationsStore.getState().getConversation("agent-1");

    useAgentConversationsStore.getState().updateConversation("agent-1", (prev) => ({
      isStreaming: true,
      totalCost: prev.totalCost + 0.05,
    }));

    const conv = useAgentConversationsStore.getState().conversations.get("agent-1");
    expect(conv!.isStreaming).toBe(true);
    expect(conv!.totalCost).toBeCloseTo(0.05);
  });

  it("updateConversation creates default state for unknown agent then applies update", () => {
    useAgentConversationsStore.getState().updateConversation("new-agent", () => ({
      connectionStatus: "connected" as const,
    }));

    const conv = useAgentConversationsStore.getState().conversations.get("new-agent");
    expect(conv).toBeDefined();
    expect(conv!.connectionStatus).toBe("connected");
    expect(conv!.messages).toEqual([]);
  });

  it("updateConversation can add messages", () => {
    useAgentConversationsStore.getState().getConversation("agent-1");

    const newMessage = {
      id: "msg-1",
      role: "user" as const,
      text: "Hello",
      thinking: "",
      toolCalls: [],
      timestamp: Date.now(),
      parentToolUseId: null,
    };

    useAgentConversationsStore.getState().updateConversation("agent-1", (prev) => ({
      messages: [...prev.messages, newMessage],
    }));

    const conv = useAgentConversationsStore.getState().conversations.get("agent-1");
    expect(conv!.messages).toHaveLength(1);
    expect(conv!.messages[0].text).toBe("Hello");
  });

  it("removeConversation deletes the agent entry", () => {
    useAgentConversationsStore.getState().getConversation("agent-1");
    useAgentConversationsStore.getState().getConversation("agent-2");

    useAgentConversationsStore.getState().removeConversation("agent-1");

    const conversations = useAgentConversationsStore.getState().conversations;
    expect(conversations.has("agent-1")).toBe(false);
    expect(conversations.has("agent-2")).toBe(true);
  });

  it("removeConversation is a no-op for unknown agent", () => {
    useAgentConversationsStore.getState().getConversation("agent-1");
    useAgentConversationsStore.getState().removeConversation("nonexistent");

    expect(useAgentConversationsStore.getState().conversations.size).toBe(1);
  });

  it("multiple agents maintain independent state", () => {
    useAgentConversationsStore.getState().updateConversation("agent-1", () => ({
      isStreaming: true,
      totalCost: 0.10,
    }));
    useAgentConversationsStore.getState().updateConversation("agent-2", () => ({
      isStreaming: false,
      totalCost: 0.25,
    }));

    const conv1 = useAgentConversationsStore.getState().conversations.get("agent-1");
    const conv2 = useAgentConversationsStore.getState().conversations.get("agent-2");

    expect(conv1!.isStreaming).toBe(true);
    expect(conv1!.totalCost).toBeCloseTo(0.10);
    expect(conv2!.isStreaming).toBe(false);
    expect(conv2!.totalCost).toBeCloseTo(0.25);
  });
});
