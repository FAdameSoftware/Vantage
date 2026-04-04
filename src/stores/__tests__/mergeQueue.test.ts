import { describe, it, expect, beforeEach } from "vitest";
import { useMergeQueueStore } from "../mergeQueue";

describe("mergeQueueStore", () => {
  beforeEach(() => {
    useMergeQueueStore.setState({
      entries: [],
      defaultGates: [],
    });
  });

  it("has correct default values", () => {
    const state = useMergeQueueStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.defaultGates).toEqual([]);
  });

  it("setDefaultGates sets the gate list", () => {
    const gates = [
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ];
    useMergeQueueStore.getState().setDefaultGates(gates);
    expect(useMergeQueueStore.getState().defaultGates).toEqual(gates);
  });

  it("addToQueue creates entry with pending gates from defaultGates", () => {
    useMergeQueueStore.getState().setDefaultGates([
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ]);

    useMergeQueueStore.getState().addToQueue("agent-1", "Agent One", "feat/one", "/worktree/one");

    const entries = useMergeQueueStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].agentId).toBe("agent-1");
    expect(entries[0].agentName).toBe("Agent One");
    expect(entries[0].branchName).toBe("feat/one");
    expect(entries[0].status).toBe("queued");
    expect(entries[0].position).toBe(0);
    expect(entries[0].gates).toHaveLength(2);
    expect(entries[0].gates[0].status).toBe("pending");
    expect(entries[0].gates[1].status).toBe("pending");
  });

  it("addToQueue prevents duplicate agents", () => {
    useMergeQueueStore.getState().addToQueue("agent-1", "Agent One", "feat/one", "/wt/one");
    useMergeQueueStore.getState().addToQueue("agent-1", "Agent One", "feat/one-v2", "/wt/one");

    expect(useMergeQueueStore.getState().entries).toHaveLength(1);
  });

  it("addToQueue assigns sequential positions", () => {
    const store = useMergeQueueStore.getState();
    store.addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    store.addToQueue("agent-2", "A2", "feat/2", "/wt/2");
    store.addToQueue("agent-3", "A3", "feat/3", "/wt/3");

    const entries = useMergeQueueStore.getState().entries;
    expect(entries[0].position).toBe(0);
    expect(entries[1].position).toBe(1);
    expect(entries[2].position).toBe(2);
  });

  it("removeFromQueue removes entry and reindexes positions", () => {
    const store = useMergeQueueStore.getState();
    store.addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    store.addToQueue("agent-2", "A2", "feat/2", "/wt/2");
    store.addToQueue("agent-3", "A3", "feat/3", "/wt/3");

    const id = useMergeQueueStore.getState().entries[0].id;
    useMergeQueueStore.getState().removeFromQueue(id);

    const entries = useMergeQueueStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].agentId).toBe("agent-2");
    expect(entries[0].position).toBe(0);
    expect(entries[1].agentId).toBe("agent-3");
    expect(entries[1].position).toBe(1);
  });

  it("reorderQueue reorders entries by ID list", () => {
    const store = useMergeQueueStore.getState();
    store.addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    store.addToQueue("agent-2", "A2", "feat/2", "/wt/2");

    const entries = useMergeQueueStore.getState().entries;
    const [id1, id2] = [entries[0].id, entries[1].id];

    useMergeQueueStore.getState().reorderQueue([id2, id1]);

    const reordered = useMergeQueueStore.getState().entries;
    expect(reordered[0].agentId).toBe("agent-2");
    expect(reordered[0].position).toBe(0);
    expect(reordered[1].agentId).toBe("agent-1");
    expect(reordered[1].position).toBe(1);
  });

  it("updateGateResult updates a specific gate on an entry", () => {
    useMergeQueueStore.getState().setDefaultGates([
      { name: "lint", command: "npm run lint" },
    ]);
    useMergeQueueStore.getState().addToQueue("agent-1", "A1", "feat/1", "/wt/1");

    const entryId = useMergeQueueStore.getState().entries[0].id;
    useMergeQueueStore.getState().updateGateResult(entryId, "lint", {
      status: "passed",
      exitCode: 0,
      durationMs: 1234,
    });

    const gate = useMergeQueueStore.getState().entries[0].gates[0];
    expect(gate.status).toBe("passed");
    expect(gate.exitCode).toBe(0);
    expect(gate.durationMs).toBe(1234);
  });

  it("updateEntryStatus updates the overall status", () => {
    useMergeQueueStore.getState().addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    const entryId = useMergeQueueStore.getState().entries[0].id;

    useMergeQueueStore.getState().updateEntryStatus(entryId, "checking");
    expect(useMergeQueueStore.getState().entries[0].status).toBe("checking");

    useMergeQueueStore.getState().updateEntryStatus(entryId, "ready");
    expect(useMergeQueueStore.getState().entries[0].status).toBe("ready");
  });

  it("markMerged sets status to merged and adds mergedAt timestamp", () => {
    useMergeQueueStore.getState().addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    const entryId = useMergeQueueStore.getState().entries[0].id;

    useMergeQueueStore.getState().markMerged(entryId);

    const entry = useMergeQueueStore.getState().entries[0];
    expect(entry.status).toBe("merged");
    expect(entry.mergedAt).toBeTypeOf("number");
  });

  it("getNextReady returns the first ready entry", () => {
    const store = useMergeQueueStore.getState();
    store.addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    store.addToQueue("agent-2", "A2", "feat/2", "/wt/2");

    const entries = useMergeQueueStore.getState().entries;
    useMergeQueueStore.getState().updateEntryStatus(entries[1].id, "ready");

    const next = useMergeQueueStore.getState().getNextReady();
    expect(next).toBeDefined();
    expect(next!.agentId).toBe("agent-2");
  });

  it("getNextReady returns undefined when no entries are ready", () => {
    useMergeQueueStore.getState().addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    expect(useMergeQueueStore.getState().getNextReady()).toBeUndefined();
  });

  it("isAgentInQueue correctly checks presence", () => {
    useMergeQueueStore.getState().addToQueue("agent-1", "A1", "feat/1", "/wt/1");
    expect(useMergeQueueStore.getState().isAgentInQueue("agent-1")).toBe(true);
    expect(useMergeQueueStore.getState().isAgentInQueue("agent-2")).toBe(false);
  });
});
