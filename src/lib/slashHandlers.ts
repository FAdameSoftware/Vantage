import { invoke } from "@tauri-apps/api/core";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useUsageStore } from "@/stores/usage";

// ── Export helpers ─────────────────────────────────────────────────────────

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Export conversation as markdown and trigger download.
 */
export function exportAsMarkdown(): boolean {
  const { messages } = useConversationStore.getState();
  if (messages.length === 0) return true;

  const lines: string[] = ["# Conversation Export\n"];
  for (const msg of messages) {
    const heading = msg.role === "user" ? "## User" : "## Assistant";
    lines.push(heading);
    if (msg.text) {
      lines.push(msg.text);
    }
    for (const tc of msg.toolCalls) {
      lines.push(`\n**Tool:** \`${tc.name}\``);
      lines.push("```json");
      lines.push(tc.inputJson);
      lines.push("```");
      if (tc.output) {
        lines.push("**Output:**");
        lines.push("```");
        lines.push(tc.output);
        lines.push("```");
      }
    }
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  triggerDownload(blob, `conversation-${getTimestamp()}.md`);
  return true;
}

/**
 * Export conversation as JSON (for reimporting).
 */
export function exportAsJson(): boolean {
  const { messages, session, totalCost, totalTokens } = useConversationStore.getState();
  if (messages.length === 0) return true;

  const exportData = {
    exportedAt: new Date().toISOString(),
    session: session ? {
      sessionId: session.sessionId,
      model: session.model,
      cwd: session.cwd,
    } : null,
    totalCost,
    totalTokens,
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      text: msg.text,
      thinking: msg.thinking || undefined,
      toolCalls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: tc.input,
        output: tc.output,
        isError: tc.isError,
      })),
      model: msg.model,
      usage: msg.usage,
      timestamp: msg.timestamp,
      stopReason: msg.stopReason,
    })),
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  triggerDownload(blob, `conversation-${getTimestamp()}.json`);
  return true;
}

/**
 * Export conversation as styled HTML.
 */
export function exportAsHtml(): boolean {
  const { messages, session, totalCost } = useConversationStore.getState();
  if (messages.length === 0) return true;

  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const messageHtml = messages.map((msg) => {
    const isUser = msg.role === "user";
    const roleClass = isUser ? "user" : "assistant";
    const roleLabel = isUser ? "You" : "Claude";
    const time = new Date(msg.timestamp).toLocaleTimeString();
    const textHtml = escapeHtml(msg.text).replace(/\n/g, "<br>");

    let toolsHtml = "";
    if (msg.toolCalls.length > 0) {
      toolsHtml = msg.toolCalls.map((tc) =>
        `<div class="tool"><strong>Tool: ${escapeHtml(tc.name)}</strong>` +
        (tc.output ? `<pre>${escapeHtml(tc.output.slice(0, 500))}${tc.output.length > 500 ? "\n... (truncated)" : ""}</pre>` : "") +
        `</div>`
      ).join("\n");
    }

    return `<div class="message ${roleClass}">
      <div class="role">${roleLabel} <span class="time">${time}</span></div>
      <div class="text">${textHtml}</div>
      ${toolsHtml}
    </div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Conversation Export</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #1e1e2e; color: #cdd6f4; }
  h1 { color: #89b4fa; border-bottom: 1px solid #313244; padding-bottom: 10px; }
  .meta { color: #6c7086; font-size: 13px; margin-bottom: 20px; }
  .message { margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; }
  .message.user { background: #313244; margin-left: 40px; }
  .message.assistant { background: #181825; border-left: 3px solid #89b4fa; }
  .role { font-weight: 600; font-size: 12px; color: #a6adc8; margin-bottom: 4px; }
  .time { font-weight: normal; color: #585b70; margin-left: 8px; }
  .text { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .tool { margin-top: 8px; padding: 8px; background: #11111b; border-radius: 4px; font-size: 12px; }
  .tool pre { margin: 4px 0 0; padding: 8px; background: #1e1e2e; border-radius: 4px; overflow-x: auto; font-size: 11px; }
</style>
</head>
<body>
<h1>Conversation Export</h1>
<div class="meta">
  ${session?.model ? `Model: ${session.model}` : ""}
  ${totalCost > 0 ? ` | Cost: $${totalCost.toFixed(4)}` : ""}
  | Exported: ${new Date().toLocaleString()}
</div>
${messageHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  triggerDownload(blob, `conversation-${getTimestamp()}.html`);
  return true;
}

/**
 * Available export formats for the export menu.
 */
export const EXPORT_FORMATS = [
  { id: "markdown", label: "Markdown (.md)", handler: exportAsMarkdown },
  { id: "json", label: "JSON (.json)", handler: exportAsJson },
  { id: "html", label: "HTML (.html)", handler: exportAsHtml },
] as const;

/**
 * Attempt to handle a slash command locally (without forwarding to Claude CLI).
 *
 * @returns `true` when the command was handled locally and must NOT be sent to
 *          Claude; `false` when it should be forwarded as-is.
 */
export function handleSlashCommand(
  command: string,
  sendMessage: (msg: string) => void,
): boolean {
  // Strip trailing whitespace and any arguments after the command word.
  const parts = command.trim().split(/\s+/);
  const bare = parts[0].toLowerCase();

  switch (bare) {
    // ── Locally-handled commands ────────────────────────────────────────────

    case "/clear": {
      useConversationStore.getState().clearConversation();
      return true;
    }

    case "/usage": {
      // Open the secondary sidebar which hosts the analytics / usage panel.
      const layout = useLayoutStore.getState();
      if (!layout.secondarySidebarVisible) {
        layout.toggleSecondarySidebar();
      }
      return true;
    }

    case "/tasks": {
      // Switch the primary sidebar to the agents view.
      useLayoutStore.getState().setActiveActivityBarItem("agents");
      return true;
    }

    case "/diff": {
      // Invoke the Tauri git diff command and send the result as a user
      // message so Claude can display / explain it.
      void (async () => {
        try {
          const diff = await invoke<string>("git_diff_working", {});
          if (diff && diff.trim().length > 0) {
            sendMessage(`Here is the current git working-tree diff:\n\`\`\`diff\n${diff}\n\`\`\``);
          } else {
            sendMessage("No working-tree changes found (`git diff` returned empty).");
          }
        } catch {
          sendMessage("Could not retrieve git diff. Is this a git repository?");
        }
      })();
      return true;
    }

    case "/export": {
      // Check for format argument: /export json, /export html
      const formatArg = parts[1]?.toLowerCase();
      if (formatArg === "json") {
        return exportAsJson();
      } else if (formatArg === "html") {
        return exportAsHtml();
      }
      // Default: export as markdown
      return exportAsMarkdown();
    }

    case "/context": {
      // Summarise context window usage from the usage store.
      const usage = useUsageStore.getState();
      const total = usage.getTotalTokens();
      const formatted = usage.getTokensFormatted();
      sendMessage(
        `**Context window usage**\n` +
        `- Input tokens: ${usage.inputTokens.toLocaleString()}\n` +
        `- Output tokens: ${usage.outputTokens.toLocaleString()}\n` +
        `- Cache creation: ${usage.cacheCreationTokens.toLocaleString()}\n` +
        `- Cache read: ${usage.cacheReadTokens.toLocaleString()}\n` +
        `- Total tokens this session: ${total.toLocaleString()} (${formatted})\n` +
        `- Turns completed: ${usage.turnCount}\n` +
        `- Session duration: ${usage.getSessionDurationFormatted()}`,
      );
      return true;
    }

    // ── Commands forwarded to Claude CLI ────────────────────────────────────

    // /fast, /branch, /model, /rewind are forwarded as CLI slash commands.
    default:
      sendMessage(command.trim());
      return false;
  }
}
