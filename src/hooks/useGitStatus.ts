import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  /** All file statuses as a flat array (convenience accessor) */
  allStatuses: GitFileStatus[];
  /** Only staged files */
  stagedFiles: GitFileStatus[];
  /** Only unstaged / untracked files */
  unstagedFiles: GitFileStatus[];
  isGitRepo: boolean;
  refresh: () => void;
}

export function useGitStatus(rootPath: string | null): UseGitStatusReturn {
  const [branch, setBranch] = useState<GitBranchInfo | null>(null);
  const [allStatuses, setAllStatuses] = useState<GitFileStatus[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Map<string, GitFileStatus>>(
    new Map()
  );
  const [isGitRepo, setIsGitRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stagedFiles = useMemo(
    () => allStatuses.filter((s) => s.is_staged),
    [allStatuses]
  );

  const unstagedFiles = useMemo(
    () => allStatuses.filter((s) => !s.is_staged),
    [allStatuses]
  );

  const refresh = useCallback(async () => {
    if (!rootPath) return;

    try {
      // Fire both IPC calls in parallel — git_status is a no-op if not a repo
      const [branchInfo, statuses] = await Promise.all([
        invoke<GitBranchInfo>("get_git_branch", { cwd: rootPath }),
        invoke<GitFileStatus[]>("get_git_status", { cwd: rootPath }).catch(
          () => [] as GitFileStatus[],
        ),
      ]);

      setBranch(branchInfo);
      setIsGitRepo(branchInfo.branch !== null);

      if (branchInfo.branch !== null) {
        setAllStatuses(statuses);
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
      setAllStatuses([]);
      setFileStatuses(new Map());
    }
  }, [rootPath]);

  // Initial fetch and poll every 5 seconds.
  // Clear any existing interval at the START of the effect to prevent accumulation
  // when rootPath changes (which changes the refresh callback identity). Without this,
  // the old interval could keep running because the ref is overwritten before the
  // previous cleanup function executes in the same render cycle.
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    refresh();
    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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

  return { branch, fileStatuses, allStatuses, stagedFiles, unstagedFiles, isGitRepo, refresh };
}
