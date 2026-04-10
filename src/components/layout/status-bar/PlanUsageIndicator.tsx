import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gauge, Clock, CreditCard, AlertCircle, RefreshCw, Zap } from "lucide-react";
import { useUsageStore } from "@/stores/usage";
import type { UsageWindow, ExtraUsageInfo } from "@/stores/usage";
import { Spinner } from "@/components/ui/Spinner";
import { popupMotion } from "./shared";

// ── Time formatting helpers ─────────────────────────────────────────────────

function formatResetTime(isoString: string | null): string {
  if (!isoString) return "Unknown";

  const resetDate = new Date(isoString);
  const now = Date.now();
  const diffMs = resetDate.getTime() - now;

  if (diffMs <= 0) return "Just reset";

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m`;

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

// ── Mini progress bar for the status bar ────────────────────────────────────

function MiniProgressBar({ utilization }: { utilization: number }) {
  const clamped = Math.min(Math.max(utilization, 0), 100);
  const isHigh = clamped >= 80;
  const barColor = isHigh ? "var(--color-red)" : "var(--color-blue)";

  return (
    <div
      className="h-[6px] rounded-full overflow-hidden"
      style={{
        backgroundColor: "var(--color-surface-1)",
        width: 40,
      }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${clamped}%`,
          backgroundColor: barColor,
          minWidth: clamped > 0 ? "2px" : "0",
        }}
      />
    </div>
  );
}

// ── Popover usage window row ────────────────────────────────────────────────

function PopoverWindowRow({
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
  const clamped = Math.min(Math.max(w.utilization, 0), 100);
  const isHigh = clamped >= 80;
  const barColor = isHigh ? "var(--color-red)" : color;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon size={12} style={{ color }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--color-text)" }}>
            {label}
          </span>
        </div>
        <span
          className="text-[11px] font-mono font-semibold"
          style={{ color: isHigh ? "var(--color-red)" : color }}
        >
          {w.utilization.toFixed(0)}%
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--color-surface-1)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${clamped}%`,
            backgroundColor: barColor,
            minWidth: clamped > 0 ? "3px" : "0",
          }}
        />
      </div>
      {w.resetsAt && (
        <div className="flex items-center gap-1">
          <Clock size={10} style={{ color: "var(--color-overlay-1)" }} />
          <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
            Resets in {formatResetTime(w.resetsAt)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Extra usage row ─────────────────────────────────────────────────────────

function PopoverExtraUsage({ extra }: { extra: ExtraUsageInfo }) {
  if (!extra.isEnabled) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CreditCard size={12} style={{ color: "var(--color-yellow)" }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--color-text)" }}>
            Extra usage
          </span>
        </div>
        <span
          className="text-[11px] font-mono"
          style={{ color: "var(--color-yellow)" }}
        >
          ${extra.usedCredits.toFixed(2)} / ${extra.monthlyLimit.toFixed(0)}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--color-surface-1)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(extra.utilization, 100)}%`,
            backgroundColor: "var(--color-yellow)",
            minWidth: extra.utilization > 0 ? "3px" : "0",
          }}
        />
      </div>
    </div>
  );
}

// ── Popover content ─────────────────────────────────────────────────────────

function PlanUsagePopover({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  const planUsage = useUsageStore((s) => s.planUsage);

  if (!planUsage) return null;

  if (!planUsage.isOauthUser) {
    return (
      <div className="flex flex-col items-center gap-2 p-3">
        <AlertCircle size={16} style={{ color: "var(--color-overlay-1)" }} />
        <p className="text-[11px] text-center" style={{ color: "var(--color-overlay-1)" }}>
          Plan usage requires OAuth login (Pro/Team).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 min-w-[260px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge size={13} style={{ color: "var(--color-blue)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
            Plan Usage
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
          style={{
            backgroundColor: "var(--color-surface-1)",
            color: "var(--color-subtext-0)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? <Spinner size={10} /> : <RefreshCw size={10} />}
          Refresh
        </button>
      </div>

      {/* 5-hour window */}
      {planUsage.fiveHour && (
        <PopoverWindowRow
          label="5-hour window"
          window={planUsage.fiveHour}
          color="var(--color-blue)"
          icon={Zap}
        />
      )}

      {/* Weekly limits */}
      {planUsage.sevenDay && (
        <PopoverWindowRow
          label="Weekly (all models)"
          window={planUsage.sevenDay}
          color="var(--color-teal)"
          icon={Gauge}
        />
      )}

      {planUsage.sevenDayOpus && (
        <PopoverWindowRow
          label="Weekly (Opus)"
          window={planUsage.sevenDayOpus}
          color="var(--color-mauve)"
          icon={Gauge}
        />
      )}

      {/* Extra usage */}
      {planUsage.extraUsage && (
        <PopoverExtraUsage extra={planUsage.extraUsage} />
      )}
    </div>
  );
}

// ── Auto-refresh interval ───────────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL_MS = 60_000;

// ── Main status bar indicator ───────────────────────────────────────────────

export function PlanUsageIndicator({ windowWidth }: { windowWidth: number }) {
  const planUsage = useUsageStore((s) => s.planUsage);
  const loading = useUsageStore((s) => s.planUsageLoading);
  const fetchPlanUsage = useUsageStore((s) => s.fetchPlanUsage);

  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
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

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPopover]);

  // Hide below 900px
  if (windowWidth < 900) return null;

  const fiveHourUtil = planUsage?.fiveHour?.utilization ?? 0;
  const isOauth = planUsage?.isOauthUser ?? false;
  const isHigh = fiveHourUtil >= 80;

  return (
    <div ref={popoverRef} className="relative shrink-0">
      <button
        className="flex items-center gap-1.5 hover:text-[var(--color-text)] transition-colors"
        onClick={() => setShowPopover((v) => !v)}
        title={
          isOauth
            ? `Plan: ${fiveHourUtil.toFixed(0)}% of 5h window used`
            : "Plan Usage"
        }
      >
        <Gauge
          size={11}
          style={{
            color: !isOauth
              ? "var(--color-overlay-1)"
              : isHigh
                ? "var(--color-red)"
                : "var(--color-blue)",
          }}
        />
        {isOauth && planUsage?.fiveHour && (
          <>
            <MiniProgressBar utilization={fiveHourUtil} />
            <span
              className="text-[10px]"
              style={{
                color: isHigh ? "var(--color-red)" : "var(--color-subtext-0)",
              }}
            >
              Plan: {fiveHourUtil.toFixed(0)}%
            </span>
          </>
        )}
      </button>

      <AnimatePresence>
        {showPopover && (
          <motion.div
            className="absolute bottom-7 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-lg"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
            {...popupMotion}
          >
            <PlanUsagePopover onRefresh={refresh} loading={loading} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
