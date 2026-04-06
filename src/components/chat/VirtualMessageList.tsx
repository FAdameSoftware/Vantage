import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageBubble } from "./MessageBubble";
import type { ConversationMessage } from "@/stores/conversation";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VirtualMessageListProps {
  messages: ConversationMessage[];
  mode: "full" | "sidebar";
  pinnedMessageIds: Set<string>;
  showPinnedOnly: boolean;
  isStreaming: boolean;
  lastAssistantMsgId: string | null;
  onEditMessage: (text: string) => void;
  onRegenerate: () => void;
  /** Render additional content after the last message (thinking, streaming preview, cost, etc.) */
  footerContent?: React.ReactNode;
  /** Called when scroll state changes (scrolled up / new message count) */
  onScrollStateChange?: (isScrolledUp: boolean, newMessageCount: number) => void;
}

export interface VirtualMessageListHandle {
  scrollToIndex: (index: number) => void;
  scrollToBottom: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Default estimated height per message row (px). Overridden by measureElement. */
const ESTIMATED_ROW_HEIGHT = 120;
/** Number of extra items to render outside the visible viewport. */
const OVERSCAN_COUNT = 5;
/** Distance from bottom (px) to consider "at bottom" for auto-scroll. */
const AT_BOTTOM_THRESHOLD = 80;

// ─── Component ──────────────────────────────────────────────────────────────

export const VirtualMessageList = forwardRef<
  VirtualMessageListHandle,
  VirtualMessageListProps
>(function VirtualMessageList(
  {
    messages,
    mode,
    pinnedMessageIds,
    showPinnedOnly,
    isStreaming,
    lastAssistantMsgId,
    onEditMessage,
    onRegenerate,
    footerContent,
    onScrollStateChange,
  },
  ref,
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const newMessageCountRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  // ── Filter messages (pinned filter) ──
  const displayMessages = showPinnedOnly
    ? messages.filter((msg) => pinnedMessageIds.has(msg.id))
    : messages;

  // Build a mapping from display index to original index in the full messages array.
  // This is needed for data-message-index (used by search scroll-to-match).
  const displayToOriginalIndex = showPinnedOnly
    ? displayMessages.map((msg) => messages.indexOf(msg))
    : displayMessages.map((_, i) => i);

  // We add +1 to count if footerContent exists, to include it as a virtual row.
  const hasFooter = !!footerContent;
  const totalCount = displayMessages.length + (hasFooter ? 1 : 0);

  // ── Virtualizer ──
  const virtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      // Footer row gets a smaller estimate
      if (hasFooter && index === displayMessages.length) return 60;
      return ESTIMATED_ROW_HEIGHT;
    },
    overscan: OVERSCAN_COUNT,
  });

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    if (autoScrollRef.current && totalCount > 0) {
      // Use requestAnimationFrame to ensure the virtualizer has updated
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(totalCount - 1, { align: "end" });
      });
      newMessageCountRef.current = 0;
      onScrollStateChange?.(false, 0);
    } else {
      // Track new messages while scrolled up
      const added = displayMessages.length - prevMessageCountRef.current;
      if (added > 0) {
        newMessageCountRef.current += added;
        onScrollStateChange?.(true, newMessageCountRef.current);
      }
    }
    prevMessageCountRef.current = displayMessages.length;
  }, [displayMessages.length, isStreaming, totalCount]);

  // ── Scroll handler: detect user scroll position ──
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < AT_BOTTOM_THRESHOLD;
    autoScrollRef.current = atBottom;
    if (atBottom) {
      newMessageCountRef.current = 0;
      onScrollStateChange?.(false, 0);
    } else {
      onScrollStateChange?.(true, newMessageCountRef.current);
    }
  }, [onScrollStateChange]);

  // ── Imperative handle for parent ──
  const scrollToBottom = useCallback(() => {
    autoScrollRef.current = true;
    newMessageCountRef.current = 0;
    onScrollStateChange?.(false, 0);
    if (totalCount > 0) {
      virtualizer.scrollToIndex(totalCount - 1, {
        align: "end",
        behavior: "smooth",
      });
    }
  }, [virtualizer, totalCount, onScrollStateChange]);

  const scrollToIndex = useCallback(
    (index: number) => {
      // The index comes from the original (unfiltered) messages array.
      // We need to find the display index.
      let displayIndex: number;
      if (showPinnedOnly) {
        // Find the display index for this original index
        displayIndex = displayToOriginalIndex.indexOf(index);
        if (displayIndex === -1) return; // message not visible in pinned view
      } else {
        displayIndex = index;
      }
      virtualizer.scrollToIndex(displayIndex, {
        align: "center",
        behavior: "smooth",
      });
    },
    [virtualizer, showPinnedOnly, displayToOriginalIndex],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex,
      scrollToBottom,
    }),
    [scrollToIndex, scrollToBottom],
  );

  // ── Render ──
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollContainerRef}
      className={`h-full overflow-y-auto scrollbar-thin ${mode === "full" ? "flex justify-center px-6 py-5" : "p-4"}`}
      onScroll={handleScroll}
      aria-live="polite"
      aria-atomic="false"
    >
      <div className={mode === "full" ? "w-full max-w-4xl chat-full-mode" : "w-full"}>
        {/* Virtualized container */}
        {totalCount > 0 && (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {virtualItems.map((virtualRow) => {
                const isFooterRow =
                  hasFooter && virtualRow.index === displayMessages.length;

                if (isFooterRow) {
                  // Render footer content (thinking, streaming preview, cost, scroll anchor)
                  return (
                    <div
                      key="__footer__"
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                    >
                      {footerContent}
                    </div>
                  );
                }

                const msg = displayMessages[virtualRow.index];
                if (!msg) return null;

                const originalIndex = displayToOriginalIndex[virtualRow.index];
                const prevOriginalIndex =
                  virtualRow.index > 0
                    ? displayToOriginalIndex[virtualRow.index - 1]
                    : -1;
                const prevMsg =
                  prevOriginalIndex >= 0
                    ? messages[prevOriginalIndex]
                    : null;
                const isGroupFirst = !prevMsg || prevMsg.role !== msg.role;
                const isForked =
                  msg.role === "assistant" && prevMsg?.role === "assistant";

                return (
                  <div
                    key={msg.id}
                    data-index={virtualRow.index}
                    data-message-index={originalIndex}
                    ref={virtualizer.measureElement}
                  >
                    <MessageBubble
                      message={msg}
                      isGroupFirst={isGroupFirst}
                      isForked={isForked}
                      onEdit={
                        msg.role === "user" ? onEditMessage : undefined
                      }
                      showRegenerate={
                        msg.id === lastAssistantMsgId && !isStreaming
                      }
                      onRegenerate={
                        msg.id === lastAssistantMsgId
                          ? onRegenerate
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
