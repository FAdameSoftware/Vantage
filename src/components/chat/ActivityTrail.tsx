import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  FilePlus,
  Terminal,
  Search,
  FolderOpen,
  ExternalLink,
  Activity,
} from "lucide-react";
import { useActivityTrail, ACTION_COLORS, type ActivityAction, type ActivityEntry } from "@/hooks/useActivityTrail";
import { useEditorStore } from "@/stores/editor";
import { invoke } from "@tauri-apps/api/core";

// ─── Action icon map ────────────────────────────────────────────────────────

function getActionIcon(action: ActivityAction) {
  switch (action) {
    case "Read":
      return FileText;
    case "Edit":
    case "MultiEdit":
      return Pencil;
    case "Write":
      return FilePlus;
    case "Bash":
      return Terminal;
    case "Grep":
      return Search;
    case "Glob":
      return FolderOpen;
    default:
      return FileText;
  }
}

// ─── Format relative time ───────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ─── Single activity entry ──────────────────────────────────────────────────

interface ActivityTrailItemProps {
  entry: ActivityEntry;
  onOpenFile: (path: string) => void;
}

function ActivityTrailItem({ entry, onOpenFile }: ActivityTrailItemProps) {
  const Icon = getActionIcon(entry.action);
  const color = ACTION_COLORS[entry.action];

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded hover:bg-[var(--color-surface-0)] transition-colors group cursor-pointer"
      onClick={() => onOpenFile(entry.path)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenFile(entry.path);
        }
      }}
      title={`${entry.action}: ${entry.path}`}
    >
      {/* Action icon */}
      <Icon size={12} style={{ color }} className="shrink-0" />

      {/* Filename */}
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--color-text)",
        }}
      >
        {entry.filename}
      </span>

      {/* Action badge */}
      <span
        className="text-[9px] px-1 py-0.5 rounded shrink-0"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
        }}
      >
        {entry.action}
      </span>

      {/* Relative time */}
      <span
        className="text-[9px] shrink-0"
        style={{ color: "var(--color-overlay-0)" }}
      >
        {formatRelativeTime(entry.timestamp)}
      </span>

      {/* Open externally icon (visible on hover) */}
      {entry.action !== "Bash" && entry.action !== "Grep" && entry.action !== "Glob" && (
        <ExternalLink
          size={10}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--color-overlay-1)" }}
        />
      )}
    </div>
  );
}

// ─── Activity Trail Panel ───────────────────────────────────────────────────

export function ActivityTrail() {
  const entries = useActivityTrail();
  const [expanded, setExpanded] = useState(true);

  const openFile = useEditorStore((s) => s.openFile);

  const handleOpenFile = useCallback(
    (path: string) => {
      // Don't try to open Bash commands, Grep patterns, or Glob patterns
      if (
        path.startsWith("grep:") ||
        path.startsWith("glob:") ||
        !path.includes("/") && !path.includes("\\") && !path.includes(".")
      ) {
        return;
      }

      // Read the file and open it in the editor
      invoke<string>("read_file", { path })
        .then((content) => {
          const filename = path.split("/").pop() ?? path;
          const ext = filename.split(".").pop() ?? "text";
          // Map common extensions to Monaco language IDs
          const langMap: Record<string, string> = {
            ts: "typescript",
            tsx: "typescriptreact",
            js: "javascript",
            jsx: "javascriptreact",
            rs: "rust",
            py: "python",
            json: "json",
            md: "markdown",
            css: "css",
            html: "html",
            toml: "toml",
            yaml: "yaml",
            yml: "yaml",
          };
          const language = langMap[ext] ?? ext;
          openFile(path, filename, language, content);
        })
        .catch((err) => {
          console.error("Failed to open file from activity trail:", err);
        });
    },
    [openFile],
  );

  // Count modified files (Edit/Write actions)
  const modifiedCount = entries.filter((e) => e.hasDiff).length;
  const readCount = entries.filter((e) => e.action === "Read").length;

  if (entries.length === 0) {
    return null; // Don't show the panel if there's nothing to display
  }

  // Sort: most recent first
  const sortedEntries = [...entries].reverse();

  return (
    <div
      className="flex flex-col"
      style={{ borderTop: "1px solid var(--color-surface-0)" }}
    >
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 text-xs bg-transparent border-none cursor-pointer w-full text-left hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-subtext-0)" }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Activity size={12} style={{ color: "var(--color-mauve)" }} />
        <span className="font-semibold uppercase tracking-wider text-[10px]">
          Activity Trail
        </span>
        <span
          className="ml-auto flex items-center gap-1.5 text-[10px]"
          style={{ color: "var(--color-overlay-1)" }}
        >
          {modifiedCount > 0 && (
            <span
              className="px-1 rounded"
              style={{
                backgroundColor: "rgba(249, 226, 175, 0.15)",
                color: "var(--color-yellow)",
              }}
            >
              {modifiedCount} modified
            </span>
          )}
          {readCount > 0 && (
            <span
              className="px-1 rounded"
              style={{
                backgroundColor: "rgba(137, 180, 250, 0.15)",
                color: "var(--color-blue)",
              }}
            >
              {readCount} read
            </span>
          )}
        </span>
      </button>

      {/* Entries list */}
      {expanded && (
        <div
          className="overflow-y-auto px-1 pb-1"
          style={{ maxHeight: "250px" }}
        >
          {sortedEntries.map((entry) => (
            <ActivityTrailItem
              key={entry.id}
              entry={entry}
              onOpenFile={handleOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
