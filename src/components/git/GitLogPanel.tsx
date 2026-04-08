import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GitCommit,
  ChevronDown,
  ChevronRight,
  Loader2,
  Tag,
  FileCode,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { ResumeFromPR } from "./ResumeFromPR";
import { formatRelativeTime } from "@/lib/formatters";

// ── Types matching Rust structs ──────────────────────────────────────

interface GitLogEntry {
  hash: string;
  hash_full: string;
  message: string;
  author: string;
  author_email: string;
  date: string;
  refs: string[];
}

// ── Extension to Monaco language mapping (shared) ────────────────────

import { extensionToLanguage } from "@/lib/languages";

// ── Diff line parser ─────────────────────────────────────────────────

function parseDiffFiles(diffText: string): string[] {
  const files: string[] = [];
  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git")) {
      // Extract b/ path
      const match = line.match(/b\/(.+)$/);
      if (match) {
        files.push(match[1]);
      }
    }
  }
  return files;
}

// ── CommitRow ────────────────────────────────────────────────────────

function CommitRow({
  entry,
  cwd,
}: {
  entry: GitLogEntry;
  cwd: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const openFile = useEditorStore((s) => s.openFile);

  const handleExpand = useCallback(() => {
    if (!expanded && diff === null) {
      setLoadingDiff(true);
      invoke<string>("git_diff_commit", { cwd, hash: entry.hash_full })
        .then((result) => {
          setDiff(result);
          setLoadingDiff(false);
        })
        .catch(() => {
          setDiff("");
          setLoadingDiff(false);
        });
    }
    setExpanded((v) => !v);
  }, [expanded, diff, cwd, entry.hash_full]);

  const changedFiles = diff ? parseDiffFiles(diff) : [];

  return (
    <li>
      <button
        type="button"
        onClick={handleExpand}
        className="flex items-start gap-2 w-full px-3 py-2 text-left transition-colors group"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-0)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        }}
      >
        {/* Expand chevron */}
        <div className="mt-0.5 shrink-0" style={{ color: "var(--color-overlay-1)" }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {/* Commit message */}
          <span
            className="text-xs leading-tight truncate"
            style={{ color: "var(--color-text)" }}
          >
            {entry.message}
          </span>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Hash */}
            <code
              className="text-[10px] font-mono"
              style={{ color: "var(--color-mauve)" }}
            >
              {entry.hash}
            </code>

            {/* Author */}
            <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
              {entry.author}
            </span>

            {/* Date */}
            <span className="text-[10px]" style={{ color: "var(--color-overlay-0)" }}>
              {formatRelativeTime(entry.date)}
            </span>

            {/* Refs / tags */}
            {entry.refs.map((ref_name) => (
              <span
                key={ref_name}
                className="inline-flex items-center gap-0.5 text-[10px] px-1 rounded"
                style={{
                  color: "var(--color-blue)",
                  backgroundColor: "var(--color-surface-0)",
                }}
              >
                <Tag size={8} />
                {ref_name}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* Expanded diff section */}
      {expanded && (
        <div
          className="px-3 py-2"
          style={{
            backgroundColor: "var(--color-crust)",
            borderBottom: "1px solid var(--color-surface-0)",
          }}
        >
          {loadingDiff && (
            <div
              className="flex items-center gap-2 py-2 text-xs"
              style={{ color: "var(--color-overlay-1)" }}
            >
              <Loader2 size={12} className="animate-spin" />
              Loading diff...
            </div>
          )}

          {!loadingDiff && changedFiles.length === 0 && (
            <div className="text-xs py-1" style={{ color: "var(--color-overlay-1)" }}>
              No changes found
            </div>
          )}

          {!loadingDiff && changedFiles.length > 0 && (
            <ul className="space-y-0.5">
              {changedFiles.map((filePath) => (
                <li key={filePath}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const absPath = `${cwd.replace(/\\/g, "/")}/${filePath}`;
                      const fileName = filePath.split("/").pop() ?? filePath;
                      const ext = fileName.split(".").pop() ?? "";
                      const lang = extensionToLanguage(ext);
                      // Read file then open in editor
                      invoke<{ content: string }>("read_file", { path: absPath })
                        .then((result) => {
                          openFile(absPath, fileName, lang, result.content, false);
                        })
                        .catch(() => {
                          // File may have been deleted; open with empty content
                          openFile(absPath, fileName, lang, "", false);
                        });
                    }}
                    className="flex items-center gap-1.5 w-full px-1 py-0.5 text-left rounded text-xs transition-colors"
                    style={{ color: "var(--color-blue)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--color-surface-0)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <FileCode size={11} />
                    <span className="truncate">{filePath}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ── GitLogPanel ──────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function GitLogPanel() {
  const cwd = useLayoutStore((s) => s.projectRootPath);
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load initial commits
  useEffect(() => {
    if (!cwd) return;

    setLoading(true);
    setError(null);
    setEntries([]);
    setHasMore(true);

    invoke<GitLogEntry[]>("git_log", { cwd, limit: PAGE_SIZE })
      .then((result) => {
        setEntries(result);
        setHasMore(result.length >= PAGE_SIZE);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, [cwd]);

  // Infinite scroll - load more
  const loadMore = useCallback(() => {
    if (!cwd || loading || !hasMore) return;

    const currentCount = entries.length;
    setLoading(true);

    invoke<GitLogEntry[]>("git_log", { cwd, limit: currentCount + PAGE_SIZE })
      .then((result) => {
        setEntries(result);
        setHasMore(result.length >= currentCount + PAGE_SIZE);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [cwd, loading, hasMore, entries.length]);

  // Scroll handler for infinite scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 100) {
        loadMore();
      }
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  if (!cwd) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-center text-xs" style={{ color: "var(--color-overlay-1)" }}>
          Open a folder to view git history
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <GitCommit size={13} style={{ color: "var(--color-overlay-1)" }} />
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--color-subtext-0)" }}
        >
          History
        </span>
        <div className="ml-auto flex items-center gap-2">
          {entries.length > 0 && (
            <span
              className="text-[10px]"
              style={{ color: "var(--color-overlay-0)" }}
            >
              {entries.length} commits
            </span>
          )}
          <ResumeFromPR />
        </div>
      </div>

      {/* Scrollable list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {error && (
          <div
            className="px-3 py-4 text-xs text-center"
            style={{ color: "var(--color-red)" }}
          >
            {error}
          </div>
        )}

        {!error && entries.length === 0 && !loading && (
          <div
            className="px-3 py-8 text-xs text-center"
            style={{ color: "var(--color-overlay-1)" }}
          >
            No commits found
          </div>
        )}

        {entries.length > 0 && (
          <ul>
            {entries.map((entry) => (
              <CommitRow key={entry.hash_full} entry={entry} cwd={cwd} />
            ))}
          </ul>
        )}

        {loading && (
          <div
            className="flex items-center justify-center gap-2 py-4 text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <Loader2 size={13} className="animate-spin" />
            Loading commits...
          </div>
        )}
      </div>
    </div>
  );
}
