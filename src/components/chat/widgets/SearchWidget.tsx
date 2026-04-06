import { Search, FileText } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";

// ─── Compact header ────────────────────────────────────────────────────────

function SearchCompactHeader({ input, toolName }: { input: Record<string, unknown>; toolName: string }) {
  const pattern = String(input.pattern ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Search size={13} style={{ color: "var(--color-green)" }} className="flex-shrink-0" />
      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text)" }}>
        {toolName}
      </span>
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {pattern}
      </span>
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function SearchExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const pattern = String(input.pattern ?? "");
  const path = input.path ? String(input.path) : undefined;

  // Parse output into file paths list
  const outputLines = (output ?? "").split("\n").filter((l) => l.trim());
  const hasResults = outputLines.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Search parameters */}
      <div
        className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
        style={{
          fontFamily: "var(--font-mono)",
          backgroundColor: "rgba(166, 227, 161, 0.08)",
          border: "1px solid rgba(166, 227, 161, 0.15)",
          color: "var(--color-green)",
        }}
      >
        <Search size={11} className="flex-shrink-0" />
        <span>{pattern}</span>
        {path && (
          <span style={{ color: "var(--color-subtext-0)" }}>in {path}</span>
        )}
      </div>

      {/* Results as file path list */}
      {hasResults && (
        <div
          className="rounded-md overflow-hidden"
          style={{
            border: "1px solid var(--color-surface-1)",
            backgroundColor: "var(--color-mantle)",
          }}
        >
          <div
            className="text-[10px] px-3 py-1"
            style={{ color: "var(--color-subtext-0)", borderBottom: "1px solid var(--color-surface-1)" }}
          >
            {outputLines.length} result{outputLines.length !== 1 ? "s" : ""}
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {outputLines.slice(0, 50).map((line, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-[var(--color-surface-0)] transition-colors"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <FileText size={10} style={{ color: "var(--color-blue)" }} className="flex-shrink-0" />
                <span className="truncate" style={{ color: "var(--color-text)" }}>
                  {line}
                </span>
              </div>
            ))}
            {outputLines.length > 50 && (
              <div
                className="px-3 py-1 text-[10px] text-center"
                style={{ color: "var(--color-subtext-0)" }}
              >
                ... and {outputLines.length - 50} more
              </div>
            )}
          </div>
        </div>
      )}

      {output && !hasResults && (
        <div className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          No matches found
        </div>
      )}
    </div>
  );
}

// ─── SearchWidget ──────────────────────────────────────────────────────────

export function SearchWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<SearchCompactHeader input={toolCall.input} toolName={toolCall.name} />}
    >
      <SearchExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
