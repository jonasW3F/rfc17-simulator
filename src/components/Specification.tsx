import { useSim } from "../store";
import type { Parameters } from "../simulation/types";

export function Specification() {
  const p = useSim(s => s.params);

  return (
    <div className="space-y-6">
      <Intro />

      <Section title="1. In-round price discovery (Dutch auction)">
        <Formula
          lines={[
            `opening_price = max(MIN_OPENING_PRICE, PRICE_MULTIPLIER × reserve_price)`,
            `              = max(${p.MIN_OPENING_PRICE}, ${p.PRICE_MULTIPLIER} × reserve_price)`,
          ]}
        />
        <Note>
          Each bid <code className="font-mono text-xs">(wtp, quantity)</code> is
          expanded into <span className="font-mono text-xs">quantity</span>{" "}
          unit-bids whose effective price is{" "}
          <code className="font-mono text-xs">min(wtp, opening_price)</code>.
          Unit-bids are sorted descending by effective price (ties broken by
          larger original quantity).
        </Note>
        <Formula
          lines={[
            `if total_demand ≤ num_cores:`,
            `    clearing_price = reserve_price`,
            `    winners        = all unit-bids with effective_wtp ≥ reserve_price`,
            `else:`,
            `    marginal       = unit_bids[num_cores - 1].effective_wtp`,
            `    clearing_price = max(reserve_price, marginal)`,
            `    winners        = top num_cores unit-bids`,
          ]}
        />
        <Note>
          All winners pay <code className="font-mono text-xs">clearing_price</code>.
        </Note>
      </Section>

      <Section title="2. Reserve-price adjustment (between rounds)">
        <Formula
          lines={[
            `price_candidate = reserve_price × exp(K × (consumption_rate − TARGET_CONSUMPTION_RATE))`,
            `                = reserve_price × exp(${p.K} × (consumption_rate − ${p.TARGET_CONSUMPTION_RATE}))`,
            ``,
            `price_candidate = max(price_candidate, P_MIN)`,
            `                = max(price_candidate, ${p.P_MIN})`,
            ``,
            `if consumption_rate ≥ 1.0 and (price_candidate − reserve_price) < MIN_INCREMENT:`,
            `    next_reserve_price = reserve_price + MIN_INCREMENT`,
            `                       = reserve_price + ${p.MIN_INCREMENT}`,
            `else:`,
            `    next_reserve_price = price_candidate`,
          ]}
        />
      </Section>

      <Section title="3a. Supply expansion (saturation + marginal-cost gate)">
        <Note>
          Adding a core activates val_per_core validators the protocol must pay,
          so a core is only worth adding when the income it earns covers that
          payout. The income indicator is the <em>clearing</em> (closing) price;
          the marginal cost is val_per_core × per-validator payout. Expansion
          fires only when clearing_price ≥ the marginal cost. This also blocks
          validator self-dealing: a validator cluster never bids above its own
          profit (a fraction of payout), which is below the full per-core cost,
          so it can never lift the clearing price to the threshold on its own.
        </Note>
        <Formula
          lines={[
            `payout_per_validator = STAKE_INCENTIVES + REWARD_FOR_OPS / DOT_USD_RATE`,
            `core_marginal_cost   = val_per_core × payout_per_validator`,
            `                     = ${p.val_per_core} × ${(
              p.STAKE_INCENTIVES_DOT_PER_VALIDATOR +
              (p.DOT_USD_RATE > 0
                ? p.REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR / p.DOT_USD_RATE
                : 0)
            ).toLocaleString(undefined, { maximumFractionDigits: 2 })} = ${(
              p.val_per_core *
              (p.STAKE_INCENTIVES_DOT_PER_VALIDATOR +
                (p.DOT_USD_RATE > 0
                  ? p.REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR / p.DOT_USD_RATE
                  : 0))
            ).toLocaleString(undefined, { maximumFractionDigits: 2 })} DOT/core`,
            ``,
            `if consumption_rate ≥ SCALE_UP_THRESHOLD (${p.SCALE_UP_THRESHOLD}) AND clearing_price ≥ core_marginal_cost:`,
            `    num_cores_next = ceil(cores_sold / POST_EXPANSION_CONSUMPTION)`,
            `                   = ceil(cores_sold / ${p.POST_EXPANSION_CONSUMPTION})`,
          ]}
        />
      </Section>

      <Section title="3b. Supply contraction (consumption < SCALE_UP_THRESHOLD)">
        <Formula
          lines={[
            `avg_sold = mean(cores_sold over last SCALE_DOWN_WINDOW rounds, inclusive of current)`,
            `         = mean(cores_sold over last ${p.SCALE_DOWN_WINDOW} rounds)`,
            ``,
            `memory_target  = ceil(avg_sold / TARGET_CONSUMPTION_RATE)`,
            `               = ceil(avg_sold / ${p.TARGET_CONSUMPTION_RATE})`,
            ``,
            `num_cores_next = min(num_cores, memory_target)`,
          ]}
        />
        <Note>
          Final supply is clamped to{" "}
          <code className="font-mono text-xs">
            [max(renewals, MIN_CORES = {p.MIN_CORES}), MAX_CORES = {p.MAX_CORES}]
          </code>
          .
        </Note>
      </Section>

      <Section title="4. Validator-set scaling">
        <Note>
          SYSTEM_CORES are fixed cores outside the market (e.g. system
          parachains) that still each require val_per_core validators. They add
          to the active set but never enter the dynamic supply rule.
        </Note>
        <Formula
          lines={[
            `active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core)`,
            `                  = max(${p.MIN_VALIDATORS}, (num_cores + ${p.SYSTEM_CORES}) × ${p.val_per_core})`,
          ]}
        />
      </Section>

      <Section title="5. Economic accounting (per round)">
        <Note>
          Both lines are protocol-paid income to validators — STAKE_INCENTIVES
          in DOT, REWARD_FOR_OPERATIONAL_COSTS in a USD-denominated stablecoin.
        </Note>
        <Formula
          lines={[
            `stake_incentives_round (DOT) = active_validators × STAKE_INCENTIVES_DOT_PER_VALIDATOR`,
            `                             = active_validators × ${p.STAKE_INCENTIVES_DOT_PER_VALIDATOR}`,
            ``,
            `ops_reward_round (USD)       = active_validators × REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR`,
            `                             = active_validators × ${p.REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR}`,
            ``,
            `protocol_costs_round (USD)   = ops_reward_round + stake_incentives_round × DOT_USD_RATE`,
            `                             = ops_reward_round + stake_incentives_round × ${p.DOT_USD_RATE}`,
            ``,
            `protocol_revenue_round (USD) = revenue × DOT_USD_RATE`,
            `                             = revenue × ${p.DOT_USD_RATE}`,
            ``,
            `protocol_net_round (USD)     = protocol_revenue_round − protocol_costs_round`,
          ]}
        />
      </Section>

      <Section title="6. Simulator-vs-spec deviations">
        <ul className="ml-5 list-disc text-sm text-fg-2 space-y-2">
          <li>
            No separate renewal phase. All bidders re-bid in a single auction
            each round.
          </li>
          <li>
            No PENALTY. Renewers pay the same{" "}
            <code className="font-mono text-xs">clearing_price</code> as new
            buyers.
          </li>
          <li>
            No intra-round Dutch-clock dynamics. Bidders reveal their WTP at
            the start of the round and allocation is resolved analytically.
          </li>
          <li>
            Renewal floor preserved: next-round supply is lower-clamped at the
            current round's renewal count.
          </li>
        </ul>
      </Section>

      <CurrentParameters params={p} />
    </div>
  );
}

function Intro() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-base font-semibold text-fg">
        Rules the simulator applies
      </h2>
      <p className="mt-1 text-sm text-fg-2">
        Formulas below are evaluated with the current parameter values.
        Changing settings updates them in real time.
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Formula({ lines }: { lines: string[] }) {
  return (
    <pre className="rounded-md bg-surface-2 border border-line p-3 text-xs font-mono text-fg overflow-x-auto whitespace-pre">
      {lines.join("\n")}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-fg-2">{children}</p>;
}

function CurrentParameters({ params }: { params: Parameters }) {
  const groups: Array<{ title: string; keys: (keyof Parameters)[] }> = [
    {
      title: "Price rule",
      keys: [
        "K",
        "TARGET_CONSUMPTION_RATE",
        "P_MIN",
        "MIN_INCREMENT",
        "MIN_OPENING_PRICE",
        "PRICE_MULTIPLIER",
      ],
    },
    {
      title: "Supply rule",
      keys: [
        "SCALE_UP_THRESHOLD",
        "POST_EXPANSION_CONSUMPTION",
        "SCALE_DOWN_WINDOW",
        "MIN_CORES",
        "MAX_CORES",
      ],
    },
    {
      title: "Validator scaling & economics",
      keys: [
        "val_per_core",
        "MIN_VALIDATORS",
        "SYSTEM_CORES",
        "REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR",
        "STAKE_INCENTIVES_DOT_PER_VALIDATOR",
        "DOT_USD_RATE",
      ],
    },
    {
      title: "Initial state",
      keys: ["initial_num_cores", "initial_reserve_price"],
    },
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-2">
        Current parameter values
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map(g => (
          <div key={g.title}>
            <div className="mb-1 text-xs font-medium text-fg-2">
              {g.title}
            </div>
            <table className="min-w-full text-xs font-mono">
              <tbody>
                {g.keys.map(k => (
                  <tr key={k}>
                    <td className="py-0.5 pr-3 text-fg-2">{k}</td>
                    <td className="py-0.5 text-fg">
                      {String(params[k])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
