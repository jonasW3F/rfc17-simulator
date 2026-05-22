import { useMemo, useState } from "react";
import { useSim } from "../store";
import type { Bidder, TenantInfo } from "../simulation/types";
import { NumInput } from "./NumInput";

export function ManualMode() {
  const stagedBidders = useSim(s => s.stagedBidders);
  const state = useSim(s => s.state);
  const params = useSim(s => s.params);
  const history = useSim(s => s.history);
  const addStagedBidder = useSim(s => s.addStagedBidder);
  const addStagedBidders = useSim(s => s.addStagedBidders);
  const updateStagedBidder = useSim(s => s.updateStagedBidder);
  const removeStagedBidder = useSim(s => s.removeStagedBidder);
  const clearStaged = useSim(s => s.clearStaged);
  const submitRound = useSim(s => s.submitRound);

  const opening = useMemo(
    () => Math.max(params.MIN_OPENING_PRICE, params.PRICE_MULTIPLIER * state.reserve_price),
    [params, state.reserve_price]
  );

  const totalDemand = stagedBidders.reduce((s, b) => s + (b.quantity || 0), 0);
  const tenantsCount = Object.keys(state.tenants).length;

  return (
    <div className="space-y-4">
      <RoundContext
        round={state.round}
        numCores={state.num_cores}
        reservePrice={state.reserve_price}
        openingPrice={opening}
        tenantsCount={tenantsCount}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SingleBidderForm onAdd={addStagedBidder} />
        <BulkBidderForm onAdd={addStagedBidders} />
      </div>

      <StagedList
        bidders={stagedBidders}
        onUpdate={updateStagedBidder}
        onRemove={removeStagedBidder}
        tenants={state.tenants}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <button
          onClick={clearStaged}
          disabled={stagedBidders.length === 0}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Remove all staged bidders, including auto-added tenants"
        >
          Clear stage
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Total demand: <span className="font-mono font-semibold">{totalDemand}</span> /{" "}
            <span className="font-mono">{state.num_cores}</span> cores
          </span>
          <button
            onClick={submitRound}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Submit round {state.round}
          </button>
        </div>
      </div>

      {history.length > 0 && <LastRoundSummary />}
    </div>
  );
}



function RoundContext(props: {
  round: number;
  numCores: number;
  reservePrice: number;
  openingPrice: number;
  tenantsCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
      <Metric label="Round" value={props.round} />
      <Metric label="num_cores" value={props.numCores} />
      <Metric label="reserve_price" value={`${fmt(props.reservePrice)} DOT`} />
      <Metric label="opening_price" value={`${fmt(props.openingPrice)} DOT`} />
      <Metric label="tenants" value={props.tenantsCount} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

function SingleBidderForm({ onAdd }: { onAdd: (b: Bidder) => void }) {
  const [id, setId] = useState("");
  const [wtp, setWtp] = useState(100);
  const [quantity, setQuantity] = useState(1);

  const submit = () => {
    if (!id.trim() || quantity <= 0 || wtp <= 0) return;
    onAdd({ id: id.trim(), wtp, quantity });
    setId("");
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Add a single bidder
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 col-span-3 md:col-span-1">
          <span className="text-xs text-slate-600">Bidder ID</span>
          <input
            type="text"
            value={id}
            onChange={e => setId(e.target.value)}
            placeholder="e.g. alice"
            onKeyDown={e => e.key === "Enter" && submit()}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">WTP (DOT)</span>
          <NumInput
            value={wtp}
            min={1}
            step={1}
            onChange={setWtp}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">Cores</span>
          <NumInput
            value={quantity}
            min={1}
            step={1}
            onChange={n => setQuantity(Math.round(n))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
      </div>
      <button
        onClick={submit}
        className="mt-3 w-full rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Add bidder
      </button>
    </div>
  );
}

function BulkBidderForm({ onAdd }: { onAdd: (bs: Bidder[]) => void }) {
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("bulk");
  const [wtpMin, setWtpMin] = useState(1500);
  const [wtpMax, setWtpMax] = useState(3500);
  const [qty, setQty] = useState(1);
  const [distribution, setDistribution] = useState<"uniform" | "linear">("uniform");

  const submit = () => {
    if (count <= 0) return;
    const bidders: Bidder[] = [];
    const ts = Date.now().toString(36);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const wtp =
        distribution === "uniform"
          ? wtpMin + Math.random() * (wtpMax - wtpMin)
          : wtpMin + t * (wtpMax - wtpMin);
      bidders.push({
        id: `${prefix}_${ts}_${i + 1}`,
        wtp: Math.round(wtp),
        quantity: qty,
      });
    }
    onAdd(bidders);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Bulk-add bidders
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">Count</span>
          <NumInput
            value={count}
            min={1}
            onChange={n => setCount(Math.round(n))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">ID prefix</span>
          <input
            type="text"
            value={prefix}
            onChange={e => setPrefix(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">WTP min</span>
          <NumInput
            value={wtpMin}
            onChange={setWtpMin}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">WTP max</span>
          <NumInput
            value={wtpMax}
            onChange={setWtpMax}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">Cores each</span>
          <NumInput
            value={qty}
            min={1}
            onChange={n => setQty(Math.round(n))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-600">Distribution</span>
          <select
            value={distribution}
            onChange={e => setDistribution(e.target.value as "uniform" | "linear")}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="uniform">Uniform random in [min, max]</option>
            <option value="linear">Evenly spaced from min to max</option>
          </select>
        </label>
      </div>
      <button
        onClick={submit}
        className="mt-3 w-full rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Add {count} bidders
      </button>
    </div>
  );
}

function StagedList(props: {
  bidders: ReturnType<typeof useSim.getState>["stagedBidders"];
  onUpdate: (uiKey: string, patch: Partial<Bidder>) => void;
  onRemove: (uiKey: string) => void;
  tenants: Record<string, TenantInfo>;
}) {
  if (props.bidders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No bidders staged yet. Add some above. After a round runs, current tenants are added back automatically.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Staged bidders ({props.bidders.length})
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Tenant?</th>
              <th className="px-4 py-2">WTP (DOT)</th>
              <th className="px-4 py-2">Cores</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {props.bidders.map(b => (
              <tr key={b.uiKey} className="border-t border-slate-100">
                <td className="px-4 py-1.5 font-mono">{b.id}</td>
                <td className="px-4 py-1.5">
                  {props.tenants[b.id] ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      yes ({props.tenants[b.id].cores})
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">no</span>
                  )}
                </td>
                <td className="px-4 py-1.5">
                  <NumInput
                    value={b.wtp}
                    onChange={n => props.onUpdate(b.uiKey, { wtp: n })}
                    className="w-24 rounded-md border border-slate-200 px-2 py-0.5 font-mono"
                  />
                </td>
                <td className="px-4 py-1.5">
                  <NumInput
                    value={b.quantity}
                    onChange={n => props.onUpdate(b.uiKey, { quantity: Math.round(n) })}
                    className="w-20 rounded-md border border-slate-200 px-2 py-0.5 font-mono"
                  />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <button
                    onClick={() => props.onRemove(b.uiKey)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LastRoundSummary() {
  const history = useSim(s => s.history);
  const last = history[history.length - 1];
  if (!last) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Last round outcome (round {last.round})
      </h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Clearing price" value={`${fmt(last.clearing_price)} DOT`} />
        <Metric label="Consumption" value={`${(last.consumption_rate * 100).toFixed(1)}%`} />
        <Metric
          label="Allocated"
          value={`${last.cores_sold} / ${last.num_cores}`}
        />
        <Metric
          label="New / renewed"
          value={`${last.new_sales_count} / ${last.renewals_count}`}
        />
        <Metric label="Revenue" value={`${fmt(last.revenue)} DOT`} />
        <Metric label="Next reserve" value={`${fmt(last.next_reserve_price)} DOT`} />
        <Metric label="Next num_cores" value={last.next_num_cores} />
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
