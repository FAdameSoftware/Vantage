import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FileCode,
  FolderOpen,
  Clock,
  Star,
  X,
  GitBranch,
  Terminal,
  Search,
  MessageSquare,
  Keyboard,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditorStore } from "@/stores/editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { useLayoutStore } from "@/stores/layout";
import { addRecentFile, getRecentFiles, type RecentFile } from "@/hooks/useRecentFiles";

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

function KeyboardHint({ keys, label, icon }: { keys: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {icon && <span className="shrink-0" style={{ color: "var(--color-overlay-1)" }}>{icon}</span>}
      <kbd
        className="px-1.5 py-0.5 rounded text-xs font-mono shrink-0"
        style={{
          backgroundColor: "var(--color-surface-0)",
          color: "var(--color-subtext-1)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {keys}
      </kbd>
      <span className="text-xs" style={{ color: "var(--color-overlay-1)" }}>{label}</span>
    </div>
  );
}

export function WelcomeTab() {
  const openProject = useWorkspaceStore((s) => s.openProject);
  const recentProjects = useWorkspaceStore((s) => s.recentProjects);
  const loadRecentProjectsList = useWorkspaceStore((s) => s.loadRecentProjectsList);
  const togglePinProject = useWorkspaceStore((s) => s.togglePinProject);
  const removeRecentProject = useWorkspaceStore((s) => s.removeRecentProject);
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  useEffect(() => {
    setRecentFiles(getRecentFiles().slice(0, 8));
  }, []);

  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [projectBranches, setProjectBranches] = useState<Map<string, string>>(new Map());

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
          // Not a git repo or path doesn't exist
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

  const openFile = useEditorStore((s) => s.openFile);
  const handleOpenRecentFile = async (filePath: string, fileName: string, _language: string) => {
    try {
      const result = await invoke<{ path: string; content: string; language: string }>(
        "read_file",
        { path: filePath },
      );
      openFile(result.path, fileName, result.language, result.content);
      addRecentFile({ path: result.path, name: fileName, language: result.language });
    } catch (e) {
      console.error("Failed to open recent file:", e);
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

  const pinnedProjects = recentProjects.filter((p) => p.pinned);
  const unpinnedProjects = recentProjects.filter((p) => !p.pinned);
  const sortedProjects = [...pinnedProjects, ...unpinnedProjects];

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--color-base)" }}>
      <div className="max-w-[600px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          >
            <FileCode size={32} style={{ color: "var(--color-blue)" }} />
          </div>
          <div className="text-center">
            <h2
              className="text-xl font-semibold mb-1"
              style={{ color: "var(--color-text)" }}
            >
              Welcome to Vantage
            </h2>
            <p
              className="text-sm"
              style={{ color: "var(--color-overlay-1)" }}
            >
              Your AI-native IDE for Claude Code
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3 mb-8 justify-center flex-wrap">
          <button
            onClick={handleOpenFolder}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-blue)",
              color: "var(--color-crust)",
            }}
          >
            <FolderOpen size={16} />
            {isLoading ? "Opening..." : "Open Folder"}
          </button>
          <button
            onClick={() => {
              const state = useEditorStore.getState();
              state.openFile(
                "__vantage://untitled",
                "Untitled",
                "plaintext",
                "",
              );
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <FileCode size={16} />
            New File
          </button>
        </div>

        {/* Recent Projects */}
        {sortedProjects.length > 0 && (
          <div className="mb-6">
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
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
                      style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 20%, transparent)` }}
                    >
                      <FolderOpen size={14} style={{ color: iconColor, position: "absolute", top: 3, left: 3, opacity: 0.5 }} />
                      <span className="text-sm font-bold" style={{ color: iconColor }}>
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
                        <span
                          className="text-[10px] flex items-center gap-0.5"
                          style={{ color: "var(--color-overlay-0)" }}
                        >
                          <Clock size={9} />
                          {formatRelativeTime(project.lastOpenedAt)}
                        </span>
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

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <div className="mb-6">
            <h3
              className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Recent Files
            </h3>
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: "1px solid var(--color-surface-0)",
                backgroundColor: "var(--color-mantle)",
              }}
            >
              {recentFiles.map((file) => (
                <button
                  key={file.path}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-0)]"
                  style={{ borderBottom: "1px solid var(--color-surface-0)" }}
                  onClick={() => handleOpenRecentFile(file.path, file.name, file.language)}
                >
                  <FileCode size={14} style={{ color: "var(--color-blue)", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm truncate"
                      style={{ color: "var(--color-text)" }}
                    >
                      {file.name}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "var(--color-overlay-0)" }}
                    >
                      {file.path}
                    </div>
                  </div>
                  <span
                    className="text-[10px] flex items-center gap-0.5 shrink-0"
                    style={{ color: "var(--color-overlay-0)" }}
                  >
                    <Clock size={9} />
                    {formatRelativeTime(file.lastOpenedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <div>
          <h3
            className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Quick Actions
          </h3>
          <div
            className="rounded-lg px-4 py-2"
            style={{
              border: "1px solid var(--color-surface-0)",
              backgroundColor: "var(--color-mantle)",
            }}
          >
            <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" icon={<Search size={12} />} />
            <KeyboardHint keys="Ctrl+P" label="Quick Open" icon={<FileCode size={12} />} />
            <KeyboardHint keys="Ctrl+`" label="Toggle Terminal" icon={<Terminal size={12} />} />
            <KeyboardHint keys="Ctrl+Shift+C" label="Open Chat" icon={<MessageSquare size={12} />} />
            <KeyboardHint keys="Ctrl+K Ctrl+S" label="Keyboard Shortcuts" icon={<Keyboard size={12} />} />
          </div>
        </div>
      </div>
    </div>
  );
}
