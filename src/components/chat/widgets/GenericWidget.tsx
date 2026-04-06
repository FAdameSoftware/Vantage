import type { WidgetProps } from "./types";
import { getToolMeta } from "./toolMeta";
import { WidgetShell } from "./WidgetShell";
import { CodeBlock } from "../CodeBlock";

// ─── Default compact header ─────────────────────────────────────────────────

function DefaultCompactHeader({ input, toolName }: { input: Record<string, unknown>; toolName: string }) {
  const meta = getToolMeta(toolName);
  const Icon = meta.icon;
  const summary = JSON.stringify(input).slice(0, 80);
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Icon size={13} style={{ color: meta.color }} className="flex-shrink-0" />
      <span className="font-medium text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>
        {meta.label}
      </span>
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {summary}
      </span>
    </div>
  );
}

// ─── Default expanded content ───────────────────────────────────────────────

function DefaultExpandedContent({ input, output }: { input: Record<string, unknown>; output?: string }) {
  const jsonStr = JSON.stringify(input, null, 2);

  return (
    <div className="flex flex-col gap-2">
      <CodeBlock code={jsonStr} language="json" />
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

// ─── GenericWidget ──────────────────────────────────────────────────────────

export function GenericWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<DefaultCompactHeader input={toolCall.input} toolName={toolCall.name} />}
    >
      <DefaultExpandedContent input={toolCall.input} output={toolCall.output} />
    </WidgetShell>
  );
}
