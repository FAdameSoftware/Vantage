import { useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  FilePlus,
  CircleAlert,
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
  Write: { icon: FilePlus, color: "var(--color-green)", label: "Write" },
  Edit: { icon: Pencil, color: "var(--color-yellow)", label: "Edit" },
  Bash: { icon: Terminal, color: "var(--color-red)", label: "Bash" },
  Grep: { icon: Search, color: "var(--color-green)", label: "Grep" },
  Glob: { icon: FolderOpen, color: "var(--color-teal)", label: "Glob" },
  Agent: { icon: Bot, color: "var(--color-mauve)", label: "Agent" },
};

function getToolMeta(name: string): ToolMeta {
  return toolMeta[name] ?? { icon: Bot, color: "var(--color-overlay-1)", label: name };
}

// ─── Animation variants ─────────────────────────────────────────────────────

const expandVariants = {
  collapsed: { height: 0, opacity: 0, overflow: "hidden" as const },
  expanded: { height: "auto", opacity: 1, overflow: "hidden" as const },
};

const expandTransition = {
  height: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  opacity: { duration: 0.15, delay: 0.05 },
};

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

/** Extract just the filename from a path */
function fileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/** Open a file in the IDE editor (switches to IDE view if in Claude View) */
function openFileInEditor(filePath: string) {
  const normalized = normalizeFilePath(filePath);
  const name = fileName(filePath);
  const language = detectLanguage(filePath);
  useEditorStore.getState().openFile(normalized, name, language, "", false);
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
          {fileName(filePath)}
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

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={expandVariants}
            transition={expandTransition}
            style={{ borderTop: "1px solid var(--color-surface-1)" }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Clickable file path chip ──────────────────────────────────────────────

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

// ─── Status badge (small pill) ──────────────────────────────────────────────

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

// ─── Specialized compact headers per tool ──────────────────────────────────

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

function DefaultCompactHeader({ input, meta }: { input: Record<string, unknown>; meta: ToolMeta }) {
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

/** Render the appropriate compact header based on tool name */
function CompactHeader({ toolCall }: { toolCall: ToolCall }) {
  const { name, input } = toolCall;
  switch (name) {
    case "Read":
      return <ReadCompactHeader input={input} />;
    case "Edit":
      return <EditCompactHeader input={input} />;
    case "Write":
      return <WriteCompactHeader input={input} />;
    case "Bash":
      return <BashCompactHeader input={input} toolCall={toolCall} />;
    case "Grep":
    case "Glob":
      return <SearchCompactHeader input={input} toolName={name} />;
    default:
      return <DefaultCompactHeader input={input} meta={getToolMeta(name)} />;
  }
}

// ─── Tool-specific expanded content ────────────────────────────────────────

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

function DefaultExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input, output } = toolCall;
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

/** Route to the appropriate expanded content renderer */
function ToolExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  switch (toolCall.name) {
    case "Read":
      return <ReadExpandedContent toolCall={toolCall} />;
    case "Edit":
      return <EditExpandedContent toolCall={toolCall} />;
    case "Write":
      return <WriteExpandedContent toolCall={toolCall} />;
    case "Bash":
      return <BashExpandedContent toolCall={toolCall} />;
    case "Grep":
    case "Glob":
      return <SearchExpandedContent toolCall={toolCall} />;
    default:
      return <DefaultExpandedContent toolCall={toolCall} />;
  }
}

// ─── Border color per tool type ─────────────────────────────────────────────

function getToolBorderColor(name: string): string {
  const meta = getToolMeta(name);
  return meta.color;
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
  const borderColor = getToolBorderColor(toolCall.name);

  return (
    <div
      className="rounded-lg overflow-hidden my-2 text-xs"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-0)",
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
    >
      {/* Header -- compact, one-line, clickable to toggle */}
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

        {/* Tool-specific compact header */}
        <CompactHeader toolCall={toolCall} />

        {/* Status indicators */}
        {toolCall.isExecuting && (
          <span className="flex items-center gap-1 flex-shrink-0" style={{ color: "var(--color-blue)" }}>
            <Loader2 size={12} className="animate-spin" />
            <span className="text-[10px]">running</span>
          </span>
        )}
        {toolCall.isError && !toolCall.isExecuting && (
          <span className="flex items-center gap-1 flex-shrink-0" style={{ color: "var(--color-red)" }}>
            <CircleAlert size={12} />
            <span className="text-[10px]">error</span>
          </span>
        )}
      </button>

      {/* Expanded content with smooth animation */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={expandVariants}
            transition={expandTransition}
          >
            <div
              className="px-3 py-2"
              style={{ borderTop: "1px solid var(--color-surface-1)" }}
            >
              <ToolExpandedContent toolCall={toolCall} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
