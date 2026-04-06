import { Pencil, FileText, ExternalLink } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { InlineDiffPreview } from "./InlineDiffPreview";
import { detectLanguage, openFileInEditor } from "./helpers";

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

function EditCompactHeader({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Pencil size={13} style={{ color: "var(--color-yellow)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {filePath}
      </span>
      <StatusBadge label="Modified" bgColor="rgba(249, 226, 175, 0.15)" textColor="var(--color-yellow)" />
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function EditExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input } = toolCall;
  const filePath = String(input.file_path ?? input.path ?? "");
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const lang = detectLanguage(filePath);
  const autoOpenFiles = useLayoutStore.getState().autoOpenFiles;

  return (
    <div className="flex flex-col gap-2">
      <FilePathChip filePath={filePath} color="var(--color-yellow)" />
      {/* Inline text diff: red for removed, green for added */}
      {oldStr && (
        <div
          className="text-xs rounded-md p-2 whitespace-pre-wrap break-words"
          style={{
            fontFamily: "var(--font-mono)",
            backgroundColor: "rgba(243, 139, 168, 0.08)",
            borderLeft: "3px solid var(--color-red)",
            color: "var(--color-text)",
          }}
        >
          {oldStr}
        </div>
      )}
      {newStr && (
        <div
          className="text-xs rounded-md p-2 whitespace-pre-wrap break-words"
          style={{
            fontFamily: "var(--font-mono)",
            backgroundColor: "rgba(166, 227, 161, 0.08)",
            borderLeft: "3px solid var(--color-green)",
            color: "var(--color-text)",
          }}
        >
          {newStr}
        </div>
      )}
      {autoOpenFiles && oldStr && newStr && (
        <InlineDiffPreview
          filePath={filePath}
          oldContent={oldStr}
          newContent={newStr}
          language={lang}
        />
      )}
    </div>
  );
}

// ─── EditWidget ────────────────────────────────────────────────────────────

export function EditWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<EditCompactHeader input={toolCall.input} />}
    >
      <EditExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
