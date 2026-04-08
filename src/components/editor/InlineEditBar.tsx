/**
 * InlineEditBar — floating prompt input for Ctrl+K inline AI edits.
 *
 * Positioned above the current selection in the Monaco editor.
 * User types an instruction, presses Enter to submit.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

interface InlineEditBarProps {
  /** Pixel position for the floating bar */
  position: { top: number; left: number };
  /** Whether Claude is currently processing */
  isLoading: boolean;
  /** Callback when the user submits a prompt */
  onSubmit: (prompt: string) => void;
  /** Callback to close/cancel the bar */
  onClose: () => void;
}

export function InlineEditBar({
  position,
  isLoading,
  onSubmit,
  onClose,
}: InlineEditBarProps) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    // Small delay to ensure the element is in the DOM
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && prompt.trim() && !isLoading) {
        e.preventDefault();
        e.stopPropagation();
        onSubmit(prompt.trim());
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [prompt, isLoading, onSubmit, onClose],
  );

  // Prevent the click from propagating to the editor and stealing focus
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className="fixed z-50 flex items-center gap-1.5 rounded-lg shadow-lg px-2 py-1.5"
      style={{
        top: Math.max(position.top, 8),
        left: position.left,
        minWidth: 320,
        maxWidth: 500,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
        boxShadow:
          "0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Icon */}
      {isLoading ? (
        <Spinner size={14} className="shrink-0" style={{ color: "var(--color-mauve)" }} />
      ) : (
        <Sparkles
          size={14}
          className="shrink-0"
          style={{ color: "var(--color-mauve)" }}
        />
      )}

      {/* Prompt input */}
      <input
        ref={inputRef}
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? "Generating..." : "Describe the edit..."}
        disabled={isLoading}
        className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
        style={{
          color: "var(--color-text)",
          fontFamily: "var(--font-sans)",
        }}
      />

      {/* Keyboard hint */}
      {!isLoading && (
        <span
          className="text-[10px] shrink-0"
          style={{ color: "var(--color-overlay-0)" }}
        >
          Enter
        </span>
      )}

      {/* Close button */}
      <button
        type="button"
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors shrink-0"
        style={{ color: "var(--color-overlay-0)" }}
        onClick={onClose}
        aria-label="Close inline edit"
      >
        <X size={12} />
      </button>
    </div>
  );
}
