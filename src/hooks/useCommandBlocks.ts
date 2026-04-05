import { useState, useCallback, useRef, useEffect } from "react";
import type { Terminal } from "@xterm/xterm";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandBlock {
  /** Unique ID for this block */
  id: string;
  /** The command text that was executed */
  command: string;
  /** Timestamp when the command started */
  startedAt: number;
  /** Timestamp when the command finished (null if still running) */
  finishedAt: number | null;
  /** Exit code (null if still running or unknown) */
  exitCode: number | null;
  /** Duration in milliseconds (null if still running) */
  durationMs: number | null;
  /** Starting line in the terminal buffer */
  startLine: number;
  /** Ending line in the terminal buffer (null if still running) */
  endLine: number | null;
}

// ─── Prompt detection heuristic ─────────────────────────────────────────────

/**
 * Detects whether a line of terminal output looks like a shell prompt.
 * Supports common patterns: `$ `, `> `, `PS> `, `PS C:\...> `, `user@host:~$ `
 */
function isPromptLine(line: string): boolean {
  const trimmed = line.trimEnd();
  if (!trimmed) return false;

  // Common prompt endings
  if (/\$\s*$/.test(trimmed)) return true;
  if (/>\s*$/.test(trimmed) && /^(PS|>>>)/.test(trimmed)) return true;
  // user@host patterns
  if (/^\S+@\S+.*\$\s*$/.test(trimmed)) return true;
  // Simple `> ` at start (PowerShell, Node REPL)
  if (/^[A-Z]:\\.*>\s*$/.test(trimmed)) return true;

  return false;
}

/**
 * Extracts the command from a prompt line by stripping the prompt prefix.
 */
function extractCommand(line: string): string {
  const trimmed = line.trimEnd();

  // Strip everything up to and including `$ `
  const dollarMatch = trimmed.match(/\$\s+(.+)$/);
  if (dollarMatch) return dollarMatch[1];

  // Strip PS prompt: `PS C:\foo> command`
  const psMatch = trimmed.match(/^PS\s.*>\s+(.+)$/);
  if (psMatch) return psMatch[1];

  // Strip Windows path prompt: `C:\Users\foo> command`
  const winMatch = trimmed.match(/^[A-Z]:\\.*>\s+(.+)$/);
  if (winMatch) return winMatch[1];

  // Fallback: take everything after the last `> ` or `$ `
  const genericMatch = trimmed.match(/[>$]\s+(.+)$/);
  if (genericMatch) return genericMatch[1];

  return trimmed;
}

// ─── OSC 133 parsing ─────────────────────────────────────────────────────────

// OSC 133 shell integration sequences:
// - `\x1b]133;A\x07` — prompt start
// - `\x1b]133;B\x07` — command start (user pressed Enter)
// - `\x1b]133;C\x07` — command output start
// - `\x1b]133;D;exitcode\x07` — command finished with exit code
// Detected via xterm.js parser.registerOscHandler(133, ...) below.

// ─── Hook ───────────────────────────────────────────────────────────────────

interface UseCommandBlocksOptions {
  terminal: Terminal | null;
  enabled: boolean;
}

interface UseCommandBlocksReturn {
  blocks: CommandBlock[];
  /** Whether we detected shell integration (OSC 133) */
  hasShellIntegration: boolean;
  /** Clear all blocks */
  clearBlocks: () => void;
}

let nextBlockId = 0;

export function useCommandBlocks({
  terminal,
  enabled,
}: UseCommandBlocksOptions): UseCommandBlocksReturn {
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);
  const [hasShellIntegration, setHasShellIntegration] = useState(false);
  const currentBlockRef = useRef<CommandBlock | null>(null);
  const bufferRef = useRef("");

  const clearBlocks = useCallback(() => {
    setBlocks([]);
    currentBlockRef.current = null;
  }, []);

  // Finalize the current block
  const finalizeBlock = useCallback(
    (exitCode: number | null) => {
      const current = currentBlockRef.current;
      if (!current) return;

      const now = Date.now();
      const cursorY = terminal?.buffer?.active?.cursorY ?? 0;
      const baseY = terminal?.buffer?.active?.baseY ?? 0;
      const finalized: CommandBlock = {
        ...current,
        finishedAt: now,
        exitCode,
        durationMs: now - current.startedAt,
        endLine: baseY + cursorY,
      };

      setBlocks((prev) => [...prev, finalized]);
      currentBlockRef.current = null;
    },
    [terminal],
  );

  // Start a new block
  const startBlock = useCallback(
    (command: string) => {
      // Finalize any existing block without an exit code
      if (currentBlockRef.current) {
        finalizeBlock(null);
      }

      const cursorY = terminal?.buffer?.active?.cursorY ?? 0;
      const baseY = terminal?.buffer?.active?.baseY ?? 0;

      const block: CommandBlock = {
        id: `block-${nextBlockId++}`,
        command: command.trim(),
        startedAt: Date.now(),
        finishedAt: null,
        exitCode: null,
        durationMs: null,
        startLine: baseY + cursorY,
        endLine: null,
      };

      currentBlockRef.current = block;
    },
    [terminal, finalizeBlock],
  );

  // Listen to terminal data for block boundary detection
  useEffect(() => {
    if (!terminal || !enabled) return;

    const disposable = terminal.onData(() => {
      // We use onWriteParsed or onData for detection
    });

    // Listen to data written TO the terminal (from the PTY)
    const writeDisposable = terminal.onWriteParsed(() => {
      // After each write, scan the current line for prompt patterns
      const buffer = terminal.buffer.active;
      if (!buffer) return;

      const cursorY = buffer.cursorY;
      const line = buffer.getLine(buffer.baseY + cursorY);
      if (!line) return;

      const lineText = line.translateToString(true);
      bufferRef.current = lineText;
    });

    return () => {
      disposable.dispose();
      writeDisposable.dispose();
    };
  }, [terminal, enabled]);

  // Detect OSC 133 sequences and heuristic prompt patterns from raw data
  useEffect(() => {
    if (!terminal || !enabled) return;

    // We intercept raw data before it's parsed by xterm to detect OSC 133
    // Use a parser hook on the terminal's input handler
    let pendingPromptCommand = "";

    // Intercept raw data written to terminal via a custom write handler
    // We wrap the approach: listen for data events from PTY via onData on the
    // terminal before writing. But since useTerminal.ts wires PTY -> terminal.write,
    // we can use terminal.parser.registerOscHandler for OSC 133.

    // Register OSC 133 handlers
    const oscHandlers: { dispose: () => void }[] = [];

    try {
      // OSC 133 ; B — command start (user pressed Enter after typing)
      oscHandlers.push(
        terminal.parser.registerOscHandler(133, (data) => {
          if (data.startsWith("B")) {
            setHasShellIntegration(true);
            // The command text was on the prompt line before this
            const buffer = terminal.buffer.active;
            const cursorY = buffer.cursorY;
            const line = buffer.getLine(buffer.baseY + cursorY);
            const lineText = line ? line.translateToString(true) : "";
            const command = extractCommand(lineText);
            if (command) {
              startBlock(command);
            }
          }
          return false; // don't consume, let xterm process it
        }),
      );

      // OSC 133 ; D ; exitcode — command finished
      oscHandlers.push(
        terminal.parser.registerOscHandler(133, (data) => {
          if (data.startsWith("D")) {
            setHasShellIntegration(true);
            const exitCodeStr = data.replace(/^D;?/, "");
            const exitCode = exitCodeStr ? parseInt(exitCodeStr, 10) : 0;
            finalizeBlock(isNaN(exitCode) ? null : exitCode);
          }
          return false;
        }),
      );
    } catch {
      // Parser hooks not available — fall back to heuristic only
    }

    // Heuristic fallback: detect prompts when the user presses Enter
    const inputDisposable = terminal.onData((data) => {
      // Detect Enter key from user input
      if (data === "\r" || data === "\n") {
        const currentLine = bufferRef.current;
        if (currentLine && !hasShellIntegration) {
          // Check if current line looks like "prompt$ command"
          const command = extractCommand(currentLine);
          if (command && command !== currentLine) {
            startBlock(command);
          } else if (pendingPromptCommand) {
            // If we detected a prompt previously, this Enter finalizes it
            startBlock(pendingPromptCommand);
            pendingPromptCommand = "";
          }
        }
      }
    });

    // Heuristic: when a prompt line appears after output, finalize the previous block
    const writeDisposable = terminal.onWriteParsed(() => {
      if (hasShellIntegration) return; // OSC 133 handles this
      const buffer = terminal.buffer.active;
      if (!buffer) return;

      const cursorY = buffer.cursorY;
      const line = buffer.getLine(buffer.baseY + cursorY);
      if (!line) return;

      const lineText = line.translateToString(true);

      if (isPromptLine(lineText) && currentBlockRef.current) {
        // A prompt appeared — finalize the current block
        finalizeBlock(null);
      }
    });

    return () => {
      for (const h of oscHandlers) h.dispose();
      inputDisposable.dispose();
      writeDisposable.dispose();
    };
  }, [terminal, enabled, hasShellIntegration, startBlock, finalizeBlock]);

  return { blocks, hasShellIntegration, clearBlocks };
}
