import { Search, GitBranch, Bot, Settings, Files } from "lucide-react";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";
import { FileExplorer } from "@/components/files/FileExplorer";
import { SearchPanel } from "@/components/search/SearchPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { KanbanBoard } from "@/components/agents/KanbanBoard";
import { GitLogPanel } from "@/components/git/GitLogPanel";

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
    icon: <GitBranch size={16} />,
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeItem === "explorer" ? (
          <FileExplorer />
        ) : activeItem === "search" ? (
          <SearchPanel />
        ) : activeItem === "git" ? (
          <GitLogPanel />
        ) : activeItem === "agents" ? (
          <KanbanBoard />
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
