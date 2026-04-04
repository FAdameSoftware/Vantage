import {
  GitBranch,
  AlertTriangle,
  XCircle,
  Zap,
  CircleDollarSign,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor";

export function StatusBar() {
  const cursorPosition = useEditorStore((s) => s.cursorPosition);
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });

  // Map language IDs to display names
  const languageDisplayName = activeTab
    ? getLanguageDisplayName(activeTab.language)
    : "Plain Text";

  return (
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
        <button
          className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
          aria-label="Git branch: main"
        >
          <GitBranch size={12} />
          <span>main</span>
        </button>

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
      </div>

      {/* Right side - file/session scoped */}
      <div className="flex items-center gap-3">
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
          <Zap size={12} style={{ color: "var(--color-green)" }} />
          <span>Ready</span>
        </div>

        {/* Cost */}
        <div className="flex items-center gap-1">
          <CircleDollarSign size={12} />
          <span>$0.00</span>
        </div>

        {/* Model */}
        <span style={{ color: "var(--color-overlay-1)" }}>
          claude-opus-4-6
        </span>
      </div>
    </div>
  );
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
