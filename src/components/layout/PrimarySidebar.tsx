import { Files, Search, GitBranch, Bot, Settings } from "lucide-react";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";

const panelConfig: Record<ActivityBarItem, { title: string; icon: React.ReactNode; description: string }> = {
  explorer: { title: "Explorer", icon: <Files size={16} />, description: "File tree will appear here in Phase 2." },
  search: { title: "Search", icon: <Search size={16} />, description: "Project-wide search will appear here." },
  git: { title: "Source Control", icon: <GitBranch size={16} />, description: "Git status and changes will appear here." },
  agents: { title: "Agents", icon: <Bot size={16} />, description: "Agent dashboard will appear here." },
  settings: { title: "Settings", icon: <Settings size={16} />, description: "Application settings will appear here." },
};

export function PrimarySidebar() {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const config = panelConfig[activeItem];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: "var(--color-mantle)" }}>
      <div className="flex items-center gap-2 px-4 h-9 shrink-0 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-subtext-0)", borderBottom: "1px solid var(--color-surface-0)" }}>
        {config.icon}
        <span>{config.title}</span>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-center text-xs leading-relaxed" style={{ color: "var(--color-overlay-1)" }}>
          {config.description}
        </p>
      </div>
    </div>
  );
}
