import { useMemo } from "react";
import { ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { useAgentsStore } from "@/stores/agents";
import type { FileNode } from "@/hooks/useFileTree";
import type { GitFileStatus } from "@/hooks/useGitStatus";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onFileClick: (node: FileNode) => void;
  onFileDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  gitStatuses?: Map<string, GitFileStatus>;
  /** When set, matching portions of the file name are highlighted. */
  filterQuery?: string;
}

/** Render a file name with the filter query portion highlighted. */
function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const lower = name.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <span
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-yellow) 35%, transparent)",
          borderRadius: "2px",
        }}
      >
        {name.slice(idx, idx + query.length)}
      </span>
      {name.slice(idx + query.length)}
    </>
  );
}

/** Format a file size in bytes to a human-readable string. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileTreeNode({
  node,
  depth,
  expandedPaths,
  onToggleExpand,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
  gitStatuses,
  filterQuery,
}: FileTreeNodeProps) {
  const paddingLeft = 8 + depth * 16;
  const isExpanded = expandedPaths.has(node.path);

  // Look up git status for this file
  const normalizedPath = node.path.replace(/\\/g, "/");
  const gitStatus = gitStatuses?.get(normalizedPath)?.status;

  // Agent ownership: find agents that have this file assigned
  // Derive from the agents Map instead of calling getAgentsForFile in render
  // (which creates a new array via .filter() on every render, causing infinite loops).
  const agents = useAgentsStore((s) => s.agents);
  const agentsForFile = useMemo(
    () => [...agents.values()].filter((a) => a.assignedFiles.includes(normalizedPath)),
    [agents, normalizedPath],
  );
  const hasConflict = agentsForFile.length > 1;
  const ownerAgent = agentsForFile.length === 1 ? agentsForFile[0] : null;

  const handleClick = () => {
    if (node.is_dir) {
      onToggleExpand(node.path);
    } else {
      onFileClick(node);
    }
  };

  const handleDoubleClick = () => {
    if (!node.is_dir) {
      onFileDoubleClick(node);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, node);
  };

  return (
    <>
      <div
        className="flex items-center h-[22px] cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none min-w-0 overflow-hidden"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        role="treeitem"
        aria-expanded={node.is_dir ? isExpanded : undefined}
        aria-selected={false}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            // Expand directory, or do nothing for files
            if (node.is_dir && !isExpanded) {
              onToggleExpand(node.path);
            } else if (node.is_dir && isExpanded) {
              // Focus first child
              const next = (e.currentTarget as HTMLElement).nextElementSibling
                ?.querySelector("[role='treeitem']") as HTMLElement | null;
              next?.focus();
            }
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            // Collapse directory, or move focus to parent
            if (node.is_dir && isExpanded) {
              onToggleExpand(node.path);
            } else {
              // Focus parent treeitem
              const group = (e.currentTarget as HTMLElement).closest("[role='group']");
              const parent = group?.previousElementSibling as HTMLElement | null;
              if (parent?.getAttribute("role") === "treeitem") {
                parent.focus();
              }
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            // Move to next visible treeitem
            const tree = (e.currentTarget as HTMLElement).closest("[role='tree']");
            if (tree) {
              const items = Array.from(tree.querySelectorAll("[role='treeitem']")) as HTMLElement[];
              const idx = items.indexOf(e.currentTarget as HTMLElement);
              if (idx >= 0 && idx < items.length - 1) {
                items[idx + 1].focus();
              }
            }
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            // Move to previous visible treeitem
            const tree = (e.currentTarget as HTMLElement).closest("[role='tree']");
            if (tree) {
              const items = Array.from(tree.querySelectorAll("[role='treeitem']")) as HTMLElement[];
              const idx = items.indexOf(e.currentTarget as HTMLElement);
              if (idx > 0) {
                items[idx - 1].focus();
              }
            }
          }
        }}
      >
        {/* Expand/collapse chevron for directories */}
        {node.is_dir ? (
          <span className="flex items-center justify-center w-4 h-4 shrink-0">
            {isExpanded ? (
              <ChevronDown
                size={12}
                style={{ color: "var(--color-overlay-1)" }}
              />
            ) : (
              <ChevronRight
                size={12}
                style={{ color: "var(--color-overlay-1)" }}
              />
            )}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/folder icon */}
        <span className="flex items-center justify-center w-4 h-4 mr-1.5 shrink-0">
          <FileIcon
            name={node.name}
            extension={node.extension}
            isDir={node.is_dir}
            isExpanded={isExpanded}
            size={14}
          />
        </span>

        {/* Name */}
        <span
          className="text-xs truncate"
          style={{
            color: node.name.startsWith(".")
              ? "var(--color-overlay-1)"
              : "var(--color-text)",
          }}
        >
          <HighlightedName name={node.name} query={filterQuery ?? ""} />
        </span>

        {/* File size (files only, not directories) */}
        {node.is_file && node.size != null && !gitStatus && (
          <span
            className="ml-auto mr-2 text-[10px] shrink-0 tabular-nums"
            style={{ color: "var(--color-overlay-0)" }}
            title={`${node.size.toLocaleString()} bytes`}
          >
            {formatFileSize(node.size)}
          </span>
        )}
        {node.is_file && node.size != null && gitStatus && (
          <span
            className="ml-1 text-[10px] shrink-0 tabular-nums"
            style={{ color: "var(--color-overlay-0)" }}
            title={`${node.size.toLocaleString()} bytes`}
          >
            {formatFileSize(node.size)}
          </span>
        )}

        {/* Agent ownership indicator */}
        {hasConflict ? (
          <span
            className="ml-1 shrink-0"
            title={`Conflict: ${agentsForFile.map((a) => a.name).join(", ")}`}
          >
            <AlertTriangle size={10} style={{ color: "var(--color-yellow)" }} />
          </span>
        ) : ownerAgent ? (
          <span
            className="ml-1 inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: ownerAgent.color }}
            title={`Assigned to ${ownerAgent.name}`}
          />
        ) : null}

        {/* Git status indicator */}
        {gitStatus && (
          <span
            className="ml-auto mr-2 text-[10px] font-mono font-bold shrink-0"
            style={{
              color:
                gitStatus === "M"
                  ? "var(--color-yellow)"
                  : gitStatus === "A"
                    ? "var(--color-green)"
                    : gitStatus === "D"
                      ? "var(--color-red)"
                      : gitStatus === "?"
                        ? "var(--color-overlay-1)"
                        : "var(--color-subtext-0)",
            }}
          >
            {gitStatus}
          </span>
        )}
      </div>

      {/* Render children if expanded */}
      {node.is_dir && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onFileClick={onFileClick}
              onFileDoubleClick={onFileDoubleClick}
              onContextMenu={onContextMenu}
              gitStatuses={gitStatuses}
              filterQuery={filterQuery}
            />
          ))}
        </div>
      )}
    </>
  );
}
