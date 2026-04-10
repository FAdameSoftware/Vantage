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
  Database,
  BookOpen,
  Layers,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

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
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

interface AnalyticsSummary {
  daily_costs: DailyCost[];
  model_usage: ModelUsage[];
  total_cost_usd: number;
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
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
        <Spinner size={18} style={{ color: "var(--color-blue)" }} />
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

        {/* Stats cards — wraps in narrow containers (e.g. sidebar) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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

        {/* Cache token metrics — shown when cache data is present */}
        {(data.total_cache_creation_tokens > 0 || data.total_cache_read_tokens > 0) && (
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <h2
              className="text-sm font-medium mb-3 flex items-center gap-2"
              style={{ color: "var(--color-text)" }}
            >
              <Database size={14} style={{ color: "var(--color-teal)" }} />
              Cache Token Metrics
              <span className="text-[10px] font-normal" style={{ color: "var(--color-overlay-1)" }}>
                (API-sourced)
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-subtext-0)" }}>
                  <Activity size={11} style={{ color: "var(--color-blue)" }} />
                  Regular Input
                </div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  {formatTokens(
                    data.total_input_tokens -
                      data.total_cache_creation_tokens -
                      data.total_cache_read_tokens,
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-subtext-0)" }}>
                  <Layers size={11} style={{ color: "var(--color-peach)" }} />
                  Cache Write
                </div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  {formatTokens(data.total_cache_creation_tokens)}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-subtext-0)" }}>
                  <BookOpen size={11} style={{ color: "var(--color-teal)" }} />
                  Cache Read
                </div>
                <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  {formatTokens(data.total_cache_read_tokens)}
                </div>
              </div>
            </div>
            {data.total_cache_read_tokens > 0 && data.total_input_tokens > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--color-subtext-0)" }}>Cache hit rate</span>
                  <span style={{ color: "var(--color-teal)" }}>
                    {((data.total_cache_read_tokens / data.total_input_tokens) * 100).toFixed(1)}%
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--color-surface-1)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((data.total_cache_read_tokens / data.total_input_tokens) * 100, 100)}%`,
                      backgroundColor: "var(--color-teal)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

        {/* Per-model cost breakdown table */}
        {data.model_usage.length > 0 && (
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            <h2
              className="text-sm font-medium mb-3 flex items-center gap-2"
              style={{ color: "var(--color-text)" }}
            >
              <Zap size={14} style={{ color: "var(--color-blue)" }} />
              Per-Model Cost Breakdown
              <span className="text-[10px] font-normal" style={{ color: "var(--color-overlay-1)" }}>
                (API-sourced)
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--color-surface-1)",
                    }}
                  >
                    <th className="text-left py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Model</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Cost</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Input</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Output</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Cache Write</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Cache Read</th>
                    <th className="text-right py-2 px-2 font-medium" style={{ color: "var(--color-subtext-0)" }}>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.model_usage.map((m) => (
                    <tr
                      key={m.model}
                      style={{
                        borderBottom: "1px solid var(--color-surface-1)",
                      }}
                    >
                      <td className="py-2 px-2 font-mono" style={{ color: "var(--color-text)" }}>
                        {m.model.replace(/-\d{8}$/, "")}
                      </td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--color-yellow)" }}>
                        ${m.total_cost_usd.toFixed(4)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--color-text)" }}>
                        {formatTokens(m.input_tokens)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--color-text)" }}>
                        {formatTokens(m.output_tokens)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--color-peach)" }}>
                        {m.cache_creation_tokens > 0 ? formatTokens(m.cache_creation_tokens) : "-"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: "var(--color-teal)" }}>
                        {m.cache_read_tokens > 0 ? formatTokens(m.cache_read_tokens) : "-"}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "var(--color-text)" }}>
                        {m.session_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
