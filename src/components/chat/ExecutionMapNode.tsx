import { memo } from "react";
import {
  FileText,
  Pencil,
  Terminal,
  Search,
  FolderOpen,
  User,
  MessageSquare,
  Bot,
  AlertCircle,
} from "lucide-react";
import type { ExecutionNode } from "@/lib/executionGraph";
import { NODE_CSS_COLORS } from "@/lib/executionGraph";
import { formatTokenCount, formatCost } from "@/lib/pricing";

// ─── Icon mapping ───────────────────────────────────────────────────────────

function getNodeIcon(node: ExecutionNode) {
  if (node.kind === "user") return User;
  if (node.kind === "assistant") return MessageSquare;

  switch (node.label) {
    case "Read":
      return FileText;
    case "Write":
    case "Edit":
    case "MultiEdit":
      return Pencil;
    case "Bash":
      return Terminal;
    case "Grep":
    case "Search":
      return Search;
    case "Glob":
      return FolderOpen;
    default:
      return Bot;
  }
}

// ─── Node size based on token cost ──────────────────────────────────────────

/**
 * Returns a scale factor (0.85 - 1.3) based on token count.
 * Nodes with more tokens appear slightly larger.
 */
function getNodeScale(totalTokens: number): number {
  if (totalTokens <= 0) return 0.85;
  if (totalTokens < 500) return 0.9;
  if (totalTokens < 2000) return 1.0;
  if (totalTokens < 5000) return 1.1;
  if (totalTokens < 10000) return 1.2;
  return 1.3;
}

// ─── ExecutionMapNode ───────────────────────────────────────────────────────

interface ExecutionMapNodeProps {
  node: ExecutionNode;
  onClick: (node: ExecutionNode) => void;
  isHighlighted: boolean;
}

export const ExecutionMapNode = memo(function ExecutionMapNode({
  node,
  onClick,
  isHighlighted,
}: ExecutionMapNodeProps) {
  const Icon = getNodeIcon(node);
  const cssColor = NODE_CSS_COLORS[node.color];
  const scale = getNodeScale(node.totalTokens);

  // Base padding scales with token cost
  const paddingX = Math.round(8 * scale);
  const paddingY = Math.round(4 * scale);

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-md transition-all cursor-pointer border-none text-left shrink-0"
      style={{
        padding: `${paddingY}px ${paddingX}px`,
        backgroundColor: isHighlighted
          ? `color-mix(in srgb, ${cssColor} 25%, var(--color-surface-0))`
          : "var(--color-surface-0)",
        border: `1px solid ${isHighlighted ? cssColor : "var(--color-surface-1)"}`,
        outline: isHighlighted ? `1px solid ${cssColor}` : "none",
        outlineOffset: "1px",
        maxWidth: "200px",
      }}
      onClick={() => onClick(node)}
      title={`${node.label}: ${node.detail}${node.costUsd > 0 ? ` (${formatCost(node.costUsd)})` : ""}`}
      aria-label={`${node.kind === "tool" ? "Tool call" : node.kind}: ${node.label}`}
    >
      {/* Icon */}
      <div
        className="shrink-0 flex items-center justify-center rounded"
        style={{
          width: Math.round(18 * scale),
          height: Math.round(18 * scale),
          backgroundColor: `color-mix(in srgb, ${cssColor} 15%, transparent)`,
        }}
      >
        {node.isError ? (
          <AlertCircle size={Math.round(11 * scale)} style={{ color: "var(--color-red)" }} />
        ) : (
          <Icon size={Math.round(11 * scale)} style={{ color: cssColor }} />
        )}
      </div>

      {/* Label + detail */}
      <div className="flex flex-col min-w-0 overflow-hidden">
        <span
          className="font-medium truncate"
          style={{
            fontSize: `${Math.round(10 * scale)}px`,
            fontFamily: "var(--font-mono)",
            color: cssColor,
            lineHeight: 1.2,
          }}
        >
          {node.label}
        </span>
        {node.detail && (
          <span
            className="truncate"
            style={{
              fontSize: "9px",
              color: "var(--color-overlay-1)",
              lineHeight: 1.2,
            }}
          >
            {node.detail}
          </span>
        )}
      </div>

      {/* Token count badge (only for non-trivial nodes) */}
      {node.totalTokens > 0 && (
        <span
          className="shrink-0 text-right"
          style={{
            fontSize: "8px",
            color: "var(--color-overlay-0)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {formatTokenCount(node.totalTokens)}
        </span>
      )}
    </button>
  );
});
