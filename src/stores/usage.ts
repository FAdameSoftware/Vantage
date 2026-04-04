import { create } from "zustand";

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
  /** Running total cost in USD */
  totalCostUsd: number;
  /** Number of completed turns */
  turnCount: number;
  /** Last known rate limit info (if available) */
  rateLimitInfo: {
    requestsRemaining: number | null;
    tokensRemaining: number | null;
    resetsAt: string | null;
  } | null;

  // Actions
  startSession: () => void;
  addTurnUsage: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreation?: number;
    cacheRead?: number;
    costUsd?: number;
  }) => void;
  setRateLimitInfo: (info: UsageState["rateLimitInfo"]) => void;
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
  totalCostUsd: 0,
  turnCount: 0,
  rateLimitInfo: null,

  startSession() {
    set({
      sessionStartedAt: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      turnCount: 0,
      rateLimitInfo: null,
    });
  },

  addTurnUsage(usage) {
    set((state) => ({
      inputTokens: state.inputTokens + (usage.inputTokens ?? 0),
      outputTokens: state.outputTokens + (usage.outputTokens ?? 0),
      cacheCreationTokens: state.cacheCreationTokens + (usage.cacheCreation ?? 0),
      cacheReadTokens: state.cacheReadTokens + (usage.cacheRead ?? 0),
      totalCostUsd: state.totalCostUsd + (usage.costUsd ?? 0),
      turnCount: state.turnCount + 1,
    }));
  },

  setRateLimitInfo(info) {
    set({ rateLimitInfo: info });
  },

  reset() {
    set({
      sessionStartedAt: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      turnCount: 0,
      rateLimitInfo: null,
    });
  },

  getSessionDurationMs() {
    const { sessionStartedAt } = get();
    if (sessionStartedAt === null) return 0;
    return Date.now() - sessionStartedAt;
  },

  getSessionDurationFormatted() {
    const ms = get().getSessionDurationMs();
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${totalSeconds % 60}s`;
    }
    return `${totalSeconds}s`;
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
