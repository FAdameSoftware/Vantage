import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as monaco from "monaco-editor";
import { useEditorStore, selectActiveTab, selectCursorPosition, selectSelectionLineCount } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { popupMotion, vimModeLabelColor, getLanguageDisplayName } from "./shared";

// ── Language Selector Dropdown ────────────────────────────────────────────

const COMMON_LANGUAGES = [
  "typescript", "javascript", "rust", "python", "json", "toml", "yaml",
  "markdown", "html", "css", "shell", "go", "java", "c", "cpp",
  "sql", "graphql", "plaintext",
];

function LanguageSelectorDropdown({
  currentLanguage,
  onClose,
}: {
  currentLanguage: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="absolute bottom-7 right-0 z-50 rounded shadow-lg py-1 min-w-[160px] max-h-[240px] overflow-auto scrollbar-thin"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="listbox"
      aria-label="Language selector"
      {...popupMotion}
    >
      {COMMON_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          role="option"
          aria-selected={currentLanguage === lang}
          className="flex items-center w-full px-3 py-1 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
          onClick={() => {
            // Set the language on the active Monaco editor model
            const editors = monaco.editor.getEditors();
            if (editors.length > 0) {
              const model = editors[0].getModel();
              if (model) {
                monaco.editor.setModelLanguage(model, lang);
              }
            }
            onClose();
          }}
        >
          <span
            style={{
              color:
                currentLanguage === lang
                  ? "var(--color-blue)"
                  : "var(--color-text)",
            }}
          >
            {getLanguageDisplayName(lang)}
          </span>
          {currentLanguage === lang && (
            <span
              className="ml-auto text-[10px]"
              style={{ color: "var(--color-blue)" }}
            >
              Active
            </span>
          )}
        </button>
      ))}
    </motion.div>
  );
}

// ── Tab Size Selector Dropdown ────────────────────────────────────────────

function TabSizeSelectorDropdown({
  tabSize,
  insertSpaces,
  onTabSizeChange,
  onInsertSpacesChange,
  onClose,
}: {
  tabSize: number;
  insertSpaces: boolean;
  onTabSizeChange: (size: number) => void;
  onInsertSpacesChange: (v: boolean) => void;
  onClose: () => void;
}) {
  const TAB_SIZES = [1, 2, 3, 4, 6, 8];

  return (
    <motion.div
      className="absolute bottom-7 right-0 z-50 rounded shadow-lg py-1 min-w-[180px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="listbox"
      aria-label="Indentation settings"
      {...popupMotion}
    >
      {/* Indent using spaces vs tabs */}
      <button
        type="button"
        className="flex items-center w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
        onClick={() => onInsertSpacesChange(true)}
      >
        <span style={{ color: insertSpaces ? "var(--color-blue)" : "var(--color-text)" }}>
          Indent Using Spaces
        </span>
        {insertSpaces && (
          <span className="ml-auto text-[10px]" style={{ color: "var(--color-blue)" }}>
            active
          </span>
        )}
      </button>
      <button
        type="button"
        className="flex items-center w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
        onClick={() => onInsertSpacesChange(false)}
      >
        <span style={{ color: !insertSpaces ? "var(--color-blue)" : "var(--color-text)" }}>
          Indent Using Tabs
        </span>
        {!insertSpaces && (
          <span className="ml-auto text-[10px]" style={{ color: "var(--color-blue)" }}>
            active
          </span>
        )}
      </button>

      <div className="my-0.5" style={{ borderTop: "1px solid var(--color-surface-1)" }} />

      {/* Tab size options */}
      <div
        className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--color-overlay-1)" }}
      >
        {insertSpaces ? "Spaces per Tab" : "Tab Size"}
      </div>
      {TAB_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          role="option"
          aria-selected={tabSize === size}
          className="flex items-center w-full px-3 py-1 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
          onClick={() => onTabSizeChange(size)}
        >
          <span style={{ color: tabSize === size ? "var(--color-blue)" : "var(--color-text)" }}>
            {size}
          </span>
          {tabSize === size && (
            <span className="ml-auto text-[10px]" style={{ color: "var(--color-blue)" }}>
              current
            </span>
          )}
        </button>
      ))}

      <div className="my-0.5" style={{ borderTop: "1px solid var(--color-surface-1)" }} />
      <button
        type="button"
        className="flex items-center w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={onClose}
      >
        Cancel
      </button>
    </motion.div>
  );
}

// ── EditorInfo Component ──────────────────────────────────────────────────

export interface EditorInfoProps {
  windowWidth: number;
}

export function EditorInfo({ windowWidth }: EditorInfoProps) {
  const cursorPosition = useEditorStore(selectCursorPosition);
  const selectionLineCount = useEditorStore(selectSelectionLineCount);
  const vimModeLabel = useEditorStore((s) => s.vimModeLabel);
  const activeTab = useEditorStore(selectActiveTab);

  const vimMode = useSettingsStore((s) => s.vimMode);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const setTabSize = useSettingsStore((s) => s.setTabSize);
  const setInsertSpaces = useSettingsStore((s) => s.setInsertSpaces);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);

  const openPalette = useCommandPaletteStore((s) => s.open);

  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showTabSizeSelector, setShowTabSizeSelector] = useState(false);
  const [eol, setEol] = useState<"LF" | "CRLF">("LF");
  const languageSelectorRef = useRef<HTMLDivElement>(null);
  const tabSizeSelectorRef = useRef<HTMLDivElement>(null);

  // Read EOL from the active Monaco editor model whenever the active tab changes
  useEffect(() => {
    const editors = monaco.editor.getEditors();
    if (editors.length === 0) return;
    const model = editors[0].getModel();
    if (!model) return;
    // Monaco EndOfLineSequence: 0 = LF, 1 = CRLF
    const eolSeq = model.getEndOfLineSequence();
    setEol(eolSeq === 1 ? "CRLF" : "LF");
  }, [activeTab]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showLanguageSelector && !showTabSizeSelector) return;
    function handleClick(e: MouseEvent) {
      if (
        showLanguageSelector &&
        languageSelectorRef.current &&
        !languageSelectorRef.current.contains(e.target as Node)
      ) {
        setShowLanguageSelector(false);
      }
      if (
        showTabSizeSelector &&
        tabSizeSelectorRef.current &&
        !tabSizeSelectorRef.current.contains(e.target as Node)
      ) {
        setShowTabSizeSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLanguageSelector, showTabSizeSelector]);

  const handleLineColClick = () => {
    openPalette("goto");
  };

  const handleLanguageClick = () => {
    // Try to invoke Monaco's built-in change language mode action
    const editors = monaco.editor.getEditors();
    if (editors.length > 0) {
      const action = editors[0].getAction("editor.action.changeLanguageMode");
      if (action) {
        action.run();
        return;
      }
    }
    // Fallback: toggle dropdown
    setShowLanguageSelector((v) => !v);
  };

  const handleEolClick = useCallback(() => {
    // Toggle between LF and CRLF in the active Monaco editor model
    const editors = monaco.editor.getEditors();
    if (editors.length === 0) return;
    const model = editors[0].getModel();
    if (!model) return;
    const newEol = eol === "LF" ? "CRLF" : "LF";
    // Monaco EndOfLineSequence: 0 = LF, 1 = CRLF
    model.setEOL(newEol === "CRLF" ? 1 : 0);
    setEol(newEol);
  }, [eol]);

  // Map language IDs to display names
  const languageDisplayName = activeTab
    ? getLanguageDisplayName(activeTab.language)
    : "Plain Text";

  return (
    <>
      {/* Vim mode indicator */}
      {vimMode && (
        <span
          className="font-mono font-semibold px-1 rounded text-[10px] shrink-0"
          style={{
            backgroundColor: vimModeLabelColor(vimModeLabel),
            color: "var(--color-base)",
          }}
          aria-label={`Vim mode: ${vimModeLabel}`}
        >
          {vimModeLabel}
        </span>
      )}

      {/* Line and column -> click opens go-to-line dialog */}
      <button
        className="hover:text-[var(--color-text)] transition-colors whitespace-nowrap shrink-0"
        onClick={handleLineColClick}
        title="Go to Line (Ctrl+G)"
      >
        Ln {cursorPosition.line}, Col {cursorPosition.column}
        {selectionLineCount > 1 && (
          <span
            className="ml-1"
            aria-label={`${selectionLineCount} lines selected`}
            title={`${selectionLineCount} lines selected`}
          >
            ({selectionLineCount} lines selected)
          </span>
        )}
      </button>

      {/* Divider */}
      {activeTab && windowWidth >= 800 && (
        <div className="w-px h-2.5" style={{ backgroundColor: "var(--color-surface-1)" }} />
      )}

      {/* EOL (line ending) — hidden below 800px */}
      {activeTab && windowWidth >= 800 && (
        <button
          className="hover:text-[var(--color-text)] transition-colors shrink-0"
          onClick={handleEolClick}
          title={`Line Ending: ${eol}. Click to toggle.`}
          aria-label={`Line ending: ${eol}. Click to toggle between LF and CRLF.`}
        >
          {eol}
        </button>
      )}

      {/* Encoding — hidden below 800px */}
      {activeTab && windowWidth >= 800 && (
        <span
          className="cursor-default shrink-0"
          title="File encoding: UTF-8"
          aria-label="Encoding: UTF-8"
        >
          UTF-8
        </span>
      )}

      {/* Tab size — hidden below 800px */}
      {activeTab && windowWidth >= 800 && (
        <div ref={tabSizeSelectorRef} className="relative shrink-0">
          <button
            className="hover:text-[var(--color-text)] transition-colors"
            onClick={() => setShowTabSizeSelector((v) => !v)}
            title="Indentation settings. Click to change."
            aria-label={`Indentation: ${insertSpaces ? "Spaces" : "Tab"}: ${tabSize}. Click to change.`}
          >
            {insertSpaces ? "Spaces" : "Tab"}: {tabSize}
          </button>
          <AnimatePresence>
            {showTabSizeSelector && (
              <TabSizeSelectorDropdown
                tabSize={tabSize}
                insertSpaces={insertSpaces}
                onTabSizeChange={(size) => { setTabSize(size); setShowTabSizeSelector(false); }}
                onInsertSpacesChange={(v) => { setInsertSpaces(v); setShowTabSizeSelector(false); }}
                onClose={() => setShowTabSizeSelector(false)}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Auto-save indicator -> click cycles through modes */}
      {autoSave !== "off" && (
        <button
          className="hover:text-[var(--color-text)] transition-colors shrink-0"
          style={{ color: "var(--color-green)" }}
          onClick={() =>
            setAutoSave(
              autoSave === "afterDelay" ? "onFocusChange" : "off",
            )
          }
          title={`Auto Save: ${autoSave === "afterDelay" ? "After Delay" : "On Focus Change"}. Click to cycle.`}
          aria-label={`Auto save mode: ${autoSave}. Click to cycle.`}
        >
          Auto
        </button>
      )}

      {/* Word Wrap toggle — hidden below 800px */}
      {windowWidth >= 800 && (
        <button
          className="hover:text-[var(--color-text)] transition-colors shrink-0"
          style={{
            color: wordWrap ? "var(--color-blue)" : undefined,
          }}
          onClick={() => setWordWrap(!wordWrap)}
          title={wordWrap ? "Disable Word Wrap" : "Enable Word Wrap"}
          aria-label={wordWrap ? "Word wrap on. Click to disable." : "Word wrap off. Click to enable."}
          aria-pressed={wordWrap}
        >
          {wordWrap ? "Wrap: On" : "Wrap: Off"}
        </button>
      )}

      {/* Divider */}
      <div className="w-px h-2.5" style={{ backgroundColor: "var(--color-surface-1)" }} />

      {/* Language -> click opens language selector */}
      <div ref={languageSelectorRef} className="relative shrink-0">
        <button
          className="hover:text-[var(--color-text)] transition-colors truncate max-w-[120px]"
          onClick={handleLanguageClick}
          title="Select Language Mode"
        >
          {languageDisplayName}
        </button>
        <AnimatePresence>
          {showLanguageSelector && (
            <LanguageSelectorDropdown
              currentLanguage={activeTab?.language ?? "plaintext"}
              onClose={() => setShowLanguageSelector(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
