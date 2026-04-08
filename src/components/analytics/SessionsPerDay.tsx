import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface SessionsPerDayProps {
  data: Array<{ date: string; session_count: number }>;
}

export function SessionsPerDay({ data }: SessionsPerDayProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-xs"
        style={{ color: "var(--color-overlay-0)" }}
      >
        No session data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--color-subtext-0)" }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          formatter={(value: number) => [value, "Sessions"]}
          labelFormatter={(label) => `Date: ${String(label)}`}
          contentStyle={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
            borderRadius: "6px",
            color: "var(--color-text)",
            fontSize: "12px",
          }}
        />
        <Line
          type="monotone"
          dataKey="session_count"
          stroke="var(--color-green)"
          strokeWidth={2}
          dot={{ fill: "var(--color-green)", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
