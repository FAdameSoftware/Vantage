import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { useLayoutStore } from "@/stores/layout";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import type { ThemeName } from "@/stores/settings";

// ── Types ──────────────────────────────────────────────────────────────

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  action?: () => void;
  /** Submenu items (renders a nested menu with arrow indicator) */
  submenu?: MenuItemDef[];
  /** Separator before this item */
  separator?: boolean;
  /** Whether this item is disabled */
  disabled?: boolean;
}

export interface MenuDef {
  label: string;
  items: MenuItemDef[];
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Dispatch a synthetic keyboard event to the Monaco editor container */
export function dispatchMonacoKey(
  key: string,
  modifiers: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
) {
  const editor = document.querySelector(".monaco-editor textarea") as HTMLTextAreaElement | null;
  if (editor) {
    editor.focus();
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        code: `Key${key.toUpperCase()}`,
        ctrlKey: modifiers.ctrlKey ?? false,
        shiftKey: modifiers.shiftKey ?? false,
        altKey: modifiers.altKey ?? false,
        bubbles: true,
      }),
    );
  }
}

// ── Menu Definitions ───────────────────────────────────────────────────

function fileMenu(): MenuDef {
  return {
    label: "File",
    items: [
      {
        label: "New File",
        shortcut: "Ctrl+N",
        action: () => {
          const store = useEditorStore.getState();
          const id = `__vantage://untitled-${Date.now()}`;
          store.openFile(id, "Untitled", "plaintext", "");
        },
      },
      {
        label: "Open File...",
        shortcut: "Ctrl+O",
        action: () => {
          invoke("open_file_dialog").catch(() => {});
        },
      },
      {
        label: "Open Folder...",
        action: () => {
          invoke("open_folder_dialog").catch(() => {});
        },
      },
      {
        label: "Save",
        shortcut: "Ctrl+S",
        action: () => {
          const { getActiveTab, markSaved } = useEditorStore.getState();
          const tab = getActiveTab();
          if (tab && tab.isDirty) {
            invoke("write_file", { path: tab.path, content: tab.content })
              .then(() => markSaved(tab.id, tab.content))
              .catch((err: unknown) =>
                console.error("Save failed:", err),
              );
          }
        },
      },
      {
        label: "Save All",
        shortcut: "Ctrl+Shift+S",
        action: () => {
          const { tabs, markSaved } = useEditorStore.getState();
          const dirty = tabs.filter((t) => t.isDirty);
          for (const tab of dirty) {
            invoke("write_file", { path: tab.path, content: tab.content })
              .then(() => markSaved(tab.id, tab.content))
              .catch((err: unknown) =>
                console.error(`Save failed for ${tab.path}:`, err),
              );
          }
        },
      },
      {
        label: "Auto Save",
        submenu: [
          {
            label: "Off",
            action: () => useSettingsStore.getState().setAutoSave("off"),
          },
          {
            label: "After Delay",
            action: () =>
              useSettingsStore.getState().setAutoSave("afterDelay"),
          },
          {
            label: "On Focus Change",
            action: () =>
              useSettingsStore.getState().setAutoSave("onFocusChange"),
          },
        ],
      },
      {
        label: "Close Tab",
        shortcut: "Ctrl+W",
        separator: true,
        action: () => {
          const { activeTabId, closeTab } = useEditorStore.getState();
          if (activeTabId) closeTab(activeTabId);
        },
      },
      {
        label: "Close All Tabs",
        action: () => {
          useEditorStore.getState().closeAllTabs();
        },
      },
      {
        label: "Exit",
        separator: true,
        action: () => {
          import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
            getCurrentWindow().close();
          });
        },
      },
    ],
  };
}

function editMenu(): MenuDef {
  return {
    label: "Edit",
    items: [
      {
        label: "Undo",
        shortcut: "Ctrl+Z",
        action: () => document.execCommand("undo"),
      },
      {
        label: "Redo",
        shortcut: "Ctrl+Shift+Z",
        action: () => document.execCommand("redo"),
      },
      {
        label: "Cut",
        shortcut: "Ctrl+X",
        separator: true,
        action: () => document.execCommand("cut"),
      },
      {
        label: "Copy",
        shortcut: "Ctrl+C",
        action: () => document.execCommand("copy"),
      },
      {
        label: "Paste",
        shortcut: "Ctrl+V",
        action: () => document.execCommand("paste"),
      },
      {
        label: "Find",
        shortcut: "Ctrl+F",
        separator: true,
        action: () => {
          dispatchMonacoKey("f", { ctrlKey: true });
        },
      },
      {
        label: "Find and Replace",
        shortcut: "Ctrl+H",
        action: () => {
          dispatchMonacoKey("h", { ctrlKey: true });
        },
      },
      {
        label: "Find in Files",
        shortcut: "Ctrl+Shift+F",
        action: () => {
          const layout = useLayoutStore.getState();
          layout.setActiveActivityBarItem("search");
        },
      },
    ],
  };
}

function viewMenu(): MenuDef {
  return {
    label: "View",
    items: [
      {
        label: "Command Palette",
        shortcut: "Ctrl+Shift+P",
        action: () => {
          useCommandPaletteStore.getState().open("commands");
        },
      },
      {
        label: "Explorer",
        shortcut: "Ctrl+Shift+E",
        separator: true,
        action: () => {
          useLayoutStore.getState().setActiveActivityBarItem("explorer");
        },
      },
      {
        label: "Search",
        shortcut: "Ctrl+Shift+F",
        action: () => {
          useLayoutStore.getState().setActiveActivityBarItem("search");
        },
      },
      {
        label: "Source Control",
        shortcut: "Ctrl+Shift+G",
        action: () => {
          useLayoutStore.getState().setActiveActivityBarItem("git");
        },
      },
      {
        label: "Agents",
        shortcut: "Ctrl+Shift+A",
        action: () => {
          useLayoutStore.getState().setActiveActivityBarItem("agents");
        },
      },
      {
        label: "Toggle Sidebar",
        shortcut: "Ctrl+B",
        separator: true,
        action: () => {
          useLayoutStore.getState().togglePrimarySidebar();
        },
      },
      {
        label: "Toggle Panel",
        shortcut: "Ctrl+J",
        action: () => {
          useLayoutStore.getState().togglePanel();
        },
      },
      {
        label: "Toggle Chat",
        shortcut: "Ctrl+Shift+B",
        action: () => {
          useLayoutStore.getState().toggleSecondarySidebar();
        },
      },
      {
        label: "Zen Mode",
        shortcut: "Ctrl+Shift+Z",
        separator: true,
        action: () => {
          useLayoutStore.getState().toggleZenMode();
        },
      },
      {
        label: "Theme",
        submenu: [
          {
            label: "Dark",
            action: () =>
              useSettingsStore
                .getState()
                .setTheme("vantage-dark" as ThemeName),
          },
          {
            label: "Light",
            action: () =>
              useSettingsStore
                .getState()
                .setTheme("vantage-light" as ThemeName),
          },
          {
            label: "High Contrast",
            action: () =>
              useSettingsStore
                .getState()
                .setTheme("vantage-high-contrast" as ThemeName),
          },
        ],
      },
    ],
  };
}

function goMenu(): MenuDef {
  return {
    label: "Go",
    items: [
      {
        label: "Go to File...",
        shortcut: "Ctrl+P",
        action: () => {
          useCommandPaletteStore.getState().open("files");
        },
      },
      {
        label: "Go to Line...",
        shortcut: "Ctrl+G",
        action: () => {
          useCommandPaletteStore.getState().open("goto");
        },
      },
      {
        label: "Go to Symbol...",
        shortcut: "Ctrl+Shift+O",
        action: () => {
          dispatchMonacoKey("o", { ctrlKey: true, shiftKey: true });
        },
      },
      {
        label: "Go to Definition",
        shortcut: "F12",
        separator: true,
        action: () => {
          dispatchMonacoKey("F12", {});
        },
      },
      {
        label: "Back",
        shortcut: "Alt+Left",
        separator: true,
        action: () => {
          dispatchMonacoKey("ArrowLeft", { altKey: true });
        },
      },
      {
        label: "Forward",
        shortcut: "Alt+Right",
        action: () => {
          dispatchMonacoKey("ArrowRight", { altKey: true });
        },
      },
    ],
  };
}

function terminalMenu(): MenuDef {
  return {
    label: "Terminal",
    items: [
      {
        label: "New Terminal",
        action: () => {
          const layout = useLayoutStore.getState();
          if (!layout.panelVisible) {
            layout.togglePanel();
          }
          layout.setActivePanelTab("terminal");
        },
      },
      {
        label: "Split Terminal",
        action: () => {
          const layout = useLayoutStore.getState();
          if (!layout.panelVisible) {
            layout.togglePanel();
          }
          layout.setActivePanelTab("terminal");
        },
      },
      {
        label: "Clear Terminal",
        separator: true,
        action: () => {
          dispatchMonacoKey("k", { ctrlKey: true });
        },
      },
      {
        label: "Kill Terminal",
        action: () => {
          // Terminal kill is handled through the terminal tabs UI
        },
      },
    ],
  };
}

function helpMenu(): MenuDef {
  return {
    label: "Help",
    items: [
      {
        label: "Keyboard Shortcuts",
        action: () => {
          useLayoutStore.getState().setActiveActivityBarItem("settings");
        },
      },
      {
        label: "Documentation",
        action: () => {
          // Open external docs (future: in-app docs)
        },
      },
      {
        label: "About Vantage",
        separator: true,
        action: () => {
          // Show about dialog (future)
        },
      },
    ],
  };
}

/** Returns all top-level menu definitions for the menu bar. */
export function getMenus(): MenuDef[] {
  return [
    fileMenu(),
    editMenu(),
    viewMenu(),
    goMenu(),
    terminalMenu(),
    helpMenu(),
  ];
}
