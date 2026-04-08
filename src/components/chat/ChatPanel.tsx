import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, Pin } from "lucide-react";
import { EASE_SMOOTH } from "@/lib/animations";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useClaude } from "@/hooks/useClaude";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { QuickQuestionOverlay } from "./QuickQuestionOverlay";
import { useQuickQuestionStore } from "@/stores/quickQuestion";
import { ActivityTrail } from "./ActivityTrail";
import { SessionTimeline } from "./SessionTimeline";
import { ExecutionMap } from "./ExecutionMap";
import { VirtualMessageList, type VirtualMessageListHandle } from "./VirtualMessageList";
import { SessionInfoBadge } from "./SessionInfoBadge";
import { ChatHeader } from "./ChatHeader";
import { StreamingPreview } from "./StreamingPreview";
import { ChatSearchBar } from "./ChatSearchBar";
import { ChatEmptyState } from "./ChatEmptyState";

// ─── Typing Indicator (tiny — kept inline) ──────────────────────────────────

function TypingDots() {
  return (
    <div
      className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      <div className="flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ backgroundColor: "var(--color-blue)", animationDelay: "0ms", animationDuration: "1s" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ backgroundColor: "var(--color-blue)", animationDelay: "150ms", animationDuration: "1s" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ backgroundColor: "var(--color-blue)", animationDelay: "300ms", animationDuration: "1s" }}
        />
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--color-blue)" }}>
        Claude is working...
      </span>
    </div>
  );
}

// ─── Fine-grained selectors ────────────────────────────────────────────────

const selectMessages = (s: import("@/stores/conversation").ConversationState) => s.messages;
const selectIsStreaming = (s: import("@/stores/conversation").ConversationState) => s.isStreaming;
const selectIsThinking = (s: import("@/stores/conversation").ConversationState) => s.isThinking;
const selectThinkingStartedAt = (s: import("@/stores/conversation").ConversationState) => s.thinkingStartedAt;
const selectSession = (s: import("@/stores/conversation").ConversationState) => s.session;
const selectConnectionStatus = (s: import("@/stores/conversation").ConversationState) => s.connectionStatus;
const selectTotalCost = (s: import("@/stores/conversation").ConversationState) => s.totalCost;

// ─── ChatPanel ──────────────────────────────────────────────────────────────

export interface ChatPanelProps {
  /** "full" = Claude View (centered, max-w-3xl, larger text); "sidebar" = IDE View (fill width) */
  mode?: "full" | "sidebar";
}

export function ChatPanel({ mode = "sidebar" }: ChatPanelProps) {
  const messages = useConversationStore(selectMessages);
  const isStreaming = useConversationStore(selectIsStreaming);
  const isThinking = useConversationStore(selectIsThinking);
  const thinkingStartedAt = useConversationStore(selectThinkingStartedAt);
  const session = useConversationStore(selectSession);
  const connectionStatus = useConversationStore(selectConnectionStatus);
  const totalCost = useConversationStore(selectTotalCost);

  const { startSession, sendMessage, interruptSession, stopSession } = useClaude();

  const pinnedMessageIds = useConversationStore((s) => s.pinnedMessageIds);

  const [installedSkills, setInstalledSkills] = useState<
    Array<{ name: string; description: string; source: string }>
  >([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // Load installed skills on mount (currently returns empty — future extension point)
  useEffect(() => {
    setInstalledSkills([]);
  }, []);

  const virtualListRef = useRef<VirtualMessageListHandle>(null);
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  // ── Scroll-to-bottom button state (driven by VirtualMessageList callback) ──
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const handleScrollStateChange = useCallback((scrolledUp: boolean, count: number) => {
    setIsScrolledUp(scrolledUp);
    setNewMessageCount(count);
  }, []);

  // ── Keyboard shortcut: Ctrl+Shift+F for search ──

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Scroll to bottom button handler ──
  const handleScrollToBottom = useCallback(() => {
    virtualListRef.current?.scrollToBottom();
  }, []);

  // ── Search: scroll to a specific message index in the virtualized list ──
  const handleScrollToMessage = useCallback((index: number) => {
    virtualListRef.current?.scrollToIndex(index);
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
      virtualListRef.current?.scrollToBottom();
      const cwd = session?.cwd ?? useLayoutStore.getState().projectRootPath ?? ".";
      sendMessage(content, cwd);
    },
    [sendMessage, session?.cwd],
  );

  // ── Edit a previous user message: load into input for re-submission ──

  const handleEditMessage = useCallback(
    (messageText: string) => {
      chatInputRef.current?.setEditText(messageText);
    },
    [],
  );

  // ── Regenerate: re-send the last user message ──

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    virtualListRef.current?.scrollToBottom();
    const cwd = session?.cwd ?? useLayoutStore.getState().projectRootPath ?? ".";
    sendMessage(lastUserMsg.text, cwd);
  }, [messages, sendMessage, session?.cwd]);

  // ── Stop streaming ──

  const handleStop = useCallback(() => {
    interruptSession();
  }, [interruptSession]);

  // Determine the last assistant message ID (for the regenerate button)
  const lastAssistantMsgId = messages.length > 0 && messages[messages.length - 1].role === "assistant"
    ? messages[messages.length - 1].id
    : null;

  // ── Footer content rendered as the last virtual row ──
  const footerContent = useMemo(() => {
    const hasContent =
      (isThinking && thinkingStartedAt !== null) ||
      (isStreaming && !isThinking) ||
      (totalCost > 0 && !isStreaming) ||
      showPinnedOnly;

    if (!hasContent) return null;

    return (
      <div>
        {/* Pinned filter notice */}
        {showPinnedOnly && (
          <div
            className="flex items-center justify-center gap-1.5 py-1.5 mb-2 rounded text-[10px]"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-yellow)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <Pin size={10} />
            Showing {pinnedMessageIds.size} pinned message{pinnedMessageIds.size !== 1 ? "s" : ""}
          </div>
        )}

        {/* Thinking indicator (during active thinking) */}
        {isThinking && thinkingStartedAt !== null && (
          <ThinkingIndicator startedAt={thinkingStartedAt} />
        )}

        {/* Typing indicator (streaming but not yet producing text) */}
        {isStreaming && !isThinking && <TypingDots />}

        {/* Streaming preview */}
        {isStreaming && !isThinking && <StreamingPreview />}

        {/* Cost display */}
        {totalCost > 0 && !isStreaming && (
          <div className="flex justify-center my-2">
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
      </div>
    );
  }, [isThinking, thinkingStartedAt, isStreaming, totalCost, showPinnedOnly, pinnedMessageIds.size]);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <ChatHeader
        mode={mode}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((prev) => !prev)}
        showMap={showMap}
        onToggleMap={() => setShowMap((prev) => !prev)}
        showPinnedOnly={showPinnedOnly}
        onTogglePinned={() => setShowPinnedOnly((prev) => !prev)}
        onSend={handleSend}
        onNewSession={handleNewSession}
        onResumeSession={handleResumeSession}
      />

      {/* Search bar */}
      {searchOpen && <ChatSearchBar onClose={() => setSearchOpen(false)} onScrollToMessage={handleScrollToMessage} />}

      {/* Session info badge */}
      <SessionInfoBadge />

      {/* Session timeline (checkpoints) */}
      <SessionTimeline />

      {/* Execution Map view (toggled via Map button) */}
      {showMap ? (
        <ExecutionMap />
      ) : (
        <>
          {/* Message list (relative so scroll-to-bottom btn can be positioned) */}
          <div className="flex-1 relative overflow-hidden">
            {/* Empty state — shown outside virtualizer when no messages */}
            {messages.length === 0 && !isStreaming ? (
              <ChatEmptyState mode={mode} onSendMessage={handleSend} />
            ) : (
              <VirtualMessageList
                ref={virtualListRef}
                messages={messages}
                mode={mode}
                pinnedMessageIds={pinnedMessageIds}
                showPinnedOnly={showPinnedOnly}
                isStreaming={isStreaming}
                lastAssistantMsgId={lastAssistantMsgId}
                onEditMessage={handleEditMessage}
                onRegenerate={handleRegenerate}
                footerContent={footerContent}
                onScrollStateChange={handleScrollStateChange}
              />
            )}

            {/* Scroll to bottom button */}
            <AnimatePresence>
              {isScrolledUp && (
                <motion.button
                  type="button"
                  onClick={handleScrollToBottom}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs shadow-lg hover:scale-105 z-20"
                  style={{
                    backgroundColor: "var(--color-blue)",
                    color: "var(--color-base)",
                  }}
                  aria-label="Scroll to latest messages"
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: EASE_SMOOTH as unknown as number[] }}
                >
                  <ArrowDown size={12} />
                  {newMessageCount > 0 ? (
                    <span>
                      {newMessageCount} new message{newMessageCount !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span>Latest</span>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Activity Trail — live sidebar of files Claude touched */}
          <ActivityTrail />
        </>
      )}

      {/* Input + Quick Question Overlay */}
      <div className="relative shrink-0">
        <QuickQuestionOverlay />
        <ChatInput
          ref={chatInputRef}
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
