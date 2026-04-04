import { useEffect } from "react";
import { IDELayout } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";
import { useKeybindings } from "@/hooks/useKeybindings";
import { useAgentNotifications } from "@/hooks/useAgentNotifications";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { PermissionDialog } from "@/components/permissions/PermissionDialog";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { PrerequisiteCheck } from "@/components/shared/PrerequisiteCheck";
import { useSettingsStore } from "@/stores/settings";
import type { ThemeName } from "@/stores/settings";

/** Map theme name to the HTML class that activates it */
function getThemeClass(theme: ThemeName): string {
  switch (theme) {
    case "vantage-light":
      return "theme-light";
    case "vantage-high-contrast":
      return "theme-high-contrast";
    case "vantage-dark":
    default:
      return "dark";
  }
}

function App() {
  useKeybindings();
  useAgentNotifications();
  useAutoUpdate();
  useCustomTheme();

  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes before applying the new one
    root.classList.remove("dark", "theme-light", "theme-high-contrast");
    root.classList.add(getThemeClass(theme));
  }, [theme]);

  return (
    <>
      <IDELayout />
      <CommandPalette />
      <PermissionDialog />
      <PrerequisiteCheck />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          },
        }}
      />
    </>
  );
}

export default App;
