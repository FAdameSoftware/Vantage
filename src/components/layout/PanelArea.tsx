import { Globe, Terminal as TerminalIcon } from "lucide-react";
import { TerminalPanel } from "@/components/terminal/TerminalTabs";
import { BrowserPreview } from "@/components/preview/BrowserPreview";
import { useLayoutStore } from "@/stores/layout";

type PanelTab = "terminal" | "browser";

const panelTabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: <TerminalIcon size={12} /> },
  { id: "browser", label: "Browser", icon: <Globe size={12} /> },
];

export function PanelArea() {
  const activePanelTab = useLayoutStore((s) => s.activePanelTab);
  const setActivePanelTab = useLayoutStore((s) => s.setActivePanelTab);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: "var(--color-base)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Panel-level mode tabs (Terminal | Browser) */}
      <div
        className="flex items-center shrink-0 gap-0 px-1"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {panelTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanelTab(tab.id)}
            className="flex items-center gap-1.5 px-3 h-8 text-xs transition-colors relative"
            style={{
              color:
                activePanelTab === tab.id
                  ? "var(--color-text)"
                  : "var(--color-overlay-1)",
              backgroundColor:
                activePanelTab === tab.id
                  ? "var(--color-surface-0)"
                  : "transparent",
            }}
          >
            {tab.icon}
            {tab.label}
            {activePanelTab === tab.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ backgroundColor: "var(--color-blue)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content — keep TerminalPanel always mounted so terminals persist */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0"
          style={{ display: activePanelTab === "terminal" ? "block" : "none" }}
        >
          <TerminalPanel />
        </div>

        {activePanelTab === "browser" && (
          <div className="absolute inset-0">
            <BrowserPreview />
          </div>
        )}
      </div>
    </div>
  );
}
