import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Circle,
  FileText,
} from "lucide-react";
import type { Agent, AgentStatus } from "@/stores/agents";

// ── Status icon ──────────────────────────────────────────────────────

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

// ── Agent card ───────────────────────────────────────────────────────

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const truncatedTask =
    agent.taskDescription.length > 80
      ? agent.taskDescription.slice(0, 80) + "…"
      : agent.taskDescription;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="rounded-md px-2.5 py-2 cursor-grab active:cursor-grabbing select-none"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {/* Header row: color dot + name + status icon */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: agent.color }}
        />
        <span
          className="flex-1 text-xs font-medium truncate"
          style={{ color: "var(--color-text)" }}
        >
          {agent.name}
        </span>
        <StatusIcon status={agent.status} />
      </div>

      {/* Task description */}
      {truncatedTask && (
        <p
          className="text-xs leading-relaxed mb-1.5"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {truncatedTask}
        </p>
      )}

      {/* Footer row: file count + cost */}
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 text-[10px]"
          style={{ color: "var(--color-overlay-1)" }}
        >
          <FileText size={10} />
          {agent.assignedFiles.length}
        </span>
        <span
          className="text-[10px] ml-auto"
          style={{ color: "var(--color-overlay-1)" }}
        >
          ${agent.cost.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
