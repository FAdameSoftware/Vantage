import { useState, useRef, useEffect, useCallback } from "react";
import { X, FileCode, Eye, EyeOff, ExternalLink, Columns2, Rows2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditorStore, type EditorTab } from "@/stores/editor";
import { useFloatingWindow } from "@/hooks/useFloatingWindow";

// ── Unsaved changes confirmation dialog ────────────────────────────

interface UnsavedDialogState {
  visible: boolean;
  tabId: string | null;
  tabName: string;
}

function UnsavedChangesDialog({
  state,
  onSave,
  onDiscard,
  onCancel,
}: {
  state: UnsavedDialogState;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.visible) {
      dialogRef.current?.focus();
    }
  }, [state.visible]);

  if (!state.visible || !state.tabId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-80 rounded-lg p-4 flex flex-col gap-3"
        style={{
          backgroundColor: "var(--color-mantle)",
          border: "1px solid var(--color-surface-1)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        tabIndex={-1}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Unsaved Changes
        </span>
        <p className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          Do you want to save the changes you made to{" "}
          <strong style={{ color: "var(--color-text)" }}>{state.tabName}</strong>?
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-red)",
              color: "var(--color-base)",
            }}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-0)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-blue)",
              color: "var(--color-base)",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

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
  onSplitRight: (tabId: string) => void;
  onSplitDown: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseToTheRight: (tabId: string) => void;
  onCloseAll: () => void;
}

function TabContextMenu({
  state,
  onClose,
  onPopOut,
  onSplitRight,
  onSplitDown,
  onCloseTab,
  onCloseOthers,
  onCloseToTheRight,
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
      label: "Split Right",
      icon: <Columns2 size={12} />,
      action: () => {
        if (state.tabId) onSplitRight(state.tabId);
        onClose();
      },
    },
    {
      label: "Split Down",
      icon: <Rows2 size={12} />,
      action: () => {
        if (state.tabId) onSplitDown(state.tabId);
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
      label: "Close to the Right",
      action: () => {
        if (state.tabId) onCloseToTheRight(state.tabId);
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

// ── Sortable tab item ────────────────────────────────────────────────

interface SortableTabProps {
  tab: EditorTab;
  isActive: boolean;
  isPoppedOut: boolean;
  onTabClick: (tab: EditorTab) => void;
  onTabDoubleClick: (tab: EditorTab) => void;
  onMiddleClick: (e: React.MouseEvent, tab: EditorTab) => void;
  onContextMenu: (e: React.MouseEvent, tab: EditorTab) => void;
  onTabClose: (e: React.MouseEvent, tab: EditorTab) => void;
}

function SortableTab({
  tab,
  isActive,
  isPoppedOut,
  onTabClick,
  onTabDoubleClick,
  onMiddleClick,
  onContextMenu,
  onTabClose,
}: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor:
      isDragging
        ? "var(--color-surface-1)"
        : isActive && !isPoppedOut
          ? "var(--color-base)"
          : "transparent",
    color: isPoppedOut
      ? "var(--color-overlay-0)"
      : isActive
        ? "var(--color-text)"
        : "var(--color-subtext-0)",
    borderRight: "1px solid var(--color-surface-0)",
    fontStyle: tab.isPreview ? "italic" : "normal",
    opacity: isPoppedOut ? 0.5 : isDragging ? 0.8 : 1,
    zIndex: isDragging ? 10 : undefined,
    cursor: isDragging ? "grabbing" : "pointer",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 px-3 h-full text-xs shrink-0 transition-colors group"
      aria-selected={isActive}
      onClick={() => onTabClick(tab)}
      onDoubleClick={() => onTabDoubleClick(tab)}
      onMouseDown={(e) => onMiddleClick(e, tab)}
      onContextMenu={(e) => onContextMenu(e, tab)}
      {...attributes}
      {...listeners}
      role="tab"
    >
      {isPoppedOut ? (
        <ExternalLink size={14} style={{ color: "var(--color-overlay-1)" }} />
      ) : (
        <FileCode size={14} style={{ color: "var(--color-blue)" }} />
      )}
      <span>{tab.name}</span>

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
          onClick={(e) => onTabClose(e, tab)}
          aria-label={`Close ${tab.name}`}
          title="Close (Ctrl+W)"
          // Prevent dnd-kit drag from triggering on close button click
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X size={12} />
        </button>
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
  const markSaved = useEditorStore((s) => s.markSaved);
  const pinTab = useEditorStore((s) => s.pinTab);
  const toggleMarkdownPreview = useEditorStore((s) => s.toggleMarkdownPreview);
  const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);
  const closeAllTabs = useEditorStore((s) => s.closeAllTabs);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeTabsToTheRight = useEditorStore((s) => s.closeTabsToTheRight);
  const splitEditor = useEditorStore((s) => s.splitEditor);
  const popoutTabs = useEditorStore((s) => s.popoutTabs);
  const reorderTabs = useEditorStore((s) => s.reorderTabs);

  const { popOut, focusPopout } = useFloatingWindow();

  // dnd-kit: require 5px movement before drag starts so clicks still register
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    tabId: null,
  });

  const [unsavedDialog, setUnsavedDialog] = useState<UnsavedDialogState>({
    visible: false,
    tabId: null,
    tabName: "",
  });

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((s) => ({ ...s, visible: false }));
  }, []);

  // Close a tab with dirty-check: if the tab has unsaved changes, show a confirmation dialog.
  const safeCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.isDirty) {
        setUnsavedDialog({ visible: true, tabId: tab.id, tabName: tab.name });
      } else {
        closeTab(tabId);
      }
    },
    [tabs, closeTab],
  );

  const handleUnsavedSave = useCallback(async () => {
    const tabId = unsavedDialog.tabId;
    if (!tabId) return;
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_file", { path: tab.path, content: tab.content });
      markSaved(tabId, tab.content);
    } catch (e) {
      console.error("Failed to save file before closing:", e);
    }
    closeTab(tabId);
    setUnsavedDialog({ visible: false, tabId: null, tabName: "" });
  }, [unsavedDialog, tabs, markSaved, closeTab]);

  const handleUnsavedDiscard = useCallback(() => {
    if (unsavedDialog.tabId) {
      closeTab(unsavedDialog.tabId);
    }
    setUnsavedDialog({ visible: false, tabId: null, tabName: "" });
  }, [unsavedDialog, closeTab]);

  const handleUnsavedCancel = useCallback(() => {
    setUnsavedDialog({ visible: false, tabId: null, tabName: "" });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = tabs.findIndex((t) => t.id === active.id);
      const toIndex = tabs.findIndex((t) => t.id === over.id);
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderTabs(fromIndex, toIndex);
      }
    },
    [tabs, reorderTabs],
  );

  if (tabs.length === 0) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isMarkdown = activeTab?.language === "markdown";
  const isPreviewActive = activeTab ? markdownPreviewTabs.has(activeTab.id) : false;
  const tabIds = tabs.map((t) => t.id);

  const handleTabClick = (tab: EditorTab) => {
    if (popoutTabs.has(tab.id)) {
      focusPopout(tab.id);
      return;
    }
    setActiveTab(tab.id);
  };

  const handleTabClose = (e: React.MouseEvent, tab: EditorTab) => {
    e.stopPropagation();
    safeCloseTab(tab.id);
  };

  const handleTabDoubleClick = (tab: EditorTab) => {
    if (tab.isPreview) {
      pinTab(tab.id);
    }
  };

  const handleMiddleClick = (e: React.MouseEvent, tab: EditorTab) => {
    if (e.button === 1) {
      e.preventDefault();
      safeCloseTab(tab.id);
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
        {/* Scrollable, drag-sortable tab list */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center h-full overflow-x-auto flex-1 min-w-0" role="tablist">
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isPoppedOut={popoutTabs.has(tab.id)}
                  onTabClick={handleTabClick}
                  onTabDoubleClick={handleTabDoubleClick}
                  onMiddleClick={handleMiddleClick}
                  onContextMenu={handleContextMenu}
                  onTabClose={handleTabClose}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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
        onSplitRight={(tabId) => splitEditor(tabId, "horizontal")}
        onSplitDown={(tabId) => splitEditor(tabId, "vertical")}
        onCloseTab={safeCloseTab}
        onCloseOthers={closeOtherTabs}
        onCloseToTheRight={closeTabsToTheRight}
        onCloseAll={closeAllTabs}
      />

      {/* Unsaved changes confirmation dialog */}
      <UnsavedChangesDialog
        state={unsavedDialog}
        onSave={handleUnsavedSave}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />
    </>
  );
}

