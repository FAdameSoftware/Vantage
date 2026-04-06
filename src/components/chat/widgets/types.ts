import type { ToolCall } from "@/stores/conversation";

// ─── Widget props interface ─────────────────────────────────────────────────

export interface WidgetProps {
  toolCall: ToolCall;
  /** If provided, overrides internal expanded state (controlled mode) */
  forceExpanded?: boolean;
}

// ─── Tool metadata (icon, color, label) ─────────────────────────────────────

export interface ToolMeta {
  icon: React.ElementType;
  color: string;
  label: string;
}
