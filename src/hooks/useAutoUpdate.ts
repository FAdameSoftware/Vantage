import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

export interface UpdateInfo {
  version: string;
  body: string;
}

/**
 * Checks for application updates on mount (after a 5-second delay).
 * If an update is available, shows a toast notification with an "Install" button.
 * The install action downloads the update and relaunches the app.
 *
 * Gracefully handles the case where the updater plugin is not registered
 * (e.g., during development or when the plugin is commented out in lib.rs).
 */
export function useAutoUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  const installUpdate = useCallback(async () => {
    setDownloading(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (err) {
      console.error("Update install failed:", err);
      toast.error("Update failed. Please try again later.");
    } finally {
      setDownloading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update) {
          const info: UpdateInfo = {
            version: update.version,
            body: update.body ?? "",
          };
          setUpdateAvailable(info);

          toast(`Update available: v${info.version}`, {
            description: info.body || "A new version is ready to install.",
            duration: Infinity,
            action: {
              label: "Install",
              onClick: () => {
                installUpdate();
              },
            },
          });
        }
      } catch {
        // Silent failure — updater plugin may not be registered, or
        // update check is non-critical. This is expected during development.
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [installUpdate]);

  return { updateAvailable, downloading, installUpdate };
}
