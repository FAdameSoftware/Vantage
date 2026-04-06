import { FileText, ExternalLink } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { detectLanguage, fileName, openFileInEditor } from "./helpers";
import { CodeBlock } from "../CodeBlock";

// ─── Shared sub-component ──────────────────────────────────────────────────

function FilePathChip({ filePath, color }: { filePath: string; color: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors w-fit"
      style={{
        fontFamily: "var(--font-mono)",
        color,
        backgroundColor: "var(--color-mantle)",
        border: "none",
      }}
      onClick={() => openFileInEditor(filePath)}
      title="Open in editor"
    >
      <FileText size={11} />
      {filePath}
      <ExternalLink size={9} style={{ color: "var(--color-overlay-1)" }} />
    </button>
  );
}

// ─── Compact header ────────────────────────────────────────────────────────

function ReadCompactHeader({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <FileText size={13} style={{ color: "var(--color-blue)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {filePath}
      </span>
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function ReadExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const filePath = String(input.file_path ?? input.path ?? "");
  const lang = detectLanguage(filePath);

  return (
    <div className="flex flex-col gap-2">
      <FilePathChip filePath={filePath} color="var(--color-blue)" />
      {output && (
        <CodeBlock code={output.slice(0, 2000)} language={lang} filename={fileName(filePath)} />
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
      compactHeader={<ReadCompactHeader input={toolCall.input} />}
    >
      <ReadExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
