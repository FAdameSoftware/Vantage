import { useSettingsStore } from "@/stores/settings";
import { BuddyWidget as BuddyWidgetShared } from "@/components/shared/BuddyWidget";

export interface StatusBarBuddyWidgetProps {
  windowWidth: number;
}

export function StatusBarBuddyWidget({ windowWidth }: StatusBarBuddyWidgetProps) {
  const showBuddy = useSettingsStore((s) => s.showBuddy);
  const toggleBuddy = useSettingsStore((s) => s.toggleBuddy);

  // Coding buddy — Inkwell — hidden below 1200px
  if (windowWidth < 1200) return null;

  return (
    <button
      onClick={() => toggleBuddy()}
      className="hover:opacity-80 transition-opacity shrink-0"
      title={showBuddy ? "Hide Inkwell" : "Show Inkwell"}
    >
      <BuddyWidgetShared visible={showBuddy} />
    </button>
  );
}
