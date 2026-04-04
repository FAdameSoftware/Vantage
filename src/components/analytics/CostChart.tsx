import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface CostChartProps {
  data: Array<{ date: string; total_cost_usd: number; session_count: number }>;
}

export function CostChart({ data }: CostChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-xs"
        style={{ color: "var(--color-overlay-0)" }}
      >
        No cost data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-surface-1)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--color-subtext-0)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-surface-1)" }}
        />
        <YAxis
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          tick={{ fontSize: 11, fill: "var(--color-subtext-0)" }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`$${Number(value).toFixed(4)}`, "Cost"]}
          labelFormatter={(label) => `Date: ${String(label)}`}
          contentStyle={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
            borderRadius: "6px",
            color: "var(--color-text)",
            fontSize: "12px",
          }}
        />
        <Bar
          dataKey="total_cost_usd"
          fill="var(--color-blue)"
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
