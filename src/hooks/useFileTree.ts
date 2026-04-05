import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useLayoutStore } from "@/stores/layout";

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  extension: string | null;
  children: FileNode[] | null;
  is_symlink: boolean;
}

interface FileChangeEvent {
  path: string;
  kind: "Created" | "Modified" | "Removed" | "Renamed" | "Other";
}

interface UseFileTreeReturn {
  tree: FileNode[];
  isLoading: boolean;
  error: string | null;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  refresh: () => void;
  rootPath: string | null;
  setRootPath: (path: string) => void;
}

export function useFileTree(): UseFileTreeReturn {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [rootPath, setRootPathState] = useState<string | null>(null);

  // Read the persisted projectRootPath from the layout store
  const storeProjectRootPath = useLayoutStore((s) => s.projectRootPath);

  const loadTree = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<FileNode[]>("get_file_tree", {
        path,
        depth: 1,
      });
      setTree(result);
    } catch (e) {
      setError(e as string);
      setTree([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // When the layout store's projectRootPath changes (e.g. set from WelcomeScreen
  // or restored from persistence), sync it into local state and load the tree.
  useEffect(() => {
    if (storeProjectRootPath && storeProjectRootPath !== rootPath) {
      setRootPathState(storeProjectRootPath);
      setExpandedPaths(new Set());
      loadTree(storeProjectRootPath);

      // Start file watcher for the restored/new root
      invoke("start_file_watcher", { path: storeProjectRootPath }).catch((err) =>
        console.error("Failed to start file watcher:", err)
      );
    }
  }, [storeProjectRootPath, rootPath, loadTree]);

  const setRootPath = useCallback(
    (path: string) => {
      setRootPathState(path);
      setExpandedPaths(new Set());
      loadTree(path);

      // Sync to layout store so command palette can read it globally
      useLayoutStore.getState().setProjectRootPath(path);

      // Start file watcher for the new root
      invoke("start_file_watcher", { path }).catch((err) =>
        console.error("Failed to start file watcher:", err)
      );
    },
    [loadTree]
  );

  const toggleExpand = useCallback(
    async (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });

      // If expanding and we don't have children loaded, fetch them
      const node = findNode(tree, path);
      if (node && node.is_dir && node.children === null) {
        try {
          const children = await invoke<FileNode[]>("get_directory_children", {
            path,
          });
          setTree((prevTree) => updateNodeChildren(prevTree, path, children));
        } catch (e) {
          console.error("Failed to load children for", path, e);
        }
      }
    },
    [tree]
  );

  const refresh = useCallback(() => {
    if (rootPath) {
      // Preserve expanded state, re-fetch everything
      loadTree(rootPath).then(() => {
        // Re-expand previously expanded directories
        // The tree was reloaded at depth 1, so re-fetch children of expanded dirs
        expandedPaths.forEach(async (expandedPath) => {
          try {
            const children = await invoke<FileNode[]>(
              "get_directory_children",
              { path: expandedPath }
            );
            setTree((prevTree) =>
              updateNodeChildren(prevTree, expandedPath, children)
            );
          } catch {
            // Directory may no longer exist; remove from expanded
            setExpandedPaths((prev) => {
              const next = new Set(prev);
              next.delete(expandedPath);
              return next;
            });
          }
        });
      });
    }
  }, [rootPath, expandedPaths, loadTree]);

  // Listen for file change events from the Rust watcher
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<FileChangeEvent>("file_changed", () => {
      // Debounce is already handled on the Rust side (500ms).
      // On any file change, refresh the tree.
      // For a more efficient approach, we could update only the affected subtree,
      // but a full refresh at depth 1 is fast enough for most projects.
      if (rootPath) {
        refresh();
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [rootPath, refresh]);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      invoke("stop_file_watcher").catch((err) => {
        console.error("Failed to stop file watcher on cleanup:", err);
      });
    };
  }, []);

  return {
    tree,
    isLoading,
    error,
    expandedPaths,
    toggleExpand,
    refresh,
    rootPath,
    setRootPath,
  };
}

// ── Helper Functions ──────────────────────────────────────────────────

function findNode(tree: FileNode[], path: string): FileNode | null {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeChildren(
  tree: FileNode[],
  path: string,
  children: FileNode[]
): FileNode[] {
  return tree.map((node) => {
    if (node.path === path) {
      return { ...node, children };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeChildren(node.children, path, children),
      };
    }
    return node;
  });
}
