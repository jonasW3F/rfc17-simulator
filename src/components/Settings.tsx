import { useSim } from "../store";
import type { Parameters } from "../simulation/types";
import { NumInput } from "./NumInput";
import { minMarketCores, minTotalCores } from "../simulation/cores";

type Group = {
  title: string;
  blurb?: string;
  /** Read-only values derived from the parameters, shown under the fields. */
  derived?: (p: Parameters) => string[];
  fields: Array<{
    key: keyof Parameters;
    label: string;
    step?: number;
    min?: number;
    max?: number;
    hint?: string;
  }>;
};

const GROUPS: Group[] = [
  {
    title: "Initial state",
    blurb: "Starting conditions for the first round. Editable while history is empty.",
    fields: [
      { key: "initial_num_cores", label: "Initial num_cores (market cores)", step: 1, min: 0, hint: "the floor is MIN_VALIDATORS / val_per_core − SYSTEM_CORES" },
      { key: "initial_reserve_price", label: "Initial reserve_price (DOT)", step: 1, min: 0 },
    ],
  },
  {
    title: "Price rule (RFC-17)",
    fields: [
      { key: "K", label: "K (sensitivity)", step: 0.1, min: 0, hint: "spec: 2–3" },
      { key: "TARGET_CONSUMPTION_RATE", label: "Target consumption rate", step: 0.01, min: 0, max: 1, hint: "amendment moves RFC-17's 0.9 → 0.8 to leave price-signal headroom" },
      { key: "P_MIN", label: "P_MIN (DOT floor)", step: 1, min: 0 },
      { key: "MIN_INCREMENT", label: "MIN_INCREMENT (DOT)", step: 1, min: 0 },
      { key: "MIN_OPENING_PRICE", label: "MIN_OPENING_PRICE (DOT)", step: 1, min: 0 },
      { key: "PRICE_MULTIPLIER", label: "PRICE_MULTIPLIER", step: 0.1, min: 0 },
    ],
  },
  {
    title: "Supply rule (amendment)",
    blurb:
      "Asymmetric: a single 100% round triggers a bounded expansion; contraction is sized so the rolling-window average sold equals the target consumption of the new supply.",
    fields: [
      { key: "SCALE_UP_THRESHOLD", label: "Scale-up threshold", step: 0.01, min: 0, max: 1, hint: "consumption that fires expansion" },
      { key: "POST_EXPANSION_CONSUMPTION", label: "Post-expansion consumption", step: 0.01, min: 0, max: 1, hint: "expansion sizes supply to land here; set above target for price-signal headroom" },
      { key: "SCALE_DOWN_WINDOW", label: "Scale-down window (rounds)", step: 1, min: 1, hint: "memory length for contraction" },
      { key: "MAX_CORES", label: "MAX_CORES (market cores)", step: 1, min: 1, hint: "the floor is derived, see Validator scaling" },
    ],
  },
  {
    title: "Validator scaling & budget",
    blurb:
      "num_cores is the market offer. System cores are outside it: never sold, not counted in consumption, but served by validators: active validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core). MIN_VALIDATORS are run at any price; after the system cores are assigned, the cores they serve set the market floor. One round ≈ one month. Each validator is paid a self-stake incentive in DOT plus a dotUSD salary minted by the DAP against its own DOT; the DOT committed per validator × val_per_core is the per-core marginal cost that gates expansion.",
    derived: p => [
      `Cores the validator floor serves = ceil(MIN_VALIDATORS / val_per_core) = ceil(${p.MIN_VALIDATORS} / ${p.val_per_core}) = ${minTotalCores(p)}`,
      `Market floor = ${minTotalCores(p)} − SYSTEM_CORES ${p.SYSTEM_CORES} = ${minMarketCores(p)} market cores`,
      `At the ceiling: ${p.MAX_CORES} market + ${p.SYSTEM_CORES} system = ${p.MAX_CORES + p.SYSTEM_CORES} cores → ${Math.max(p.MIN_VALIDATORS, (p.MAX_CORES + p.SYSTEM_CORES) * p.val_per_core)} validators`,
      `Consumption = cores_sold / num_cores (system cores excluded)`,
    ],
    fields: [
      { key: "val_per_core", label: "Validators per core", step: 1, min: 1, hint: "amendment proposes 5" },
      { key: "MIN_VALIDATORS", label: "MIN_VALIDATORS", step: 1, min: 1, hint: "consensus minimum, run at any price; sets the core floor" },
      { key: "SYSTEM_CORES", label: "System cores", step: 1, min: 0, hint: "outside the market: never sold, not in consumption; need validators" },
      { key: "SELF_STAKE_YIELD", label: "Self-stake yield at T (per year)", step: 0.01, min: 0, hint: "budget guarantees this yield on a self-stake of T; 0.30 = 30%" },
      { key: "SELF_STAKE_T_DOT", label: "Self-stake threshold T (DOT)", step: 1000, min: 0, hint: "yield × T / 12 = DOT incentive per validator per month" },
      { key: "SALARY_USD_PER_VALIDATOR", label: "Salary (dotUSD / validator / month)", step: 100, min: 0, hint: "minted by the DAP; budget doc tests $2,000–3,000" },
      { key: "COLLATERAL_RATIO", label: "Collateral ratio", step: 0.1, min: 0, hint: "DOT locked per $1 minted; 2.0 = 200%" },
      { key: "DOT_USD_RATE", label: "DOT/USD rate (USD per 1 DOT)", step: 0.05, min: 0, hint: "converts the salary to DOT; a lower price raises the gate threshold" },
    ],
  },
];

export function Settings() {
  const params = useSim(s => s.params);
  const updateParam = useSim(s => s.updateParam);
  const resetParams = useSim(s => s.resetParams);
  const historyLen = useSim(s => s.history.length);
  const resetSimulation = useSim(s => s.resetSimulation);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-2">
          Defaults are taken from <code className="font-mono text-xs">resources/rfc17.md</code> and the amendment.
          Changes apply to the next round. Initial-state fields only affect rounds before any history exists —
          {historyLen > 0 ? " reset the simulation to re-apply them." : " edit freely."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={resetParams}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Reset parameters
          </button>
          <button
            onClick={resetSimulation}
            className="rounded-md border border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/50 px-3 py-1.5 text-sm text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40"
          >
            Reset simulation
          </button>
        </div>
      </div>

      {GROUPS.map(group => (
        <div key={group.title} className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-fg-2">
            {group.title}
          </h3>
          {group.blurb && <p className="mb-3 text-xs text-fg-2">{group.blurb}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {group.fields.map(f => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-fg-2">
                  {f.label}
                  {f.hint && <span className="ml-1 text-muted">({f.hint})</span>}
                </span>
                <NumInput
                  step={f.step ?? 1}
                  min={f.min}
                  max={f.max}
                  value={params[f.key]}
                  onChange={v => updateParam(f.key, v as never)}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-sm font-mono focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
            ))}
          </div>
          {group.derived && (
            <ul className="mt-3 space-y-0.5 text-xs font-mono text-fg-2">
              {group.derived(params).map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
