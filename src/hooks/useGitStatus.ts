import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface GitBranchInfo {
  branch: string | null;
  is_detached: boolean;
}

export interface GitFileStatus {
  path: string;
  status: string;
  is_staged: boolean;
}

interface UseGitStatusReturn {
  branch: GitBranchInfo | null;
  fileStatuses: Map<string, GitFileStatus>;
  isGitRepo: boolean;
  refresh: () => void;
}

export function useGitStatus(rootPath: string | null): UseGitStatusReturn {
  const [branch, setBranch] = useState<GitBranchInfo | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Map<string, GitFileStatus>>(
    new Map()
  );
  const [isGitRepo, setIsGitRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!rootPath) return;

    try {
      const branchInfo = await invoke<GitBranchInfo>("get_git_branch", {
        cwd: rootPath,
      });
      setBranch(branchInfo);
      setIsGitRepo(branchInfo.branch !== null);

      if (branchInfo.branch !== null) {
        const statuses = await invoke<GitFileStatus[]>("get_git_status", {
          cwd: rootPath,
        });
        const statusMap = new Map<string, GitFileStatus>();
        for (const status of statuses) {
          // Normalize path: make it absolute by prepending rootPath
          const fullPath =
            status.path.startsWith("/") || status.path.includes(":")
              ? status.path
              : `${rootPath}/${status.path}`;
          statusMap.set(fullPath.replace(/\\/g, "/"), status);
        }
        setFileStatuses(statusMap);
      }
    } catch {
      setIsGitRepo(false);
      setBranch(null);
      setFileStatuses(new Map());
    }
  }, [rootPath]);

  // Initial fetch and poll every 5 seconds
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  // Also refresh on file change events
  useEffect(() => {
    const unlisten = listen("file_changed", () => {
      refresh();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  return { branch, fileStatuses, isGitRepo, refresh };
}
