import { useState, useEffect, useRef } from "react";
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
import { useEditorStore, selectActiveTab, selectCursorPosition } from "@/stores/editor";
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

export function StatusBar() {
  const cursorPosition = useEditorStore(selectCursorPosition);
  const vimModeLabel = useEditorStore((s) => s.vimModeLabel);
  const activeTab = useEditorStore(selectActiveTab);

  const isStreaming = useConversationStore((s) => s.isStreaming);
  const session = useConversationStore((s) => s.session);
  const totalCost = useConversationStore((s) => s.totalCost);

  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const toggleSecondarySidebar = useLayoutStore((s) => s.toggleSecondarySidebar);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const showBuddy = useSettingsStore((s) => s.showBuddy);
  const toggleBuddy = useSettingsStore((s) => s.toggleBuddy);
  const { branch, isGitRepo } = useGitStatus(projectRootPath);

  const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
  const usageTotalCost = useUsageStore((s) => s.totalCostUsd);
  const usageInputTokens = useUsageStore((s) => s.inputTokens);
  const usageOutputTokens = useUsageStore((s) => s.outputTokens);

  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const openPalette = useCommandPaletteStore((s) => s.open);

  const [elapsed, setElapsed] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const languageSelectorRef = useRef<HTMLDivElement>(null);

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
    if (!showModelSelector && !showLanguageSelector) return;
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
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelSelector, showLanguageSelector]);

  // Map language IDs to display names
  const languageDisplayName = activeTab
    ? getLanguageDisplayName(activeTab.language)
    : "Plain Text";

  const connectionStatus = isStreaming ? "Streaming" : session ? "Connected" : "Ready";
  const statusColor = isStreaming
    ? "var(--color-peach)"
    : session
      ? "var(--color-green)"
      : "var(--color-overlay-1)";

  // Click handlers
  const handleGitBranchClick = () => {
    setActiveActivityBarItem("git");
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
        <div className="flex items-center gap-3">
          {/* Git branch -> click opens Source Control panel */}
          {isGitRepo && branch?.branch && (
            <button
              className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
              aria-label={`Git branch: ${branch.branch}. Click to open Source Control.`}
              onClick={handleGitBranchClick}
              title="Open Source Control"
            >
              <GitBranch size={12} />
              <span>
                {branch.is_detached ? `(${branch.branch})` : branch.branch}
              </span>
            </button>
          )}

          {/* Errors and warnings -> click focuses search panel */}
          <div className="flex items-center gap-2">
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

          {/* Coding buddy — Inkwell -> click toggles visibility */}
          <button
            onClick={handleBuddyClick}
            className="hover:opacity-80 transition-opacity"
            title={showBuddy ? "Hide Inkwell" : "Show Inkwell"}
          >
            <BuddyWidget visible={showBuddy} />
          </button>

          {/* Notification bell */}
          <button
            className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors relative"
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

          {/* Index status */}
          <div
            className="flex items-center gap-0.5"
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
        </div>

        {/* Right side - file/session scoped */}
        <div className="flex items-center gap-3">
          {/* Vim mode indicator */}
          {vimMode && (
            <span
              className="font-mono font-semibold px-1 rounded text-[10px]"
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
            className="hover:text-[var(--color-text)] transition-colors"
            onClick={handleLineColClick}
            title="Go to Line (Ctrl+G)"
          >
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </button>

          {/* Language -> click opens language selector */}
          <div ref={languageSelectorRef} className="relative">
            <button
              className="hover:text-[var(--color-text)] transition-colors"
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
            className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
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

          {/* Usage: session timer, tokens, cost -> click opens usage panel */}
          <button
            className="flex items-center gap-3 hover:text-[var(--color-text)] transition-colors"
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

            {/* Cost */}
            <div className="flex items-center gap-1" title="Session cost">
              <Coins size={11} />
              <span>${(usageTotalCost || totalCost).toFixed(4)}</span>
            </div>
          </button>

          {/* Effort level */}
          <EffortLevelSelector />

          {/* Model -> click opens model selector dropdown */}
          <div ref={modelSelectorRef} className="relative">
            <button
              className="hover:text-[var(--color-text)] transition-colors"
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
