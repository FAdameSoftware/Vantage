import { useEffect, useRef } from "react";
import type { editor as monacoEditor } from "monaco-editor";

export type VimModeLabel = "NORMAL" | "INSERT" | "VISUAL" | "REPLACE" | "V-LINE" | "V-BLOCK";

export interface UseVimModeOptions {
  /** The Monaco editor instance to attach vim to (null until mounted) */
  editor: monacoEditor.IStandaloneCodeEditor | null;
  /** Whether vim mode is currently enabled */
  enabled: boolean;
  /** Ref to the DOM node used as monaco-vim's internal status bar target */
  statusbarRef: React.RefObject<HTMLDivElement | null>;
  /** Callback fired when the vim mode label changes */
  onModeChange?: (mode: VimModeLabel) => void;
}

/**
 * Manages the monaco-vim adapter lifecycle. Attaches the vim adapter when
 * `enabled` is true and an editor instance is available; disposes it when
 * disabled or when the component unmounts.
 */
export function useVimMode({
  editor,
  enabled,
  statusbarRef,
  onModeChange,
}: UseVimModeOptions): void {
  // Hold the VimAdapterInstance so we can dispose it on cleanup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vimAdapterRef = useRef<any>(null);

  useEffect(() => {
    const statusbarNode = statusbarRef.current;

    if (!enabled || !editor || !statusbarNode) {
      // Dispose any existing adapter when disabled or no editor yet
      if (vimAdapterRef.current) {
        vimAdapterRef.current.dispose();
        vimAdapterRef.current = null;
        // Reset label when mode is disabled
        onModeChange?.("NORMAL");
      }
      return;
    }

    let disposed = false;

    import("monaco-vim").then(({ initVimMode }) => {
      if (disposed || !editor || !statusbarNode) return;

      const adapter = initVimMode(editor, statusbarNode);
      vimAdapterRef.current = adapter;

      if (onModeChange) {
        // monaco-vim emits vim-mode-change on the adapter via CodeMirror signal
        adapter.on("vim-mode-change", (ev: { mode: string; subMode?: string }) => {
          const { mode, subMode } = ev;
          let label: VimModeLabel = "NORMAL";
          if (mode === "insert") {
            label = "INSERT";
          } else if (mode === "replace") {
            label = "REPLACE";
          } else if (mode === "visual") {
            if (subMode === "linewise") label = "V-LINE";
            else if (subMode === "blockwise") label = "V-BLOCK";
            else label = "VISUAL";
          } else {
            label = "NORMAL";
          }
          onModeChange(label);
        });
      }
    });

    return () => {
      disposed = true;
      if (vimAdapterRef.current) {
        vimAdapterRef.current.dispose();
        vimAdapterRef.current = null;
      }
    };
    // onModeChange is intentionally excluded — it's stable (useEditorStore setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, editor, statusbarRef]);
}
