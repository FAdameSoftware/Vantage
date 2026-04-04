import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode } from "lucide-react";
import { useEditorStore } from "@/stores/editor";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { EditorTabs } from "@/components/editor/EditorTabs";

function Breadcrumbs() {
  const activeTab = useEditorStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab ?? null;
  });

  if (!activeTab) return null;

  const segments = activeTab.path.split("/");

  return (
    <div
      className="flex items-center h-6 px-3 text-xs shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-subtext-0)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center shrink-0">
          {i > 0 && (
            <span className="mx-1" style={{ color: "var(--color-overlay-0)" }}>
              /
            </span>
          )}
          <span
            style={{
              color:
                i === segments.length - 1
                  ? "var(--color-text)"
                  : "var(--color-subtext-0)",
            }}
          >
            {segment}
          </span>
        </span>
      ))}
    </div>
  );
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: "var(--color-surface-0)" }}
      >
        <FileCode size={32} style={{ color: "var(--color-blue)" }} />
      </div>
      <div className="text-center">
        <h2
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--color-text)" }}
        >
          Welcome to Vantage
        </h2>
        <p
          className="text-xs max-w-md"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Open a project folder to get started. Use the Explorer (Ctrl+Shift+E)
          to browse files, or press Ctrl+Shift+P for the Command Palette.
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" />
        <KeyboardHint keys="Ctrl+Shift+E" label="Explorer" />
        <KeyboardHint keys="Ctrl+`" label="Terminal" />
      </div>
    </div>
  );
}

function KeyboardHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <kbd
        className="px-1.5 py-0.5 rounded text-xs font-mono"
        style={{
          backgroundColor: "var(--color-surface-0)",
          color: "var(--color-subtext-1)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {keys}
      </kbd>
      <span style={{ color: "var(--color-overlay-1)" }}>{label}</span>
    </div>
  );
}

export function EditorArea() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateContent = useEditorStore((s) => s.updateContent);
  const markSaved = useEditorStore((s) => s.markSaved);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Handle Ctrl+S to save the active file
  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return;
    try {
      await invoke("write_file", {
        path: activeTab.path,
        content: activeTab.content,
      });
      markSaved(activeTab.id, activeTab.content);
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  }, [activeTab, markSaved]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleSave]);

  const handleContentChange = useCallback(
    (newValue: string) => {
      if (activeTab) {
        updateContent(activeTab.id, newValue);
      }
    },
    [activeTab, updateContent]
  );

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
      data-allow-select="true"
    >
      {/* Tab bar */}
      <EditorTabs />

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Editor content */}
      {activeTab ? (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeTab.id}
            filePath={activeTab.path}
            language={activeTab.language}
            value={activeTab.content}
            onChange={handleContentChange}
          />
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}
