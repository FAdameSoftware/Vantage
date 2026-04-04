import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save, FileText, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { toast } from "sonner";

const CLAUDE_MD_TEMPLATE = `# Project Instructions

## Overview
<!-- Describe your project and its purpose -->

## Code Style
<!-- Describe coding conventions, patterns to follow -->

## Important Files
<!-- List key files and their purposes -->

## Testing
<!-- Describe testing approach and commands -->

## Common Tasks
<!-- List frequent development tasks and how to do them -->
`;

interface FileContent {
  path: string;
  content: string;
  language: string;
}

export function ClaudeMdEditor() {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const isDirty = content !== savedContent;

  useEffect(() => {
    async function detectClaudeMd() {
      const rootPath = useLayoutStore.getState().projectRootPath;
      if (!rootPath) {
        setLoading(false);
        return;
      }

      const claudeMdPath = `${rootPath}/CLAUDE.md`;
      try {
        const result = await invoke<FileContent>("read_file", {
          path: claudeMdPath,
        });
        setContent(result.content);
        setSavedContent(result.content);
        setFilePath(claudeMdPath);
        setExists(true);
      } catch {
        // File doesn't exist — offer to create it
        setFilePath(claudeMdPath);
        setExists(false);
        setContent(CLAUDE_MD_TEMPLATE);
        setSavedContent("");
      }
      setLoading(false);
    }
    detectClaudeMd();
  }, []);

  const handleSave = useCallback(async () => {
    if (!filePath) return;
    try {
      if (!exists) {
        await invoke("create_file", { path: filePath });
      }
      await invoke("write_file", { path: filePath, content });
      setSavedContent(content);
      setExists(true);
      toast.success("CLAUDE.md saved");
    } catch (err) {
      toast.error(`Failed to save: ${err}`);
    }
  }, [filePath, content, exists]);

  const handleRevert = useCallback(() => {
    setContent(savedContent);
  }, [savedContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  // No project open
  if (!projectRootPath) {
    return (
      <div
        className="flex items-center justify-center h-full p-4"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <p className="text-center text-xs leading-relaxed">
          Open a project folder to edit CLAUDE.md
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <p className="text-xs">Loading…</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onKeyDown={handleKeyDown}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={-1}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-mantle)",
        }}
      >
        <FileText size={14} style={{ color: "var(--color-subtext-0)" }} />
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: "var(--color-text)" }}
        >
          CLAUDE.md
          {isDirty && (
            <span
              className="inline-block w-2 h-2 rounded-full ml-2 align-middle"
              style={{ backgroundColor: "var(--color-peach)" }}
              title="Unsaved changes"
            />
          )}
        </span>

        {/* Toggle preview */}
        <button
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80"
          title={showPreview ? "Hide preview" : "Show preview"}
          style={{ color: "var(--color-subtext-0)" }}
        >
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>

        {/* Revert */}
        <button
          onClick={handleRevert}
          disabled={!isDirty}
          className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80 disabled:opacity-30"
          title="Revert changes"
          style={{ color: "var(--color-subtext-0)" }}
        >
          <RotateCcw size={14} />
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80 disabled:opacity-30"
          title="Save (Ctrl+S)"
          style={{ color: isDirty ? "var(--color-green)" : "var(--color-subtext-0)" }}
        >
          <Save size={14} />
        </button>
      </div>

      {/* Create banner when file doesn't exist */}
      {!exists && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs shrink-0"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-yellow)",
            borderBottom: "1px solid var(--color-surface-1)",
          }}
        >
          <span className="flex-1">
            CLAUDE.md not found. Save to create it in the project root.
          </span>
        </div>
      )}

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Monaco editor */}
        <div
          className="overflow-hidden"
          style={{ flex: showPreview ? "0 0 50%" : "1 1 0" }}
        >
          <MonacoEditor
            filePath={filePath ?? "claude.md"}
            language="markdown"
            value={content}
            onChange={setContent}
          />
        </div>

        {/* Divider */}
        {showPreview && (
          <div
            className="w-px shrink-0"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          />
        )}

        {/* Markdown preview */}
        {showPreview && (
          <div className="flex-1 overflow-hidden">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
