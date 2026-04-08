import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, TextSelect, Terminal, GitBranch, FolderTree, Search, type LucideProps } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layout";
import type { MentionSource, MentionType } from "@/lib/mentionResolver";
import { DIMENSIONS } from "@/lib/dimensions";

// ── File node type (matches useFileTree) ──────────────────────────────────

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  extension: string | null;
  children: FileNode[] | null;
}

interface FlatFile {
  name: string;
  path: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function flattenTree(nodes: FileNode[], result: FlatFile[] = []): FlatFile[] {
  for (const node of nodes) {
    if (node.is_file) {
      result.push({ name: node.name, path: node.path });
    }
    if (node.children) {
      flattenTree(node.children, result);
    }
  }
  return result;
}

function getRelativePath(filePath: string, rootPath: string | null): string {
  if (!rootPath) return filePath;
  const norm = filePath.replace(/\\/g, "/");
  const root = rootPath.replace(/\\/g, "/");
  if (norm.startsWith(root)) {
    return norm.slice(root.length).replace(/^\//, "");
  }
  return norm;
}

/** Simple fuzzy match: all chars of query appear in order in target */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Types ─────────────────────────────────────────────────────────────────

interface MentionAutocompleteProps {
  sources: MentionSource[];
  selectedIndex: number;
  onSelect: (source: MentionSource) => void;
  /** Called when user picks a specific file from the file picker sub-view */
  onSelectFile?: (filePath: string) => void;
  visible: boolean;
}

const ICON_MAP: Record<MentionType, React.ComponentType<LucideProps>> = {
  file: FileText,
  selection: TextSelect,
  terminal: Terminal,
  git: GitBranch,
  folder: FolderTree,
};

// ── File Picker sub-view ──────────────────────────────────────────────────

function FilePicker({
  onSelect,
  onBack,
}: {
  onSelect: (filePath: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FlatFile[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootPath = useLayoutStore((s) => s.projectRootPath);

  // Load project files on mount
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const path = rootPath ?? ".";
        const tree = await invoke<FileNode[]>("get_file_tree", { path, depth: 10 });
        const flat = flattenTree(tree);
        setFiles(flat);
      } catch (err) {
        console.error("Failed to load file tree for mention picker:", err);
        setFiles([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [rootPath]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = query
    ? files.filter((f) => fuzzyMatch(query, getRelativePath(f.path, rootPath)))
    : files;

  // Cap display at 20 items
  const displayed = filtered.slice(0, 20);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, displayed.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && displayed.length > 0) {
        e.preventDefault();
        onSelect(displayed[selectedIdx].path);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    },
    [displayed, selectedIdx, onSelect, onBack],
  );

  return (
    <div
      className="absolute rounded-md shadow-lg overflow-hidden z-50"
      style={{
        bottom: "100%",
        left: 0,
        right: 0,
        maxHeight: DIMENSIONS.dropdown.md,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {/* Search input */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <Search size={11} style={{ color: "var(--color-overlay-1)" }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search project files..."
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
          style={{ color: "var(--color-text)" }}
        />
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-1)]"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={onBack}
        >
          Back
        </button>
      </div>

      {/* File list */}
      <div className="overflow-y-auto" style={{ maxHeight: DIMENSIONS.dropdown.md - 50 }}>
        {isLoading ? (
          <div className="px-3 py-2 text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
            Loading files...
          </div>
        ) : displayed.length === 0 ? (
          <div className="px-3 py-2 text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
            {query ? "No matching files" : "No files found"}
          </div>
        ) : (
          displayed.map((file, i) => (
            <div
              key={file.path}
              className="px-2 py-1 cursor-pointer flex items-center gap-1.5"
              style={{
                backgroundColor: i === selectedIdx ? "var(--color-surface-1)" : undefined,
              }}
              onClick={() => onSelect(file.path)}
              onMouseEnter={() => setSelectedIdx(i)}
              role="option"
              aria-selected={i === selectedIdx}
            >
              <FileText size={11} style={{ color: "var(--color-blue)" }} />
              <span
                className="text-xs truncate"
                style={{ color: "var(--color-text)" }}
              >
                {getRelativePath(file.path, rootPath)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main MentionAutocomplete ──────────────────────────────────────────────

export function MentionAutocomplete({
  sources,
  selectedIndex,
  onSelect,
  onSelectFile,
  visible,
}: MentionAutocompleteProps) {
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Reset file picker when visibility changes
  useEffect(() => {
    if (!visible) {
      setShowFilePicker(false);
    }
  }, [visible]);

  if (!visible || (sources.length === 0 && !showFilePicker)) return null;

  // If showing file picker sub-view
  if (showFilePicker) {
    return (
      <FilePicker
        onSelect={(filePath) => {
          setShowFilePicker(false);
          if (onSelectFile) {
            onSelectFile(filePath);
          }
        }}
        onBack={() => setShowFilePicker(false)}
      />
    );
  }

  return (
    <div
      className="absolute rounded-md shadow-lg overflow-y-auto z-50"
      role="listbox"
      aria-label="Mention sources"
      style={{
        bottom: "100%",
        left: 0,
        right: 0,
        maxHeight: DIMENSIONS.chatInput.maxHeight,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {sources.map((source, i) => {
        const Icon = ICON_MAP[source.type] ?? FileText;
        return (
          <div
            key={source.type}
            className="px-2 py-1.5 cursor-pointer"
            role="option"
            id={`mention-option-${source.type}`}
            aria-selected={i === selectedIndex}
            style={{
              backgroundColor:
                i === selectedIndex ? "var(--color-surface-1)" : undefined,
            }}
            onClick={() => {
              if (source.type === "file" && source.needsExtra) {
                setShowFilePicker(true);
              } else {
                onSelect(source);
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={12} style={{ color: "var(--color-green)" }} />
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-green)" }}
              >
                @{source.label}
              </span>
              {source.type === "file" && (
                <span className="text-[10px]" style={{ color: "var(--color-overlay-0)" }}>
                  (browse)
                </span>
              )}
            </div>
            <p
              className="text-[10px] truncate ml-[18px]"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {source.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
