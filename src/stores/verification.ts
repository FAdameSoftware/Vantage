import { create } from "zustand";

// ── Types ──────────────────────────────────────────────────────────

export type CheckStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface VerificationCheck {
  name: string;
  command: string;
  status: CheckStatus;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  lastRunAt?: number;
}

export interface AgentVerification {
  agentId: string;
  agentName: string;
  worktreePath: string;
  checks: VerificationCheck[];
  overallStatus: CheckStatus;
  lastRunAt?: number;
}

// ── Store ──────────────────────────────────────────────────────────

export interface VerificationState {
  agents: Map<string, AgentVerification>;
  isRunningAll: boolean;

  /** Initialize (or re-initialize) an agent's verification entry */
  initAgent: (
    agentId: string,
    agentName: string,
    worktreePath: string,
    checks: { name: string; command: string }[],
  ) => void;

  /** Update a single check's result for an agent */
  updateCheck: (
    agentId: string,
    checkName: string,
    update: Partial<VerificationCheck>,
  ) => void;

  /** Set the overall status for an agent */
  setOverallStatus: (agentId: string, status: CheckStatus) => void;

  /** Set whether a global "run all" is in progress */
  setRunningAll: (running: boolean) => void;

  /** Remove an agent from the verification dashboard */
  removeAgent: (agentId: string) => void;

  /** Count agents whose overall status is "passed" */
  getPassCount: () => number;

  /** Count agents whose overall status is "failed" */
  getFailCount: () => number;

  /** Total number of tracked agents */
  getTotalCount: () => number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function computeOverall(checks: VerificationCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "failed")) return "failed";
  if (checks.some((c) => c.status === "running")) return "running";
  if (checks.every((c) => c.status === "passed")) return "passed";
  return "pending";
}

// ── Store implementation ────────────────────────────────────────────

export const useVerificationStore = create<VerificationState>()((set, get) => ({
  agents: new Map(),
  isRunningAll: false,

  initAgent(agentId, agentName, worktreePath, checks) {
    set((state) => {
      const next = new Map(state.agents);
      next.set(agentId, {
        agentId,
        agentName,
        worktreePath,
        checks: checks.map((c) => ({
          name: c.name,
          command: c.command,
          status: "pending" as const,
        })),
        overallStatus: "pending",
      });
      return { agents: next };
    });
  },

  updateCheck(agentId, checkName, update) {
    set((state) => {
      const agentVerif = state.agents.get(agentId);
      if (!agentVerif) return {};

      const next = new Map(state.agents);
      const updatedChecks = agentVerif.checks.map((c) =>
        c.name === checkName ? { ...c, ...update } : c,
      );
      const overall = computeOverall(updatedChecks);

      next.set(agentId, {
        ...agentVerif,
        checks: updatedChecks,
        overallStatus: overall,
      });

      return { agents: next };
    });
  },

  setOverallStatus(agentId, status) {
    set((state) => {
      const agentVerif = state.agents.get(agentId);
      if (!agentVerif) return {};

      const next = new Map(state.agents);
      next.set(agentId, {
        ...agentVerif,
        overallStatus: status,
        lastRunAt: Date.now(),
      });

      return { agents: next };
    });
  },

  setRunningAll(running) {
    set({ isRunningAll: running });
  },

  removeAgent(agentId) {
    set((state) => {
      const next = new Map(state.agents);
      next.delete(agentId);
      return { agents: next };
    });
  },

  getPassCount() {
    let count = 0;
    for (const v of get().agents.values()) {
      if (v.overallStatus === "passed") count++;
    }
    return count;
  },

  getFailCount() {
    let count = 0;
    for (const v of get().agents.values()) {
      if (v.overallStatus === "failed") count++;
    }
    return count;
  },

  getTotalCount() {
    return get().agents.size;
  },
}));
