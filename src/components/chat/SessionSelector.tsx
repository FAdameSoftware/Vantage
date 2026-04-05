import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  History,
  ChevronDown,
  Plus,
  Play,
  MessageSquare,
  Loader2,
  Search,
  SortAsc,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionInfo {
  session_id: string;
  first_message: string;
  timestamp: string;
  line_count: number;
}

interface SessionSearchResult {
  session_id: string;
  file_path: string;
  snippet: string;
  message_count: number;
  modified_at: string;
  total_cost_usd: number;
  model: string | null;
}

type SortMode = "newest" | "messages" | "cost";

// ─── Relative time formatter ──────────────────────────────────────────────────

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}

// ─── SessionSelector ─────────────────────────────────────────────────────────

interface SessionSelectorProps {
  cwd: string;
  onNewSession: () => void;
  onResumeSession: (sessionId: string) => void;
}

export function SessionSelector({ cwd, onNewSession, onResumeSession }: SessionSelectorProps) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  // Fetch sessions when dropdown opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<SessionInfo[]>("claude_list_sessions", { cwd })
      .then((data) => {
        if (!cancelled) {
          setSessions(data ?? []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, cwd]);

  // Debounced search effect
  useEffect(() => {
    if (!open || searchQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      let cancelled = false;
      invoke<SessionSearchResult[]>("search_sessions", {
        query: searchQuery,
        cwd,
      })
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results ?? []);
            setSearching(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
            setSearching(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, open, cwd]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open]);

  // Sort search results
  const sortedSearchResults = useMemo(() => {
    const list = [...searchResults];
    switch (sortMode) {
      case "newest":
        list.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
        break;
      case "messages":
        list.sort((a, b) => b.message_count - a.message_count);
        break;
      case "cost":
        list.sort((a, b) => b.total_cost_usd - a.total_cost_usd);
        break;
    }
    return list;
  }, [searchResults, sortMode]);

  const isSearchActive = searchQuery.length >= 2;

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open]);

  const handleNewSession = useCallback(() => {
    setOpen(false);
    onNewSession();
  }, [onNewSession]);

  const handleResume = useCallback(
    (sessionId: string) => {
      setOpen(false);
      onResumeSession(sessionId);
    },
    [onResumeSession],
  );

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors"
        style={{
          color: open ? "var(--color-text)" : "var(--color-subtext-0)",
          backgroundColor: open ? "var(--color-surface-0)" : "transparent",
        }}
        aria-label="Browse sessions"
        title="Browse past sessions"
      >
        <History size={13} />
        <span className="font-medium">Sessions</span>
        <ChevronDown
          size={11}
          className="transition-transform"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            color: "var(--color-overlay-1)",
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" />

          <div
            className="absolute right-0 z-50 mt-1 w-80 rounded-xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: "var(--color-mantle)",
              border: "1px solid var(--color-surface-0)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              top: "100%",
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderBottom: "1px solid var(--color-surface-0)" }}
            >
              <Search size={13} style={{ color: "var(--color-overlay-1)", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: "var(--color-text)" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="flex items-center justify-center opacity-50 hover:opacity-100"
                >
                  <X size={12} style={{ color: "var(--color-overlay-1)" }} />
                </button>
              )}
              {isSearchActive && (
                <button
                  type="button"
                  onClick={() => {
                    const modes: SortMode[] = ["newest", "messages", "cost"];
                    const idx = modes.indexOf(sortMode);
                    setSortMode(modes[(idx + 1) % modes.length]);
                  }}
                  className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:opacity-80"
                  style={{
                    color: "var(--color-overlay-1)",
                    backgroundColor: "var(--color-surface-0)",
                  }}
                  title={`Sort: ${sortMode}`}
                >
                  <SortAsc size={11} />
                  <span className="text-[10px]">
                    {sortMode === "newest" ? "Date" : sortMode === "messages" ? "Msgs" : "Cost"}
                  </span>
                </button>
              )}
            </div>

            {/* New session button */}
            <button
              type="button"
              onClick={handleNewSession}
              className="flex items-center gap-2 w-full px-4 py-3 text-xs font-semibold text-left transition-colors hover:opacity-80"
              style={{
                color: "var(--color-blue)",
                borderBottom: "1px solid var(--color-surface-0)",
              }}
            >
              <Plus size={14} />
              New session
            </button>

            {/* Sessions list */}
            <div className="overflow-y-auto" style={{ maxHeight: "320px" }}>
              {/* Loading state */}
              {(loading || searching) && (
                <div
                  className="flex items-center justify-center gap-2 py-8 text-xs"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  {searching ? "Searching..." : "Loading sessions..."}
                </div>
              )}

              {!loading && !searching && error && (
                <div
                  className="px-4 py-6 text-xs text-center"
                  style={{ color: "var(--color-red)" }}
                >
                  {error}
                </div>
              )}

              {/* Search results */}
              {!searching && isSearchActive && sortedSearchResults.length === 0 && (
                <div
                  className="px-4 py-8 text-xs text-center"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  No results for &ldquo;{searchQuery}&rdquo;
                </div>
              )}

              {!searching && isSearchActive && sortedSearchResults.length > 0 && (
                <ul className="py-1">
                  {sortedSearchResults.map((result) => (
                    <li key={result.session_id}>
                      <button
                        type="button"
                        onClick={() => handleResume(result.session_id)}
                        className="flex items-start gap-3 w-full px-4 py-3 text-left transition-colors hover:opacity-80 group"
                        style={{
                          borderBottom: "1px solid var(--color-surface-0)",
                        }}
                      >
                        <div
                          className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: "var(--color-surface-0)" }}
                        >
                          <Play size={9} style={{ color: "var(--color-blue)" }} />
                        </div>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <span
                            className="text-xs leading-tight truncate"
                            style={{ color: "var(--color-text)" }}
                          >
                            {result.snippet || "(empty session)"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs"
                              style={{ color: "var(--color-overlay-1)" }}
                            >
                              {formatRelativeTime(result.modified_at)}
                            </span>
                            <div
                              className="flex items-center gap-1"
                              style={{ color: "var(--color-overlay-0)" }}
                            >
                              <MessageSquare size={10} />
                              <span className="text-xs">{result.message_count}</span>
                            </div>
                            {result.total_cost_usd > 0 && (
                              <span
                                className="text-[10px]"
                                style={{ color: "var(--color-overlay-0)" }}
                              >
                                ${result.total_cost_usd.toFixed(3)}
                              </span>
                            )}
                            {result.model && (
                              <span
                                className="text-[10px] px-1 rounded"
                                style={{
                                  color: "var(--color-overlay-1)",
                                  backgroundColor: "var(--color-surface-0)",
                                }}
                              >
                                {result.model}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Normal session list (when not searching) */}
              {!loading && !isSearchActive && !error && sessions.length === 0 && (
                <div
                  className="px-4 py-8 text-xs text-center"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  No past sessions found
                </div>
              )}

              {!loading && !isSearchActive && !error && sessions.length > 0 && (
                <ul className="py-1">
                  {sessions.map((session) => (
                    <li key={session.session_id}>
                      <button
                        type="button"
                        onClick={() => handleResume(session.session_id)}
                        className="flex items-start gap-3 w-full px-4 py-3 text-left transition-colors hover:opacity-80 group"
                        style={{
                          borderBottom: "1px solid var(--color-surface-0)",
                        }}
                      >
                        {/* Play icon */}
                        <div
                          className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: "var(--color-surface-0)" }}
                        >
                          <Play size={9} style={{ color: "var(--color-blue)" }} />
                        </div>

                        {/* Content */}
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          {/* First message preview */}
                          <span
                            className="text-xs leading-tight truncate"
                            style={{ color: "var(--color-text)" }}
                          >
                            {session.first_message || "(empty session)"}
                          </span>

                          {/* Meta row: time + turn count */}
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs"
                              style={{ color: "var(--color-overlay-1)" }}
                            >
                              {formatRelativeTime(session.timestamp)}
                            </span>
                            <div
                              className="flex items-center gap-1"
                              style={{ color: "var(--color-overlay-0)" }}
                            >
                              <MessageSquare size={10} />
                              <span className="text-xs">{session.line_count}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
