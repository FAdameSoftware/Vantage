import { useCallback, useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode, FolderOpen, Clock, ChevronRight, Star, X, GitBranch } from "lucide-react";
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
import { FileIcon } from "@/components/files/FileIcon";
import { useCrossFileIntelligence } from "@/hooks/useCrossFileIntelligence";

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
      className="flex items-center h-6 px-3 text-xs shrink-0 overflow-x-auto"
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

/** Format a relative time string from an ISO 8601 timestamp. */
function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return "just now";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return date.toLocaleDateString();
}

/** Extract a color from the project name for the project icon. */
function projectIconColor(name: string): string {
  const colors = [
    "var(--color-blue)",
    "var(--color-mauve)",
    "var(--color-green)",
    "var(--color-peach)",
    "var(--color-red)",
    "var(--color-teal)",
    "var(--color-yellow)",
    "var(--color-pink)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function WelcomeScreen() {
  const openProject = useWorkspaceStore((s) => s.openProject);
  const recentProjects = useWorkspaceStore((s) => s.recentProjects);
  const loadRecentProjectsList = useWorkspaceStore((s) => s.loadRecentProjectsList);
  const togglePinProject = useWorkspaceStore((s) => s.togglePinProject);
  const removeRecentProject = useWorkspaceStore((s) => s.removeRecentProject);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  // Track which project card is hovered for showing remove button
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Track git branch per project (lazy-loaded)
  const [projectBranches, setProjectBranches] = useState<Map<string, string>>(new Map());

  // Load recent projects on mount
  useEffect(() => {
    loadRecentProjectsList();
  }, [loadRecentProjectsList]);

  // Fetch git branch for each recent project
  useEffect(() => {
    if (recentProjects.length === 0) return;
    let cancelled = false;
    const fetchBranches = async () => {
      const branchMap = new Map<string, string>();
      for (const project of recentProjects.slice(0, 8)) {
        try {
          const info = await invoke<{ branch: string | null; is_detached: boolean }>(
            "get_git_branch",
            { cwd: project.path },
          );
          if (!cancelled && info.branch) {
            branchMap.set(project.path, info.branch);
          }
        } catch {
          // Not a git repo or path doesn't exist — skip
        }
      }
      if (!cancelled) {
        setProjectBranches(branchMap);
      }
    };
    fetchBranches();
    return () => { cancelled = true; };
  }, [recentProjects]);

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

  const handleTogglePin = (e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation();
    togglePinProject(projectPath);
  };

  const handleRemove = (e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation();
    removeRecentProject(projectPath);
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
            {sortedProjects.slice(0, 8).map((project) => {
              const firstLetter = (project.name[0] ?? "?").toUpperCase();
              const iconColor = projectIconColor(project.name);
              const branchName = projectBranches.get(project.path);
              const isHovered = hoveredPath === project.path;

              return (
                <div
                  key={project.path}
                  className="relative flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-0)] cursor-pointer group"
                  style={{
                    borderBottom: "1px solid var(--color-surface-0)",
                    opacity: isLoading ? 0.5 : 1,
                  }}
                  onClick={() => !isLoading && handleOpenRecent(project.path)}
                  onMouseEnter={() => setHoveredPath(project.path)}
                  onMouseLeave={() => setHoveredPath(null)}
                >
                  {/* Project icon: folder with first letter */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
                    style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 20%, transparent)` }}
                  >
                    <FolderOpen size={14} style={{ color: iconColor, position: "absolute", top: 3, left: 3, opacity: 0.5 }} />
                    <span
                      className="text-sm font-bold"
                      style={{ color: iconColor }}
                    >
                      {firstLetter}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--color-text)" }}
                      >
                        {project.name}
                      </span>
                      {project.pinned && (
                        <Star
                          size={10}
                          fill="var(--color-yellow)"
                          style={{ color: "var(--color-yellow)", flexShrink: 0 }}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-xs truncate"
                        style={{ color: "var(--color-overlay-0)" }}
                      >
                        {project.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {/* Relative time */}
                      <span
                        className="text-[10px] flex items-center gap-0.5"
                        style={{ color: "var(--color-overlay-0)" }}
                      >
                        <Clock size={9} />
                        {formatRelativeTime(project.lastOpenedAt)}
                      </span>
                      {/* Git branch */}
                      {branchName && (
                        <span
                          className="text-[10px] flex items-center gap-0.5"
                          style={{ color: "var(--color-overlay-0)" }}
                        >
                          <GitBranch size={9} />
                          {branchName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons: pin/unpin and remove — visible on hover */}
                  <div
                    className="flex items-center gap-0.5 shrink-0 transition-opacity"
                    style={{ opacity: isHovered ? 1 : 0 }}
                  >
                    <button
                      onClick={(e) => handleTogglePin(e, project.path)}
                      className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
                      title={project.pinned ? "Unpin project" : "Pin project"}
                      aria-label={project.pinned ? "Unpin project" : "Pin project"}
                    >
                      <Star
                        size={12}
                        fill={project.pinned ? "var(--color-yellow)" : "none"}
                        style={{ color: project.pinned ? "var(--color-yellow)" : "var(--color-overlay-1)" }}
                      />
                    </button>
                    <button
                      onClick={(e) => handleRemove(e, project.path)}
                      className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
                      title="Remove from recents"
                      aria-label="Remove from recents"
                    >
                      <X size={12} style={{ color: "var(--color-overlay-1)" }} />
                    </button>
                  </div>
                </div>
              );
            })}
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
  // Enable cross-file TypeScript intelligence (registers project files with Monaco TS worker)
  useCrossFileIntelligence();

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
        <WelcomeScreen />
      )}
    </div>
  );
}
