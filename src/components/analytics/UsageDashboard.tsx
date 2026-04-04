import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CostChart } from "./CostChart";
import { ModelDistribution } from "./ModelDistribution";
import { SessionsPerDay } from "./SessionsPerDay";
import {
  DollarSign,
  Activity,
  BarChart3,
  Zap,
  Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────

interface DailyCost {
  date: string;
  total_cost_usd: number;
  session_count: number;
}

interface ModelUsage {
  model: string;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  session_count: number;
}

interface AnalyticsSummary {
  daily_costs: DailyCost[];
  model_usage: ModelUsage[];
  total_cost_usd: number;
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_cost_per_session: number;
  date_range_start: string | null;
  date_range_end: string | null;
}

// ── Date range options ────────────────────────────────────────────────

type DateRange = "7" | "30" | "0";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "7", label: "Last 7d" },
  { value: "30", label: "Last 30d" },
  { value: "0", label: "All time" },
];

// ── Stat card ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-blue) 15%, transparent)",
        }}
      >
        <Icon size={16} style={{ color: "var(--color-blue)" }} />
      </div>
      <div>
        <div
          className="text-xs"
          style={{ color: "var(--color-subtext-0)" }}
        >
          {label}
        </div>
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────

export function UsageDashboard() {
  const [range, setRange] = useState<DateRange>("30");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<AnalyticsSummary>("get_analytics", {
          days: parseInt(range, 10),
        });
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Loader2
          size={18}
          className="animate-spin"
          style={{ color: "var(--color-blue)" }}
        />
        <span className="text-sm" style={{ color: "var(--color-subtext-0)" }}>
          Loading analytics...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm" style={{ color: "var(--color-red)" }}>
          Failed to load analytics: {error}
        </span>
      </div>
    );
  }

  if (!data) return null;

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: "var(--color-base)" }}
    >
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} style={{ color: "var(--color-blue)" }} />
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Usage Analytics
            </h1>
          </div>

          {/* Date range selector */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--color-surface-1)" }}
          >
            {DATE_RANGES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    range === value
                      ? "var(--color-blue)"
                      : "var(--color-surface-0)",
                  color:
                    range === value
                      ? "#ffffff"
                      : "var(--color-subtext-0)",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={() => setRange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats cards row */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Total Cost"
            value={`$${data.total_cost_usd.toFixed(2)}`}
            icon={DollarSign}
          />
          <StatCard
            label="Total Sessions"
            value={String(data.total_sessions)}
            icon={BarChart3}
          />
          <StatCard
            label="Avg Cost / Session"
            value={`$${data.avg_cost_per_session.toFixed(4)}`}
            icon={Zap}
          />
          <StatCard
            label="Total Tokens"
            value={formatTokens(data.total_input_tokens + data.total_output_tokens)}
            icon={Activity}
          />
        </div>

        {/* Daily cost chart */}
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <h2
            className="text-sm font-medium mb-3"
            style={{ color: "var(--color-text)" }}
          >
            Daily Cost
          </h2>
          <CostChart data={data.daily_costs} />
        </div>

        {/* Bottom row: Model distribution + Sessions per day */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <h2
              className="text-sm font-medium mb-3"
              style={{ color: "var(--color-text)" }}
            >
              Cost by Model
            </h2>
            <ModelDistribution data={data.model_usage} />
          </div>

          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <h2
              className="text-sm font-medium mb-3"
              style={{ color: "var(--color-text)" }}
            >
              Sessions per Day
            </h2>
            <SessionsPerDay data={data.daily_costs} />
          </div>
        </div>
      </div>
    </div>
  );
}
