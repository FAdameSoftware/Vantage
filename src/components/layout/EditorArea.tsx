import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode, FolderOpen, Clock, Pin } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditorStore, selectActiveTab } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { EditorTabs } from "@/components/editor/EditorTabs";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { UsageDashboard } from "@/components/analytics/UsageDashboard";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

function Breadcrumbs() {
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });

  if (!activeTab) return null;

  const segments = activeTab.path.split("/");

  return (
    <div
      className="flex items-center h-6 px-3 text-xs shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-subtext-0)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center shrink-0">
          {i > 0 && (
            <span className="mx-1" style={{ color: "var(--color-overlay-0)" }}>
              /
            </span>
          )}
          <span
            style={{
              color:
                i === segments.length - 1
                  ? "var(--color-text)"
                  : "var(--color-subtext-0)",
            }}
          >
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}

function WelcomeScreen() {
  const openProject = useWorkspaceStore((s) => s.openProject);
  const recentProjects = useWorkspaceStore((s) => s.recentProjects);
  const loadRecentProjectsList = useWorkspaceStore((s) => s.loadRecentProjectsList);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  // Load recent projects on mount
  useEffect(() => {
    loadRecentProjectsList();
  }, [loadRecentProjectsList]);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        await openProject(selected as string);
        setActiveActivityBarItem("explorer");
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  const handleOpenRecent = async (projectPath: string) => {
    try {
      await openProject(projectPath);
      setActiveActivityBarItem("explorer");
    } catch (e) {
      console.error("Failed to open recent project:", e);
    }
  };

  // Separate pinned and unpinned, pinned first
  const pinnedProjects = recentProjects.filter((p) => p.pinned);
  const unpinnedProjects = recentProjects.filter((p) => !p.pinned);
  const sortedProjects = [...pinnedProjects, ...unpinnedProjects];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: "var(--color-surface-0)" }}
      >
        <FileCode size={40} style={{ color: "var(--color-blue)" }} />
      </div>
      <div className="text-center">
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--color-text)" }}
        >
          Welcome to Vantage
        </h2>
        <p
          className="text-sm max-w-md leading-relaxed"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Your AI-native IDE for Claude Code.
        </p>
      </div>

      <button
        onClick={handleOpenFolder}
        disabled={isLoading}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
        style={{
          backgroundColor: "var(--color-blue)",
          color: "var(--color-crust)",
        }}
      >
        <FolderOpen size={18} />
        {isLoading ? "Opening..." : "Open Folder"}
      </button>

      {/* Recent Projects */}
      {sortedProjects.length > 0 && (
        <div className="w-full max-w-md mt-2">
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Recent Projects
          </h3>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: "1px solid var(--color-surface-0)",
              backgroundColor: "var(--color-mantle)",
            }}
          >
            {sortedProjects.slice(0, 8).map((project) => (
              <button
                key={project.path}
                onClick={() => handleOpenRecent(project.path)}
                disabled={isLoading}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-0)] disabled:opacity-50"
                style={{
                  borderBottom: "1px solid var(--color-surface-0)",
                }}
              >
                {project.pinned ? (
                  <Pin size={14} style={{ color: "var(--color-yellow)" }} />
                ) : (
                  <Clock size={14} style={{ color: "var(--color-overlay-0)" }} />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                  >
                    {project.name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--color-overlay-0)" }}
                  >
                    {project.path}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-4">
        <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" />
        <KeyboardHint keys="Ctrl+P" label="Quick Open" />
        <KeyboardHint keys="Ctrl+`" label="Terminal" />
      </div>
    </div>
  );
}

function KeyboardHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <kbd
        className="px-1.5 py-0.5 rounded text-xs font-mono"
        style={{
          backgroundColor: "var(--color-surface-0)",
          color: "var(--color-subtext-1)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {keys}
      </kbd>
      <span style={{ color: "var(--color-overlay-1)" }}>{label}</span>
    </div>
  );
}

export function EditorArea() {
  const updateContent = useEditorStore((s) => s.updateContent);
  const markSaved = useEditorStore((s) => s.markSaved);
  const reloadTab = useEditorStore((s) => s.reloadTab);
  const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);
  const pendingDiffs = useEditorStore((s) => s.pendingDiffs);
  const formatOnSave = useSettingsStore((s) => s.formatOnSave);

  const activeTab = useEditorStore(selectActiveTab);
  const splitDirection = useEditorStore((s) => s.splitDirection);
  const secondaryActiveTabId = useEditorStore((s) => s.secondaryActiveTabId);
  const tabs = useEditorStore((s) => s.tabs);

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
          /* Special built-in tabs (analytics, etc.) */
          <div className="flex-1 overflow-hidden">
            {activeTab.path === "__vantage://analytics" && <UsageDashboard />}
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
                <MarkdownPreview content={activeTab.content} />
              </div>
            )}
          </div>
        )
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}
