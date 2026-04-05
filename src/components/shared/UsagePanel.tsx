import { useState, useEffect } from "react";
import { useUsageStore } from "@/stores/usage";
import { useConversationStore } from "@/stores/conversation";
import {
  Clock,
  Hash,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  BookOpen,
} from "lucide-react";

const MAX_SESSION_MS = 5 * 60 * 60 * 1000; // 5 hours

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function UsagePanel() {
  const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
  const inputTokens = useUsageStore((s) => s.inputTokens);
  const outputTokens = useUsageStore((s) => s.outputTokens);
  const cacheCreationTokens = useUsageStore((s) => s.cacheCreationTokens);
  const cacheReadTokens = useUsageStore((s) => s.cacheReadTokens);
  const totalCostUsd = useUsageStore((s) => s.totalCostUsd);
  const turnCount = useUsageStore((s) => s.turnCount);
  const session = useConversationStore((s) => s.session);
  const allTimeCost = useUsageStore((s) => s.allTimeCost);
  const allTimeTokens = useUsageStore((s) => s.allTimeTokens);
  const sessionCount = useUsageStore((s) => s.sessionCount);
  const lastSessionModel = useUsageStore((s) => s.lastSessionModel);

  const [elapsed, setElapsed] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!sessionStartedAt) {
      setElapsed("");
      setElapsedMs(0);
      return;
    }
    const update = () => {
      const ms = Date.now() - sessionStartedAt;
      setElapsedMs(ms);
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setElapsed(`${h}h ${m % 60}m`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else setElapsed(`${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  const progressPct = Math.min((elapsedMs / MAX_SESSION_MS) * 100, 100);
  const costPerTurn = turnCount > 0 ? totalCostUsd / turnCount : 0;

  return (
    <div
      className="w-72 rounded-lg shadow-xl text-xs"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
        color: "var(--color-text)",
      }}
    >
      {/* Session Duration */}
      <div
        className="p-3"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <div className="flex items-center gap-1.5 mb-2" style={{ color: "var(--color-subtext-0)" }}>
          <Clock size={12} />
          <span className="font-medium">Session Duration</span>
        </div>
        <div className="text-lg font-semibold mb-1.5">
          {elapsed || "Not started"}
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--color-surface-1)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              backgroundColor: "var(--color-blue)",
            }}
          />
        </div>
        <div
          className="text-right mt-0.5"
          style={{ color: "var(--color-overlay-1)", fontSize: "9px" }}
        >
          5h limit
        </div>
      </div>

      {/* Token Breakdown */}
      <div
        className="p-3"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <div className="flex items-center gap-1.5 mb-2" style={{ color: "var(--color-subtext-0)" }}>
          <Hash size={12} />
          <span className="font-medium">Tokens</span>
          <span className="ml-auto" style={{ color: "var(--color-overlay-1)" }}>
            {formatNumber(inputTokens + outputTokens)} total
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight size={11} style={{ color: "var(--color-green)" }} />
              <span>Input</span>
            </div>
            <span style={{ color: "var(--color-subtext-0)" }}>
              {inputTokens.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ArrowDownLeft size={11} style={{ color: "var(--color-blue)" }} />
              <span>Output</span>
            </div>
            <span style={{ color: "var(--color-subtext-0)" }}>
              {outputTokens.toLocaleString()}
            </span>
          </div>
          {cacheCreationTokens > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers size={11} style={{ color: "var(--color-peach)" }} />
                <span>Cache Write</span>
              </div>
              <span style={{ color: "var(--color-subtext-0)" }}>
                {cacheCreationTokens.toLocaleString()}
              </span>
            </div>
          )}
          {cacheReadTokens > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BookOpen size={11} style={{ color: "var(--color-teal)" }} />
                <span>Cache Read</span>
              </div>
              <span style={{ color: "var(--color-subtext-0)" }}>
                {cacheReadTokens.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Cost */}
      <div
        className="p-3"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <div className="flex items-center gap-1.5 mb-1" style={{ color: "var(--color-subtext-0)" }}>
          <Coins size={12} />
          <span className="font-medium">Cost</span>
        </div>
        <div className="text-lg font-semibold">
          ${totalCostUsd.toFixed(4)}
        </div>
        <div style={{ color: "var(--color-overlay-1)", fontSize: "10px" }}>
          ${costPerTurn.toFixed(4)} / turn &middot; {turnCount} turn{turnCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Project-level totals */}
      {allTimeCost > 0 && (
        <div
          className="p-3"
          style={{ borderBottom: "1px solid var(--color-surface-1)" }}
        >
          <div className="flex items-center gap-1.5 mb-1" style={{ color: "var(--color-subtext-0)" }}>
            <Coins size={12} />
            <span className="font-medium">Project Total</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-subtext-0)" }}>All sessions</span>
              <span style={{ color: "var(--color-text)" }}>
                ${allTimeCost.toFixed(4)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-subtext-0)" }}>Total tokens</span>
              <span style={{ color: "var(--color-text)" }}>
                {formatNumber(allTimeTokens)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-subtext-0)" }}>Sessions</span>
              <span style={{ color: "var(--color-text)" }}>
                {sessionCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Model */}
      <div className="p-3">
        <div
          className="flex items-center justify-between"
          style={{ color: "var(--color-subtext-0)" }}
        >
          <span>Model</span>
          <span style={{ color: "var(--color-text)" }}>
            {session?.model ?? lastSessionModel ?? "claude-opus-4-6"}
          </span>
        </div>
      </div>
    </div>
  );
}
