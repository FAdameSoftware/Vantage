import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { formatDuration } from "@/lib/formatters";

/** Shape returned by the Rust `get_project_usage` command */
export interface ProjectUsage {
  session_id: string;
  session_cost: number;
  session_input_tokens: number;
  session_output_tokens: number;
  session_cache_tokens: number;
  session_cache_read_tokens: number;
  model: string | null;
  session_turn_count: number;
  last_activity: string;
  all_time_cost: number;
  all_time_tokens: number;
  session_count: number;
}

// ── Per-turn usage record (for attribution UI) ────────────────────────

export interface TurnUsage {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  model?: string;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
}

// ── Per-model accumulator ─────────────────────────────────────────────

export interface ModelUsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  /** Derived from proportion of total cost attributed to this model */
  costUsd: number;
}

export interface UsageState {
  /** When the current session started (epoch ms) */
  sessionStartedAt: number | null;
  /** Running total of input tokens across all turns */
  inputTokens: number;
  /** Running total of output tokens across all turns */
  outputTokens: number;
  /** Cache creation tokens */
  cacheCreationTokens: number;
  /** Cache read tokens */
  cacheReadTokens: number;
  /** Running total of cache creation tokens (alias for clarity) */
  totalCacheCreationTokens: number;
  /** Running total of cache read tokens (alias for clarity) */
  totalCacheReadTokens: number;
  /** Running total cost in USD (API-sourced via total_cost_usd) */
  totalCostUsd: number;
  /** Number of completed turns */
  turnCount: number;
  /** Last known rate limit info (if available) */
  rateLimitInfo: {
    requestsRemaining: number | null;
    tokensRemaining: number | null;
    resetsAt: string | null;
  } | null;

  // ── Per-turn history ──
  /** History of each turn's usage for attribution UI */
  turnHistory: TurnUsage[];

  // ── Per-model breakdown ──
  /** Accumulated usage per model (from modelUsage in result messages) */
  modelBreakdown: Record<string, ModelUsageAccumulator>;

  // ── Project-level usage from session files ──
  /** Whether project usage has been loaded from disk */
  projectUsageLoaded: boolean;
  /** Cost across all sessions for this project */
  allTimeCost: number;
  /** Total tokens across all sessions */
  allTimeTokens: number;
  /** Number of session files found */
  sessionCount: number;
  /** Model from the latest session file */
  lastSessionModel: string | null;
  /** ISO 8601 timestamp of last session activity */
  lastActivity: string | null;

  // Actions
  startSession: () => void;
  addTurnUsage: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreation?: number;
    cacheRead?: number;
    costUsd?: number;
    model?: string;
    durationMs?: number;
    durationApiMs?: number;
    numTurns?: number;
    modelUsage?: Record<string, { input_tokens: number; output_tokens: number }>;
  }) => void;
  setRateLimitInfo: (info: UsageState["rateLimitInfo"]) => void;
  /** Load usage from session files on disk for a project */
  loadProjectUsage: (cwd: string) => Promise<void>;
  reset: () => void;

  // Computed getters (as functions to avoid stale closures)
  getSessionDurationMs: () => number;
  getSessionDurationFormatted: () => string;
  getTotalTokens: () => number;
  getTokensFormatted: () => string;
}

export const useUsageStore = create<UsageState>()((set, get) => ({
  sessionStartedAt: null,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalCacheReadTokens: 0,
  totalCostUsd: 0,
  turnCount: 0,
  rateLimitInfo: null,
  turnHistory: [],
  modelBreakdown: {},

  // Project-level usage defaults
  projectUsageLoaded: false,
  allTimeCost: 0,
  allTimeTokens: 0,
  sessionCount: 0,
  lastSessionModel: null,
  lastActivity: null,

  startSession() {
    set({
      sessionStartedAt: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUsd: 0,
      turnCount: 0,
      rateLimitInfo: null,
      turnHistory: [],
      modelBreakdown: {},
    });
  },

  addTurnUsage(usage) {
    set((state) => {
      const cacheCreation = usage.cacheCreation ?? 0;
      const cacheRead = usage.cacheRead ?? 0;

      // Build per-turn record for history
      const turnRecord: TurnUsage = {
        timestamp: Date.now(),
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheCreationTokens: cacheCreation,
        cacheReadTokens: cacheRead,
        costUsd: usage.costUsd ?? 0,
        model: usage.model,
        durationMs: usage.durationMs,
        durationApiMs: usage.durationApiMs,
        numTurns: usage.numTurns,
      };

      // Update per-model breakdown from modelUsage data
      const nextModelBreakdown = { ...state.modelBreakdown };
      if (usage.modelUsage) {
        // modelUsage gives per-model token breakdown from the API
        // We distribute cost proportionally by output tokens (which dominate cost)
        const totalOutputFromModels = Object.values(usage.modelUsage).reduce(
          (sum, m) => sum + m.output_tokens,
          0,
        );
        const turnCost = usage.costUsd ?? 0;

        for (const [model, modelTokens] of Object.entries(usage.modelUsage)) {
          const existing = nextModelBreakdown[model] ?? {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
          };
          const costShare =
            totalOutputFromModels > 0
              ? (modelTokens.output_tokens / totalOutputFromModels) * turnCost
              : turnCost / Object.keys(usage.modelUsage).length;
          nextModelBreakdown[model] = {
            inputTokens: existing.inputTokens + modelTokens.input_tokens,
            outputTokens: existing.outputTokens + modelTokens.output_tokens,
            costUsd: existing.costUsd + costShare,
          };
        }
      } else if (usage.model) {
        // Fallback: attribute all tokens/cost to the single known model
        const existing = nextModelBreakdown[usage.model] ?? {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
        nextModelBreakdown[usage.model] = {
          inputTokens: existing.inputTokens + (usage.inputTokens ?? 0),
          outputTokens: existing.outputTokens + (usage.outputTokens ?? 0),
          costUsd: existing.costUsd + (usage.costUsd ?? 0),
        };
      }

      return {
        inputTokens: state.inputTokens + (usage.inputTokens ?? 0),
        outputTokens: state.outputTokens + (usage.outputTokens ?? 0),
        cacheCreationTokens: state.cacheCreationTokens + cacheCreation,
        cacheReadTokens: state.cacheReadTokens + cacheRead,
        totalCacheCreationTokens: state.totalCacheCreationTokens + cacheCreation,
        totalCacheReadTokens: state.totalCacheReadTokens + cacheRead,
        totalCostUsd: state.totalCostUsd + (usage.costUsd ?? 0),
        turnCount: state.turnCount + 1,
        turnHistory: [...state.turnHistory, turnRecord],
        modelBreakdown: nextModelBreakdown,
      };
    });
  },

  setRateLimitInfo(info) {
    set({ rateLimitInfo: info });
  },

  async loadProjectUsage(cwd: string) {
    try {
      const usage = await invoke<ProjectUsage>("get_project_usage", { cwd });
      const { sessionStartedAt } = get();
      // Only seed from disk if no live session is active
      if (sessionStartedAt === null) {
        set({
          inputTokens: usage.session_input_tokens,
          outputTokens: usage.session_output_tokens,
          cacheCreationTokens: usage.session_cache_tokens,
          cacheReadTokens: usage.session_cache_read_tokens,
          totalCacheCreationTokens: usage.session_cache_tokens,
          totalCacheReadTokens: usage.session_cache_read_tokens,
          totalCostUsd: usage.session_cost,
          turnCount: usage.session_turn_count,
          lastSessionModel: usage.model,
        });
      }
      set({
        projectUsageLoaded: true,
        allTimeCost: usage.all_time_cost,
        allTimeTokens: usage.all_time_tokens,
        sessionCount: usage.session_count,
        lastActivity: usage.last_activity,
        lastSessionModel: usage.model,
      });
    } catch {
      // No session files found — that's fine, leave defaults
      set({ projectUsageLoaded: true });
    }
  },

  reset() {
    set({
      sessionStartedAt: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUsd: 0,
      turnCount: 0,
      rateLimitInfo: null,
      turnHistory: [],
      modelBreakdown: {},
      projectUsageLoaded: false,
      allTimeCost: 0,
      allTimeTokens: 0,
      sessionCount: 0,
      lastSessionModel: null,
      lastActivity: null,
    });
  },

  getSessionDurationMs() {
    const { sessionStartedAt } = get();
    if (sessionStartedAt === null) return 0;
    return Date.now() - sessionStartedAt;
  },

  getSessionDurationFormatted() {
    return formatDuration(get().getSessionDurationMs());
  },

  getTotalTokens() {
    const { inputTokens, outputTokens } = get();
    return inputTokens + outputTokens;
  },

  getTokensFormatted() {
    const total = get().getTotalTokens();
    if (total >= 1000) {
      return `${(total / 1000).toFixed(1)}k`;
    }
    return String(total);
  },
}));
