import { useState, useRef, useEffect, useCallback } from "react";
import { Minimize2 } from "lucide-react";

interface CompactDialogProps {
  onSend: (message: string) => void;
}

export function CompactDialog({ onSend }: CompactDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preserveText, setPreserveText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when popover opens
  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    // Use capture so we catch clicks before they bubble
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [isOpen]);

  const handleCompact = useCallback(() => {
    const focus = preserveText.trim();
    onSend(focus ? `/compact ${focus}` : "/compact");
    setPreserveText("");
    setIsOpen(false);
  }, [preserveText, onSend]);

  const handleCompactAll = useCallback(() => {
    onSend("/compact");
    setPreserveText("");
    setIsOpen(false);
  }, [onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCompact();
      }
    },
    [handleCompact],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-[var(--color-surface-0)]"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Compact conversation"
        title="Compact conversation to reduce context usage"
      >
        <Minimize2 size={13} />
        <span>Compact</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-md overflow-hidden"
          style={{
            width: "260px",
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <div className="px-3 py-2">
            <p
              className="text-xs mb-1.5 font-medium"
              style={{ color: "var(--color-subtext-0)" }}
            >
              What to preserve?
            </p>
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)] rounded px-2 py-1"
              style={{
                color: "var(--color-text)",
                fontFamily: "var(--font-sans)",
                backgroundColor: "var(--color-base)",
                border: "1px solid var(--color-surface-1)",
              }}
              placeholder="e.g., API changes, auth logic"
              value={preserveText}
              onChange={(e) => setPreserveText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div
            className="flex items-center gap-1.5 px-3 pb-2"
          >
            <button
              type="button"
              className="flex-1 py-1 rounded text-xs font-medium transition-colors hover:opacity-90"
              style={{
                backgroundColor: "var(--color-blue)",
                color: "var(--color-base)",
              }}
              onClick={handleCompact}
            >
              Compact
            </button>
            <button
              type="button"
              className="flex-1 py-1 rounded text-xs transition-colors hover:bg-[var(--color-surface-1)]"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={handleCompactAll}
              title="Compact without preserving anything specific"
            >
              Compact All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
