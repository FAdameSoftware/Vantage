import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { catppuccinMochaTerminalTheme } from "@/components/terminal/terminalTheme";
import { useSettingsStore } from "@/stores/settings";

import "@xterm/xterm/css/xterm.css";

interface UseTerminalOptions {
  /** Shell executable path */
  shellPath: string;
  /** Shell arguments */
  shellArgs: string[];
  /** Working directory */
  cwd?: string;
}

interface UseTerminalReturn {
  /** Ref to attach to the container div */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The xterm.js Terminal instance */
  terminalRef: React.RefObject<Terminal | null>;
  /** Fit the terminal to its container */
  fit: () => void;
  /** Search within the terminal */
  search: (query: string) => void;
  /** Clear search highlights */
  clearSearch: () => void;
}

export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const ptyRef = useRef<ReturnType<typeof import("tauri-pty").spawn> | null>(null);

  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const terminalScrollback = useSettingsStore((s) => s.terminalScrollback);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily,
      fontSize: terminalFontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: terminalScrollback,
      theme: catppuccinMochaTerminalTheme,
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);

    // Try WebGL renderer, fall back to DOM
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        // WebGL context lost -- the DOM renderer is the automatic fallback
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, DOM renderer works fine
    }

    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Connect to PTY via tauri-pty
    // The tauri-pty package provides a `spawn` function that creates
    // a PTY process and returns a handle with onData/write/resize methods
    let cleanupPty: (() => void) | null = null;

    (async () => {
      try {
        const { spawn } = await import("tauri-pty");

        const pty = spawn(options.shellPath, options.shellArgs, {
          cols: terminal.cols,
          rows: terminal.rows,
          cwd: options.cwd,
        });

        ptyRef.current = pty;

        // PTY -> Terminal (data from shell to display)
        const dataDisposable = pty.onData((data: string) => {
          terminal.write(data);
        });

        // Terminal -> PTY (user keystrokes to shell)
        const inputDisposable = terminal.onData((data: string) => {
          pty.write(data);
        });

        // Terminal resize -> PTY resize
        const resizeDisposable = terminal.onResize(
          ({ cols, rows }: { cols: number; rows: number }) => {
            pty.resize(cols, rows);
          }
        );

        // PTY exit
        const exitDisposable = pty.onExit(
          ({ exitCode }: { exitCode: number }) => {
            terminal.writeln(
              `\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`
            );
          }
        );

        cleanupPty = () => {
          dataDisposable.dispose();
          inputDisposable.dispose();
          resizeDisposable.dispose();
          exitDisposable.dispose();
          pty.kill();
        };
      } catch (e) {
        terminal.writeln(
          `\x1b[31mFailed to spawn terminal: ${e}\x1b[0m`
        );
        terminal.writeln(
          "\x1b[90mMake sure tauri-plugin-pty is properly configured.\x1b[0m"
        );
      }
    })();

    return () => {
      if (cleanupPty) cleanupPty();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      ptyRef.current = null;
    };
  }, [options.shellPath, options.cwd]); // Re-create if shell or cwd changes

  // Update font settings without recreating the terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = terminalFontSize;
    fitAddonRef.current?.fit();
  }, [fontFamily, terminalFontSize]);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const search = useCallback((query: string) => {
    searchAddonRef.current?.findNext(query);
  }, []);

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
  }, []);

  return {
    containerRef,
    terminalRef,
    fit,
    search,
    clearSearch,
  };
}
