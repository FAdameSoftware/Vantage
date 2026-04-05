import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Minus,
  Check,
  ArrowUp,
  ArrowDown,
  GitBranchPlus,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { useGitStatus, type GitFileStatus } from "@/hooks/useGitStatus";

// ── Status color mapping ──────────────────────────���────────────────

function statusColor(status: string): string {
  switch (status) {
    case "M":
      return "var(--color-yellow)";
    case "A":
      return "var(--color-green)";
    case "D":
      return "var(--color-red)";
    case "R":
      return "var(--color-blue)";
    case "?":
      return "var(--color-overlay-1)";
    default:
      return "var(--color-text)";
  }
}

// ── FileStatusRow ────────────────────────���─────────────────────────

function FileStatusRow({
  file,
  onAction,
  actionIcon,
  actionLabel,
}: {
  file: GitFileStatus;
  onAction: (path: string) => void;
  actionIcon: React.ReactNode;
  actionLabel: string;
}) {
  const fileName = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className="flex items-center gap-1 px-3 py-0.5 group transition-colors"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "var(--color-surface-0)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
      }}
    >
      {/* Status letter */}
      <span
        className="w-4 shrink-0 text-[11px] font-mono font-bold text-center"
        style={{ color: statusColor(file.status) }}
        title={`Status: ${file.status}`}
      >
        {file.status}
      </span>

      {/* File name + path */}
      <div className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
        <span
          className="text-xs truncate"
          style={{ color: "var(--color-text)" }}
        >
          {fileName}
        </span>
        {dirPath && (
          <span
            className="text-[10px] truncate shrink"
            style={{ color: "var(--color-overlay-0)" }}
          >
            {dirPath}
          </span>
        )}
      </div>

      {/* Stage/Unstage button */}
      <button
        type="button"
        onClick={() => onAction(file.path)}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
        style={{ color: "var(--color-overlay-1)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color =
            "var(--color-overlay-1)";
        }}
        title={actionLabel}
        aria-label={`${actionLabel} ${file.path}`}
      >
        {actionIcon}
      </button>
    </div>
  );
}

// ── SourceControlPanel ─────────────────────────────────────────────

export function SourceControlPanel() {
  const cwd = useLayoutStore((s) => s.projectRootPath);
  const { stagedFiles, unstagedFiles, branch, refresh } = useGitStatus(cwd);

  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  // ── Actions ────────────────────────────────────────────────────

  const stageFile = useCallback(
    async (path: string) => {
      if (!cwd) return;
      try {
        await invoke("git_stage", { cwd, paths: [path] });
        refresh();
      } catch (err) {
        setError(String(err));
      }
    },
    [cwd, refresh]
  );

  const unstageFile = useCallback(
    async (path: string) => {
      if (!cwd) return;
      try {
        await invoke("git_unstage", { cwd, paths: [path] });
        refresh();
      } catch (err) {
        setError(String(err));
      }
    },
    [cwd, refresh]
  );

  const stageAll = useCallback(async () => {
    if (!cwd || unstagedFiles.length === 0) return;
    try {
      const paths = unstagedFiles.map((f) => f.path);
      await invoke("git_stage", { cwd, paths });
      refresh();
    } catch (err) {
      setError(String(err));
    }
  }, [cwd, unstagedFiles, refresh]);

  const unstageAll = useCallback(async () => {
    if (!cwd || stagedFiles.length === 0) return;
    try {
      const paths = stagedFiles.map((f) => f.path);
      await invoke("git_unstage", { cwd, paths });
      refresh();
    } catch (err) {
      setError(String(err));
    }
  }, [cwd, stagedFiles, refresh]);

  const commit = useCallback(async () => {
    if (!cwd || !commitMessage.trim() || stagedFiles.length === 0) return;
    setIsCommitting(true);
    setError(null);
    try {
      await invoke("git_commit", { cwd, message: commitMessage.trim() });
      setCommitMessage("");
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCommitting(false);
    }
  }, [cwd, commitMessage, stagedFiles.length, refresh]);

  const push = useCallback(async () => {
    if (!cwd) return;
    setIsPushing(true);
    setError(null);
    try {
      await invoke("git_push", { cwd });
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPushing(false);
    }
  }, [cwd, refresh]);

  const pull = useCallback(async () => {
    if (!cwd) return;
    setIsPulling(true);
    setError(null);
    try {
      await invoke("git_pull", { cwd });
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPulling(false);
    }
  }, [cwd, refresh]);

  const createBranch = useCallback(async (name: string) => {
    if (!cwd || !name.trim()) return;
    setError(null);
    try {
      await invoke("git_create_branch", { cwd, name: name.trim() });
      setShowBranchInput(false);
      setNewBranchName("");
      refresh();
    } catch (err) {
      setError(String(err));
    }
  }, [cwd, refresh]);

  // ── Empty state ─────────────────���──────────────────────────────

  if (!cwd) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p
          className="text-center text-xs leading-relaxed"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Open a folder to view source control
        </p>
      </div>
    );
  }

  const canCommit =
    commitMessage.trim().length > 0 && stagedFiles.length > 0 && !isCommitting;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar: push / pull / branch / refresh ───────── */}
      <div
        className="flex items-center gap-1 px-3 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        {branch?.branch && (
          <span
            className="text-[10px] font-mono mr-auto truncate"
            style={{ color: "var(--color-subtext-0)" }}
            title={branch.branch}
          >
            {branch.branch}
          </span>
        )}

        <button
          type="button"
          onClick={pull}
          disabled={isPulling}
          className="p-1 rounded transition-colors disabled:opacity-40"
          style={{ color: "var(--color-overlay-1)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color =
              "var(--color-overlay-1)";
          }}
          title="Pull"
          aria-label="Pull"
        >
          {isPulling ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <ArrowDown size={13} />
          )}
        </button>

        <button
          type="button"
          onClick={push}
          disabled={isPushing}
          className="p-1 rounded transition-colors disabled:opacity-40"
          style={{ color: "var(--color-overlay-1)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color =
              "var(--color-overlay-1)";
          }}
          title="Push"
          aria-label="Push"
        >
          {isPushing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <ArrowUp size={13} />
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowBranchInput((v) => !v)}
          className="p-1 rounded transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color =
              "var(--color-overlay-1)";
          }}
          title="New Branch"
          aria-label="New Branch"
        >
          <GitBranchPlus size={13} />
        </button>

        <button
          type="button"
          onClick={refresh}
          className="p-1 rounded transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color =
              "var(--color-overlay-1)";
          }}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Commit message input ────────────���────────────────── */}
      <div
        className="px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        {/* ── New branch input ────────────────────────────── */}
        {showBranchInput && (
          <div
            className="mb-2 flex items-center gap-1.5"
          >
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="New branch name..."
              autoFocus
              className="flex-1 text-xs px-2 py-1 rounded outline-none"
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-text)",
                border: "1px solid var(--color-surface-1)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createBranch(newBranchName);
                } else if (e.key === "Escape") {
                  setShowBranchInput(false);
                  setNewBranchName("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => createBranch(newBranchName)}
              disabled={!newBranchName.trim()}
              className="p-1 rounded text-xs disabled:opacity-40"
              style={{ color: "var(--color-green)" }}
              title="Create branch"
            >
              <Check size={13} />
            </button>
          </div>
        )}
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          rows={3}
          className="w-full text-xs p-2 rounded resize-none outline-none"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          }}
          onKeyDown={(e) => {
            // Ctrl+Enter to commit
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (canCommit) commit();
            }
          }}
        />
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit}
          className="flex items-center justify-center gap-1.5 w-full mt-1.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40"
          style={{
            backgroundColor: canCommit
              ? "var(--color-blue)"
              : "var(--color-surface-1)",
            color: canCommit ? "var(--color-base)" : "var(--color-overlay-1)",
          }}
        >
          {isCommitting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          Commit
          {stagedFiles.length > 0 && (
            <span className="opacity-70">({stagedFiles.length})</span>
          )}
        </button>
      </div>

      {/* ── Error display ────────────────────��───────────────── */}
      {error && (
        <div
          className="px-3 py-1.5 text-[10px] shrink-0 cursor-pointer"
          style={{
            color: "var(--color-red)",
            backgroundColor: "var(--color-surface-0)",
            borderBottom: "1px solid var(--color-surface-0)",
          }}
          onClick={() => setError(null)}
          title="Click to dismiss"
        >
          {error}
        </div>
      )}

      {/* ── Scrollable file lists ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged Changes section */}
        <div>
          <button
            type="button"
            onClick={() => setStagedOpen((v) => !v)}
            className="flex items-center gap-1 w-full px-3 py-1.5 text-left"
            style={{
              backgroundColor: "var(--color-surface-0)",
              borderBottom: "1px solid var(--color-surface-1)",
            }}
          >
            {stagedOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span
              className="text-[11px] font-semibold uppercase tracking-wider flex-1"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Staged Changes
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--color-overlay-0)" }}
            >
              {stagedFiles.length}
            </span>
            {stagedFiles.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  unstageAll();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    unstageAll();
                  }
                }}
                className="p-0.5 rounded"
                style={{ color: "var(--color-overlay-1)" }}
                title="Unstage All"
              >
                <Minus size={12} />
              </span>
            )}
          </button>

          {stagedOpen && stagedFiles.length > 0 && (
            <div className="py-0.5">
              {stagedFiles.map((file) => (
                <FileStatusRow
                  key={`staged-${file.path}`}
                  file={file}

                  onAction={unstageFile}
                  actionIcon={<Minus size={12} />}
                  actionLabel="Unstage"
                />
              ))}
            </div>
          )}
        </div>

        {/* Changes (unstaged) section */}
        <div>
          <button
            type="button"
            onClick={() => setChangesOpen((v) => !v)}
            className="flex items-center gap-1 w-full px-3 py-1.5 text-left"
            style={{
              backgroundColor: "var(--color-surface-0)",
              borderBottom: "1px solid var(--color-surface-1)",
            }}
          >
            {changesOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span
              className="text-[11px] font-semibold uppercase tracking-wider flex-1"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Changes
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--color-overlay-0)" }}
            >
              {unstagedFiles.length}
            </span>
            {unstagedFiles.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  stageAll();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    stageAll();
                  }
                }}
                className="p-0.5 rounded"
                style={{ color: "var(--color-overlay-1)" }}
                title="Stage All"
              >
                <Plus size={12} />
              </span>
            )}
          </button>

          {changesOpen && unstagedFiles.length > 0 && (
            <div className="py-0.5">
              {unstagedFiles.map((file) => (
                <FileStatusRow
                  key={`unstaged-${file.path}`}
                  file={file}

                  onAction={stageFile}
                  actionIcon={<Plus size={12} />}
                  actionLabel="Stage"
                />
              ))}
            </div>
          )}
        </div>

        {/* Empty state */}
        {stagedFiles.length === 0 && unstagedFiles.length === 0 && (
          <div
            className="px-3 py-8 text-xs text-center"
            style={{ color: "var(--color-overlay-1)" }}
          >
            No changes detected
          </div>
        )}
      </div>
    </div>
  );
}
