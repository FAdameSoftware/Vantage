import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
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
} from "lucide-react";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import type { ThemeName } from "@/stores/settings";
import type { FileNode } from "@/hooks/useFileTree";
import * as monaco from "monaco-editor";

const THEME_CYCLE: ThemeName[] = ["vantage-dark", "vantage-light", "vantage-high-contrast"];

// ── Types ─────────────────────────────────────────────────────────────

interface CommandDef {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
}

interface FlatFile {
  name: string;
  path: string;
  extension: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function flattenTree(
  nodes: FileNode[],
  result: FlatFile[] = []
): FlatFile[] {
  for (const node of nodes) {
    if (node.is_file) {
      result.push({ name: node.name, path: node.path, extension: node.extension });
    }
    if (node.children) {
      flattenTree(node.children, result);
    }
  }
  return result;
}

function getRelativePath(filePath: string, rootPath: string | null): string {
  if (!rootPath) return filePath;
  const norm = filePath.replace(/\\/g, "/");
  const root = rootPath.replace(/\\/g, "/");
  if (norm.startsWith(root)) {
    return norm.slice(root.length).replace(/^\//, "");
  }
  return norm;
}

function getFileIcon(_extension: string | null): React.ReactNode {
  return <FileCode className="size-4 shrink-0 text-muted-foreground" />;
}

// ── Sub-views ─────────────────────────────────────────────────────────

interface CommandsViewProps {
  commands: CommandDef[];
  searchText: string;
  onSelect: (action: () => void) => void;
}

function CommandsView({ commands, searchText, onSelect }: CommandsViewProps) {
  const query = searchText.startsWith(">")
    ? searchText.slice(1).trimStart().toLowerCase()
    : searchText.toLowerCase();

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query))
    : commands;

  // Group by category
  const byCategory = filtered.reduce<Record<string, CommandDef[]>>((acc, cmd) => {
    (acc[cmd.category] ??= []).push(cmd);
    return acc;
  }, {});

  if (filtered.length === 0) {
    return null;
  }

  return (
    <>
      {Object.entries(byCategory).map(([category, cmds]) => (
        <CommandGroup key={category} heading={category}>
          {cmds.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={cmd.id}
              onSelect={() => onSelect(cmd.action)}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <CommandShortcut>{cmd.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}

interface FilesViewProps {
  files: FlatFile[];
  rootPath: string | null;
  onSelect: (file: FlatFile) => void;
}

function FilesView({ files, rootPath, onSelect }: FilesViewProps) {
  return (
    <CommandGroup heading="Files">
      {files.map((file) => (
        <CommandItem
          key={file.path}
          value={file.path}
          onSelect={() => onSelect(file)}
        >
          {getFileIcon(file.extension)}
          <span className="truncate">{getRelativePath(file.path, rootPath)}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

interface GoToLineViewProps {
  searchText: string;
  onSelect: (lineNumber: number) => void;
}

function GoToLineView({ searchText, onSelect }: GoToLineViewProps) {
  const raw = searchText.startsWith(":") ? searchText.slice(1).trim() : searchText.trim();
  const lineNumber = parseInt(raw, 10);
  const isValid = !isNaN(lineNumber) && lineNumber > 0;

  if (!isValid && raw !== "") return null;

  return (
    <CommandGroup heading="Go to Line">
      <CommandItem
        value={isValid ? `goto-line-${lineNumber}` : "goto-line-prompt"}
        onSelect={() => isValid && onSelect(lineNumber)}
        disabled={!isValid}
      >
        <Hash className="size-4 shrink-0 text-muted-foreground" />
        <span>
          {isValid
            ? `Go to Line ${lineNumber}`
            : "Type a line number after ':'"}
        </span>
      </CommandItem>
    </CommandGroup>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, mode, searchText, close, setSearchText } =
    useCommandPaletteStore();

  const togglePrimarySidebar = useLayoutStore((s) => s.togglePrimarySidebar);
  const toggleSecondarySidebar = useLayoutStore((s) => s.toggleSecondarySidebar);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);

  const openFile = useEditorStore((s) => s.openFile);

  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const stickyScroll = useSettingsStore((s) => s.stickyScroll);
  const setStickyScroll = useSettingsStore((s) => s.setStickyScroll);
  const fontLigatures = useSettingsStore((s) => s.fontLigatures);
  const setFontLigatures = useSettingsStore((s) => s.setFontLigatures);
  const setCursorStyle = useSettingsStore((s) => s.setCursorStyle);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }, [currentTheme, setTheme]);

  const [fileList, setFileList] = useState<FlatFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Build the commands list inside the component so it closes over store actions
  const commands: CommandDef[] = [
    {
      id: "toggle-primary-sidebar",
      label: "Toggle Primary Sidebar",
      shortcut: "Ctrl+B",
      icon: <PanelLeft className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: togglePrimarySidebar,
    },
    {
      id: "toggle-secondary-sidebar",
      label: "Toggle Secondary Sidebar / Chat",
      shortcut: "Ctrl+Shift+B",
      icon: <PanelRight className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: toggleSecondarySidebar,
    },
    {
      id: "toggle-panel",
      label: "Toggle Panel / Terminal",
      shortcut: "Ctrl+J",
      icon: <PanelBottom className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: togglePanel,
    },
    {
      id: "focus-explorer",
      label: "Focus File Explorer",
      shortcut: "Ctrl+Shift+E",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => setActiveActivityBarItem("explorer"),
    },
    {
      id: "focus-search",
      label: "Focus Search",
      shortcut: "Ctrl+Shift+F",
      icon: <Search className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => setActiveActivityBarItem("search"),
    },
    {
      id: "focus-git",
      label: "Focus Source Control",
      shortcut: "Ctrl+Shift+G",
      icon: <GitBranch className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => setActiveActivityBarItem("git"),
    },
    {
      id: "focus-agents",
      label: "Focus Agents",
      shortcut: "Ctrl+Shift+A",
      icon: <Bot className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => setActiveActivityBarItem("agents"),
    },
    {
      id: "open-settings",
      label: "Open Settings",
      shortcut: "Ctrl+,",
      icon: <Settings className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: () => setActiveActivityBarItem("settings"),
    },
    {
      id: "new-terminal",
      label: "New Terminal",
      shortcut: "Ctrl+Shift+`",
      icon: <Terminal className="size-4 shrink-0 text-muted-foreground" />,
      category: "Terminal",
      action: togglePanel,
    },
    {
      id: "close-active-tab",
      label: "Close Active Tab",
      shortcut: "Ctrl+W",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
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
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setFormatOnSave(!settings.formatOnSave);
      },
    },
    {
      id: "theme-dark",
      label: "Color Theme: Dark (Catppuccin Mocha)",
      icon: <Settings className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: () => setTheme("vantage-dark"),
    },
    {
      id: "theme-light",
      label: "Color Theme: Light (Catppuccin Latte)",
      icon: <Settings className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: () => setTheme("vantage-light"),
    },
    {
      id: "theme-high-contrast",
      label: "Color Theme: High Contrast (WCAG AAA)",
      icon: <Settings className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: () => setTheme("vantage-high-contrast"),
    },
    {
      id: "theme-cycle",
      label: "Color Theme: Cycle to Next Theme",
      icon: <Settings className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: cycleTheme,
    },
    {
      id: "check-updates",
      label: "Check for Updates",
      icon: <Download className="size-4 shrink-0 text-muted-foreground" />,
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
      icon: <BarChart3 className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => {
        const { useEditorStore } = require("@/stores/editor");
        const store = useEditorStore.getState();
        store.openFile(
          "__vantage://analytics",
          "Usage Analytics",
          "plaintext",
          "",
        );
      },
    },
    {
      id: "customize-theme",
      label: "Customize Theme (Edit theme.json)",
      icon: <Palette className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const filePath = await invoke<string>("get_theme_file_path");
          // Ensure the file exists with a template
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
          const { useEditorStore } = require("@/stores/editor");
          const content = await invoke<string | null>("read_theme_file");
          useEditorStore
            .getState()
            .openFile(filePath, "theme.json", "json", content ?? "{}");
        } catch (err) {
          console.error("Failed to open theme file:", err);
        }
      },
    },
    {
      id: "open-spec-viewer",
      label: "Open Spec Viewer (BMAD Document Sharding)",
      icon: <BookOpen className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => {
        setActiveActivityBarItem("settings");
        // The SettingsPanel will be visible; user clicks "Spec Viewer" tab.
        // We fire a custom event so SettingsPanel can auto-switch its tab.
        window.dispatchEvent(new CustomEvent("vantage:open-spec-viewer"));
      },
    },
    {
      id: "open-browser-preview",
      label: "Open Browser Preview",
      icon: <Globe className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: () => {
        const { useLayoutStore } = require("@/stores/layout");
        useLayoutStore.getState().setActivePanelTab("browser");
        // Ensure panel is visible
        const state = useLayoutStore.getState();
        if (!state.panelVisible) state.togglePanel();
      },
    },
    {
      id: "open-keyboard-shortcuts",
      label: "Open Keyboard Shortcuts",
      icon: <Keyboard className="size-4 shrink-0 text-muted-foreground" />,
      category: "Preferences",
      action: () => {
        setActiveActivityBarItem("settings");
        window.dispatchEvent(new CustomEvent("vantage:open-keybindings"));
      },
    },
    {
      id: "toggle-zen-mode",
      label: "Toggle Zen Mode",
      shortcut: "Ctrl+Shift+Z",
      icon: <Maximize2 className="size-4 shrink-0 text-muted-foreground" />,
      category: "View",
      action: toggleZenMode,
    },
    {
      id: "jump-to-bracket",
      label: "Jump to Matching Bracket",
      shortcut: "Ctrl+Shift+\\",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.jumpToBracket");
          if (action) action.run();
        }
      },
    },
    {
      id: "go-to-symbol",
      label: "Go to Symbol in Editor",
      shortcut: "Ctrl+Shift+O",
      icon: <Hash className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.gotoSymbol");
          if (action) action.run();
        }
      },
    },
    {
      id: "toggle-minimap",
      label: `Minimap: ${useSettingsStore.getState().minimap ? "Hide" : "Show"}`,
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setMinimap(!settings.minimap);
      },
    },
    {
      id: "toggle-line-numbers",
      label: `Line Numbers: ${useSettingsStore.getState().lineNumbers ? "Hide" : "Show"}`,
      icon: <Hash className="size-4 shrink-0 text-muted-foreground" />,
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
      icon: <Search className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("actions.find");
          if (action) action.run();
        }
      },
    },
    {
      id: "find-and-replace",
      label: "Find and Replace in File",
      shortcut: "Ctrl+H",
      icon: <Search className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.startFindReplaceAction");
          if (action) action.run();
        }
      },
    },
    {
      id: "add-cursor-below",
      label: "Add Cursor Below (Multi-Cursor)",
      shortcut: "Ctrl+Alt+Down",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.insertCursorBelow");
          if (action) action.run();
        }
      },
    },
    {
      id: "select-all-occurrences",
      label: "Select All Occurrences of Current Word",
      shortcut: "Ctrl+Shift+L",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.selectHighlights");
          if (action) action.run();
        }
      },
    },
    {
      id: "next-occurrence",
      label: "Add Selection to Next Find Match (Ctrl+D)",
      shortcut: "Ctrl+D",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.addSelectionToNextFindMatch");
          if (action) action.run();
        }
      },
    },
    {
      id: "toggle-sticky-scroll",
      label: `Sticky Scroll: ${stickyScroll ? "Disable" : "Enable"}`,
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => setStickyScroll(!stickyScroll),
    },
    {
      id: "toggle-font-ligatures",
      label: `Font Ligatures: ${fontLigatures ? "Disable" : "Enable"}`,
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => setFontLigatures(!fontLigatures),
    },
    {
      id: "toggle-word-wrap",
      label: `Word Wrap: ${useSettingsStore.getState().wordWrap ? "Disable" : "Enable"}`,
      shortcut: "Alt+Z",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const settings = useSettingsStore.getState();
        settings.setWordWrap(!settings.wordWrap);
      },
    },
    {
      id: "cursor-style-line",
      label: "Cursor Style: Line",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => setCursorStyle("line"),
    },
    {
      id: "cursor-style-block",
      label: "Cursor Style: Block",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => setCursorStyle("block"),
    },
    {
      id: "cursor-style-underline",
      label: "Cursor Style: Underline",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => setCursorStyle("underline"),
    },
    {
      id: "toggle-line-comment",
      label: "Toggle Line Comment",
      shortcut: "Ctrl+/",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.commentLine");
          if (action) action.run();
        }
      },
    },
    {
      id: "toggle-block-comment",
      label: "Toggle Block Comment",
      shortcut: "Shift+Alt+A",
      icon: <FileCode className="size-4 shrink-0 text-muted-foreground" />,
      category: "Editor",
      action: () => {
        const editors = monaco.editor.getEditors();
        if (editors.length > 0) {
          const action = editors[0].getAction("editor.action.blockComment");
          if (action) action.run();
        }
      },
    },
  ];

  // Fetch files when mode switches to "files" and palette opens
  useEffect(() => {
    if (!isOpen || mode !== "files") return;
    if (!projectRootPath) return;

    setIsLoadingFiles(true);
    const fetchFiles = async () => {
      try {
        const tree = await invoke<FileNode[]>("get_file_tree", {
          path: projectRootPath,
          depth: 10,
        });
        setFileList(flattenTree(tree));
      } catch {
        setFileList([]);
      } finally {
        setIsLoadingFiles(false);
      }
    };
    fetchFiles();
  }, [isOpen, mode, projectRootPath]);

  // Handle selecting a file: read it from disk then open in editor
  const handleFileSelect = useCallback(
    async (file: FlatFile) => {
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: file.path });
        openFile(result.path, file.name, result.language, result.content);
      } catch (e) {
        console.error("Failed to open file from command palette:", e);
      } finally {
        close();
      }
    },
    [openFile, close]
  );

  // Handle go-to-line
  const handleGoToLine = useCallback(
    (lineNumber: number) => {
      const editors = monaco.editor.getEditors();
      if (editors.length > 0) {
        const editor = editors[0];
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column: 1 });
        editor.focus();
      }
      close();
    },
    [close]
  );

  // Handle command execution
  const handleCommandSelect = useCallback(
    (action: () => void) => {
      close();
      // Small delay so the palette closes before executing the action
      setTimeout(action, 0);
    },
    [close]
  );

  const placeholder =
    mode === "commands"
      ? "Type a command..."
      : mode === "goto"
      ? "Type a line number (e.g. :42)..."
      : "Search files by name...";

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Command shouldFilter={mode === "files"}>
        <CommandInput
          placeholder={placeholder}
          value={searchText}
          onValueChange={setSearchText}
        />
        <CommandList>
          <CommandEmpty>
            {isLoadingFiles ? "Loading files..." : "No results found."}
          </CommandEmpty>

          {mode === "commands" && (
            <CommandsView
              commands={commands}
              searchText={searchText}
              onSelect={handleCommandSelect}
            />
          )}

          {mode === "files" && (
            <FilesView
              files={fileList}
              rootPath={projectRootPath}
              onSelect={handleFileSelect}
            />
          )}

          {mode === "goto" && (
            <GoToLineView
              searchText={searchText}
              onSelect={handleGoToLine}
            />
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
