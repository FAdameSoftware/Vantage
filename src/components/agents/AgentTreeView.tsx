import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Circle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentsStore, type Agent, type AgentRole, type AgentStatus } from "@/stores/agents";

// ── Status icon (reused from AgentCard) ────────────────────────────

function StatusIcon({ status }: { status: AgentStatus }) {
  switch (status) {
    case "working":
      return (
        <Loader2
          size={12}
          className="animate-spin shrink-0"
          style={{ color: "var(--color-blue)" }}
        />
      );
    case "waiting_permission":
      return (
        <AlertTriangle
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-yellow)" }}
        />
      );
    case "completed":
      return (
        <CheckCircle2
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-green)" }}
        />
      );
    case "error":
      return (
        <XCircle
          size={12}
          className="shrink-0"
          style={{ color: "var(--color-red)" }}
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

// ── Role badge ─────────────────────────────────────────────────────

const ROLE_BADGE: Record<AgentRole, { label: string; color: string }> = {
  coordinator: { label: "COORD", color: "var(--color-mauve)" },
  specialist: { label: "SPEC", color: "var(--color-blue)" },
  verifier: { label: "VER", color: "var(--color-green)" },
  builder: { label: "BUILD", color: "var(--color-subtext-0)" },
};

function RoleBadge({ role }: { role: AgentRole }) {
  const { label, color } = ROLE_BADGE[role];
  return (
    <span
      className="text-[9px] font-semibold tracking-wide px-1 py-0.5 rounded shrink-0"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

// ── Child status propagation ───────────────────────────────────────

type PropagatedStatus = "error" | "warning" | "ok" | "none";

function computePropagatedStatus(
  agent: Agent,
  allAgents: Map<string, Agent>,
): PropagatedStatus {
  if (agent.childIds.length === 0) return "none";

  let hasError = false;
  let hasWarning = false;
  let allCompleted = true;

  for (const childId of agent.childIds) {
    const child = allAgents.get(childId);
    if (!child) continue;

    if (child.status === "error") hasError = true;
    if (child.status === "waiting_permission") hasWarning = true;
    if (child.status !== "completed") allCompleted = false;

    // Also check grandchildren recursively
    const childProp = computePropagatedStatus(child, allAgents);
    if (childProp === "error") hasError = true;
    if (childProp === "warning") hasWarning = true;
  }

  if (hasError) return "error";
  if (hasWarning) return "warning";
  if (allCompleted) return "ok";
  return "none";
}

function PropagatedDot({ status }: { status: PropagatedStatus }) {
  if (status === "none") return null;
  const color =
    status === "error"
      ? "var(--color-red)"
      : status === "warning"
        ? "var(--color-yellow)"
        : "var(--color-green)";
  return (
    <span
      className="size-1.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

// ── Tree node component ────────────────────────────────────────────

interface AgentTreeNodeProps {
  agent: Agent;
  depth: number;
  allAgents: Map<string, Agent>;
  expandedSet: Set<string>;
  onToggle: (id: string) => void;
  onSelectAgent: (id: string) => void;
  compact: boolean;
}

function AgentTreeNode({
  agent,
  depth,
  allAgents,
  expandedSet,
  onToggle,
  onSelectAgent,
  compact,
}: AgentTreeNodeProps) {
  const isExpanded = expandedSet.has(agent.id);
  const hasChildren = agent.childIds.length > 0;
  const propagated = computePropagatedStatus(agent, allAgents);

  const truncatedTask =
    agent.taskDescription.length > 60
      ? agent.taskDescription.slice(0, 60) + "..."
      : agent.taskDescription;

  return (
    <>
      {/* Node row */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-sm cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectAgent(agent.id)}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(agent.id);
            }}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              size={12}
              className="transition-transform"
              style={{
                color: "var(--color-overlay-1)",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {/* Propagated status dot (next to chevron for parents) */}
        {hasChildren && <PropagatedDot status={propagated} />}

        {/* Color dot */}
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: agent.color }}
        />

        {/* Status icon */}
        <StatusIcon status={agent.status} />

        {/* Agent name */}
        <span
          className="text-xs font-medium truncate"
          style={{ color: "var(--color-text)" }}
        >
          {agent.name}
        </span>

        {/* Role badge */}
        <RoleBadge role={agent.role} />

        {/* Cost (right-aligned) */}
        {!compact && (
          <span
            className="text-[10px] ml-auto shrink-0"
            style={{ color: "var(--color-overlay-1)" }}
          >
            ${agent.cost.toFixed(2)}
          </span>
        )}
      </div>

      {/* Task description (expanded mode only) */}
      {!compact && (
        <div
          className="text-[10px] truncate"
          style={{
            paddingLeft: `${depth * 16 + 8 + 20 + 6}px`,
            color: "var(--color-subtext-0)",
          }}
        >
          {truncatedTask}
        </div>
      )}

      {/* Children */}
      {isExpanded &&
        hasChildren &&
        agent.childIds.map((childId) => {
          const child = allAgents.get(childId);
          if (!child) return null;
          return (
            <AgentTreeNode
              key={childId}
              agent={child}
              depth={depth + 1}
              allAgents={allAgents}
              expandedSet={expandedSet}
              onToggle={onToggle}
              onSelectAgent={onSelectAgent}
              compact={compact}
            />
          );
        })}
    </>
  );
}

// ── Tree view container ────────────────────────────────────────────

export function AgentTreeView() {
  const agentsVersion = useAgentsStore((s) => s.agentsVersion);
  const agents = useAgentsStore((s) => s.agents);

  // Derive rootAgents and activeCount via useMemo instead of calling store
  // functions in render (which create new arrays via .filter() each time).
  const rootAgents = useMemo(
    () => [...agents.values()].filter((a) => a.parentId === null),
    [agents, agentsVersion],
  );
  const activeCount = useMemo(
    () =>
      [...agents.values()].filter(
        (a) => a.status === "working" || a.status === "waiting_permission",
      ).length,
    [agents, agentsVersion],
  );

  // Expanded node set -- defaults to all agents expanded
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    const all = new Set<string>();
    for (const id of agents.keys()) all.add(id);
    return all;
  });

  const [compact, setCompact] = useState(false);

  const handleToggle = useCallback((id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedSet(new Set(agents.keys()));
  }, [agents]);

  const handleCollapseAll = useCallback(() => {
    setExpandedSet(new Set());
  }, []);

  // Select agent -- for now, this is a placeholder; in a full implementation
  // it would open the AgentDetailPanel in the secondary sidebar
  const handleSelectAgent = useCallback((_agentId: string) => {
    // TODO: wire to secondary sidebar to open AgentDetailPanel
  }, []);

  // Sort root agents: coordinators first, then by creation date
  const sortedRoots = useMemo(
    () =>
      [...rootAgents].sort((a, b) => {
        if (a.role === "coordinator" && b.role !== "coordinator") return -1;
        if (a.role !== "coordinator" && b.role === "coordinator") return 1;
        return a.createdAt - b.createdAt;
      }),
    [rootAgents],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <span
          className="text-[11px] flex-1"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {agents.size} agent{agents.size !== 1 ? "s" : ""} ({activeCount}{" "}
          active)
        </span>

        <Button
          size="xs"
          variant="ghost"
          onClick={() => setCompact((c) => !c)}
          title={compact ? "Expanded view" : "Compact view"}
        >
          {compact ? <Maximize2 size={10} /> : <Minimize2 size={10} />}
        </Button>

        <Button
          size="xs"
          variant="ghost"
          onClick={handleExpandAll}
          title="Expand all"
        >
          <ChevronRight
            size={10}
            style={{ transform: "rotate(90deg)" }}
          />
        </Button>

        <Button
          size="xs"
          variant="ghost"
          onClick={handleCollapseAll}
          title="Collapse all"
        >
          <ChevronRight size={10} />
        </Button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-1">
        {sortedRoots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <span
              className="text-xs"
              style={{ color: "var(--color-overlay-0)" }}
            >
              No agents created yet
            </span>
          </div>
        ) : (
          sortedRoots.map((agent) => (
            <AgentTreeNode
              key={agent.id}
              agent={agent}
              depth={0}
              allAgents={agents}
              expandedSet={expandedSet}
              onToggle={handleToggle}
              onSelectAgent={handleSelectAgent}
              compact={compact}
            />
          ))
        )}
      </div>
    </div>
  );
}
