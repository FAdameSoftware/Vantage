import { useEffect, useRef, useState } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import type { ConversationState } from "@/stores/conversation";

const selectMessages = (s: ConversationState) => s.messages;

export interface ChatSearchBarProps {
  onClose: () => void;
  /** Callback to scroll the (virtualized) message list to a specific original-index message */
  onScrollToMessage?: (index: number) => void;
}

export function ChatSearchBar({ onClose, onScrollToMessage }: ChatSearchBarProps) {
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
      if (msg.text?.toLowerCase().includes(lowerQuery)) {
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
    if (onScrollToMessage) {
      onScrollToMessage(idx);
    } else {
      // Fallback: DOM-based scroll (for non-virtualized contexts)
      const el = document.querySelector(`[data-message-index="${idx}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
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
