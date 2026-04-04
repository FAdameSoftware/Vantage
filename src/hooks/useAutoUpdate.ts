import { useEffect, useState, useCallback } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

export interface UpdateInfo {
  version: string;
  body: string;
}

/**
 * Checks for application updates on mount (after a 5-second delay).
 * If an update is available, shows a toast notification with an "Install" button.
 * The install action downloads the update and relaunches the app.
 */
export function useAutoUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  const installUpdate = useCallback(async () => {
    setDownloading(true);
    try {
      const update: Update | null = await check();
      if (update) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } catch (err) {
      console.error("Update install failed:", err);
      toast.error("Update failed. Please try again later.");
      setDownloading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const update: Update | null = await check();
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
        // Silent failure -- update check is non-critical
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [installUpdate]);

  return { updateAvailable, downloading, installUpdate };
}
