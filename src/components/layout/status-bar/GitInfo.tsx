import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layout";
import { useGitStatus } from "@/hooks/useGitStatus";
import { popupMotion } from "./shared";

// ── Branch Picker Dropdown ──────────────────────────────────────────────

function BranchPickerDropdown({
  cwd,
  currentBranch,
  onClose,
}: {
  cwd: string;
  currentBranch: string;
  onClose: () => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string[]>("git_list_branches", { cwd })
      .then((result) => {
        if (!cancelled) {
          setBranches(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBranches([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [cwd]);

  useEffect(() => {
    if (!creating) {
      setTimeout(() => filterInputRef.current?.focus(), 50);
    } else {
      setTimeout(() => newBranchInputRef.current?.focus(), 50);
    }
  }, [creating]);

  const filteredBranches = filter
    ? branches.filter((b) => b.toLowerCase().includes(filter.toLowerCase()))
    : branches;

  const handleCheckout = async (branchName: string) => {
    if (branchName === currentBranch) {
      onClose();
      return;
    }
    setError(null);
    try {
      await invoke("git_checkout_branch", { cwd, name: branchName });
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setError(null);
    try {
      await invoke("git_create_branch", { cwd, name });
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <motion.div
      className="absolute bottom-7 left-0 z-50 rounded shadow-lg py-1 min-w-[200px] max-w-[280px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      {...popupMotion}
    >
      {/* Create new branch */}
      {creating ? (
        <div className="px-2 py-1.5">
          <input
            ref={newBranchInputRef}
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateBranch();
              if (e.key === "Escape") { setCreating(false); setNewBranchName(""); }
            }}
            placeholder="New branch name..."
            className="w-full bg-transparent text-xs outline-none rounded px-1.5 py-1 placeholder:text-[var(--color-overlay-0)]"
            style={{
              color: "var(--color-text)",
              border: "1px solid var(--color-surface-1)",
            }}
            spellCheck={false}
          />
        </div>
      ) : (
        <button
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-blue)" }}
          onClick={() => setCreating(true)}
        >
          + Create New Branch
        </button>
      )}

      <div
        className="my-0.5"
        style={{ borderTop: "1px solid var(--color-surface-1)" }}
      />

      {/* Filter input */}
      <div className="px-2 py-1">
        <input
          ref={filterInputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter branches..."
          className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
          style={{ color: "var(--color-text)" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
      </div>

      <div
        className="my-0.5"
        style={{ borderTop: "1px solid var(--color-surface-1)" }}
      />

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-[10px]" style={{ color: "var(--color-red)" }}>
          {error}
        </div>
      )}

      {/* Branch list */}
      <div className="max-h-[180px] overflow-y-auto">
        {loading ? (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--color-overlay-1)" }}>
            Loading branches...
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--color-overlay-1)" }}>
            No branches found
          </div>
        ) : (
          filteredBranches.map((b) => (
            <button
              key={b}
              className="flex items-center w-full px-3 py-1 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
              onClick={() => handleCheckout(b)}
            >
              <span
                style={{
                  color: b === currentBranch ? "var(--color-blue)" : "var(--color-text)",
                  fontWeight: b === currentBranch ? 600 : 400,
                }}
              >
                {b}
              </span>
              {b === currentBranch && (
                <span
                  className="ml-auto text-[10px]"
                  style={{ color: "var(--color-blue)" }}
                >
                  current
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ── GitInfo Component ──────────────────────────────────────────────────

export interface GitInfoProps {
  windowWidth: number;
}

export function GitInfo({ windowWidth }: GitInfoProps) {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const { branch, isGitRepo } = useGitStatus(projectRootPath);

  const [diffStat, setDiffStat] = useState<{ insertions: number; deletions: number } | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const branchPickerRef = useRef<HTMLDivElement>(null);

  // Git diff stat: +insertions -deletions shown next to branch
  useEffect(() => {
    if (!projectRootPath || !isGitRepo) {
      setDiffStat(null);
      return;
    }
    let cancelled = false;
    const fetchDiffStat = () => {
      invoke<{ insertions: number; deletions: number; files_changed: number }>(
        "git_diff_stat",
        { cwd: projectRootPath },
      )
        .then((stat) => {
          if (!cancelled) {
            if (stat.insertions > 0 || stat.deletions > 0) {
              setDiffStat({ insertions: stat.insertions, deletions: stat.deletions });
            } else {
              setDiffStat(null);
            }
          }
        })
        .catch(() => {
          if (!cancelled) setDiffStat(null);
        });
    };
    fetchDiffStat();
    const id = setInterval(fetchDiffStat, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectRootPath, isGitRepo]);

  // Close branch picker on outside click
  useEffect(() => {
    if (!showBranchPicker) return;
    function handleClick(e: MouseEvent) {
      if (
        branchPickerRef.current &&
        !branchPickerRef.current.contains(e.target as Node)
      ) {
        setShowBranchPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showBranchPicker]);

  if (!isGitRepo || !branch?.branch) return null;

  return (
    <>
      {/* Git branch -> click opens branch picker */}
      <div ref={branchPickerRef} className="relative shrink-0">
        <button
          className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors max-w-[140px]"
          aria-label={`Git branch: ${branch.branch}. Click to switch branch.`}
          onClick={() => setShowBranchPicker((v) => !v)}
          title="Switch Branch"
        >
          <GitBranch size={12} className="shrink-0" />
          <span className="truncate">
            {branch.is_detached ? `(${branch.branch})` : branch.branch}
          </span>
        </button>
        <AnimatePresence>
          {showBranchPicker && projectRootPath && (
            <BranchPickerDropdown
              cwd={projectRootPath}
              currentBranch={branch.branch}
              onClose={() => setShowBranchPicker(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Git diff stat: +insertions -deletions — hidden below 1200px */}
      {diffStat && windowWidth >= 1200 && (
        <span
          className="flex items-center gap-1 text-[11px] font-mono shrink-0"
          title={`${diffStat.insertions} insertions, ${diffStat.deletions} deletions`}
        >
          <span style={{ color: "var(--color-green)" }}>+{diffStat.insertions}</span>
          <span style={{ color: "var(--color-red)" }}>-{diffStat.deletions}</span>
        </span>
      )}
    </>
  );
}
