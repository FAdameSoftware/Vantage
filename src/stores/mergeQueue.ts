import { create } from "zustand";
import type { CheckStatus } from "./verification";

// ── Types ──────────────────────────────────────────────────────────

export type GateStatus = CheckStatus;

export interface QualityGateResult {
  gateName: string;
  command: string;
  status: GateStatus;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface MergeQueueEntry {
  id: string;
  agentId: string;
  agentName: string;
  branchName: string;
  worktreePath: string;
  /** Ordered list of quality gate results */
  gates: QualityGateResult[];
  /** Overall status */
  status:
    | "queued"
    | "checking"
    | "ready"
    | "merging"
    | "merged"
    | "failed"
    | "conflict";
  /** Position in queue (0 = next to merge) */
  position: number;
  addedAt: number;
  mergedAt?: number;
}

// ── Store ──────────────────────────────────────────────────────────

export interface MergeQueueState {
  entries: MergeQueueEntry[];

  /** Default quality gates to run (detected from project's package.json) */
  defaultGates: { name: string; command: string }[];

  /** Add an agent's branch to the merge queue */
  addToQueue: (
    agentId: string,
    agentName: string,
    branchName: string,
    worktreePath: string,
  ) => void;

  /** Remove an entry from the queue by ID */
  removeFromQueue: (id: string) => void;

  /** Reorder the queue by providing the new ordered list of IDs */
  reorderQueue: (orderedIds: string[]) => void;

  /** Update the result for a specific gate on a specific entry */
  updateGateResult: (
    entryId: string,
    gateName: string,
    result: Partial<QualityGateResult>,
  ) => void;

  /** Update the overall status of a queue entry */
  updateEntryStatus: (
    entryId: string,
    status: MergeQueueEntry["status"],
  ) => void;

  /** Mark an entry as merged with a timestamp */
  markMerged: (entryId: string) => void;

  /** Set the default gates list (typically from detect_quality_gates) */
  setDefaultGates: (gates: { name: string; command: string }[]) => void;

  /** Get the first entry that has all gates passed and is ready to merge */
  getNextReady: () => MergeQueueEntry | undefined;

  /** Check whether an agent is already in the queue */
  isAgentInQueue: (agentId: string) => boolean;

  /** Reset the merge queue to its default state (used on workspace switch) */
  resetToDefaults: () => void;
}

export const useMergeQueueStore = create<MergeQueueState>()((set, get) => ({
  entries: [],
  defaultGates: [],

  addToQueue(agentId, agentName, branchName, worktreePath) {
    const { entries, defaultGates } = get();

    // Prevent duplicates
    if (entries.some((e) => e.agentId === agentId)) return;

    const gates: QualityGateResult[] = defaultGates.map((g) => ({
      gateName: g.name,
      command: g.command,
      status: "pending" as const,
    }));

    const entry: MergeQueueEntry = {
      id: crypto.randomUUID(),
      agentId,
      agentName,
      branchName,
      worktreePath,
      gates,
      status: "queued",
      position: entries.length,
      addedAt: Date.now(),
    };

    set({ entries: [...entries, entry] });
  },

  removeFromQueue(id) {
    set((state) => {
      const filtered = state.entries.filter((e) => e.id !== id);
      // Recompute positions
      const reindexed = filtered.map((e, i) => ({ ...e, position: i }));
      return { entries: reindexed };
    });
  },

  reorderQueue(orderedIds) {
    set((state) => {
      const byId = new Map(state.entries.map((e) => [e.id, e]));
      const reordered: MergeQueueEntry[] = [];

      for (let i = 0; i < orderedIds.length; i++) {
        const entry = byId.get(orderedIds[i]);
        if (entry) {
          reordered.push({ ...entry, position: i });
        }
      }

      return { entries: reordered };
    });
  },

  updateGateResult(entryId, gateName, result) {
    set((state) => ({
      entries: state.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          gates: entry.gates.map((g) =>
            g.gateName === gateName ? { ...g, ...result } : g,
          ),
        };
      }),
    }));
  },

  updateEntryStatus(entryId, status) {
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId ? { ...entry, status } : entry,
      ),
    }));
  },

  markMerged(entryId) {
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, status: "merged" as const, mergedAt: Date.now() }
          : entry,
      ),
    }));
  },

  setDefaultGates(gates) {
    set({ defaultGates: gates });
  },

  getNextReady() {
    return get().entries.find((e) => e.status === "ready");
  },

  isAgentInQueue(agentId) {
    return get().entries.some((e) => e.agentId === agentId);
  },

  resetToDefaults() {
    set({
      entries: [],
      defaultGates: [],
    });
  },
}));
