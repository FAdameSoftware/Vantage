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

function ActivityBarButton({ entry }: { entry: ActivityBarEntry }) {
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
            <entry.icon size={22} strokeWidth={1.5} />
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
            <ActivityBarButton key={entry.id} entry={entry} />
          ))}
        </div>
        <div className="flex flex-col">
          {bottomItems.map((entry) => (
            <ActivityBarButton key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
