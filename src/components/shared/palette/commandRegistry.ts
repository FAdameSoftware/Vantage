import {
  Terminal,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Settings,
  Search,
  GitBranch,
  Bot,
  Hash,
  FileCode,
  Download,
  BarChart3,
  Palette,
  BookOpen,
  Globe,
  Keyboard,
  Maximize2,
  Puzzle,
  MessageSquare,
  Brain,
  Columns2,
  Trash2,
} from "lucide-react";
import { createElement } from "react";
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import { useSettingsStore } from "@/stores/settings";
import type { ThemeName } from "@/stores/settings";
import { useConversationStore } from "@/stores/conversation";
import * as monaco from "monaco-editor";

// ── Types ─────────────────────────────────────────────────────────────

export interface CommandDef {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

const THEME_CYCLE: ThemeName[] = ["vantage-dark", "vantage-light", "vantage-high-contrast"];

function icon(Icon: React.FC<{ className?: string }>) {
  return createElement(Icon, { className: "size-4 shrink-0 text-muted-foreground" });
}

function runMonacoAction(actionId: string) {
  const editors = monaco.editor.getEditors();
  if (editors.length > 0) {
    const action = editors[0].getAction(actionId);
    if (action) action.run();
  }
}

// ── Actions Context ─────────────────────────────────────────────────

export interface CommandActions {
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  togglePanel: () => void;
  toggleZenMode: () => void;
  setActiveActivityBarItem: (item: string) => void;
  openFile: (path: string, name: string, language: string, content: string) => void;
  setTheme: (theme: ThemeName) => void;
  cycleTheme: () => void;
  setStickyScroll: (val: boolean) => void;
  setFontLigatures: (val: boolean) => void;
  setCursorStyle: (val: string) => void;
  setRenderWhitespace: (val: string) => void;
  setBracketPairColorization: (val: boolean) => void;
  setScrollBeyondLastLine: (val: boolean) => void;
  setCursorSmoothCaretAnimation: (val: string) => void;
  setAutoSave: (val: string) => void;
  openRecentPalette: () => void;
  // Current state for dynamic labels
  stickyScroll: boolean;
  fontLigatures: boolean;
  renderWhitespace: string;
  bracketPairColorization: boolean;
  scrollBeyondLastLine: boolean;
  cursorSmoothCaretAnimation: string;
  autoSave: string;
}

// ── Command Registry Factory ────────────────────────────────────────

export function createCommands(actions: CommandActions): CommandDef[] {
  return [
    {
      id: "toggle-primary-sidebar",
      label: "Toggle Primary Sidebar",
      shortcut: "Ctrl+B",
      icon: icon(PanelLeft),
      category: "View",
      action: actions.togglePrimarySidebar,
    },
    {
      id: "toggle-secondary-sidebar",
      label: "Toggle Secondary Sidebar / Chat",
      shortcut: "Ctrl+Shift+B",
      icon: icon(PanelRight),
      category: "View",
      action: actions.toggleSecondarySidebar,
    },
    {
      id: "toggle-panel",
      label: "Toggle Panel / Terminal",
      shortcut: "Ctrl+J",
      icon: icon(PanelBottom),
      category: "View",
      action: actions.togglePanel,
    },
    {
      id: "focus-explorer",
      label: "Focus File Explorer",
      shortcut: "Ctrl+Shift+E",
      icon: icon(FileCode),
      category: "View",
      action: () => actions.setActiveActivityBarItem("explorer"),
    },
    {
      id: "focus-search",
      label: "Focus Search",
      shortcut: "Ctrl+Shift+F",
      icon: icon(Search),
      category: "View",
      action: () => actions.setActiveActivityBarItem("search"),
    },
    {
      id: "focus-git",
      label: "Focus Source Control",
      shortcut: "Ctrl+Shift+G",
      icon: icon(GitBranch),
      category: "View",
      action: () => actions.setActiveActivityBarItem("git"),
    },
    {
      id: "focus-agents",
      label: "Focus Agents",
      shortcut: "Ctrl+Shift+A",
      icon: icon(Bot),
      category: "View",
      action: () => actions.setActiveActivityBarItem("agents"),
    },
    {
      id: "focus-usage",
      label: "Focus Usage Analytics",
      shortcut: "Ctrl+Shift+U",
      icon: icon(BarChart3),
      category: "View",
      action: () => actions.setActiveActivityBarItem("usage"),
    },
    {
      id: "focus-plugins",
      label: "Focus Plugins",
      shortcut: "Ctrl+Shift+X",
      icon: icon(Puzzle),
      category: "View",
      action: () => actions.setActiveActivityBarItem("plugins"),
    },
    {
      id: "open-settings",
      label: "Open Settings",
      shortcut: "Ctrl+,",
      icon: icon(Settings),
      category: "Preferences",
      action: () => actions.setActiveActivityBarItem("settings"),
    },
    {
      id: "new-terminal",
      label: "New Terminal",
      shortcut: "Ctrl+Shift+`",
      icon: icon(Terminal),
      category: "Terminal",
      action: actions.togglePanel,
    },
    {
      id: "close-active-tab",
      label: "Close Active Tab",
      shortcut: "Ctrl+W",
      icon: icon(FileCode),
      category: "Editor",
      action: () => {
        const state = useEditorStore.getState();
        if (state.activeTabId) {
          state.closeTab(state.activeTabId);
        }
      },
    },
    {
      id: "toggle-format-on-save",
      label: `Format on Save: ${useSettingsStore.getState().formatOnSave ? "Disable" : "Enable"}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setFormatOnSave(!settings.formatOnSave);
      },
    },
    {
      id: "theme-dark",
      label: "Color Theme: Dark (Catppuccin Mocha)",
      icon: icon(Settings),
      category: "Preferences",
      action: () => actions.setTheme("vantage-dark"),
    },
    {
      id: "theme-light",
      label: "Color Theme: Light (Catppuccin Latte)",
      icon: icon(Settings),
      category: "Preferences",
      action: () => actions.setTheme("vantage-light"),
    },
    {
      id: "theme-high-contrast",
      label: "Color Theme: High Contrast (WCAG AAA)",
      icon: icon(Settings),
      category: "Preferences",
      action: () => actions.setTheme("vantage-high-contrast"),
    },
    {
      id: "theme-cycle",
      label: "Color Theme: Cycle to Next Theme",
      icon: icon(Settings),
      category: "Preferences",
      action: actions.cycleTheme,
    },
    {
      id: "check-updates",
      label: "Check for Updates",
      icon: icon(Download),
      category: "Application",
      action: async () => {
        const { toast } = await import("sonner");
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          const update = await check();
          if (update) {
            const { relaunch } = await import("@tauri-apps/plugin-process");
            toast(`Update available: v${update.version}`, {
              description: update.body ?? "A new version is ready to install.",
              duration: Infinity,
              action: {
                label: "Install",
                onClick: async () => {
                  await update.downloadAndInstall();
                  await relaunch();
                },
              },
            });
          } else {
            toast.success("You're up to date!");
          }
        } catch {
          toast.error("Could not check for updates.");
        }
      },
    },
    {
      id: "open-analytics",
      label: "Open Usage Analytics",
      icon: icon(BarChart3),
      category: "View",
      action: () => {
        useEditorStore.getState().openFile(
          "__vantage://analytics",
          "Usage Analytics",
          "plaintext",
          "",
        );
      },
    },
    {
      id: "open-welcome",
      label: "Welcome",
      icon: icon(FileCode),
      category: "Help",
      action: () => {
        useEditorStore.getState().openFile(
          "__vantage://welcome",
          "Welcome",
          "plaintext",
          "",
        );
      },
    },
    {
      id: "customize-theme",
      label: "Customize Theme (Edit theme.json)",
      icon: icon(Palette),
      category: "Preferences",
      action: async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const filePath = await invoke<string>("get_theme_file_path");
          const existing = await invoke<string | null>("read_theme_file");
          if (!existing) {
            const template = JSON.stringify(
              {
                name: "My Custom Theme",
                base: "vantage-dark",
                colors: {
                  "color-base": "#1e1e2e",
                  "color-blue": "#89b4fa",
                },
              },
              null,
              2,
            );
            await invoke("write_theme_file", { content: template });
          }
          const content = await invoke<string | null>("read_theme_file");
          useEditorStore.getState().openFile(filePath, "theme.json", "json", content ?? "{}");
        } catch (err) {
          console.error("Failed to open theme file:", err);
        }
      },
    },
    {
      id: "open-spec-viewer",
      label: "Open Spec Viewer (BMAD Document Sharding)",
      icon: icon(BookOpen),
      category: "View",
      action: () => {
        actions.setActiveActivityBarItem("settings");
        window.dispatchEvent(new CustomEvent("vantage:open-spec-viewer"));
      },
    },
    {
      id: "open-browser-preview",
      label: "Open Browser Preview",
      icon: icon(Globe),
      category: "View",
      action: () => {
        useLayoutStore.getState().setActivePanelTab("browser");
        const state = useLayoutStore.getState();
        if (!state.panelVisible) state.togglePanel();
      },
    },
    {
      id: "open-keyboard-shortcuts",
      label: "Open Keyboard Shortcuts",
      icon: icon(Keyboard),
      category: "Preferences",
      action: () => {
        actions.setActiveActivityBarItem("settings");
        window.dispatchEvent(new CustomEvent("vantage:open-keybindings"));
      },
    },
    {
      id: "toggle-zen-mode",
      label: "Toggle Zen Mode",
      shortcut: "Ctrl+Shift+Z",
      icon: icon(Maximize2),
      category: "View",
      action: actions.toggleZenMode,
    },
    {
      id: "quick-fix",
      label: "Quick Fix",
      shortcut: "Ctrl+.",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.quickFix"),
    },
    {
      id: "jump-to-bracket",
      label: "Jump to Matching Bracket",
      shortcut: "Ctrl+Shift+\\",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.jumpToBracket"),
    },
    {
      id: "go-to-symbol",
      label: "Go to Symbol in Editor",
      shortcut: "Ctrl+Shift+O",
      icon: icon(Hash),
      category: "Editor",
      action: () => runMonacoAction("editor.action.gotoSymbol"),
    },
    {
      id: "toggle-minimap",
      label: `Minimap: ${useSettingsStore.getState().minimap ? "Hide" : "Show"}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setMinimap(!settings.minimap);
      },
    },
    {
      id: "toggle-line-numbers",
      label: `Line Numbers: ${useSettingsStore.getState().lineNumbers ? "Hide" : "Show"}`,
      icon: icon(Hash),
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setLineNumbers(!settings.lineNumbers);
      },
    },
    {
      id: "find-in-file",
      label: "Find in File",
      shortcut: "Ctrl+F",
      icon: icon(Search),
      category: "Editor",
      action: () => runMonacoAction("actions.find"),
    },
    {
      id: "find-and-replace",
      label: "Find and Replace in File",
      shortcut: "Ctrl+H",
      icon: icon(Search),
      category: "Editor",
      action: () => runMonacoAction("editor.action.startFindReplaceAction"),
    },
    {
      id: "add-cursor-below",
      label: "Add Cursor Below (Multi-Cursor)",
      shortcut: "Ctrl+Alt+Down",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.insertCursorBelow"),
    },
    {
      id: "select-all-occurrences",
      label: "Select All Occurrences of Current Word",
      shortcut: "Ctrl+Shift+L",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.selectHighlights"),
    },
    {
      id: "next-occurrence",
      label: "Add Selection to Next Find Match (Ctrl+D)",
      shortcut: "Ctrl+D",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.addSelectionToNextFindMatch"),
    },
    {
      id: "toggle-sticky-scroll",
      label: `Sticky Scroll: ${actions.stickyScroll ? "Disable" : "Enable"}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setStickyScroll(!actions.stickyScroll),
    },
    {
      id: "toggle-font-ligatures",
      label: `Font Ligatures: ${actions.fontLigatures ? "Disable" : "Enable"}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setFontLigatures(!actions.fontLigatures),
    },
    {
      id: "whitespace-none",
      label: `Render Whitespace: None${actions.renderWhitespace === "none" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setRenderWhitespace("none"),
    },
    {
      id: "whitespace-boundary",
      label: `Render Whitespace: Boundary${actions.renderWhitespace === "boundary" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setRenderWhitespace("boundary"),
    },
    {
      id: "whitespace-selection",
      label: `Render Whitespace: Selection${actions.renderWhitespace === "selection" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setRenderWhitespace("selection"),
    },
    {
      id: "whitespace-trailing",
      label: `Render Whitespace: Trailing${actions.renderWhitespace === "trailing" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setRenderWhitespace("trailing"),
    },
    {
      id: "whitespace-all",
      label: `Render Whitespace: All${actions.renderWhitespace === "all" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setRenderWhitespace("all"),
    },
    {
      id: "toggle-word-wrap",
      label: `Word Wrap: ${useSettingsStore.getState().wordWrap ? "Disable" : "Enable"}`,
      shortcut: "Alt+Z",
      icon: icon(FileCode),
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setWordWrap(!settings.wordWrap);
      },
    },
    {
      id: "cursor-style-line",
      label: "Cursor Style: Line",
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setCursorStyle("line"),
    },
    {
      id: "cursor-style-block",
      label: "Cursor Style: Block",
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setCursorStyle("block"),
    },
    {
      id: "cursor-style-underline",
      label: "Cursor Style: Underline",
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setCursorStyle("underline"),
    },
    {
      id: "toggle-line-comment",
      label: "Toggle Line Comment",
      shortcut: "Ctrl+/",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.commentLine"),
    },
    {
      id: "toggle-block-comment",
      label: "Toggle Block Comment",
      shortcut: "Shift+Alt+A",
      icon: icon(FileCode),
      category: "Editor",
      action: () => runMonacoAction("editor.action.blockComment"),
    },
    {
      id: "open-recent-file",
      label: "Open Recent File",
      shortcut: "Ctrl+R",
      icon: icon(FileCode),
      category: "File",
      action: () => actions.openRecentPalette(),
    },
    {
      id: "toggle-bracket-pair-colorization",
      label: `Bracket Pair Colorization: ${actions.bracketPairColorization ? "Disable" : "Enable"}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setBracketPairColorization(!actions.bracketPairColorization),
    },
    {
      id: "toggle-scroll-beyond-last-line",
      label: `Scroll Beyond Last Line: ${actions.scrollBeyondLastLine ? "Disable" : "Enable"}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setScrollBeyondLastLine(!actions.scrollBeyondLastLine),
    },
    {
      id: "cursor-smooth-caret-off",
      label: `Smooth Cursor Animation: Off${actions.cursorSmoothCaretAnimation === "off" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setCursorSmoothCaretAnimation("off"),
    },
    {
      id: "cursor-smooth-caret-explicit",
      label: `Smooth Cursor Animation: Explicit${actions.cursorSmoothCaretAnimation === "explicit" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setCursorSmoothCaretAnimation("explicit"),
    },
    {
      id: "cursor-smooth-caret-on",
      label: `Smooth Cursor Animation: On${actions.cursorSmoothCaretAnimation === "on" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setCursorSmoothCaretAnimation("on"),
    },
    {
      id: "auto-save-off",
      label: `Auto Save: Off${actions.autoSave === "off" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setAutoSave("off"),
    },
    {
      id: "auto-save-after-delay",
      label: `Auto Save: After Delay${actions.autoSave === "afterDelay" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setAutoSave("afterDelay"),
    },
    {
      id: "auto-save-on-focus-change",
      label: `Auto Save: On Focus Change${actions.autoSave === "onFocusChange" ? " (active)" : ""}`,
      icon: icon(FileCode),
      category: "Editor",
      action: () => actions.setAutoSave("onFocusChange"),
    },

    // ── Claude commands ──────────────────────────────────────────────
    {
      id: "claude-new-chat",
      label: "New Chat Session",
      icon: icon(MessageSquare),
      category: "Claude",
      action: () => {
        useConversationStore.getState().clearConversation();
      },
    },
    {
      id: "claude-resume-session",
      label: "Resume Session",
      icon: icon(MessageSquare),
      category: "Claude",
      action: () => {
        // Open the chat sidebar so the session selector is visible
        actions.setActiveActivityBarItem("chat");
        // Dispatch event to open session search within the SessionSelector
        window.dispatchEvent(new CustomEvent("vantage:open-session-search"));
      },
    },
    {
      id: "claude-compact",
      label: "Compact Conversation",
      icon: icon(MessageSquare),
      category: "Claude",
      action: () => {
        // Dispatch a synthetic send of "/compact" through the chat
        window.dispatchEvent(
          new CustomEvent("vantage:send-chat-message", { detail: "/compact" }),
        );
      },
    },
    {
      id: "claude-toggle-plan-mode",
      label: `Plan Mode: ${useSettingsStore.getState().planMode ? "Disable" : "Enable"}`,
      icon: icon(Brain),
      category: "Claude",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setPlanMode(!settings.planMode);
      },
    },
    {
      id: "claude-thinking-auto",
      label: "Set Thinking: Auto",
      icon: icon(Brain),
      category: "Claude",
      action: () => useSettingsStore.getState().setThinkingMode("auto"),
    },
    {
      id: "claude-thinking-think",
      label: "Set Thinking: Think",
      icon: icon(Brain),
      category: "Claude",
      action: () => useSettingsStore.getState().setThinkingMode("think"),
    },
    {
      id: "claude-thinking-think-hard",
      label: "Set Thinking: Think Hard",
      icon: icon(Brain),
      category: "Claude",
      action: () => useSettingsStore.getState().setThinkingMode("think_hard"),
    },
    {
      id: "claude-thinking-think-harder",
      label: "Set Thinking: Think Harder",
      icon: icon(Brain),
      category: "Claude",
      action: () => useSettingsStore.getState().setThinkingMode("think_harder"),
    },
    {
      id: "claude-thinking-ultrathink",
      label: "Set Thinking: Ultrathink",
      icon: icon(Brain),
      category: "Claude",
      action: () => useSettingsStore.getState().setThinkingMode("ultrathink"),
    },

    // ── Terminal commands ─────────────────────────────────────────────
    {
      id: "terminal-clear",
      label: "Clear Terminal",
      icon: icon(Terminal),
      category: "Terminal",
      action: () => {
        window.dispatchEvent(new CustomEvent("vantage:terminal-clear"));
      },
    },
    {
      id: "terminal-split",
      label: "Split Terminal",
      icon: icon(Columns2),
      category: "Terminal",
      action: () => {
        window.dispatchEvent(new CustomEvent("vantage:terminal-split"));
      },
    },
    {
      id: "terminal-kill",
      label: "Kill Terminal",
      icon: icon(Trash2),
      category: "Terminal",
      action: () => {
        window.dispatchEvent(new CustomEvent("vantage:terminal-kill"));
      },
    },
  ];
}
