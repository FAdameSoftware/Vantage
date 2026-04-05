import { useState, useEffect } from "react";
import { FileText, Server, BookOpen, Puzzle, Zap, Settings, Keyboard } from "lucide-react";
import { ClaudeMdEditor } from "./ClaudeMdEditor";
import { McpManager } from "./McpManager";
import { PluginManager } from "./PluginManager";
import { SpecViewer } from "./SpecViewer";
import { HooksEditor } from "./HooksEditor";
import { PreferencesEditor } from "./PreferencesEditor";
import { KeybindingsEditor } from "./KeybindingsEditor";

type SettingsTab = "preferences" | "keybindings" | "claude-md" | "mcp-servers" | "plugins" | "hooks" | "spec-viewer";

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "preferences", label: "Preferences", icon: <Settings size={12} /> },
  { id: "keybindings", label: "Keybindings", icon: <Keyboard size={12} /> },
  { id: "claude-md", label: "CLAUDE.md", icon: <FileText size={12} /> },
  { id: "mcp-servers", label: "MCP Servers", icon: <Server size={12} /> },
  { id: "plugins", label: "Plugins", icon: <Puzzle size={12} /> },
  { id: "hooks", label: "Hooks", icon: <Zap size={12} /> },
  { id: "spec-viewer", label: "Spec Viewer", icon: <BookOpen size={12} /> },
];

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("preferences");

  // Listen for command palette "Open Spec Viewer" event
  useEffect(() => {
    const handler = () => setActiveTab("spec-viewer");
    window.addEventListener("vantage:open-spec-viewer", handler);
    return () => window.removeEventListener("vantage:open-spec-viewer", handler);
  }, []);

  // Listen for command palette "Open Keyboard Shortcuts" event
  useEffect(() => {
    const handler = () => setActiveTab("keybindings");
    window.addEventListener("vantage:open-keybindings", handler);
    return () => window.removeEventListener("vantage:open-keybindings", handler);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div
        className="flex items-center gap-0 shrink-0 overflow-x-auto min-w-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-mantle)",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 h-8 text-xs transition-colors relative shrink-0 whitespace-nowrap"
            style={{
              color:
                activeTab === tab.id
                  ? "var(--color-text)"
                  : "var(--color-overlay-1)",
              backgroundColor:
                activeTab === tab.id
                  ? "var(--color-surface-0)"
                  : "transparent",
            }}
          >
            {tab.icon}
            {tab.label}
            {activeTab === tab.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ backgroundColor: "var(--color-blue)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "preferences" ? (
          <PreferencesEditor />
        ) : activeTab === "keybindings" ? (
          <KeybindingsEditor />
        ) : activeTab === "claude-md" ? (
          <ClaudeMdEditor />
        ) : activeTab === "mcp-servers" ? (
          <McpManager />
        ) : activeTab === "plugins" ? (
          <PluginManager />
        ) : activeTab === "hooks" ? (
          <HooksEditor />
        ) : (
          <SpecViewer />
        )}
      </div>
    </div>
  );
}
