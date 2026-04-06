import type { WidgetProps } from "./types";
import { GenericWidget } from "./GenericWidget";

// ─── Widget Registry ────────────────────────────────────────────────────────
//
// Maps tool names to their specialized widget components.
// Tasks 2-7 will register per-tool widgets (ReadWidget, BashWidget, etc.).
// Any tool not in the registry falls back to GenericWidget.

const widgetRegistry: Record<string, React.ComponentType<WidgetProps>> = {
  // Specialized widgets will be registered here as they are created:
  // Read: ReadWidget,
  // Bash: BashWidget,
  // Edit: EditWidget,
  // Write: WriteWidget,
  // Grep: GrepWidget,
  // Glob: GlobWidget,
};

/** Look up the widget for a given tool name, falling back to GenericWidget */
export function getWidget(toolName: string): React.ComponentType<WidgetProps> {
  return widgetRegistry[toolName] ?? GenericWidget;
}

/** Register a widget for a tool name (used by per-tool widget modules) */
export function registerWidget(toolName: string, widget: React.ComponentType<WidgetProps>) {
  widgetRegistry[toolName] = widget;
}

// Re-exports for convenience
export type { WidgetProps } from "./types";
export type { ToolMeta } from "./types";
export { getToolMeta } from "./toolMeta";
export { WidgetShell } from "./WidgetShell";
export { GenericWidget } from "./GenericWidget";
export { InlineDiffPreview } from "./InlineDiffPreview";
export { normalizeFilePath, detectLanguage, fileName, openFileInEditor } from "./helpers";
