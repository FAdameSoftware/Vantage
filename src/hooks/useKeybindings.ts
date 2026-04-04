import { useEffect, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout";
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
  const toggleSecondarySidebar = useLayoutStore((s) => s.toggleSecondarySidebar);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

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
          description: "Command palette will be implemented in Phase 2.",
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

    // Tab management placeholders
    {
      key: "w",
      ctrl: true,
      action: () => {
        toast("Close Tab", {
          description: "Tab management will be implemented in Phase 2.",
        });
      },
      description: "Close Active Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      action: () => {
        toast("Next Tab", {
          description: "Tab cycling will be implemented in Phase 2.",
        });
      },
      description: "Next Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      shift: true,
      action: () => {
        toast("Previous Tab", {
          description: "Tab cycling will be implemented in Phase 2.",
        });
      },
      description: "Previous Tab",
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const binding of keybindings) {
        const ctrlMatch = binding.ctrl ? event.ctrlKey : !event.ctrlKey;
        const shiftMatch = binding.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = binding.alt ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === binding.key.toLowerCase();

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
