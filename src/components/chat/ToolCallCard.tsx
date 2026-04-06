import {
  FileText,
  Pencil,
  Terminal,
  Search,
  FilePlus,
  ExternalLink,
} from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { CodeBlock } from "./CodeBlock";
import {
  getWidget,
  registerWidget,
  WidgetShell,
  InlineDiffPreview,
  detectLanguage,
  fileName,
  openFileInEditor,
} from "./widgets";
import type { WidgetProps } from "./widgets";

// ─── Shared sub-components ──────────────────────────────────────────────────

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

// ─── ReadWidget ─────────────────────────────────────────────────────────────

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

function ReadWidget({ toolCall, forceExpanded }: WidgetProps) {
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

// ─── EditWidget ─────────────────────────────────────────────────────────────

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

function EditWidget({ toolCall, forceExpanded }: WidgetProps) {
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

// ─── WriteWidget ────────────────────────────────────────────────────────────

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

function WriteWidget({ toolCall, forceExpanded }: WidgetProps) {
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

// ─── BashWidget ─────────────────────────────────────────────────────────────

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

function BashWidget({ toolCall, forceExpanded }: WidgetProps) {
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

// ─── SearchWidget (Grep + Glob) ─────────────────────────────────────────────

function SearchCompactHeader({ input, toolName }: { input: Record<string, unknown>; toolName: string }) {
  const pattern = String(input.pattern ?? "");
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Search size={13} style={{ color: "var(--color-green)" }} className="flex-shrink-0" />
      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text)" }}>
        {toolName}
      </span>
      <span
        className="truncate text-xs"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        {pattern}
      </span>
    </div>
  );
}

function SearchExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
  const pattern = String(input.pattern ?? "");
  const path = input.path ? String(input.path) : undefined;

  // Parse output into file paths list
  const outputLines = (output ?? "").split("\n").filter((l) => l.trim());
  const hasResults = outputLines.length > 0;

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

      {/* Results as file path list */}
      {hasResults && (
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
            {outputLines.length} result{outputLines.length !== 1 ? "s" : ""}
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {outputLines.slice(0, 50).map((line, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-[var(--color-surface-0)] transition-colors"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <FileText size={10} style={{ color: "var(--color-blue)" }} className="flex-shrink-0" />
                <span className="truncate" style={{ color: "var(--color-text)" }}>
                  {line}
                </span>
              </div>
            ))}
            {outputLines.length > 50 && (
              <div
                className="px-3 py-1 text-[10px] text-center"
                style={{ color: "var(--color-subtext-0)" }}
              >
                ... and {outputLines.length - 50} more
              </div>
            )}
          </div>
        </div>
      )}

      {output && !hasResults && (
        <div className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          No matches found
        </div>
      )}
    </div>
  );
}

function SearchWidget({ toolCall, forceExpanded }: WidgetProps) {
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<SearchCompactHeader input={toolCall.input} toolName={toolCall.name} />}
    >
      <SearchExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}

// ─── Register all built-in widgets ──────────────────────────────────────────

registerWidget("Read", ReadWidget);
registerWidget("Edit", EditWidget);
registerWidget("Write", WriteWidget);
registerWidget("Bash", BashWidget);
registerWidget("Grep", SearchWidget);
registerWidget("Glob", SearchWidget);

// ─── ToolCallCard (thin dispatcher) ─────────────────────────────────────────

interface ToolCallCardProps {
  toolCall: ToolCall;
  /** If provided, overrides internal expanded state (controlled mode) */
  forceExpanded?: boolean;
}

export function ToolCallCard({ toolCall, forceExpanded }: ToolCallCardProps) {
  const Widget = getWidget(toolCall.name);
  return <Widget toolCall={toolCall} forceExpanded={forceExpanded} />;
}
