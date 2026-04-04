import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  GitBranch,
  RotateCcw,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useAgentsStore, type Agent } from "@/stores/agents";
import { useLayoutStore } from "@/stores/layout";

// ── Confirmation dialog ───────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="rounded-lg p-5 shadow-xl max-w-md mx-4"
        style={{
          backgroundColor: "var(--color-base)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={18} style={{ color: "var(--color-peach)" }} />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {title}
          </h3>
        </div>
        <p
          className="text-xs leading-relaxed mb-4"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
              border: "1px solid var(--color-surface-1)",
              cursor: "pointer",
            }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md transition-colors font-medium"
            style={{
              backgroundColor: "var(--color-red)",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CheckpointControls ────────────────────────────────────────────────

interface CheckpointControlsProps {
  agent: Agent;
}

export function CheckpointControls({ agent }: CheckpointControlsProps) {
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const clearCheckpoint = useAgentsStore((s) => s.clearCheckpoint);
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);

  const handleRestore = useCallback(async () => {
    if (!agent.checkpoint) return;
    setShowConfirm(false);
    setRestoring(true);

    const cwd = agent.worktreePath ?? projectRootPath;
    if (!cwd) {
      toast.error("No working directory available for restore.");
      setRestoring(false);
      return;
    }

    try {
      await invoke("restore_checkpoint", {
        cwd,
        tagName: agent.checkpoint.tagName,
      });
      toast.success("Restored to checkpoint");
    } catch (err) {
      toast.error(`Restore failed: ${String(err)}`);
    } finally {
      setRestoring(false);
    }
  }, [agent.checkpoint, agent.worktreePath, projectRootPath]);

  const handleDelete = useCallback(async () => {
    if (!agent.checkpoint) return;
    setDeleting(true);

    const cwd = agent.worktreePath ?? projectRootPath;
    if (!cwd) {
      toast.error("No working directory available.");
      setDeleting(false);
      return;
    }

    try {
      await invoke("delete_checkpoint", {
        cwd,
        tagName: agent.checkpoint.tagName,
      });
      clearCheckpoint(agent.id);
      toast.success("Checkpoint deleted");
    } catch (err) {
      toast.error(`Delete failed: ${String(err)}`);
    } finally {
      setDeleting(false);
    }
  }, [agent.checkpoint, agent.worktreePath, agent.id, projectRootPath, clearCheckpoint]);

  if (!agent.checkpoint) return null;

  const shortHash = agent.checkpoint.commitHash.slice(0, 7);

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-md"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-blue) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-blue) 20%, transparent)",
        }}
      >
        {/* Checkpoint badge */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <GitBranch size={12} style={{ color: "var(--color-blue)" }} />
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-blue)" }}
          >
            Checkpoint
          </span>
          <code
            className="text-xs px-1 py-0.5 rounded"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-0)",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "10px",
            }}
          >
            {shortHash}
          </code>
        </div>

        {/* Restore button */}
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
          style={{
            backgroundColor: "var(--color-peach)",
            color: "#ffffff",
            border: "none",
            cursor: restoring ? "not-allowed" : "pointer",
            opacity: restoring ? 0.6 : 1,
          }}
          disabled={restoring}
          onClick={() => setShowConfirm(true)}
          title="Restore working tree to this checkpoint"
        >
          {restoring ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <RotateCcw size={11} />
          )}
          Restore
        </button>

        {/* Delete button */}
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
          style={{
            backgroundColor: "transparent",
            color: "var(--color-overlay-1)",
            border: "1px solid var(--color-surface-1)",
            cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.6 : 1,
          }}
          disabled={deleting}
          onClick={handleDelete}
          title="Delete this checkpoint"
        >
          {deleting ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Trash2 size={11} />
          )}
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <ConfirmDialog
          title="Restore Checkpoint"
          message={`Restore working tree to before "${agent.name}" started? This will revert all files to commit ${shortHash}. Uncommitted changes in the working directory will be overwritten.`}
          confirmLabel="Restore"
          onConfirm={handleRestore}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
