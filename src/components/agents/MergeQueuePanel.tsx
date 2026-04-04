import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  GitMerge,
  Play,
  Trash2,
  RefreshCw,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useMergeQueueStore,
  type MergeQueueEntry,
  type GateStatus,
} from "@/stores/mergeQueue";
import { useLayoutStore } from "@/stores/layout";

// ── Gate status icon ────────────────────────────────────────────────

function GateStatusIcon({ status }: { status: GateStatus }) {
  switch (status) {
    case "passed":
      return (
        <CheckCircle2
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-green)" }}
        />
      );
    case "failed":
      return (
        <XCircle
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-red)" }}
        />
      );
    case "running":
      return (
        <Loader2
          size={12}
          className="animate-spin shrink-0"
          style={{ color: "var(--color-blue)" }}
        />
      );
    case "skipped":
      return (
        <Circle
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-overlay-1)" }}
        />
      );
    default:
      return (
        <Circle
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-overlay-1)" }}
        />
      );
  }
}

// ── Entry status color ──────────────────────────────────────────────

function statusColor(status: MergeQueueEntry["status"]): string {
  switch (status) {
    case "ready":
      return "var(--color-green)";
    case "merged":
      return "var(--color-green)";
    case "failed":
      return "var(--color-red)";
    case "conflict":
      return "var(--color-red)";
    case "checking":
      return "var(--color-blue)";
    case "merging":
      return "var(--color-blue)";
    default:
      return "var(--color-subtext-0)";
  }
}

// ── Queue entry card ────────────────────────────────────────────────

interface QueueEntryCardProps {
  entry: MergeQueueEntry;
  onRunGates: (entry: MergeQueueEntry) => void;
  onMerge: (entry: MergeQueueEntry) => void;
  onRemove: (id: string) => void;
}

function QueueEntryCard({
  entry,
  onRunGates,
  onMerge,
  onRemove,
}: QueueEntryCardProps) {
  const isCheckable =
    entry.status === "queued" || entry.status === "failed";
  const isMergeable = entry.status === "ready";
  const isBusy = entry.status === "checking" || entry.status === "merging";

  return (
    <div
      className="rounded-md px-2.5 py-2 select-none"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {/* Header: position + branch + grip */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <GripVertical
          size={12}
          className="shrink-0 cursor-grab"
          style={{ color: "var(--color-overlay-1)" }}
        />
        <span
          className="text-xs font-mono font-medium"
          style={{ color: "var(--color-subtext-0)" }}
        >
          #{entry.position + 1}
        </span>
        <span
          className="flex-1 text-xs font-medium truncate"
          style={{ color: "var(--color-text)" }}
        >
          {entry.branchName}
        </span>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{
            color: statusColor(entry.status),
            backgroundColor: "var(--color-surface-1)",
          }}
        >
          {entry.status}
        </span>
      </div>

      {/* Agent name */}
      <p
        className="text-[11px] mb-1.5"
        style={{ color: "var(--color-subtext-0)" }}
      >
        Agent: {entry.agentName}
      </p>

      {/* Gate status pills */}
      {entry.gates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {entry.gates.map((gate) => (
            <span
              key={gate.gateName}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "var(--color-surface-1)" }}
            >
              <GateStatusIcon status={gate.status} />
              <span style={{ color: "var(--color-text)" }}>
                {gate.gateName}
              </span>
              {gate.durationMs !== undefined && (
                <span style={{ color: "var(--color-overlay-1)" }}>
                  {(gate.durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {isCheckable && (
          <Button size="xs" variant="outline" onClick={() => onRunGates(entry)}>
            <Play size={10} />
            {entry.status === "failed" ? "Retry" : "Run Gates"}
          </Button>
        )}
        {isMergeable && (
          <Button size="xs" onClick={() => onMerge(entry)}>
            <GitMerge size={10} />
            Merge
          </Button>
        )}
        {isBusy && (
          <span
            className="inline-flex items-center gap-1 text-[10px]"
            style={{ color: "var(--color-blue)" }}
          >
            <Loader2 size={10} className="animate-spin" />
            {entry.status === "checking" ? "Running checks..." : "Merging..."}
          </span>
        )}
        <div className="ml-auto">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onRemove(entry.id)}
            disabled={isBusy}
          >
            <Trash2 size={10} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────

export function MergeQueuePanel() {
  const projectRoot = useLayoutStore((s) => s.projectRootPath);
  const entries = useMergeQueueStore((s) => s.entries);
  const removeFromQueue = useMergeQueueStore((s) => s.removeFromQueue);
  const updateGateResult = useMergeQueueStore((s) => s.updateGateResult);
  const updateEntryStatus = useMergeQueueStore((s) => s.updateEntryStatus);
  const markMerged = useMergeQueueStore((s) => s.markMerged);
  const setDefaultGates = useMergeQueueStore((s) => s.setDefaultGates);

  const [detecting, setDetecting] = useState(false);

  // Detect quality gates on mount
  const detectGates = useCallback(async () => {
    if (!projectRoot) return;
    setDetecting(true);
    try {
      const gates = await invoke<{ name: string; command: string }[]>(
        "detect_quality_gates",
        { cwd: projectRoot },
      );
      setDefaultGates(gates);
    } catch {
      // No package.json or parse error -- gates stay empty
    } finally {
      setDetecting(false);
    }
  }, [projectRoot, setDefaultGates]);

  useEffect(() => {
    detectGates();
  }, [detectGates]);

  // Run all quality gates sequentially on an entry
  async function handleRunGates(entry: MergeQueueEntry) {
    updateEntryStatus(entry.id, "checking");

    for (const gate of entry.gates) {
      updateGateResult(entry.id, gate.gateName, { status: "running" });

      try {
        const result = await invoke<{
          gate_name: string;
          command: string;
          passed: boolean;
          stdout: string;
          stderr: string;
          exit_code: number;
          duration_ms: number;
        }>("run_quality_gate", {
          cwd: entry.worktreePath,
          gateName: gate.gateName,
          command: gate.command,
        });

        updateGateResult(entry.id, gate.gateName, {
          status: result.passed ? "passed" : "failed",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exit_code,
          durationMs: result.duration_ms,
        });

        if (!result.passed) {
          // Stop on first failure, skip remaining gates
          const remaining = entry.gates.slice(
            entry.gates.findIndex((g) => g.gateName === gate.gateName) + 1,
          );
          for (const rem of remaining) {
            updateGateResult(entry.id, rem.gateName, { status: "skipped" });
          }
          updateEntryStatus(entry.id, "failed");
          return;
        }
      } catch {
        updateGateResult(entry.id, gate.gateName, {
          status: "failed",
          stderr: "Command invocation failed",
        });
        updateEntryStatus(entry.id, "failed");
        return;
      }
    }

    // All gates passed
    updateEntryStatus(entry.id, "ready");
  }

  // Merge a ready entry
  async function handleMerge(entry: MergeQueueEntry) {
    if (!projectRoot) return;

    updateEntryStatus(entry.id, "merging");

    try {
      const result = await invoke<{
        success: boolean;
        merge_commit: string | null;
        conflict_files: string[];
        output: string;
      }>("merge_branch", {
        repoPath: projectRoot,
        branchName: entry.branchName,
        noFf: true,
      });

      if (result.success) {
        markMerged(entry.id);

        // Rebase remaining queued entries onto updated main
        const remaining = entries.filter(
          (e) => e.id !== entry.id && e.status !== "merged",
        );
        for (const rem of remaining) {
          try {
            await invoke<boolean>("rebase_branch", {
              worktreePath: rem.worktreePath,
              ontoBranch: "HEAD",
            });
          } catch {
            updateEntryStatus(rem.id, "conflict");
          }
        }
      } else {
        updateEntryStatus(entry.id, "conflict");
      }
    } catch {
      updateEntryStatus(entry.id, "conflict");
    }
  }

  // Filter to show active entries first, then merged
  const activeEntries = entries.filter((e) => e.status !== "merged");
  const mergedEntries = entries.filter((e) => e.status === "merged");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <GitMerge size={14} style={{ color: "var(--color-mauve)" }} />
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: "var(--color-text)" }}
        >
          Merge Queue
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={detectGates}
          disabled={detecting}
        >
          <RefreshCw
            size={10}
            className={detecting ? "animate-spin" : ""}
          />
          Detect Gates
        </Button>
      </div>

      {/* Queue entries */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {activeEntries.length === 0 && mergedEntries.length === 0 && (
          <p
            className="text-xs text-center py-8"
            style={{ color: "var(--color-overlay-1)" }}
          >
            No branches in the merge queue.
            <br />
            Complete an agent's work, then add its branch here.
          </p>
        )}

        {activeEntries.map((entry) => (
          <QueueEntryCard
            key={entry.id}
            entry={entry}
            onRunGates={handleRunGates}
            onMerge={handleMerge}
            onRemove={removeFromQueue}
          />
        ))}

        {/* Merged section */}
        {mergedEntries.length > 0 && (
          <>
            <div
              className="text-[10px] font-medium uppercase tracking-wider mt-3 mb-1 px-1"
              style={{ color: "var(--color-overlay-1)" }}
            >
              Merged
            </div>
            {mergedEntries.map((entry) => (
              <QueueEntryCard
                key={entry.id}
                entry={entry}
                onRunGates={handleRunGates}
                onMerge={handleMerge}
                onRemove={removeFromQueue}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
