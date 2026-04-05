import { useCallback, useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { useEditorStore } from "@/stores/editor";

/**
 * Sanitize a tab ID into a valid Tauri window label.
 * Tauri window labels must match [a-zA-Z0-9-].
 */
function toWindowLabel(tabId: string): string {
  return "popout-" + tabId.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 60);
}

/**
 * Create a popout window for a given tab.
 * Returns the WebviewWindow instance.
 */
async function createPopoutWindow(
  tabId: string,
  fileName: string,
): Promise<WebviewWindow | null> {
  const label = toWindowLabel(tabId);

  // Check if a window with this label already exists
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return existing;
  }

  const popout = new WebviewWindow(label, {
    title: `${fileName} - Vantage`,
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    center: true,
    decorations: true,
    url: `index.html?popout=1&tabId=${encodeURIComponent(tabId)}`,
  });

  return popout;
}

/**
 * Hook providing floating window capabilities for editor tabs.
 *
 * Call `popOutTab(tabId)` to pop a tab out into a separate Tauri window.
 * The hook also manages bidirectional content sync between main and popout
 * windows via Tauri events.
 */
export function useFloatingWindow() {
  const popoutTab = useEditorStore((s) => s.popoutTab);
  const returnPopoutTab = useEditorStore((s) => s.returnPopoutTab);

  // Listen for content changes from popout windows
  useEffect(() => {
    const unlisten = listen<{ tabId: string; content: string }>(
      "popout-content-changed",
      (event) => {
        const { tabId, content } = event.payload;
        useEditorStore.getState().updateContent(tabId, content);
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for save events from popout windows
  useEffect(() => {
    const unlisten = listen<{ tabId: string; content: string }>(
      "popout-tab-saved",
      (event) => {
        const { tabId, content } = event.payload;
        useEditorStore.getState().markSaved(tabId, content);
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  /**
   * Pop out a tab to a separate floating window.
   */
  const popOut = useCallback(
    async (tabId: string) => {
      const tab = useEditorStore
        .getState()
        .tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Mark as popped out in the store
      popoutTab(tabId);

      // Create the window
      const popoutWindow = await createPopoutWindow(tabId, tab.name);
      if (!popoutWindow) return;

      // Race condition fix (2B): Replace fragile setTimeout(500) with event-driven
      // readiness. The popout window emits "popout-ready" after its React app mounts.
      // We wait for that signal before sending init data, with a 5s timeout fallback
      // that closes the window and warns the user if it never becomes ready.
      const readyUnlisten = await listen<{ tabId: string }>(
        "popout-ready",
        (event) => {
          if (event.payload.tabId !== tabId) return;
          clearTimeout(readyTimeout);
          readyUnlisten();
          emit("popout-init", {
            tabId: tab.id,
            path: tab.path,
            name: tab.name,
            language: tab.language,
            content: tab.content,
          }).catch((err) => {
            console.error("Failed to emit popout-init event:", err);
          });
        },
      );

      const readyTimeout = setTimeout(() => {
        readyUnlisten();
        console.error("Popout window failed to signal ready within 5 seconds");
        returnPopoutTab(tabId);
        popoutWindow.close().catch(() => {});
      }, 5000);

      // Listen for close to return the tab
      popoutWindow.onCloseRequested(async () => {
        clearTimeout(readyTimeout);
        readyUnlisten();
        returnPopoutTab(tabId);
        await popoutWindow.close();
      });
    },
    [popoutTab, returnPopoutTab],
  );

  /**
   * Focus a popout window (if the user clicks the grayed-out tab).
   */
  const focusPopout = useCallback(async (tabId: string) => {
    const label = toWindowLabel(tabId);
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
    }
  }, []);

  /**
   * Push a content update from main to all popout windows.
   * Call this when main window content changes (e.g., from Claude edit).
   */
  const syncToPopout = useCallback(
    (tabId: string, content: string) => {
      const isPopped = useEditorStore.getState().isPopout(tabId);
      if (isPopped) {
        emit("main-content-changed", { tabId, content }).catch((err) => {
          console.error("Failed to emit main-content-changed event:", err);
        });
      }
    },
    [],
  );

  return { popOut, focusPopout, syncToPopout };
}
