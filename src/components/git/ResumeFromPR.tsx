import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitPullRequest, ChevronDown, Loader2, Play } from "lucide-react";
import { useClaude } from "@/hooks/useClaude";
import { useLayoutStore } from "@/stores/layout";

interface PrInfo {
  number: number;
  title: string;
  state: string;
}

/**
 * Button/dropdown that lists open GitHub PRs and starts a Claude Code
 * session with `--from-pr <number>` for the selected PR.
 */
export function ResumeFromPR() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<number | null>(null);
  const [prs, setPrs] = useState<PrInfo[]>([]);
  const [manualPr, setManualPr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const { startSession } = useClaude();

  // Fetch PR list when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    invoke<PrInfo[]>("get_pr_list", {
      cwd: projectRootPath ?? ".",
      limit: 10,
    })
      .then((list) => setPrs(list))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [open, projectRootPath]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleResume = useCallback(
    async (prNumber: number) => {
      if (!projectRootPath) return;
      setStarting(prNumber);
      setOpen(false);
      try {
        await startSession(projectRootPath, undefined, prNumber);
      } finally {
        setStarting(null);
      }
    },
    [projectRootPath, startSession],
  );

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const num = parseInt(manualPr, 10);
      if (!isNaN(num) && num > 0) {
        setManualPr("");
        void handleResume(num);
      }
    },
    [manualPr, handleResume],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-[var(--color-surface-1)]"
        style={{ color: "var(--color-subtext-0)" }}
        aria-label="Resume from PR"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        disabled={starting !== null}
      >
        {starting !== null ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <GitPullRequest size={12} />
        )}
        <span>From PR</span>
        <ChevronDown
          size={10}
          className={open ? "rotate-180" : ""}
          style={{ transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded shadow-lg py-1 w-72"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          {/* Manual PR number entry */}
          <form
            onSubmit={handleManualSubmit}
            className="flex items-center gap-1 px-2 pb-1 mb-1"
            style={{ borderBottom: "1px solid var(--color-surface-1)" }}
          >
            <input
              type="number"
              min={1}
              placeholder="Enter PR number…"
              value={manualPr}
              onChange={(e) => setManualPr(e.target.value)}
              className="flex-1 bg-transparent text-xs px-1 py-1 outline-none"
              style={{ color: "var(--color-text)" }}
              aria-label="PR number"
            />
            <button
              type="submit"
              disabled={!manualPr || isNaN(parseInt(manualPr, 10))}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-40"
              style={{
                backgroundColor: "var(--color-blue)",
                color: "var(--color-base)",
              }}
            >
              <Play size={10} />
              Start
            </button>
          </form>

          {/* PR list */}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: "var(--color-overlay-1)" }}>
              <Loader2 size={11} className="animate-spin" />
              Loading PRs…
            </div>
          )}

          {error && (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--color-red)" }}>
              {error}
            </p>
          )}

          {!loading && !error && prs.length === 0 && (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--color-overlay-1)" }}>
              No open PRs found. Enter a number above.
            </p>
          )}

          {!loading &&
            prs.map((pr) => (
              <button
                key={pr.number}
                type="button"
                className="flex items-start gap-2 w-full px-3 py-1.5 text-left transition-colors hover:bg-[var(--color-surface-1)]"
                onClick={() => void handleResume(pr.number)}
              >
                <span
                  className="text-xs font-mono shrink-0 mt-px"
                  style={{ color: "var(--color-blue)" }}
                >
                  #{pr.number}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--color-text)" }}
                  title={pr.title}
                >
                  {pr.title}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
