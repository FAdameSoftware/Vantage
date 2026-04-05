import { useMemo, useState, useCallback } from "react";
import { GitBranch, BarChart3 } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import type { ConversationMessage } from "@/stores/conversation";
import {
  buildExecutionGraph,
  getGraphStats,
  NODE_CSS_COLORS,
  type ExecutionNode,
} from "@/lib/executionGraph";
import { formatTokenCount, formatCost } from "@/lib/pricing";
import { ExecutionMapNode } from "./ExecutionMapNode";

// ─── Selectors ──────────────────────────────────────────────────────────────

const selectMessages = (s: { messages: ConversationMessage[] }) => s.messages;

// ─── SVG Arrow connector ────────────────────────────────────────────────────

function ArrowDown() {
  return (
    <div className="flex justify-center shrink-0" style={{ height: "16px" }}>
      <svg
        width="12"
        height="16"
        viewBox="0 0 12 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="6"
          y1="0"
          x2="6"
          y2="12"
          stroke="var(--color-overlay-0)"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />
        <polygon
          points="3,10 6,15 9,10"
          fill="var(--color-overlay-0)"
        />
      </svg>
    </div>
  );
}

// ─── Stats summary bar ──────────────────────────────────────────────────────

interface StatsBarProps {
  toolBreakdown: Record<string, number>;
  totalCost: number;
  totalTokens: number;
  toolCallCount: number;
}

function StatsBar({ toolBreakdown, totalCost, totalTokens, toolCallCount }: StatsBarProps) {
  const sortedTools = Object.entries(toolBreakdown).sort(
    ([, a], [, b]) => b - a,
  );

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 text-[10px] flex-wrap"
      style={{
        backgroundColor: "var(--color-surface-0)",
        borderBottom: "1px solid var(--color-surface-1)",
        color: "var(--color-overlay-1)",
      }}
    >
      <span className="flex items-center gap-1">
        <BarChart3 size={10} />
        <span className="font-medium">{toolCallCount} tool calls</span>
      </span>
      {totalTokens > 0 && (
        <span>{formatTokenCount(totalTokens)} tokens</span>
      )}
      {totalCost > 0 && (
        <span style={{ color: "var(--color-yellow)" }}>
          {formatCost(totalCost)}
        </span>
      )}
      <span className="flex-1" />
      {sortedTools.map(([name, count]) => {
        const colorKey = name === "Read" ? "blue"
          : name === "Edit" || name === "MultiEdit" || name === "Write" ? name === "Write" ? "green" : "yellow"
          : name === "Bash" ? "purple"
          : name === "Grep" || name === "Glob" ? "teal"
          : "gray";
        return (
          <span
            key={name}
            className="flex items-center gap-0.5 px-1 py-0.5 rounded"
            style={{
              backgroundColor: `color-mix(in srgb, ${NODE_CSS_COLORS[colorKey]} 12%, transparent)`,
              color: NODE_CSS_COLORS[colorKey],
            }}
          >
            {name}
            <span className="font-mono">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

// ─── ExecutionMap ────────────────────────────────────────────────────────────

export function ExecutionMap() {
  const messages = useConversationStore(selectMessages);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  const graph = useMemo(() => buildExecutionGraph(messages), [messages]);
  const stats = useMemo(() => getGraphStats(graph), [graph]);

  const handleNodeClick = useCallback((node: ExecutionNode) => {
    // Highlight the node and scroll to the corresponding message in chat
    setHighlightedNodeId((prev) => (prev === node.id ? null : node.id));

    const el = document.querySelector(
      `[data-message-index="${node.messageIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Empty state
  if (graph.nodes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <GitBranch size={24} className="mb-2 opacity-40" />
        <span className="text-xs">No tool calls yet.</span>
        <span className="text-[10px] mt-1" style={{ color: "var(--color-overlay-0)" }}>
          Start a conversation with Claude to see the execution map.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats summary */}
      {stats.toolCallCount > 0 && (
        <StatsBar
          toolBreakdown={stats.toolBreakdown}
          totalCost={stats.totalCost}
          totalTokens={stats.totalTokens}
          toolCallCount={stats.toolCallCount}
        />
      )}

      {/* Scrollable flow */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-0">
          {graph.nodes.map((node, i) => (
            <div key={node.id} className="flex flex-col items-center">
              {i > 0 && <ArrowDown />}
              <ExecutionMapNode
                node={node}
                onClick={handleNodeClick}
                isHighlighted={highlightedNodeId === node.id}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
