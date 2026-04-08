/**
 * InlineEditDiff — shows a diff preview of Claude's suggested edit
 * with Accept/Reject buttons.
 *
 * Renders a simple side-by-side display of old vs new code with
 * green/red highlighting, positioned near the selection.
 */

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

interface InlineEditDiffProps {
  /** Pixel position for the diff panel */
  position: { top: number; left: number };
  /** The original selected code */
  originalText: string;
  /** Claude's suggested replacement */
  suggestedText: string;
  /** Whether we're still loading (show skeleton) */
  isLoading: boolean;
  /** Error message to display */
  error: string | null;
  /** Accept the edit */
  onAccept: () => void;
  /** Reject the edit */
  onReject: () => void;
}

/** Simple line-level diff: marks lines as added, removed, or unchanged */
interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

function computeLineDiff(original: string, suggested: string): DiffLine[] {
  const origLines = original.split("\n");
  const newLines = suggested.split("\n");
  const result: DiffLine[] = [];

  const maxLen = Math.max(origLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const origLine = i < origLines.length ? origLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (origLine === newLine) {
      result.push({ type: "unchanged", text: origLine ?? "" });
    } else {
      if (origLine !== undefined) {
        result.push({ type: "removed", text: origLine });
      }
      if (newLine !== undefined) {
        result.push({ type: "added", text: newLine });
      }
    }
  }

  return result;
}

// Prevent mouse events from propagating to the editor
function stopPropagation(e: React.MouseEvent) {
  e.stopPropagation();
}

export function InlineEditDiff({
  position,
  originalText,
  suggestedText,
  isLoading,
  error,
  onAccept,
  onReject,
}: InlineEditDiffProps) {
  const diffLines = useMemo(
    () => computeLineDiff(originalText, suggestedText),
    [originalText, suggestedText],
  );

  return (
    <div
      className="fixed z-50 rounded-lg shadow-lg overflow-hidden"
      style={{
        top: Math.max(position.top + 36, 8),
        left: position.left,
        minWidth: 360,
        maxWidth: 600,
        maxHeight: 400,
        backgroundColor: "var(--color-mantle)",
        border: "1px solid var(--color-surface-1)",
        boxShadow:
          "0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
      }}
      onMouseDown={stopPropagation}
    >
      {/* Header with accept/reject buttons */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-surface-0)",
        }}
      >
        <span
          className="text-[11px] font-medium"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {isLoading ? "Generating..." : "AI Edit Preview"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors hover:brightness-110"
            style={{
              backgroundColor: "var(--color-green)",
              color: "var(--color-mantle)",
            }}
            onClick={onAccept}
            disabled={isLoading}
            aria-label="Accept edit (Enter)"
            title="Accept (Enter)"
          >
            <Check size={11} />
            Accept
          </button>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors hover:brightness-110"
            style={{
              backgroundColor: "var(--color-red)",
              color: "var(--color-mantle)",
            }}
            onClick={onReject}
            aria-label="Reject edit (Escape)"
            title="Reject (Esc)"
          >
            <X size={11} />
            Reject
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          className="px-3 py-2 text-xs"
          style={{ color: "var(--color-red)" }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Spinner size={20} style={{ color: "var(--color-mauve)" }} />
        </div>
      )}

      {/* Diff content */}
      {!isLoading && !error && (
        <div
          className="overflow-auto p-1"
          style={{ maxHeight: 300, fontFamily: "var(--font-mono)" }}
        >
          {diffLines.map((line, i) => (
            <div
              key={i}
              className="flex items-start text-[11px] leading-5 px-2"
              style={{
                backgroundColor:
                  line.type === "added"
                    ? "rgba(166, 227, 161, 0.1)"
                    : line.type === "removed"
                      ? "rgba(243, 139, 168, 0.1)"
                      : "transparent",
                color:
                  line.type === "added"
                    ? "var(--color-green)"
                    : line.type === "removed"
                      ? "var(--color-red)"
                      : "var(--color-text)",
              }}
            >
              <span
                className="shrink-0 w-4 select-none text-right mr-2"
                style={{ color: "var(--color-overlay-0)" }}
              >
                {line.type === "added"
                  ? "+"
                  : line.type === "removed"
                    ? "-"
                    : " "}
              </span>
              <span className="whitespace-pre">{line.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div
        className="flex items-center justify-center gap-3 px-3 py-1"
        style={{
          borderTop: "1px solid var(--color-surface-0)",
        }}
      >
        <span
          className="text-[10px]"
          style={{ color: "var(--color-overlay-0)" }}
        >
          Enter to accept · Esc to reject
        </span>
      </div>
    </div>
  );
}
