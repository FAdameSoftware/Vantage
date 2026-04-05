import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  FileCode,
  ChevronRight,
  ChevronDown,
  CaseSensitive,
  Regex,
  Filter,
  Loader2,
  Replace,
  ReplaceAll,
  ArrowDownUp,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";

// ── Types matching the Rust SearchResult struct ────────────────────

interface SearchMatch {
  file_path: string;
  line_number: number;
  line_text: string;
  column_start: number;
  match_length: number;
}

interface SearchFileResult {
  file_path: string;
  matches: SearchMatch[];
}

interface SearchResult {
  files: SearchFileResult[];
  total_matches: number;
  truncated: boolean;
}

// ── Utility functions ──────────────────────────────────────────────

function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function getRelativeDir(filePath: string, rootPath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const normalizedRoot = rootPath.replace(/\\/g, "/");
  let relative = normalized.startsWith(normalizedRoot)
    ? normalized.slice(normalizedRoot.length)
    : normalized;
  if (relative.startsWith("/")) {
    relative = relative.slice(1);
  }
  // Remove the filename from the path
  const lastSlash = relative.lastIndexOf("/");
  return lastSlash >= 0 ? relative.slice(0, lastSlash) : "";
}

// ── HighlightedLine component ──────────────────────────────────────

function HighlightedLine({
  text,
  start,
  length,
  replaceText,
}: {
  text: string;
  start: number;
  length: number;
  replaceText?: string;
}) {
  const before = text.slice(0, start);
  const match = text.slice(start, start + length);
  const after = text.slice(start + length);

  return (
    <span className="whitespace-pre" style={{ tabSize: 2 }}>
      {before}
      <mark
        style={{
          backgroundColor: "rgba(var(--color-yellow-rgb, 249, 226, 175), 0.3)",
          color: "var(--color-yellow)",
          borderRadius: "2px",
          padding: "0 1px",
          textDecoration:
            replaceText !== undefined ? "line-through" : undefined,
        }}
      >
        {match}
      </mark>
      {replaceText !== undefined && (
        <mark
          style={{
            backgroundColor: "rgba(var(--color-green-rgb, 166, 218, 149), 0.3)",
            color: "var(--color-green)",
            borderRadius: "2px",
            padding: "0 1px",
          }}
        >
          {replaceText}
        </mark>
      )}
      {after}
    </span>
  );
}

// ── SearchPanel component ──────────────────────────────────────────

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [globFilter, setGlobFilter] = useState("");
  const [showGlobFilter, setShowGlobFilter] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projectRootPath = useLayoutStore((s) => s.projectRootPath);

  const executeSearch = useCallback(
    async (searchQuery: string) => {
      if (!projectRootPath || searchQuery.length < 2) {
        setResults(null);
        return;
      }

      setLoading(true);
      try {
        const result = await invoke<SearchResult>("search_project", {
          root: projectRootPath,
          query: searchQuery,
          isRegex,
          caseSensitive,
          globFilter: globFilter || null,
          maxResults: 1000,
        });

        setResults(result);

        // Auto-expand the first 5 file groups
        const firstFive = new Set(
          result.files.slice(0, 5).map((f) => f.file_path)
        );
        setExpandedFiles(firstFive);
      } catch (e) {
        console.error("Search failed:", e);
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [projectRootPath, isRegex, caseSensitive, globFilter]
  );

  // Debounced search on query/options change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      executeSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, executeSearch]);

  const toggleFileExpanded = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleMatchClick = useCallback(
    async (filePath: string, lineNumber: number) => {
      try {
        const result = await invoke<{
          path: string;
          content: string;
          language: string;
        }>("read_file", { path: filePath });

        const name = getFileName(filePath);
        useEditorStore
          .getState()
          .openFile(result.path, name, result.language, result.content, false);

        // After a brief delay to let Monaco mount, scroll to the line
        setTimeout(() => {
          try {
            const editors = (
              window as unknown as {
                monaco?: {
                  editor: {
                    getEditors: () => Array<{
                      revealLineInCenter: (line: number) => void;
                      setPosition: (pos: {
                        lineNumber: number;
                        column: number;
                      }) => void;
                    }>;
                  };
                };
              }
            ).monaco?.editor.getEditors();
            if (editors && editors.length > 0) {
              const editor = editors[editors.length - 1];
              editor.revealLineInCenter(lineNumber);
              editor.setPosition({ lineNumber, column: 1 });
            }
          } catch {
            // Monaco not available yet, ignore
          }
        }, 100);
      } catch (e) {
        console.error("Failed to open file:", e);
      }
    },
    []
  );

  const handleReplaceAll = useCallback(async () => {
    if (!projectRootPath || query.length < 2) return;
    setReplacing(true);
    try {
      const result = await invoke<{ replacements: number; files_modified: number }>(
        "replace_in_files",
        {
          root: projectRootPath,
          search: query,
          replace: replaceText,
          isRegex,
          caseSensitive,
          globFilter: globFilter || null,
        }
      );
      // Re-run the search to update results after replacement
      await executeSearch(query);
      // Show a brief status message via console (toast would be ideal but keeping it simple)
      console.info(
        `Replaced ${result.replacements} occurrence(s) in ${result.files_modified} file(s)`
      );
    } catch (e) {
      console.error("Replace all failed:", e);
    } finally {
      setReplacing(false);
      setReplaceConfirm(false);
    }
  }, [projectRootPath, query, replaceText, isRegex, caseSensitive, globFilter, executeSearch]);

  const totalFiles = results?.files.length ?? 0;
  const totalMatches = results?.total_matches ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search input area */}
      <div
        className="flex flex-col gap-1.5 p-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        {/* Main search row */}
        <div className="flex items-center gap-1">
          {/* Search/Replace mode toggle */}
          <ToggleButton
            active={showReplace}
            onClick={() => setShowReplace((v) => !v)}
            title="Toggle Search & Replace"
          >
            <ArrowDownUp size={14} />
          </ToggleButton>

          <div
            className="flex items-center flex-1 gap-1 px-2 h-7 rounded"
            style={{
              backgroundColor: "var(--color-base)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <Search
              size={13}
              style={{ color: "var(--color-overlay-1)", flexShrink: 0 }}
            />
            <input
              ref={inputRef}
              data-search-input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--color-text)" }}
              spellCheck={false}
            />
            {loading && (
              <Loader2
                size={13}
                className="animate-spin"
                style={{ color: "var(--color-overlay-1)", flexShrink: 0 }}
              />
            )}
          </div>

          {/* Toggle buttons */}
          <ToggleButton
            active={caseSensitive}
            onClick={() => setCaseSensitive((v) => !v)}
            title="Match Case"
          >
            <CaseSensitive size={14} />
          </ToggleButton>
          <ToggleButton
            active={isRegex}
            onClick={() => setIsRegex((v) => !v)}
            title="Use Regular Expression"
          >
            <Regex size={14} />
          </ToggleButton>
          <ToggleButton
            active={showGlobFilter}
            onClick={() => setShowGlobFilter((v) => !v)}
            title="Toggle File Filter"
          >
            <Filter size={14} />
          </ToggleButton>
        </div>

        {/* Replace input row (conditionally shown) */}
        {showReplace && (
          <div className="flex items-center gap-1">
            {/* Spacer to align with search input (same width as the toggle button) */}
            <div className="w-6 shrink-0" />

            <div
              className="flex items-center flex-1 gap-1 px-2 h-7 rounded"
              style={{
                backgroundColor: "var(--color-base)",
                border: "1px solid var(--color-surface-1)",
              }}
            >
              <Replace
                size={13}
                style={{ color: "var(--color-overlay-1)", flexShrink: 0 }}
              />
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace"
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: "var(--color-text)" }}
                spellCheck={false}
              />
            </div>

            {/* Replace All button */}
            {!replaceConfirm ? (
              <button
                type="button"
                onClick={() => setReplaceConfirm(true)}
                disabled={
                  !query || query.length < 2 || !projectRootPath || replacing
                }
                title="Replace All"
                className="flex items-center justify-center w-6 h-6 rounded shrink-0 transition-colors disabled:opacity-30"
                style={{
                  color: "var(--color-overlay-1)",
                  backgroundColor: "transparent",
                }}
              >
                <ReplaceAll size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReplaceAll}
                disabled={replacing}
                title="Confirm Replace All"
                className="flex items-center justify-center h-6 px-1.5 rounded shrink-0 text-[10px] font-medium transition-colors"
                style={{
                  color: "var(--color-base)",
                  backgroundColor: replacing
                    ? "var(--color-overlay-0)"
                    : "var(--color-red)",
                }}
              >
                {replacing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  "OK"
                )}
              </button>
            )}
          </div>
        )}

        {/* Glob filter row (conditionally shown) */}
        {showGlobFilter && (
          <div
            className="flex items-center gap-1 px-2 h-7 rounded"
            style={{
              backgroundColor: "var(--color-base)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <input
              type="text"
              value={globFilter}
              onChange={(e) => setGlobFilter(e.target.value)}
              placeholder="e.g., *.ts, *.{tsx,jsx}"
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--color-text)" }}
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {/* Summary line */}
        {results !== null && query.length >= 2 && (
          <div
            className="px-3 py-1.5 text-xs"
            style={{ color: "var(--color-subtext-0)" }}
          >
            {totalMatches === 0
              ? "No results"
              : `${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${totalFiles} file${totalFiles !== 1 ? "s" : ""}`}
            {results.truncated && " (results truncated)"}
          </div>
        )}

        {/* File groups */}
        <div role="list" aria-label="Search results">
          {results?.files.map((fileResult) => (
            <FileResultGroup
              key={fileResult.file_path}
              fileResult={fileResult}
              isExpanded={expandedFiles.has(fileResult.file_path)}
              onToggle={() => toggleFileExpanded(fileResult.file_path)}
              onMatchClick={handleMatchClick}
              rootPath={projectRootPath ?? ""}
              replaceText={showReplace && replaceText !== "" ? replaceText : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ToggleButton ───────────────────────────────────────────────────

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-6 h-6 rounded shrink-0 transition-colors"
      style={{
        color: active ? "var(--color-blue)" : "var(--color-overlay-1)",
        backgroundColor: active
          ? "var(--color-surface-0)"
          : "transparent",
      }}
    >
      {children}
    </button>
  );
}

// ── FileResultGroup ────────────────────────────────────────────────

function FileResultGroup({
  fileResult,
  isExpanded,
  onToggle,
  onMatchClick,
  rootPath,
  replaceText,
}: {
  fileResult: SearchFileResult;
  isExpanded: boolean;
  onToggle: () => void;
  onMatchClick: (filePath: string, lineNumber: number) => void;
  rootPath: string;
  replaceText?: string;
}) {
  const fileName = getFileName(fileResult.file_path);
  const relDir = getRelativeDir(fileResult.file_path, rootPath);
  const matchCount = fileResult.matches.length;

  return (
    <div role="listitem">
      {/* File header */}
      <div
        className="flex items-center gap-1 px-2 h-[22px] cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
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
        <FileCode
          size={14}
          style={{ color: "var(--color-blue)", flexShrink: 0 }}
        />
        <span
          className="text-xs font-medium truncate"
          style={{ color: "var(--color-text)" }}
        >
          {fileName}
        </span>
        {relDir && (
          <span
            className="text-xs truncate"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {relDir}
          </span>
        )}
        <span className="ml-auto shrink-0">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--color-surface-1)",
              color: "var(--color-subtext-0)",
            }}
          >
            {matchCount}
          </span>
        </span>
      </div>

      {/* Match rows */}
      {isExpanded &&
        fileResult.matches.map((match, i) => (
          <div
            key={`${match.line_number}-${match.column_start}-${i}`}
            className="flex items-center gap-2 pl-8 pr-2 h-[20px] cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors select-none"
            onClick={() => onMatchClick(match.file_path, match.line_number)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMatchClick(match.file_path, match.line_number);
              }
            }}
          >
            <span
              className="text-[10px] w-8 text-right shrink-0 tabular-nums"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {match.line_number}
            </span>
            <span
              className="text-xs truncate"
              style={{ color: "var(--color-subtext-1)" }}
            >
              <HighlightedLine
                text={match.line_text}
                start={match.column_start}
                length={match.match_length}
                replaceText={replaceText}
              />
            </span>
          </div>
        ))}
    </div>
  );
}
