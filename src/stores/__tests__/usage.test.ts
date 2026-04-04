import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUsageStore } from "../usage";

describe("usageStore", () => {
  beforeEach(() => {
    useUsageStore.setState({
      sessionStartedAt: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCostUsd: 0,
      turnCount: 0,
      rateLimitInfo: null,
    });
  });

  it("has correct default values", () => {
    const state = useUsageStore.getState();
    expect(state.sessionStartedAt).toBeNull();
    expect(state.inputTokens).toBe(0);
    expect(state.outputTokens).toBe(0);
    expect(state.cacheCreationTokens).toBe(0);
    expect(state.cacheReadTokens).toBe(0);
    expect(state.totalCostUsd).toBe(0);
    expect(state.turnCount).toBe(0);
    expect(state.rateLimitInfo).toBeNull();
  });

  it("startSession sets sessionStartedAt and resets counters", () => {
    // Add some data first
    useUsageStore.getState().addTurnUsage({ inputTokens: 100, outputTokens: 50 });
    expect(useUsageStore.getState().turnCount).toBe(1);

    // Start a new session
    useUsageStore.getState().startSession();
    const state = useUsageStore.getState();
    expect(state.sessionStartedAt).toBeTypeOf("number");
    expect(state.inputTokens).toBe(0);
    expect(state.outputTokens).toBe(0);
    expect(state.turnCount).toBe(0);
    expect(state.totalCostUsd).toBe(0);
  });

  it("addTurnUsage accumulates token counts and cost", () => {
    const store = useUsageStore.getState();
    store.addTurnUsage({ inputTokens: 100, outputTokens: 50, costUsd: 0.01 });
    store.addTurnUsage({ inputTokens: 200, outputTokens: 75, costUsd: 0.02 });

    const state = useUsageStore.getState();
    expect(state.inputTokens).toBe(300);
    expect(state.outputTokens).toBe(125);
    expect(state.totalCostUsd).toBeCloseTo(0.03);
    expect(state.turnCount).toBe(2);
  });

  it("addTurnUsage handles partial usage with defaults", () => {
    useUsageStore.getState().addTurnUsage({});
    const state = useUsageStore.getState();
    expect(state.inputTokens).toBe(0);
    expect(state.outputTokens).toBe(0);
    expect(state.turnCount).toBe(1);
  });

  it("addTurnUsage accumulates cache tokens", () => {
    useUsageStore.getState().addTurnUsage({ cacheCreation: 500, cacheRead: 300 });
    useUsageStore.getState().addTurnUsage({ cacheCreation: 200, cacheRead: 100 });

    const state = useUsageStore.getState();
    expect(state.cacheCreationTokens).toBe(700);
    expect(state.cacheReadTokens).toBe(400);
  });

  it("setRateLimitInfo updates rate limit info", () => {
    const info = {
      requestsRemaining: 10,
      tokensRemaining: 50000,
      resetsAt: "2026-01-01T00:00:00Z",
    };
    useUsageStore.getState().setRateLimitInfo(info);
    expect(useUsageStore.getState().rateLimitInfo).toEqual(info);
  });

  it("reset clears all state", () => {
    const store = useUsageStore.getState();
    store.startSession();
    store.addTurnUsage({ inputTokens: 100, outputTokens: 50, costUsd: 0.01 });
    store.setRateLimitInfo({ requestsRemaining: 5, tokensRemaining: 1000, resetsAt: null });

    store.reset();
    const state = useUsageStore.getState();
    expect(state.sessionStartedAt).toBeNull();
    expect(state.inputTokens).toBe(0);
    expect(state.turnCount).toBe(0);
    expect(state.rateLimitInfo).toBeNull();
  });

  it("getSessionDurationMs returns 0 when no session started", () => {
    expect(useUsageStore.getState().getSessionDurationMs()).toBe(0);
  });

  it("getSessionDurationMs returns positive value when session active", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      useUsageStore.getState().startSession();

      vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));
      expect(useUsageStore.getState().getSessionDurationMs()).toBe(300000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getSessionDurationFormatted formats seconds only", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      useUsageStore.getState().startSession();

      vi.setSystemTime(new Date("2026-01-01T00:00:45Z"));
      expect(useUsageStore.getState().getSessionDurationFormatted()).toBe("45s");
    } finally {
      vi.useRealTimers();
    }
  });

  it("getSessionDurationFormatted formats minutes and seconds", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      useUsageStore.getState().startSession();

      vi.setSystemTime(new Date("2026-01-01T00:03:15Z"));
      expect(useUsageStore.getState().getSessionDurationFormatted()).toBe("3m 15s");
    } finally {
      vi.useRealTimers();
    }
  });

  it("getSessionDurationFormatted formats hours and minutes", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      useUsageStore.getState().startSession();

      vi.setSystemTime(new Date("2026-01-01T02:30:00Z"));
      expect(useUsageStore.getState().getSessionDurationFormatted()).toBe("2h 30m");
    } finally {
      vi.useRealTimers();
    }
  });

  it("getTotalTokens returns sum of input and output", () => {
    useUsageStore.getState().addTurnUsage({ inputTokens: 100, outputTokens: 50 });
    expect(useUsageStore.getState().getTotalTokens()).toBe(150);
  });

  it("getTokensFormatted returns raw number below 1000", () => {
    useUsageStore.getState().addTurnUsage({ inputTokens: 300, outputTokens: 200 });
    expect(useUsageStore.getState().getTokensFormatted()).toBe("500");
  });

  it("getTokensFormatted returns k-formatted number at or above 1000", () => {
    useUsageStore.getState().addTurnUsage({ inputTokens: 1500, outputTokens: 500 });
    expect(useUsageStore.getState().getTokensFormatted()).toBe("2.0k");
  });
});
