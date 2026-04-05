import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "vantage-dark" | "vantage-light" | "vantage-high-contrast";

export type ThinkingMode = "auto" | "think" | "think_hard" | "think_harder" | "ultrathink";

export interface SettingsState {
  theme: ThemeName;
  fontSizeEditor: number;
  fontSizeUI: number;
  fontFamily: string;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  /** Column at which lines are wrapped when word wrap is enabled */
  wordWrapColumn: number;
  minimap: boolean;
  lineNumbers: boolean;
  terminalFontSize: number;
  terminalScrollback: number;
  vimMode: boolean;
  /** Whether to show Inkwell the coding buddy in the status bar */
  showBuddy: boolean;
  /** Claude Code effort level: controls reasoning depth */
  effortLevel: "low" | "medium" | "high";
  /** Thinking mode: controls how much reasoning Claude applies */
  thinkingMode: ThinkingMode;
  /** Whether to start sessions in plan mode (--permission-mode plan) */
  planMode: boolean;
  /** Whether to skip all permission prompts (--dangerously-skip-permissions) */
  skipPermissions: boolean;
  /** Whether to auto-format files on save (via Prettier) */
  formatOnSave: boolean;
  /** Editor cursor style */
  cursorStyle: "line" | "block" | "underline";
  /** Editor cursor blink animation style */
  cursorBlinking: "blink" | "smooth" | "expand" | "solid" | "phase";
  /** Whether sticky scroll is enabled in the editor */
  stickyScroll: boolean;
  /** Whether font ligatures are enabled in the editor */
  fontLigatures: boolean;
  /** Controls how whitespace characters are rendered in the editor */
  renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
  /** Model to use for new Claude sessions */
  selectedModel: string;
  /** Auto-save mode: off, save after delay, or save on focus change */
  autoSave: "off" | "afterDelay" | "onFocusChange";
  /** Delay in ms before auto-saving when autoSave is "afterDelay" */
  autoSaveDelay: number;
  /** Whether bracket pair colorization is enabled */
  bracketPairColorization: boolean;
  /** Whether scrolling past the last line is allowed */
  scrollBeyondLastLine: boolean;
  /** Smooth caret animation for cursor movement */
  cursorSmoothCaretAnimation: "off" | "explicit" | "on";
  /** Custom keybinding overrides: keybinding ID -> shortcut string (e.g., "Ctrl+Shift+B") */
  keybindingOverrides: Record<string, { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }>;
  setTheme: (theme: ThemeName) => void;
  setFontSizeEditor: (size: number) => void;
  setFontSizeUI: (size: number) => void;
  setFontFamily: (family: string) => void;
  setTabSize: (size: number) => void;
  setInsertSpaces: (value: boolean) => void;
  setWordWrap: (value: boolean) => void;
  setWordWrapColumn: (col: number) => void;
  setMinimap: (value: boolean) => void;
  setLineNumbers: (value: boolean) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalScrollback: (size: number) => void;
  setVimMode: (value: boolean) => void;
  toggleBuddy: () => void;
  setEffortLevel: (level: "low" | "medium" | "high") => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  setPlanMode: (value: boolean) => void;
  setSkipPermissions: (value: boolean) => void;
  setFormatOnSave: (value: boolean) => void;
  setCursorStyle: (style: "line" | "block" | "underline") => void;
  setCursorBlinking: (style: "blink" | "smooth" | "expand" | "solid" | "phase") => void;
  setStickyScroll: (value: boolean) => void;
  setFontLigatures: (value: boolean) => void;
  setRenderWhitespace: (value: "none" | "boundary" | "selection" | "trailing" | "all") => void;
  setSelectedModel: (model: string) => void;
  setAutoSave: (mode: "off" | "afterDelay" | "onFocusChange") => void;
  setAutoSaveDelay: (ms: number) => void;
  setBracketPairColorization: (value: boolean) => void;
  setScrollBeyondLastLine: (value: boolean) => void;
  setCursorSmoothCaretAnimation: (value: "off" | "explicit" | "on") => void;
  setKeybindingOverride: (id: string, binding: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }) => void;
  removeKeybindingOverride: (id: string) => void;
  resetAllKeybindings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "vantage-dark",
      fontSizeEditor: 14,
      fontSizeUI: 13,
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      tabSize: 2,
      insertSpaces: true,
      wordWrap: false,
      wordWrapColumn: 80,
      minimap: true,
      lineNumbers: true,
      terminalFontSize: 14,
      terminalScrollback: 10000,
      vimMode: false,
      showBuddy: true,
      effortLevel: "high",
      thinkingMode: "auto" as ThinkingMode,
      planMode: false,
      skipPermissions: false,
      formatOnSave: false,
      cursorStyle: "line",
      cursorBlinking: "blink",
      stickyScroll: true,
      fontLigatures: true,
      renderWhitespace: "selection" as const,
      selectedModel: "claude-sonnet-4-6",
      autoSave: "off" as const,
      autoSaveDelay: 1000,
      bracketPairColorization: true,
      scrollBeyondLastLine: true,
      cursorSmoothCaretAnimation: "off" as const,
      keybindingOverrides: {},
      setTheme: (theme) => set({ theme }),
      setFontSizeEditor: (size) => set({ fontSizeEditor: Math.max(8, Math.min(32, size)) }),
      setFontSizeUI: (size) => set({ fontSizeUI: Math.max(10, Math.min(24, size)) }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setTabSize: (size) => set({ tabSize: Math.max(1, Math.min(8, size)) }),
      setInsertSpaces: (value) => set({ insertSpaces: value }),
      setWordWrap: (value) => set({ wordWrap: value }),
      setWordWrapColumn: (col) => set({ wordWrapColumn: Math.max(20, Math.min(500, col)) }),
      setMinimap: (value) => set({ minimap: value }),
      setLineNumbers: (value) => set({ lineNumbers: value }),
      setTerminalFontSize: (size) => set({ terminalFontSize: Math.max(8, Math.min(32, size)) }),
      setTerminalScrollback: (size) => set({ terminalScrollback: Math.max(1000, Math.min(100000, size)) }),
      setVimMode: (value) => set({ vimMode: value }),
      toggleBuddy: () => set((state) => ({ showBuddy: !state.showBuddy })),
      setEffortLevel: (level) => set({ effortLevel: level }),
      setThinkingMode: (mode) => set({ thinkingMode: mode }),
      setPlanMode: (value) => set({ planMode: value }),
      setSkipPermissions: (value) => set({ skipPermissions: value }),
      setFormatOnSave: (value) => set({ formatOnSave: value }),
      setCursorStyle: (style) => set({ cursorStyle: style }),
      setCursorBlinking: (style) => set({ cursorBlinking: style }),
      setStickyScroll: (value) => set({ stickyScroll: value }),
      setFontLigatures: (value) => set({ fontLigatures: value }),
      setRenderWhitespace: (value) => set({ renderWhitespace: value }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setAutoSave: (mode) => set({ autoSave: mode }),
      setAutoSaveDelay: (ms) => set({ autoSaveDelay: Math.max(100, Math.min(10000, ms)) }),
      setBracketPairColorization: (value) => set({ bracketPairColorization: value }),
      setScrollBeyondLastLine: (value) => set({ scrollBeyondLastLine: value }),
      setCursorSmoothCaretAnimation: (value) => set({ cursorSmoothCaretAnimation: value }),
      setKeybindingOverride: (id, binding) =>
        set((state) => ({
          keybindingOverrides: { ...state.keybindingOverrides, [id]: binding },
        })),
      removeKeybindingOverride: (id) =>
        set((state) => {
          const next = { ...state.keybindingOverrides };
          delete next[id];
          return { keybindingOverrides: next };
        }),
      resetAllKeybindings: () => set({ keybindingOverrides: {} }),
    }),
    {
      name: "vantage-settings",
      partialize: (state) => ({
        theme: state.theme,
        fontSizeEditor: state.fontSizeEditor,
        fontSizeUI: state.fontSizeUI,
        fontFamily: state.fontFamily,
        tabSize: state.tabSize,
        insertSpaces: state.insertSpaces,
        wordWrap: state.wordWrap,
        wordWrapColumn: state.wordWrapColumn,
        minimap: state.minimap,
        lineNumbers: state.lineNumbers,
        terminalFontSize: state.terminalFontSize,
        terminalScrollback: state.terminalScrollback,
        vimMode: state.vimMode,
        showBuddy: state.showBuddy,
        effortLevel: state.effortLevel,
        thinkingMode: state.thinkingMode,
        planMode: state.planMode,
        formatOnSave: state.formatOnSave,
        cursorStyle: state.cursorStyle,
        cursorBlinking: state.cursorBlinking,
        stickyScroll: state.stickyScroll,
        fontLigatures: state.fontLigatures,
        renderWhitespace: state.renderWhitespace,
        selectedModel: state.selectedModel,
        autoSave: state.autoSave,
        autoSaveDelay: state.autoSaveDelay,
        bracketPairColorization: state.bracketPairColorization,
        scrollBeyondLastLine: state.scrollBeyondLastLine,
        cursorSmoothCaretAnimation: state.cursorSmoothCaretAnimation,
        keybindingOverrides: state.keybindingOverrides,
      }),
    }
  )
);
