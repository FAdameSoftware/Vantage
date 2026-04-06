import { useState, useEffect, useCallback } from "react";
import { Minus, Square, X, Copy, MessageSquare, Code } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "@/stores/editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { useLayoutStore, type ViewMode } from "@/stores/layout";
import { MenuBar } from "./MenuBar";

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const hasDirtyTabs = useEditorStore((s) => s.tabs.some((t) => t.isDirty));

  useEffect(() => {
    const appWindow = getCurrentWindow();

    appWindow.isMaximized().then(setIsMaximized).catch((err) => {
      console.error("Failed to check window maximized state:", err);
    });

    let unlisten: (() => void) | undefined;
    appWindow
      .onResized(async () => {
        try {
          setIsMaximized(await appWindow.isMaximized());
        } catch (err) {
          console.error("Failed to update maximized state on resize:", err);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    getCurrentWindow().toggleMaximize();
  };

  const saveAllAndClose = useCallback(async () => {
    const { tabs, markSaved } = useEditorStore.getState();
    const dirty = tabs.filter((t) => t.isDirty);
    for (const tab of dirty) {
      try {
        await invoke("write_file", { path: tab.path, content: tab.content });
        markSaved(tab.id, tab.content);
      } catch (err) {
        console.error(`Failed to save ${tab.path}:`, err);
      }
    }
    // Save workspace state before closing
    try {
      await useWorkspaceStore.getState().saveCurrentWorkspace();
    } catch (err) {
      console.error("Failed to save workspace on close:", err);
    }
    getCurrentWindow().close();
  }, []);

  const discardAndClose = useCallback(async () => {
    // Save workspace state (tab positions, layout, etc.) even when discarding file changes
    try {
      await useWorkspaceStore.getState().saveCurrentWorkspace();
    } catch (err) {
      console.error("Failed to save workspace on close:", err);
    }
    getCurrentWindow().close();
  }, []);

  const handleClose = () => {
    if (hasDirtyTabs) {
      setShowSaveDialog(true);
    } else {
      getCurrentWindow().close();
    }
  };

  const buttonBase =
    "flex items-center justify-center w-12 h-full transition-colors";

  // Derived in render — only used when dialog is open, so no selector needed
  const dirtyTabs = showSaveDialog
    ? useEditorStore.getState().tabs.filter((t) => t.isDirty)
    : [];

  return (
    <>
      <div className="flex items-center h-full ml-auto">
        <button
          className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
          onClick={handleMinimize}
          aria-label="Minimize"
          style={{ color: "var(--color-subtext-0)" }}
        >
          <Minus size={14} />
        </button>

        <button
          className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
          onClick={handleMaximize}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          style={{ color: "var(--color-subtext-0)" }}
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>

        <button
          className={`${buttonBase} hover:bg-[var(--color-red)] hover:text-white`}
          onClick={handleClose}
          aria-label="Close"
          style={{ color: "var(--color-subtext-0)" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Save-on-close confirmation dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div
            className="rounded-lg shadow-xl p-5 max-w-sm w-full mx-4"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--color-text)" }}
            >
              Unsaved Changes
            </h3>
            <p
              className="text-xs mb-3"
              style={{ color: "var(--color-subtext-0)" }}
            >
              The following files have unsaved changes:
            </p>
            <ul
              className="text-xs mb-4 list-disc pl-4 max-h-32 overflow-y-auto"
              style={{ color: "var(--color-text)" }}
            >
              {dirtyTabs.map((t) => (
                <li key={t.id} className="truncate">{t.name}</li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded transition-colors"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--color-subtext-0)",
                  border: "1px solid var(--color-surface-1)",
                }}
                onClick={() => setShowSaveDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded transition-colors"
                style={{
                  backgroundColor: "var(--color-red)",
                  color: "var(--color-base)",
                }}
                onClick={discardAndClose}
              >
                Discard & Close
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded transition-colors"
                style={{
                  backgroundColor: "var(--color-blue)",
                  color: "var(--color-base)",
                }}
                onClick={saveAllAndClose}
              >
                Save All & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function extractProjectName(projectPath: string | null): string | null {
  if (!projectPath) return null;
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || null;
}

function ViewModeToggle() {
  const viewMode = useLayoutStore((s) => s.viewMode);
  const setViewMode = useLayoutStore((s) => s.setViewMode);

  const segments: { mode: ViewMode; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { mode: "claude", label: "Claude", icon: <MessageSquare size={12} />, shortcut: "Ctrl+1" },
    { mode: "ide", label: "IDE", icon: <Code size={12} />, shortcut: "Ctrl+2" },
  ];

  return (
    <div
      className="flex items-center h-6 rounded-md overflow-hidden shrink-0"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="tablist"
      aria-label="View mode"
    >
      {segments.map((seg) => {
        const isActive = viewMode === seg.mode;
        return (
          <button
            key={seg.mode}
            role="tab"
            aria-selected={isActive}
            title={`${seg.label} View (${seg.shortcut})`}
            onClick={() => setViewMode(seg.mode)}
            className="flex items-center gap-1 px-2 h-full text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: isActive ? "color-mix(in srgb, var(--color-blue) 20%, transparent)" : "transparent",
              color: isActive ? "var(--color-blue)" : "var(--color-subtext-0)",
            }}
          >
            {seg.icon}
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

export function TitleBar() {
  const currentProjectPath = useWorkspaceStore((s) => s.currentProjectPath);
  const name = extractProjectName(currentProjectPath);
  const titleText = name ? `${name} - Vantage` : "Vantage";

  return (
    <div
      role="banner"
      className="flex items-center h-9 shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {/* App icon */}
      <div
        className="flex items-center justify-center shrink-0 w-10 h-full"
        style={{ color: "var(--color-blue)" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Vantage"
        >
          <path
            d="M2 3L8 13L14 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Menu bar */}
      <MenuBar />

      {/* View mode toggle */}
      <div className="flex items-center px-2 shrink-0">
        <ViewModeToggle />
      </div>

      {/* Drag region fills remaining space */}
      <div
        className="flex items-center justify-center flex-1 h-full"
        data-tauri-drag-region
      >
        <span
          className="text-xs font-medium pointer-events-none"
          style={{ color: "var(--color-subtext-0)" }}
          data-tauri-drag-region
        >
          {titleText}
        </span>
      </div>

      <WindowControls />
    </div>
  );
}
