import { Pencil, FileText, ExternalLink, Check, X } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { InlineDiffPreview } from "./InlineDiffPreview";
import { detectLanguage, normalizeFilePath, fileName, openFileInEditor } from "./helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute +/- line change counts from old_string and new_string */
function computeLineCounts(oldStr: string, newStr: string): { added: number; removed: number } {
  const oldLines = oldStr ? oldStr.split("\n") : [];
  const newLines = newStr ? newStr.split("\n") : [];

  // Simple heuristic: lines unique to new = added, lines unique to old = removed
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let added = 0;
  let removed = 0;
  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  return { added, removed };
}

// ─── Line change badges ───────────────────────────────────────────────────────

function LineChangeBadges({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="flex items-center gap-1 flex-shrink-0">
      {added > 0 && (
        <span
          className="text-[10px] font-medium px-1 py-0.5 rounded"
          style={{
            backgroundColor: "rgba(166, 227, 161, 0.15)",
            color: "var(--color-green)",
          }}
        >
          +{added}
        </span>
      )}
      {removed > 0 && (
        <span
          className="text-[10px] font-medium px-1 py-0.5 rounded"
          style={{
            backgroundColor: "rgba(243, 139, 168, 0.15)",
            color: "var(--color-red)",
          }}
        >
          -{removed}
        </span>
      )}
    </span>
  );
}

// ─── Compact header ────────────────────────────────────────────────────────

function EditCompactHeader({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? "");
  const name = fileName(filePath);
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const { added, removed } = computeLineCounts(oldStr, newStr);

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Pencil size={13} style={{ color: "var(--color-yellow)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs font-medium"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        Edit {name}
      </span>
      <LineChangeBadges added={added} removed={removed} />
    </div>
  );
}

// ─── File path link (clickable) ───────────────────────────────────────────

function FilePathLink({ filePath }: { filePath: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors w-fit"
      style={{
        fontFamily: "var(--font-mono)",
        color: "var(--color-yellow)",
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

// ─── Accept / Reject buttons ──────────────────────────────────────────────

function DiffActionButtons({ filePath }: { filePath: string }) {
  const normalizedPath = normalizeFilePath(filePath);
  const pendingDiff = useEditorStore((s) => s.pendingDiffs.get(normalizedPath));
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);

  if (!pendingDiff) return null;

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] px-1.5 py-0.5 rounded"
        style={{
          backgroundColor: "rgba(249, 226, 175, 0.15)",
          color: "var(--color-yellow)",
        }}
      >
        pending review
      </span>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
        style={{ backgroundColor: "var(--color-green)", color: "var(--color-crust)" }}
        onClick={() => acceptDiff(normalizedPath)}
      >
        <Check size={10} /> Accept
      </button>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
        style={{ backgroundColor: "var(--color-red)", color: "var(--color-crust)" }}
        onClick={() => rejectDiff(normalizedPath)}
      >
        <X size={10} /> Reject
      </button>
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
  const { added, removed } = computeLineCounts(oldStr, newStr);
  const autoOpenFiles = useLayoutStore.getState().autoOpenFiles;

  return (
    <div className="flex flex-col gap-2">
      {/* Header row: file link + change counts + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilePathLink filePath={filePath} />
        <LineChangeBadges added={added} removed={removed} />
        <div className="flex-1" />
        <DiffActionButtons filePath={filePath} />
      </div>

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

      {/* Full diff preview via InlineDiffPreview (Monaco DiffEditor) */}
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
