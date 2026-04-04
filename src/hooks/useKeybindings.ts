import { useEffect, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface Keybinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeybindings() {
  const togglePrimarySidebar = useLayoutStore((s) => s.togglePrimarySidebar);
  const toggleSecondarySidebar = useLayoutStore(
    (s) => s.toggleSecondarySidebar
  );
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setActiveActivityBarItem = useLayoutStore(
    (s) => s.setActiveActivityBarItem
  );

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

  const keybindings: Keybinding[] = [
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

    // Command palette placeholder
    {
      key: "p",
      ctrl: true,
      shift: true,
      action: () => {
        toast("Command Palette", {
          description: "Command palette will be implemented in Phase 3.",
        });
      },
      description: "Open Command Palette",
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
      action: () => setActiveActivityBarItem("search"),
      description: "Focus Search",
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
  ];

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
