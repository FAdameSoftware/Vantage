import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface ModelUsage {
  model: string;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  session_count: number;
}

interface ModelDistributionProps {
  data: ModelUsage[];
}

const COLORS = [
  "var(--color-blue)",
  "var(--color-green)",
  "var(--color-peach)",
  "var(--color-mauve)",
  "var(--color-teal)",
  "var(--color-pink)",
  "var(--color-yellow)",
  "var(--color-flamingo)",
];

function stripModelDate(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

export function ModelDistribution({ data }: ModelDistributionProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-xs"
        style={{ color: "var(--color-overlay-0)" }}
      >
        No model data available
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: stripModelDate(d.model),
    value: d.total_cost_usd,
    sessions: d.session_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          paddingAngle={2}
          label={({ name, percent }: { name?: string; percent?: number }) =>
            `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
          }
          labelLine={false}
        >
          {chartData.map((_entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`$${Number(value).toFixed(4)}`, "Cost"]}
          contentStyle={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
            borderRadius: "6px",
            color: "var(--color-text)",
            fontSize: "12px",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "11px", color: "var(--color-subtext-0)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
