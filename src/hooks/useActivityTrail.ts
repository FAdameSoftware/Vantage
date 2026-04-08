import { useMemo } from "react";
import { useConversationStore } from "@/stores/conversation";
import type { ConversationMessage, ToolCall } from "@/stores/conversation";
import { normalizePath as normalizeSlashes, basename as pathBasename } from "@/lib/paths";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityAction = "Read" | "Edit" | "Write" | "Bash" | "Grep" | "Glob" | "MultiEdit";

export interface ActivityEntry {
  /** Unique ID for this entry */
  id: string;
  /** File path (normalized to forward slashes) */
  path: string;
  /** Just the filename */
  filename: string;
  /** What action was performed */
  action: ActivityAction;
  /** Timestamp of the action */
  timestamp: number;
  /** Whether a diff is potentially available (Write/Edit actions) */
  hasDiff: boolean;
  /** The tool call ID this came from */
  toolCallId: string;
}

// ─── Action color map ───────────────────────────────────────────────────────

export const ACTION_COLORS: Record<ActivityAction, string> = {
  Read: "var(--color-blue)",
  Edit: "var(--color-yellow)",
  Write: "var(--color-green)",
  MultiEdit: "var(--color-yellow)",
  Bash: "var(--color-mauve)",
  Grep: "var(--color-teal)",
  Glob: "var(--color-teal)",
};

// ─── Extract file path from tool call ───────────────────────────────────────

function extractFilePath(toolCall: ToolCall): string | null {
  const input = toolCall.input;

  switch (toolCall.name) {
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
      return String(input.file_path ?? input.path ?? "");

    case "Bash": {
      // Try to extract file paths from common bash patterns
      const command = String(input.command ?? "");
      // Patterns like: cat file, vim file, code file, etc.
      // We don't try to be exhaustive — just show the command itself
      // Bash entries show the command, not a file path
      return command.length > 60 ? command.slice(0, 57) + "..." : command;
    }

    case "Grep": {
      const pattern = String(input.pattern ?? "");
      const path = input.path ? String(input.path) : "";
      return path || `grep: ${pattern}`;
    }

    case "Glob": {
      const pattern = String(input.pattern ?? "");
      return `glob: ${pattern}`;
    }

    default:
      return null;
  }
}

/**
 * Normalize a file path for display: use forward slashes, strip common prefixes.
 */
function normalizePath(rawPath: string): string {
  return normalizeSlashes(rawPath);
}

/**
 * Extract just the filename from a path.
 */
function getFilename(path: string): string {
  return pathBasename(path);
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const TRACKABLE_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "Grep",
  "Glob",
]);

const selectMessages = (s: { messages: ConversationMessage[] }) => s.messages;

export function useActivityTrail(): ActivityEntry[] {
  const messages = useConversationStore(selectMessages);

  const entries = useMemo(() => {
    const result: ActivityEntry[] = [];
    const seen = new Set<string>(); // track unique path+action combos for dedup

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const toolCall of message.toolCalls) {
        if (!TRACKABLE_TOOLS.has(toolCall.name)) continue;

        const rawPath = extractFilePath(toolCall);
        if (!rawPath) continue;

        const path = normalizePath(rawPath);
        const action = toolCall.name as ActivityAction;
        const dedupKey = `${action}:${path}`;

        // For Read, deduplicate. For Write/Edit, always show (multiple edits matter).
        if (action === "Read" || action === "Grep" || action === "Glob") {
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
        }

        result.push({
          id: toolCall.id,
          path,
          filename: getFilename(path),
          action,
          timestamp: message.timestamp,
          hasDiff: action === "Edit" || action === "Write" || action === "MultiEdit",
          toolCallId: toolCall.id,
        });
      }
    }

    return result;
  }, [messages]);

  return entries;
}
