import { useState } from "react";
import {
  Clock,
  DollarSign,
  Cpu,
  GitBranch,
  Activity,
  FileText,
  MessageSquare,
  List,
  X,
  File,
  GitCompare,
} from "lucide-react";
import { useAgentsStore } from "@/stores/agents";
import { useAgentConversationsStore } from "@/stores/agentConversations";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { AgentTimeline } from "./AgentTimeline";
import { MultiFileDiffReview } from "@/components/diff/MultiFileDiffReview";
import { CheckpointControls } from "./CheckpointControls";

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = "timeline" | "conversation" | "files" | "diff";

// ── Agent status badge ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: "var(--color-overlay-0)",
  working: "var(--color-blue)",
  waiting_permission: "var(--color-peach)",
  reviewing: "var(--color-yellow)",
  completed: "var(--color-green)",
  error: "var(--color-red)",
  stalled: "var(--color-overlay-1)",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "var(--color-overlay-0)";
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ── Duration formatter ─────────────────────────────────────────────────────────

function formatDuration(createdAt: number, lastActivityAt: number): string {
  const ms = lastActivityAt - createdAt;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return `${hr}h ${rem}m`;
}

// ── Strip model date suffix ────────────────────────────────────────────────────

function stripModelDate(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

// ── Agent info header ──────────────────────────────────────────────────────────

interface AgentHeaderProps {
  agentId: string;
  onClose?: () => void;
}

function AgentHeader({ agentId, onClose }: AgentHeaderProps) {
  const agent = useAgentsStore((s) => s.agents.get(agentId));
  if (!agent) return null;

  return (
    <div
      className="px-4 py-3 shrink-0"
      style={{ borderBottom: "1px solid var(--color-surface-0)" }}
    >
      {/* Top row: name + close button */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Agent color dot */}
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: agent.color }}
          />
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--color-text)" }}
          >
            {agent.name}
          </span>
          <StatusBadge status={agent.status} />
        </div>
        {onClose && (
          <button
            type="button"
            className="p-1 rounded transition-colors hover:bg-[var(--color-surface-0)] shrink-0"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Task description */}
      {agent.taskDescription && (
        <p
          className="text-xs mb-2 leading-relaxed"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {agent.taskDescription}
        </p>
      )}

      {/* Metadata chips */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Cost */}
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--color-overlay-1)" }}
        >
          <DollarSign size={11} />
          {agent.cost > 0 ? `$${agent.cost.toFixed(4)}` : "$0.0000"}
        </span>

        {/* Duration */}
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--color-overlay-1)" }}
        >
          <Clock size={11} />
          {formatDuration(agent.createdAt, agent.lastActivityAt)}
        </span>

        {/* Model */}
        {agent.model && (
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <Cpu size={11} />
            {stripModelDate(agent.model)}
          </span>
        )}

        {/* Branch */}
        {agent.branchName && (
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <GitBranch size={11} />
            <span
              className="font-mono"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {agent.branchName}
            </span>
          </span>
        )}

        {/* Token count */}
        {(agent.tokens.input > 0 || agent.tokens.output > 0) && (
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <Activity size={11} />
            {(agent.tokens.input + agent.tokens.output).toLocaleString()} tok
          </span>
        )}
      </div>
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "timeline", label: "Timeline", icon: List },
  { id: "conversation", label: "Conversation", icon: MessageSquare },
  { id: "files", label: "Files", icon: FileText },
  { id: "diff", label: "Review", icon: GitCompare },
];

interface TabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
  counts: Record<TabId, number>;
}

function TabBar({ active, onChange, counts }: TabBarProps) {
  return (
    <div
      className="flex items-center shrink-0 px-2"
      style={{ borderBottom: "1px solid var(--color-surface-0)" }}
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs transition-colors relative"
            style={{
              color: isActive ? "var(--color-text)" : "var(--color-overlay-1)",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--color-blue)"
                : "2px solid transparent",
              cursor: "pointer",
              fontWeight: isActive ? 500 : 400,
            }}
            onClick={() => onChange(id)}
          >
            <Icon size={12} />
            {label}
            {counts[id] > 0 && (
              <span
                className="text-xs px-1 rounded"
                style={{
                  backgroundColor: "var(--color-surface-0)",
                  color: "var(--color-subtext-0)",
                  fontSize: "10px",
                }}
              >
                {counts[id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Files tab ──────────────────────────────────────────────────────────────────

function FilesTab({ agentId }: { agentId: string }) {
  const assignedFiles = useAgentsStore(
    (s) => s.agents.get(agentId)?.assignedFiles ?? [],
  );

  if (assignedFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--color-surface-0)" }}
        >
          <FileText size={14} style={{ color: "var(--color-overlay-0)" }} />
        </div>
        <span className="text-xs" style={{ color: "var(--color-overlay-0)" }}>
          No files touched
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {assignedFiles.map((filePath) => {
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
        const dirPart = filePath.slice(0, filePath.length - fileName.length);
        return (
          <div
            key={filePath}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-0)] transition-colors"
            style={{ borderBottom: "1px solid var(--color-surface-0)" }}
            title={filePath}
          >
            <File size={12} style={{ color: "var(--color-overlay-1)", flexShrink: 0 }} />
            <div className="min-w-0">
              <span
                className="text-xs block truncate"
                style={{ color: "var(--color-text)" }}
              >
                {fileName}
              </span>
              {dirPart && (
                <span
                  className="text-xs block truncate"
                  style={{
                    color: "var(--color-overlay-0)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                  }}
                >
                  {dirPart}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Conversation tab ───────────────────────────────────────────────────────────

function ConversationTab({ agentId }: { agentId: string }) {
  const messages = useAgentConversationsStore(
    (s) => s.conversations.get(agentId)?.messages ?? [],
  );

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--color-surface-0)" }}
        >
          <MessageSquare size={14} style={{ color: "var(--color-overlay-0)" }} />
        </div>
        <span className="text-xs" style={{ color: "var(--color-overlay-0)" }}>
          No messages yet
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full p-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

// ── AgentDetailPanel ───────────────────────────────────────────────────────────

interface AgentDetailPanelProps {
  agentId: string;
  /** Optional callback when the user clicks the close (X) button */
  onClose?: () => void;
}

export function AgentDetailPanel({ agentId, onClose }: AgentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("timeline");

  const timelineCount = useAgentsStore(
    (s) => s.agents.get(agentId)?.timeline.length ?? 0,
  );
  const conversationCount = useAgentConversationsStore(
    (s) => s.conversations.get(agentId)?.messages.length ?? 0,
  );
  const filesCount = useAgentsStore(
    (s) => s.agents.get(agentId)?.assignedFiles.length ?? 0,
  );

  const agent = useAgentsStore((s) => s.agents.get(agentId));
  if (!agent) {
    return (
      <div
        className="flex items-center justify-center h-full text-xs"
        style={{ color: "var(--color-overlay-0)" }}
      >
        Agent not found
      </div>
    );
  }

  const counts: Record<TabId, number> = {
    timeline: timelineCount,
    conversation: conversationCount,
    files: filesCount,
    diff: 0,
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Agent info header */}
      <AgentHeader agentId={agentId} onClose={onClose} />

      {/* Checkpoint controls */}
      {agent.checkpoint && (
        <div className="px-3 py-2 shrink-0">
          <CheckpointControls agent={agent} />
        </div>
      )}

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />

      {/* Tab content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === "timeline" && <AgentTimeline agentId={agentId} />}
        {activeTab === "conversation" && <ConversationTab agentId={agentId} />}
        {activeTab === "files" && <FilesTab agentId={agentId} />}
        {activeTab === "diff" && (
          agent.worktreePath ? (
            <MultiFileDiffReview
              worktreePath={agent.worktreePath}
              label={agent.name}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center h-full gap-2 py-8"
              style={{ color: "var(--color-overlay-0)" }}
            >
              <GitCompare size={20} strokeWidth={1.5} />
              <span className="text-xs">No worktree assigned to this agent</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
