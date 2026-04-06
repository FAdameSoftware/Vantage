import { ListTodo, Circle, Loader2, CheckCircle2 } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority?: "high" | "medium" | "low";
}

// ─── Parse todo items from tool call input/output ─────────────────────────

function parseTodos(toolCall: ToolCall): TodoItem[] {
  const { input, output } = toolCall;
  const items: TodoItem[] = [];

  // Case 1: input has a `todos` array
  if (Array.isArray(input.todos)) {
    for (const t of input.todos) {
      if (t && typeof t === "object") {
        const todo = t as Record<string, unknown>;
        items.push({
          content: String(todo.content ?? todo.task ?? todo.text ?? todo.description ?? ""),
          status: normalizeStatus(todo.status),
          priority: normalizePriority(todo.priority),
        });
      }
    }
    return items;
  }

  // Case 2: input has a single task
  if (input.task || input.content || input.text) {
    items.push({
      content: String(input.task ?? input.content ?? input.text ?? ""),
      status: normalizeStatus(input.status),
      priority: normalizePriority(input.priority),
    });
    return items;
  }

  // Case 3: try parsing output as JSON
  if (output) {
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (t && typeof t === "object") {
            items.push({
              content: String(t.content ?? t.task ?? t.text ?? t.description ?? ""),
              status: normalizeStatus(t.status),
              priority: normalizePriority(t.priority),
            });
          }
        }
        return items;
      }
      if (parsed && typeof parsed === "object" && (parsed.content || parsed.task)) {
        items.push({
          content: String(parsed.content ?? parsed.task ?? ""),
          status: normalizeStatus(parsed.status),
          priority: normalizePriority(parsed.priority),
        });
        return items;
      }
    } catch {
      // Not JSON, treat as plain text items
      const lines = output.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        items.push({ content: line, status: "pending" });
      }
      return items;
    }
  }

  return items;
}

function normalizeStatus(status: unknown): TodoItem["status"] {
  const s = String(status ?? "pending").toLowerCase();
  if (s === "completed" || s === "done" || s === "complete" || s === "finished") return "completed";
  if (s === "in_progress" || s === "in-progress" || s === "working" || s === "active" || s === "started") return "in_progress";
  return "pending";
}

function normalizePriority(priority: unknown): TodoItem["priority"] | undefined {
  if (!priority) return undefined;
  const p = String(priority).toLowerCase();
  if (p === "high" || p === "critical" || p === "urgent") return "high";
  if (p === "medium" || p === "normal") return "medium";
  if (p === "low" || p === "minor") return "low";
  return undefined;
}

// ─── Priority badge ────────────────────────────────────────────────────────

const priorityStyles: Record<string, { bg: string; color: string }> = {
  high: { bg: "rgba(243, 139, 168, 0.15)", color: "var(--color-red)" },
  medium: { bg: "rgba(249, 226, 175, 0.15)", color: "var(--color-yellow)" },
  low: { bg: "rgba(166, 227, 161, 0.15)", color: "var(--color-green)" },
};

function PriorityBadge({ priority }: { priority: string }) {
  const style = priorityStyles[priority] ?? priorityStyles.medium;
  return (
    <span
      className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase flex-shrink-0"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {priority}
    </span>
  );
}

// ─── Status icon ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: TodoItem["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={13} style={{ color: "var(--color-green)" }} className="flex-shrink-0" />;
    case "in_progress":
      return <Loader2 size={13} style={{ color: "var(--color-blue)" }} className="flex-shrink-0 animate-spin" />;
    default:
      return <Circle size={13} style={{ color: "var(--color-overlay-1)" }} className="flex-shrink-0" />;
  }
}

// ─── Compact header ────────────────────────────────────────────────────────

function TodoCompactHeader({ todos }: { todos: TodoItem[] }) {
  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <ListTodo size={13} style={{ color: "var(--color-lavender)" }} className="flex-shrink-0" />
      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text)" }}>
        Tasks
      </span>
      {total > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: completed === total ? "rgba(166, 227, 161, 0.15)" : "rgba(137, 180, 250, 0.15)",
            color: completed === total ? "var(--color-green)" : "var(--color-blue)",
          }}
        >
          {completed}/{total}
        </span>
      )}
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function TodoExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const todos = parseTodos(toolCall);

  if (todos.length === 0) {
    return (
      <div className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
        No tasks found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {todos.map((todo, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
          style={{
            backgroundColor: todo.status === "completed" ? "rgba(166, 227, 161, 0.05)" : "transparent",
          }}
        >
          <StatusIcon status={todo.status} />
          <span
            className="flex-1 min-w-0 truncate"
            style={{
              color: todo.status === "completed" ? "var(--color-overlay-1)" : "var(--color-text)",
              textDecoration: todo.status === "completed" ? "line-through" : "none",
            }}
          >
            {todo.content}
          </span>
          {todo.priority && <PriorityBadge priority={todo.priority} />}
        </div>
      ))}
    </div>
  );
}

// ─── TodoWidget ────────────────────────────────────────────────────────────

export function TodoWidget({ toolCall, forceExpanded }: WidgetProps) {
  const todos = parseTodos(toolCall);
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<TodoCompactHeader todos={todos} />}
    >
      <TodoExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
