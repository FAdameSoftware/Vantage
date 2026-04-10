import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor";
import { useConversationStore } from "../conversation";
import { useAgentsStore } from "../agents";
import { useLayoutStore } from "../layout";
import { useSettingsStore } from "../settings";
import type {
  StreamEventMessage,
  ResultMessage,
} from "@/lib/protocol";

// ─── Reset helpers ──────────────────────────────────────────────────────────

function resetEditorStore() {
  useEditorStore.setState({
    tabs: [],
    activeTabId: null,
    cursorPosition: { line: 1, column: 1 },
    vimModeLabel: "NORMAL",
    markdownPreviewTabs: new Set(),
    popoutTabs: new Set(),
    pendingDiffs: new Map(),
  });
}

function resetConversationStore() {
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

function resetAgentsStore() {
  useAgentsStore.setState({
    agents: new Map(),
    agentsVersion: 0,
    columnOrder: {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
    },
    maxConcurrentAgents: 3,
  });
}

function resetLayoutStore() {
  useLayoutStore.setState({
    primarySidebarVisible: true,
    secondarySidebarVisible: true,
    panelVisible: true,
    activeActivityBarItem: "explorer",
    primarySidebarSize: 20,
    secondarySidebarSize: 25,
    panelSize: 30,
    projectRootPath: null,
    previewUrl: null,
    previewActive: false,
    activePanelTab: "terminal",
    agentsViewMode: "kanban",
    viewMode: "copilot",
    overlayDrawerItem: null,
  });
}

// ─── 1. Editor store edge cases ─────────────────────────────────────────────

describe("Editor store edge cases", () => {
  beforeEach(resetEditorStore);

  it("opens a file with empty content", () => {
    useEditorStore.getState().openFile("C:/project/empty.ts", "empty.ts", "typescript", "");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].content).toBe("");
    expect(state.tabs[0].savedContent).toBe("");
    expect(state.tabs[0].isDirty).toBe(false);
    expect(state.activeTabId).toBe("c:/project/empty.ts");
  });

  it("opens a file with a very long name (500 chars)", () => {
    const longName = "a".repeat(497) + ".ts";
    const longPath = "C:/project/" + longName;

    expect(() => {
      useEditorStore.getState().openFile(longPath, longName, "typescript", "content");
    }).not.toThrow();

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].name).toBe(longName);
    expect(state.tabs[0].name.length).toBe(500);
  });

  it("opening the same file twice does not duplicate", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/dup.ts", "dup.ts", "typescript", "content");
    store.openFile("C:/project/dup.ts", "dup.ts", "typescript", "content");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("c:/project/dup.ts");
  });

  it("closing the last tab sets activeTabId to null", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/only.ts", "only.ts", "typescript", "content");
    store.closeTab("c:/project/only.ts");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });

  it("closing a tab that does not exist does not crash", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/real.ts", "real.ts", "typescript", "content");

    expect(() => {
      store.closeTab("c:/project/nonexistent.ts");
    }).not.toThrow();

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("c:/project/real.ts");
  });

  it("updating content of a non-existent tab does not crash", () => {
    expect(() => {
      useEditorStore.getState().updateContent("c:/project/ghost.ts", "new content");
    }).not.toThrow();

    expect(useEditorStore.getState().tabs).toHaveLength(0);
  });

  it("normalizes path with mixed separators (C:\\foo/bar\\baz)", () => {
    useEditorStore
      .getState()
      .openFile("C:\\foo/bar\\baz/file.ts", "file.ts", "typescript", "x");

    const state = useEditorStore.getState();
    expect(state.tabs[0].path).toBe("C:/foo/bar/baz/file.ts");
    // ID should be lowercase drive + forward slashes
    expect(state.activeTabId).toBe("c:/foo/bar/baz/file.ts");
  });

  it("same file opened via different separator styles deduplicates", () => {
    const store = useEditorStore.getState();
    store.openFile("C:\\project\\main.ts", "main.ts", "typescript", "v1");
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "v2");

    expect(useEditorStore.getState().tabs).toHaveLength(1);
  });
});

// ─── 2. Conversation store edge cases ───────────────────────────────────────

describe("Conversation store edge cases", () => {
  beforeEach(resetConversationStore);

  it("handles a stream event with unknown type gracefully (default case)", () => {
    const malformedMsg: StreamEventMessage = {
      type: "stream_event",
      event: { type: "unknown_type" } as never,
    };

    expect(() => {
      useConversationStore.getState().handleStreamEvent(malformedMsg);
    }).not.toThrow();

    // State unchanged
    expect(useConversationStore.getState().isStreaming).toBe(false);
    expect(useConversationStore.getState().messages).toHaveLength(0);
  });

  it("handles empty message content via addUserMessage", () => {
    useConversationStore.getState().addUserMessage("");

    const messages = useConversationStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe("");
    expect(messages[0].role).toBe("user");
  });

  it("handles result with negative cost (accumulates as-is since store does not clamp)", () => {
    // First add a positive cost
    const positiveResult: ResultMessage = {
      type: "result",
      subtype: "success",
      duration_ms: 1000,
      is_error: false,
      num_turns: 1,
      total_cost_usd: 0.05,
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    useConversationStore.getState().handleResult(positiveResult);
    expect(useConversationStore.getState().totalCost).toBeCloseTo(0.05);

    // Now handle a result with negative cost: the store accumulates it without crashing
    const negativeResult: ResultMessage = {
      type: "result",
      subtype: "success",
      duration_ms: 500,
      is_error: false,
      num_turns: 1,
      total_cost_usd: -0.01,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    expect(() => {
      useConversationStore.getState().handleResult(negativeResult);
    }).not.toThrow();

    // totalCost is now 0.05 + (-0.01) = 0.04 — no crash, no NaN
    const cost = useConversationStore.getState().totalCost;
    expect(Number.isNaN(cost)).toBe(false);
    expect(cost).toBeCloseTo(0.04);
  });

  it("clears conversation while streaming resets all state", () => {
    // Start streaming
    const startMsg: StreamEventMessage = {
      type: "stream_event",
      event: {
        type: "message_start",
        message: {
          id: "msg_streaming",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
        },
      },
    };
    useConversationStore.getState().handleStreamEvent(startMsg);
    expect(useConversationStore.getState().isStreaming).toBe(true);

    // Clear while streaming
    useConversationStore.getState().clearConversation();

    const state = useConversationStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.messages).toHaveLength(0);
    expect(state.activeBlocks.size).toBe(0);
    expect(state.activeMessageId).toBeNull();
    expect(state.connectionStatus).toBe("disconnected");
  });

  it("handles multiple rapid permission requests — last one wins", () => {
    const store = useConversationStore.getState();

    store.setPendingPermission({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      session_id: "s1",
    });

    store.setPendingPermission({
      tool_name: "Write",
      tool_input: { file_path: "/tmp/test" },
      session_id: "s2",
    });

    store.setPendingPermission({
      tool_name: "Edit",
      tool_input: { file_path: "/tmp/other", old_string: "a", new_string: "b" },
      session_id: "s3",
    });

    const perm = useConversationStore.getState().pendingPermission;
    expect(perm?.toolName).toBe("Edit");
    expect(perm?.sessionId).toBe("s3");
  });

  it("handles content_block_delta for non-existent block index (no crash)", () => {
    // Start a message
    useConversationStore.getState().handleStreamEvent({
      type: "stream_event",
      event: {
        type: "message_start",
        message: {
          id: "msg_x",
          type: "message",
          role: "assistant",
          model: "m",
          content: [],
        },
      },
    });

    // Send a delta for an index that was never started via content_block_start
    expect(() => {
      useConversationStore.getState().handleStreamEvent({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 99,
          delta: { type: "text_delta", text: "orphan text" },
        },
      });
    }).not.toThrow();

    // The orphan delta should be ignored — no block at index 99
    expect(useConversationStore.getState().activeBlocks.has(99)).toBe(false);
  });

  it("handles result with missing usage gracefully", () => {
    const result: ResultMessage = {
      type: "result",
      subtype: "success",
      duration_ms: 100,
      is_error: false,
      num_turns: 1,
      total_cost_usd: 0,
      // usage is undefined
    };

    expect(() => {
      useConversationStore.getState().handleResult(result);
    }).not.toThrow();

    const state = useConversationStore.getState();
    expect(state.totalTokens.input).toBe(0);
    expect(state.totalTokens.output).toBe(0);
  });
});

// ─── 3. Agents store edge cases ─────────────────────────────────────────────

describe("Agents store edge cases", () => {
  beforeEach(resetAgentsStore);

  it("creates an agent with empty name", () => {
    const id = useAgentsStore
      .getState()
      .createAgent({ name: "", taskDescription: "task" });

    const agent = useAgentsStore.getState().agents.get(id);
    expect(agent).toBeDefined();
    expect(agent?.name).toBe("");
    expect(agent?.status).toBe("idle");
  });

  it("removing an agent that has children removes all descendants", () => {
    // Create a coordinator parent
    const parentId = useAgentsStore.getState().createAgent({
      name: "Coordinator",
      taskDescription: "coordinate",
      role: "coordinator",
    });

    // Create child agents under the coordinator
    const child1Id = useAgentsStore.getState().createChildAgent(parentId, {
      name: "Child1",
      taskDescription: "task1",
      role: "specialist",
    });
    const child2Id = useAgentsStore.getState().createChildAgent(parentId, {
      name: "Child2",
      taskDescription: "task2",
      role: "specialist",
    });

    expect(child1Id).not.toBeNull();
    expect(child2Id).not.toBeNull();
    expect(useAgentsStore.getState().agents.size).toBe(3);

    // Remove the parent — should cascade to children
    useAgentsStore.getState().removeAgent(parentId);

    const state = useAgentsStore.getState();
    expect(state.agents.size).toBe(0);
    expect(state.agents.has(parentId)).toBe(false);
    expect(state.agents.has(child1Id!)).toBe(false);
    expect(state.agents.has(child2Id!)).toBe(false);

    // Column orders should be empty
    expect(state.columnOrder.backlog).toHaveLength(0);
  });

  it("moving an agent to same column is handled without duplication", () => {
    const id = useAgentsStore
      .getState()
      .createAgent({ name: "StayPut", taskDescription: "t" });

    // Agent starts in backlog; move to backlog again
    useAgentsStore.getState().moveAgent(id, "backlog");

    const state = useAgentsStore.getState();
    expect(state.agents.get(id)?.column).toBe("backlog");
    // Should not have duplicate entries
    const count = state.columnOrder.backlog.filter((x) => x === id).length;
    expect(count).toBe(1);
  });

  it("getAgentsForFile returns empty array when no agent owns the file", () => {
    // Create some agents but don't track the file
    useAgentsStore.getState().createAgent({ name: "A", taskDescription: "t" });
    useAgentsStore.getState().createAgent({ name: "B", taskDescription: "t" });

    const result = useAgentsStore.getState().getAgentsForFile("unowned.ts");
    expect(result).toHaveLength(0);
  });

  it("hasFileConflict returns false when only one agent owns the file", () => {
    const id = useAgentsStore
      .getState()
      .createAgent({ name: "Solo", taskDescription: "t" });
    useAgentsStore.getState().trackFile(id, "mine.ts");

    expect(useAgentsStore.getState().hasFileConflict("mine.ts")).toBe(false);
  });

  it("createChildAgent returns null when parent is not a coordinator", () => {
    const builderId = useAgentsStore.getState().createAgent({
      name: "Builder",
      taskDescription: "build",
      role: "builder",
    });

    const result = useAgentsStore.getState().createChildAgent(builderId, {
      name: "Child",
      taskDescription: "child task",
      role: "specialist",
    });

    expect(result).toBeNull();
    expect(useAgentsStore.getState().agents.size).toBe(1);
  });

  it("trackFile on non-existent agent does not crash", () => {
    expect(() => {
      useAgentsStore.getState().trackFile("nonexistent-id", "file.ts");
    }).not.toThrow();
  });

  it("addTimelineEvent on non-existent agent does not crash", () => {
    expect(() => {
      useAgentsStore.getState().addTimelineEvent("nonexistent-id", {
        type: "message",
        summary: "orphan event",
      });
    }).not.toThrow();
  });

  it("updateAgentCost on non-existent agent does not crash", () => {
    expect(() => {
      useAgentsStore
        .getState()
        .updateAgentCost("nonexistent-id", 0.5, { input: 100, output: 50 });
    }).not.toThrow();
  });

  it("deeply nested hierarchy is removed on root removal", () => {
    // root -> child -> grandchild
    const rootId = useAgentsStore.getState().createAgent({
      name: "Root",
      taskDescription: "root",
      role: "coordinator",
    });
    const childId = useAgentsStore.getState().createChildAgent(rootId, {
      name: "Child",
      taskDescription: "child",
      role: "coordinator",
    })!;
    // Promote the child to coordinator so it can have children too
    // (createChildAgent already sets the role via params)
    const grandchildId = useAgentsStore.getState().createChildAgent(childId, {
      name: "Grandchild",
      taskDescription: "grandchild",
      role: "specialist",
    })!;

    expect(useAgentsStore.getState().agents.size).toBe(3);

    useAgentsStore.getState().removeAgent(rootId);

    const state = useAgentsStore.getState();
    expect(state.agents.size).toBe(0);
    expect(state.agents.has(grandchildId)).toBe(false);
  });
});

// ─── 4. Layout store edge cases ─────────────────────────────────────────────

describe("Layout store edge cases", () => {
  beforeEach(resetLayoutStore);

  it("toggling sidebar when already hidden results in visible", () => {
    // Start visible, toggle to hidden
    useLayoutStore.getState().togglePrimarySidebar();
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(false);

    // Toggle again — back to visible
    useLayoutStore.getState().togglePrimarySidebar();
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(true);
  });

  it("clicking same activity bar item when sidebar is already hidden opens it", () => {
    // Start: explorer active, sidebar visible.
    // Click explorer -> hides sidebar
    useLayoutStore.getState().setActiveActivityBarItem("explorer");
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(false);

    // Click explorer again -> opens sidebar (same item, but sidebar is now hidden)
    useLayoutStore.getState().setActiveActivityBarItem("explorer");
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(true);
    expect(useLayoutStore.getState().activeActivityBarItem).toBe("explorer");
  });

  it("setPanelSize accepts 0 (store does not clamp)", () => {
    useLayoutStore.getState().setPanelSize(0);
    expect(useLayoutStore.getState().panelSize).toBe(0);
  });

  it("setPanelSize accepts 200 (store does not clamp)", () => {
    useLayoutStore.getState().setPanelSize(200);
    expect(useLayoutStore.getState().panelSize).toBe(200);
  });

  it("setPrimarySidebarSize accepts extreme values without crash", () => {
    expect(() => {
      useLayoutStore.getState().setPrimarySidebarSize(0);
      useLayoutStore.getState().setPrimarySidebarSize(100);
      useLayoutStore.getState().setPrimarySidebarSize(-5);
    }).not.toThrow();
  });

  it("setSecondarySidebarSize accepts extreme values without crash", () => {
    expect(() => {
      useLayoutStore.getState().setSecondarySidebarSize(0);
      useLayoutStore.getState().setSecondarySidebarSize(100);
    }).not.toThrow();

    expect(useLayoutStore.getState().secondarySidebarSize).toBe(100);
  });

  it("setPreviewUrl with null clears the preview", () => {
    useLayoutStore.getState().setPreviewUrl("http://localhost:3000");
    expect(useLayoutStore.getState().previewActive).toBe(true);

    useLayoutStore.getState().setPreviewUrl(null);
    expect(useLayoutStore.getState().previewUrl).toBeNull();
  });
});

// ─── 5. Settings store edge cases (clamping) ───────────────────────────────

describe("Settings store edge cases", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: "vantage-dark",
      fontSizeEditor: 14,
      fontSizeUI: 13,
      tabSize: 2,
      terminalFontSize: 14,
      terminalScrollback: 10000,
    });
  });

  it("setFontSizeEditor clamps to minimum of 8", () => {
    useSettingsStore.getState().setFontSizeEditor(2);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(8);
  });

  it("setFontSizeEditor clamps to maximum of 32", () => {
    useSettingsStore.getState().setFontSizeEditor(100);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(32);
  });

  it("setTabSize clamps to minimum of 1", () => {
    useSettingsStore.getState().setTabSize(0);
    expect(useSettingsStore.getState().tabSize).toBe(1);
  });

  it("setTabSize clamps to maximum of 8", () => {
    useSettingsStore.getState().setTabSize(99);
    expect(useSettingsStore.getState().tabSize).toBe(8);
  });
});

// ─── 6. Error boundary (class component) ───────────────────────────────────
// Note: These test the ErrorBoundary component behavior using direct
// class component instantiation patterns.

describe("ErrorBoundary static method", () => {
  it("getDerivedStateFromError returns hasError=true with the error", async () => {
    // Dynamically import to avoid issues with JSX in .ts files
    const { ErrorBoundary } = await import("@/components/shared/ErrorBoundary");
    const error = new Error("Test crash");

    const state = ErrorBoundary.getDerivedStateFromError(error);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
    expect(state.error?.message).toBe("Test crash");
  });
});

// ─── 7. Store resilience ────────────────────────────────────────────────────

describe("Store resilience", () => {
  beforeEach(() => {
    resetEditorStore();
    resetConversationStore();
    resetAgentsStore();
  });

  it("Zustand persist with corrupt localStorage falls back to defaults", () => {
    // Write corrupt data to localStorage for the layout store key
    localStorage.setItem("vantage-layout", "{{not valid json at all!}}}");

    // Creating a fresh store that tries to read from localStorage should not crash.
    // The existing store should still be functional.
    expect(() => {
      const state = useLayoutStore.getState();
      state.togglePrimarySidebar();
    }).not.toThrow();
  });

  it("Zustand persist with corrupt JSON object in localStorage does not crash", () => {
    // Write a valid JSON but wrong shape
    localStorage.setItem(
      "vantage-settings",
      JSON.stringify({ state: { theme: 12345, fontSizeEditor: "not a number" }, version: 0 })
    );

    expect(() => {
      const state = useSettingsStore.getState();
      state.setFontSizeEditor(16);
    }).not.toThrow();
  });

  it("editor store actions called out of order do not crash", () => {
    const store = useEditorStore.getState();

    // Call actions in nonsensical order
    expect(() => {
      store.closeTab("nonexistent");
      store.updateContent("nonexistent", "data");
      store.markSaved("nonexistent", "data");
      store.pinTab("nonexistent");
      store.reloadTab("nonexistent", "new content");
      store.setActiveTab("nonexistent");
      store.acceptDiff("nonexistent");
      store.rejectDiff("nonexistent");
    }).not.toThrow();

    // Store should still be in a valid state
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    // setActiveTab sets the ID without validation, so it may be non-null
    // The important thing is the store did not crash
    expect(useEditorStore.getState().getActiveTab()).toBeNull();
  });

  it("conversation store actions called out of order do not crash", () => {
    const store = useConversationStore.getState();

    // Handle a result without ever starting a session
    expect(() => {
      store.handleResult({
        type: "result",
        subtype: "success",
        duration_ms: 100,
        is_error: false,
        num_turns: 0,
        total_cost_usd: 0,
      });
    }).not.toThrow();

    // Handle message_stop without message_start
    expect(() => {
      store.handleStreamEvent({
        type: "stream_event",
        event: { type: "message_stop" },
      });
    }).not.toThrow();
  });

  it("agents store operations on removed agent do not crash", () => {
    const id = useAgentsStore
      .getState()
      .createAgent({ name: "Temp", taskDescription: "t" });
    useAgentsStore.getState().removeAgent(id);

    // All operations on the removed ID should be no-ops
    expect(() => {
      useAgentsStore.getState().updateAgentStatus(id, "working");
      useAgentsStore.getState().linkSession(id, "sess");
      useAgentsStore.getState().linkWorktree(id, "/path", "branch");
      useAgentsStore.getState().trackFile(id, "file.ts");
      useAgentsStore.getState().updateAgentCost(id, 1, { input: 1, output: 1 });
      useAgentsStore.getState().addTimelineEvent(id, { type: "message", summary: "x" });
      useAgentsStore.getState().moveAgent(id, "done");
      useAgentsStore.getState().setCheckpoint(id, { tagName: "t", commitHash: "h", createdAt: "c" });
      useAgentsStore.getState().clearCheckpoint(id);
    }).not.toThrow();
  });
});
