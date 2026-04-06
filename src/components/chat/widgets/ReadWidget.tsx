import { FileText, ExternalLink, FileCode, Hash } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { detectLanguage, fileName, openFileInEditor } from "./helpers";
import { CodeBlock } from "../CodeBlock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Count lines in the output content */
function countLines(text: string | undefined): number {
  if (!text) return 0;
  return text.split("\n").length;
}

/** Format a line range label like "lines 50-100" */
function lineRangeLabel(input: Record<string, unknown>): string | null {
  const start = input.start_line ?? input.offset;
  const end = input.end_line ?? input.limit;
  if (start != null && end != null) return `lines ${start}\u2013${end}`;
  if (start != null) return `from line ${start}`;
  if (end != null) return `first ${end} lines`;
  return null;
}

/** Pick the right icon color and file-type icon */
function fileIcon(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = new Set(["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "rb", "c", "cpp", "cs", "swift", "kt"]);
  if (codeExts.has(ext)) return FileCode;
  return FileText;
}

// ─── Compact header ────────────────────────────────────────────────────────

function ReadCompactHeader({ input, output }: { input: Record<string, unknown>; output?: string }) {
  const filePath = String(input.file_path ?? input.path ?? "");
  const name = fileName(filePath);
  const lineCount = countLines(output);
  const range = lineRangeLabel(input);
  const Icon = fileIcon(filePath);

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Icon size={13} style={{ color: "var(--color-blue)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs font-medium"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        Read {name}
      </span>
      {range && (
        <span
          className="text-[10px] flex items-center gap-0.5 flex-shrink-0"
          style={{ color: "var(--color-overlay-1)" }}
        >
          <Hash size={9} />
          {range}
        </span>
      )}
      {lineCount > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: "rgba(137, 180, 250, 0.12)",
            color: "var(--color-blue)",
          }}
        >
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ─── File path chip (clickable link to editor) ────────────────────────────

function FilePathLink({ filePath }: { filePath: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors w-fit"
      style={{
        fontFamily: "var(--font-mono)",
        color: "var(--color-blue)",
        backgroundColor: "var(--color-mantle)",
        border: "none",
      }}
      onClick={() => openFileInEditor(filePath)}
      title="Open in editor"
    >
      <FileText size={11} />
      <span className="truncate max-w-[400px]">{filePath}</span>
      <ExternalLink size={9} style={{ color: "var(--color-overlay-1)" }} />
    </button>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function ReadExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const filePath = String(input.file_path ?? input.path ?? "");
  const lang = detectLanguage(filePath);
  const range = lineRangeLabel(input);
  const lineCount = countLines(output);

  return (
    <div className="flex flex-col gap-2">
      {/* File path with open-in-editor link */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilePathLink filePath={filePath} />
        {range && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "rgba(137, 180, 250, 0.1)",
              color: "var(--color-blue)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {range}
          </span>
        )}
        {lineCount > 0 && (
          <span
            className="text-[10px]"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {lineCount} line{lineCount !== 1 ? "s" : ""} read
          </span>
        )}
      </div>

      {/* Syntax-highlighted file content */}
      {output && (
        <CodeBlock
          code={output.slice(0, 3000)}
          language={lang}
          filename={fileName(filePath)}
        />
      )}
    </div>
  );
}

// ─── ReadWidget ────────────────────────────────────────────────────────────

export function ReadWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<ReadCompactHeader input={toolCall.input} output={toolCall.output} />}
    >
      <ReadExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
