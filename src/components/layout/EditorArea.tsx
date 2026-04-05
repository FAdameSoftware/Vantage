import { useCallback, useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode, ChevronRight } from "lucide-react";
import { useEditorStore, selectActiveTab } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { EditorTabs } from "@/components/editor/EditorTabs";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { UsageDashboard } from "@/components/analytics/UsageDashboard";
import { WelcomeTab } from "@/components/editor/WelcomeTab";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { FileIcon } from "@/components/files/FileIcon";
import { useCrossFileIntelligence } from "@/hooks/useCrossFileIntelligence";
import { addRecentFile } from "@/hooks/useRecentFiles";

interface SiblingEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  extension: string | null;
  children: unknown[] | null;
  is_symlink: boolean;
}

function BreadcrumbDropdown({
  dirPath,
  onClose,
}: {
  dirPath: string;
  onClose: () => void;
}) {
  const [siblings, setSiblings] = useState<SiblingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const openFile = useEditorStore((s) => s.openFile);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    invoke<SiblingEntry[]>("get_directory_children", { path: dirPath })
      .then((result) => {
        if (!cancelled) {
          setSiblings(result);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSiblings([]);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dirPath]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    // Use a short delay so the click that opened the dropdown doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleItemClick = async (entry: SiblingEntry) => {
    if (entry.is_file) {
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: entry.path });
        openFile(result.path, entry.name, result.language, result.content, false);
      } catch (e) {
        console.error("Failed to open file from breadcrumb:", e);
      }
    }
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 z-50 mt-0.5 py-1 rounded shadow-lg max-h-64 overflow-y-auto min-w-[180px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {isLoading ? (
        <div
          className="px-3 py-2 text-xs"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Loading...
        </div>
      ) : siblings.length === 0 ? (
        <div
          className="px-3 py-2 text-xs"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Empty directory
        </div>
      ) : (
        siblings.map((entry) => (
          <button
            key={entry.path}
            onClick={() => handleItemClick(entry)}
            className="w-full flex items-center gap-2 px-3 py-1 text-xs text-left hover:bg-[var(--color-surface-1)] transition-colors"
            style={{
              color: entry.is_file
                ? "var(--color-text)"
                : "var(--color-subtext-0)",
              cursor: entry.is_file ? "pointer" : "default",
              opacity: entry.is_dir ? 0.7 : 1,
            }}
          >
            <FileIcon
              name={entry.name}
              extension={entry.extension}
              isDir={entry.is_dir}
              size={14}
            />
            <span className="truncate">{entry.name}</span>
          </button>
        ))
      )}
    </div>
  );
}

function Breadcrumbs() {
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(
    null
  );

  // Close dropdown when active tab changes
  useEffect(() => {
    setOpenDropdownIndex(null);
  }, [activeTab?.id]);

  if (!activeTab) return null;

  const segments = activeTab.path.split("/");

  // Build the directory path for each segment (the parent directory containing its siblings)
  const getDirectoryPath = (segmentIndex: number): string => {
    // For a segment at index i, the containing directory is segments[0..i] joined
    // E.g., for path "C:/Projects/src/main.tsx", clicking "src" (index 2)
    // should show siblings in "C:/Projects/src"
    const parts = segments.slice(0, segmentIndex + 1);
    return parts.join("/");
  };

  const handleSegmentClick = (index: number) => {
    // Last segment is the file name -- no dropdown needed
    if (index === segments.length - 1) return;

    // Toggle dropdown
    setOpenDropdownIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div
      className="flex items-center h-6 px-3 text-xs shrink-0 overflow-x-auto min-w-0"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-subtext-0)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        const isOpen = openDropdownIndex === i;

        return (
          <span key={i} className="flex items-center shrink-0 relative">
            {i > 0 && (
              <ChevronRight
                size={10}
                className="mx-0.5"
                style={{ color: "var(--color-overlay-0)" }}
              />
            )}
            {isLast ? (
              <span
                className="flex items-center gap-1"
                style={{ color: "var(--color-text)" }}
              >
                <FileIcon
                  name={segment}
                  extension={
                    segment.includes(".")
                      ? segment.split(".").pop() ?? null
                      : null
                  }
                  isDir={false}
                  size={12}
                />
                {segment}
              </span>
            ) : (
              <button
                onClick={() => handleSegmentClick(i)}
                className="px-1 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-0)]"
                style={{
                  color: isOpen
                    ? "var(--color-text)"
                    : "var(--color-subtext-0)",
                }}
              >
                {segment}
              </button>
            )}
            {isOpen && (
              <BreadcrumbDropdown
                dirPath={getDirectoryPath(i)}
                onClose={() => setOpenDropdownIndex(null)}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The special tab path for the welcome screen */
export const WELCOME_TAB_PATH = "__vantage://welcome";

/** Open the welcome tab if no other tabs are currently open. */
export function openWelcomeTab() {
  const state = useEditorStore.getState();
  // Don't open a duplicate welcome tab
  if (state.tabs.some((t) => t.path === WELCOME_TAB_PATH)) {
    state.setActiveTab(WELCOME_TAB_PATH.replace(/\\/g, "/").replace(/^[A-Z]:\//, (m) => m[0].toLowerCase() + m.slice(1)));
    return;
  }
  state.openFile(WELCOME_TAB_PATH, "Welcome", "plaintext", "", false);
}

export function EditorArea() {
  // Enable cross-file TypeScript intelligence (registers project files with Monaco TS worker)
  useCrossFileIntelligence();

  const updateContent = useEditorStore((s) => s.updateContent);
  const markSaved = useEditorStore((s) => s.markSaved);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const autoSaveDelay = useSettingsStore((s) => s.autoSaveDelay);
  const reloadTab = useEditorStore((s) => s.reloadTab);
  const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);
  const pendingDiffs = useEditorStore((s) => s.pendingDiffs);
  const formatOnSave = useSettingsStore((s) => s.formatOnSave);

  const activeTab = useEditorStore(selectActiveTab);
  const splitDirection = useEditorStore((s) => s.splitDirection);
  const secondaryActiveTabId = useEditorStore((s) => s.secondaryActiveTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const openFile = useEditorStore((s) => s.openFile);

  // ── Auto-open welcome tab on startup if no tabs exist ─────────────
  const hasInitRef = useRef(false);
  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;
    // Only auto-open welcome if there are zero tabs (fresh start, not restoring workspace)
    if (tabs.length === 0) {
      openFile(WELCOME_TAB_PATH, "Welcome", "plaintext", "", false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track recent files ────────────────────────────────────────────
  useEffect(() => {
    if (!activeTab || activeTab.path.startsWith("__vantage://")) return;
    addRecentFile({
      path: activeTab.path,
      name: activeTab.name,
      language: activeTab.language,
    });
  }, [activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save (afterDelay) ────────────────────────────────────────
  useEffect(() => {
    if (autoSave !== "afterDelay") return;
    if (!activeTab?.isDirty) return;

    const id = setTimeout(async () => {
      // Re-read from store to ensure we have the latest content
      const tab = useEditorStore.getState().getActiveTab();
      if (!tab || !tab.isDirty) return;
      try {
        await invoke("write_file", { path: tab.path, content: tab.content });
        markSaved(tab.id, tab.content);
      } catch (e) {
        console.warn("Auto-save failed:", e);
      }
    }, autoSaveDelay);

    return () => clearTimeout(id);
  }, [activeTab?.content, autoSave, autoSaveDelay, markSaved]);

  // ── Auto-save (onFocusChange) ─────────────────────────────────────
  useEffect(() => {
    if (autoSave !== "onFocusChange") return;

    const handleBlur = async () => {
      const tab = useEditorStore.getState().getActiveTab();
      if (!tab || !tab.isDirty) return;
      try {
        await invoke("write_file", { path: tab.path, content: tab.content });
        markSaved(tab.id, tab.content);
      } catch (e) {
        console.warn("Auto-save on focus change failed:", e);
      }
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [autoSave, markSaved]);

  // ── Markdown sync-scroll state ────────────────────────────────────
  const [mdScrollFraction, setMdScrollFraction] = useState(0);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const isSyncingEditorRef = useRef(false);

  // When the Monaco editor scrolls, compute scroll fraction and push to preview
  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;
    // Monaco renders a scrollable div with class "monaco-scrollable-element"
    const scrollable = pane.querySelector(".monaco-scrollable-element .lines-content")
      ?.parentElement as HTMLElement | null;
    if (!scrollable) return;

    const handleEditorScroll = () => {
      if (isSyncingEditorRef.current) return;
      const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
      if (maxScroll <= 0) return;
      setMdScrollFraction(scrollable.scrollTop / maxScroll);
    };

    scrollable.addEventListener("scroll", handleEditorScroll, { passive: true });
    return () => scrollable.removeEventListener("scroll", handleEditorScroll);
  }, [activeTab?.id]);

  // When the preview scrolls, sync the editor
  const handlePreviewScroll = useCallback((fraction: number) => {
    const pane = editorPaneRef.current;
    if (!pane) return;
    const scrollable = pane.querySelector(".monaco-scrollable-element .lines-content")
      ?.parentElement as HTMLElement | null;
    if (!scrollable) return;

    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
    if (maxScroll <= 0) return;

    isSyncingEditorRef.current = true;
    scrollable.scrollTop = fraction * maxScroll;
    requestAnimationFrame(() => {
      isSyncingEditorRef.current = false;
    });
  }, []);

  // Resolve the secondary tab for split view
  const secondaryTab = secondaryActiveTabId
    ? tabs.find((t) => t.id === secondaryActiveTabId) ?? null
    : null;

  // If the active tab has a pending diff, show the diff viewer instead of the editor.
  // setPendingDiff is wired in useClaude hook — it captures before/after content
  // when Claude's Edit/Write tool calls complete.
  const activeDiff = activeTab ? pendingDiffs.get(activeTab.id) : undefined;

  const isSpecialTab = activeTab?.path.startsWith("__vantage://") ?? false;

  const isSplit = splitDirection !== "none" && secondaryTab !== null;

  const isMarkdownPreview =
    activeTab !== null &&
    !activeDiff &&
    !isSpecialTab &&
    !isSplit &&
    activeTab.language === "markdown" &&
    markdownPreviewTabs.has(activeTab.id);

  // Handle Ctrl+S to save the active file
  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return;
    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      markSaved(activeTab.id, activeTab.content);

      // Format on save: run Prettier then reload the formatted content
      if (formatOnSave) {
        try {
          const formatted = await invoke<string>("format_file", {
            path: activeTab.path,
          });
          // Only update if content actually changed after formatting
          if (formatted !== activeTab.content) {
            reloadTab(activeTab.id, formatted);
          }
        } catch (formatErr) {
          // Formatting failure is non-fatal — file is already saved
          console.warn("Format on save failed:", formatErr);
        }
      }
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  }, [activeTab, markSaved, reloadTab, formatOnSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleSave]);

  const handleContentChange = useCallback(
    (newValue: string) => {
      if (activeTab) {
        updateContent(activeTab.id, newValue);
      }
    },
    [activeTab, updateContent]
  );

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
      data-allow-select="true"
    >
      {/* Tab bar */}
      <EditorTabs />

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Editor content */}
      {activeTab ? (
        isSpecialTab ? (
          /* Special built-in tabs (analytics, welcome, etc.) */
          <div className="flex-1 overflow-hidden">
            {activeTab.path === "__vantage://analytics" && <UsageDashboard />}
            {activeTab.path === WELCOME_TAB_PATH && <WelcomeTab />}
          </div>
        ) : activeDiff ? (
          /* Diff viewer — replaces the normal editor when a pending diff exists */
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <DiffViewer
                key={activeTab.id}
                diff={activeDiff}
                language={activeTab.language}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <div
            className="flex-1 overflow-hidden flex"
            style={{
              flexDirection:
                isSplit && splitDirection === "vertical" ? "column" : "row",
            }}
          >
            {/* Primary Monaco editor pane */}
            <div
              ref={isMarkdownPreview ? editorPaneRef : undefined}
              className={
                isMarkdownPreview || isSplit ? "flex-1" : "w-full"
              }
              style={{
                overflow: "hidden",
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <ErrorBoundary>
                <MonacoEditor
                  key={activeTab.id}
                  filePath={activeTab.path}
                  language={activeTab.language}
                  value={activeTab.content}
                  onChange={handleContentChange}
                />
              </ErrorBoundary>
            </div>

            {/* Split pane — secondary editor */}
            {isSplit && secondaryTab && (
              <div
                className="flex-1"
                style={{
                  overflow: "hidden",
                  minWidth: 0,
                  minHeight: 0,
                  borderLeft:
                    splitDirection === "horizontal"
                      ? "1px solid var(--color-surface-0)"
                      : undefined,
                  borderTop:
                    splitDirection === "vertical"
                      ? "1px solid var(--color-surface-0)"
                      : undefined,
                }}
              >
                <ErrorBoundary>
                  <MonacoEditor
                    key={`split-${secondaryTab.id}`}
                    filePath={secondaryTab.path}
                    language={secondaryTab.language}
                    value={secondaryTab.content}
                    onChange={(newValue) =>
                      updateContent(secondaryTab.id, newValue)
                    }
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* Markdown preview — right half, only when toggled (not in split mode) */}
            {isMarkdownPreview && (
              <div
                className="flex-1 overflow-hidden"
                style={{ borderLeft: "1px solid var(--color-surface-0)" }}
              >
                <MarkdownPreview
                  content={activeTab.content}
                  scrollFraction={mdScrollFraction}
                  onScroll={handlePreviewScroll}
                />
              </div>
            )}
          </div>
        )
      ) : (
        /* Minimal empty state when no tabs are open */
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2" style={{ opacity: 0.1 }}>
            <FileCode size={64} style={{ color: "var(--color-text)" }} />
          </div>
          <p
            className="absolute text-xs"
            style={{ color: "var(--color-overlay-0)" }}
          >
            No open editors
          </p>
        </div>
      )}
    </div>
  );
}
