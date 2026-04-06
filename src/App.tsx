import { useEffect } from "react";
import { IDELayout } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";
import { useKeybindings } from "@/hooks/useKeybindings";
import { useAgentNotifications } from "@/hooks/useAgentNotifications";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { MotionConfig } from "framer-motion";
// import { useProjectUsage } from "@/hooks/useProjectUsage"; // disabled — causes hooks crash
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { PermissionDialog } from "@/components/permissions/PermissionDialog";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { NotificationCenter } from "@/components/shared/NotificationCenter";
import { PrerequisiteCheck } from "@/components/shared/PrerequisiteCheck";
import { PopoutEditor } from "@/components/editor/PopoutEditor";
import { TabSwitcher } from "@/components/editor/TabSwitcher";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { DevPanel } from "@/components/dev/DevPanel";
import { useSettingsStore } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import { initToastCapture } from "@/lib/notifyToast";
import type { ThemeName } from "@/stores/settings";

// Initialize toast capture so all sonner toast calls are recorded in the
// notification store for the notification center history.
initToastCapture();

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

/** Check if this window instance is a popout editor window */
function isPopoutWindow(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("popout") === "1" && params.has("tabId");
}

function App() {
  useKeybindings();
  useAgentNotifications();
  useAutoUpdate();
  useCustomTheme();
  // useProjectUsage(); // temporarily disabled to debug hooks crash

  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes before applying the new one
    root.classList.remove("dark", "theme-light", "theme-high-contrast");
    root.classList.add(getThemeClass(theme));
  }, [theme]);

  // Start workspace auto-save subscriptions
  useEffect(() => {
    const cleanup = useWorkspaceStore.getState().startAutoSave();
    return cleanup;
  }, []);

  // Save workspace state before the browser tab/window unloads
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { currentProjectPath, saveCurrentWorkspace } = useWorkspaceStore.getState();
      if (currentProjectPath) {
        // Fire-and-forget — browser may not wait for async
        saveCurrentWorkspace();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // If this is a popout window, render only the floating editor
  if (isPopoutWindow()) {
    return <ErrorBoundary><PopoutEditor /></ErrorBoundary>;
  }

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <IDELayout />
        <CommandPalette />
        <TabSwitcher />
        <PermissionDialog />
        <NotificationCenter />
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
        <DevPanel />
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;
