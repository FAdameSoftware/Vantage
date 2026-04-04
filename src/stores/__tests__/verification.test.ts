import { describe, it, expect, beforeEach } from "vitest";
import { useVerificationStore } from "../verification";

describe("verificationStore", () => {
  beforeEach(() => {
    useVerificationStore.setState({
      agents: new Map(),
      isRunningAll: false,
    });
  });

  it("has correct default values", () => {
    const state = useVerificationStore.getState();
    expect(state.agents.size).toBe(0);
    expect(state.isRunningAll).toBe(false);
  });

  it("initAgent creates a new agent verification entry with pending checks", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ]);

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent).toBeDefined();
    expect(agent!.agentName).toBe("Agent 1");
    expect(agent!.worktreePath).toBe("/wt/a1");
    expect(agent!.checks).toHaveLength(2);
    expect(agent!.checks[0].status).toBe("pending");
    expect(agent!.checks[1].status).toBe("pending");
    expect(agent!.overallStatus).toBe("pending");
  });

  it("initAgent re-initializes an existing agent", () => {
    const store = useVerificationStore.getState();
    store.initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
    ]);
    store.updateCheck("a1", "lint", { status: "passed" });

    // Re-init should reset
    useVerificationStore.getState().initAgent("a1", "Agent 1 v2", "/wt/a1", [
      { name: "build", command: "npm run build" },
    ]);

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent!.agentName).toBe("Agent 1 v2");
    expect(agent!.checks).toHaveLength(1);
    expect(agent!.checks[0].name).toBe("build");
    expect(agent!.checks[0].status).toBe("pending");
  });

  it("updateCheck updates a specific check and recomputes overall status", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ]);

    useVerificationStore.getState().updateCheck("a1", "lint", {
      status: "passed",
      exitCode: 0,
      durationMs: 500,
    });

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent!.checks[0].status).toBe("passed");
    expect(agent!.checks[0].durationMs).toBe(500);
    // One passed, one still pending => overall pending
    expect(agent!.overallStatus).toBe("pending");
  });

  it("overall status becomes passed when all checks pass", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ]);

    useVerificationStore.getState().updateCheck("a1", "lint", { status: "passed" });
    useVerificationStore.getState().updateCheck("a1", "test", { status: "passed" });

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent!.overallStatus).toBe("passed");
  });

  it("overall status becomes failed if any check fails", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ]);

    useVerificationStore.getState().updateCheck("a1", "lint", { status: "passed" });
    useVerificationStore.getState().updateCheck("a1", "test", { status: "failed" });

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent!.overallStatus).toBe("failed");
  });

  it("overall status becomes running if any check is running", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
      { name: "test", command: "npm test" },
    ]);

    useVerificationStore.getState().updateCheck("a1", "lint", { status: "running" });

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent!.overallStatus).toBe("running");
  });

  it("updateCheck is a no-op for unknown agent", () => {
    // Should not throw
    useVerificationStore.getState().updateCheck("nonexistent", "lint", { status: "passed" });
    expect(useVerificationStore.getState().agents.size).toBe(0);
  });

  it("setOverallStatus manually overrides the overall status", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", [
      { name: "lint", command: "npm run lint" },
    ]);

    useVerificationStore.getState().setOverallStatus("a1", "skipped");

    const agent = useVerificationStore.getState().agents.get("a1");
    expect(agent!.overallStatus).toBe("skipped");
    expect(agent!.lastRunAt).toBeTypeOf("number");
  });

  it("setRunningAll toggles the global running flag", () => {
    useVerificationStore.getState().setRunningAll(true);
    expect(useVerificationStore.getState().isRunningAll).toBe(true);

    useVerificationStore.getState().setRunningAll(false);
    expect(useVerificationStore.getState().isRunningAll).toBe(false);
  });

  it("removeAgent removes the agent from the map", () => {
    useVerificationStore.getState().initAgent("a1", "Agent 1", "/wt/a1", []);
    useVerificationStore.getState().initAgent("a2", "Agent 2", "/wt/a2", []);

    useVerificationStore.getState().removeAgent("a1");

    expect(useVerificationStore.getState().agents.has("a1")).toBe(false);
    expect(useVerificationStore.getState().agents.has("a2")).toBe(true);
  });

  it("getPassCount counts agents with passed overall status", () => {
    useVerificationStore.getState().initAgent("a1", "A1", "/wt/a1", [
      { name: "lint", command: "lint" },
    ]);
    useVerificationStore.getState().initAgent("a2", "A2", "/wt/a2", [
      { name: "lint", command: "lint" },
    ]);
    useVerificationStore.getState().initAgent("a3", "A3", "/wt/a3", [
      { name: "lint", command: "lint" },
    ]);

    useVerificationStore.getState().updateCheck("a1", "lint", { status: "passed" });
    useVerificationStore.getState().updateCheck("a2", "lint", { status: "failed" });
    useVerificationStore.getState().updateCheck("a3", "lint", { status: "passed" });

    expect(useVerificationStore.getState().getPassCount()).toBe(2);
    expect(useVerificationStore.getState().getFailCount()).toBe(1);
    expect(useVerificationStore.getState().getTotalCount()).toBe(3);
  });
});
