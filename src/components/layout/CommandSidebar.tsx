import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Cpu,
  Hash,
  GitCommit,
  Plus,
  FileEdit,
  Terminal as TerminalIcon,
  Search as SearchIcon,
  Eye,
  FolderOpen,
  Code,
} from "lucide-react";
import { useUsageStore } from "@/stores/usage";
import { useConversationStore } from "@/stores/conversation";
import { useActivityTrail } from "@/hooks/useActivityTrail";
import type { ActivityAction } from "@/hooks/useActivityTrail";
import { ACTION_COLORS } from "@/hooks/useActivityTrail";
import { useEditorStore } from "@/stores/editor";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function sessionDuration(startedAt: number | null): string {
  if (!startedAt) return "--";
  const ms = Date.now() - startedAt;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const ACTION_ICONS: Record<ActivityAction, React.ReactNode> = {
  Read: <Eye size={12} />,
  Edit: <FileEdit size={12} />,
  Write: <FileEdit size={12} />,
  MultiEdit: <FileEdit size={12} />,
  Bash: <TerminalIcon size={12} />,
  Grep: <SearchIcon size={12} />,
  Glob: <FolderOpen size={12} />,
};

// ─── Collapsible Section ────────────────────────────────────────────────────

function SectionHeader({
  title,
  expanded,
  onToggle,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
      style={{
        borderBottom: "1px solid var(--color-surface-0)",
        color: "var(--color-subtext-0)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontWeight: 600,
      }}
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      {title}
    </button>
  );
}

// ─── Session Metrics Section ────────────────────────────────────────────────

function SessionMetrics() {
  const totalCostUsd = useUsageStore((s) => s.totalCostUsd);
  const inputTokens = useUsageStore((s) => s.inputTokens);
  const outputTokens = useUsageStore((s) => s.outputTokens);
  const cacheReadTokens = useUsageStore((s) => s.cacheReadTokens);
  const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
  const turnCount = useUsageStore((s) => s.turnCount);
  const planUsage = useUsageStore((s) => s.planUsage);
  const session = useConversationStore((s) => s.session);
  const connectionStatus = useConversationStore((s) => s.connectionStatus);
  const lastSessionModel = useUsageStore((s) => s.lastSessionModel);

  const model = session?.model ?? lastSessionModel ?? "--";

  const fiveHourPct = planUsage?.fiveHour
    ? Math.round(planUsage.fiveHour.utilization)
    : null;
  const weeklyPct = planUsage?.sevenDay
    ? Math.round(planUsage.sevenDay.utilization)
    : null;

  return (
    <div className="flex flex-col gap-2 px-3 py-2" style={{ fontSize: 12 }}>
      {/* Plan usage bars */}
      {(fiveHourPct !== null || weeklyPct !== null) && (
        <div className="flex flex-col gap-1.5">
          <MetricLabel icon={<Cpu size={12} />} label="Plan" />
          {fiveHourPct !== null && (
            <ProgressRow label="5h window" percent={fiveHourPct} />
          )}
          {weeklyPct !== null && (
            <ProgressRow label="Weekly" percent={weeklyPct} />
          )}
        </div>
      )}

      {/* Cost */}
      <MetricRow
        icon={<Coins size={12} />}
        label="Cost"
        value={`$${totalCostUsd.toFixed(4)}`}
      />

      {/* Tokens */}
      <MetricRow
        icon={<Code size={12} />}
        label="Tokens"
        value={`${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out`}
        subtitle={
          cacheReadTokens > 0
            ? `${formatTokens(cacheReadTokens)} cache`
            : undefined
        }
      />

      {/* Model */}
      <MetricRow icon={<Cpu size={12} />} label="Model" value={model} />

      {/* Duration */}
      <MetricRow
        icon={<Clock size={12} />}
        label="Duration"
        value={sessionDuration(sessionStartedAt)}
      />

      {/* Turns */}
      <MetricRow
        icon={<Hash size={12} />}
        label="Turns"
        value={String(turnCount)}
      />

      {/* Status dot */}
      <div className="flex items-center gap-2" style={{ color: "var(--color-subtext-1)" }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor:
              connectionStatus === "streaming"
                ? "var(--color-green)"
                : connectionStatus === "ready"
                  ? "var(--color-blue)"
                  : connectionStatus === "error"
                    ? "var(--color-red)"
                    : "var(--color-overlay-0)",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11 }}>{connectionStatus}</span>
      </div>
    </div>
  );
}

function MetricLabel({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      style={{ color: "var(--color-subtext-0)", fontSize: 11 }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function MetricRow({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div
        className="flex items-center gap-1.5"
        style={{ color: "var(--color-subtext-0)", fontSize: 11, flexShrink: 0 }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-right" style={{ minWidth: 0 }}>
        <span
          style={{
            color: "var(--color-text)",
            fontSize: 12,
            wordBreak: "break-all",
          }}
        >
          {value}
        </span>
        {subtitle && (
          <div style={{ color: "var(--color-subtext-1)", fontSize: 10 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRow({ label, percent }: { label: string; percent: number }) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const barColor =
    clampedPercent >= 90
      ? "var(--color-red)"
      : clampedPercent >= 70
        ? "var(--color-yellow)"
        : "var(--color-blue)";

  return (
    <div className="flex items-center gap-2">
      <span
        style={{
          color: "var(--color-subtext-1)",
          fontSize: 10,
          width: 60,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: "var(--color-surface-0)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clampedPercent}%`,
            height: "100%",
            borderRadius: 2,
            backgroundColor: barColor,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          color: "var(--color-subtext-1)",
          fontSize: 10,
          width: 30,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {percent}%
      </span>
    </div>
  );
}

// ─── Checkpoint Timeline Section ────────────────────────────────────────────

function CheckpointTimeline() {
  const checkpoints = useConversationStore((s) => s.checkpoints);
  const createCheckpoint = useConversationStore((s) => s.createCheckpoint);

  return (
    <div className="flex flex-col gap-1 px-3 py-2" style={{ fontSize: 12 }}>
      {checkpoints.length === 0 && (
        <div
          style={{
            color: "var(--color-subtext-1)",
            fontSize: 11,
            fontStyle: "italic",
            padding: "4px 0",
          }}
        >
          No checkpoints yet
        </div>
      )}

      {checkpoints.map((cp, i) => (
        <div key={i} className="flex items-start gap-2 py-0.5">
          {/* Timeline dot + line */}
          <div className="flex flex-col items-center" style={{ flexShrink: 0 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--color-blue)",
                marginTop: 3,
              }}
            />
            {i < checkpoints.length - 1 && (
              <div
                style={{
                  width: 1,
                  flex: 1,
                  minHeight: 12,
                  backgroundColor: "var(--color-surface-0)",
                }}
              />
            )}
          </div>

          {/* Label + time */}
          <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                color: "var(--color-text)",
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {cp.label}
            </span>
            <span style={{ color: "var(--color-subtext-1)", fontSize: 10 }}>
              {relativeTime(cp.timestamp)}
            </span>
          </div>
        </div>
      ))}

      {/* Create checkpoint button */}
      <button
        onClick={() => createCheckpoint()}
        className="mt-1 flex items-center gap-1.5 rounded px-2 py-1"
        style={{
          color: "var(--color-blue)",
          fontSize: 11,
          border: "1px solid var(--color-surface-0)",
          background: "transparent",
          cursor: "pointer",
          width: "fit-content",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--color-surface-0)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "transparent";
        }}
      >
        <Plus size={12} />
        Create checkpoint
      </button>
    </div>
  );
}

// ─── Activity Feed Section ──────────────────────────────────────────────────

function ActivityFeed() {
  const entries = useActivityTrail();

  const handleClick = (path: string, filename: string) => {
    useEditorStore.getState().openFile(path, filename, "", "", false);
  };

  return (
    <div className="flex flex-col gap-0.5 px-3 py-2" style={{ fontSize: 12 }}>
      {entries.length === 0 && (
        <div
          style={{
            color: "var(--color-subtext-1)",
            fontSize: 11,
            fontStyle: "italic",
            padding: "4px 0",
          }}
        >
          No activity yet
        </div>
      )}

      {entries.map((entry) => (
        <button
          key={entry.id}
          onClick={() => handleClick(entry.path, entry.filename)}
          className="flex items-center gap-2 rounded px-1 py-0.5 text-left"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "var(--color-surface-0)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "transparent";
          }}
        >
          {/* Action icon */}
          <span
            style={{
              color: ACTION_COLORS[entry.action],
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            {ACTION_ICONS[entry.action] ?? <GitCommit size={12} />}
          </span>

          {/* Filename */}
          <span
            style={{
              color: "var(--color-text)",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
            title={entry.path}
          >
            {entry.filename}
          </span>

          {/* Relative time */}
          <span
            style={{
              color: "var(--color-subtext-1)",
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            {relativeTime(entry.timestamp)}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CommandSidebar() {
  const [metricsExpanded, setMetricsExpanded] = useState(true);
  const [checkpointsExpanded, setCheckpointsExpanded] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(true);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Session Metrics */}
      <SectionHeader
        title="Session Metrics"
        expanded={metricsExpanded}
        onToggle={() => setMetricsExpanded((v) => !v)}
      />
      {metricsExpanded && <SessionMetrics />}

      {/* Checkpoint Timeline */}
      <SectionHeader
        title="Checkpoint Timeline"
        expanded={checkpointsExpanded}
        onToggle={() => setCheckpointsExpanded((v) => !v)}
      />
      {checkpointsExpanded && <CheckpointTimeline />}

      {/* Activity Feed */}
      <SectionHeader
        title="Activity Feed"
        expanded={activityExpanded}
        onToggle={() => setActivityExpanded((v) => !v)}
      />
      {activityExpanded && <ActivityFeed />}
    </div>
  );
}
