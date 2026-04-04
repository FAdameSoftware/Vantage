import { useCallback } from "react";
import { DiffEditor, type DiffOnMount, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Check, X } from "lucide-react";
import { useEditorStore, type PendingDiff } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { catppuccinMochaTheme } from "./monacoTheme";

// Use the same local monaco bundle as MonacoEditor
loader.config({ monaco });

// Register Catppuccin Mocha theme for the diff editor
let themeRegistered = false;
function ensureThemeRegistered() {
  if (!themeRegistered) {
    monaco.editor.defineTheme("catppuccin-mocha", catppuccinMochaTheme);
    themeRegistered = true;
  }
}
ensureThemeRegistered();

interface DiffViewerProps {
  /** The pending diff to display */
  diff: PendingDiff;
  /** Monaco language ID for syntax highlighting */
  language: string;
}

export function DiffViewer({ diff, language }: DiffViewerProps) {
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSizeEditor);

  const handleMount: DiffOnMount = useCallback((editor) => {
    editor.focus();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Diff toolbar */}
      <div
        className="flex items-center justify-between px-3 h-8 shrink-0"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        <span className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          {diff.description || "AI Edit — Review Changes"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => acceptDiff(diff.tabId)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-green)",
              color: "var(--color-crust)",
            }}
            aria-label="Accept changes"
          >
            <Check size={12} />
            Accept
          </button>
          <button
            onClick={() => rejectDiff(diff.tabId)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-red)",
              color: "var(--color-crust)",
            }}
            aria-label="Reject changes"
          >
            <X size={12} />
            Reject
          </button>
        </div>
      </div>

      {/* Monaco Diff Editor — read-only, inline (not side-by-side) */}
      <div className="flex-1 overflow-hidden" data-allow-select="true">
        <DiffEditor
          original={diff.originalContent}
          modified={diff.modifiedContent}
          language={language}
          theme="catppuccin-mocha"
          onMount={handleMount}
          options={{
            fontFamily,
            fontSize,
            readOnly: true,
            renderSideBySide: false,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            renderOverviewRuler: false,
            padding: { top: 8 },
            smoothScrolling: true,
            cursorBlinking: "smooth",
          }}
        />
      </div>
    </div>
  );
}
