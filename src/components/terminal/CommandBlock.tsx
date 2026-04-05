import { useState, useCallback } from "react";
import {
  Copy,
  Check,
  Play,
  ChevronDown,
  ChevronRight,
  Clock,
  Terminal,
  Trash2,
  Layers,
} from "lucide-react";
import type { CommandBlock as CommandBlockType } from "@/hooks/useCommandBlocks";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ─── Single Command Block Card ──────────────────────────────────────────────

interface CommandBlockCardProps {
  block: CommandBlockType;
  onRerun?: (command: string) => void;
  onScrollTo?: (line: number) => void;
}

export function CommandBlockCard({
  block,
  onRerun,
  onScrollTo,
}: CommandBlockCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(block.command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy command:", err);
    });
  }, [block.command]);

  const isRunning = block.finishedAt === null;
  const isSuccess = block.exitCode === 0;
  const isFailed = block.exitCode !== null && block.exitCode !== 0;

  const exitCodeColor = isRunning
    ? "var(--color-blue)"
    : isSuccess
      ? "var(--color-green)"
      : isFailed
        ? "var(--color-red)"
        : "var(--color-overlay-1)";

  return (
    <div
      className="rounded-md overflow-hidden text-xs mb-1.5"
      style={{
        backgroundColor: "var(--color-surface-0)",
        borderLeft: `3px solid ${exitCodeColor}`,
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Terminal size={11} style={{ color: exitCodeColor }} />

        {/* Command text */}
        <button
          type="button"
          className="flex-1 text-left truncate bg-transparent border-none p-0 cursor-pointer"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text)",
            fontSize: "11px",
          }}
          onClick={() => onScrollTo?.(block.startLine)}
          title={`Scroll to line ${block.startLine}`}
        >
          {block.command}
        </button>

        {/* Exit code badge */}
        {block.exitCode !== null && (
          <span
            className="px-1 py-0.5 rounded text-[10px] font-mono"
            style={{
              backgroundColor: isSuccess
                ? "rgba(166, 227, 161, 0.15)"
                : "rgba(243, 139, 168, 0.15)",
              color: exitCodeColor,
            }}
          >
            {block.exitCode}
          </span>
        )}

        {/* Running indicator */}
        {isRunning && (
          <span
            className="text-[10px] animate-pulse"
            style={{ color: "var(--color-blue)" }}
          >
            running
          </span>
        )}

        {/* Duration */}
        {block.durationMs !== null && (
          <span
            className="flex items-center gap-0.5 text-[10px]"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <Clock size={9} />
            {formatDuration(block.durationMs)}
          </span>
        )}

        {/* Copy */}
        <button
          type="button"
          className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{
            color: copied ? "var(--color-green)" : "var(--color-overlay-1)",
          }}
          onClick={handleCopy}
          aria-label="Copy command"
          title="Copy command"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>

        {/* Re-run */}
        {onRerun && !isRunning && (
          <button
            type="button"
            className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={() => onRerun(block.command)}
            aria-label="Re-run command"
            title="Re-run command"
          >
            <Play size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Command Block List (sidebar panel) ─────────────────────────────────────

interface CommandBlockListProps {
  blocks: CommandBlockType[];
  hasShellIntegration: boolean;
  onRerun?: (command: string) => void;
  onScrollTo?: (line: number) => void;
  onClear?: () => void;
}

export function CommandBlockList({
  blocks,
  hasShellIntegration,
  onRerun,
  onScrollTo,
  onClear,
}: CommandBlockListProps) {
  const [expanded, setExpanded] = useState(true);

  if (blocks.length === 0 && !hasShellIntegration) {
    return null;
  }

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ borderTop: "1px solid var(--color-surface-0)" }}
    >
      {/* Header */}
      <button
        type="button"
        className="flex items-center gap-2 px-2 py-1.5 text-xs bg-transparent border-none cursor-pointer w-full text-left hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-subtext-0)" }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Layers size={12} style={{ color: "var(--color-mauve)" }} />
        <span className="font-semibold uppercase tracking-wider text-[10px]">
          Commands
        </span>
        {blocks.length > 0 && (
          <span
            className="ml-auto text-[10px] px-1 rounded"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-overlay-1)",
            }}
          >
            {blocks.length}
          </span>
        )}
        {onClear && blocks.length > 0 && (
          <button
            type="button"
            className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors ml-1"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label="Clear command history"
            title="Clear command history"
          >
            <Trash2 size={10} />
          </button>
        )}
      </button>

      {/* Block list */}
      {expanded && (
        <div className="overflow-y-auto scrollbar-thin px-1 pb-1" style={{ maxHeight: "200px" }}>
          {blocks.length === 0 ? (
            <div
              className="text-[10px] px-2 py-2 text-center"
              style={{ color: "var(--color-overlay-0)" }}
            >
              No commands detected yet.
              {!hasShellIntegration && (
                <span className="block mt-1">
                  Shell integration (OSC 133) not detected. Using prompt heuristics.
                </span>
              )}
            </div>
          ) : (
            [...blocks].reverse().map((block) => (
              <CommandBlockCard
                key={block.id}
                block={block}
                onRerun={onRerun}
                onScrollTo={onScrollTo}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
