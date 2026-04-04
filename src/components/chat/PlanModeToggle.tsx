import { ClipboardList } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";

/**
 * Toggle button for plan mode (--permission-mode plan).
 * When active, the next session will start with read-only plan permissions
 * so Claude proposes changes instead of applying them directly.
 */
export function PlanModeToggle() {
  const planMode = useSettingsStore((s) => s.planMode);
  const setPlanMode = useSettingsStore((s) => s.setPlanMode);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={planMode}
      aria-label={planMode ? "Plan mode on — click to disable" : "Plan mode off — click to enable"}
      title={planMode ? "Plan mode: on (sessions start read-only)" : "Plan mode: off"}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
      style={
        planMode
          ? {
              backgroundColor: "var(--color-blue)",
              color: "var(--color-base)",
            }
          : {
              backgroundColor: "transparent",
              color: "var(--color-overlay-1)",
            }
      }
      onClick={() => setPlanMode(!planMode)}
    >
      <ClipboardList size={12} />
      {planMode && <span>Plan</span>}
    </button>
  );
}
