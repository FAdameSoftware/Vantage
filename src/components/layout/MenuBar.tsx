import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMenus, type MenuItemDef } from "./menuDefinitions";

const smoothEase = [0.4, 0, 0.2, 1] as const;

const dropdownVariants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15, ease: smoothEase as unknown as [number, number, number, number] } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1, ease: smoothEase as unknown as [number, number, number, number] } },
};

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
    <motion.div
      ref={menuRef}
      role="menu"
      className="fixed min-w-[220px] py-1 rounded shadow-lg z-[10000]"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      variants={dropdownVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
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
    </motion.div>
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

          <AnimatePresence>
            {openMenuIndex === idx && (
              <MenuDropdown
                items={menu.items}
                onClose={handleClose}
                triggerRect={
                  triggerRefs.current[idx]?.getBoundingClientRect() ?? null
                }
              />
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
