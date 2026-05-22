import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSim } from "../store";

const CHART_HEIGHT = 240;
const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 4 };
const GRID = { stroke: "#e2e8f0", strokeDasharray: "3 3" } as const;
const AXIS_TICK = { fontSize: 11 } as const;
const LEGEND_STYLE = { fontSize: 11 } as const;
const TOOLTIP_STYLE = { fontSize: 12 } as const;

export function Chart() {
  const history = useSim(s => s.history);
  const params = useSim(s => s.params);

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        No rounds run yet. Add bidders and submit a round to populate the charts.
      </div>
    );
  }

  const data = history.map(h => ({
    round: h.round,
    clearing_price: round2(h.clearing_price),
    reserve_price: round2(h.reserve_price),
    opening_price: round2(h.opening_price),
    supply: h.num_cores,
    demand: h.total_demand,
    renewed: h.renewals_count,
    new_sales: h.new_sales_count,
    consumption_pct: round2(h.consumption_rate * 100),
    rolling_avg_pct: round2(h.rolling_avg_consumption * 100),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Prices (DOT / core)" subtitle="Clearing vs reserve, with the opening-price ceiling.">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="round" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line
              type="monotone"
              dataKey="opening_price"
              name="Opening"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="reserve_price"
              name="Reserve"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
            <Line
              type="monotone"
              dataKey="clearing_price"
              name="Clearing"
              stroke="#e6007a"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Supply vs demand (cores)" subtitle="Demand line above the supply bar means excess demand.">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="round" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar
              dataKey="supply"
              name="Supply (num_cores)"
              fill="#e2e8f0"
              barSize={26}
            />
            <Line
              type="monotone"
              dataKey="demand"
              name="Demand"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Allocation breakdown (cores)" subtitle="Renewed (existing tenants) vs new sales.">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="round" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar
              dataKey="renewed"
              name="Renewed"
              stackId="alloc"
              fill="#f59e0b"
              barSize={26}
            />
            <Bar
              dataKey="new_sales"
              name="New sales"
              stackId="alloc"
              fill="#64748b"
              barSize={26}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Consumption rate (%)"
        subtitle={`Per-round + ${params.SCALE_DOWN_WINDOW}-round rolling average. Dashed lines: target and scale-up trigger.`}
      >
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={{ ...CHART_MARGIN, right: 56 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="round" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={[0, 110]} unit="%" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => `${v}%`}
            />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine
              y={params.TARGET_CONSUMPTION_RATE * 100}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: `target (${(params.TARGET_CONSUMPTION_RATE * 100).toFixed(0)}%)`,
                fontSize: 10,
                fill: "#a16207",
                position: "right",
              }}
            />
            <ReferenceLine
              y={params.POST_EXPANSION_CONSUMPTION * 100}
              stroke="#0ea5e9"
              strokeDasharray="4 4"
              label={{
                value: `post-expand (${(params.POST_EXPANSION_CONSUMPTION * 100).toFixed(0)}%)`,
                fontSize: 10,
                fill: "#0369a1",
                position: "right",
              }}
            />
            <ReferenceLine
              y={params.SCALE_UP_THRESHOLD * 100}
              stroke="#dc2626"
              strokeDasharray="4 4"
              label={{
                value: `scale-up (${(params.SCALE_UP_THRESHOLD * 100).toFixed(0)}%)`,
                fontSize: 10,
                fill: "#b91c1c",
                position: "right",
              }}
            />
            <Line
              type="monotone"
              dataKey="rolling_avg_pct"
              name={`Rolling avg (${params.SCALE_DOWN_WINDOW})`}
              stroke="#0ea5e9"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="consumption_pct"
              name="Consumption"
              stroke="#0f172a"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {subtitle && <p className="mb-2 text-xs text-slate-400">{subtitle}</p>}
      {children}
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
