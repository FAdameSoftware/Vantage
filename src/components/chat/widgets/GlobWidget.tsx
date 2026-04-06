import { FolderOpen, FileText } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { fileName, openFileInEditor } from "./helpers";

// ─── Parse glob output into file paths ────────────────────────────────────

function parseGlobOutput(output: string): string[] {
  if (!output) return [];
  return output.split("\n").filter((l) => l.trim());
}

// ─── Compact header ────────────────────────────────────────────────────────

function GlobCompactHeader({ input, fileCount }: { input: Record<string, unknown>; fileCount: number }) {
  const pattern = String(input.pattern ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <FolderOpen size={13} style={{ color: "var(--color-teal)" }} className="flex-shrink-0" />
      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text)" }}>
        Glob
      </span>
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {pattern}
      </span>
      {fileCount > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: "rgba(148, 226, 213, 0.15)",
            color: "var(--color-teal)",
          }}
        >
          {fileCount} file{fileCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function GlobExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const pattern = String(input.pattern ?? "");
  const path = input.path ? String(input.path) : undefined;

  const files = parseGlobOutput(output ?? "");
  const hasResults = files.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Pattern display */}
      <div
        className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
        style={{
          fontFamily: "var(--font-mono)",
          backgroundColor: "rgba(148, 226, 213, 0.08)",
          border: "1px solid rgba(148, 226, 213, 0.15)",
          color: "var(--color-teal)",
        }}
      >
        <FolderOpen size={11} className="flex-shrink-0" />
        <span>{pattern}</span>
        {path && (
          <span style={{ color: "var(--color-subtext-0)" }}>in {path}</span>
        )}
      </div>

      {/* File list */}
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
            {files.length} file{files.length !== 1 ? "s" : ""}
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {files.slice(0, 50).map((filePath, i) => (
              <button
                key={i}
                type="button"
                className="flex items-center gap-2 px-3 py-1 text-xs w-full text-left bg-transparent border-none cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors group"
                style={{ fontFamily: "var(--font-mono)" }}
                onClick={() => openFileInEditor(filePath)}
                title={filePath}
              >
                <FileText size={10} style={{ color: "var(--color-blue)" }} className="flex-shrink-0" />
                <span className="truncate" style={{ color: "var(--color-text)" }}>
                  <span className="group-hover:hidden">{fileName(filePath)}</span>
                  <span className="hidden group-hover:inline">{filePath}</span>
                </span>
              </button>
            ))}
            {files.length > 50 && (
              <div
                className="px-3 py-1 text-[10px] text-center"
                style={{ color: "var(--color-subtext-0)" }}
              >
                ... and {files.length - 50} more
              </div>
            )}
          </div>
        </div>
      )}

      {output && !hasResults && (
        <div className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          No files found
        </div>
      )}
    </div>
  );
}

// ─── GlobWidget ────────────────────────────────────────────────────────────

export function GlobWidget({ toolCall, forceExpanded }: WidgetProps) {
  const files = parseGlobOutput(toolCall.output ?? "");
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<GlobCompactHeader input={toolCall.input} fileCount={files.length} />}
    >
      <GlobExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
