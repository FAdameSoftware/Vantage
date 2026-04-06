import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { formatRelativeTime } from "@/lib/formatters";

// ── Types matching Rust structs ──────────────────────────────────────

interface GitBlameLine {
  line_number: number;
  hash: string;
  author: string;
  date: string;
  content: string;
  is_boundary: boolean;
}

// ── BlameAnnotation ──────────────────────────────────────────────────

/** Groups consecutive blame lines from the same commit. */
interface BlameGroup {
  hash: string;
  author: string;
  date: string;
  startLine: number;
  endLine: number;
}

function groupBlameLines(lines: GitBlameLine[]): BlameGroup[] {
  const groups: BlameGroup[] = [];
  let current: BlameGroup | null = null;

  for (const line of lines) {
    if (current && current.hash === line.hash) {
      current.endLine = line.line_number;
    } else {
      if (current) groups.push(current);
      current = {
        hash: line.hash,
        author: line.author,
        date: line.date,
        startLine: line.line_number,
        endLine: line.line_number,
      };
    }
  }
  if (current) groups.push(current);

  return groups;
}

// ── GitBlameToggle (for editor toolbar) ──────────────────────────────

interface GitBlameToggleProps {
  filePath: string | null;
  blameVisible: boolean;
  onToggle: () => void;
}

export function GitBlameToggle({ filePath, blameVisible, onToggle }: GitBlameToggleProps) {
  if (!filePath) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors"
      style={{
        color: blameVisible ? "var(--color-blue)" : "var(--color-overlay-1)",
        backgroundColor: blameVisible ? "var(--color-surface-0)" : "transparent",
      }}
      title={blameVisible ? "Hide git blame" : "Show git blame"}
    >
      {blameVisible ? <EyeOff size={11} /> : <Eye size={11} />}
      Blame
    </button>
  );
}

// ── GitBlameGutter (inline annotations) ──────────────────────────────

interface GitBlameGutterProps {
  filePath: string;
  lineCount: number;
}

export function GitBlameGutter({ filePath }: GitBlameGutterProps) {
  const cwd = useLayoutStore((s) => s.projectRootPath);
  const [blameLines, setBlameLines] = useState<GitBlameLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get relative file path from absolute path
  const getRelativePath = useCallback(
    (absPath: string): string => {
      if (!cwd) return absPath;
      const normalized = absPath.replace(/\\/g, "/");
      const normalizedCwd = cwd.replace(/\\/g, "/");
      if (normalized.startsWith(normalizedCwd)) {
        let rel = normalized.slice(normalizedCwd.length);
        if (rel.startsWith("/")) rel = rel.slice(1);
        return rel;
      }
      return absPath;
    },
    [cwd],
  );

  useEffect(() => {
    if (!cwd || !filePath) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const relPath = getRelativePath(filePath);

    invoke<GitBlameLine[]>("git_blame", { cwd, filePath: relPath })
      .then((result) => {
        if (!cancelled) {
          setBlameLines(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, filePath, getRelativePath]);

  if (loading) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1 text-[10px]"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <Loader2 size={10} className="animate-spin" />
        Loading blame...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="px-2 py-1 text-[10px]"
        style={{ color: "var(--color-overlay-0)" }}
      >
        Blame unavailable
      </div>
    );
  }

  const groups = groupBlameLines(blameLines);

  return (
    <div
      className="shrink-0 select-none overflow-hidden font-mono text-[11px] leading-[19px]"
      style={{
        color: "var(--color-overlay-0)",
        borderRight: "1px solid var(--color-surface-0)",
        minWidth: "180px",
        maxWidth: "220px",
      }}
    >
      {groups.map((group) => {
        const lineSpan = group.endLine - group.startLine + 1;
        return (
          <div
            key={`${group.hash}-${group.startLine}`}
            style={{ height: `${lineSpan * 19}px` }}
            className="flex items-start px-2 overflow-hidden whitespace-nowrap"
            title={`${group.hash} ${group.author} ${group.date}`}
          >
            <span className="truncate">
              <span style={{ color: "var(--color-overlay-1)" }}>
                {group.author.split(" ")[0]}
              </span>
              {" "}
              <span style={{ color: "var(--color-overlay-0)" }}>
                {formatRelativeTime(group.date)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
