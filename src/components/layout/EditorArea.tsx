import { X, FileCode } from "lucide-react";

interface PlaceholderTab {
  id: string;
  label: string;
  isActive: boolean;
  isDirty: boolean;
}

const placeholderTabs: PlaceholderTab[] = [
  { id: "welcome", label: "Welcome", isActive: true, isDirty: false },
];

function TabBar({ tabs }: { tabs: PlaceholderTab[] }) {
  return (
    <div
      className="flex items-center h-9 shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-mantle)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
      role="tablist"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="flex items-center gap-2 px-3 h-full text-xs cursor-pointer shrink-0 transition-colors"
          style={{
            backgroundColor: tab.isActive ? "var(--color-base)" : "transparent",
            color: tab.isActive ? "var(--color-text)" : "var(--color-subtext-0)",
            borderRight: "1px solid var(--color-surface-0)",
          }}
          role="tab"
          aria-selected={tab.isActive}
        >
          <FileCode size={14} style={{ color: "var(--color-blue)" }} />
          <span>{tab.label}</span>
          {tab.isDirty && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-text)" }}
            />
          )}
          <button
            className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label={`Close ${tab.label}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Breadcrumbs() {
  return (
    <div
      className="flex items-center h-6 px-3 text-xs shrink-0"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-subtext-0)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      <span>Vantage</span>
      <span className="mx-1" style={{ color: "var(--color-overlay-0)" }}>
        /
      </span>
      <span style={{ color: "var(--color-text)" }}>Welcome</span>
    </div>
  );
}

export function EditorArea() {
  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
      data-allow-select="true"
    >
      <TabBar tabs={placeholderTabs} />
      <Breadcrumbs />

      {/* Editor content placeholder */}
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
            Open a project folder to get started. The code editor will appear here
            in Phase 2 with Monaco Editor, syntax highlighting, and inline diff
            review.
          </p>
        </div>
        <div className="flex gap-3 mt-2">
          <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" />
          <KeyboardHint keys="Ctrl+Shift+E" label="Explorer" />
          <KeyboardHint keys="Ctrl+`" label="Terminal" />
        </div>
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
