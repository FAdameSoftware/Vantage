/**
 * Pure utility functions shared across the useClaude sub-hooks.
 * No React hooks — only stateless helpers and side-effect functions
 * that operate on store snapshots.
 */

import { invoke } from "@tauri-apps/api/core";
import { useAgentsStore } from "@/stores/agents";
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import type {
  ContentBlockStartBlock,
  AssistantMessage,
  StreamEventMessage,
} from "@/lib/protocol";
import type { ActiveBlock } from "@/stores/conversation";
import type { AgentConversationState } from "@/stores/agentConversations";

// ─── Helper: generate a simple unique ID ─────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Helper: route an event to the correct agent (if any) ───────────────────

export function routeAgentEvent(
  sessionId: string | undefined,
  handler: (agentId: string) => void,
): boolean {
  if (!sessionId) return false;
  const agent = useAgentsStore.getState().getAgentBySessionId(sessionId);
  if (agent) {
    handler(agent.id);
    return true;
  }
  return false;
}

// ─── Helper: apply a stream event to an AgentConversationState snapshot ─────

export function applyStreamEventToSnapshot(
  prev: AgentConversationState,
  msg: StreamEventMessage,
  sessionModel: string | undefined,
): Partial<AgentConversationState> {
  const event = msg.event;

  switch (event.type) {
    case "message_start": {
      return {
        isStreaming: true,
        activeBlocks: new Map(),
        activeMessageId: event.message.id,
        connectionStatus: "streaming",
      };
    }

    case "content_block_start": {
      const block = event.content_block as ContentBlockStartBlock;
      const newBlock: ActiveBlock = {
        index: event.index,
        type: block.type as "text" | "thinking" | "tool_use",
        text:
          block.type === "text"
            ? block.text
            : block.type === "thinking"
              ? block.thinking
              : "",
        toolUseId: block.type === "tool_use" ? block.id : undefined,
        toolName: block.type === "tool_use" ? block.name : undefined,
        inputJson: "",
        isComplete: false,
      };
      const isThinking = block.type === "thinking";
      const nextBlocks = new Map(prev.activeBlocks);
      nextBlocks.set(event.index, newBlock);
      return {
        activeBlocks: nextBlocks,
        isThinking: isThinking ? true : prev.isThinking,
        thinkingStartedAt: isThinking
          ? (prev.thinkingStartedAt ?? Date.now())
          : prev.thinkingStartedAt,
      };
    }

    case "content_block_delta": {
      const { index, delta } = event;
      const existing = prev.activeBlocks.get(index);
      if (!existing) return {};
      const updated: ActiveBlock = { ...existing };
      if (delta.type === "text_delta") {
        updated.text += delta.text;
      } else if (delta.type === "thinking_delta") {
        updated.text += delta.thinking;
      } else if (delta.type === "input_json_delta") {
        updated.inputJson += delta.partial_json;
      }
      const nextBlocks = new Map(prev.activeBlocks);
      nextBlocks.set(index, updated);
      return { activeBlocks: nextBlocks };
    }

    case "content_block_stop": {
      const { index } = event;
      const existing = prev.activeBlocks.get(index);
      if (!existing) return {};
      const updated: ActiveBlock = { ...existing, isComplete: true };
      const nextBlocks = new Map(prev.activeBlocks);
      nextBlocks.set(index, updated);
      const isThinkingEnding = existing.type === "thinking";
      return {
        activeBlocks: nextBlocks,
        isThinking: isThinkingEnding ? false : prev.isThinking,
        thinkingStartedAt: isThinkingEnding ? null : prev.thinkingStartedAt,
      };
    }

    case "message_delta": {
      return {};
    }

    case "message_stop": {
      const assembled = assembleMessageFromBlocks(
        prev.activeMessageId ?? generateId(),
        prev.activeBlocks,
        sessionModel,
        msg.parent_tool_use_id ?? null,
        undefined,
      );
      return {
        messages: [...prev.messages, assembled],
        isStreaming: false,
        isThinking: false,
        thinkingStartedAt: null,
        activeBlocks: new Map(),
        activeMessageId: null,
        connectionStatus: "ready",
      };
    }

    default:
      return {};
  }
}

// ─── Helper: assemble activeBlocks into a ConversationMessage ────────────────

export function assembleMessageFromBlocks(
  messageId: string,
  activeBlocks: Map<number, ActiveBlock>,
  model: string | undefined,
  parentToolUseId: string | null,
  stopReason: string | undefined,
) {
  const sortedBlocks = [...activeBlocks.values()].sort(
    (a, b) => a.index - b.index,
  );
  let text = "";
  let thinking = "";
  const toolCalls: import("@/stores/conversation").ToolCall[] = [];

  for (const block of sortedBlocks) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "thinking") {
      thinking += block.text;
    } else if (block.type === "tool_use") {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(block.inputJson || "{}") as Record<string, unknown>;
      } catch {
        // leave as empty object if JSON is malformed
      }
      toolCalls.push({
        id: block.toolUseId ?? generateId(),
        name: block.toolName ?? "",
        input,
        inputJson: block.inputJson,
        isExecuting: false,
      });
    }
  }

  return {
    id: messageId,
    role: "assistant" as const,
    text,
    thinking,
    toolCalls,
    model,
    timestamp: Date.now(),
    parentToolUseId,
    stopReason,
  };
}

// ─── Helper: extract a ConversationMessage from an AssistantMessage ──────────

export function extractFromAssistantMsg(msg: AssistantMessage) {
  let text = "";
  let thinking = "";
  const toolCalls: import("@/stores/conversation").ToolCall[] = [];
  const toolResults: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = [];

  for (const block of msg.message.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "thinking") {
      thinking += block.thinking;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input,
        inputJson: JSON.stringify(block.input),
        isExecuting: false,
      });
    } else if (block.type === "tool_result") {
      toolResults.push({
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      });
    }
  }

  // Attach tool_result output to matching tool_use entries
  for (const result of toolResults) {
    const matchingCall = toolCalls.find((tc) => tc.id === result.tool_use_id);
    if (matchingCall) {
      matchingCall.output = result.content;
      matchingCall.isError = result.is_error ?? false;
    }
  }

  return {
    id: msg.message.id,
    role: "assistant" as const,
    text,
    thinking,
    toolCalls,
    model: msg.message.model,
    usage: msg.message.usage,
    timestamp: Date.now(),
    parentToolUseId: msg.parent_tool_use_id,
    stopReason: msg.message.stop_reason,
  };
}

// ─── Diff capture: pending diff timeouts ─────────────────────────────────────

// Track active diff capture timeouts so they can be cancelled on cleanup
// or when a new capture supersedes an old one for the same file.
const pendingDiffTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function cancelAllDiffTimeouts() {
  for (const timer of pendingDiffTimeouts.values()) {
    clearTimeout(timer);
  }
  pendingDiffTimeouts.clear();
}

export function capturePendingDiffs(assistantMsg: AssistantMessage) {
  const editorStore = useEditorStore.getState();
  for (const block of assistantMsg.message.content) {
    if (block.type !== "tool_use") continue;
    const toolName = block.name;
    if (toolName !== "Edit" && toolName !== "Write") continue;

    const input = block.input as Record<string, unknown>;
    const filePath = (input.file_path ?? input.path ?? "") as string;
    if (!filePath) continue;

    // Normalize path to match editor tab IDs
    let normalizedPath = filePath.replace(/\\/g, "/");
    if (/^[A-Z]:\//.test(normalizedPath)) {
      normalizedPath = normalizedPath[0].toLowerCase() + normalizedPath.slice(1);
    }

    // Snapshot the current content as "before" from the editor store
    const tab = editorStore.tabs.find((t) => t.id === normalizedPath);
    const beforeContent = tab?.content ?? tab?.savedContent ?? "";

    // Cancel any previous pending capture for the same file (debounce per-file)
    const existing = pendingDiffTimeouts.get(normalizedPath);
    if (existing) {
      clearTimeout(existing);
    }

    // Read the file after the tool has executed to get "after" content.
    // We use invoke("read_file") with a small delay to let the write complete.
    const capturedPath = normalizedPath;
    const timer = setTimeout(async () => {
      pendingDiffTimeouts.delete(capturedPath);
      try {
        const result = await invoke<{ content: string }>("read_file", {
          path: filePath,
        });
        const afterContent = result.content;
        if (afterContent !== beforeContent) {
          useEditorStore.getState().setPendingDiff(
            capturedPath,
            beforeContent,
            afterContent,
            `Claude ${toolName}: ${filePath.split("/").pop() ?? filePath}`,
          );
        }
      } catch {
        // File read failed — skip diff capture
      }
    }, 500);
    pendingDiffTimeouts.set(normalizedPath, timer);
  }
}

// ─── View Integration: IDE reacts to Claude tool actions ────────────────────

/** Map file extensions to Monaco language IDs */
export function guessLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    rs: "rust",
    py: "python",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    sh: "shellscript",
    bash: "shellscript",
    sql: "sql",
    graphql: "graphql",
    svg: "xml",
    xml: "xml",
  };
  return langMap[ext] ?? "plaintext";
}

/**
 * React to Claude's tool calls by opening background editor tabs and
 * flashing the terminal indicator. Called after an assistant message is
 * received with tool_use blocks.
 */
export function handleViewIntegration(assistantMsg: AssistantMessage) {
  const editorStore = useEditorStore.getState();
  const layoutStore = useLayoutStore.getState();

  for (const block of assistantMsg.message.content) {
    if (block.type !== "tool_use") continue;
    const toolName = block.name;
    const input = block.input as Record<string, unknown>;

    if (toolName === "Read" || toolName === "Edit" || toolName === "Write") {
      const filePath = (input.file_path ?? input.path ?? "") as string;
      if (!filePath) continue;

      const fileName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? filePath;
      const language = guessLanguage(filePath);

      // Open a background tab (doesn't switch focus or view mode)
      editorStore.revealFile(filePath, fileName, language);

      // For Edit/Write, also mark the tab as modified by Claude
      if (toolName === "Edit" || toolName === "Write") {
        let normalizedPath = filePath.replace(/\\/g, "/");
        if (/^[A-Z]:\//.test(normalizedPath)) {
          normalizedPath = normalizedPath[0].toLowerCase() + normalizedPath.slice(1);
        }
        editorStore.markClaudeModified(normalizedPath);
      }
    } else if (toolName === "Bash") {
      // Flash the terminal panel tab to indicate bash activity
      layoutStore.setFlashPanelTab("terminal");
    }
  }
}
