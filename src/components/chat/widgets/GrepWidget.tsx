import { Search, FileText } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { fileName, openFileInEditor } from "./helpers";

// ─── Parse grep output into file-grouped results ──────────────────────────

interface GrepMatch {
  file: string;
  line: string;
}

function parseGrepOutput(output: string): GrepMatch[] {
  if (!output) return [];
  const lines = output.split("\n").filter((l) => l.trim());
  const matches: GrepMatch[] = [];

  for (const line of lines) {
    // Grep output may contain "file:lineNumber:content" or just file paths
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < line.length - 1) {
      const file = line.slice(0, colonIdx);
      const rest = line.slice(colonIdx + 1);
      matches.push({ file, line: rest });
    } else {
      // Plain file path or unstructured line
      matches.push({ file: line, line: "" });
    }
  }
  return matches;
}

function groupByFile(matches: GrepMatch[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const m of matches) {
    const existing = groups.get(m.file);
    if (existing) {
      existing.push(m.line);
    } else {
      groups.set(m.file, m.line ? [m.line] : []);
    }
  }
  return groups;
}

// ─── Highlighted text segment ──────────────────────────────────────────────

function HighlightedLine({ text, pattern }: { text: string; pattern: string }) {
  if (!pattern) {
    return <span>{text}</span>;
  }

  // Attempt regex-safe match; fall back to plain text on bad patterns
  let regex: RegExp;
  try {
    regex = new RegExp(`(${pattern})`, "gi");
  } catch {
    return <span>{text}</span>;
  }

  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span
            key={i}
            className="font-bold rounded-sm px-0.5"
            style={{
              backgroundColor: "rgba(249, 226, 175, 0.2)",
              color: "var(--color-yellow)",
            }}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

// ─── Compact header ────────────────────────────────────────────────────────

function GrepCompactHeader({ input, resultCount }: { input: Record<string, unknown>; resultCount: number }) {
  const pattern = String(input.pattern ?? input.regex ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Search size={13} style={{ color: "var(--color-green)" }} className="flex-shrink-0" />
      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text)" }}>
        Grep
      </span>
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {pattern}
      </span>
      {resultCount > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: "rgba(166, 227, 161, 0.15)",
            color: "var(--color-green)",
          }}
        >
          {resultCount} match{resultCount !== 1 ? "es" : ""}
        </span>
      )}
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function GrepExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const pattern = String(input.pattern ?? input.regex ?? "");
  const path = input.path ? String(input.path) : undefined;

  const matches = parseGrepOutput(output ?? "");
  const grouped = groupByFile(matches);
  const fileCount = grouped.size;

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

      {/* Results grouped by file */}
      {fileCount > 0 && (
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
            {matches.length} result{matches.length !== 1 ? "s" : ""} in {fileCount} file{fileCount !== 1 ? "s" : ""}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {Array.from(grouped.entries()).slice(0, 30).map(([file, lines]) => (
              <div key={file}>
                {/* File header */}
                <button
                  type="button"
                  className="flex items-center gap-2 px-3 py-1 text-xs w-full text-left bg-transparent border-none cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors"
                  style={{ fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--color-surface-0)" }}
                  onClick={() => openFileInEditor(file)}
                  title={file}
                >
                  <FileText size={10} style={{ color: "var(--color-blue)" }} className="flex-shrink-0" />
                  <span className="truncate font-medium" style={{ color: "var(--color-blue)" }}>
                    {fileName(file)}
                  </span>
                  {lines.length > 0 && (
                    <span className="text-[10px] flex-shrink-0" style={{ color: "var(--color-subtext-0)" }}>
                      ({lines.length})
                    </span>
                  )}
                </button>
                {/* Matching lines */}
                {lines.slice(0, 10).map((line, i) => (
                  <div
                    key={i}
                    className="px-3 pl-7 py-0.5 text-xs"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-subtext-0)",
                    }}
                  >
                    <HighlightedLine text={line} pattern={pattern} />
                  </div>
                ))}
                {lines.length > 10 && (
                  <div className="px-3 pl-7 py-0.5 text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
                    ... +{lines.length - 10} more lines
                  </div>
                )}
              </div>
            ))}
            {grouped.size > 30 && (
              <div
                className="px-3 py-1 text-[10px] text-center"
                style={{ color: "var(--color-subtext-0)" }}
              >
                ... and {grouped.size - 30} more files
              </div>
            )}
          </div>
        </div>
      )}

      {output && fileCount === 0 && (
        <div className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          No matches found
        </div>
      )}
    </div>
  );
}

// ─── GrepWidget ────────────────────────────────────────────────────────────

export function GrepWidget({ toolCall, forceExpanded }: WidgetProps) {
  const matches = parseGrepOutput(toolCall.output ?? "");
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<GrepCompactHeader input={toolCall.input} resultCount={matches.length} />}
    >
      <GrepExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
