import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import type { ThemeName } from "@/stores/settings";
import type { FileNode } from "@/hooks/useFileTree";
import * as monaco from "monaco-editor";

import { createCommands } from "./palette/commandRegistry";
import { CommandsView, addRecentCommandId } from "./palette/CommandsView";
import { FilesView, RecentFilesView, flattenTree } from "./palette/FilesView";
import type { FlatFile } from "./palette/FilesView";
import { GotoView } from "./palette/GotoView";

const THEME_CYCLE: ThemeName[] = ["vantage-dark", "vantage-light", "vantage-high-contrast"];

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
  const renderWhitespace = useSettingsStore((s) => s.renderWhitespace);
  const setRenderWhitespace = useSettingsStore((s) => s.setRenderWhitespace);
  const bracketPairColorization = useSettingsStore((s) => s.bracketPairColorization);
  const setBracketPairColorization = useSettingsStore((s) => s.setBracketPairColorization);
  const scrollBeyondLastLine = useSettingsStore((s) => s.scrollBeyondLastLine);
  const setScrollBeyondLastLine = useSettingsStore((s) => s.setScrollBeyondLastLine);
  const cursorSmoothCaretAnimation = useSettingsStore((s) => s.cursorSmoothCaretAnimation);
  const setCursorSmoothCaretAnimation = useSettingsStore((s) => s.setCursorSmoothCaretAnimation);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }, [currentTheme, setTheme]);

  // Ctrl+R → open recent files palette
  const openPalette = useCommandPaletteStore((s) => s.open);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "r") {
        e.preventDefault();
        openPalette("recent");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPalette]);

  // Handle selecting a recent file
  const handleRecentFileSelect = useCallback(
    async (file: { path: string; name: string; language: string }) => {
      try {
        const result = await invoke<{ path: string; content: string; language: string }>(
          "read_file",
          { path: file.path },
        );
        openFile(result.path, file.name, result.language, result.content);
      } catch (e) {
        console.error("Failed to open recent file:", e);
      } finally {
        close();
      }
    },
    [openFile, close],
  );

  const [fileList, setFileList] = useState<FlatFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Build the commands list via the registry factory
  const commands = createCommands({
    togglePrimarySidebar,
    toggleSecondarySidebar,
    togglePanel,
    toggleZenMode,
    setActiveActivityBarItem,
    openFile,
    setTheme,
    cycleTheme,
    setStickyScroll,
    setFontLigatures,
    setCursorStyle,
    setRenderWhitespace,
    setBracketPairColorization,
    setScrollBeyondLastLine,
    setCursorSmoothCaretAnimation,
    setAutoSave,
    openRecentPalette: () => openPalette("recent"),
    // Current state for dynamic labels
    stickyScroll,
    fontLigatures,
    renderWhitespace,
    bracketPairColorization,
    scrollBeyondLastLine,
    cursorSmoothCaretAnimation,
    autoSave,
  });

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

  // Handle command execution — records the command in recent history
  const handleCommandSelect = useCallback(
    (action: () => void, commandId?: string) => {
      if (commandId) {
        const cleanId = commandId.startsWith("recent-") ? commandId.slice(7) : commandId;
        addRecentCommandId(cleanId);
      }
      close();
      setTimeout(action, 0);
    },
    [close]
  );

  const placeholder =
    mode === "commands"
      ? "Type a command..."
      : mode === "goto"
      ? "Type a line number (e.g. :42)..."
      : mode === "recent"
      ? "Search recent files..."
      : "Search files by name...";

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Command shouldFilter={mode === "files" || mode === "recent"}>
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
            <GotoView
              searchText={searchText}
              onSelect={handleGoToLine}
            />
          )}

          {mode === "recent" && (
            <RecentFilesView
              searchText={searchText}
              rootPath={projectRootPath}
              onSelect={handleRecentFileSelect}
            />
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
