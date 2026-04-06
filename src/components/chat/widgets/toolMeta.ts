import {
  FileText,
  Pencil,
  Terminal,
  Search,
  FolderOpen,
  Bot,
  FilePlus,
  ListTodo,
  MessageSquare,
} from "lucide-react";
import type { ToolMeta } from "./types";

// ─── Per-tool metadata registry ─────────────────────────────────────────────

export const toolMeta: Record<string, ToolMeta> = {
  Read: { icon: FileText, color: "var(--color-blue)", label: "Read" },
  Write: { icon: FilePlus, color: "var(--color-green)", label: "Write" },
  Edit: { icon: Pencil, color: "var(--color-yellow)", label: "Edit" },
  Bash: { icon: Terminal, color: "var(--color-red)", label: "Bash" },
  Grep: { icon: Search, color: "var(--color-green)", label: "Grep" },
  Glob: { icon: FolderOpen, color: "var(--color-teal)", label: "Glob" },
  Agent: { icon: Bot, color: "var(--color-mauve)", label: "Agent" },
  TodoWrite: { icon: ListTodo, color: "var(--color-lavender)", label: "Tasks" },
  Task: { icon: ListTodo, color: "var(--color-lavender)", label: "Task" },
  SendMessage: { icon: MessageSquare, color: "var(--color-mauve)", label: "Send Message" },
};

export function getToolMeta(name: string): ToolMeta {
  return toolMeta[name] ?? { icon: Bot, color: "var(--color-overlay-1)", label: name };
}
