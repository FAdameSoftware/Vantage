import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { FileCode } from "lucide-react";
import { useEditorStore } from "@/stores/editor";
import { FileIcon } from "@/components/files/FileIcon";

/**
 * TabSwitcher — VS Code-style Ctrl+Tab popup.
 *
 * Shows a list of all open tabs in most-recently-used (MRU) order.
 * Hold Ctrl and press Tab to cycle through entries.
 * Releasing Ctrl selects the highlighted entry.
 */
export function TabSwitcher() {
  // Subscribe to raw tabs, derive metadata via useMemo to skip content-only changes
  const rawTabs = useEditorStore((s) => s.tabs);
  const tabsSig = rawTabs.map((t) => `${t.id}|${t.name}|${t.path}|${t.isDirty}|${t.isPreview}`).join("\n");
  const tabs = useMemo(
    () => rawTabs.map((t) => ({ id: t.id, name: t.name, path: t.path, isDirty: t.isDirty, isPreview: t.isPreview, language: t.language })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabsSig],
  );
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const [visible, setVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const mruOrder = useRef<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Track MRU order: whenever the active tab changes, move it to the front
  useEffect(() => {
    if (!activeTabId) return;
    mruOrder.current = [
      activeTabId,
      ...mruOrder.current.filter((id) => id !== activeTabId),
    ];
    // Prune IDs for tabs that no longer exist
    const tabIds = new Set(tabs.map((t) => t.id));
    mruOrder.current = mruOrder.current.filter((id) => tabIds.has(id));
  }, [activeTabId, tabs]);

  // Build the list of tabs in MRU order
  const getMruTabs = useCallback(() => {
    const tabMap = new Map(tabs.map((t) => [t.id, t]));
    const ordered = mruOrder.current
      .map((id) => tabMap.get(id))
      .filter(Boolean) as typeof tabs;
    // Add any tabs not in MRU (newly opened)
    const mruSet = new Set(mruOrder.current);
    const rest = tabs.filter((t) => !mruSet.has(t.id));
    return [...ordered, ...rest];
  }, [tabs]);

  // Handle keydown globally to detect Ctrl+Tab, Tab cycling, Shift+Tab reverse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Tab" && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        if (!visible) {
          // Open the switcher
          const mruTabs = getMruTabs();
          if (mruTabs.length <= 1) return;
          setVisible(true);
          // Start at index 1 (the previously active tab)
          setSelectedIndex(e.shiftKey ? mruTabs.length - 1 : 1);
        } else {
          // Cycle through tabs
          const mruTabs = getMruTabs();
          setSelectedIndex((prev) => {
            if (e.shiftKey) {
              return prev <= 0 ? mruTabs.length - 1 : prev - 1;
            }
            return prev >= mruTabs.length - 1 ? 0 : prev + 1;
          });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // When Ctrl is released, select the highlighted tab
      if (e.key === "Control" && visible) {
        const mruTabs = getMruTabs();
        const selected = mruTabs[selectedIndex];
        if (selected) {
          setActiveTab(selected.id);
        }
        setVisible(false);
        setSelectedIndex(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [visible, selectedIndex, getMruTabs, setActiveTab]);

  if (!visible) return null;

  const mruTabs = getMruTabs();
  if (mruTabs.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
      {/* Backdrop — click to dismiss */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
        onClick={() => setVisible(false)}
      />
      <div
        ref={panelRef}
        className="relative z-10 rounded-lg shadow-lg overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface-0)",
          border: "1px solid var(--color-surface-1)",
          width: "clamp(280px, 30vw, 400px)",
          maxHeight: "clamp(200px, 40vh, 360px)",
        }}
      >
        <div
          className="px-3 py-2 text-xs font-semibold"
          style={{
            color: "var(--color-subtext-0)",
            borderBottom: "1px solid var(--color-surface-1)",
          }}
        >
          Switch Tab
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(40vh - 36px)" }}>
          {mruTabs.map((tab, index) => {
            const ext = tab.name.includes(".")
              ? tab.name.split(".").pop() ?? null
              : null;
            const dirPath = tab.path.replace(/\/[^/]+$/, "");
            const isSelected = index === selectedIndex;

            return (
              <div
                key={tab.id}
                className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: isSelected
                    ? "var(--color-surface-1)"
                    : "transparent",
                  color: isSelected
                    ? "var(--color-text)"
                    : "var(--color-subtext-0)",
                }}
                onClick={() => {
                  setActiveTab(tab.id);
                  setVisible(false);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <FileIcon
                  name={tab.name}
                  extension={ext}
                  isDir={false}
                  size={16}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">
                      {tab.name}
                    </span>
                    {tab.isDirty && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: "var(--color-text)" }}
                        title="Unsaved changes"
                      />
                    )}
                  </div>
                  <span
                    className="text-[10px] truncate block"
                    style={{ color: "var(--color-overlay-0)" }}
                  >
                    {dirPath}
                  </span>
                </div>
                {tab.id === activeTabId && (
                  <FileCode
                    size={12}
                    style={{ color: "var(--color-blue)", flexShrink: 0 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
