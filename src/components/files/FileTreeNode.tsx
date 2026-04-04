import { ChevronRight, ChevronDown } from "lucide-react";
import { FileIcon } from "./FileIcon";
import type { FileNode } from "@/hooks/useFileTree";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onFileClick: (node: FileNode) => void;
  onFileDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

export function FileTreeNode({
  node,
  depth,
  expandedPaths,
  onToggleExpand,
  onFileClick,
  onFileDoubleClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const paddingLeft = 8 + depth * 16;
  const isExpanded = expandedPaths.has(node.path);

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
        className="flex items-center h-[22px] cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none"
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
          {node.name}
        </span>
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
            />
          ))}
        </div>
      )}
    </>
  );
}
