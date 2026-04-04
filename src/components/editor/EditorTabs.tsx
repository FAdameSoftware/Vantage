import { useState, useRef, useEffect, useCallback } from "react";
import { X, FileCode, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useEditorStore, type EditorTab } from "@/stores/editor";
import { useFloatingWindow } from "@/hooks/useFloatingWindow";

// ── Context menu ────────────────────────────────────────────────────

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  tabId: string | null;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onPopOut: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
}

function TabContextMenu({
  state,
  onClose,
  onPopOut,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (state.visible) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state.visible, onClose]);

  if (!state.visible || !state.tabId) return null;

  const items = [
    {
      label: "Pop Out to Window",
      icon: <ExternalLink size={12} />,
      action: () => {
        if (state.tabId) onPopOut(state.tabId);
        onClose();
      },
    },
    { separator: true as const },
    {
      label: "Close",
      action: () => {
        if (state.tabId) onCloseTab(state.tabId);
        onClose();
      },
    },
    {
      label: "Close Others",
      action: () => {
        if (state.tabId) onCloseOthers(state.tabId);
        onClose();
      },
    },
    {
      label: "Close All",
      action: () => {
        onCloseAll();
        onClose();
      },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 py-1 rounded-md shadow-lg min-w-40"
      style={{
        left: state.x,
        top: state.y,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {items.map((item, i) =>
        "separator" in item ? (
          <div
            key={`sep-${i}`}
            className="my-1"
            style={{ borderTop: "1px solid var(--color-surface-1)" }}
          />
        ) : (
          <button
            key={item.label}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-text)" }}
            onClick={item.action}
          >
            {"icon" in item && item.icon}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

// ── Editor tabs ─────────────────────────────────────────────────────

export function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const pinTab = useEditorStore((s) => s.pinTab);
  const toggleMarkdownPreview = useEditorStore((s) => s.toggleMarkdownPreview);
  const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const popoutTabs = useEditorStore((s) => s.popoutTabs);

  const { popOut, focusPopout } = useFloatingWindow();

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    tabId: null,
  });

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((s) => ({ ...s, visible: false }));
  }, []);

  if (tabs.length === 0) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isMarkdown = activeTab?.language === "markdown";
  const isPreviewActive = activeTab ? markdownPreviewTabs.has(activeTab.id) : false;

  const handleTabClick = (tab: EditorTab) => {
    // If tab is popped out, focus the external window instead
    if (popoutTabs.has(tab.id)) {
      focusPopout(tab.id);
      return;
    }
    setActiveTab(tab.id);
  };

  const handleTabClose = (e: React.MouseEvent, tab: EditorTab) => {
    e.stopPropagation();
    closeTab(tab.id);
  };

  const handleTabDoubleClick = (tab: EditorTab) => {
    if (tab.isPreview) {
      pinTab(tab.id);
    }
  };

  const handleMiddleClick = (e: React.MouseEvent, tab: EditorTab) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tab: EditorTab) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabId: tab.id,
    });
  };

  const handlePopOut = (tabId: string) => {
    popOut(tabId);
  };

  return (
    <>
      <div
        className="flex items-center h-9 shrink-0"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {/* Scrollable tab list */}
        <div className="flex items-center h-full overflow-x-auto flex-1 min-w-0" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isPoppedOut = popoutTabs.has(tab.id);
            const fileName = tab.name;

            return (
              <div
                key={tab.id}
                className="flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer shrink-0 transition-colors group"
                style={{
                  backgroundColor: isActive && !isPoppedOut
                    ? "var(--color-base)"
                    : "transparent",
                  color: isPoppedOut
                    ? "var(--color-overlay-0)"
                    : isActive
                      ? "var(--color-text)"
                      : "var(--color-subtext-0)",
                  borderRight: "1px solid var(--color-surface-0)",
                  fontStyle: tab.isPreview ? "italic" : "normal",
                  opacity: isPoppedOut ? 0.5 : 1,
                }}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabClick(tab)}
                onDoubleClick={() => handleTabDoubleClick(tab)}
                onMouseDown={(e) => handleMiddleClick(e, tab)}
                onContextMenu={(e) => handleContextMenu(e, tab)}
              >
                {isPoppedOut ? (
                  <ExternalLink size={14} style={{ color: "var(--color-overlay-1)" }} />
                ) : (
                  <FileCode size={14} style={{ color: "var(--color-blue)" }} />
                )}
                <span>{fileName}</span>

                {/* Dirty indicator OR close button */}
                {tab.isDirty ? (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: "var(--color-text)" }}
                    title="Unsaved changes"
                  />
                ) : (
                  <button
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-1)] transition-all"
                    style={{ color: "var(--color-overlay-1)" }}
                    onClick={(e) => handleTabClose(e, tab)}
                    aria-label={`Close ${fileName}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Markdown preview toggle */}
        {isMarkdown && activeTab && (
          <button
            className="flex items-center gap-1 px-2 h-full text-xs hover:bg-[var(--color-surface-0)] transition-colors shrink-0"
            style={{
              color: isPreviewActive ? "var(--color-blue)" : "var(--color-overlay-1)",
              borderLeft: "1px solid var(--color-surface-0)",
            }}
            onClick={() => toggleMarkdownPreview(activeTab.id)}
            aria-label={isPreviewActive ? "Hide preview" : "Show preview"}
            title={isPreviewActive ? "Hide preview" : "Show preview"}
          >
            {isPreviewActive ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>Preview</span>
          </button>
        )}
      </div>

      {/* Context menu */}
      <TabContextMenu
        state={contextMenu}
        onClose={handleCloseContextMenu}
        onPopOut={handlePopOut}
        onCloseTab={closeTab}
        onCloseOthers={closeOtherTabs}
        onCloseAll={closeAllTabs}
      />
    </>
  );
}
