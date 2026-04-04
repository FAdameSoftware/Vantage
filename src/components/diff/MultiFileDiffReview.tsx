import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { CheckCircle2, GitCompare } from "lucide-react";
import { DiffFileTree, type DiffFileEntry } from "./DiffFileTree";
import { useSettingsStore } from "@/stores/settings";
import { catppuccinMochaTheme } from "@/components/editor/monacoTheme";

// Use the same local monaco bundle
loader.config({ monaco });

// Register Catppuccin Mocha theme once
let themeRegistered = false;
function ensureThemeRegistered() {
  if (!themeRegistered) {
    monaco.editor.defineTheme("catppuccin-mocha", catppuccinMochaTheme);
    themeRegistered = true;
  }
}
ensureThemeRegistered();

// ── Language detection ─────────────────────────────────────────────────────────

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const MAP: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    rs: "rust",
    py: "python",
    go: "go",
    java: "java",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    c: "c",
    cpp: "cpp",
    h: "cpp",
    swift: "swift",
    kt: "kotlin",
    json: "json",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    md: "markdown",
    mdx: "markdown",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    graphql: "graphql",
  };
  return MAP[ext] ?? "plaintext";
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface FileContent {
  content: string;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface MultiFileDiffReviewProps {
  /** Path to the worktree or repo to diff */
  worktreePath: string;
  /** Optional: label shown in the header (e.g., agent name) */
  label?: string;
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyDiffPane({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3"
      style={{ color: "var(--color-overlay-0)" }}
    >
      <GitCompare size={32} strokeWidth={1.5} />
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MultiFileDiffReview({
  worktreePath,
  label,
}: MultiFileDiffReviewProps) {
  const [files, setFiles] = useState<DiffFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [viewedPaths, setViewedPaths] = useState<Set<string>>(new Set());
  const [originalContent, setOriginalContent] = useState<string>("");
  const [modifiedContent, setModifiedContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);

  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSizeEditor);

  // ── Load changed files on mount / when worktree changes ──────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadChanges() {
      setLoading(true);
      try {
        const changedFiles = await invoke<string[]>("get_worktree_changes", {
          worktreePath,
        });
        if (cancelled) return;
        const entries: DiffFileEntry[] = changedFiles.map((path) => ({
          path,
          additions: 0,
          deletions: 0,
        }));
        setFiles(entries);
        // Auto-select first file
        if (entries.length > 0) {
          setSelectedPath(entries[0].path);
        } else {
          setSelectedPath(null);
        }
      } catch {
        if (!cancelled) {
          setFiles([]);
          setSelectedPath(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadChanges();
    return () => {
      cancelled = true;
    };
  }, [worktreePath]);

  // ── Load diff when selection changes ─────────────────────────────────────────

  useEffect(() => {
    if (!selectedPath) {
      setOriginalContent("");
      setModifiedContent("");
      return;
    }

    let cancelled = false;
    setDiffLoading(true);

    async function loadDiff() {
      try {
        // HEAD version (empty string for new files)
        const original = await invoke<string>("git_show_file", {
          worktreePath,
          filePath: selectedPath,
          gitRef: "HEAD",
        });

        if (cancelled) return;

        // Working tree version
        const modified = await invoke<FileContent>("read_file", {
          path: `${worktreePath}/${selectedPath}`,
        });

        if (cancelled) return;

        setOriginalContent(original);
        setModifiedContent(modified.content);
      } catch {
        if (!cancelled) {
          setOriginalContent("");
          setModifiedContent("");
        }
      } finally {
        if (!cancelled) setDiffLoading(false);
      }
    }

    loadDiff();
    return () => {
      cancelled = true;
    };
  }, [selectedPath, worktreePath]);

  // ── Viewed toggle ─────────────────────────────────────────────────────────────

  const toggleViewed = useCallback((path: string) => {
    setViewedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Auto-mark as viewed when a file is selected
  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      setViewedPaths((prev) => {
        if (prev.has(path)) return prev;
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    },
    [],
  );

  // ── Accept / Reject All (placeholder) ────────────────────────────────────────

  const handleAcceptAll = useCallback(() => {
    // Mark all files as viewed (accept all is a no-op for now — will integrate
    // with git merge in a future task)
    setViewedPaths(new Set(files.map((f) => f.path)));
  }, [files]);

  const handleRejectAll = useCallback(() => {
    // Placeholder: will revert all changes in a future task
    setViewedPaths(new Set());
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────────

  const viewedCount = viewedPaths.size;
  const totalCount = files.length;
  const language = selectedPath ? detectLanguage(selectedPath) : "plaintext";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
    >
      {/* ── Toolbar ── */}
      <div
        className="flex items-center justify-between px-3 h-9 shrink-0 gap-3"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {/* Left: title + file count */}
        <div className="flex items-center gap-2 min-w-0">
          <GitCompare size={14} style={{ color: "var(--color-overlay-1)", flexShrink: 0 }} />
          <span
            className="text-xs font-medium truncate"
            style={{ color: "var(--color-text)" }}
          >
            {label ? `${label} — ` : ""}
            {loading
              ? "Loading changes…"
              : `${totalCount} file${totalCount !== 1 ? "s" : ""} changed`}
          </span>
        </div>

        {/* Right: progress + actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Viewed progress */}
          {!loading && totalCount > 0 && (
            <div className="flex items-center gap-1">
              <CheckCircle2
                size={12}
                style={{ color: "var(--color-green)" }}
              />
              <span
                className="text-xs"
                style={{ color: "var(--color-subtext-0)" }}
              >
                {viewedCount}/{totalCount} viewed
              </span>
            </div>
          )}

          {/* Accept All */}
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-green) 15%, transparent)",
              color: "var(--color-green)",
              border: "1px solid color-mix(in srgb, var(--color-green) 30%, transparent)",
            }}
            onClick={handleAcceptAll}
            disabled={loading || totalCount === 0}
            title="Mark all files as reviewed (accept placeholder)"
          >
            Accept All
          </button>

          {/* Reject All */}
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-red) 15%, transparent)",
              color: "var(--color-red)",
              border: "1px solid color-mix(in srgb, var(--color-red) 30%, transparent)",
            }}
            onClick={handleRejectAll}
            disabled={loading || totalCount === 0}
            title="Reset viewed state (reject placeholder)"
          >
            Reject All
          </button>
        </div>
      </div>

      {/* ── Body: file tree + diff viewer ── */}
      {loading ? (
        <div
          className="flex items-center justify-center flex-1 text-xs"
          style={{ color: "var(--color-overlay-0)" }}
        >
          Loading changed files…
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left pane: file tree (~250px) */}
          <div
            className="flex flex-col shrink-0 overflow-hidden"
            style={{
              width: 250,
              borderRight: "1px solid var(--color-surface-0)",
              backgroundColor: "var(--color-mantle)",
            }}
          >
            {/* File tree header */}
            <div
              className="px-3 py-1.5 shrink-0 text-xs font-medium"
              style={{
                color: "var(--color-subtext-0)",
                borderBottom: "1px solid var(--color-surface-0)",
              }}
            >
              Changed files
            </div>

            {/* File list */}
            <div className="flex-1 min-h-0">
              <DiffFileTree
                files={files}
                selectedPath={selectedPath}
                viewedPaths={viewedPaths}
                onSelectFile={handleSelectFile}
                onToggleViewed={toggleViewed}
              />
            </div>
          </div>

          {/* Right pane: diff viewer */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {selectedPath === null ? (
              <EmptyDiffPane message="Select a file to view its diff" />
            ) : diffLoading ? (
              <div
                className="flex items-center justify-center h-full text-xs"
                style={{ color: "var(--color-overlay-0)" }}
              >
                Loading diff…
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* File path bar */}
                <div
                  className="px-3 py-1.5 shrink-0 text-xs font-mono truncate"
                  style={{
                    color: "var(--color-subtext-0)",
                    backgroundColor: "var(--color-mantle)",
                    borderBottom: "1px solid var(--color-surface-0)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {selectedPath}
                </div>

                {/* Monaco diff editor */}
                <div className="flex-1 overflow-hidden" data-allow-select="true">
                  <DiffEditor
                    original={originalContent}
                    modified={modifiedContent}
                    language={language}
                    theme="catppuccin-mocha"
                    options={{
                      fontFamily,
                      fontSize,
                      readOnly: true,
                      renderSideBySide: false,
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      minimap: { enabled: false },
                      renderOverviewRuler: false,
                      padding: { top: 8 },
                      smoothScrolling: true,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
