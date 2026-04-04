import { X, FileCode, Eye, EyeOff } from "lucide-react";
import { useEditorStore, type EditorTab } from "@/stores/editor";

export function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const pinTab = useEditorStore((s) => s.pinTab);
  const toggleMarkdownPreview = useEditorStore((s) => s.toggleMarkdownPreview);
  const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);

  if (tabs.length === 0) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isMarkdown = activeTab?.language === "markdown";
  const isPreviewActive = activeTab ? markdownPreviewTabs.has(activeTab.id) : false;

  const handleTabClick = (tab: EditorTab) => {
    setActiveTab(tab.id);
  };

  const handleTabClose = (e: React.MouseEvent, tab: EditorTab) => {
    e.stopPropagation();
    closeTab(tab.id);
  };

  const handleTabDoubleClick = (tab: EditorTab) => {
    // Double-click pins a preview tab
    if (tab.isPreview) {
      pinTab(tab.id);
    }
  };

  const handleMiddleClick = (e: React.MouseEvent, tab: EditorTab) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab.id);
    }
  };

  return (
    <div
      className="flex items-center h-9 shrink-0"
      style={{
        backgroundColor: "var(--color-mantle)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Scrollable tab list */}
      <div className="flex items-center h-full overflow-x-auto flex-1 min-w-0" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const fileName = tab.name;

          return (
            <div
              key={tab.id}
              className="flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer shrink-0 transition-colors group"
              style={{
                backgroundColor: isActive
                  ? "var(--color-base)"
                  : "transparent",
                color: isActive
                  ? "var(--color-text)"
                  : "var(--color-subtext-0)",
                borderRight: "1px solid var(--color-surface-0)",
                fontStyle: tab.isPreview ? "italic" : "normal",
              }}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(tab)}
              onDoubleClick={() => handleTabDoubleClick(tab)}
              onMouseDown={(e) => handleMiddleClick(e, tab)}
            >
              <FileCode size={14} style={{ color: "var(--color-blue)" }} />
              <span>{fileName}</span>

              {/* Dirty indicator OR close button */}
              {tab.isDirty ? (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: "var(--color-text)" }}
                  title="Unsaved changes"
                />
              ) : (
                <button
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-1)] transition-all"
                  style={{ color: "var(--color-overlay-1)" }}
                  onClick={(e) => handleTabClose(e, tab)}
                  aria-label={`Close ${fileName}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Markdown preview toggle — only shown for .md / .mdx files */}
      {isMarkdown && activeTab && (
        <button
          className="flex items-center gap-1 px-2 h-full text-xs hover:bg-[var(--color-surface-0)] transition-colors shrink-0"
          style={{
            color: isPreviewActive ? "var(--color-blue)" : "var(--color-overlay-1)",
            borderLeft: "1px solid var(--color-surface-0)",
          }}
          onClick={() => toggleMarkdownPreview(activeTab.id)}
          aria-label={isPreviewActive ? "Hide preview" : "Show preview"}
          title={isPreviewActive ? "Hide preview" : "Show preview"}
        >
          {isPreviewActive ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>Preview</span>
        </button>
      )}
    </div>
  );
}
