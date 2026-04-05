import { useRef, useCallback, useState, useEffect } from "react";
import Editor, { type OnMount, type OnChange } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { catppuccinMochaTheme } from "./monacoTheme";
import { catppuccinLatteTheme } from "./monacoThemeLatte";
import { highContrastTheme } from "./monacoThemeHighContrast";
import { useSettingsStore } from "@/stores/settings";
import type { ThemeName } from "@/stores/settings";
import { useEditorStore } from "@/stores/editor";
import { useVimMode } from "@/hooks/useVimMode";
import {
  registerOpenedFile,
  updateRegisteredFile,
} from "@/hooks/useCrossFileIntelligence";
import { useInlineEdit } from "@/hooks/useInlineEdit";
import { InlineEditBar } from "./InlineEditBar";
import { InlineEditDiff } from "./InlineEditDiff";

// Configure the loader to use the local monaco-editor package
// instead of loading from CDN
loader.config({ monaco });

// ── TypeScript / JavaScript language intelligence ───────────────────────────
// Monaco 0.55+ moved the TS/JS language API from `monaco.languages.typescript`
// to a top-level `typescript` export. We access it via the star-import as
// `monaco.typescript`. The TS worker provides autocomplete, hover info, and
// red-underline diagnostics for .ts/.tsx/.js/.jsx files automatically, but we
// set explicit compiler options so the experience is predictable.
const tsApi = monaco.typescript;
tsApi.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});
tsApi.typescriptDefaults.setCompilerOptions({
  target: tsApi.ScriptTarget.ESNext,
  module: tsApi.ModuleKind.ESNext,
  allowNonTsExtensions: true,
  moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
  jsx: tsApi.JsxEmit.ReactJSX,
  strict: true,
  allowJs: true,
  esModuleInterop: true,
});
// Apply the same settings for JavaScript files
tsApi.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});
tsApi.javascriptDefaults.setCompilerOptions({
  target: tsApi.ScriptTarget.ESNext,
  module: tsApi.ModuleKind.ESNext,
  allowNonTsExtensions: true,
  moduleResolution: tsApi.ModuleResolutionKind.NodeJs,
  jsx: tsApi.JsxEmit.ReactJSX,
  allowJs: true,
  checkJs: true,
});

// Register all themes once at module level
let themesRegistered = false;
function ensureThemeRegistered() {
  if (!themesRegistered) {
    monaco.editor.defineTheme("catppuccin-mocha", catppuccinMochaTheme);
    monaco.editor.defineTheme("catppuccin-latte", catppuccinLatteTheme);
    monaco.editor.defineTheme("high-contrast", highContrastTheme);
    themesRegistered = true;
  }
}
ensureThemeRegistered();

/** Map settings theme name to registered Monaco theme name */
function getMonacoTheme(theme: ThemeName): string {
  switch (theme) {
    case "vantage-light":
      return "catppuccin-latte";
    case "vantage-high-contrast":
      return "high-contrast";
    case "vantage-dark":
    default:
      return "catppuccin-mocha";
  }
}

interface MonacoEditorProps {
  /** File path used as the editor model URI */
  filePath: string;
  /** Monaco language ID */
  language: string;
  /** Current file content */
  value: string;
  /** Called when user edits content */
  onChange: (value: string) => void;
  /** Read-only mode */
  readOnly?: boolean;
}

export function MonacoEditor({
  filePath,
  language,
  value,
  onChange,
  readOnly = false,
}: MonacoEditorProps) {
  // Store the mounted editor instance in state so the vim hook re-runs when it
  // becomes available (useEffect deps work on state, not mutable refs).
  const [editorInstance, setEditorInstance] =
    useState<monacoEditor.IStandaloneCodeEditor | null>(null);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const vimStatusbarRef = useRef<HTMLDivElement | null>(null);

  // Read settings
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSizeEditor = useSettingsStore((s) => s.fontSizeEditor);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const minimapEnabled = useSettingsStore((s) => s.minimap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbers);
  const themeName = useSettingsStore((s) => s.theme);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const cursorStyle = useSettingsStore((s) => s.cursorStyle);
  const monacoTheme = getMonacoTheme(themeName);

  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const pinTab = useEditorStore((s) => s.pinTab);
  const setVimModeLabel = useEditorStore((s) => s.setVimModeLabel);

  // Attach/detach the vim adapter whenever the editor instance or vimMode changes
  useVimMode({
    editor: editorInstance,
    enabled: vimMode,
    statusbarRef: vimStatusbarRef,
    onModeChange: setVimModeLabel,
  });

  // Inline AI Edit (Ctrl+K)
  const inlineEdit = useInlineEdit(editorInstance);

  // Register this file with the cross-file TS intelligence system on mount
  useEffect(() => {
    registerOpenedFile(filePath, value);
    // Only register on mount, not on every value change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      setEditorInstance(editor);

      // Listen for cursor position changes
      editor.onDidChangeCursorPosition((e) => {
        setCursorPosition({
          line: e.position.lineNumber,
          column: e.position.column,
        });
      });

      // Pin preview tab on first edit and update cross-file registration
      const tabId = filePath
        .replace(/\\/g, "/")
        .replace(/^([A-Z]):/, (m) => m.toLowerCase());
      editor.onDidChangeModelContent(() => {
        pinTab(tabId);
        // Keep the TS worker in sync with editor content
        const model = editor.getModel();
        if (model) {
          updateRegisteredFile(filePath, model.getValue());
        }
      });

      // Register "Jump to Matching Bracket" keybinding (Ctrl+Shift+\)
      editor.addAction({
        id: "editor.action.jumpToBracket",
        label: "Jump to Matching Bracket",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Backslash,
        ],
        run: (ed) => {
          const action = ed.getAction("editor.action.jumpToBracket");
          if (action) action.run();
        },
      });

      // Register Ctrl+K for Inline AI Edit
      editor.addAction({
        id: "vantage.inlineAIEdit",
        label: "Inline AI Edit",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        ],
        run: () => {
          inlineEdit.open();
        },
      });

      // Focus the editor
      editor.focus();
    },
    [filePath, setCursorPosition, pinTab, inlineEdit]
  );

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  // Global keyboard handler for inline edit accept/reject
  useEffect(() => {
    if (!inlineEdit.state.showDiff) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        inlineEdit.accept();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        inlineEdit.reject();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [inlineEdit]);

  return (
    <div className="w-full h-full flex flex-col" data-allow-select="true">
      <div className="flex-1 min-h-0">
        <Editor
          path={filePath}
          language={language}
          value={value}
          theme={monacoTheme}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          options={{
            fontFamily,
            fontSize: fontSizeEditor,
            fontLigatures: true,
            tabSize,
            insertSpaces,
            wordWrap: wordWrap ? "on" : "off",
            minimap: {
              enabled: minimapEnabled,
              showSlider: "always",
              renderCharacters: true,
              maxColumn: 80,
            },
            lineNumbers: lineNumbers ? "on" : "off",
            readOnly,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            cursorStyle,
            renderLineHighlight: "line",
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            autoSurround: "languageDefined",
            stickyScroll: { enabled: true, maxLineCount: 5 },
            padding: { top: 8 },
            overviewRulerLanes: 0,
            fixedOverflowWidgets: true,
          }}
        />
      </div>
      {/* Hidden div that monaco-vim uses as its internal status bar DOM node.
          The StatusBar component reads the mode from the editor store. */}
      <div
        ref={vimStatusbarRef}
        aria-hidden="true"
        style={{ display: "none" }}
      />

      {/* Inline AI Edit: floating prompt bar */}
      {inlineEdit.state.isOpen && !inlineEdit.state.showDiff && inlineEdit.state.position && (
        <InlineEditBar
          position={inlineEdit.state.position}
          isLoading={inlineEdit.state.isLoading}
          onSubmit={inlineEdit.submit}
          onClose={inlineEdit.close}
        />
      )}

      {/* Inline AI Edit: diff preview */}
      {inlineEdit.state.showDiff && inlineEdit.state.position && inlineEdit.state.suggestedText !== null && (
        <InlineEditDiff
          position={inlineEdit.state.position}
          originalText={inlineEdit.state.originalText}
          suggestedText={inlineEdit.state.suggestedText}
          isLoading={inlineEdit.state.isLoading}
          error={inlineEdit.state.error}
          onAccept={inlineEdit.accept}
          onReject={inlineEdit.reject}
        />
      )}
    </div>
  );
}
