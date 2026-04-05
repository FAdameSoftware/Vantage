import { useEffect, useRef, useCallback, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useClaude } from "@/hooks/useClaude";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { SessionSelector } from "./SessionSelector";
import { QuickQuestionOverlay } from "./QuickQuestionOverlay";
import { useQuickQuestionStore } from "@/stores/quickQuestion";
import { CompactDialog } from "./CompactDialog";
import { PlanModeToggle } from "./PlanModeToggle";
import { WriterReviewerLauncher } from "@/components/agents/WriterReviewerLauncher";

// ─── Streaming preview (live text accumulation) ─────────────────────────────

function StreamingPreview() {
  const activeBlocks = useConversationStore((s) => s.activeBlocks);

  // Collect text from all active text blocks
  let previewText = "";
  const sorted = [...activeBlocks.values()].sort((a, b) => a.index - b.index);
  for (const block of sorted) {
    if (block.type === "text" && !block.isComplete) {
      previewText += block.text;
    }
  }

  if (!previewText) return null;

  return (
    <div
      className="text-xs leading-relaxed whitespace-pre-wrap break-words mb-3"
      style={{ color: "var(--color-text)" }}
      data-allow-select="true"
    >
      {previewText}
      <span
        className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm"
        style={{ backgroundColor: "var(--color-blue)" }}
      />
    </div>
  );
}

// ─── Strip date suffix from model name ──────────────────────────────────────

function stripModelDate(model: string): string {
  // e.g. "claude-sonnet-4-20250514" -> "claude-sonnet-4"
  return model.replace(/-\d{8}$/, "");
}

// ─── ChatPanel ──────────────────────────────────────────────────────────────

// Fine-grained selectors to minimize re-renders during streaming.
// Each selector returns only the specific value the component needs,
// so a change to e.g. activeBlocks during streaming won't cause the
// header or input area to re-render.
const selectMessages = (s: import("@/stores/conversation").ConversationState) => s.messages;
const selectIsStreaming = (s: import("@/stores/conversation").ConversationState) => s.isStreaming;
const selectIsThinking = (s: import("@/stores/conversation").ConversationState) => s.isThinking;
const selectThinkingStartedAt = (s: import("@/stores/conversation").ConversationState) => s.thinkingStartedAt;
const selectSession = (s: import("@/stores/conversation").ConversationState) => s.session;
const selectConnectionStatus = (s: import("@/stores/conversation").ConversationState) => s.connectionStatus;
const selectTotalCost = (s: import("@/stores/conversation").ConversationState) => s.totalCost;

export function ChatPanel() {
  const messages = useConversationStore(selectMessages);
  const isStreaming = useConversationStore(selectIsStreaming);
  const isThinking = useConversationStore(selectIsThinking);
  const thinkingStartedAt = useConversationStore(selectThinkingStartedAt);
  const session = useConversationStore(selectSession);
  const connectionStatus = useConversationStore(selectConnectionStatus);
  const totalCost = useConversationStore(selectTotalCost);

  const { startSession, sendMessage, interruptSession, stopSession } = useClaude();

  const [installedSkills, setInstalledSkills] = useState<
    Array<{ name: string; description: string; source: string }>
  >([]);

  // Load installed skills on mount (currently returns empty — future extension point)
  useEffect(() => {
    setInstalledSkills([]);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // ── Auto-scroll to bottom on new messages / streaming ──

  useEffect(() => {
    if (autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming, isThinking]);

  // ── Detect user scrolling away from bottom ──

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // If within 50px of bottom, resume auto-scroll
    autoScrollRef.current = distanceFromBottom < 50;
  }, []);

  // ── New session ──

  const handleNewSession = useCallback(() => {
    stopSession();
  }, [stopSession]);

  // ── Resume a past session ──

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      void stopSession();
      const cwd = session?.cwd ?? useLayoutStore.getState().projectRootPath ?? ".";
      void startSession(cwd, sessionId);
    },
    [stopSession, startSession, session?.cwd],
  );

  // ── Send message (auto-starts session if needed) ──

  const handleSend = useCallback(
    (content: string) => {
      // Track /btw questions so the overlay can show them
      if (content.startsWith("/btw ")) {
        useQuickQuestionStore.getState().ask(content.slice(5));
      }
      autoScrollRef.current = true;
      const cwd = session?.cwd ?? useLayoutStore.getState().projectRootPath ?? ".";
      sendMessage(content, cwd);
    },
    [sendMessage, session?.cwd],
  );

  // ── Stop streaming ──

  const handleStop = useCallback(() => {
    interruptSession();
  }, [interruptSession]);

  const isConnected =
    connectionStatus === "ready" || connectionStatus === "streaming";
  const isDisconnected =
    connectionStatus === "disconnected" || connectionStatus === "stopped";

  const modelDisplay = session?.model ? stripModelDate(session.model) : null;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: "var(--color-blue)" }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Chat
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PlanModeToggle />
          <WriterReviewerLauncher />
          <CompactDialog onSend={handleSend} />
          <SessionSelector
            cwd={session?.cwd ?? ""}
            onNewSession={handleNewSession}
            onResumeSession={handleResumeSession}
          />
          {modelDisplay && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-overlay-1)",
              }}
            >
              {modelDisplay}
            </span>
          )}
          {isConnected && (
            <button
              type="button"
              className="p-1 rounded transition-colors hover:bg-[var(--color-surface-0)]"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={handleNewSession}
              aria-label="New session"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4"
        onScroll={handleScroll}
      >
        {/* Empty state */}
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: "var(--color-surface-0)" }}
            >
              <MessageSquare
                size={20}
                style={{ color: "var(--color-mauve)" }}
              />
            </div>
            <p
              className="text-xs leading-relaxed max-w-48 text-center"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {isDisconnected
                ? "Type a message below to start a Claude Code session."
                : "Ask Claude anything about your codebase."}
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Thinking indicator (during active thinking) */}
        {isThinking && thinkingStartedAt !== null && (
          <ThinkingIndicator startedAt={thinkingStartedAt} />
        )}

        {/* Streaming preview */}
        {isStreaming && !isThinking && <StreamingPreview />}

        {/* Cost display */}
        {totalCost > 0 && !isStreaming && (
          <div
            className="flex justify-center my-2"
          >
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-overlay-0)",
              }}
            >
              Session cost: ${totalCost.toFixed(4)}
            </span>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input + Quick Question Overlay */}
      <div className="relative shrink-0">
        <QuickQuestionOverlay />
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          disabled={false}
          connectionStatus={connectionStatus}
          installedSkills={installedSkills}
        />
      </div>
    </div>
  );
}
