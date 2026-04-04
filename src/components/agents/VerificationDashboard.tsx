import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Play,
  ChevronRight,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVerificationStore, type CheckStatus, type VerificationCheck } from "@/stores/verification";
import { useAgentsStore } from "@/stores/agents";
import { useLayoutStore } from "@/stores/layout";
import { useMergeQueueStore } from "@/stores/mergeQueue";

// ── Check status icon ──────────────────────────────────────────────

function CheckStatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case "passed":
      return (
        <CheckCircle2
          size={14}
          className="shrink-0"
          style={{ color: "var(--color-green)" }}
        />
      );
    case "failed":
      return (
        <XCircle
          size={14}
          className="shrink-0"
          style={{ color: "var(--color-red)" }}
        />
      );
    case "running":
      return (
        <Loader2
          size={14}
          className="animate-spin shrink-0"
          style={{ color: "var(--color-blue)" }}
        />
      );
    case "skipped":
      return (
        <Circle
          size={14}
          className="shrink-0"
          style={{ color: "var(--color-overlay-1)" }}
        />
      );
    default:
      return (
        <Circle
          size={14}
          className="shrink-0"
          style={{ color: "var(--color-overlay-1)" }}
        />
      );
  }
}

// ── Overall status badge ───────────────────────────────────────────

function OverallBadge({ status }: { status: CheckStatus }) {
  const color =
    status === "passed"
      ? "var(--color-green)"
      : status === "failed"
        ? "var(--color-red)"
        : status === "running"
          ? "var(--color-blue)"
          : "var(--color-overlay-1)";
  const label = status.toUpperCase();

  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

// ── Expandable error output ────────────────────────────────────────

function ErrorOutput({ check }: { check: VerificationCheck }) {
  const [expanded, setExpanded] = useState(false);

  if (check.status !== "failed") return null;
  const output = [check.stdout, check.stderr].filter(Boolean).join("\n");
  if (!output) return null;

  return (
    <div className="mt-1">
      <button
        className="flex items-center gap-1 text-[10px] transition-colors hover:underline"
        style={{ color: "var(--color-red)" }}
        onClick={() => setExpanded((e) => !e)}
      >
        <ChevronRight
          size={10}
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
        {expanded ? "Hide output" : "Show error output"}
      </button>
      {expanded && (
        <div className="relative mt-1">
          <pre
            className="text-[10px] leading-relaxed p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-red)",
              fontFamily: "var(--font-mono)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            {output}
          </pre>
          <button
            className="absolute top-1 right-1 p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={() => navigator.clipboard.writeText(output)}
            title="Copy output"
          >
            <Copy size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Agent verification row ─────────────────────────────────────────

interface AgentRowProps {
  agentId: string;
  onRunChecks: (agentId: string) => void;
}

function AgentRow({ agentId, onRunChecks }: AgentRowProps) {
  const verif = useVerificationStore((s) => s.agents.get(agentId));
  const [expanded, setExpanded] = useState(true);

  if (!verif) return null;

  const isRunning = verif.overallStatus === "running";

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <ChevronRight
          size={12}
          className="shrink-0 transition-transform"
          style={{
            color: "var(--color-overlay-1)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
        <span
          className="text-xs font-medium flex-1 truncate"
          style={{ color: "var(--color-text)" }}
        >
          {verif.agentName}
        </span>
        <OverallBadge status={verif.overallStatus} />
        <Button
          size="xs"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onRunChecks(agentId);
          }}
          disabled={isRunning}
        >
          {isRunning ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Play size={10} />
          )}
          Run
        </Button>
      </div>

      {/* Expanded check cards */}
      {expanded && (
        <div className="px-3 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {verif.checks.map((check) => (
              <div
                key={check.name}
                className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded"
                style={{ backgroundColor: "var(--color-surface-1)" }}
              >
                <CheckStatusIcon status={check.status} />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  {check.name}
                </span>
                {check.durationMs !== undefined && (
                  <span
                    className="text-[9px]"
                    style={{ color: "var(--color-overlay-1)" }}
                  >
                    {(check.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Show error output for any failed check */}
          {verif.checks
            .filter((c) => c.status === "failed")
            .map((check) => (
              <ErrorOutput key={check.name} check={check} />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────

export function VerificationDashboard() {
  const projectRoot = useLayoutStore((s) => s.projectRootPath);
  const agentsList = useAgentsStore((s) => s.getAgentsList());
  const defaultGates = useMergeQueueStore((s) => s.defaultGates);

  const verifAgents = useVerificationStore((s) => s.agents);
  const initAgent = useVerificationStore((s) => s.initAgent);
  const updateCheck = useVerificationStore((s) => s.updateCheck);
  const setOverallStatus = useVerificationStore((s) => s.setOverallStatus);
  const isRunningAll = useVerificationStore((s) => s.isRunningAll);
  const setRunningAll = useVerificationStore((s) => s.setRunningAll);
  const passCount = useVerificationStore((s) => s.getPassCount());
  const failCount = useVerificationStore((s) => s.getFailCount());
  const totalCount = useVerificationStore((s) => s.getTotalCount());

  // Agents with worktrees
  const agentsWithWorktrees = agentsList.filter(
    (a) => a.worktreePath !== null,
  );

  // Initialize verification entries for agents not yet tracked
  useEffect(() => {
    if (defaultGates.length === 0) return;
    for (const agent of agentsWithWorktrees) {
      if (!verifAgents.has(agent.id) && agent.worktreePath) {
        initAgent(
          agent.id,
          agent.name,
          agent.worktreePath,
          defaultGates,
        );
      }
    }
  }, [agentsWithWorktrees, defaultGates, verifAgents, initAgent]);

  // Run checks for a single agent
  const runChecksForAgent = useCallback(
    async (agentId: string) => {
      const verif = useVerificationStore.getState().agents.get(agentId);
      if (!verif) return;

      setOverallStatus(agentId, "running");

      for (const check of verif.checks) {
        updateCheck(agentId, check.name, { status: "running" });

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
            cwd: verif.worktreePath,
            gateName: check.name,
            command: check.command,
          });

          updateCheck(agentId, check.name, {
            status: result.passed ? "passed" : "failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exit_code,
            durationMs: result.duration_ms,
            lastRunAt: Date.now(),
          });

          if (!result.passed) {
            // Skip remaining checks on failure
            const idx = verif.checks.findIndex((c) => c.name === check.name);
            for (let i = idx + 1; i < verif.checks.length; i++) {
              updateCheck(agentId, verif.checks[i].name, {
                status: "skipped",
              });
            }
            setOverallStatus(agentId, "failed");
            return;
          }
        } catch {
          updateCheck(agentId, check.name, {
            status: "failed",
            stderr: "Command invocation failed",
          });
          setOverallStatus(agentId, "failed");
          return;
        }
      }

      setOverallStatus(agentId, "passed");
    },
    [updateCheck, setOverallStatus],
  );

  // Run all checks for all agents in parallel (per-agent sequential)
  const handleRunAll = useCallback(async () => {
    if (!projectRoot) return;

    // Ensure all agents with worktrees are initialized
    for (const agent of agentsWithWorktrees) {
      if (agent.worktreePath) {
        initAgent(agent.id, agent.name, agent.worktreePath, defaultGates);
      }
    }

    setRunningAll(true);

    const agentIds = agentsWithWorktrees
      .filter((a) => a.worktreePath)
      .map((a) => a.id);

    await Promise.all(agentIds.map((id) => runChecksForAgent(id)));

    setRunningAll(false);
  }, [
    projectRoot,
    agentsWithWorktrees,
    defaultGates,
    initAgent,
    setRunningAll,
    runChecksForAgent,
  ]);

  const pendingCount = totalCount - passCount - failCount;
  const verifAgentIds = [...verifAgents.keys()];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <ShieldCheck size={14} style={{ color: "var(--color-mauve)" }} />
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: "var(--color-text)" }}
        >
          Verification Dashboard
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={handleRunAll}
          disabled={isRunningAll || agentsWithWorktrees.length === 0}
        >
          {isRunningAll ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Play size={10} />
          )}
          Run All Checks
        </Button>
      </div>

      {/* Summary bar */}
      {totalCount > 0 && (
        <div
          className="flex items-center gap-3 px-3 py-1.5 text-[11px] shrink-0"
          style={{
            borderBottom: "1px solid var(--color-surface-1)",
            color: "var(--color-subtext-0)",
          }}
        >
          <span className="flex items-center gap-1">
            <CheckCircle2 size={10} style={{ color: "var(--color-green)" }} />
            {passCount} passed
          </span>
          <span className="flex items-center gap-1">
            <XCircle size={10} style={{ color: "var(--color-red)" }} />
            {failCount} failed
          </span>
          <span className="flex items-center gap-1">
            <Circle size={10} style={{ color: "var(--color-overlay-1)" }} />
            {pendingCount} pending
          </span>
          <span
            className="ml-auto"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {totalCount} agent{totalCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Agent rows */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {verifAgentIds.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--color-surface-0)" }}
            >
              <ShieldCheck
                size={18}
                style={{ color: "var(--color-overlay-0)" }}
              />
            </div>
            <span
              className="text-xs text-center"
              style={{ color: "var(--color-overlay-0)" }}
            >
              {agentsWithWorktrees.length === 0
                ? "No agents with worktrees to verify."
                : "Click 'Run All Checks' to start verification."}
            </span>
            {agentsWithWorktrees.length === 0 && (
              <span
                className="text-[10px] text-center"
                style={{ color: "var(--color-overlay-1)" }}
              >
                Agents need assigned worktrees before quality checks can run.
              </span>
            )}
          </div>
        )}

        {verifAgentIds.map((agentId) => (
          <AgentRow
            key={agentId}
            agentId={agentId}
            onRunChecks={runChecksForAgent}
          />
        ))}
      </div>
    </div>
  );
}
