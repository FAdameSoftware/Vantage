import { Terminal } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { CodeBlock } from "../CodeBlock";

// ─── Shared sub-component ──────────────────────────────────────────────────

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

function BashCompactHeader({ input, toolCall }: { input: Record<string, unknown>; toolCall: ToolCall }) {
  const command = String(input.command ?? "");
  // Truncate long commands for the compact view
  const displayCmd = command.length > 80 ? command.slice(0, 77) + "..." : command;

  // Determine exit code from output (heuristic: check if output mentions exit code or is error)
  const isError = toolCall.isError;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Terminal size={13} style={{ color: "var(--color-red)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-green)" }}
      >
        $ {displayCmd}
      </span>
      {!toolCall.isExecuting && toolCall.output !== undefined && (
        <StatusBadge
          label={isError ? "failed" : "ok"}
          bgColor={isError ? "rgba(243, 139, 168, 0.15)" : "rgba(166, 227, 161, 0.15)"}
          textColor={isError ? "var(--color-red)" : "var(--color-green)"}
        />
      )}
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function BashExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const command = String(input.command ?? "");

  return (
    <div className="flex flex-col gap-2">
      <CodeBlock code={command} language="shell" />
      {output && (
        <div>
          <div
            className="text-xs font-medium mb-1"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Output
          </div>
          <CodeBlock code={output} language="text" />
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
