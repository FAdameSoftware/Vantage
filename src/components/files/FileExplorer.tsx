import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, RefreshCw } from "lucide-react";
import { useFileTree } from "@/hooks/useFileTree";
import { useGitStatus } from "@/hooks/useGitStatus";
import { FileTreeNode } from "./FileTreeNode";
import { ConflictBanner } from "@/components/agents/ConflictBanner";
import { useEditorStore } from "@/stores/editor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileNode } from "@/hooks/useFileTree";

export function FileExplorer() {
  const {
    tree,
    isLoading,
    error,
    expandedPaths,
    toggleExpand,
    refresh,
    rootPath,
    setRootPath,
  } = useFileTree();

  const openFile = useEditorStore((s) => s.openFile);
  const { fileStatuses } = useGitStatus(rootPath);

  const [contextNode, setContextNode] = useState<FileNode | null>(null);

  const handleFileClick = useCallback(
    async (node: FileNode) => {
      if (!node.is_file) return;
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: node.path });
        // Single-click opens as preview
        openFile(result.path, node.name, result.language, result.content, true);
      } catch (e) {
        console.error("Failed to open file:", e);
      }
    },
    [openFile]
  );

  const handleFileDoubleClick = useCallback(
    async (node: FileNode) => {
      if (!node.is_file) return;
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: node.path });
        // Double-click opens as pinned tab
        openFile(
          result.path,
          node.name,
          result.language,
          result.content,
          false
        );
      } catch (e) {
        console.error("Failed to open file:", e);
      }
    },
    [openFile]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileNode) => {
      setContextNode(node);
      // The ContextMenu from base-ui handles positioning automatically
      // We just need to track which node was right-clicked
      void e;
    },
    []
  );

  const handleNewFile = useCallback(async () => {
    if (!contextNode) return;
    const parentPath = contextNode.is_dir
      ? contextNode.path
      : contextNode.path.replace(/\/[^/]+$/, "");
    const name = prompt("Enter file name:");
    if (!name) return;

    try {
      await invoke("create_file", { path: `${parentPath}/${name}` });
      refresh();
    } catch (e) {
      console.error("Failed to create file:", e);
    }
  }, [contextNode, refresh]);

  const handleNewFolder = useCallback(async () => {
    if (!contextNode) return;
    const parentPath = contextNode.is_dir
      ? contextNode.path
      : contextNode.path.replace(/\/[^/]+$/, "");
    const name = prompt("Enter folder name:");
    if (!name) return;

    try {
      await invoke("create_dir", { path: `${parentPath}/${name}` });
      refresh();
    } catch (e) {
      console.error("Failed to create folder:", e);
    }
  }, [contextNode, refresh]);

  const handleRename = useCallback(async () => {
    if (!contextNode) return;
    const newName = prompt("Enter new name:", contextNode.name);
    if (!newName || newName === contextNode.name) return;

    const parentPath = contextNode.path.replace(/\/[^/]+$/, "");
    try {
      await invoke("rename_path", {
        oldPath: contextNode.path,
        newPath: `${parentPath}/${newName}`,
      });
      refresh();
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  }, [contextNode, refresh]);

  const handleDelete = useCallback(async () => {
    if (!contextNode) return;
    const confirmed = confirm(
      `Are you sure you want to delete "${contextNode.name}"?`
    );
    if (!confirmed) return;

    try {
      if (contextNode.is_dir) {
        await invoke("delete_dir", { path: contextNode.path });
      } else {
        await invoke("delete_file", { path: contextNode.path });
      }
      refresh();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  }, [contextNode, refresh]);

  const handleCopyPath = useCallback(() => {
    if (!contextNode) return;
    navigator.clipboard.writeText(contextNode.path);
  }, [contextNode]);

  const handleOpenFolder = useCallback(async () => {
    try {
      // Use Tauri's file dialog to pick a folder
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setRootPath(selected as string);
      }
    } catch {
      // Fallback: prompt for a path string
      const path = prompt("Enter folder path:");
      if (path) {
        setRootPath(path.replace(/\\/g, "/"));
      }
    }
  }, [setRootPath]);

  // No folder open yet
  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <FolderOpen size={32} style={{ color: "var(--color-overlay-1)" }} />
        <p
          className="text-xs text-center"
          style={{ color: "var(--color-overlay-1)" }}
        >
          No folder open
        </p>
        <button
          onClick={handleOpenFolder}
          className="px-3 py-1.5 text-xs rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
          }}
        >
          Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-2 h-6 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider truncate"
          style={{ color: "var(--color-subtext-0)" }}
          title={rootPath}
        >
          {rootPath.split("/").pop() ?? "Project"}
        </span>
        <button
          onClick={refresh}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          aria-label="Refresh file tree"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Conflict banner */}
      <ConflictBanner />

      {/* Error state */}
      {error && (
        <div className="p-2 text-xs" style={{ color: "var(--color-red)" }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && tree.length === 0 && (
        <div
          className="p-2 text-xs"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Loading...
        </div>
      )}

      {/* File tree */}
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className="flex-1 overflow-y-auto py-1"
            role="tree"
            aria-label="File Explorer"
          >
            {tree.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                depth={0}
                expandedPaths={expandedPaths}
                onToggleExpand={toggleExpand}
                onFileClick={handleFileClick}
                onFileDoubleClick={handleFileDoubleClick}
                onContextMenu={handleContextMenu}
                gitStatuses={fileStatuses}
              />
            ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-48"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <ContextMenuItem
            onClick={handleNewFile}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            New File
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleNewFolder}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={handleRename}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={handleDelete}
            className="text-xs"
            style={{ color: "var(--color-red)" }}
          >
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={handleCopyPath}
            className="text-xs"
            style={{ color: "var(--color-text)" }}
          >
            Copy Path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
