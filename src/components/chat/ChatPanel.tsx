import { useEffect, useRef, useCallback, useState } from "react";
import { MessageSquare, Plus, Search, X, ChevronUp, ChevronDown, GitBranch, ArrowDown, Pin, Info, Download } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useSettingsStore } from "@/stores/settings";
import { useClaude } from "@/hooks/useClaude";
import { MessageBubble } from "./MessageBubble";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { SessionSelector } from "./SessionSelector";
import { QuickQuestionOverlay } from "./QuickQuestionOverlay";
import { useQuickQuestionStore } from "@/stores/quickQuestion";
import { CompactDialog } from "./CompactDialog";
import { PlanModeToggle } from "./PlanModeToggle";
import { WriterReviewerLauncher } from "@/components/agents/WriterReviewerLauncher";
import { ActivityTrail } from "./ActivityTrail";
import { SessionTimeline } from "./SessionTimeline";
import { ExecutionMap } from "./ExecutionMap";
import { EXPORT_FORMATS } from "@/lib/slashHandlers";

// ─── Session Info Badge (Feature 2) ─────────────────────────────────────────

function SessionInfoBadge() {
  const session = useConversationStore(selectSession);
  const totalCost = useConversationStore(selectTotalCost);
  const connectionStatus = useConversationStore(selectConnectionStatus);
  const [elapsed, setElapsed] = useState("");
  const [expanded, setExpanded] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());

  // Reset start time when session changes
  useEffect(() => {
    if (session) {
      sessionStartRef.current = Date.now();
    }
  }, [session?.sessionId]);

  // Update elapsed timer every second
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const diffMs = Date.now() - sessionStartRef.current;
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      if (mins > 0) {
        setElapsed(`${mins}m ${secs}s`);
      } else {
        setElapsed(`${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.sessionId]);

  const isConnected = connectionStatus === "ready" || connectionStatus === "streaming";
  if (!session || !isConnected) return null;

  const truncatedId = session.sessionId
    ? session.sessionId.slice(0, 8) + "..."
    : "unknown";
  const modelName = session.model ? stripModelDate(session.model) : "unknown";

  return (
    <div
      className="shrink-0 px-3 py-1"
      style={{
        backgroundColor: "var(--color-surface-0)",
        borderBottom: "1px solid var(--color-surface-1)",
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-label="Toggle session details"
      >
        <Info size={11} style={{ color: "var(--color-blue)" }} />
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--color-subtext-0)" }}
          title={`Session: ${session.sessionId}`}
        >
          {truncatedId}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-overlay-0)" }}>
          {elapsed}
        </span>
        {totalCost > 0 && (
          <span className="text-[10px]" style={{ color: "var(--color-green)" }}>
            ${totalCost.toFixed(4)}
          </span>
        )}
        <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
          {modelName}
        </span>
      </button>
      {expanded && (
        <div
          className="mt-1 pt-1 text-[10px] space-y-0.5"
          style={{
            borderTop: "1px solid var(--color-surface-1)",
            color: "var(--color-overlay-1)",
          }}
        >
          <div>
            <span style={{ color: "var(--color-overlay-0)" }}>Session ID: </span>
            <span className="font-mono">{session.sessionId}</span>
          </div>
          {session.cwd && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>CWD: </span>
              <span className="font-mono">{session.cwd}</span>
            </div>
          )}
          {session.claudeCodeVersion && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>CLI: </span>
              <span>v{session.claudeCodeVersion}</span>
            </div>
          )}
          {session.permissionMode && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>Permissions: </span>
              <span>{session.permissionMode}</span>
            </div>
          )}
          {session.tools && session.tools.length > 0 && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>Tools: </span>
              <span>{session.tools.length} available</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Typing Indicator (Feature 5) ──────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 mb-3 pl-1">
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
      <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
        Claude is thinking...
      </span>
    </div>
  );
}

// ─── Export Menu ────────────────────────────────────────────────────────────

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const messages = useConversationStore(selectMessages);

  if (messages.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="p-1 rounded transition-colors hover:bg-[var(--color-surface-0)]"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Export conversation"
        title="Export conversation"
      >
        <Download size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-md shadow-lg z-50 py-1 min-w-[160px]"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-1)] transition-colors"
              style={{ color: "var(--color-text)" }}
              onClick={() => {
                fmt.handler();
                setOpen(false);
              }}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

// ─── Conversation search bar ────────────────────────────────────────────────

interface ChatSearchBarProps {
  onClose: () => void;
}

function ChatSearchBar({ onClose }: ChatSearchBarProps) {
  const messages = useConversationStore(selectMessages);
  const [query, setQuery] = useState("");
  const [matchIndices, setMatchIndices] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setMatchIndices([]);
      setCurrentMatch(0);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const indices: number[] = [];
    messages.forEach((msg, i) => {
      if (msg.text.toLowerCase().includes(lowerQuery)) {
        indices.push(i);
      }
    });
    setMatchIndices(indices);
    setCurrentMatch(0);
    // Scroll to first match
    if (indices.length > 0) {
      scrollToMessage(indices[0]);
    }
  }, [query, messages]);

  const scrollToMessage = (idx: number) => {
    const el = document.querySelector(`[data-message-index="${idx}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const goNext = () => {
    if (matchIndices.length === 0) return;
    const next = (currentMatch + 1) % matchIndices.length;
    setCurrentMatch(next);
    scrollToMessage(matchIndices[next]);
  };

  const goPrev = () => {
    if (matchIndices.length === 0) return;
    const prev = (currentMatch - 1 + matchIndices.length) % matchIndices.length;
    setCurrentMatch(prev);
    scrollToMessage(matchIndices[prev]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && e.shiftKey) {
      goPrev();
    } else if (e.key === "Enter") {
      goNext();
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 px-3 h-8 shrink-0"
      style={{
        backgroundColor: "var(--color-surface-0)",
        borderBottom: "1px solid var(--color-surface-1)",
      }}
    >
      <Search size={12} style={{ color: "var(--color-overlay-1)" }} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search messages..."
        className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
        style={{ color: "var(--color-text)" }}
      />
      {query && (
        <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
          {matchIndices.length > 0
            ? `${currentMatch + 1}/${matchIndices.length}`
            : "0 results"}
        </span>
      )}
      <button
        type="button"
        onClick={goPrev}
        disabled={matchIndices.length === 0}
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)] disabled:opacity-30"
        style={{ color: "var(--color-overlay-1)" }}
        aria-label="Previous match"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={matchIndices.length === 0}
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)] disabled:opacity-30"
        style={{ color: "var(--color-overlay-1)" }}
        aria-label="Next match"
      >
        <ChevronDown size={12} />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)]"
        style={{ color: "var(--color-overlay-1)" }}
        aria-label="Close search"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Available Claude models ─────────────────────────────────────────────────

const CLAUDE_MODELS = [
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
] as const;

// ─── Model selector dropdown ─────────────────────────────────────────────────

function ModelSelector() {
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);

  return (
    <select
      value={selectedModel}
      onChange={(e) => setSelectedModel(e.target.value)}
      className="text-[10px] px-1.5 py-0.5 rounded outline-none cursor-pointer"
      style={{
        backgroundColor: "var(--color-surface-0)",
        color: "var(--color-overlay-1)",
        border: "1px solid var(--color-surface-1)",
      }}
      aria-label="Select Claude model"
      title="Select model for new sessions"
    >
      {CLAUDE_MODELS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  // ── Scroll-to-bottom button state (Feature 4) ──
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const prevMessageCountRef = useRef(messages.length);

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

  // ── Auto-scroll to bottom on new messages / streaming ──

  useEffect(() => {
    if (autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setNewMessageCount(0);
    } else {
      // User is scrolled up — count new messages since they scrolled away
      const added = messages.length - prevMessageCountRef.current;
      if (added > 0) {
        setNewMessageCount((prev) => prev + added);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, isStreaming, isThinking]);

  // ── Detect user scrolling away from bottom ──

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // If within 50px of bottom, resume auto-scroll
    const atBottom = distanceFromBottom < 50;
    autoScrollRef.current = atBottom;
    setIsScrolledUp(!atBottom);
    if (atBottom) {
      setNewMessageCount(0);
    }
  }, []);

  // ── Scroll to bottom button handler (Feature 4) ──
  const handleScrollToBottom = useCallback(() => {
    autoScrollRef.current = true;
    setIsScrolledUp(false);
    setNewMessageCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // ── Edit a previous user message: load into input for re-submission ──

  const handleEditMessage = useCallback(
    (messageText: string) => {
      chatInputRef.current?.setEditText(messageText);
    },
    [],
  );

  // ── Regenerate: re-send the last user message ──

  const handleRegenerate = useCallback(() => {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    autoScrollRef.current = true;
    const cwd = session?.cwd ?? useLayoutStore.getState().projectRootPath ?? ".";
    sendMessage(lastUserMsg.text, cwd);
  }, [messages, sendMessage, session?.cwd]);

  // ── Stop streaming ──

  const handleStop = useCallback(() => {
    interruptSession();
  }, [interruptSession]);

  const isConnected =
    connectionStatus === "ready" || connectionStatus === "streaming";
  const isDisconnected =
    connectionStatus === "disconnected" || connectionStatus === "stopped";

  const modelDisplay = session?.model ? stripModelDate(session.model) : null;

  // Determine the last assistant message ID (for the regenerate button)
  const lastAssistantMsgId = messages.length > 0 && messages[messages.length - 1].role === "assistant"
    ? messages[messages.length - 1].id
    : null;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header — clean single row */}
      <div
        className={`flex items-center shrink-0 min-w-0 gap-2 ${mode === "full" ? "px-5 h-10" : "px-3 h-9"}`}
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {/* Left: title + model badge */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {mode === "sidebar" && (
            <MessageSquare size={13} className="shrink-0" style={{ color: "var(--color-blue)" }} />
          )}
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-subtext-0)" }}
          >
            {mode === "full" ? "Claude" : "Chat"}
          </span>
          {modelDisplay && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-subtext-0)",
              }}
              title="Active session model"
            >
              {modelDisplay}
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: icon-only action buttons grouped tightly */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Primary actions group */}
          <PlanModeToggle />
          {mode === "sidebar" && <ModelSelector />}

          {/* Divider */}
          <div className="w-px h-3.5 mx-1" style={{ backgroundColor: "var(--color-surface-1)" }} />

          {/* Secondary icon-only actions */}
          {pinnedMessageIds.size > 0 && (
            <button
              type="button"
              className="p-1 rounded hover:bg-[var(--color-surface-0)]"
              style={{ color: showPinnedOnly ? "var(--color-yellow)" : "var(--color-overlay-1)" }}
              onClick={() => setShowPinnedOnly((prev) => !prev)}
              title={showPinnedOnly ? "Show all messages" : `Pinned (${pinnedMessageIds.size})`}
            >
              <Pin size={13} />
            </button>
          )}
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--color-surface-0)]"
            style={{ color: searchOpen ? "var(--color-blue)" : "var(--color-overlay-1)" }}
            onClick={() => setSearchOpen((prev) => !prev)}
            title="Search (Ctrl+Shift+F)"
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--color-surface-0)]"
            style={{ color: showMap ? "var(--color-blue)" : "var(--color-overlay-1)" }}
            onClick={() => setShowMap((prev) => !prev)}
            title="Execution map"
          >
            <GitBranch size={13} />
          </button>
          <ExportMenu />

          {/* Divider */}
          <div className="w-px h-3.5 mx-1" style={{ backgroundColor: "var(--color-surface-1)" }} />

          {/* Session actions */}
          <WriterReviewerLauncher />
          <CompactDialog onSend={handleSend} />
          <SessionSelector
            cwd={session?.cwd ?? ""}
            onNewSession={handleNewSession}
            onResumeSession={handleResumeSession}
          />
          {isConnected && (
            <button
              type="button"
              className="p-1 rounded hover:bg-[var(--color-surface-0)]"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={handleNewSession}
              title="New Session"
            >
              <Plus size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && <ChatSearchBar onClose={() => setSearchOpen(false)} />}

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
          <div
            ref={scrollContainerRef}
            className={`h-full overflow-y-auto scrollbar-thin ${mode === "full" ? "flex justify-center px-6 py-5" : "p-4"}`}
            onScroll={handleScroll}
          >
          <div className={mode === "full" ? "w-full max-w-4xl chat-full-mode" : "w-full"}>
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

            {/* Messages */}
            {messages.map((msg, idx) => {
              // Filter to pinned only when active
              if (showPinnedOnly && !pinnedMessageIds.has(msg.id)) return null;

              // isGroupFirst: true if this is the first message or previous message has a different role
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const isGroupFirst = !prevMsg || prevMsg.role !== msg.role;
              // isForked: true if this assistant message immediately follows another assistant message
              // (indicates a regeneration/fork rather than a natural continuation)
              const isForked = msg.role === "assistant" && prevMsg?.role === "assistant";
              return (
                <div key={msg.id} data-message-index={idx}>
                  <MessageBubble
                    message={msg}
                    isGroupFirst={isGroupFirst}
                    isForked={isForked}
                    onEdit={msg.role === "user" ? handleEditMessage : undefined}
                    showRegenerate={msg.id === lastAssistantMsgId && !isStreaming}
                    onRegenerate={msg.id === lastAssistantMsgId ? handleRegenerate : undefined}
                  />
                </div>
              );
            })}

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
          </div>

          {/* Scroll to bottom button (Feature 4) */}
          {isScrolledUp && (
            <button
              type="button"
              onClick={handleScrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs shadow-lg transition-all hover:scale-105 z-20"
              style={{
                backgroundColor: "var(--color-blue)",
                color: "var(--color-base)",
              }}
              aria-label="Scroll to latest messages"
            >
              <ArrowDown size={12} />
              {newMessageCount > 0 ? (
                <span>
                  {newMessageCount} new message{newMessageCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span>Latest</span>
              )}
            </button>
          )}
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
