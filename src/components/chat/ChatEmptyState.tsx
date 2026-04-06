import { MessageSquare, Sparkles, Bug, Blocks, TestTube2 } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import type { ConversationState } from "@/stores/conversation";

const selectConnectionStatus = (s: ConversationState) => s.connectionStatus;

interface QuickAction {
  icon: typeof Sparkles;
  label: string;
  prompt: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Sparkles,
    label: "Explain this codebase",
    prompt: "Give me a high-level overview of this codebase — its architecture, key modules, and how they fit together.",
    color: "var(--color-mauve)",
  },
  {
    icon: Bug,
    label: "Find and fix bugs",
    prompt: "Look through the codebase for potential bugs, edge cases, or error-handling issues and suggest fixes.",
    color: "var(--color-red)",
  },
  {
    icon: Blocks,
    label: "Add a feature",
    prompt: "I'd like to add a new feature. Let me describe what I need and you can help me plan and implement it.",
    color: "var(--color-blue)",
  },
  {
    icon: TestTube2,
    label: "Write tests",
    prompt: "Analyze the codebase and write tests for the areas with the least coverage. Focus on critical paths first.",
    color: "var(--color-green)",
  },
];

export interface ChatEmptyStateProps {
  mode: "full" | "sidebar";
  onSendMessage: (text: string) => void;
}

export function ChatEmptyState({ mode, onSendMessage }: ChatEmptyStateProps) {
  const connectionStatus = useConversationStore(selectConnectionStatus);
  const isDisconnected =
    connectionStatus === "disconnected" || connectionStatus === "stopped";

  return (
    <div
      className={`h-full overflow-y-auto scrollbar-thin ${mode === "full" ? "flex justify-center px-6 py-5" : "p-4"}`}
      aria-live="polite"
      aria-atomic="false"
    >
      <div className={mode === "full" ? "w-full max-w-4xl chat-full-mode" : "w-full"}>
        <div className="flex flex-col items-center justify-center h-full gap-5">
          {/* Branded icon */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "var(--color-surface-0)",
              boxShadow: "0 0 0 1px var(--color-surface-1)",
            }}
          >
            <MessageSquare
              size={28}
              style={{ color: "var(--color-mauve)" }}
            />
          </div>

          {/* Heading */}
          <div className="text-center space-y-1.5">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Start a conversation with Claude Code
            </h2>
            <p
              className="text-xs max-w-64"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {isDisconnected
                ? "Type a message below to start a new session."
                : "Ask Claude anything about your codebase."}
            </p>
          </div>

          {/* Quick-action suggestion pills */}
          <div className="flex flex-wrap justify-center gap-2 max-w-sm">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  backgroundColor: "var(--color-surface-0)",
                  color: "var(--color-subtext-0)",
                  border: "1px solid var(--color-surface-1)",
                }}
                onClick={() => onSendMessage(action.prompt)}
                onMouseEnter={(e) => {
                  (e.currentTarget.style.borderColor as string) = action.color;
                  e.currentTarget.style.color = action.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-surface-1)";
                  e.currentTarget.style.color = "var(--color-subtext-0)";
                }}
              >
                <action.icon size={12} />
                {action.label}
              </button>
            ))}
          </div>

          {/* Keyboard shortcut hints */}
          <div
            className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px]"
            style={{ color: "var(--color-overlay-0)" }}
          >
            <span>
              <kbd className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: "var(--color-surface-0)", border: "1px solid var(--color-surface-1)" }}>Ctrl+Shift+P</kbd>{" "}
              Command palette
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: "var(--color-surface-0)", border: "1px solid var(--color-surface-1)" }}>@</kbd>{" "}
              Mention files
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded text-[9px] font-mono" style={{ backgroundColor: "var(--color-surface-0)", border: "1px solid var(--color-surface-1)" }}>/</kbd>{" "}
              Slash commands
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
