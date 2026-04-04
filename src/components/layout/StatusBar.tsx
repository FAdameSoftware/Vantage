import { useState, useEffect } from "react";
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
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "@/stores/editor";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useSettingsStore } from "@/stores/settings";
import { useUsageStore } from "@/stores/usage";
import { useGitStatus } from "@/hooks/useGitStatus";
import { UsagePanel } from "@/components/shared/UsagePanel";

export function StatusBar() {
  const cursorPosition = useEditorStore((s) => s.cursorPosition);
  const vimModeLabel = useEditorStore((s) => s.vimModeLabel);
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });

  const isStreaming = useConversationStore((s) => s.isStreaming);
  const session = useConversationStore((s) => s.session);
  const totalCost = useConversationStore((s) => s.totalCost);

  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const vimMode = useSettingsStore((s) => s.vimMode);
  const { branch, isGitRepo } = useGitStatus(projectRootPath);

  const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
  const usageTotalCost = useUsageStore((s) => s.totalCostUsd);
  const usageInputTokens = useUsageStore((s) => s.inputTokens);
  const usageOutputTokens = useUsageStore((s) => s.outputTokens);

  const [elapsed, setElapsed] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);

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
          {/* Git branch */}
          {isGitRepo && branch?.branch && (
            <button
              className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
              aria-label={`Git branch: ${branch.branch}`}
            >
              <GitBranch size={12} />
              <span>
                {branch.is_detached ? `(${branch.branch})` : branch.branch}
              </span>
            </button>
          )}

          {/* Errors and warnings */}
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
              aria-label="0 errors"
            >
              <XCircle size={12} style={{ color: "var(--color-red)" }} />
              <span>0</span>
            </button>
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
              aria-label="0 warnings"
            >
              <AlertTriangle size={12} style={{ color: "var(--color-yellow)" }} />
              <span>0</span>
            </button>
          </div>

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

          {/* Line and column */}
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>

          {/* Language */}
          <button className="hover:text-[var(--color-text)] transition-colors">
            {languageDisplayName}
          </button>

          {/* Claude session status */}
          <div className="flex items-center gap-1">
            {isStreaming ? (
              <Loader2 size={12} className="animate-spin" style={{ color: statusColor }} />
            ) : (
              <Zap size={12} style={{ color: statusColor }} />
            )}
            <span>{connectionStatus}</span>
          </div>

          {/* Usage: session timer, tokens, cost */}
          <button
            className="flex items-center gap-3 hover:text-[var(--color-text)] transition-colors"
            onClick={() => setShowUsage((s) => !s)}
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

          {/* Model */}
          <span style={{ color: "var(--color-overlay-1)" }}>
            {session?.model ?? "claude-opus-4-6"}
          </span>
        </div>
      </div>
    </div>
  );
}

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
