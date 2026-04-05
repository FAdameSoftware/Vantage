/**
 * executionGraph.ts — Extracts tool calls from a conversation and builds
 * a directed graph structure for the Execution Map visualization.
 *
 * Each conversation turn becomes a sequence of nodes:
 *   User Message -> Tool Call 1 -> Tool Call 2 -> ... -> Response
 *
 * Nodes carry metadata: tool name, file path (if applicable), estimated
 * token cost, and a color category for visual grouping.
 */

import type { ConversationMessage, ToolCall } from "@/stores/conversation";
import { calculateCost, type TokenUsage } from "@/lib/pricing";

// ─── Types ──────────────────────────────────────────────────────────────────

export type NodeKind = "user" | "assistant" | "tool";

export type ToolColor = "blue" | "yellow" | "purple" | "green" | "teal" | "gray";

export interface ExecutionNode {
  /** Unique node ID */
  id: string;
  /** What kind of node this is */
  kind: NodeKind;
  /** Display label (tool name, "User", "Response") */
  label: string;
  /** Secondary label (file path, command snippet, etc.) */
  detail: string;
  /** Token cost estimate in USD (for node sizing) */
  costUsd: number;
  /** Total tokens associated with this node */
  totalTokens: number;
  /** Color category for the node */
  color: ToolColor;
  /** Index of the source message in the conversation messages array */
  messageIndex: number;
  /** Whether this tool call had an error */
  isError: boolean;
}

export interface ExecutionEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
}

export interface ExecutionGraph {
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
}

// ─── Color mapping ──────────────────────────────────────────────────────────

const TOOL_COLOR_MAP: Record<string, ToolColor> = {
  Read: "blue",
  Edit: "yellow",
  MultiEdit: "yellow",
  Write: "green",
  Bash: "purple",
  Grep: "teal",
  Glob: "teal",
  Search: "teal",
};

function getToolColor(toolName: string): ToolColor {
  return TOOL_COLOR_MAP[toolName] ?? "gray";
}

// ─── CSS color variable mapping ─────────────────────────────────────────────

export const NODE_CSS_COLORS: Record<ToolColor, string> = {
  blue: "var(--color-blue)",
  yellow: "var(--color-yellow)",
  purple: "var(--color-mauve)",
  green: "var(--color-green)",
  teal: "var(--color-teal)",
  gray: "var(--color-overlay-1)",
};

// ─── Detail extraction ──────────────────────────────────────────────────────

function getToolDetail(toolCall: ToolCall): string {
  const input = toolCall.input;
  switch (toolCall.name) {
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit": {
      const filePath = String(input.file_path ?? input.path ?? "");
      // Show just the filename for brevity
      const parts = filePath.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1] || filePath;
    }
    case "Bash": {
      const cmd = String(input.command ?? "");
      return cmd.length > 40 ? cmd.slice(0, 37) + "..." : cmd;
    }
    case "Grep":
      return String(input.pattern ?? "");
    case "Glob":
      return String(input.pattern ?? "");
    default:
      return "";
  }
}

// ─── Graph builder ──────────────────────────────────────────────────────────

/**
 * Build an execution graph from a list of conversation messages.
 * Each user message is a starting node, followed by the assistant's
 * tool calls, ending with the assistant response text node.
 */
export function buildExecutionGraph(
  messages: ConversationMessage[],
): ExecutionGraph {
  const nodes: ExecutionNode[] = [];
  const edges: ExecutionEdge[] = [];

  let prevNodeId: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "user") {
      const nodeId = `user-${i}`;
      const text = msg.text.length > 40 ? msg.text.slice(0, 37) + "..." : msg.text;
      nodes.push({
        id: nodeId,
        kind: "user",
        label: "User",
        detail: text,
        costUsd: 0,
        totalTokens: 0,
        color: "blue",
        messageIndex: i,
        isError: false,
      });
      if (prevNodeId) {
        edges.push({ from: prevNodeId, to: nodeId });
      }
      prevNodeId = nodeId;
    } else if (msg.role === "assistant") {
      // Estimate per-message cost
      const msgCost = msg.usage
        ? calculateCost(msg.usage as TokenUsage, msg.model).totalCost
        : 0;
      const msgTokens = msg.usage
        ? msg.usage.input_tokens + msg.usage.output_tokens
        : 0;

      // If there are tool calls, create a node per tool call
      if (msg.toolCalls.length > 0) {
        // Distribute cost roughly evenly across tool call nodes
        const costPerTool = msg.toolCalls.length > 0
          ? msgCost / (msg.toolCalls.length + (msg.text ? 1 : 0))
          : 0;
        const tokensPerTool = msg.toolCalls.length > 0
          ? msgTokens / (msg.toolCalls.length + (msg.text ? 1 : 0))
          : 0;

        for (const tc of msg.toolCalls) {
          const nodeId = `tool-${tc.id}`;
          nodes.push({
            id: nodeId,
            kind: "tool",
            label: tc.name,
            detail: getToolDetail(tc),
            costUsd: costPerTool,
            totalTokens: Math.round(tokensPerTool),
            color: getToolColor(tc.name),
            messageIndex: i,
            isError: tc.isError ?? false,
          });
          if (prevNodeId) {
            edges.push({ from: prevNodeId, to: nodeId });
          }
          prevNodeId = nodeId;
        }

        // If the assistant also had response text, add a response node
        if (msg.text.trim()) {
          const responseId = `response-${i}`;
          nodes.push({
            id: responseId,
            kind: "assistant",
            label: "Response",
            detail:
              msg.text.length > 40
                ? msg.text.slice(0, 37) + "..."
                : msg.text,
            costUsd: costPerTool,
            totalTokens: Math.round(tokensPerTool),
            color: "gray",
            messageIndex: i,
            isError: false,
          });
          if (prevNodeId) {
            edges.push({ from: prevNodeId, to: responseId });
          }
          prevNodeId = responseId;
        }
      } else if (msg.text.trim()) {
        // Pure text response (no tool calls)
        const responseId = `response-${i}`;
        nodes.push({
          id: responseId,
          kind: "assistant",
          label: "Response",
          detail:
            msg.text.length > 40
              ? msg.text.slice(0, 37) + "..."
              : msg.text,
          costUsd: msgCost,
          totalTokens: msgTokens,
          color: "gray",
          messageIndex: i,
          isError: false,
        });
        if (prevNodeId) {
          edges.push({ from: prevNodeId, to: responseId });
        }
        prevNodeId = responseId;
      }
    }
    // Skip system/result messages for the graph
  }

  return { nodes, edges };
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export interface GraphStats {
  totalNodes: number;
  toolCallCount: number;
  totalCost: number;
  totalTokens: number;
  toolBreakdown: Record<string, number>;
}

export function getGraphStats(graph: ExecutionGraph): GraphStats {
  const toolBreakdown: Record<string, number> = {};
  let totalCost = 0;
  let totalTokens = 0;
  let toolCallCount = 0;

  for (const node of graph.nodes) {
    totalCost += node.costUsd;
    totalTokens += node.totalTokens;
    if (node.kind === "tool") {
      toolCallCount++;
      toolBreakdown[node.label] = (toolBreakdown[node.label] ?? 0) + 1;
    }
  }

  return {
    totalNodes: graph.nodes.length,
    toolCallCount,
    totalCost,
    totalTokens,
    toolBreakdown,
  };
}
