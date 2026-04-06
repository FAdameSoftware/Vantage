import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Zap, ArrowDown, ArrowUp, Database } from "lucide-react";
import type { ConversationMessage } from "@/stores/conversation";
import {
  calculateCost,
  formatTokenCount,
  formatCost,
  normalizeModelName,
  type CostBreakdown,
} from "@/lib/pricing";

// ─── Token Breakdown (expanded detail panel) ────────────────────────────────

interface TokenBreakdownProps {
  message: ConversationMessage;
  breakdown: CostBreakdown;
}

function TokenBreakdown({ message, breakdown }: TokenBreakdownProps) {
  const usage = message.usage;
  if (!usage) return null;

  return (
    <div
      className="mt-1 rounded-md p-2 text-[10px] space-y-1.5"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {/* Token counts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <ArrowDown size={9} style={{ color: "var(--color-blue)" }} />
          <span style={{ color: "var(--color-subtext-0)" }}>Input</span>
          <span
            className="ml-auto font-mono"
            style={{ color: "var(--color-text)" }}
          >
            {usage.input_tokens.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: "var(--color-subtext-0)" }}>Cost</span>
          <span
            className="ml-auto font-mono"
            style={{ color: "var(--color-text)" }}
          >
            {formatCost(breakdown.inputCost)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowUp size={9} style={{ color: "var(--color-green)" }} />
          <span style={{ color: "var(--color-subtext-0)" }}>Output</span>
          <span
            className="ml-auto font-mono"
            style={{ color: "var(--color-text)" }}
          >
            {usage.output_tokens.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: "var(--color-subtext-0)" }}>Cost</span>
          <span
            className="ml-auto font-mono"
            style={{ color: "var(--color-text)" }}
          >
            {formatCost(breakdown.outputCost)}
          </span>
        </div>

        {usage.cache_creation_input_tokens != null &&
          usage.cache_creation_input_tokens > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <Database size={9} style={{ color: "var(--color-yellow)" }} />
                <span style={{ color: "var(--color-subtext-0)" }}>
                  Cache write
                </span>
                <span
                  className="ml-auto font-mono"
                  style={{ color: "var(--color-text)" }}
                >
                  {usage.cache_creation_input_tokens.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ color: "var(--color-subtext-0)" }}>Cost</span>
                <span
                  className="ml-auto font-mono"
                  style={{ color: "var(--color-text)" }}
                >
                  {formatCost(breakdown.cacheWriteCost)}
                </span>
              </div>
            </>
          )}

        {usage.cache_read_input_tokens != null &&
          usage.cache_read_input_tokens > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <Database size={9} style={{ color: "var(--color-teal)" }} />
                <span style={{ color: "var(--color-subtext-0)" }}>
                  Cache read
                </span>
                <span
                  className="ml-auto font-mono"
                  style={{ color: "var(--color-text)" }}
                >
                  {usage.cache_read_input_tokens.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ color: "var(--color-subtext-0)" }}>Cost</span>
                <span
                  className="ml-auto font-mono"
                  style={{ color: "var(--color-text)" }}
                >
                  {formatCost(breakdown.cacheReadCost)}
                </span>
              </div>
            </>
          )}
      </div>

      {/* Divider */}
      <div
        className="h-px"
        style={{ backgroundColor: "var(--color-surface-1)" }}
      />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span
          className="font-medium"
          style={{ color: "var(--color-subtext-0)" }}
        >
          Total cost
        </span>
        <span
          className="font-mono font-medium"
          style={{ color: "var(--color-yellow)" }}
        >
          {formatCost(breakdown.totalCost)}
        </span>
      </div>

      {/* Model */}
      {message.model && (
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-subtext-0)" }}>Model</span>
          <span
            className="font-mono"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {normalizeModelName(message.model)}
          </span>
        </div>
      )}

      {/* Tool calls summary */}
      {message.toolCalls.length > 0 && (
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-subtext-0)" }}>Tool calls</span>
          <span
            className="font-mono"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {message.toolCalls.length}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Token Badge (compact footer) ───────────────────────────────────────────

interface TokenBadgeProps {
  message: ConversationMessage;
}

export function TokenBadge({ message }: TokenBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const usage = message.usage;

  const breakdown = useMemo<CostBreakdown | null>(() => {
    if (!usage) return null;
    return calculateCost(usage, message.model);
  }, [usage, message.model]);

  // Don't render if no usage data
  if (!usage || !breakdown) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex items-center gap-1.5 text-[10px] bg-transparent border-none p-0 cursor-pointer transition-colors rounded"
        style={{ color: "var(--color-overlay-0)" }}
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? "Collapse token details" : "Expand token details"}
      >
        {expanded ? (
          <ChevronDown size={9} />
        ) : (
          <ChevronRight size={9} />
        )}
        <Zap size={9} />
        <span>
          {formatTokenCount(usage.input_tokens)} in
        </span>
        <span style={{ color: "var(--color-overlay-0)" }}>/</span>
        <span>
          {formatTokenCount(usage.output_tokens)} out
        </span>
        <span style={{ color: "var(--color-overlay-0)" }}>&middot;</span>
        <span style={{ color: "var(--color-yellow)" }}>
          {formatCost(breakdown.totalCost)}
        </span>
      </button>

      {expanded && (
        <TokenBreakdown message={message} breakdown={breakdown} />
      )}
    </div>
  );
}
