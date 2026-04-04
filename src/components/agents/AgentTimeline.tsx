import { useState, useEffect, useRef } from "react";
import {
  Eye,
  Pencil,
  Terminal,
  Brain,
  Wrench,
  AlertTriangle,
  Zap,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Clock,
} from "lucide-react";
import { useAgentsStore } from "@/stores/agents";
import type { AgentTimelineEvent } from "@/stores/agents";

// ── Event type metadata ────────────────────────────────────────────────────────

interface EventMeta {
  icon: React.ElementType;
  color: string;
  label: string;
}

const EVENT_META: Record<AgentTimelineEvent["type"], EventMeta> = {
  file_read: { icon: Eye, color: "var(--color-blue)", label: "Read" },
  file_edit: { icon: Pencil, color: "var(--color-yellow)", label: "Edit" },
  bash_command: { icon: Terminal, color: "var(--color-red)", label: "Bash" },
  thinking: { icon: Brain, color: "var(--color-mauve)", label: "Thinking" },
  tool_call: { icon: Wrench, color: "var(--color-teal)", label: "Tool" },
  error: { icon: AlertTriangle, color: "var(--color-red)", label: "Error" },
  permission: { icon: Zap, color: "var(--color-peach)", label: "Permission" },
  message: { icon: MessageSquare, color: "var(--color-green)", label: "Message" },
};

// ── Timestamp formatter ────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ── Single timeline event row ──────────────────────────────────────────────────

interface TimelineEventRowProps {
  event: AgentTimelineEvent;
}

function TimelineEventRow({ event }: TimelineEventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_META[event.type];
  const Icon = meta.icon;
  const hasDetail = Boolean(event.detail);

  return (
    <div
      className="group"
      style={{ borderBottom: "1px solid var(--color-surface-0)" }}
    >
      {/* Row header */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left bg-transparent border-none cursor-default hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ cursor: hasDetail ? "pointer" : "default" }}
        onClick={() => hasDetail && setExpanded((p) => !p)}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        {/* Expand toggle (only if there's detail) */}
        <span className="w-3 shrink-0 flex items-center justify-center">
          {hasDetail ? (
            expanded ? (
              <ChevronDown size={10} style={{ color: "var(--color-overlay-0)" }} />
            ) : (
              <ChevronRight size={10} style={{ color: "var(--color-overlay-0)" }} />
            )
          ) : null}
        </span>

        {/* Timestamp */}
        <span
          className="text-xs shrink-0 tabular-nums"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-overlay-0)",
            minWidth: "56px",
          }}
        >
          {formatTimestamp(event.timestamp)}
        </span>

        {/* Type icon */}
        <Icon size={12} style={{ color: meta.color, flexShrink: 0 }} />

        {/* Summary */}
        <span
          className="text-xs truncate flex-1"
          style={{ color: "var(--color-text)" }}
        >
          {event.summary}
        </span>

        {/* File path badge (if present) */}
        {event.filePath && (
          <span
            className="text-xs truncate max-w-[140px] shrink-0"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-subtext-0)",
            }}
            title={event.filePath}
          >
            {event.filePath.split(/[\\/]/).pop()}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && event.detail && (
        <div
          className="px-4 pb-2 pt-1 text-xs whitespace-pre-wrap break-words"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-subtext-0)",
            backgroundColor: "var(--color-mantle)",
            borderTop: "1px solid var(--color-surface-0)",
          }}
        >
          {event.detail}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyTimeline() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--color-surface-0)" }}
      >
        <Clock size={14} style={{ color: "var(--color-overlay-0)" }} />
      </div>
      <span className="text-xs" style={{ color: "var(--color-overlay-0)" }}>
        No events yet
      </span>
    </div>
  );
}

// ── AgentTimeline ──────────────────────────────────────────────────────────────

interface AgentTimelineProps {
  agentId: string;
}

export function AgentTimeline({ agentId }: AgentTimelineProps) {
  const timeline = useAgentsStore((s) => s.agents.get(agentId)?.timeline ?? []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to latest event when new events arrive
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [timeline.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 50;
  };

  if (timeline.length === 0) {
    return <EmptyTimeline />;
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col overflow-y-auto h-full"
      onScroll={handleScroll}
    >
      {timeline.map((event) => (
        <TimelineEventRow key={event.id} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
