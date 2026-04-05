import { invoke } from "@tauri-apps/api/core";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useUsageStore } from "@/stores/usage";

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
  const bare = command.trim().split(/\s+/)[0].toLowerCase();

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
      // Export all conversation messages to a markdown string and trigger a
      // browser download (works in both Tauri WebView and plain browser).
      const { messages } = useConversationStore.getState();
      if (messages.length === 0) {
        return true; // nothing to export
      }

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
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      anchor.href = url;
      anchor.download = `conversation-${ts}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      return true;
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
