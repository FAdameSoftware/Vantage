import { useState, useCallback } from "react";
import { Terminal, Copy, Check, CircleX, CircleCheck } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate a command string for compact display */
function truncateCommand(cmd: string, max: number = 80): string {
  const singleLine = cmd.replace(/\n/g, " ").trim();
  return singleLine.length > max ? singleLine.slice(0, max - 3) + "..." : singleLine;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ isError }: { isError: boolean }) {
  return isError ? (
    <span
      className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{
        backgroundColor: "rgba(243, 139, 168, 0.15)",
        color: "var(--color-red)",
      }}
    >
      <CircleX size={10} />
      failed
    </span>
  ) : (
    <span
      className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{
        backgroundColor: "rgba(166, 227, 161, 0.15)",
        color: "var(--color-green)",
      }}
    >
      <CircleCheck size={10} />
      ok
    </span>
  );
}

// ─── Copy command button ──────────────────────────────────────────────────────

function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [command]);

  return (
    <button
      type="button"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors hover:bg-[var(--color-surface-1)] flex-shrink-0"
      style={{ color: "var(--color-overlay-1)", background: "none", border: "none" }}
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      title="Copy command"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

// ─── Compact header ────────────────────────────────────────────────────────

function BashCompactHeader({ input, toolCall }: { input: Record<string, unknown>; toolCall: ToolCall }) {
  const command = String(input.command ?? "");
  const displayCmd = truncateCommand(command);
  const isError = toolCall.isError;
  const isDone = !toolCall.isExecuting && toolCall.output !== undefined;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Terminal size={13} style={{ color: "var(--color-red)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-green)" }}
      >
        $ {displayCmd}
      </span>
      <CopyCommandButton command={command} />
      {isDone && <StatusBadge isError={!!isError} />}
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function BashExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output, isError } = toolCall;
  const command = String(input.command ?? "");

  return (
    <div className="flex flex-col gap-2">
      {/* Command display */}
      <div
        className="flex items-start gap-2 rounded-md p-2.5"
        style={{
          backgroundColor: "var(--color-crust)",
          border: "1px solid var(--color-surface-0)",
        }}
      >
        <span
          className="text-xs select-none flex-shrink-0"
          style={{ color: "var(--color-green)", fontFamily: "var(--font-mono)" }}
        >
          $
        </span>
        <pre
          className="text-xs m-0 whitespace-pre-wrap break-words flex-1"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}
        >
          {command}
        </pre>
        <CopyCommandButton command={command} />
      </div>

      {/* Output section */}
      {output && (
        <div
          className="rounded-md overflow-hidden"
          style={{
            borderLeft: isError ? "3px solid var(--color-red)" : "3px solid var(--color-surface-1)",
          }}
        >
          <div
            className="flex items-center justify-between px-2.5 py-1"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          >
            <span
              className="text-[10px] font-medium"
              style={{ color: isError ? "var(--color-red)" : "var(--color-subtext-0)" }}
            >
              {isError ? "Error Output" : "Output"}
            </span>
            {isError && (
              <CircleX size={11} style={{ color: "var(--color-red)" }} />
            )}
          </div>
          <pre
            className="text-xs m-0 p-2.5 whitespace-pre-wrap break-words overflow-x-auto max-h-[400px] overflow-y-auto"
            style={{
              fontFamily: "var(--font-mono)",
              color: isError ? "var(--color-red)" : "var(--color-subtext-0)",
              backgroundColor: "var(--color-crust)",
            }}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── BashWidget ────────────────────────────────────────────────────────────

export function BashWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<BashCompactHeader input={toolCall.input} toolCall={toolCall} />}
    >
      <BashExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
