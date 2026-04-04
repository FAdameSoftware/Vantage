import { MessageSquare, Send } from "lucide-react";

export function SecondarySidebar() {
  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: "var(--color-blue)" }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Chat
          </span>
        </div>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-overlay-1)",
          }}
        >
          Claude
        </span>
      </div>

      {/* Chat messages placeholder */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          >
            <MessageSquare size={20} style={{ color: "var(--color-mauve)" }} />
          </div>
          <p
            className="text-xs leading-relaxed max-w-48"
            style={{ color: "var(--color-overlay-1)" }}
          >
            Claude Code chat will appear here in Phase 3. Connect via the Agent
            SDK sidecar.
          </p>
        </div>
      </div>

      {/* Chat input placeholder */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: "1px solid var(--color-surface-0)" }}
      >
        <div
          className="flex items-end gap-2 rounded-lg p-2"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <textarea
            className="flex-1 bg-transparent text-xs resize-none outline-none placeholder:text-[var(--color-overlay-0)]"
            style={{
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
            }}
            placeholder="Ask Claude anything..."
            rows={1}
            disabled
          />
          <button
            className="p-1.5 rounded transition-colors"
            style={{
              color: "var(--color-overlay-0)",
            }}
            disabled
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </div>
        <p
          className="text-center mt-2 text-xs"
          style={{ color: "var(--color-overlay-0)" }}
        >
          Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
