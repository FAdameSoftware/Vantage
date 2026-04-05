import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { useTerminal } from "@/hooks/useTerminal";

interface TerminalInstanceProps {
  /** Shell executable path */
  shellPath: string;
  /** Shell arguments */
  shellArgs: string[];
  /** Working directory */
  cwd?: string;
  /** Whether this terminal is the currently visible one */
  isVisible: boolean;
}

// ─── Terminal Find Bar ──────────────────────────────────────────────────────

function TerminalFindBar({
  onSearch,
  onSearchPrevious,
  onClear,
  onClose,
}: {
  onSearch: (query: string) => void;
  onSearchPrevious: (query: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query) {
      onSearch(query);
    } else {
      onClear();
    }
  }, [query, onSearch, onClear]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClear();
      onClose();
    } else if (e.key === "Enter" && e.shiftKey) {
      onSearchPrevious(query);
    } else if (e.key === "Enter") {
      onSearch(query);
    }
  };

  return (
    <div
      className="absolute top-1 right-1 z-10 flex items-center gap-1 px-2 py-1 rounded shadow-md"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      <Search size={11} style={{ color: "var(--color-overlay-1)" }} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find..."
        className="w-32 bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
        style={{ color: "var(--color-text)" }}
      />
      <button
        type="button"
        onClick={() => onSearchPrevious(query)}
        disabled={!query}
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)] disabled:opacity-30"
        style={{ color: "var(--color-overlay-1)" }}
        aria-label="Previous match"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        onClick={() => onSearch(query)}
        disabled={!query}
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)] disabled:opacity-30"
        style={{ color: "var(--color-overlay-1)" }}
        aria-label="Next match"
      >
        <ChevronDown size={12} />
      </button>
      <button
        type="button"
        onClick={() => {
          onClear();
          onClose();
        }}
        className="p-0.5 rounded hover:bg-[var(--color-surface-1)]"
        style={{ color: "var(--color-overlay-1)" }}
        aria-label="Close find"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Terminal Instance ──────────────────────────────────────────────────────

export function TerminalInstance({
  shellPath,
  shellArgs,
  cwd,
  isVisible,
}: TerminalInstanceProps) {
  const { containerRef, fit, search, searchPrevious, clearSearch, focus } = useTerminal({
    shellPath,
    shellArgs,
    cwd,
  });
  const rafRef = useRef<number | null>(null);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced fit to avoid calling fitAddon.fit() on every frame during a drag resize
  const debouncedFit = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      fit();
      rafRef.current = null;
    });
  };

  // Re-fit when becoming visible
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure container has its final dimensions after show
      const timer = setTimeout(() => fit(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fit]);

  // Listen for container resize via ResizeObserver — handles panel drag resizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isVisible) {
        debouncedFit();
      }
    });

    observer.observe(container);

    // Also observe the parent element to catch cases where the panel area
    // resizes but the terminal container dimensions haven't updated yet
    const parent = container.parentElement;
    if (parent) {
      observer.observe(parent);
    }

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isVisible, fit, containerRef]);

  // Ctrl+F to open find bar when terminal is focused/visible
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !isVisible) return;

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setFindBarOpen(true);
      }
    };

    wrapper.addEventListener("keydown", handler, true);
    return () => wrapper.removeEventListener("keydown", handler, true);
  }, [isVisible]);

  const handleCloseFindBar = useCallback(() => {
    setFindBarOpen(false);
    focus();
  }, [focus]);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full relative"
      style={{
        display: isVisible ? "block" : "none",
      }}
    >
      {findBarOpen && (
        <TerminalFindBar
          onSearch={search}
          onSearchPrevious={searchPrevious}
          onClear={clearSearch}
          onClose={handleCloseFindBar}
        />
      )}
      <div
        ref={containerRef}
        className="w-full h-full"
        data-allow-select="true"
      />
    </div>
  );
}
