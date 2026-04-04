import { describe, it, expect, beforeEach } from "vitest";
import { useAgentsStore } from "../agents";
import type { AgentStatus, KanbanColumn } from "../agents";

// ─── Reset helper ────────────────────────────────────────────────────────────

function resetStore() {
  useAgentsStore.setState({
    agents: new Map(),
    columnOrder: {
      backlog: [],
      in_progress: [],
      review: [],
      done: [],
    },
    maxConcurrentAgents: 3,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useAgentsStore", () => {
  beforeEach(resetStore);

  // ── Default state ──────────────────────────────────────────────────────────

  describe("default state", () => {
    it("starts with an empty agents map", () => {
      expect(useAgentsStore.getState().agents.size).toBe(0);
    });

    it("starts with empty column orders", () => {
      const { columnOrder } = useAgentsStore.getState();
      expect(columnOrder.backlog).toHaveLength(0);
      expect(columnOrder.in_progress).toHaveLength(0);
      expect(columnOrder.review).toHaveLength(0);
      expect(columnOrder.done).toHaveLength(0);
    });

    it("starts with maxConcurrentAgents of 3", () => {
      expect(useAgentsStore.getState().maxConcurrentAgents).toBe(3);
    });
  });

  // ── createAgent ───────────────────────────────────────────────────────────

  describe("createAgent", () => {
    it("returns a non-empty string ID", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Alpha", taskDescription: "Do something" });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("adds the agent to the agents map", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Alpha", taskDescription: "Do something" });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("Alpha");
      expect(agent?.taskDescription).toBe("Do something");
    });

    it("initialises with idle status and backlog column", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Beta", taskDescription: "Task B" });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.status).toBe("idle");
      expect(agent?.column).toBe("backlog");
    });

    it("initialises sessionId and worktreePath as null", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Gamma", taskDescription: "Task C" });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.sessionId).toBeNull();
      expect(agent?.worktreePath).toBeNull();
      expect(agent?.branchName).toBeNull();
    });

    it("initialises empty assignedFiles and timeline", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Delta", taskDescription: "Task D" });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.assignedFiles).toHaveLength(0);
      expect(agent?.timeline).toHaveLength(0);
    });

    it("appends ID to backlog column order", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Epsilon", taskDescription: "Task E" });
      expect(useAgentsStore.getState().columnOrder.backlog).toContain(id);
    });

    it("assigns unique colors by cycling AGENT_COLORS", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "A1", taskDescription: "t1" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "A2", taskDescription: "t2" });
      const a1 = useAgentsStore.getState().agents.get(id1);
      const a2 = useAgentsStore.getState().agents.get(id2);
      expect(a1?.color).toBeTruthy();
      expect(a2?.color).toBeTruthy();
      expect(a1?.color).not.toBe(a2?.color);
    });

    it("stores the optional model field", () => {
      const id = useAgentsStore.getState().createAgent({
        name: "Model Agent",
        taskDescription: "uses model",
        model: "claude-opus-4-6",
      });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.model).toBe("claude-opus-4-6");
    });

    it("generates unique IDs for each agent", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "X", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "Y", taskDescription: "t" });
      expect(id1).not.toBe(id2);
    });
  });

  // ── removeAgent ───────────────────────────────────────────────────────────

  describe("removeAgent", () => {
    it("removes the agent from the map", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Doomed", taskDescription: "to be removed" });
      useAgentsStore.getState().removeAgent(id);
      expect(useAgentsStore.getState().agents.has(id)).toBe(false);
    });

    it("removes the agent from column order", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Gone", taskDescription: "gone" });
      useAgentsStore.getState().removeAgent(id);
      expect(useAgentsStore.getState().columnOrder.backlog).not.toContain(id);
    });

    it("is a no-op for non-existent IDs", () => {
      expect(() =>
        useAgentsStore.getState().removeAgent("does-not-exist"),
      ).not.toThrow();
    });
  });

  // ── updateAgentStatus ─────────────────────────────────────────────────────

  describe("updateAgentStatus", () => {
    const statuses: AgentStatus[] = [
      "idle",
      "working",
      "waiting_permission",
      "reviewing",
      "completed",
      "error",
      "stalled",
    ];

    for (const status of statuses) {
      it(`sets status to '${status}'`, () => {
        const id = useAgentsStore
          .getState()
          .createAgent({ name: "S", taskDescription: "t" });
        useAgentsStore.getState().updateAgentStatus(id, status);
        expect(useAgentsStore.getState().agents.get(id)?.status).toBe(status);
      });
    }

    it("updates lastActivityAt on status change", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Activity", taskDescription: "t" });
      const before = useAgentsStore.getState().agents.get(id)!.lastActivityAt;
      useAgentsStore.getState().updateAgentStatus(id, "working");
      const after = useAgentsStore.getState().agents.get(id)!.lastActivityAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("stores errorMessage when status is 'error'", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Err", taskDescription: "t" });
      useAgentsStore
        .getState()
        .updateAgentStatus(id, "error", "Something went wrong");
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.errorMessage).toBe("Something went wrong");
    });

    it("is a no-op for non-existent agent IDs", () => {
      expect(() =>
        useAgentsStore.getState().updateAgentStatus("ghost", "working"),
      ).not.toThrow();
    });
  });

  // ── linkSession ───────────────────────────────────────────────────────────

  describe("linkSession", () => {
    it("sets the sessionId on the agent", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Sess", taskDescription: "t" });
      useAgentsStore.getState().linkSession(id, "sess-xyz-123");
      expect(useAgentsStore.getState().agents.get(id)?.sessionId).toBe(
        "sess-xyz-123",
      );
    });

    it("is a no-op for non-existent agent IDs", () => {
      expect(() =>
        useAgentsStore.getState().linkSession("ghost", "s"),
      ).not.toThrow();
    });
  });

  // ── linkWorktree ──────────────────────────────────────────────────────────

  describe("linkWorktree", () => {
    it("sets worktreePath and branchName", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "WT", taskDescription: "t" });
      useAgentsStore
        .getState()
        .linkWorktree(id, "/repo/.worktrees/feature-x", "feature/x");
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.worktreePath).toBe("/repo/.worktrees/feature-x");
      expect(agent?.branchName).toBe("feature/x");
    });
  });

  // ── updateAgentCost ───────────────────────────────────────────────────────

  describe("updateAgentCost", () => {
    it("increments cost and token counts", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Cost", taskDescription: "t" });
      useAgentsStore
        .getState()
        .updateAgentCost(id, 0.05, { input: 1000, output: 200 });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.cost).toBeCloseTo(0.05);
      expect(agent?.tokens.input).toBe(1000);
      expect(agent?.tokens.output).toBe(200);
    });

    it("accumulates cost across multiple calls", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Accum", taskDescription: "t" });
      useAgentsStore
        .getState()
        .updateAgentCost(id, 0.01, { input: 100, output: 50 });
      useAgentsStore
        .getState()
        .updateAgentCost(id, 0.02, { input: 200, output: 80 });
      const agent = useAgentsStore.getState().agents.get(id);
      expect(agent?.cost).toBeCloseTo(0.03);
      expect(agent?.tokens.input).toBe(300);
      expect(agent?.tokens.output).toBe(130);
    });
  });

  // ── trackFile ─────────────────────────────────────────────────────────────

  describe("trackFile", () => {
    it("adds a file to assignedFiles", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "TF", taskDescription: "t" });
      useAgentsStore.getState().trackFile(id, "src/main.ts");
      expect(
        useAgentsStore.getState().agents.get(id)?.assignedFiles,
      ).toContain("src/main.ts");
    });

    it("does not add duplicate file paths", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "TF2", taskDescription: "t" });
      useAgentsStore.getState().trackFile(id, "src/app.ts");
      useAgentsStore.getState().trackFile(id, "src/app.ts");
      const files = useAgentsStore.getState().agents.get(id)?.assignedFiles;
      expect(files?.filter((f) => f === "src/app.ts")).toHaveLength(1);
    });

    it("tracks multiple distinct files", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "TF3", taskDescription: "t" });
      useAgentsStore.getState().trackFile(id, "a.ts");
      useAgentsStore.getState().trackFile(id, "b.ts");
      const files = useAgentsStore.getState().agents.get(id)?.assignedFiles;
      expect(files).toContain("a.ts");
      expect(files).toContain("b.ts");
      expect(files).toHaveLength(2);
    });
  });

  // ── addTimelineEvent ──────────────────────────────────────────────────────

  describe("addTimelineEvent", () => {
    it("appends a timeline event with id and timestamp", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "TL", taskDescription: "t" });
      useAgentsStore.getState().addTimelineEvent(id, {
        type: "tool_call",
        summary: "Called Read tool",
        toolName: "Read",
      });
      const timeline = useAgentsStore.getState().agents.get(id)?.timeline;
      expect(timeline).toHaveLength(1);
      expect(timeline?.[0].type).toBe("tool_call");
      expect(timeline?.[0].summary).toBe("Called Read tool");
      expect(timeline?.[0].toolName).toBe("Read");
      expect(timeline?.[0].id).toBeTruthy();
      expect(timeline?.[0].timestamp).toBeGreaterThan(0);
    });

    it("appends multiple events in order", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "TL2", taskDescription: "t" });
      useAgentsStore
        .getState()
        .addTimelineEvent(id, { type: "message", summary: "First" });
      useAgentsStore
        .getState()
        .addTimelineEvent(id, { type: "file_read", summary: "Second" });
      const timeline = useAgentsStore.getState().agents.get(id)?.timeline;
      expect(timeline).toHaveLength(2);
      expect(timeline?.[0].summary).toBe("First");
      expect(timeline?.[1].summary).toBe("Second");
    });
  });

  // ── moveAgent ─────────────────────────────────────────────────────────────

  describe("moveAgent", () => {
    it("moves an agent from backlog to in_progress", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Mover", taskDescription: "t" });
      useAgentsStore.getState().moveAgent(id, "in_progress");
      const state = useAgentsStore.getState();
      expect(state.agents.get(id)?.column).toBe("in_progress");
      expect(state.columnOrder.backlog).not.toContain(id);
      expect(state.columnOrder.in_progress).toContain(id);
    });

    it("sets status to 'working' when moved to in_progress", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Worker", taskDescription: "t" });
      useAgentsStore.getState().moveAgent(id, "in_progress");
      expect(useAgentsStore.getState().agents.get(id)?.status).toBe("working");
    });

    it("sets status to 'completed' when moved to done", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Done", taskDescription: "t" });
      useAgentsStore.getState().moveAgent(id, "done");
      expect(useAgentsStore.getState().agents.get(id)?.status).toBe(
        "completed",
      );
    });

    it("inserts at toIndex when specified", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "A", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "B", taskDescription: "t" });
      // Move both to review first
      useAgentsStore.getState().moveAgent(id1, "review");
      useAgentsStore.getState().moveAgent(id2, "review");
      // Now create a third and insert at position 0
      const id3 = useAgentsStore
        .getState()
        .createAgent({ name: "C", taskDescription: "t" });
      useAgentsStore.getState().moveAgent(id3, "review", 0);
      const reviewOrder = useAgentsStore.getState().columnOrder.review;
      expect(reviewOrder[0]).toBe(id3);
    });

    it("moves between non-backlog columns", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Traveler", taskDescription: "t" });
      useAgentsStore.getState().moveAgent(id, "in_progress");
      useAgentsStore.getState().moveAgent(id, "review");
      const state = useAgentsStore.getState();
      expect(state.agents.get(id)?.column).toBe("review");
      expect(state.columnOrder.in_progress).not.toContain(id);
      expect(state.columnOrder.review).toContain(id);
    });
  });

  // ── reorderInColumn ───────────────────────────────────────────────────────

  describe("reorderInColumn", () => {
    it("replaces the column order with the new array", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "R1", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "R2", taskDescription: "t" });
      // Swap order
      useAgentsStore.getState().reorderInColumn("backlog", [id2, id1]);
      const order = useAgentsStore.getState().columnOrder.backlog;
      expect(order[0]).toBe(id2);
      expect(order[1]).toBe(id1);
    });
  });

  // ── getAgentsList ─────────────────────────────────────────────────────────

  describe("getAgentsList", () => {
    it("returns all agents as an array", () => {
      useAgentsStore
        .getState()
        .createAgent({ name: "A", taskDescription: "t" });
      useAgentsStore
        .getState()
        .createAgent({ name: "B", taskDescription: "t" });
      const list = useAgentsStore.getState().getAgentsList();
      expect(list).toHaveLength(2);
    });

    it("returns empty array when no agents", () => {
      expect(useAgentsStore.getState().getAgentsList()).toHaveLength(0);
    });
  });

  // ── getAgentsInColumn ─────────────────────────────────────────────────────

  describe("getAgentsInColumn", () => {
    it("returns agents in the specified column in order", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "Col1", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "Col2", taskDescription: "t" });
      const agents = useAgentsStore.getState().getAgentsInColumn("backlog");
      expect(agents.map((a) => a.id)).toEqual([id1, id2]);
    });

    it("returns empty array for empty column", () => {
      expect(
        useAgentsStore.getState().getAgentsInColumn("in_progress"),
      ).toHaveLength(0);
    });
  });

  // ── getAgentBySessionId ───────────────────────────────────────────────────

  describe("getAgentBySessionId", () => {
    it("finds the agent with matching sessionId", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Sess", taskDescription: "t" });
      useAgentsStore.getState().linkSession(id, "unique-sess-abc");
      const found = useAgentsStore
        .getState()
        .getAgentBySessionId("unique-sess-abc");
      expect(found?.id).toBe(id);
    });

    it("returns undefined when no agent has that sessionId", () => {
      expect(
        useAgentsStore.getState().getAgentBySessionId("nonexistent"),
      ).toBeUndefined();
    });
  });

  // ── getAgentsForFile ──────────────────────────────────────────────────────

  describe("getAgentsForFile", () => {
    it("returns agents that have tracked the file", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "F1", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "F2", taskDescription: "t" });
      useAgentsStore.getState().trackFile(id1, "shared.ts");
      useAgentsStore.getState().trackFile(id2, "shared.ts");
      const agents = useAgentsStore.getState().getAgentsForFile("shared.ts");
      expect(agents.map((a) => a.id)).toContain(id1);
      expect(agents.map((a) => a.id)).toContain(id2);
    });

    it("returns empty array when no agent tracks the file", () => {
      expect(
        useAgentsStore.getState().getAgentsForFile("nonexistent.ts"),
      ).toHaveLength(0);
    });
  });

  // ── getActiveAgentCount ───────────────────────────────────────────────────

  describe("getActiveAgentCount", () => {
    it("counts working and waiting_permission agents", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "W1", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "W2", taskDescription: "t" });
      const id3 = useAgentsStore
        .getState()
        .createAgent({ name: "W3", taskDescription: "t" });
      useAgentsStore.getState().updateAgentStatus(id1, "working");
      useAgentsStore.getState().updateAgentStatus(id2, "waiting_permission");
      useAgentsStore.getState().updateAgentStatus(id3, "idle");
      expect(useAgentsStore.getState().getActiveAgentCount()).toBe(2);
    });

    it("returns 0 when no agents are active", () => {
      useAgentsStore
        .getState()
        .createAgent({ name: "Idle", taskDescription: "t" });
      expect(useAgentsStore.getState().getActiveAgentCount()).toBe(0);
    });
  });

  // ── hasFileConflict ───────────────────────────────────────────────────────

  describe("hasFileConflict", () => {
    it("returns true when multiple agents have tracked the same file", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "C1", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "C2", taskDescription: "t" });
      useAgentsStore.getState().trackFile(id1, "conflict.ts");
      useAgentsStore.getState().trackFile(id2, "conflict.ts");
      expect(useAgentsStore.getState().hasFileConflict("conflict.ts")).toBe(
        true,
      );
    });

    it("returns false when only one agent has tracked the file", () => {
      const id = useAgentsStore
        .getState()
        .createAgent({ name: "Solo", taskDescription: "t" });
      useAgentsStore.getState().trackFile(id, "solo.ts");
      expect(useAgentsStore.getState().hasFileConflict("solo.ts")).toBe(false);
    });

    it("returns false when no agent has tracked the file", () => {
      expect(useAgentsStore.getState().hasFileConflict("ghost.ts")).toBe(false);
    });
  });

  // ── Kanban column ordering across multiple operations ─────────────────────

  describe("column ordering integrity", () => {
    it("maintains all other agents in backlog when one is removed", () => {
      const id1 = useAgentsStore
        .getState()
        .createAgent({ name: "Keep1", taskDescription: "t" });
      const id2 = useAgentsStore
        .getState()
        .createAgent({ name: "Remove", taskDescription: "t" });
      const id3 = useAgentsStore
        .getState()
        .createAgent({ name: "Keep2", taskDescription: "t" });
      useAgentsStore.getState().removeAgent(id2);
      const order = useAgentsStore.getState().columnOrder.backlog;
      expect(order).toContain(id1);
      expect(order).not.toContain(id2);
      expect(order).toContain(id3);
    });

    it("correctly orders multiple agents moved to the same column", () => {
      const ids = ["A", "B", "C"].map((name) =>
        useAgentsStore.getState().createAgent({ name, taskDescription: "t" }),
      );
      for (const id of ids) {
        useAgentsStore.getState().moveAgent(id, "review");
      }
      const order = useAgentsStore.getState().columnOrder.review;
      expect(order).toEqual(ids);
    });
  });

  // ── Columns type coverage ─────────────────────────────────────────────────

  describe("all kanban columns", () => {
    const columns: KanbanColumn[] = ["backlog", "in_progress", "review", "done"];

    for (const col of columns) {
      it(`can move agent to column '${col}'`, () => {
        const id = useAgentsStore.getState().createAgent({
          name: `Agent-${col}`,
          taskDescription: "t",
        });
        useAgentsStore.getState().moveAgent(id, col);
        expect(useAgentsStore.getState().agents.get(id)?.column).toBe(col);
        expect(useAgentsStore.getState().columnOrder[col]).toContain(id);
      });
    }
  });
});
