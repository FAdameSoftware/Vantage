import { useEffect } from "react";
import { useLayoutStore } from "@/stores/layout";
import { useUsageStore } from "@/stores/usage";

/**
 * Loads project usage data from Claude Code session files on disk.
 * Triggers on mount and whenever projectRootPath changes.
 * This gives the status bar real cost/token data without needing
 * a live Claude session.
 */
export function useProjectUsage() {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const loadProjectUsage = useUsageStore((s) => s.loadProjectUsage);

  useEffect(() => {
    if (!projectRootPath) return;
    loadProjectUsage(projectRootPath);
  }, [projectRootPath, loadProjectUsage]);
}
