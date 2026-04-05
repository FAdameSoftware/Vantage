import { useEffect, useCallback, useMemo } from "react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { useSettingsStore } from "@/stores/settings";
import type { ThemeName } from "@/stores/settings";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

const THEME_CYCLE: ThemeName[] = ["vantage-dark", "vantage-light", "vantage-high-contrast"];

export interface Keybinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

/** Static keybinding definition (without the runtime action) for the keybindings viewer/editor */
export interface KeybindingDefinition {
  /** Unique ID derived from the shortcut string (e.g., "ctrl+shift+b") */
  id: string;
  /** The key (e.g., "b", "Tab", ",") */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Human-readable description of the action */
  description: string;
  /** Where this keybinding comes from */
  source: "built-in" | "custom";
}

/** Format a keybinding definition into a human-readable shortcut string like "Ctrl+Shift+B" */
export function formatShortcut(def: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }): string {
  const parts: string[] = [];
  if (def.ctrl) parts.push("Ctrl");
  if (def.shift) parts.push("Shift");
  if (def.alt) parts.push("Alt");
  parts.push(def.key === " " ? "Space" : def.key.length === 1 ? def.key.toUpperCase() : def.key);
  return parts.join("+");
}

/** Generate a stable ID for a keybinding based on its modifiers and key */
function makeKeybindingId(def: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }): string {
  return formatShortcut(def).toLowerCase().replace(/\+/g, "-");
}

/**
 * The default set of keybinding definitions (without runtime actions).
 * This is the canonical list used by both the keybindings viewer/editor
 * and the runtime useKeybindings hook.
 */
export const DEFAULT_KEYBINDING_DEFINITIONS: Omit<KeybindingDefinition, "source">[] = [
  { id: "ctrl-b", key: "b", ctrl: true, description: "Toggle Primary Sidebar" },
  { id: "ctrl-j", key: "j", ctrl: true, description: "Toggle Panel" },
  { id: "ctrl-backtick", key: "`", ctrl: true, description: "Toggle Terminal Panel" },
  { id: "ctrl-shift-b", key: "b", ctrl: true, shift: true, description: "Toggle Secondary Sidebar (Chat)" },
  { id: "ctrl-shift-p", key: "p", ctrl: true, shift: true, description: "Open Command Palette" },
  { id: "ctrl-p", key: "p", ctrl: true, description: "Quick Open File" },
  { id: "ctrl-g", key: "g", ctrl: true, description: "Go to Line" },
  { id: "ctrl-shift-e", key: "e", ctrl: true, shift: true, description: "Focus File Explorer" },
  { id: "ctrl-shift-f", key: "f", ctrl: true, shift: true, description: "Search in Files" },
  { id: "ctrl-shift-g", key: "g", ctrl: true, shift: true, description: "Focus Source Control" },
  { id: "ctrl-shift-a", key: "a", ctrl: true, shift: true, description: "Focus Agents" },
  { id: "ctrl-comma", key: ",", ctrl: true, description: "Open Settings" },
  { id: "ctrl-shift-alt-k", key: "k", ctrl: true, shift: true, alt: true, description: "Cycle Color Theme" },
  { id: "ctrl-s", key: "s", ctrl: true, description: "Save Active File" },
  { id: "ctrl-w", key: "w", ctrl: true, description: "Close Active Tab" },
  { id: "ctrl-tab", key: "Tab", ctrl: true, description: "Next Tab" },
  { id: "ctrl-shift-tab", key: "Tab", ctrl: true, shift: true, description: "Previous Tab" },
  { id: "ctrl-shift-backslash", key: "\\", ctrl: true, shift: true, description: "Jump to Matching Bracket" },
  { id: "ctrl-1", key: "1", ctrl: true, description: "Switch to Claude View" },
  { id: "ctrl-2", key: "2", ctrl: true, description: "Switch to IDE View" },
].map((d) => ({ ...d, id: d.id || makeKeybindingId(d) }));

export function useKeybindings() {
  const togglePrimarySidebar = useLayoutStore((s) => s.togglePrimarySidebar);
  const toggleSecondarySidebar = useLayoutStore(
    (s) => s.toggleSecondarySidebar
  );
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setActiveActivityBarItem = useLayoutStore(
    (s) => s.setActiveActivityBarItem
  );
  const setViewMode = useLayoutStore((s) => s.setViewMode);
  const openPalette = useCommandPaletteStore((s) => s.open);

  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const handleCycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  }, [currentTheme, setTheme]);

  const closeTab = useEditorStore((s) => s.closeTab);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const handleCloseActiveTab = useCallback(() => {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  }, [activeTabId, closeTab]);

  const handleNextTab = useCallback(() => {
    if (tabs.length === 0 || !activeTabId) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const handlePrevTab = useCallback(() => {
    if (tabs.length === 0 || !activeTabId) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[prevIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const handleSave = useCallback(async () => {
    const state = useEditorStore.getState();
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!activeTab || !activeTab.isDirty) return;

    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      state.markSaved(activeTab.id, activeTab.content);
    } catch (e) {
      toast.error("Failed to save file", {
        description: String(e),
      });
    }
  }, []);

  // Memoize the keybindings array so its reference is stable across renders.
  // Without this, the array is recreated every render, which causes handleKeyDown
  // to get a new identity (it depends on keybindings), which triggers the useEffect
  // to remove and re-add the keydown event listener on every single render.
  const keybindings: Keybinding[] = useMemo(() => [
    // Layout toggles
    {
      key: "b",
      ctrl: true,
      action: togglePrimarySidebar,
      description: "Toggle Primary Sidebar",
    },
    {
      key: "j",
      ctrl: true,
      action: togglePanel,
      description: "Toggle Panel",
    },
    {
      key: "`",
      ctrl: true,
      action: togglePanel,
      description: "Toggle Terminal Panel",
    },
    {
      key: "b",
      ctrl: true,
      shift: true,
      action: toggleSecondarySidebar,
      description: "Toggle Secondary Sidebar (Chat)",
    },

    // Command palette
    {
      key: "p",
      ctrl: true,
      shift: true,
      action: () => openPalette("commands"),
      description: "Open Command Palette",
    },
    {
      key: "p",
      ctrl: true,
      action: () => openPalette("files"),
      description: "Quick Open File",
    },
    {
      key: "g",
      ctrl: true,
      action: () => openPalette("goto"),
      description: "Go to Line",
    },

    // Activity bar focus shortcuts
    {
      key: "e",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("explorer"),
      description: "Focus File Explorer",
    },
    {
      key: "f",
      ctrl: true,
      shift: true,
      action: () => {
        setActiveActivityBarItem("search");
        // Focus the search input after the panel renders
        setTimeout(() => {
          const input = document.querySelector(
            "[data-search-input]"
          ) as HTMLInputElement;
          input?.focus();
        }, 50);
      },
      description: "Search in Files",
    },
    {
      key: "g",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("git"),
      description: "Focus Source Control",
    },
    {
      key: "a",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("agents"),
      description: "Focus Agents",
    },

    // Settings
    {
      key: ",",
      ctrl: true,
      action: () => {
        setActiveActivityBarItem("settings");
      },
      description: "Open Settings",
    },

    // Theme cycle
    {
      key: "k",
      ctrl: true,
      shift: true,
      alt: true,
      action: handleCycleTheme,
      description: "Cycle Color Theme",
    },

    // File save
    {
      key: "s",
      ctrl: true,
      action: handleSave,
      description: "Save Active File",
    },

    // Tab management
    {
      key: "w",
      ctrl: true,
      action: handleCloseActiveTab,
      description: "Close Active Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      action: handleNextTab,
      description: "Next Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      shift: true,
      action: handlePrevTab,
      description: "Previous Tab",
    },

    // View mode switching
    {
      key: "1",
      ctrl: true,
      action: () => setViewMode("claude"),
      description: "Switch to Claude View",
    },
    {
      key: "2",
      ctrl: true,
      action: () => setViewMode("ide"),
      description: "Switch to IDE View",
    },
  ], [
    togglePrimarySidebar, togglePanel, toggleSecondarySidebar,
    openPalette, setActiveActivityBarItem, handleCycleTheme,
    handleSave, handleCloseActiveTab, handleNextTab, handlePrevTab,
    setViewMode,
  ]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const binding of keybindings) {
        const ctrlMatch = binding.ctrl ? event.ctrlKey : !event.ctrlKey;
        const shiftMatch = binding.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = binding.alt ? event.altKey : !event.altKey;
        const keyMatch =
          event.key.toLowerCase() === binding.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          event.preventDefault();
          event.stopPropagation();
          binding.action();
          return;
        }
      }
    },
    [keybindings]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleKeyDown]);
}
