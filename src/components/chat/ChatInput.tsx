import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  connectionStatus: string;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  connectionStatus,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content, max 200px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const placeholder =
    connectionStatus === "starting"
      ? "Connecting..."
      : isStreaming
        ? "Claude is responding..."
        : "Ask Claude anything...";

  const hintText = isStreaming ? "Ctrl+C to stop" : "Shift+Enter for newline";

  const hasText = text.trim().length > 0;

  return (
    <div
      className="shrink-0 px-2 py-1.5"
      style={{ borderTop: "1px solid var(--color-surface-0)" }}
    >
      <div
        className="flex items-end gap-1.5 rounded-md p-1.5"
        style={{
          backgroundColor: "var(--color-surface-0)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent text-xs resize-none outline-none placeholder:text-[var(--color-overlay-0)]"
          style={{
            color: "var(--color-text)",
            fontFamily: "var(--font-sans)",
            maxHeight: "150px",
          }}
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />

        {isStreaming ? (
          <button
            type="button"
            className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
            style={{ color: "var(--color-red)" }}
            onClick={onStop}
            aria-label="Stop generation"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
            style={{
              color: hasText ? "var(--color-blue)" : "var(--color-overlay-0)",
            }}
            onClick={handleSend}
            disabled={!hasText || disabled}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        )}
      </div>
      <p
        className="text-center mt-1 text-[10px]"
        style={{ color: "var(--color-overlay-0)" }}
      >
        {hintText}
      </p>
    </div>
  );
}
