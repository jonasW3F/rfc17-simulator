import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSim } from "../store";

type SortKey = "id" | "totalPaid" | "totalCores" | "rounds" | "avgPrice";

export function Statistics() {
  const history = useSim(s => s.history);
  const params = useSim(s => s.params);
  const [sortKey, setSortKey] = useState<SortKey>("totalPaid");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const summary = useMemo(() => summarize(history), [history]);
  const economics = useMemo(() => computeEconomics(history, params), [history, params]);

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        No rounds run yet. Run a few to populate statistics.
      </div>
    );
  }

  const rows = [...summary.perBidder.values()].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "id":
        return a.id.localeCompare(b.id) * dir;
      case "totalPaid":
        return (a.totalPaid - b.totalPaid) * dir;
      case "totalCores":
        return (a.totalCores - b.totalCores) * dir;
      case "rounds":
        return (a.roundsWithCore - b.roundsWithCore) * dir;
      case "avgPrice":
        return (a.avgPrice - b.avgPrice) * dir;
    }
  });

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Market summary
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Rounds" value={history.length} />
          <Card label="Total revenue" value={`${fmt(summary.totalRevenue)} DOT`} />
          <Card label="Total cores sold" value={summary.totalCoresSold} />
          <Card label="Avg clearing price" value={`${fmt(summary.avgClearing)} DOT`} />
          <Card label="Avg consumption" value={`${(summary.avgConsumption * 100).toFixed(1)}%`} />
          <Card label="Avg cores / round" value={fmt(summary.avgCoresSold)} />
          <Card label="Avg supply (num_cores)" value={fmt(summary.avgSupply)} />
          <Card label="Unique bidders" value={summary.perBidder.size} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Validator economics
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Active validators = max({params.MIN_VALIDATORS}, num_cores ×{" "}
          {params.val_per_core}). One round ≈ one month. Per-validator costs come from Settings.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Avg active validators" value={fmt(economics.avgValidators)} />
          <Card label="Total stake incentives" value={`${fmt(economics.totalIncentivesDot)} DOT`} />
          <Card label="Total operational cost" value={`$${fmt(economics.totalOpsUsd)}`} />
          <Card label="Total revenue (USD-eq.)" value={`$${fmt(economics.totalRevenueUsd)}`} />
          <Card
            label="Protocol net (DOT)"
            value={`${fmt(economics.protocolNetDot)} DOT`}
            tone={economics.protocolNetDot >= 0 ? "good" : "bad"}
          />
          <Card
            label="Protocol net (USD-eq.)"
            value={`$${fmt(economics.protocolNetUsd)}`}
            tone={economics.protocolNetUsd >= 0 ? "good" : "bad"}
          />
          <Card
            label="Validator P&L per val. (USD/mo, avg)"
            value={`$${fmt(economics.avgValidatorNetUsdPerMonth)}`}
            tone={economics.avgValidatorNetUsdPerMonth >= 0 ? "good" : "bad"}
          />
          <Card
            label="Break-even clearing"
            value={`${fmt(economics.breakEvenClearing)} DOT / core`}
            hint="approximate, based on last round's supply"
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Revenue vs. validator stake incentives (DOT per round)
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={economics.perRound}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="round" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="incentives_dot" name="Stake incentives" fill="#fca5a5" barSize={18} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#e6007a"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
              <Line
                type="monotone"
                dataKey="net_dot"
                name="Net (revenue − incentives)"
                stroke="#0f172a"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Per-bidder ledger
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[28rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <Th onClick={() => toggleSort("id")} active={sortKey === "id"} dir={sortDir}>Bidder</Th>
                  <Th onClick={() => toggleSort("totalCores")} active={sortKey === "totalCores"} dir={sortDir}>Total cores</Th>
                  <Th onClick={() => toggleSort("rounds")} active={sortKey === "rounds"} dir={sortDir}>Rounds w/ core</Th>
                  <Th onClick={() => toggleSort("totalPaid")} active={sortKey === "totalPaid"} dir={sortDir}>Total paid</Th>
                  <Th onClick={() => toggleSort("avgPrice")} active={sortKey === "avgPrice"} dir={sortDir}>Avg price / core</Th>
                  <th className="px-4 py-2">Renewals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-1.5 font-mono">{r.id}</td>
                    <td className="px-4 py-1.5 font-mono">{r.totalCores}</td>
                    <td className="px-4 py-1.5 font-mono">{r.roundsWithCore}</td>
                    <td className="px-4 py-1.5 font-mono">{fmt(r.totalPaid)}</td>
                    <td className="px-4 py-1.5 font-mono">{fmt(r.avgPrice)}</td>
                    <td className="px-4 py-1.5 font-mono">{r.renewalRounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Round-by-round log
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="max-h-[28rem] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Round</th>
                  <th className="px-4 py-2">Supply</th>
                  <th className="px-4 py-2">Demand</th>
                  <th className="px-4 py-2">Sold</th>
                  <th className="px-4 py-2">Clearing</th>
                  <th className="px-4 py-2">Reserve</th>
                  <th className="px-4 py-2">Revenue (DOT)</th>
                  <th className="px-4 py-2">Validators</th>
                  <th className="px-4 py-2">Incentives (DOT)</th>
                  <th className="px-4 py-2">Net (DOT)</th>
                </tr>
              </thead>
              <tbody>
                {economics.perRound.map(r => (
                  <tr key={r.round} className="border-t border-slate-100">
                    <td className="px-4 py-1.5 font-mono">{r.round}</td>
                    <td className="px-4 py-1.5 font-mono">{r.supply}</td>
                    <td className="px-4 py-1.5 font-mono">{r.demand}</td>
                    <td className="px-4 py-1.5 font-mono">{r.sold}</td>
                    <td className="px-4 py-1.5 font-mono">{fmt(r.clearing)}</td>
                    <td className="px-4 py-1.5 font-mono">{fmt(r.reserve)}</td>
                    <td className="px-4 py-1.5 font-mono">{fmt(r.revenue)}</td>
                    <td className="px-4 py-1.5 font-mono">{r.validators}</td>
                    <td className="px-4 py-1.5 font-mono">{fmt(r.incentives_dot)}</td>
                    <td
                      className={
                        "px-4 py-1.5 font-mono " +
                        (r.net_dot >= 0 ? "text-emerald-700" : "text-rose-700")
                      }
                    >
                      {fmt(r.net_dot)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-ink";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-mono text-lg font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none px-4 py-2 hover:bg-slate-100"
    >
      {children}
      {active && <span className="ml-1 text-slate-400">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

interface BidderRow {
  id: string;
  totalPaid: number;
  totalCores: number;
  roundsWithCore: number;
  renewalRounds: number;
  avgPrice: number;
}

function summarize(history: ReturnType<typeof useSim.getState>["history"]) {
  const perBidder = new Map<string, BidderRow>();
  let totalRevenue = 0;
  let totalCoresSold = 0;
  let clearingSum = 0;
  let consumptionSum = 0;
  let supplySum = 0;

  for (const h of history) {
    totalRevenue += h.revenue;
    totalCoresSold += h.cores_sold;
    clearingSum += h.clearing_price;
    consumptionSum += h.consumption_rate;
    supplySum += h.num_cores;
    const seenThisRound = new Set<string>();
    for (const a of h.allocations) {
      let row = perBidder.get(a.bidderId);
      if (!row) {
        row = {
          id: a.bidderId,
          totalPaid: 0,
          totalCores: 0,
          roundsWithCore: 0,
          renewalRounds: 0,
          avgPrice: 0,
        };
        perBidder.set(a.bidderId, row);
      }
      row.totalPaid += a.totalPaid;
      row.totalCores += a.cores;
      if (!seenThisRound.has(a.bidderId)) {
        row.roundsWithCore += 1;
        seenThisRound.add(a.bidderId);
      }
      if (a.isRenewer) row.renewalRounds += 1;
    }
  }

  for (const row of perBidder.values()) {
    row.avgPrice = row.totalCores > 0 ? row.totalPaid / row.totalCores : 0;
  }

  return {
    totalRevenue,
    totalCoresSold,
    avgClearing: history.length > 0 ? clearingSum / history.length : 0,
    avgConsumption: history.length > 0 ? consumptionSum / history.length : 0,
    avgCoresSold: history.length > 0 ? totalCoresSold / history.length : 0,
    avgSupply: history.length > 0 ? supplySum / history.length : 0,
    perBidder,
  };
}

function computeEconomics(
  history: ReturnType<typeof useSim.getState>["history"],
  params: ReturnType<typeof useSim.getState>["params"]
) {
  const perRound = history.map(h => {
    const validators = h.active_validators;
    const incentives_dot = validators * params.STAKE_INCENTIVES_DOT_PER_VALIDATOR;
    const ops_usd = validators * params.OPERATIONAL_COST_USD_PER_VALIDATOR;
    const revenue_usd = h.revenue * params.DOT_USD_RATE;
    const net_dot = h.revenue - incentives_dot;
    const net_usd = revenue_usd - ops_usd - incentives_dot * params.DOT_USD_RATE;
    return {
      round: h.round,
      supply: h.num_cores,
      demand: h.total_demand,
      sold: h.cores_sold,
      clearing: h.clearing_price,
      reserve: h.reserve_price,
      revenue: h.revenue,
      validators,
      incentives_dot: round2(incentives_dot),
      ops_usd: round2(ops_usd),
      revenue_usd: round2(revenue_usd),
      net_dot: round2(net_dot),
      net_usd: round2(net_usd),
    };
  });

  const totals = perRound.reduce(
    (acc, r) => {
      acc.validators += r.validators;
      acc.incentives_dot += r.incentives_dot;
      acc.ops_usd += r.ops_usd;
      acc.revenue += r.revenue;
      acc.revenue_usd += r.revenue_usd;
      return acc;
    },
    { validators: 0, incentives_dot: 0, ops_usd: 0, revenue: 0, revenue_usd: 0 }
  );

  const n = Math.max(history.length, 1);
  const avgValidators = totals.validators / n;
  const protocolNetDot = totals.revenue - totals.incentives_dot;
  const protocolNetUsd =
    totals.revenue_usd - totals.ops_usd - totals.incentives_dot * params.DOT_USD_RATE;

  // Per-validator monthly P&L in USD, averaged across the run:
  // income = STAKE_INCENTIVES * DOT_USD_RATE; cost = OPERATIONAL_COST.
  const avgValidatorNetUsdPerMonth =
    params.STAKE_INCENTIVES_DOT_PER_VALIDATOR * params.DOT_USD_RATE -
    params.OPERATIONAL_COST_USD_PER_VALIDATOR;

  // Break-even clearing: at the last round's supply, the per-core clearing
  // price (in DOT) where revenue (supply × clearing) equals incentives paid.
  const lastSupply = history.at(-1)?.num_cores ?? params.initial_num_cores;
  const lastValidators = history.at(-1)?.active_validators ?? params.MIN_VALIDATORS;
  const breakEvenClearing =
    lastSupply > 0
      ? (lastValidators * params.STAKE_INCENTIVES_DOT_PER_VALIDATOR) / lastSupply
      : 0;

  return {
    perRound,
    avgValidators,
    totalIncentivesDot: totals.incentives_dot,
    totalOpsUsd: totals.ops_usd,
    totalRevenueUsd: totals.revenue_usd,
    protocolNetDot,
    protocolNetUsd,
    avgValidatorNetUsdPerMonth,
    breakEvenClearing,
  };
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
