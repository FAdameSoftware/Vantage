import { useEffect, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MonacoEditor } from "./MonacoEditor";
import { useEditorStore } from "@/stores/editor";

/**
 * PopoutEditor is rendered in a separate Tauri window.
 *
 * Because each Tauri window has its own JS runtime, we cannot share the
 * Zustand store directly. Instead we synchronize content via Tauri's
 * inter-window event system:
 *
 * - Popout → Main: "popout-content-changed" event
 * - Main → Popout: "main-content-changed" event
 * - Popout save:   "popout-tab-saved" event
 *
 * For the initial load, the popout reads the tab from its own store
 * instance. Because both windows share the same origin, the initial
 * state from the store creation (which reads from the same localStorage
 * if persisted) may be available, but we also listen for a "popout-init"
 * event from the main window for a guaranteed handshake.
 */

interface PopoutData {
  tabId: string;
  path: string;
  name: string;
  language: string;
  content: string;
}

export function PopoutEditor() {
  const params = new URLSearchParams(window.location.search);
  const tabId = params.get("tabId");

  // Attempt to read from local store (may work if store is persisted)
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));
  const updateContent = useEditorStore((s) => s.updateContent);

  // Handle content changes from this popout editor
  const handleChange = useCallback(
    (value: string) => {
      if (!tabId) return;
      updateContent(tabId, value);

      // Notify the main window
      emit("popout-content-changed", { tabId, content: value }).catch(
        (err) => {
          console.error("Failed to emit popout-content-changed event:", err);
        },
      );
    },
    [tabId, updateContent],
  );

  // Handle Ctrl+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!tab || !tabId) return;

        const currentTab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
        if (!currentTab) return;

        invoke("write_file", {
          path: currentTab.path,
          content: currentTab.content,
        })
          .then(() => {
            useEditorStore.getState().markSaved(tabId, currentTab.content);
            emit("popout-tab-saved", {
              tabId,
              content: currentTab.content,
            }).catch((err) => {
              console.error("Failed to emit popout-tab-saved event:", err);
            });
          })
          .catch((err) => {
            console.error("Failed to save file from popout editor:", err);
          });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, tabId]);

  // Listen for content changes pushed from the main window
  useEffect(() => {
    if (!tabId) return;

    const unlisten = listen<{ tabId: string; content: string }>(
      "main-content-changed",
      (event) => {
        if (event.payload.tabId === tabId) {
          updateContent(tabId, event.payload.content);
        }
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [tabId, updateContent]);

  // Listen for init data from main window
  useEffect(() => {
    if (!tabId) return;

    const unlisten = listen<PopoutData>("popout-init", (event) => {
      if (event.payload.tabId === tabId) {
        const { path, name, language, content } = event.payload;
        useEditorStore.getState().openFile(path, name, language, content);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [tabId]);

  if (!tabId) {
    return (
      <div
        className="flex items-center justify-center h-screen w-screen"
        style={{ background: "var(--color-base)", color: "var(--color-text)" }}
      >
        <span className="text-sm">No tab specified.</span>
      </div>
    );
  }

  if (!tab) {
    return (
      <div
        className="flex items-center justify-center h-screen w-screen"
        style={{ background: "var(--color-base)", color: "var(--color-text)" }}
      >
        <span className="text-sm">Loading editor...</span>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ background: "var(--color-base)" }}
    >
      {/* Minimal title bar */}
      <div
        className="h-8 flex items-center px-3 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-mantle)",
        }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: "var(--color-text)" }}
        >
          {tab.name}
        </span>
        {tab.isDirty && (
          <span
            className="ml-1 text-xs"
            style={{ color: "var(--color-yellow)" }}
          >
            *
          </span>
        )}
        <span
          className="ml-2 text-[10px] truncate"
          style={{
            color: "var(--color-overlay-1)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {tab.path}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          filePath={tab.path}
          language={tab.language}
          value={tab.content}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
