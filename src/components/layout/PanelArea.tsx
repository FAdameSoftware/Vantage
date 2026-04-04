import { Terminal, Plus, X, Maximize2 } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";

interface PlaceholderTerminalTab {
  id: string;
  label: string;
  shellType: string;
  isActive: boolean;
}

const placeholderTerminalTabs: PlaceholderTerminalTab[] = [
  { id: "term-1", label: "Terminal", shellType: "PowerShell", isActive: true },
];

export function PanelArea() {
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: "var(--color-base)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between h-9 shrink-0 px-2"
        style={{
          backgroundColor: "var(--color-mantle)",
        }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-0.5" role="tablist">
          {placeholderTerminalTabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-t cursor-pointer transition-colors"
              style={{
                backgroundColor: tab.isActive ? "var(--color-base)" : "transparent",
                color: tab.isActive ? "var(--color-text)" : "var(--color-subtext-0)",
              }}
              role="tab"
              aria-selected={tab.isActive}
            >
              <Terminal size={12} />
              <span>{tab.label}</span>
              <span
                className="text-xs"
                style={{ color: "var(--color-overlay-0)" }}
              >
                ({tab.shellType})
              </span>
              <button
                className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors ml-1"
                style={{ color: "var(--color-overlay-1)" }}
                aria-label={`Close ${tab.label}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* New terminal button */}
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="New Terminal (Ctrl+Shift+`)"
            title="New Terminal (Ctrl+Shift+`)"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Panel actions */}
        <div className="flex items-center gap-0.5">
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="Maximize Panel"
          >
            <Maximize2 size={12} />
          </button>
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={togglePanel}
            aria-label="Close Panel (Ctrl+J)"
            title="Close Panel (Ctrl+J)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal content placeholder */}
      <div
        className="flex-1 p-4 font-mono text-sm"
        style={{
          color: "var(--color-text)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--font-size-editor)",
        }}
        data-allow-select="true"
      >
        <p style={{ color: "var(--color-overlay-1)" }}>
          Terminal emulator will appear here in Phase 2.
        </p>
        <p style={{ color: "var(--color-overlay-1)" }}>
          Powered by xterm.js + ConPTY via tauri-plugin-pty.
        </p>
        <p className="mt-4">
          <span style={{ color: "var(--color-green)" }}>user@vantage</span>
          <span style={{ color: "var(--color-overlay-1)" }}>:</span>
          <span style={{ color: "var(--color-blue)" }}>~/project</span>
          <span style={{ color: "var(--color-text)" }}>$ </span>
          <span
            className="inline-block w-2 h-4 animate-pulse"
            style={{ backgroundColor: "var(--color-rosewater)" }}
          />
        </p>
      </div>
    </div>
  );
}
