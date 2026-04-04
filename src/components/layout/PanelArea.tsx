import { Globe, Terminal as TerminalIcon, ShieldCheck } from "lucide-react";
import { TerminalPanel } from "@/components/terminal/TerminalTabs";
import { BrowserPreview } from "@/components/preview/BrowserPreview";
import { VerificationDashboard } from "@/components/agents/VerificationDashboard";
import { useLayoutStore } from "@/stores/layout";
import { useVerificationStore } from "@/stores/verification";

type PanelTab = "terminal" | "browser" | "verification";

const panelTabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: <TerminalIcon size={12} /> },
  { id: "browser", label: "Browser", icon: <Globe size={12} /> },
  { id: "verification", label: "Verification", icon: <ShieldCheck size={12} /> },
];

function VerificationBadge() {
  const failCount = useVerificationStore((s) => s.getFailCount());
  const passCount = useVerificationStore((s) => s.getPassCount());
  const totalCount = useVerificationStore((s) => s.getTotalCount());

  if (totalCount === 0) return null;

  if (failCount > 0) {
    return (
      <span
        className="text-[9px] font-semibold px-1 rounded-full"
        style={{
          backgroundColor: "var(--color-red)",
          color: "var(--color-base)",
        }}
      >
        {failCount}
      </span>
    );
  }

  if (passCount === totalCount) {
    return (
      <span
        className="size-1.5 rounded-full inline-block"
        style={{ backgroundColor: "var(--color-green)" }}
      />
    );
  }

  return null;
}

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
      {/* Panel-level mode tabs (Terminal | Browser | Verification) */}
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
            {tab.id === "verification" && <VerificationBadge />}
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

        {activePanelTab === "verification" && (
          <div className="absolute inset-0 overflow-auto flex flex-col">
            <VerificationDashboard />
          </div>
        )}
      </div>
    </div>
  );
}
