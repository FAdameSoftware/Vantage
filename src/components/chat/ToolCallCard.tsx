import { useState, lazy, Suspense } from "react";
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
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import { CodeBlock } from "./CodeBlock";

// Lazy-load the Monaco DiffEditor only when needed for inline previews
const DiffEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.DiffEditor }))
);

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

// ─── Helpers: file path click + language detection ─────────────────────────

/** Normalize a file path the same way the editor store does */
function normalizeFilePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, "/");
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

/** Detect Monaco language ID from a file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "text";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", md: "markdown", css: "css", scss: "scss", html: "html",
    rs: "rust", py: "python", go: "go", java: "java", rb: "ruby",
    sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml", toml: "toml",
    sql: "sql", xml: "xml", svg: "xml", vue: "html", svelte: "html",
  };
  return map[ext] ?? ext;
}

/** Open a file in the IDE editor (switches to IDE view if in Claude View) */
function openFileInEditor(filePath: string) {
  const normalized = normalizeFilePath(filePath);
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  const language = detectLanguage(filePath);
  // Open the file in the editor store (content will be loaded by the editor)
  useEditorStore.getState().openFile(normalized, name, language, "", false);
  // Switch to IDE view so the user can see the editor
  useLayoutStore.getState().setViewMode("ide");
}

// ─── Inline Diff Preview for Edit/Write tool calls ────────────────────────

interface InlineDiffPreviewProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  language: string;
}

function InlineDiffPreview({ filePath, oldContent, newContent, language }: InlineDiffPreviewProps) {
  const [collapsed, setCollapsed] = useState(true);
  const normalizedPath = normalizeFilePath(filePath);
  const pendingDiff = useEditorStore((s) => s.pendingDiffs.get(normalizedPath));
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);

  // Count changed lines (rough estimate)
  const oldLines = oldContent.split("\n").length;
  const newLines = newContent.split("\n").length;
  const added = Math.max(0, newLines - oldLines);
  const removed = Math.max(0, oldLines - newLines);

  return (
    <div
      className="rounded-md overflow-hidden mt-1 mb-1"
      style={{
        border: "1px solid var(--color-surface-1)",
        backgroundColor: "var(--color-mantle)",
      }}
    >
      {/* Collapsed header: filename + change summary */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-text)", background: "none", border: "none" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight size={11} style={{ color: "var(--color-overlay-1)" }} />
        ) : (
          <ChevronDown size={11} style={{ color: "var(--color-overlay-1)" }} />
        )}
        <FileText size={12} style={{ color: "var(--color-yellow)" }} />
        <span className="font-mono truncate" style={{ color: "var(--color-blue)" }}>
          {filePath.split(/[/\\]/).pop()}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-green)" }}>
          +{added}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-red)" }}>
          -{removed}
        </span>
        <span className="flex-1" />
        {pendingDiff && (
          <span className="text-[10px] px-1 rounded" style={{
            backgroundColor: "var(--color-yellow)",
            color: "var(--color-crust)",
          }}>
            pending review
          </span>
        )}
      </button>

      {/* Expanded: Monaco inline diff editor */}
      {!collapsed && (
        <div style={{ borderTop: "1px solid var(--color-surface-1)" }}>
          {/* Action buttons */}
          <div className="flex items-center gap-2 px-3 py-1" style={{
            backgroundColor: "var(--color-surface-0)",
          }}>
            {pendingDiff && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "var(--color-green)", color: "var(--color-crust)" }}
                  onClick={(e) => { e.stopPropagation(); acceptDiff(normalizedPath); }}
                >
                  <Check size={10} /> Accept
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "var(--color-red)", color: "var(--color-crust)" }}
                  onClick={(e) => { e.stopPropagation(); rejectDiff(normalizedPath); }}
                >
                  <X size={10} /> Reject
                </button>
              </>
            )}
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ml-auto transition-colors hover:bg-[var(--color-surface-1)]"
              style={{ color: "var(--color-blue)" }}
              onClick={(e) => { e.stopPropagation(); openFileInEditor(filePath); }}
            >
              <ExternalLink size={10} /> Open in Editor
            </button>
          </div>
          {/* Diff viewer */}
          <div style={{ height: 250 }}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--color-overlay-1)" }}>
                Loading diff viewer...
              </div>
            }>
              <DiffEditor
                original={oldContent}
                modified={newContent}
                language={language}
                theme="catppuccin-mocha"
                options={{
                  readOnly: true,
                  renderSideBySide: false,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  minimap: { enabled: false },
                  renderOverviewRuler: false,
                  fontSize: 11,
                  lineNumbers: "on",
                  padding: { top: 4 },
                }}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clickable file path header ────────────────────────────────────────────

function ClickableFilePath({ filePath, color }: { filePath: string; color: string }) {
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
      const lang = detectLanguage(filePath);
      return (
        <div className="flex flex-col gap-2">
          <ClickableFilePath filePath={filePath} color="var(--color-blue)" />
          {output && (
            <div>
              <div
                className="text-xs font-medium mb-1"
                style={{ color: "var(--color-subtext-0)" }}
              >
                Content
              </div>
              <CodeBlock code={output.slice(0, 2000)} language={lang} filename={filePath.split(/[/\\]/).pop()} />
            </div>
          )}
        </div>
      );
    }

    case "Edit": {
      const filePath = String(input.file_path ?? input.path ?? "");
      const oldStr = String(input.old_string ?? "");
      const newStr = String(input.new_string ?? "");
      const lang = detectLanguage(filePath);
      const autoOpenFiles = useLayoutStore.getState().autoOpenFiles;
      return (
        <div className="flex flex-col gap-2">
          <ClickableFilePath filePath={filePath} color="var(--color-yellow)" />
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
          {/* Inline diff preview (auto-opens when autoOpenFiles is enabled) */}
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

    case "Write": {
      const filePath = String(input.file_path ?? input.path ?? "");
      const content = String(input.content ?? "");
      const lang = detectLanguage(filePath);
      const autoOpenFiles = useLayoutStore.getState().autoOpenFiles;
      return (
        <div className="flex flex-col gap-2">
          <ClickableFilePath filePath={filePath} color="var(--color-yellow)" />
          <CodeBlock code={content.slice(0, 2000)} language={lang} filename={filePath.split(/[/\\]/).pop()} />
          {/* Inline diff preview for Write (shows empty -> new content) */}
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
