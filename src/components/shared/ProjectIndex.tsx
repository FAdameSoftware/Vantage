import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderTree,
  RefreshCw,
  FileCode,
  Package,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { toast } from "sonner";

// ── Types mirroring Rust structs ──────────────────────────────────────────

interface ProjectIndexData {
  rootPath: string;
  indexedAt: number;
  totalFiles: number;
  totalDirs: number;
  totalLines: number;
  filesByExtension: Record<string, number>;
  directoryTree: string;
  keyFiles: Array<{ name: string; category: string; path: string }>;
  dependencies: Array<{ name: string; version: string; ecosystem: string }>;
  languages: Array<{
    name: string;
    extension: string;
    fileCount: number;
    percentage: number;
  }>;
}

// ── Language colors ───────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: "var(--color-blue)",
  JavaScript: "var(--color-yellow)",
  Rust: "var(--color-peach)",
  Python: "var(--color-green)",
  Go: "var(--color-teal)",
  CSS: "var(--color-mauve)",
  HTML: "var(--color-red)",
  JSON: "var(--color-overlay-1)",
  TOML: "var(--color-flamingo)",
  Markdown: "var(--color-subtext-0)",
};

function getLangColor(name: string): string {
  return LANG_COLORS[name] ?? "var(--color-overlay-1)";
}

// ── Category icons ────────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case "readme":
      return <FileText size={12} style={{ color: "var(--color-blue)" }} />;
    case "manifest":
      return <Package size={12} style={{ color: "var(--color-green)" }} />;
    default:
      return <FileCode size={12} style={{ color: "var(--color-subtext-0)" }} />;
  }
}

function formatLargeNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Component ─────────────────────────────────────────────────────────────

export function ProjectIndex() {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);

  const [index, setIndex] = useState<ProjectIndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(false);

  const loadIndex = useCallback(async () => {
    if (!projectRootPath) return;
    setLoading(true);
    try {
      const result = await invoke<ProjectIndexData | null>(
        "get_project_index",
        { rootPath: projectRootPath },
      );
      if (result) {
        setIndex(result);
      } else {
        // Auto-trigger indexing if no cache
        setIndexing(true);
        const fresh = await invoke<ProjectIndexData>("index_project", {
          rootPath: projectRootPath,
          force: false,
        });
        setIndex(fresh);
        setIndexing(false);
      }
    } catch (err) {
      console.error("Failed to load project index:", err);
    } finally {
      setLoading(false);
    }
  }, [projectRootPath]);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  const handleReindex = useCallback(async () => {
    if (!projectRootPath) return;
    setIndexing(true);
    try {
      const result = await invoke<ProjectIndexData>("index_project", {
        rootPath: projectRootPath,
        force: true,
      });
      setIndex(result);
      toast.success("Project re-indexed successfully");
    } catch (err) {
      toast.error("Failed to re-index project");
      console.error(err);
    } finally {
      setIndexing(false);
    }
  }, [projectRootPath]);

  if (loading && !index) {
    return (
      <div
        className="p-4 text-xs text-center"
        style={{ color: "var(--color-subtext-0)" }}
      >
        Loading project index...
      </div>
    );
  }

  if (!index) {
    return (
      <div
        className="p-4 text-xs text-center"
        style={{ color: "var(--color-subtext-0)" }}
      >
        No project indexed yet.
      </div>
    );
  }

  // Group dependencies by ecosystem
  const depsByEcosystem: Record<string, typeof index.dependencies> = {};
  for (const dep of index.dependencies) {
    if (!depsByEcosystem[dep.ecosystem]) depsByEcosystem[dep.ecosystem] = [];
    depsByEcosystem[dep.ecosystem].push(dep);
  }

  return (
    <div
      className="flex flex-col text-xs"
      style={{ color: "var(--color-text)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        <div className="flex items-center gap-2 font-medium">
          <FolderTree size={14} style={{ color: "var(--color-blue)" }} />
          Project Index
        </div>
        <button
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-subtext-0)" }}
          onClick={handleReindex}
          disabled={indexing}
        >
          <RefreshCw
            size={11}
            className={indexing ? "animate-spin" : ""}
          />
          <span>Re-index</span>
        </button>
      </div>

      {/* Overview grid */}
      <div
        className="grid grid-cols-2 gap-2 p-3"
        style={{ borderBottom: "1px solid var(--color-surface-1)" }}
      >
        {[
          { label: "Files", value: formatLargeNumber(index.totalFiles) },
          { label: "Directories", value: formatLargeNumber(index.totalDirs) },
          { label: "Lines", value: formatLargeNumber(index.totalLines) },
          { label: "Languages", value: String(index.languages.length) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded p-2"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          >
            <div
              className="text-[10px] mb-0.5"
              style={{ color: "var(--color-subtext-0)" }}
            >
              {stat.label}
            </div>
            <div className="font-semibold text-sm">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Languages bar */}
      {index.languages.length > 0 && (
        <div
          className="p-3"
          style={{ borderBottom: "1px solid var(--color-surface-1)" }}
        >
          <div
            className="h-2 rounded-full overflow-hidden flex mb-2"
            style={{ backgroundColor: "var(--color-surface-1)" }}
          >
            {index.languages.map((lang) => (
              <div
                key={lang.extension}
                style={{
                  width: `${lang.percentage}%`,
                  backgroundColor: getLangColor(lang.name),
                  minWidth: lang.percentage > 0 ? "2px" : "0",
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {index.languages.map((lang) => (
              <div key={lang.extension} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getLangColor(lang.name) }}
                />
                <span style={{ color: "var(--color-subtext-0)" }}>
                  {lang.name}
                </span>
                <span style={{ color: "var(--color-overlay-1)" }}>
                  {lang.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Files */}
      {index.keyFiles.length > 0 && (
        <div
          className="p-3"
          style={{ borderBottom: "1px solid var(--color-surface-1)" }}
        >
          <div
            className="font-medium mb-2"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Key Files
          </div>
          <div className="flex flex-col gap-1">
            {index.keyFiles.map((kf) => (
              <div key={kf.path} className="flex items-center gap-1.5">
                <CategoryIcon category={kf.category} />
                <span>{kf.name}</span>
                <span
                  className="ml-auto text-[10px]"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  {kf.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Directory Tree */}
      {index.directoryTree && (
        <div style={{ borderBottom: "1px solid var(--color-surface-1)" }}>
          <button
            className="flex items-center gap-1.5 w-full p-3 hover:bg-[var(--color-surface-0)] transition-colors"
            onClick={() => setTreeOpen((o) => !o)}
          >
            {treeOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span className="font-medium" style={{ color: "var(--color-subtext-0)" }}>
              Directory Tree
            </span>
          </button>
          {treeOpen && (
            <pre
              className="px-3 pb-3 font-mono text-[10px] overflow-auto"
              style={{
                maxHeight: "200px",
                color: "var(--color-subtext-0)",
              }}
            >
              {index.directoryTree}
            </pre>
          )}
        </div>
      )}

      {/* Dependencies */}
      {index.dependencies.length > 0 && (
        <div style={{ borderBottom: "1px solid var(--color-surface-1)" }}>
          <button
            className="flex items-center gap-1.5 w-full p-3 hover:bg-[var(--color-surface-0)] transition-colors"
            onClick={() => setDepsOpen((o) => !o)}
          >
            {depsOpen ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span className="font-medium" style={{ color: "var(--color-subtext-0)" }}>
              Dependencies ({index.dependencies.length})
            </span>
          </button>
          {depsOpen && (
            <div className="px-3 pb-3">
              {Object.entries(depsByEcosystem).map(([eco, deps]) => (
                <div key={eco} className="mb-2 last:mb-0">
                  <div
                    className="text-[10px] font-medium mb-1"
                    style={{ color: "var(--color-overlay-1)" }}
                  >
                    {eco.toUpperCase()}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {deps.map((d) => (
                      <span
                        key={d.name}
                        className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          backgroundColor: "var(--color-surface-1)",
                          color: "var(--color-subtext-0)",
                        }}
                        title={`${d.name}@${d.version}`}
                      >
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Index metadata */}
      <div
        className="p-2 text-center"
        style={{ color: "var(--color-overlay-1)", fontSize: "9px" }}
      >
        Indexed at{" "}
        {new Date(index.indexedAt).toLocaleString()}
      </div>
    </div>
  );
}
