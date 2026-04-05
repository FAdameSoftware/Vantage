import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/agents/AgentCard";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { WriterReviewerLauncher } from "@/components/agents/WriterReviewerLauncher";
import { useAgentsStore, type Agent, type KanbanColumn } from "@/stores/agents";

// ── Column config ────────────────────────────────────────────────────

const COLUMNS: { id: KanbanColumn; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

// ── Droppable column ─────────────────────────────────────────────────

interface KanbanColumnProps {
  columnId: KanbanColumn;
  label: string;
  agents: Agent[];
  agentIds: string[];
}

function KanbanColumnView({
  columnId,
  label,
  agents,
  agentIds,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-0.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {label}
        </span>
        <span
          className="text-[10px] rounded-full px-1.5 py-0.5 font-medium"
          style={{
            backgroundColor: "var(--color-surface-1)",
            color: "var(--color-overlay-1)",
          }}
        >
          {agents.length}
        </span>
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-1.5 min-h-12 rounded-md p-1 transition-colors"
        style={{
          backgroundColor: isOver
            ? "var(--color-surface-0)"
            : "transparent",
          border: isOver
            ? "1px dashed var(--color-overlay-0)"
            : "1px dashed transparent",
        }}
      >
        <SortableContext
          items={agentIds}
          strategy={verticalListSortingStrategy}
        >
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

// ── Kanban board ─────────────────────────────────────────────────────

export function KanbanBoard() {
  const agents = useAgentsStore((s) => s.agents);
  const columnOrder = useAgentsStore((s) => s.columnOrder);
  const moveAgent = useAgentsStore((s) => s.moveAgent);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveAgentId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveAgentId(null);

    if (!over) return;

    const agentId = String(active.id);
    const overId = String(over.id);

    // Determine the target column — either the column itself or an agent within it
    let targetColumn: KanbanColumn | null = null;

    // Check if dropped directly on a column droppable
    if (COLUMNS.some((c) => c.id === overId)) {
      targetColumn = overId as KanbanColumn;
    } else {
      // Find which column the target agent belongs to
      for (const col of COLUMNS) {
        if (columnOrder[col.id].includes(overId)) {
          targetColumn = col.id;
          break;
        }
      }
    }

    if (!targetColumn) return;

    const agent = agents.get(agentId);
    if (!agent) return;

    // Compute drop index
    if (targetColumn !== agent.column || overId !== agentId) {
      const targetIds = columnOrder[targetColumn];
      const overIndex = targetIds.indexOf(overId);
      const toIndex = overIndex >= 0 ? overIndex : undefined;
      moveAgent(agentId, targetColumn, toIndex);
    }
  }

  const activeAgent = activeAgentId ? agents.get(activeAgentId) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <span
          className="text-xs"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {agents.size} agent{agents.size !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <WriterReviewerLauncher />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setDialogOpen(true)}
            className="gap-1"
          >
            <Plus size={12} />
            Create Agent
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-y-auto p-3">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-4">
            {COLUMNS.map((col) => {
              const agentIds = columnOrder[col.id];
              const colAgents = agentIds
                .map((id) => agents.get(id))
                .filter((a): a is Agent => a !== undefined);
              return (
                <KanbanColumnView
                  key={col.id}
                  columnId={col.id}
                  label={col.label}
                  agents={colAgents}
                  agentIds={agentIds}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeAgent ? <AgentCard agent={activeAgent} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <CreateAgentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
