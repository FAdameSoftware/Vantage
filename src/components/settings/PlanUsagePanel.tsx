import { useEffect, useRef, useCallback } from "react";
import {
  RefreshCw,
  Clock,
  Gauge,
  CreditCard,
  AlertCircle,
  Zap,
} from "lucide-react";
import { useUsageStore } from "@/stores/usage";
import type { UsageWindow, ExtraUsageInfo } from "@/stores/usage";
import { Spinner } from "@/components/ui/Spinner";

// ── Time formatting helpers ─────────────────────────────────────────────────

function formatResetTime(isoString: string | null): string {
  if (!isoString) return "Unknown";

  const resetDate = new Date(isoString);
  const now = Date.now();
  const diffMs = resetDate.getTime() - now;

  if (diffMs <= 0) return "Just reset";

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  const remainingMin = diffMin % 60;
  if (diffHours < 24) {
    return remainingMin > 0
      ? `${diffHours}h ${remainingMin}m`
      : `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  return remainingHours > 0
    ? `${diffDays}d ${remainingHours}h`
    : `${diffDays}d`;
}

function formatFetchedAt(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

// ── Progress bar component ──────────────────────────────────────────────────

function UsageProgressBar({
  utilization,
  color,
}: {
  utilization: number;
  color: string;
}) {
  const clamped = Math.min(Math.max(utilization, 0), 100);
  const isHigh = clamped >= 80;
  const barColor = isHigh ? "var(--color-red)" : color;

  return (
    <div
      className="h-2.5 rounded-full overflow-hidden w-full"
      style={{ backgroundColor: "var(--color-surface-1)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${clamped}%`,
          backgroundColor: barColor,
          minWidth: clamped > 0 ? "4px" : "0",
        }}
      />
    </div>
  );
}

// ── Usage window row ────────────────────────────────────────────────────────

function UsageWindowRow({
  label,
  window: w,
  color,
  icon: Icon,
}: {
  label: string;
  window: UsageWindow;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color }} />
          <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs font-mono font-semibold"
          style={{
            color: w.utilization >= 80 ? "var(--color-red)" : color,
          }}
        >
          {w.utilization.toFixed(0)}% used
        </span>
      </div>

      <UsageProgressBar utilization={w.utilization} color={color} />

      {w.resetsAt && (
        <div className="flex items-center gap-1.5 mt-2">
          <Clock size={11} style={{ color: "var(--color-overlay-1)" }} />
          <span className="text-[11px]" style={{ color: "var(--color-overlay-1)" }}>
            Resets in {formatResetTime(w.resetsAt)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Extra usage section ─────────────────────────────────────────────────────

function ExtraUsageSection({ extra }: { extra: ExtraUsageInfo }) {
  if (!extra.isEnabled) return null;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CreditCard size={14} style={{ color: "var(--color-yellow)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
            Extra usage
          </span>
        </div>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-yellow)" }}
        >
          ${extra.usedCredits.toFixed(2)} / ${extra.monthlyLimit.toFixed(0)}
        </span>
      </div>

      <UsageProgressBar utilization={extra.utilization} color="var(--color-yellow)" />

      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[11px]" style={{ color: "var(--color-overlay-1)" }}>
          {extra.utilization.toFixed(1)}% of monthly limit used
        </span>
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL_MS = 60_000;

export function PlanUsagePanel() {
  const planUsage = useUsageStore((s) => s.planUsage);
  const loading = useUsageStore((s) => s.planUsageLoading);
  const error = useUsageStore((s) => s.planUsageError);
  const fetchPlanUsage = useUsageStore((s) => s.fetchPlanUsage);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    fetchPlanUsage();
  }, [fetchPlanUsage]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, AUTO_REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh]);

  // ── Loading state ──
  if (loading && !planUsage) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Spinner size={18} style={{ color: "var(--color-blue)" }} />
        <span className="text-sm" style={{ color: "var(--color-subtext-0)" }}>
          Loading plan usage...
        </span>
      </div>
    );
  }

  // ── Error state ──
  if (error && !planUsage) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={24} style={{ color: "var(--color-red)" }} />
        <span className="text-sm" style={{ color: "var(--color-red)" }}>
          Failed to load plan usage
        </span>
        <span className="text-xs" style={{ color: "var(--color-overlay-1)" }}>
          {error}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  // ── Not an OAuth user ──
  if (planUsage && !planUsage.isOauthUser) {
    return (
      <div
        className="h-full overflow-y-auto"
        style={{ backgroundColor: "var(--color-base)" }}
      >
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-2 mb-6">
            <Gauge size={20} style={{ color: "var(--color-blue)" }} />
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Plan Usage Limits
            </h1>
          </div>

          <div
            className="rounded-lg p-6 text-center"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <AlertCircle
              size={32}
              className="mx-auto mb-3"
              style={{ color: "var(--color-overlay-1)" }}
            />
            <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
              Not available for API key users
            </p>
            <p className="text-xs" style={{ color: "var(--color-overlay-1)" }}>
              Plan usage limits are only available for Claude Pro/Team subscribers
              using OAuth authentication. If you have a subscription, sign in
              through the Claude CLI to enable this feature.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!planUsage) return null;

  // ── Main dashboard ──
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: "var(--color-base)" }}
    >
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge size={20} style={{ color: "var(--color-blue)" }} />
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Plan Usage Limits
            </h1>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-blue) 15%, transparent)",
                color: "var(--color-blue)",
              }}
            >
              Max (20x)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Last updated */}
            <span className="text-[11px]" style={{ color: "var(--color-overlay-1)" }}>
              Updated {formatFetchedAt(planUsage.fetchedAt)}
            </span>
            {/* Refresh button */}
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-subtext-0)",
                border: "1px solid var(--color-surface-1)",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? (
                <Spinner size={12} />
              ) : (
                <RefreshCw size={12} />
              )}
              Refresh
            </button>
          </div>
        </div>

        {/* Error banner (shown when there's an error but we still have stale data) */}
        {error && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-red) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-red) 30%, transparent)",
              color: "var(--color-red)",
            }}
          >
            <AlertCircle size={12} />
            Failed to refresh: {error}
          </div>
        )}

        {/* Current session (5-hour window) */}
        {planUsage.fiveHour && (
          <UsageWindowRow
            label="Current session"
            window={planUsage.fiveHour}
            color="var(--color-blue)"
            icon={Zap}
          />
        )}

        {/* Weekly limits */}
        <div>
          <h2
            className="text-xs font-medium mb-2 px-1"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Weekly limits
          </h2>
          <div className="space-y-3">
            {planUsage.sevenDay && (
              <UsageWindowRow
                label="All models"
                window={planUsage.sevenDay}
                color="var(--color-teal)"
                icon={Gauge}
              />
            )}
            {planUsage.sevenDayOpus && (
              <UsageWindowRow
                label="Opus only"
                window={planUsage.sevenDayOpus}
                color="var(--color-mauve)"
                icon={Gauge}
              />
            )}
          </div>
        </div>

        {/* Extra usage */}
        {planUsage.extraUsage && (
          <div>
            <h2
              className="text-xs font-medium mb-2 px-1"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Extra usage
            </h2>
            <ExtraUsageSection extra={planUsage.extraUsage} />
          </div>
        )}
      </div>
    </div>
  );
}
