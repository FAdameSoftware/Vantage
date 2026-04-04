import {
  GitBranch,
  AlertTriangle,
  XCircle,
  Zap,
  CircleDollarSign,
} from "lucide-react";

export function StatusBar() {
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
        <span>Ln 1, Col 1</span>

        {/* Language */}
        <button className="hover:text-[var(--color-text)] transition-colors">
          TypeScript
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
        <span style={{ color: "var(--color-overlay-1)" }}>claude-opus-4-6</span>
      </div>
    </div>
  );
}
