import type { ToolCall } from "@/stores/conversation";
import { getWidget } from "./widgets";

// ─── ToolCallCard (thin dispatcher) ─────────────────────────────────────────

interface ToolCallCardProps {
  toolCall: ToolCall;
  /** If provided, overrides internal expanded state (controlled mode) */
  forceExpanded?: boolean;
}

export function ToolCallCard({ toolCall, forceExpanded }: ToolCallCardProps) {
  const Widget = getWidget(toolCall.name);
  return <Widget toolCall={toolCall} forceExpanded={forceExpanded} />;
}
