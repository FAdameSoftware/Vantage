import { useMemo } from "react";
import { FileCode } from "lucide-react";
import {
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { getRecentFiles } from "@/hooks/useRecentFiles";
import type { FileNode } from "@/hooks/useFileTree";

// ── Types ────────────────────────────────────────────────────────────

export interface FlatFile {
  name: string;
  path: string;
  extension: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function flattenTree(
  nodes: FileNode[],
  result: FlatFile[] = []
): FlatFile[] {
  for (const node of nodes) {
    if (node.is_file) {
      result.push({ name: node.name, path: node.path, extension: node.extension });
    }
    if (node.children) {
      flattenTree(node.children, result);
    }
  }
  return result;
}

export function getRelativePath(filePath: string, rootPath: string | null): string {
  if (!rootPath) return filePath;
  const norm = filePath.replace(/\\/g, "/");
  const root = rootPath.replace(/\\/g, "/");
  if (norm.startsWith(root)) {
    return norm.slice(root.length).replace(/^\//, "");
  }
  return norm;
}

function getFileIcon(_extension: string | null): React.ReactNode {
  return <FileCode className="size-4 shrink-0 text-muted-foreground" />;
}

// ── FilesView ────────────────────────────────────────────────────────

interface FilesViewProps {
  files: FlatFile[];
  rootPath: string | null;
  onSelect: (file: FlatFile) => void;
}

export function FilesView({ files, rootPath, onSelect }: FilesViewProps) {
  return (
    <CommandGroup heading="Files">
      {files.map((file) => (
        <CommandItem
          key={file.path}
          value={file.path}
          onSelect={() => onSelect(file)}
        >
          {getFileIcon(file.extension)}
          <span className="truncate">{getRelativePath(file.path, rootPath)}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

// ── RecentFilesView ──────────────────────────────────────────────────

interface RecentFilesViewProps {
  searchText: string;
  rootPath: string | null;
  onSelect: (file: { path: string; name: string; language: string }) => void;
}

export function RecentFilesView({ searchText, rootPath, onSelect }: RecentFilesViewProps) {
  const query = searchText.startsWith("@")
    ? searchText.slice(1).trimStart().toLowerCase()
    : searchText.toLowerCase();

  const recentFiles = useMemo(() => getRecentFiles(), []);
  const filtered = query
    ? recentFiles.filter(
        (f) =>
          f.name.toLowerCase().includes(query) ||
          f.path.toLowerCase().includes(query),
      )
    : recentFiles;

  if (filtered.length === 0) {
    return (
      <CommandGroup heading="Recent Files">
        <CommandItem value="no-recent-files" disabled>
          <FileCode className="size-4 shrink-0 text-muted-foreground" />
          <span>No recently opened files</span>
        </CommandItem>
      </CommandGroup>
    );
  }

  return (
    <CommandGroup heading="Recent Files">
      {filtered.map((file) => (
        <CommandItem
          key={file.path}
          value={file.path}
          onSelect={() => onSelect(file)}
        >
          {getFileIcon(file.path.split(".").pop() ?? null)}
          <span className="truncate">{getRelativePath(file.path, rootPath)}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
