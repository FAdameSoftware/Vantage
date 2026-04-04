import { Check } from "lucide-react";
import { FileIcon } from "@/components/files/FileIcon";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiffFileEntry {
  /** Relative file path */
  path: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
}

interface DiffFileTreeProps {
  files: DiffFileEntry[];
  selectedPath: string | null;
  viewedPaths: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleViewed: (path: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getExtension(filePath: string): string | null {
  const name = filePath.split("/").pop() ?? filePath;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === 0) return null;
  return name.slice(dotIndex + 1).toLowerCase();
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function getDirPath(filePath: string, fileName: string): string {
  return filePath.slice(0, filePath.length - fileName.length);
}

// ── DiffFileTree ───────────────────────────────────────────────────────────────

export function DiffFileTree({
  files,
  selectedPath,
  viewedPaths,
  onSelectFile,
  onToggleViewed,
}: DiffFileTreeProps) {
  if (files.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2 py-8 px-4"
        style={{ color: "var(--color-overlay-0)" }}
      >
        <span className="text-xs text-center">No changed files</span>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {files.map((file) => {
        const isSelected = file.path === selectedPath;
        const isViewed = viewedPaths.has(file.path);
        const fileName = getFileName(file.path);
        const dirPath = getDirPath(file.path, fileName);
        const ext = getExtension(file.path);

        return (
          <div
            key={file.path}
            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: isSelected
                ? "var(--color-surface-1)"
                : "transparent",
              opacity: isViewed && !isSelected ? 0.6 : 1,
              borderBottom: "1px solid var(--color-surface-0)",
            }}
            onClick={() => onSelectFile(file.path)}
            title={file.path}
          >
            {/* Viewed toggle button */}
            <button
              type="button"
              className="shrink-0 flex items-center justify-center w-4 h-4 rounded transition-colors"
              style={{
                color: isViewed
                  ? "var(--color-green)"
                  : "var(--color-overlay-0)",
                border: isViewed
                  ? "none"
                  : "1px solid var(--color-overlay-0)",
                backgroundColor: "transparent",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleViewed(file.path);
              }}
              aria-label={isViewed ? "Mark as unviewed" : "Mark as viewed"}
              title={isViewed ? "Mark as unviewed" : "Mark as viewed"}
            >
              {isViewed && <Check size={10} strokeWidth={3} />}
            </button>

            {/* File icon */}
            <div className="shrink-0">
              <FileIcon
                name={fileName}
                extension={ext}
                isDir={false}
                size={13}
              />
            </div>

            {/* File name + dir path */}
            <div className="flex-1 min-w-0">
              <span
                className="text-xs font-medium block truncate"
                style={{ color: "var(--color-text)" }}
              >
                {fileName}
              </span>
              {dirPath && (
                <span
                  className="block truncate"
                  style={{
                    color: "var(--color-subtext-0)",
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {dirPath}
                </span>
              )}
            </div>

            {/* Diff stats */}
            <div className="shrink-0 flex items-center gap-1 text-xs font-mono">
              {file.additions > 0 && (
                <span style={{ color: "var(--color-green)" }}>
                  +{file.additions}
                </span>
              )}
              {file.deletions > 0 && (
                <span style={{ color: "var(--color-red)" }}>
                  -{file.deletions}
                </span>
              )}
              {file.additions === 0 && file.deletions === 0 && (
                <span style={{ color: "var(--color-overlay-0)" }}>~</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
