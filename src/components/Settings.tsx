import { useSim } from "../store";
import type { Parameters } from "../simulation/types";
import { NumInput } from "./NumInput";

type Group = {
  title: string;
  blurb?: string;
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
      { key: "initial_num_cores", label: "Initial num_cores", step: 1, min: 1 },
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
      { key: "MIN_CORES", label: "MIN_CORES", step: 1, min: 1 },
      { key: "MAX_CORES", label: "MAX_CORES", step: 1, min: 1 },
    ],
  },
  {
    title: "Validator scaling & economics",
    blurb:
      "Active validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core). One round ≈ 28 days, so 'per validator' figures are monthly. Both reward lines are protocol-paid income to validators; the DOT/USD rate combines them for the Statistics tab.",
    fields: [
      { key: "val_per_core", label: "Validators per core", step: 1, min: 1, hint: "amendment proposes 5" },
      { key: "MIN_VALIDATORS", label: "MIN_VALIDATORS", step: 1, min: 1, hint: "security floor, independent of num_cores" },
      { key: "SYSTEM_CORES", label: "System cores", step: 1, min: 0, hint: "fixed cores outside the market; each still needs val_per_core validators" },
      { key: "REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR", label: "Reward for operational costs (USD / validator / month)", step: 10, min: 0, hint: "protocol-paid income to the validator; 0 during the current transition" },
      { key: "STAKE_INCENTIVES_DOT_PER_VALIDATOR", label: "Stake incentives (DOT / validator / month)", step: 1, min: 0 },
      { key: "DOT_USD_RATE", label: "DOT/USD rate (USD per 1 DOT)", step: 0.1, min: 0, hint: "with the reward lines, sets the per-core marginal cost = val_per_core × payout that gates expansion" },
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
        </div>
      ))}
    </div>
  );
}
