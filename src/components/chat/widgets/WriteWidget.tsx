import { FilePlus, FileText, ExternalLink, Sparkles } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";
import { InlineDiffPreview } from "./InlineDiffPreview";
import { detectLanguage, fileName, openFileInEditor } from "./helpers";
import { CodeBlock } from "../CodeBlock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Count lines in content */
function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

/** Get a human-readable language label */
function languageLabel(filePath: string): string {
  const langMap: Record<string, string> = {
    typescript: "TypeScript", javascript: "JavaScript", python: "Python",
    rust: "Rust", go: "Go", java: "Java", ruby: "Ruby", shell: "Shell",
    json: "JSON", yaml: "YAML", toml: "TOML", css: "CSS", scss: "SCSS",
    html: "HTML", markdown: "Markdown", sql: "SQL", xml: "XML",
  };
  const lang = detectLanguage(filePath);
  return langMap[lang] ?? lang;
}

// ─── Compact header ────────────────────────────────────────────────────────

function WriteCompactHeader({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? "");
  const name = fileName(filePath);
  const content = String(input.content ?? "");
  const lineCount = countLines(content);

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <FilePlus size={13} style={{ color: "var(--color-green)" }} className="flex-shrink-0" />
      <span
        className="truncate text-xs font-medium"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-subtext-0)" }}
      >
        Write {name}
      </span>
      {lineCount > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: "rgba(166, 227, 161, 0.12)",
            color: "var(--color-green)",
          }}
        >
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
      )}
      <span
        className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: "rgba(166, 227, 161, 0.15)",
          color: "var(--color-green)",
        }}
      >
        <Sparkles size={9} />
        New file
      </span>
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
        color: "var(--color-green)",
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

// ─── Expanded content ──────────────────────────────────────────────────────

function WriteExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const { input } = toolCall;
  const filePath = String(input.file_path ?? input.path ?? "");
  const content = String(input.content ?? "");
  const lang = detectLanguage(filePath);
  const langLabel = languageLabel(filePath);
  const lineCount = countLines(content);
  const autoOpenFiles = useLayoutStore.getState().autoOpenFiles;

  return (
    <div className="flex flex-col gap-2">
      {/* Header row: file link + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilePathLink filePath={filePath} />
        <span
          className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "rgba(166, 227, 161, 0.15)",
            color: "var(--color-green)",
          }}
        >
          <Sparkles size={9} />
          New file
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-subtext-0)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {langLabel}
        </span>
        {lineCount > 0 && (
          <span
            className="text-[10px]"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {lineCount} line{lineCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Syntax-highlighted content preview */}
      {content && (
        <CodeBlock
          code={content.slice(0, 3000)}
          language={lang}
          filename={fileName(filePath)}
        />
      )}

      {/* InlineDiffPreview for new file (old = empty) */}
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

// ─── WriteWidget ───────────────────────────────────────────────────────────

export function WriteWidget({ toolCall, forceExpanded }: WidgetProps) {
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
