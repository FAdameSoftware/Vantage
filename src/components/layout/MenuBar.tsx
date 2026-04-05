import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import type { ThemeName } from "@/stores/settings";

// ── Types ──────────────────────────────────────────────────────────────

interface MenuItemDef {
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

interface MenuDef {
  label: string;
  items: MenuItemDef[];
}

// ── Menu Definitions ───────────────────────────────────────────────────

function getMenus(): MenuDef[] {
  return [
    {
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
    },
    {
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
            // Trigger Monaco find widget via keyboard event
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
    },
    {
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
    },
    {
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
    },
    {
      label: "Terminal",
      items: [
        {
          label: "New Terminal",
          action: () => {
            // The terminal store handles new terminal creation via the PanelArea UI.
            // We ensure the panel is visible first, then rely on the terminal tabs' "+" button logic.
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
            // Send clear command to the active terminal
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
    },
    {
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
    },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Dispatch a synthetic keyboard event to the Monaco editor container */
function dispatchMonacoKey(
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

// ── Submenu Component ──────────────────────────────────────────────────

function SubMenu({
  items,
  onAction,
}: {
  items: MenuItemDef[];
  onAction: () => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSubmenuTimer = useCallback(() => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearSubmenuTimer();
  }, [clearSubmenuTimer]);

  return (
    <div
      role="menu"
      className="absolute left-full top-0 min-w-[200px] py-1 rounded shadow-lg z-[10001]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {items.map((item, idx) => (
        <div key={idx}>
          {item.separator && <MenuSeparator />}
          <button
            role="menuitem"
            className="flex items-center w-full px-3 py-1 text-xs text-left transition-colors hover:bg-[var(--color-surface-1)] disabled:opacity-40"
            style={{ color: "var(--color-text)" }}
            disabled={item.disabled}
            onMouseEnter={() => {
              clearSubmenuTimer();
              setHoveredIndex(idx);
            }}
            onMouseLeave={() => {
              submenuTimerRef.current = setTimeout(
                () => setHoveredIndex(-1),
                150,
              );
            }}
            onClick={() => {
              item.action?.();
              onAction();
            }}
          >
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span
                className="ml-4 text-[10px] shrink-0"
                style={{ color: "var(--color-subtext-1)" }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
          {item.submenu && hoveredIndex === idx && (
            <div className="relative">
              <SubMenu items={item.submenu} onAction={onAction} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Dropdown Component ─────────────────────────────────────────────────

function MenuDropdown({
  items,
  onClose,
  triggerRect,
}: {
  items: MenuItemDef[];
  onClose: () => void;
  triggerRect: DOMRect | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState(-1);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter out separator-only pseudo-items for keyboard nav
  const actionableIndices = items.reduce<number[]>((acc, _item, idx) => {
    acc.push(idx);
    return acc;
  }, []);

  const clearSubmenuTimer = useCallback(() => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearSubmenuTimer();
  }, [clearSubmenuTimer]);

  // Keyboard navigation within a dropdown
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const currentPos = actionableIndices.indexOf(prev);
          const nextPos =
            currentPos < actionableIndices.length - 1 ? currentPos + 1 : 0;
          return actionableIndices[nextPos];
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const currentPos = actionableIndices.indexOf(prev);
          const nextPos =
            currentPos > 0
              ? currentPos - 1
              : actionableIndices.length - 1;
          return actionableIndices[nextPos];
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex];
          if (item.submenu) {
            setOpenSubmenuIndex(focusedIndex);
          } else {
            item.action?.();
            onClose();
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedIndex, items, onClose, actionableIndices]);

  if (!triggerRect) return null;

  // Position the dropdown below the trigger button
  const left = triggerRect.left;
  const top = triggerRect.bottom;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed min-w-[220px] py-1 rounded shadow-lg z-[10000]"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {items.map((item, idx) => {
        const isFocused = focusedIndex === idx;
        const hasSubmenu = Boolean(item.submenu);

        return (
          <div key={idx} className="relative">
            {item.separator && <MenuSeparator />}
            <button
              role="menuitem"
              className="flex items-center w-full px-3 py-1 text-xs text-left transition-colors disabled:opacity-40"
              style={{
                color: "var(--color-text)",
                backgroundColor: isFocused
                  ? "var(--color-surface-1)"
                  : "transparent",
              }}
              disabled={item.disabled}
              onMouseEnter={() => {
                clearSubmenuTimer();
                setFocusedIndex(idx);
                if (hasSubmenu) {
                  setOpenSubmenuIndex(idx);
                }
              }}
              onMouseLeave={() => {
                if (hasSubmenu) {
                  submenuTimerRef.current = setTimeout(
                    () => setOpenSubmenuIndex(-1),
                    200,
                  );
                }
              }}
              onClick={() => {
                if (hasSubmenu) {
                  setOpenSubmenuIndex(
                    openSubmenuIndex === idx ? -1 : idx,
                  );
                } else {
                  item.action?.();
                  onClose();
                }
              }}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span
                  className="ml-6 text-[10px] shrink-0"
                  style={{ color: "var(--color-subtext-1)" }}
                >
                  {item.shortcut}
                </span>
              )}
              {hasSubmenu && (
                <span
                  className="ml-3 text-[10px] shrink-0"
                  style={{ color: "var(--color-subtext-1)" }}
                >
                  ▸
                </span>
              )}
            </button>
            {hasSubmenu && openSubmenuIndex === idx && (
              <SubMenu
                items={item.submenu!}
                onAction={onClose}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Separator ──────────────────────────────────────────────────────────

function MenuSeparator() {
  return (
    <div
      className="my-1 mx-2 h-px"
      role="separator"
      style={{ backgroundColor: "var(--color-surface-1)" }}
    />
  );
}

// ── MenuBar Component ──────────────────────────────────────────────────

export function MenuBar() {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuBarActive, setMenuBarActive] = useState(false);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const menus = getMenus();

  // Close menu when clicking outside
  useEffect(() => {
    if (openMenuIndex === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Don't close if clicking within the menu bar container itself
      // (switching menus is handled by the button click handlers)
      if (containerRef.current?.contains(target)) return;
      setOpenMenuIndex(null);
      setMenuBarActive(false);
    };

    // Use a small delay so the current click event completes first
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuIndex]);

  // Keyboard navigation between top-level menus
  useEffect(() => {
    if (openMenuIndex === null) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setOpenMenuIndex((prev) =>
          prev !== null ? (prev + 1) % menus.length : 0,
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setOpenMenuIndex((prev) =>
          prev !== null
            ? (prev - 1 + menus.length) % menus.length
            : menus.length - 1,
        );
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpenMenuIndex(null);
        setMenuBarActive(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openMenuIndex, menus.length]);

  const handleMenuTriggerClick = useCallback(
    (index: number) => {
      if (openMenuIndex === index) {
        setOpenMenuIndex(null);
        setMenuBarActive(false);
      } else {
        setOpenMenuIndex(index);
        setMenuBarActive(true);
      }
    },
    [openMenuIndex],
  );

  const handleMenuTriggerEnter = useCallback(
    (index: number) => {
      // Only switch menus on hover if a menu is already open (standard Windows behavior)
      if (menuBarActive && openMenuIndex !== null && openMenuIndex !== index) {
        setOpenMenuIndex(index);
      }
    },
    [menuBarActive, openMenuIndex],
  );

  const handleClose = useCallback(() => {
    setOpenMenuIndex(null);
    setMenuBarActive(false);
  }, []);

  return (
    <div ref={containerRef} className="flex items-center h-full" role="menubar">
      {menus.map((menu, idx) => (
        <div key={menu.label} className="relative">
          <button
            ref={(el) => {
              triggerRefs.current[idx] = el;
            }}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={openMenuIndex === idx}
            className="px-2 h-full text-xs transition-colors select-none"
            style={{
              color:
                openMenuIndex === idx
                  ? "var(--color-text)"
                  : "var(--color-subtext-0)",
              backgroundColor:
                openMenuIndex === idx
                  ? "var(--color-surface-0)"
                  : "transparent",
            }}
            onClick={() => handleMenuTriggerClick(idx)}
            onMouseEnter={() => handleMenuTriggerEnter(idx)}
          >
            {menu.label}
          </button>

          {openMenuIndex === idx && (
            <MenuDropdown
              items={menu.items}
              onClose={handleClose}
              triggerRect={
                triggerRefs.current[idx]?.getBoundingClientRect() ?? null
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
