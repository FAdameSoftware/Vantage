import { useEffect, useRef, useState, useCallback } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { useQuickQuestionStore } from "@/stores/quickQuestion";

export function QuickQuestionOverlay() {
  const isOpen = useQuickQuestionStore((s) => s.isOpen);
  const question = useQuickQuestionStore((s) => s.question);
  const response = useQuickQuestionStore((s) => s.response);
  const isLoading = useQuickQuestionStore((s) => s.isLoading);
  const error = useQuickQuestionStore((s) => s.error);
  const { close, ask } = useQuickQuestionStore();

  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to let the DOM settle
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Pre-fill input when a question is already set (e.g. typed via /btw)
  useEffect(() => {
    if (isOpen && question) {
      setInputValue(question);
    }
  }, [isOpen, question]);

  // Dismiss on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, close]);

  const handleAsk = useCallback(() => {
    const q = inputValue.trim();
    if (!q) return;
    ask(q);
    setInputValue("");
  }, [inputValue, ask]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAsk();
      }
    },
    [handleAsk],
  );

  const handleClose = useCallback(() => {
    setInputValue("");
    close();
  }, [close]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 flex flex-col overflow-hidden rounded-t-md"
      style={{
        maxHeight: "320px",
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
        borderBottom: "none",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-mauve)" }}
        >
          Quick Question
        </span>
        <button
          type="button"
          className="p-0.5 rounded transition-colors hover:bg-[var(--color-surface-1)]"
          style={{ color: "var(--color-overlay-0)" }}
          onClick={handleClose}
          aria-label="Close quick question overlay"
        >
          <X size={13} />
        </button>
      </div>

      {/* Response area */}
      {(question || response || error) && (
        <div
          className="flex-1 overflow-y-auto px-3 py-2 min-h-0"
          style={{ maxHeight: "220px" }}
        >
          {question && (
            <p
              className="text-xs mb-2 font-medium"
              style={{ color: "var(--color-subtext-0)" }}
            >
              {question}
            </p>
          )}

          {isLoading && !response && (
            <div className="flex items-center gap-1.5">
              <Loader2
                size={12}
                className="animate-spin"
                style={{ color: "var(--color-mauve)" }}
              />
              <span
                className="text-xs"
                style={{ color: "var(--color-overlay-1)" }}
              >
                Thinking…
              </span>
            </div>
          )}

          {response && (
            <p
              className="text-xs leading-relaxed whitespace-pre-wrap break-words"
              style={{ color: "var(--color-text)" }}
            >
              {response}
              {isLoading && (
                <span
                  className="inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm"
                  style={{ backgroundColor: "var(--color-mauve)" }}
                />
              )}
            </p>
          )}

          {error && (
            <p
              className="text-xs"
              style={{ color: "var(--color-red)" }}
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* Input row */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 shrink-0"
        style={{ borderTop: question ? "1px solid var(--color-surface-1)" : undefined }}
      >
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-sans)" }}
          placeholder="Ask a quick question…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
          style={{
            color:
              inputValue.trim()
                ? "var(--color-mauve)"
                : "var(--color-overlay-0)",
          }}
          onClick={handleAsk}
          disabled={!inputValue.trim()}
          aria-label="Ask question"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
