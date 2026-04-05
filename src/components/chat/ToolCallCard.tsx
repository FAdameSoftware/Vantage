import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Pencil,
  Terminal,
  Search,
  FolderOpen,
  Bot,
  Loader2,
} from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { CodeBlock } from "./CodeBlock";

// ─── Tool metadata ──────────────────────────────────────────────────────────

interface ToolMeta {
  icon: React.ElementType;
  color: string;
  label: string;
}

const toolMeta: Record<string, ToolMeta> = {
  Read: { icon: FileText, color: "var(--color-blue)", label: "Read" },
  Write: { icon: Pencil, color: "var(--color-yellow)", label: "Write" },
  Edit: { icon: Pencil, color: "var(--color-yellow)", label: "Edit" },
  Bash: { icon: Terminal, color: "var(--color-red)", label: "Bash" },
  Grep: { icon: Search, color: "var(--color-green)", label: "Grep" },
  Glob: { icon: FolderOpen, color: "var(--color-teal)", label: "Glob" },
  Agent: { icon: Bot, color: "var(--color-mauve)", label: "Agent" },
};

function getToolMeta(name: string): ToolMeta {
  return toolMeta[name] ?? { icon: Bot, color: "var(--color-overlay-1)", label: name };
}

// ─── Input summary (collapsed view) ────────────────────────────────────────

function getInputSummary(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
      return String(input.file_path ?? input.path ?? "");
    case "Write":
      return String(input.file_path ?? input.path ?? "");
    case "Edit":
      return String(input.file_path ?? input.path ?? "");
    case "Bash":
      return String(input.command ?? "");
    case "Grep":
      return String(input.pattern ?? "");
    case "Glob":
      return String(input.pattern ?? "");
    default:
      return JSON.stringify(input).slice(0, 80);
  }
}

// ─── Tool-specific expanded content ────────────────────────────────────────

function ToolExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { name, input, output } = toolCall;

  switch (name) {
    case "Bash": {
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

    case "Read": {
      const filePath = String(input.file_path ?? input.path ?? "");
      return (
        <div className="flex flex-col gap-2">
          <div
            className="text-xs px-2 py-1 rounded"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-blue)",
              backgroundColor: "var(--color-mantle)",
            }}
          >
            {filePath}
          </div>
          {output && (
            <div>
              <div
                className="text-xs font-medium mb-1"
                style={{ color: "var(--color-subtext-0)" }}
              >
                Content
              </div>
              <CodeBlock code={output.slice(0, 2000)} language="text" />
            </div>
          )}
        </div>
      );
    }

    case "Edit": {
      const filePath = String(input.file_path ?? input.path ?? "");
      const oldStr = String(input.old_string ?? "");
      const newStr = String(input.new_string ?? "");
      return (
        <div className="flex flex-col gap-2">
          <div
            className="text-xs px-2 py-1 rounded"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-yellow)",
              backgroundColor: "var(--color-mantle)",
            }}
          >
            {filePath}
          </div>
          {oldStr && (
            <div
              className="text-xs rounded p-2 whitespace-pre-wrap break-words"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: "rgba(243, 139, 168, 0.1)",
                borderLeft: "3px solid var(--color-red)",
                color: "var(--color-text)",
              }}
            >
              {oldStr}
            </div>
          )}
          {newStr && (
            <div
              className="text-xs rounded p-2 whitespace-pre-wrap break-words"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: "rgba(166, 227, 161, 0.1)",
                borderLeft: "3px solid var(--color-green)",
                color: "var(--color-text)",
              }}
            >
              {newStr}
            </div>
          )}
        </div>
      );
    }

    case "Write": {
      const filePath = String(input.file_path ?? input.path ?? "");
      const content = String(input.content ?? "");
      // Try to detect language from file extension
      const ext = filePath.split(".").pop() ?? "text";
      return (
        <div className="flex flex-col gap-2">
          <div
            className="text-xs px-2 py-1 rounded"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-yellow)",
              backgroundColor: "var(--color-mantle)",
            }}
          >
            {filePath}
          </div>
          <CodeBlock code={content.slice(0, 2000)} language={ext} />
        </div>
      );
    }

    default: {
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
  }
}

// ─── ToolCallCard ───────────────────────────────────────────────────────────

interface ToolCallCardProps {
  toolCall: ToolCall;
  /** If provided, overrides internal expanded state (controlled mode) */
  forceExpanded?: boolean;
}

export function ToolCallCard({ toolCall, forceExpanded }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = forceExpanded !== undefined ? forceExpanded : expanded;
  const meta = getToolMeta(toolCall.name);
  const Icon = meta.icon;
  const summary = getInputSummary(toolCall.name, toolCall.input);

  return (
    <div
      className="rounded-md overflow-hidden my-2 text-xs"
      style={{
        backgroundColor: "var(--color-surface-0)",
        borderLeft: `3px solid ${meta.color}`,
        border: `1px solid var(--color-surface-0)`,
        borderLeftColor: meta.color,
      }}
    >
      {/* Header — clickable to toggle */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left bg-transparent border-none cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {isExpanded ? (
          <ChevronDown size={12} style={{ color: "var(--color-overlay-1)" }} />
        ) : (
          <ChevronRight size={12} style={{ color: "var(--color-overlay-1)" }} />
        )}
        <Icon size={14} style={{ color: meta.color }} />
        <span
          className="font-medium"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text)",
          }}
        >
          {meta.label}
        </span>
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-subtext-0)",
          }}
        >
          {summary}
        </span>
        {toolCall.isExecuting && (
          <span className="flex items-center gap-1" style={{ color: "var(--color-blue)" }}>
            <Loader2 size={12} className="animate-spin" />
            <span>running</span>
          </span>
        )}
        {toolCall.isError && (
          <span style={{ color: "var(--color-red)" }}>error</span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="px-3 py-2"
          style={{ borderTop: "1px solid var(--color-surface-1)" }}
        >
          <ToolExpandedContent toolCall={toolCall} />
        </div>
      )}
    </div>
  );
}
