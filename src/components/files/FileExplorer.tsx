import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, RefreshCw, Search, X } from "lucide-react";
import { useFileTree } from "@/hooks/useFileTree";
import { useGitStatus } from "@/hooks/useGitStatus";
import { FileTreeNode } from "./FileTreeNode";
import { ConflictBanner } from "@/components/agents/ConflictBanner";
import { useEditorStore } from "@/stores/editor";
import { useAgentsStore } from "@/stores/agents";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileNode } from "@/hooks/useFileTree";

// ── Inline name input (VS Code-style) ────────────────────────────────

interface InlineNameInputProps {
  /** Indentation depth so it visually lines up with the tree level */
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

function InlineNameInput({ depth, onSubmit, onCancel }: InlineNameInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const paddingLeft = 8 + depth * 16 + 20; // match FileTreeNode indent + icon width

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) onSubmit(trimmed);
      else onCancel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center h-[22px]"
      style={{ paddingLeft: `${paddingLeft}px`, paddingRight: "8px" }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="w-full rounded px-1 py-0 text-xs outline-none"
        style={{
          backgroundColor: "var(--color-surface-1)",
          color: "var(--color-text)",
          border: "1px solid var(--color-blue)",
          height: "18px",
        }}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

/** State for the inline creation input */
interface InlineCreationState {
  /** Parent directory path where the new item will be created */
  parentPath: string;
  /** Visual depth for indentation */
  depth: number;
  /** Whether we're creating a file or folder */
  kind: "file" | "folder";
}

// ── Inline dialog types ──────────────────────────────────────────────

type InlineDialogMode =
  | { type: "prompt"; title: string; defaultValue: string; onSubmit: (value: string) => void }
  | { type: "confirm"; title: string; onConfirm: () => void }
  | null;

/** A small themed dialog for prompt/confirm, replacing browser built-ins. */
function InlineDialog({
  dialog,
  onClose,
}: {
  dialog: NonNullable<InlineDialogMode>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.type === "prompt" ? dialog.defaultValue : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    if (dialog.type === "prompt") {
      const trimmed = value.trim();
      if (trimmed) {
        dialog.onSubmit(trimmed);
      }
    } else {
      dialog.onConfirm();
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-80 rounded-lg p-4 flex flex-col gap-3"
        style={{
          backgroundColor: "var(--color-mantle)",
          border: "1px solid var(--color-surface-1)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
          {dialog.title}
        </span>

        {dialog.type === "prompt" && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded px-2 py-1 text-xs outline-none"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
              border: "1px solid var(--color-surface-1)",
            }}
          />
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-0)",
            }}
          >
            Cancel
          </button>
          <button
            ref={dialog.type === "confirm" ? inputRef as React.RefObject<HTMLButtonElement> : undefined}
            type="button"
            onClick={handleSubmit}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: dialog.type === "confirm" ? "var(--color-red)" : "var(--color-blue)",
              color: "var(--color-base)",
            }}
          >
            {dialog.type === "confirm" ? "Delete" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Collect all directory paths from a tree (used to auto-expand filtered results). */
function getAllDirPaths(nodes: FileNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.is_dir) {
      result.push(node.path);
      if (node.children) {
        result.push(...getAllDirPaths(node.children));
      }
    }
  }
  return result;
}

/**
 * Recursively filter a tree to only include nodes whose name matches the query,
 * or directories that have matching descendants.
 */
function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const lower = query.toLowerCase();
  const result: FileNode[] = [];
  for (const node of nodes) {
    const nameMatch = node.name.toLowerCase().includes(lower);
    if (node.is_dir && node.children) {
      const filteredChildren = filterTree(node.children, query);
      if (filteredChildren.length > 0 || nameMatch) {
        result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
      }
    } else if (nameMatch) {
      result.push(node);
    }
  }
  return result;
}

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

  const [filterQuery, setFilterQuery] = useState("");
  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce filterQuery by 150ms before applying to the tree
  useEffect(() => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      setDebouncedFilterQuery(filterQuery);
    }, 150);
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  }, [filterQuery]);

  const openFile = useEditorStore((s) => s.openFile);
  const { fileStatuses } = useGitStatus(rootPath);

  const [contextNode, setContextNode] = useState<FileNode | null>(null);
  const [inlineDialog, setInlineDialog] = useState<InlineDialogMode>(null);
  const [inlineCreation, setInlineCreation] = useState<InlineCreationState | null>(null);

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

  /**
   * Compute the depth of a path relative to the root.
   * e.g. rootPath="/a/b", nodePath="/a/b/c/d" → depth=2
   */
  const getNodeDepth = useCallback(
    (nodePath: string): number => {
      if (!rootPath) return 0;
      const rel = nodePath
        .replace(/\\/g, "/")
        .slice(rootPath.replace(/\\/g, "/").length)
        .replace(/^\//, "");
      if (!rel) return 0;
      return rel.split("/").length;
    },
    [rootPath],
  );

  const handleNewFile = useCallback(() => {
    if (!contextNode) return;
    const parentPath = contextNode.is_dir
      ? contextNode.path
      : contextNode.path.replace(/\/[^/]+$/, "");
    const depth = contextNode.is_dir
      ? getNodeDepth(contextNode.path) + 1
      : getNodeDepth(contextNode.path);
    setInlineCreation({ parentPath, depth, kind: "file" });
  }, [contextNode, getNodeDepth]);

  const handleNewFolder = useCallback(() => {
    if (!contextNode) return;
    const parentPath = contextNode.is_dir
      ? contextNode.path
      : contextNode.path.replace(/\/[^/]+$/, "");
    const depth = contextNode.is_dir
      ? getNodeDepth(contextNode.path) + 1
      : getNodeDepth(contextNode.path);
    setInlineCreation({ parentPath, depth, kind: "folder" });
  }, [contextNode, getNodeDepth]);

  const handleInlineCreationSubmit = useCallback(
    async (name: string) => {
      if (!inlineCreation) return;
      const { parentPath, kind } = inlineCreation;
      setInlineCreation(null);
      try {
        if (kind === "file") {
          await invoke("create_file", { path: `${parentPath}/${name}` });
        } else {
          await invoke("create_dir", { path: `${parentPath}/${name}` });
        }
        refresh();
      } catch (e) {
        console.error(`Failed to create ${kind}:`, e);
      }
    },
    [inlineCreation, refresh],
  );

  const handleInlineCreationCancel = useCallback(() => {
    setInlineCreation(null);
  }, []);

  const handleRename = useCallback(() => {
    if (!contextNode) return;
    const parentPath = contextNode.path.replace(/\/[^/]+$/, "");
    setInlineDialog({
      type: "prompt",
      title: "Enter new name",
      defaultValue: contextNode.name,
      onSubmit: async (newName: string) => {
        if (newName === contextNode.name) return;
        try {
          await invoke("rename_path", {
            oldPath: contextNode.path,
            newPath: `${parentPath}/${newName}`,
          });
          refresh();
        } catch (e) {
          console.error("Failed to rename:", e);
        }
      },
    });
  }, [contextNode, refresh]);

  const handleDelete = useCallback(() => {
    if (!contextNode) return;
    setInlineDialog({
      type: "confirm",
      title: `Delete "${contextNode.name}"?`,
      onConfirm: async () => {
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
      },
    });
  }, [contextNode, refresh]);

  const handleCopyPath = useCallback(() => {
    if (!contextNode) return;
    navigator.clipboard.writeText(contextNode.path).catch(() => {});
  }, [contextNode]);

  const handleInvestigate = useCallback(() => {
    if (!contextNode) return;

    const isDir = !contextNode.is_file;
    const targetDesc = isDir
      ? `the directory ${contextNode.path}`
      : `the file ${contextNode.path}`;

    const taskDescription = `Investigate ${targetDesc}. Analyze its structure, purpose, key patterns, and report a concise summary. Do not modify any files.`;

    // Create a subagent with role "specialist"
    const agentId = useAgentsStore.getState().createAgent({
      name: `Investigate: ${contextNode.name}`,
      taskDescription,
      role: "specialist",
    });

    // Dispatch custom event so useClaude or the agents panel can start the session
    if (rootPath) {
      window.dispatchEvent(
        new CustomEvent("vantage:investigate", {
          detail: { agentId, taskDescription, cwd: rootPath },
        }),
      );
    }
  }, [contextNode, rootPath]);

  // Filtered tree for display when the debounced filter query is active
  const filteredTree = useMemo(() => {
    if (!debouncedFilterQuery.trim()) return tree;
    return filterTree(tree, debouncedFilterQuery.trim());
  }, [tree, debouncedFilterQuery]);

  const handleOpenFolder = useCallback(async () => {
    try {
      // Use Tauri's file dialog to pick a folder
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setRootPath(selected as string);
      }
    } catch {
      // Fallback: inline prompt for a path string
      setInlineDialog({
        type: "prompt",
        title: "Enter folder path",
        defaultValue: "",
        onSubmit: (path: string) => {
          setRootPath(path.replace(/\\/g, "/"));
        },
      });
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
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setFilterQuery("");
              setTimeout(() => filterInputRef.current?.focus(), 0);
            }}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="Filter files"
            title="Filter files"
          >
            <Search size={12} />
          </button>
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
      </div>

      {/* Filter input */}
      <div
        className="flex items-center gap-1 px-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <Search size={11} style={{ color: "var(--color-overlay-0)" }} />
        <input
          ref={filterInputRef}
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter files..."
          className="flex-1 bg-transparent text-xs outline-none py-1 placeholder:text-[var(--color-overlay-0)]"
          style={{ color: "var(--color-text)", minWidth: 0 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilterQuery("");
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {filterQuery && (
          <button
            onClick={() => setFilterQuery("")}
            className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="Clear filter"
            title="Clear filter"
          >
            <X size={11} />
          </button>
        )}
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
            className="flex-1 overflow-y-auto scrollbar-thin py-1"
            role="tree"
            aria-label="File Explorer"
          >
            {filteredTree.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                depth={0}
                expandedPaths={debouncedFilterQuery ? new Set([...expandedPaths, ...getAllDirPaths(filteredTree)]) : expandedPaths}
                onToggleExpand={toggleExpand}
                onFileClick={handleFileClick}
                onFileDoubleClick={handleFileDoubleClick}
                onContextMenu={handleContextMenu}
                gitStatuses={fileStatuses}
                filterQuery={debouncedFilterQuery}
              />
            ))}

            {/* Inline name input for New File / New Folder */}
            {inlineCreation && (
              <InlineNameInput
                depth={inlineCreation.depth}
                onSubmit={handleInlineCreationSubmit}
                onCancel={handleInlineCreationCancel}
              />
            )}
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
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={handleInvestigate}
            className="text-xs"
            style={{ color: "var(--color-blue)" }}
          >
            Investigate with Claude
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Inline dialog for prompt/confirm (replaces browser built-ins) */}
      {inlineDialog && (
        <InlineDialog
          dialog={inlineDialog}
          onClose={() => setInlineDialog(null)}
        />
      )}
    </div>
  );
}
