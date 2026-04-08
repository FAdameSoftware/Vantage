import { useMemo } from "react";
import {
  Files,
  Search,
  GitBranch,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";
import { useGitStatus } from "@/hooks/useGitStatus";
import { useAgentsStore } from "@/stores/agents";

interface ActivityBarEntry {
  id: ActivityBarItem;
  icon: LucideIcon;
  label: string;
  shortcut: string;
}

const topItems: ActivityBarEntry[] = [
  { id: "explorer", icon: Files, label: "Explorer", shortcut: "Ctrl+Shift+E" },
  { id: "search", icon: Search, label: "Search", shortcut: "Ctrl+Shift+F" },
  { id: "git", icon: GitBranch, label: "Source Control", shortcut: "Ctrl+Shift+G" },
  { id: "agents", icon: Bot, label: "Agents", shortcut: "Ctrl+Shift+A" },
];

const bottomItems: ActivityBarEntry[] = [
  { id: "settings", icon: Settings, label: "Settings", shortcut: "Ctrl+," },
];

/** Small numeric badge displayed at top-right of an activity bar icon. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -top-0.5 -right-1 flex items-center justify-center text-[9px] font-bold leading-none text-white rounded-full"
      style={{
        backgroundColor: "var(--color-blue)",
        minWidth: 16,
        height: 16,
        padding: "0 4px",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ActivityBarButton({
  entry,
  badge,
}: {
  entry: ActivityBarEntry;
  badge?: number;
}) {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const primarySidebarVisible = useLayoutStore((s) => s.primarySidebarVisible);
  const setActiveItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const isActive = activeItem === entry.id && primarySidebarVisible;

  return (
    <Tooltip>
      <TooltipTrigger
        delay={400}
        render={
          <button
            onClick={() => setActiveItem(entry.id)}
            className={`
              relative flex items-center justify-center w-full h-12
              transition-colors duration-150
              ${isActive
                ? "text-[var(--color-text)]"
                : "text-[var(--color-overlay-1)] hover:text-[var(--color-text)]"
              }
            `}
            aria-label={entry.label}
            aria-pressed={isActive}
          >
            {isActive && (
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded-r"
                style={{ backgroundColor: "var(--color-blue)" }}
              />
            )}
            <span className="relative inline-flex">
              <entry.icon size={22} strokeWidth={1.5} />
              <Badge count={badge ?? 0} />
            </span>
          </button>
        }
      />
      <TooltipContent side="right" sideOffset={8}>
        <p className="text-xs">
          {entry.label}{" "}
          <span className="text-[var(--color-overlay-1)]">({entry.shortcut})</span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function ActivityBar() {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const { allStatuses } = useGitStatus(projectRootPath);
  const agentsVersion = useAgentsStore((s) => s.agentsVersion);
  const agentsMap = useAgentsStore((s) => s.agents);

  const gitDirtyCount = allStatuses.length;
  const activeAgentCount = useMemo(
    () =>
      [...agentsMap.values()].filter(
        (a) => a.status === "working" || a.status === "waiting_permission",
      ).length,
    [agentsMap, agentsVersion],
  );

  /** Map activity bar item IDs to badge counts */
  const badges: Partial<Record<ActivityBarItem, number>> = {
    git: gitDirtyCount,
    agents: activeAgentCount,
  };

  return (
    <TooltipProvider>
      <div
        className="flex flex-col justify-between h-full w-12 shrink-0"
        style={{ backgroundColor: "var(--color-crust)" }}
        role="toolbar"
        aria-label="Activity Bar"
      >
        <div className="flex flex-col">
          {topItems.map((entry) => (
            <ActivityBarButton
              key={entry.id}
              entry={entry}
              badge={badges[entry.id]}
            />
          ))}
        </div>
        <div className="flex flex-col">
          {bottomItems.map((entry) => (
            <ActivityBarButton
              key={entry.id}
              entry={entry}
              badge={badges[entry.id]}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
