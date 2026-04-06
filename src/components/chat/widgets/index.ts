import type { WidgetProps } from "./types";
import { GenericWidget } from "./GenericWidget";

// ─── Widget Registry ────────────────────────────────────────────────────────
//
// Maps tool names to their specialized widget components.
// Any tool not in the registry falls back to GenericWidget.

const widgetRegistry: Record<string, React.ComponentType<WidgetProps>> = {};

/** Look up the widget for a given tool name, falling back to GenericWidget */
export function getWidget(toolName: string): React.ComponentType<WidgetProps> {
  return widgetRegistry[toolName] ?? GenericWidget;
}

/** Register a widget for a tool name (used by per-tool widget modules) */
export function registerWidget(toolName: string, widget: React.ComponentType<WidgetProps>) {
  widgetRegistry[toolName] = widget;
}

// ─── Register all built-in widgets (side-effect imports) ───────────────────

import { ReadWidget } from "./ReadWidget";
import { EditWidget } from "./EditWidget";
import { WriteWidget } from "./WriteWidget";
import { BashWidget } from "./BashWidget";
import { GrepWidget } from "./GrepWidget";
import { GlobWidget } from "./GlobWidget";
import { TodoWidget } from "./TodoWidget";
import { AgentWidget } from "./AgentWidget";

registerWidget("Read", ReadWidget);
registerWidget("Edit", EditWidget);
registerWidget("Write", WriteWidget);
registerWidget("Bash", BashWidget);
registerWidget("Grep", GrepWidget);
registerWidget("Glob", GlobWidget);
registerWidget("TodoWrite", TodoWidget);
registerWidget("Task", TodoWidget);
registerWidget("Agent", AgentWidget);
registerWidget("SendMessage", AgentWidget);

// Re-exports for convenience
export type { WidgetProps } from "./types";
export type { ToolMeta } from "./types";
export { getToolMeta } from "./toolMeta";
export { WidgetShell } from "./WidgetShell";
export { GenericWidget } from "./GenericWidget";
export { InlineDiffPreview } from "./InlineDiffPreview";
export { normalizeFilePath, detectLanguage, fileName, openFileInEditor } from "./helpers";
