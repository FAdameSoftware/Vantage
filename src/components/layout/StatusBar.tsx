import { useState, useEffect, useRef, useCallback } from "react";
import {
  GitBranch,
  AlertTriangle,
  XCircle,
  Zap,
  Coins,
  Clock,
  Hash,
  Database,
  Loader2,
  Bell,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore, selectActiveTab, selectCursorPosition, selectSelectionLineCount } from "@/stores/editor";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useSettingsStore } from "@/stores/settings";
import { useUsageStore } from "@/stores/usage";
import { useNotificationStore } from "@/stores/notifications";
import { useGitStatus } from "@/hooks/useGitStatus";
import { UsagePanel } from "@/components/shared/UsagePanel";
import { BuddyWidget } from "@/components/shared/BuddyWidget";
import { EffortLevelSelector } from "@/components/shared/EffortLevelSelector";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import * as monaco from "monaco-editor";

/** Track window width for responsive status bar priority tiers */
function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

export function StatusBar() {
  const windowWidth = useWindowWidth();
  const cursorPosition = useEditorStore(selectCursorPosition);
  const selectionLineCount = useEditorStore(selectSelectionLineCount);
  const vimModeLabel = useEditorStore((s) => s.vimModeLabel);
  const activeTab = useEditorStore(selectActiveTab);

  const isStreaming = useConversationStore((s) => s.isStreaming);
  const session = useConversationStore((s) => s.session);
  const totalCost = useConversationStore((s) => s.totalCost);

  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const toggleSecondarySidebar = useLayoutStore((s) => s.toggleSecondarySidebar);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const showBuddy = useSettingsStore((s) => s.showBuddy);
  const toggleBuddy = useSettingsStore((s) => s.toggleBuddy);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const insertSpaces = useSettingsStore((s) => s.insertSpaces);
  const setTabSize = useSettingsStore((s) => s.setTabSize);
  const setInsertSpaces = useSettingsStore((s) => s.setInsertSpaces);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);
  const { branch, isGitRepo } = useGitStatus(projectRootPath);

  // Git diff stat: +insertions -deletions shown next to branch
  const [diffStat, setDiffStat] = useState<{ insertions: number; deletions: number } | null>(null);
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

  const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
  const usageTotalCost = useUsageStore((s) => s.totalCostUsd);
  const usageInputTokens = useUsageStore((s) => s.inputTokens);
  const usageOutputTokens = useUsageStore((s) => s.outputTokens);
  const allTimeCost = useUsageStore((s) => s.allTimeCost);
  const projectUsageLoaded = useUsageStore((s) => s.projectUsageLoaded);
  const lastSessionModel = useUsageStore((s) => s.lastSessionModel);

  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const openPalette = useCommandPaletteStore((s) => s.open);

  const [elapsed, setElapsed] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showTabSizeSelector, setShowTabSizeSelector] = useState(false);
  // EOL: "LF" | "CRLF" — read from active Monaco model, default LF
  const [eol, setEol] = useState<"LF" | "CRLF">("LF");
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const languageSelectorRef = useRef<HTMLDivElement>(null);
  const branchPickerRef = useRef<HTMLDivElement>(null);
  const tabSizeSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionStartedAt) {
      setElapsed("");
      return;
    }
    const update = () => {
      const ms = Date.now() - sessionStartedAt;
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setElapsed(`${h}h ${m % 60}m`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else setElapsed(`${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  useEffect(() => {
    if (!projectRootPath) return;
    invoke<unknown>("get_project_index", { rootPath: projectRootPath })
      .then((idx) => setIsIndexed(idx !== null))
      .catch(() => setIsIndexed(false));
  }, [projectRootPath]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showModelSelector && !showLanguageSelector && !showBranchPicker && !showTabSizeSelector) return;
    function handleClick(e: MouseEvent) {
      if (
        showModelSelector &&
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(e.target as Node)
      ) {
        setShowModelSelector(false);
      }
      if (
        showLanguageSelector &&
        languageSelectorRef.current &&
        !languageSelectorRef.current.contains(e.target as Node)
      ) {
        setShowLanguageSelector(false);
      }
      if (
        showBranchPicker &&
        branchPickerRef.current &&
        !branchPickerRef.current.contains(e.target as Node)
      ) {
        setShowBranchPicker(false);
      }
      if (
        showTabSizeSelector &&
        tabSizeSelectorRef.current &&
        !tabSizeSelectorRef.current.contains(e.target as Node)
      ) {
        setShowTabSizeSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelSelector, showLanguageSelector, showBranchPicker, showTabSizeSelector]);

  // Read EOL from the active Monaco editor model whenever the active tab changes
  useEffect(() => {
    const editors = monaco.editor.getEditors();
    if (editors.length === 0) return;
    const model = editors[0].getModel();
    if (!model) return;
    // Monaco EndOfLineSequence: 0 = LF, 1 = CRLF
    const eolSeq = model.getEndOfLineSequence();
    setEol(eolSeq === 1 ? "CRLF" : "LF");
  }, [activeTab]);

  // Map language IDs to display names
  const languageDisplayName = activeTab
    ? getLanguageDisplayName(activeTab.language)
    : "Plain Text";

  const connectionStatus = isStreaming
    ? "Streaming"
    : session
      ? "Connected"
      : projectUsageLoaded && allTimeCost > 0
        ? "History"
        : "Ready";
  const statusColor = isStreaming
    ? "var(--color-peach)"
    : session
      ? "var(--color-green)"
      : projectUsageLoaded && allTimeCost > 0
        ? "var(--color-blue)"
        : "var(--color-overlay-1)";

  // Click handlers
  const handleGitBranchClick = () => {
    setShowBranchPicker((v) => !v);
  };

  const handleErrorsClick = () => {
    setActiveActivityBarItem("search");
  };

  const handleLineColClick = () => {
    openPalette("goto");
  };

  const handleLanguageClick = () => {
    // Try to invoke Monaco's built-in change language mode action
    const editors = monaco.editor.getEditors();
    if (editors.length > 0) {
      const action = editors[0].getAction("editor.action.changeLanguageMode");
      if (action) {
        action.run();
        return;
      }
    }
    // Fallback: toggle dropdown
    setShowLanguageSelector((v) => !v);
  };

  const handleClaudeStatusClick = () => {
    toggleSecondarySidebar();
  };

  const handleModelClick = () => {
    setShowModelSelector((v) => !v);
  };

  const handleBuddyClick = () => {
    toggleBuddy();
  };

  const handleNotificationBellClick = () => {
    window.dispatchEvent(new CustomEvent("vantage:toggle-notification-center"));
  };

  const handleTabSizeClick = () => {
    setShowTabSizeSelector((v) => !v);
  };

  const handleEolClick = useCallback(() => {
    // Toggle between LF and CRLF in the active Monaco editor model
    const editors = monaco.editor.getEditors();
    if (editors.length === 0) return;
    const model = editors[0].getModel();
    if (!model) return;
    const newEol = eol === "LF" ? "CRLF" : "LF";
    // Monaco EndOfLineSequence: 0 = LF, 1 = CRLF
    model.setEOL(newEol === "CRLF" ? 1 : 0);
    setEol(newEol);
  }, [eol]);

  return (
    <div className="relative">
      {showUsage && (
        <div className="absolute bottom-7 right-2 z-50">
          <UsagePanel />
        </div>
      )}
      <div
        className="flex items-center justify-between h-6 px-2 text-xs shrink-0 select-none"
        style={{
          backgroundColor: "var(--color-crust)",
          color: "var(--color-subtext-0)",
          borderTop: "1px solid var(--color-surface-0)",
        }}
        role="status"
        aria-label="Status Bar"
      >
        {/* Left side - workspace scoped */}
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {/* Git branch -> click opens branch picker */}
          {isGitRepo && branch?.branch && (
            <div ref={branchPickerRef} className="relative shrink-0">
              <button
                className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors max-w-[140px]"
                aria-label={`Git branch: ${branch.branch}. Click to switch branch.`}
                onClick={handleGitBranchClick}
                title="Switch Branch"
              >
                <GitBranch size={12} className="shrink-0" />
                <span className="truncate">
                  {branch.is_detached ? `(${branch.branch})` : branch.branch}
                </span>
              </button>
              {showBranchPicker && projectRootPath && (
                <BranchPickerDropdown
                  cwd={projectRootPath}
                  currentBranch={branch.branch}
                  onClose={() => setShowBranchPicker(false)}
                />
              )}
            </div>
          )}

          {/* Git diff stat: +insertions -deletions — hidden below 1200px */}
          {isGitRepo && diffStat && windowWidth >= 1200 && (
            <span
              className="flex items-center gap-1 text-[11px] font-mono shrink-0"
              title={`${diffStat.insertions} insertions, ${diffStat.deletions} deletions`}
            >
              <span style={{ color: "var(--color-green)" }}>+{diffStat.insertions}</span>
              <span style={{ color: "var(--color-red)" }}>-{diffStat.deletions}</span>
            </span>
          )}

          {/* Errors and warnings -> click focuses search panel */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
              aria-label="0 errors. Click to open problems."
              onClick={handleErrorsClick}
              title="Open Problems"
            >
              <XCircle size={12} style={{ color: "var(--color-red)" }} />
              <span>0</span>
            </button>
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
              aria-label="0 warnings. Click to open problems."
              onClick={handleErrorsClick}
              title="Open Problems"
            >
              <AlertTriangle size={12} style={{ color: "var(--color-yellow)" }} />
              <span>0</span>
            </button>
          </div>

          {/* Coding buddy — Inkwell — hidden below 1200px */}
          {windowWidth >= 1200 && (
            <button
              onClick={handleBuddyClick}
              className="hover:opacity-80 transition-opacity shrink-0"
              title={showBuddy ? "Hide Inkwell" : "Show Inkwell"}
            >
              <BuddyWidget visible={showBuddy} />
            </button>
          )}

          {/* Notification bell — hidden below 1200px */}
          {windowWidth >= 1200 && (
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors relative shrink-0"
              aria-label={`Notifications${unreadCount > 0 ? `: ${unreadCount} unread` : ""}`}
              onClick={handleNotificationBellClick}
              title="Notification Center"
            >
              <Bell size={12} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold leading-none px-0.5"
                  style={{
                    backgroundColor: "var(--color-blue)",
                    color: "var(--color-base)",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Index status — hidden below 1200px */}
          {windowWidth >= 1200 && (
            <div
              className="flex items-center gap-0.5 shrink-0"
              title={isIndexed ? "Project indexed" : "Project not indexed"}
            >
              <Database
                size={11}
                style={{
                  color: isIndexed
                    ? "var(--color-green)"
                    : "var(--color-overlay-0)",
                }}
              />
            </div>
          )}
        </div>

        {/* Right side - file/session scoped */}
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {/* Vim mode indicator */}
          {vimMode && (
            <span
              className="font-mono font-semibold px-1 rounded text-[10px] shrink-0"
              style={{
                backgroundColor: vimModeLabelColor(vimModeLabel),
                color: "var(--color-base)",
              }}
              aria-label={`Vim mode: ${vimModeLabel}`}
            >
              {vimModeLabel}
            </span>
          )}

          {/* Line and column -> click opens go-to-line dialog */}
          <button
            className="hover:text-[var(--color-text)] transition-colors whitespace-nowrap shrink-0"
            onClick={handleLineColClick}
            title="Go to Line (Ctrl+G)"
          >
            Ln {cursorPosition.line}, Col {cursorPosition.column}
            {selectionLineCount > 1 && (
              <span
                className="ml-1"
                aria-label={`${selectionLineCount} lines selected`}
                title={`${selectionLineCount} lines selected`}
              >
                ({selectionLineCount} lines selected)
              </span>
            )}
          </button>

          {/* EOL (line ending) — hidden below 800px */}
          {activeTab && windowWidth >= 800 && (
            <button
              className="hover:text-[var(--color-text)] transition-colors shrink-0"
              onClick={handleEolClick}
              title={`Line Ending: ${eol}. Click to toggle.`}
              aria-label={`Line ending: ${eol}. Click to toggle between LF and CRLF.`}
            >
              {eol}
            </button>
          )}

          {/* Encoding — hidden below 800px */}
          {activeTab && windowWidth >= 800 && (
            <span
              className="cursor-default shrink-0"
              title="File encoding: UTF-8"
              aria-label="Encoding: UTF-8"
            >
              UTF-8
            </span>
          )}

          {/* Tab size — hidden below 800px */}
          {activeTab && windowWidth >= 800 && (
            <div ref={tabSizeSelectorRef} className="relative shrink-0">
              <button
                className="hover:text-[var(--color-text)] transition-colors"
                onClick={handleTabSizeClick}
                title="Indentation settings. Click to change."
                aria-label={`Indentation: ${insertSpaces ? "Spaces" : "Tab"}: ${tabSize}. Click to change.`}
              >
                {insertSpaces ? "Spaces" : "Tab"}: {tabSize}
              </button>
              {showTabSizeSelector && (
                <TabSizeSelectorDropdown
                  tabSize={tabSize}
                  insertSpaces={insertSpaces}
                  onTabSizeChange={(size) => { setTabSize(size); setShowTabSizeSelector(false); }}
                  onInsertSpacesChange={(v) => { setInsertSpaces(v); setShowTabSizeSelector(false); }}
                  onClose={() => setShowTabSizeSelector(false)}
                />
              )}
            </div>
          )}

          {/* Auto-save indicator -> click cycles through modes */}
          {autoSave !== "off" && (
            <button
              className="hover:text-[var(--color-text)] transition-colors shrink-0"
              style={{ color: "var(--color-green)" }}
              onClick={() =>
                setAutoSave(
                  autoSave === "afterDelay" ? "onFocusChange" : "off",
                )
              }
              title={`Auto Save: ${autoSave === "afterDelay" ? "After Delay" : "On Focus Change"}. Click to cycle.`}
              aria-label={`Auto save mode: ${autoSave}. Click to cycle.`}
            >
              Auto
            </button>
          )}

          {/* Word Wrap toggle — hidden below 800px */}
          {windowWidth >= 800 && (
            <button
              className="hover:text-[var(--color-text)] transition-colors shrink-0"
              style={{
                color: wordWrap ? "var(--color-blue)" : undefined,
              }}
              onClick={() => setWordWrap(!wordWrap)}
              title={wordWrap ? "Disable Word Wrap" : "Enable Word Wrap"}
              aria-label={wordWrap ? "Word wrap on. Click to disable." : "Word wrap off. Click to enable."}
              aria-pressed={wordWrap}
            >
              {wordWrap ? "Wrap: On" : "Wrap: Off"}
            </button>
          )}

          {/* Language -> click opens language selector */}
          <div ref={languageSelectorRef} className="relative shrink-0">
            <button
              className="hover:text-[var(--color-text)] transition-colors truncate max-w-[120px]"
              onClick={handleLanguageClick}
              title="Select Language Mode"
            >
              {languageDisplayName}
            </button>
            {showLanguageSelector && (
              <LanguageSelectorDropdown
                currentLanguage={activeTab?.language ?? "plaintext"}
                onClose={() => setShowLanguageSelector(false)}
              />
            )}
          </div>

          {/* Claude session status -> click opens chat panel */}
          <button
            className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors shrink-0"
            onClick={handleClaudeStatusClick}
            title="Toggle Chat Panel"
          >
            {isStreaming ? (
              <Loader2 size={12} className="animate-spin" style={{ color: statusColor }} />
            ) : (
              <Zap size={12} style={{ color: statusColor }} />
            )}
            <span>{connectionStatus}</span>
          </button>

          {/* Usage: session timer, tokens, cost — hidden below 1000px */}
          {windowWidth >= 1000 && (
            <button
              className="flex items-center gap-3 hover:text-[var(--color-text)] transition-colors shrink-0"
              onClick={() => setShowUsage((s) => !s)}
              title="Toggle Usage Panel"
            >
              {/* Session timer */}
              {elapsed && (
                <div className="flex items-center gap-1" title="Session duration">
                  <Clock size={11} />
                  <span>{elapsed}</span>
                </div>
              )}

              {/* Token count */}
              {(usageInputTokens > 0 || usageOutputTokens > 0) && (
                <div
                  className="flex items-center gap-1"
                  title={`Input: ${usageInputTokens.toLocaleString()} | Output: ${usageOutputTokens.toLocaleString()}`}
                >
                  <Hash size={11} />
                  <span>
                    {((usageInputTokens + usageOutputTokens) / 1000).toFixed(1)}k
                  </span>
                </div>
              )}

              {/* Cost: session cost | all-time cost */}
              <div className="flex items-center gap-1" title={allTimeCost > 0 ? `Session: $${(usageTotalCost || totalCost).toFixed(4)} | Project total: $${allTimeCost.toFixed(4)}` : "Session cost"}>
                <Coins size={11} />
                <span>${(usageTotalCost || totalCost).toFixed(4)}</span>
                {allTimeCost > 0 && allTimeCost !== usageTotalCost && (
                  <span style={{ color: "var(--color-overlay-1)", fontSize: "10px" }}>
                    / ${allTimeCost.toFixed(2)}
                  </span>
                )}
              </div>
            </button>
          )}

          {/* Effort level — hidden below 800px */}
          {windowWidth >= 800 && <EffortLevelSelector />}

          {/* Model -> click opens model selector dropdown */}
          <div ref={modelSelectorRef} className="relative shrink-0">
            <button
              className="hover:text-[var(--color-text)] transition-colors truncate max-w-[180px]"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={handleModelClick}
              title="Select Model"
            >
              {session?.model ?? "claude-opus-4-6"}
            </button>
            {showModelSelector && (
              <ModelSelectorDropdown
                currentModel={session?.model ?? "claude-opus-4-6"}
                onClose={() => setShowModelSelector(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div
      className="absolute bottom-7 left-0 z-50 rounded shadow-lg py-1 min-w-[200px] max-w-[280px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
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
    </div>
  );
}

// ── Model Selector Dropdown ──────────────────────────────────────────────

const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Most capable" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Fast & smart" },
  { id: "claude-haiku-3-5", label: "Claude Haiku 3.5", description: "Fastest" },
];

function ModelSelectorDropdown({
  currentModel,
  onClose,
}: {
  currentModel: string;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute bottom-7 right-0 z-50 rounded shadow-lg py-1 min-w-[180px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="listbox"
      aria-label="Model selector"
    >
      {AVAILABLE_MODELS.map((model) => (
        <button
          key={model.id}
          type="button"
          role="option"
          aria-selected={currentModel === model.id}
          className="flex flex-col w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
          onClick={() => {
            // Model selection is informational — the actual model is set by the CLI session
            onClose();
          }}
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                color:
                  currentModel === model.id
                    ? "var(--color-blue)"
                    : "var(--color-text)",
              }}
              className="font-medium"
            >
              {model.label}
            </span>
            {currentModel === model.id && (
              <span
                className="ml-auto text-[10px]"
                style={{ color: "var(--color-blue)" }}
              >
                Active
              </span>
            )}
          </div>
          <span
            className="text-[10px] mt-0.5"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {model.description}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Language Selector Dropdown ────────────────────────────────────────────

const COMMON_LANGUAGES = [
  "typescript", "javascript", "rust", "python", "json", "toml", "yaml",
  "markdown", "html", "css", "shell", "go", "java", "c", "cpp",
  "sql", "graphql", "plaintext",
];

function LanguageSelectorDropdown({
  currentLanguage,
  onClose,
}: {
  currentLanguage: string;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute bottom-7 right-0 z-50 rounded shadow-lg py-1 min-w-[160px] max-h-[240px] overflow-auto"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="listbox"
      aria-label="Language selector"
    >
      {COMMON_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          role="option"
          aria-selected={currentLanguage === lang}
          className="flex items-center w-full px-3 py-1 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
          onClick={() => {
            // Set the language on the active Monaco editor model
            const editors = monaco.editor.getEditors();
            if (editors.length > 0) {
              const model = editors[0].getModel();
              if (model) {
                monaco.editor.setModelLanguage(model, lang);
              }
            }
            onClose();
          }}
        >
          <span
            style={{
              color:
                currentLanguage === lang
                  ? "var(--color-blue)"
                  : "var(--color-text)",
            }}
          >
            {getLanguageDisplayName(lang)}
          </span>
          {currentLanguage === lang && (
            <span
              className="ml-auto text-[10px]"
              style={{ color: "var(--color-blue)" }}
            >
              Active
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Tab Size Selector Dropdown ────────────────────────────────────────────

function TabSizeSelectorDropdown({
  tabSize,
  insertSpaces,
  onTabSizeChange,
  onInsertSpacesChange,
  onClose,
}: {
  tabSize: number;
  insertSpaces: boolean;
  onTabSizeChange: (size: number) => void;
  onInsertSpacesChange: (v: boolean) => void;
  onClose: () => void;
}) {
  const TAB_SIZES = [1, 2, 3, 4, 6, 8];

  return (
    <div
      className="absolute bottom-7 right-0 z-50 rounded shadow-lg py-1 min-w-[180px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="listbox"
      aria-label="Indentation settings"
    >
      {/* Indent using spaces vs tabs */}
      <button
        type="button"
        className="flex items-center w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
        onClick={() => onInsertSpacesChange(true)}
      >
        <span style={{ color: insertSpaces ? "var(--color-blue)" : "var(--color-text)" }}>
          Indent Using Spaces
        </span>
        {insertSpaces && (
          <span className="ml-auto text-[10px]" style={{ color: "var(--color-blue)" }}>
            active
          </span>
        )}
      </button>
      <button
        type="button"
        className="flex items-center w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
        onClick={() => onInsertSpacesChange(false)}
      >
        <span style={{ color: !insertSpaces ? "var(--color-blue)" : "var(--color-text)" }}>
          Indent Using Tabs
        </span>
        {!insertSpaces && (
          <span className="ml-auto text-[10px]" style={{ color: "var(--color-blue)" }}>
            active
          </span>
        )}
      </button>

      <div className="my-0.5" style={{ borderTop: "1px solid var(--color-surface-1)" }} />

      {/* Tab size options */}
      <div
        className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide"
        style={{ color: "var(--color-overlay-1)" }}
      >
        {insertSpaces ? "Spaces per Tab" : "Tab Size"}
      </div>
      {TAB_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          role="option"
          aria-selected={tabSize === size}
          className="flex items-center w-full px-3 py-1 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
          onClick={() => onTabSizeChange(size)}
        >
          <span style={{ color: tabSize === size ? "var(--color-blue)" : "var(--color-text)" }}>
            {size}
          </span>
          {tabSize === size && (
            <span className="ml-auto text-[10px]" style={{ color: "var(--color-blue)" }}>
              current
            </span>
          )}
        </button>
      ))}

      <div className="my-0.5" style={{ borderTop: "1px solid var(--color-surface-1)" }} />
      <button
        type="button"
        className="flex items-center w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function vimModeLabelColor(label: string): string {
  switch (label) {
    case "INSERT":
      return "var(--color-green)";
    case "VISUAL":
    case "V-LINE":
    case "V-BLOCK":
      return "var(--color-mauve)";
    case "REPLACE":
      return "var(--color-red)";
    case "NORMAL":
    default:
      return "var(--color-blue)";
  }
}

function getLanguageDisplayName(languageId: string): string {
  const names: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    rust: "Rust",
    python: "Python",
    json: "JSON",
    toml: "TOML",
    yaml: "YAML",
    markdown: "Markdown",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    xml: "XML",
    shell: "Shell Script",
    powershell: "PowerShell",
    bat: "Batch",
    sql: "SQL",
    go: "Go",
    java: "Java",
    c: "C",
    cpp: "C++",
    csharp: "C#",
    ruby: "Ruby",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    lua: "Lua",
    r: "R",
    dockerfile: "Dockerfile",
    graphql: "GraphQL",
    ini: "INI",
    plaintext: "Plain Text",
  };
  return names[languageId] ?? languageId;
}
