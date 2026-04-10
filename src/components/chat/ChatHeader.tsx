import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, Search, GitBranch, Pin, Download } from "lucide-react";
import { EASE_SMOOTH } from "@/lib/animations";
import { useConversationStore } from "@/stores/conversation";
import { useSettingsStore } from "@/stores/settings";
import { PlanModeToggle } from "./PlanModeToggle";
import { WriterReviewerLauncher } from "@/components/agents/WriterReviewerLauncher";
import { CompactDialog } from "./CompactDialog";
import { SessionSelector } from "./SessionSelector";
import { EXPORT_FORMATS } from "@/lib/slashHandlers";
import { normalizeModelName } from "@/lib/pricing";
import { AVAILABLE_MODELS } from "@/lib/models";
import type { ConversationState } from "@/stores/conversation";

// ─── Fine-grained selectors ────────────────────────────────────────────────

const selectSession = (s: ConversationState) => s.session;
const selectConnectionStatus = (s: ConversationState) => s.connectionStatus;
const selectMessages = (s: ConversationState) => s.messages;

// ─── Model selector dropdown (small — kept inline) ─────────────────────────

function ModelSelector() {
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);

  return (
    <select
      value={selectedModel}
      onChange={(e) => setSelectedModel(e.target.value)}
      className="text-[10px] px-1.5 py-0.5 rounded outline-none cursor-pointer"
      style={{
        backgroundColor: "var(--color-surface-0)",
        color: "var(--color-overlay-1)",
        border: "1px solid var(--color-surface-1)",
      }}
      aria-label="Select Claude model"
      title="Select model for new sessions"
    >
      {AVAILABLE_MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

// ─── Export menu dropdown (small — kept inline) ─────────────────────────────

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const messages = useConversationStore(selectMessages);

  if (messages.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="p-1 rounded transition-colors hover:bg-[var(--color-surface-0)]"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Export conversation"
        title="Export conversation"
      >
        <Download size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 top-full mt-1 rounded-md shadow-lg z-50 py-1 min-w-[160px]"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: EASE_SMOOTH as unknown as number[] }}
          >
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-1)] transition-colors"
                style={{ color: "var(--color-text)" }}
                onClick={() => {
                  fmt.handler();
                  setOpen(false);
                }}
              >
                {fmt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ChatHeader Props ──────────────────────────────────────────────────────

export interface ChatHeaderProps {
  mode: "full" | "sidebar";
  searchOpen: boolean;
  onToggleSearch: () => void;
  showMap: boolean;
  onToggleMap: () => void;
  showPinnedOnly: boolean;
  onTogglePinned: () => void;
  onSend: (content: string) => void;
  onNewSession: () => void;
  onResumeSession: (sessionId: string) => void;
}

// ─── ChatHeader ────────────────────────────────────────────────────────────

export function ChatHeader({
  mode,
  searchOpen,
  onToggleSearch,
  showMap,
  onToggleMap,
  showPinnedOnly,
  onTogglePinned,
  onSend,
  onNewSession,
  onResumeSession,
}: ChatHeaderProps) {
  const session = useConversationStore(selectSession);
  const connectionStatus = useConversationStore(selectConnectionStatus);
  const pinnedMessageIds = useConversationStore((s) => s.pinnedMessageIds);

  const isConnected = connectionStatus === "ready" || connectionStatus === "streaming";
  const modelDisplay = session?.model ? normalizeModelName(session.model) : null;

  return (
    <div
      className={`flex items-center shrink-0 min-w-0 gap-2 backdrop-blur-sm z-10 ${mode === "full" ? "px-5 h-10" : "px-3 h-9"}`}
      style={{
        borderBottom: "1px solid var(--color-surface-0)",
        backgroundColor: "color-mix(in srgb, var(--color-mantle) 95%, transparent)",
      }}
    >
      {/* Left: title + model badge */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {mode === "sidebar" && (
          <MessageSquare size={13} className="shrink-0" style={{ color: "var(--color-blue)" }} />
        )}
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-subtext-0)" }}
        >
          Chat
        </span>
        {modelDisplay && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-0)",
            }}
            title="Active session model"
          >
            {modelDisplay}
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: icon-only action buttons grouped tightly */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Primary actions group */}
        <PlanModeToggle />
        {mode === "sidebar" && <ModelSelector />}

        {/* Divider */}
        <div className="w-px h-3.5 mx-1" style={{ backgroundColor: "var(--color-surface-1)" }} />

        {/* Secondary icon-only actions */}
        {pinnedMessageIds.size > 0 && (
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--color-surface-0)]"
            style={{ color: showPinnedOnly ? "var(--color-yellow)" : "var(--color-overlay-1)" }}
            onClick={onTogglePinned}
            title={showPinnedOnly ? "Show all messages" : `Pinned (${pinnedMessageIds.size})`}
            aria-label={showPinnedOnly ? "Show all messages" : `Show pinned messages (${pinnedMessageIds.size})`}
          >
            <Pin size={13} />
          </button>
        )}
        <button
          type="button"
          className="p-1 rounded hover:bg-[var(--color-surface-0)]"
          style={{ color: searchOpen ? "var(--color-blue)" : "var(--color-overlay-1)" }}
          onClick={onToggleSearch}
          title="Search (Ctrl+Shift+F)"
          aria-label={searchOpen ? "Close search" : "Search messages"}
        >
          <Search size={13} />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-[var(--color-surface-0)]"
          style={{ color: showMap ? "var(--color-blue)" : "var(--color-overlay-1)" }}
          onClick={onToggleMap}
          title="Execution map"
          aria-label={showMap ? "Hide execution map" : "Show execution map"}
        >
          <GitBranch size={13} />
        </button>
        <ExportMenu />

        {/* Divider */}
        <div className="w-px h-3.5 mx-1" style={{ backgroundColor: "var(--color-surface-1)" }} />

        {/* Session actions */}
        <WriterReviewerLauncher />
        <CompactDialog onSend={onSend} />
        <SessionSelector
          cwd={session?.cwd ?? ""}
          onNewSession={onNewSession}
          onResumeSession={onResumeSession}
        />
        {isConnected && (
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--color-surface-0)]"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={onNewSession}
            title="New Session"
          >
            <Plus size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
