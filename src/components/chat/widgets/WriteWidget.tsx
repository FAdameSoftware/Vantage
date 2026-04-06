import { FilePlus, FileText, ExternalLink } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { InlineDiffPreview } from "./InlineDiffPreview";
import { detectLanguage, fileName, openFileInEditor } from "./helpers";
import { CodeBlock } from "../CodeBlock";

// ─── Shared sub-components ─────────────────────────────────────────────────

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

function StatusBadge({ label, bgColor, textColor }: { label: string; bgColor: string; textColor: string }) {
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {label}
    </span>
  );
}

// ─── Compact header ────────────────────────────────────────────────────────

function WriteCompactHeader({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <FilePlus size={13} style={{ color: "var(--color-green)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {filePath}
      </span>
      <StatusBadge label="Created" bgColor="rgba(166, 227, 161, 0.15)" textColor="var(--color-green)" />
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function WriteExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input } = toolCall;
  const filePath = String(input.file_path ?? input.path ?? "");
  const content = String(input.content ?? "");
  const lang = detectLanguage(filePath);
  const autoOpenFiles = useLayoutStore.getState().autoOpenFiles;

  return (
    <div className="flex flex-col gap-2">
      <FilePathChip filePath={filePath} color="var(--color-green)" />
      <CodeBlock code={content.slice(0, 2000)} language={lang} filename={fileName(filePath)} />
      {autoOpenFiles && content && (
        <InlineDiffPreview
          filePath={filePath}
          oldContent=""
          newContent={content.slice(0, 5000)}
          language={lang}
        />
      )}
    </div>
  );
}

// ─── WriteWidget ───────────────────────────────────────────────────────────

export function WriteWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<WriteCompactHeader input={toolCall.input} />}
    >
      <WriteExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
