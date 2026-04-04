import { useRef, useCallback } from "react";
import Editor, { type OnMount, type OnChange } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { catppuccinMochaTheme } from "./monacoTheme";
import { useSettingsStore } from "@/stores/settings";
import { useEditorStore } from "@/stores/editor";

// Configure the loader to use the local monaco-editor package
// instead of loading from CDN
loader.config({ monaco });

// Register theme once at module level
let themeRegistered = false;
function ensureThemeRegistered() {
  if (!themeRegistered) {
    monaco.editor.defineTheme("catppuccin-mocha", catppuccinMochaTheme);
    themeRegistered = true;
  }
}
ensureThemeRegistered();

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
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);

  // Read settings
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSizeEditor = useSettingsStore((s) => s.fontSizeEditor);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const minimapEnabled = useSettingsStore((s) => s.minimap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbers);

  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const pinTab = useEditorStore((s) => s.pinTab);

  const handleEditorDidMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;

      // Listen for cursor position changes
      editor.onDidChangeCursorPosition((e) => {
        setCursorPosition({
          line: e.position.lineNumber,
          column: e.position.column,
        });
      });

      // Pin preview tab on first edit
      const tabId = filePath
        .replace(/\\/g, "/")
        .replace(/^([A-Z]):/, (m) => m.toLowerCase());
      editor.onDidChangeModelContent(() => {
        pinTab(tabId);
      });

      // Focus the editor
      editor.focus();
    },
    [filePath, setCursorPosition, pinTab]
  );

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  return (
    <div className="w-full h-full" data-allow-select="true">
      <Editor
        path={filePath}
        language={language}
        value={value}
        theme="catppuccin-mocha"
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          fontFamily,
          fontSize: fontSizeEditor,
          tabSize,
          insertSpaces,
          wordWrap: wordWrap ? "on" : "off",
          minimap: { enabled: minimapEnabled },
          lineNumbers: lineNumbers ? "on" : "off",
          readOnly,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          renderLineHighlight: "line",
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          padding: { top: 8 },
          overviewRulerLanes: 0,
          fixedOverflowWidgets: true,
        }}
      />
    </div>
  );
}
