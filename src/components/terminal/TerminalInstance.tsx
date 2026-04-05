import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown, Layers } from "lucide-react";
import { useTerminal } from "@/hooks/useTerminal";
import { useCommandBlocks } from "@/hooks/useCommandBlocks";
import { CommandBlockList } from "./CommandBlock";
import { CommandSuggestion } from "./CommandSuggestion";

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
  const { containerRef, terminalRef, fit, search, searchPrevious, clearSearch, focus } = useTerminal({
    shellPath,
    shellArgs,
    cwd,
  });
  const rafRef = useRef<number | null>(null);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [blocksVisible, setBlocksVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Command blocks integration
  const { blocks, hasShellIntegration, clearBlocks } = useCommandBlocks({
    terminal: terminalRef.current,
    enabled: true,
  });

  // Command suggestion state: track the last failed command
  const [failedCommandInfo, setFailedCommandInfo] = useState<{
    command: string;
    exitCode: number;
    output: string;
  } | null>(null);

  // Watch for newly completed blocks with non-zero exit codes
  const lastBlockCountRef = useRef(0);
  useEffect(() => {
    if (blocks.length <= lastBlockCountRef.current) {
      lastBlockCountRef.current = blocks.length;
      return;
    }
    lastBlockCountRef.current = blocks.length;

    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock || lastBlock.exitCode === null || lastBlock.exitCode === 0) {
      // Command succeeded or still running -- clear any previous suggestion
      setFailedCommandInfo(null);
      return;
    }

    // Extract recent terminal output for pattern matching
    const terminal = terminalRef.current;
    let recentOutput = "";
    if (terminal && lastBlock.startLine != null) {
      const buffer = terminal.buffer.active;
      const endLine = lastBlock.endLine ?? (buffer.baseY + buffer.cursorY);
      const startLine = Math.max(lastBlock.startLine, endLine - 30);
      const lines: string[] = [];
      for (let row = startLine; row <= endLine; row++) {
        const line = buffer.getLine(row);
        if (line) {
          lines.push(line.translateToString(true));
        }
      }
      recentOutput = lines.join("\n");
    }

    setFailedCommandInfo({
      command: lastBlock.command,
      exitCode: lastBlock.exitCode,
      output: recentOutput,
    });
  }, [blocks, terminalRef]);

  // Re-run a command by writing it to the terminal
  const handleRerun = useCallback(
    (command: string) => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      // Write the command followed by Enter
      // We use the terminal's input event to send to the PTY
      terminal.input(command + "\r");
    },
    [terminalRef],
  );

  // Scroll terminal to a specific line
  const handleScrollTo = useCallback(
    (line: number) => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      terminal.scrollToLine(line);
    },
    [terminalRef],
  );

  // Accept a command suggestion: write it to the terminal
  const handleAcceptSuggestion = useCallback(
    (command: string) => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      terminal.input(command + "\r");
      setFailedCommandInfo(null);
    },
    [terminalRef],
  );

  // Dismiss the command suggestion
  const handleDismissSuggestion = useCallback(() => {
    setFailedCommandInfo(null);
  }, []);

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
      className="w-full h-full relative flex flex-col"
      style={{
        display: isVisible ? "flex" : "none",
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
      {/* Blocks toggle button */}
      {blocks.length > 0 && (
        <button
          type="button"
          className="absolute top-1 left-1 z-10 p-1 rounded transition-colors"
          style={{
            backgroundColor: blocksVisible
              ? "var(--color-surface-1)"
              : "var(--color-surface-0)",
            color: blocksVisible
              ? "var(--color-mauve)"
              : "var(--color-overlay-1)",
            border: "1px solid var(--color-surface-1)",
          }}
          onClick={() => setBlocksVisible(!blocksVisible)}
          aria-label={blocksVisible ? "Hide command blocks" : "Show command blocks"}
          title={`${blocks.length} commands detected`}
        >
          <Layers size={12} />
        </button>
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        data-allow-select="true"
      />
      {/* AI command suggestion (appears after failed commands) */}
      {failedCommandInfo && (
        <CommandSuggestion
          failedCommand={failedCommandInfo.command}
          exitCode={failedCommandInfo.exitCode}
          recentOutput={failedCommandInfo.output}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}
      {/* Command blocks panel (collapsible, below terminal) */}
      {blocksVisible && (
        <CommandBlockList
          blocks={blocks}
          hasShellIntegration={hasShellIntegration}
          onRerun={handleRerun}
          onScrollTo={handleScrollTo}
          onClear={clearBlocks}
        />
      )}
    </div>
  );
}
