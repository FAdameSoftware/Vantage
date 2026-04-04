import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { DiffViewer } from "@/components/editor/DiffViewer";
import { EditorTabs } from "@/components/editor/EditorTabs";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { UsageDashboard } from "@/components/analytics/UsageDashboard";

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
  const setProjectRootPath = useLayoutStore((s) => s.setProjectRootPath);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setProjectRootPath(selected as string);
        // Switch to the Explorer panel so the file tree is visible
        setActiveActivityBarItem("explorer");
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: "var(--color-surface-0)" }}
      >
        <FileCode size={40} style={{ color: "var(--color-blue)" }} />
      </div>
      <div className="text-center">
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--color-text)" }}
        >
          Welcome to Vantage
        </h2>
        <p
          className="text-sm max-w-md leading-relaxed"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Your AI-native IDE for Claude Code.
        </p>
      </div>

      <button
        onClick={handleOpenFolder}
        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
        style={{
          backgroundColor: "var(--color-blue)",
          color: "var(--color-crust)",
        }}
      >
        <FolderOpen size={18} />
        Open Folder
      </button>

      <div className="flex gap-4 mt-4">
        <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" />
        <KeyboardHint keys="Ctrl+P" label="Quick Open" />
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
  const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);
  const pendingDiffs = useEditorStore((s) => s.pendingDiffs);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // If the active tab has a pending diff, show the diff viewer instead of the editor.
  // TODO: setPendingDiff is triggered from useClaude hook when a Claude Edit/Write
  //       tool call completes — the hook captures before/after content and calls
  //       setPendingDiff(tabId, originalContent, modifiedContent, description).
  const activeDiff = activeTab ? pendingDiffs.get(activeTab.id) : undefined;

  const isSpecialTab = activeTab?.path.startsWith("__vantage://") ?? false;

  const isMarkdownPreview =
    activeTab !== null &&
    !activeDiff &&
    !isSpecialTab &&
    activeTab.language === "markdown" &&
    markdownPreviewTabs.has(activeTab.id);

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
        isSpecialTab ? (
          /* Special built-in tabs (analytics, etc.) */
          <div className="flex-1 overflow-hidden">
            {activeTab.path === "__vantage://analytics" && <UsageDashboard />}
          </div>
        ) : activeDiff ? (
          /* Diff viewer — replaces the normal editor when a pending diff exists */
          <div className="flex-1 overflow-hidden">
            <DiffViewer
              key={activeTab.id}
              diff={activeDiff}
              language={activeTab.language}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex">
            {/* Monaco editor — full width or left half */}
            <div
              className={isMarkdownPreview ? "w-1/2" : "w-full"}
              style={{ overflow: "hidden" }}
            >
              <MonacoEditor
                key={activeTab.id}
                filePath={activeTab.path}
                language={activeTab.language}
                value={activeTab.content}
                onChange={handleContentChange}
              />
            </div>

            {/* Markdown preview — right half, only when toggled */}
            {isMarkdownPreview && (
              <div
                className="w-1/2 overflow-hidden"
                style={{ borderLeft: "1px solid var(--color-surface-0)" }}
              >
                <MarkdownPreview content={activeTab.content} />
              </div>
            )}
          </div>
        )
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}
