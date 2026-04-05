import { Search, GitBranch as GitBranchIcon, Bot, Settings, Files, LayoutGrid, GitFork } from "lucide-react";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";
import { FileExplorer } from "@/components/files/FileExplorer";
import { SearchPanel } from "@/components/search/SearchPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { KanbanBoard } from "@/components/agents/KanbanBoard";
import { AgentTreeView } from "@/components/agents/AgentTreeView";
import { GitLogPanel } from "@/components/git/GitLogPanel";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

const panelConfig: Record<
  ActivityBarItem,
  {
    title: string;
    icon: React.ReactNode;
    description: string;
  }
> = {
  explorer: {
    title: "Explorer",
    icon: <Files size={16} />,
    description: "",
  },
  search: {
    title: "Search",
    icon: <Search size={16} />,
    description: "Project-wide search will appear here.",
  },
  git: {
    title: "Source Control",
    icon: <GitBranchIcon size={16} />,
    description: "Git status and changes will appear here.",
  },
  agents: {
    title: "Agents",
    icon: <Bot size={16} />,
    description: "Agent dashboard will appear here.",
  },
  settings: {
    title: "Settings",
    icon: <Settings size={16} />,
    description: "Application settings will appear here.",
  },
};

// ── Agents view toggle ──────────────────────────────────────────────

function AgentsViewToggle() {
  const viewMode = useLayoutStore((s) => s.agentsViewMode);
  const setViewMode = useLayoutStore((s) => s.setAgentsViewMode);

  return (
    <div className="flex items-center gap-0.5 ml-auto">
      <button
        className="p-1 rounded transition-colors"
        style={{
          color: viewMode === "kanban" ? "var(--color-blue)" : "var(--color-overlay-1)",
          backgroundColor: viewMode === "kanban" ? "var(--color-surface-0)" : "transparent",
        }}
        onClick={() => setViewMode("kanban")}
        title="Kanban view"
        aria-label="Kanban view"
      >
        <LayoutGrid size={12} />
      </button>
      <button
        className="p-1 rounded transition-colors"
        style={{
          color: viewMode === "tree" ? "var(--color-blue)" : "var(--color-overlay-1)",
          backgroundColor: viewMode === "tree" ? "var(--color-surface-0)" : "transparent",
        }}
        onClick={() => setViewMode("tree")}
        title="Tree view"
        aria-label="Tree view"
      >
        <GitFork size={12} />
      </button>
    </div>
  );
}

// ── Agents panel content ────────────────────────────────────────────

function AgentsPanel() {
  const viewMode = useLayoutStore((s) => s.agentsViewMode);

  if (viewMode === "tree") {
    return <AgentTreeView />;
  }
  return <KanbanBoard />;
}

// ── Primary sidebar ─────────────────────────────────────────────────

export function PrimarySidebar() {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const config = panelConfig[activeItem];

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 h-9 shrink-0 text-xs font-semibold uppercase tracking-wider"
        style={{
          color: "var(--color-subtext-0)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {config.icon}
        <span>{config.title}</span>
        {activeItem === "agents" && <AgentsViewToggle />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeItem === "explorer" ? (
          <ErrorBoundary>
            <FileExplorer />
          </ErrorBoundary>
        ) : activeItem === "search" ? (
          <ErrorBoundary>
            <SearchPanel />
          </ErrorBoundary>
        ) : activeItem === "git" ? (
          <GitLogPanel />
        ) : activeItem === "agents" ? (
          <AgentsPanel />
        ) : activeItem === "settings" ? (
          <SettingsPanel />
        ) : (
          <div className="flex items-center justify-center h-full p-4">
            <p
              className="text-center text-xs leading-relaxed"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {config.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
