import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History, ChevronDown, Plus, Play, MessageSquare, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionInfo {
  session_id: string;
  first_message: string;
  timestamp: string;
  line_count: number;
}

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
              {loading && (
                <div
                  className="flex items-center justify-center gap-2 py-8 text-xs"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  Loading sessions…
                </div>
              )}

              {!loading && error && (
                <div
                  className="px-4 py-6 text-xs text-center"
                  style={{ color: "var(--color-red)" }}
                >
                  {error}
                </div>
              )}

              {!loading && !error && sessions.length === 0 && (
                <div
                  className="px-4 py-8 text-xs text-center"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  No past sessions found
                </div>
              )}

              {!loading && !error && sessions.length > 0 && (
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
