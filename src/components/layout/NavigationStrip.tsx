import { MessageSquare, Files, Bot, Settings, type LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLayoutStore, type ViewMode } from "@/stores/layout";

interface NavStripEntry {
  id: string;
  icon: LucideIcon;
  label: string;
  /** If set, clicking this entry switches to the given view mode */
  targetViewMode?: ViewMode;
  /** Activity bar item to activate when switching to IDE view */
  activityBarItem?: "explorer" | "agents" | "settings";
}

const navItems: NavStripEntry[] = [
  { id: "chat", icon: MessageSquare, label: "Chat" },
  { id: "files", icon: Files, label: "Files", targetViewMode: "ide", activityBarItem: "explorer" },
  { id: "agents", icon: Bot, label: "Agents", targetViewMode: "ide", activityBarItem: "agents" },
  { id: "settings", icon: Settings, label: "Settings", targetViewMode: "ide", activityBarItem: "settings" },
];

function NavStripButton({ entry }: { entry: NavStripEntry }) {
  const viewMode = useLayoutStore((s) => s.viewMode);
  const setViewMode = useLayoutStore((s) => s.setViewMode);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const isActive = entry.id === "chat" && viewMode === "claude";

  const handleClick = () => {
    if (entry.targetViewMode) {
      setViewMode(entry.targetViewMode);
      if (entry.activityBarItem) {
        setActiveActivityBarItem(entry.activityBarItem);
      }
    }
    // "chat" entry does nothing — already in Claude View
  };

  return (
    <Tooltip>
      <TooltipTrigger
        delay={400}
        render={
          <button
            onClick={handleClick}
            className={`
              relative flex items-center justify-center w-full h-12
              transition-colors duration-150
              ${isActive
                ? "text-[var(--color-text)]"
                : "text-[var(--color-overlay-1)] hover:text-[var(--color-text)]"
              }
            `}
            aria-label={entry.label}
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
        <p className="text-xs">{entry.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function NavigationStrip() {
  return (
    <TooltipProvider>
      <div
        className="flex flex-col h-full w-12 shrink-0"
        style={{ backgroundColor: "var(--color-crust)" }}
        role="toolbar"
        aria-label="Navigation"
      >
        {navItems.map((entry) => (
          <NavStripButton key={entry.id} entry={entry} />
        ))}
      </div>
    </TooltipProvider>
  );
}
