import { useSim } from "../store";
import type { Parameters } from "../simulation/types";

export function Specification() {
  const p = useSim(s => s.params);
  const validatorBreakEvenCores = Math.ceil(p.MIN_VALIDATORS / p.val_per_core);
  const validatorPLUsd =
    p.STAKE_INCENTIVES_DOT_PER_VALIDATOR * p.DOT_USD_RATE -
    p.OPERATIONAL_COST_USD_PER_VALIDATOR;

  return (
    <div className="space-y-6">
      <Intro />

      <Section
        title="1. In-round price discovery (Dutch auction)"
        intuition="Each round resolves demand through a clearing-price Dutch auction. The descending clock starts at opening_price and reaches reserve_price; bidders are not allowed to exceed the current clock. Under truthful bidding (the simulator's assumption), every bidder submits their WTP upfront and we resolve allocation analytically — the dynamics of the clock are not simulated."
      >
        <Formula
          lines={[
            `opening_price = max(MIN_OPENING_PRICE, PRICE_MULTIPLIER × reserve_price)`,
            `              = max(${p.MIN_OPENING_PRICE}, ${p.PRICE_MULTIPLIER} × reserve_price)`,
          ]}
        />
        <p className="text-sm text-slate-600">
          Each bid <code className="font-mono text-xs">(wtp, quantity)</code> is
          expanded into <span className="font-mono text-xs">quantity</span>{" "}
          unit-bids whose effective price is{" "}
          <code className="font-mono text-xs">min(wtp, opening_price)</code>.
          Unit-bids are sorted descending by effective price (ties broken by
          larger original quantity).
        </p>
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
        <p className="text-sm text-slate-600">
          All winners pay <code className="font-mono text-xs">clearing_price</code>{" "}
          regardless of tenant status. (The original RFC-17 imposes a renewal
          premium of <code className="font-mono text-xs">PENALTY</code> on
          tenants who renew without bidding above clearing; the simulator omits
          this branch because, under truthful bidding, any tenant who would
          accept the renewal premium would have bid above clearing in the first
          place.)
        </p>
      </Section>

      <Section
        title="2. Reserve-price adjustment (RFC-17 §Reserve Price Adjustment)"
        intuition="After each round the reserve drifts up when consumption was above target and down when it was below — exponentially in the deviation. The MIN_INCREMENT floor keeps the reserve from stalling near a saturated baseline."
      >
        <Formula
          lines={[
            `price_candidate = reserve_price × exp(K × (consumption_rate − TARGET))`,
            `                = reserve_price × exp(${p.K} × (consumption_rate − ${p.TARGET_CONSUMPTION_RATE}))`,
            ``,
            `price_candidate = max(price_candidate, P_MIN = ${p.P_MIN})`,
            ``,
            `# Saturation floor: at 100% consumption, ensure a minimum bump.`,
            `if consumption_rate ≥ 1.0 and (price_candidate − reserve_price) < MIN_INCREMENT:`,
            `    next_reserve_price = reserve_price + MIN_INCREMENT = reserve_price + ${p.MIN_INCREMENT}`,
            `else:`,
            `    next_reserve_price = price_candidate`,
          ]}
        />
        <ul className="ml-5 list-disc text-sm text-slate-600 space-y-1">
          <li>
            At target (<code className="font-mono text-xs">consumption = {p.TARGET_CONSUMPTION_RATE}</code>),
            multiplier = <code className="font-mono text-xs">exp(0) = 1</code> — reserve unchanged.
          </li>
          <li>
            At saturation (<code className="font-mono text-xs">consumption = 1.0</code>),
            multiplier = <code className="font-mono text-xs">exp({p.K} × {(1 - p.TARGET_CONSUMPTION_RATE).toFixed(2)}) ≈ {Math.exp(p.K * (1 - p.TARGET_CONSUMPTION_RATE)).toFixed(3)}×</code> per round.
          </li>
          <li>
            Per-round multiplier at post-expansion landing rate (<code className="font-mono text-xs">{p.POST_EXPANSION_CONSUMPTION}</code>):{" "}
            <code className="font-mono text-xs">exp({p.K} × {(p.POST_EXPANSION_CONSUMPTION - p.TARGET_CONSUMPTION_RATE).toFixed(2)}) ≈ {Math.exp(p.K * (p.POST_EXPANSION_CONSUMPTION - p.TARGET_CONSUMPTION_RATE)).toFixed(3)}×</code>.
            This is the price-signal headroom — see §3.
          </li>
        </ul>
      </Section>

      <Section
        title="3a. Supply expansion (amendment §Asymmetric Scaling Rule)"
        intuition="When consumption reaches 100%, supply expands in a single round to land at POST_EXPANSION_CONSUMPTION. That landing sits above TARGET_CONSUMPTION_RATE, leaving 'price runway' — the reserve exponential keeps applying upward pressure on the next round so genuine demand growth still produces a price signal rather than being instantly damped to neutral."
      >
        <Formula
          lines={[
            `if consumption_rate ≥ SCALE_UP_THRESHOLD = ${p.SCALE_UP_THRESHOLD}:`,
            `    num_cores_next = ceil(cores_sold / POST_EXPANSION_CONSUMPTION)`,
            `                   = ceil(cores_sold / ${p.POST_EXPANSION_CONSUMPTION})`,
          ]}
        />
        <p className="text-sm text-slate-600">
          From{" "}
          <code className="font-mono text-xs">num_cores = 50</code> at 100%
          consumption, expansion yields{" "}
          <code className="font-mono text-xs">
            ceil(50 / {p.POST_EXPANSION_CONSUMPTION}) ={" "}
            {Math.ceil(50 / p.POST_EXPANSION_CONSUMPTION)}
          </code>{" "}
          — an effective +
          {Math.round(((Math.ceil(50 / p.POST_EXPANSION_CONSUMPTION) - 50) / 50) * 100)}
          %, with post-expansion consumption at{" "}
          <code className="font-mono text-xs">
            50 / {Math.ceil(50 / p.POST_EXPANSION_CONSUMPTION)} ≈{" "}
            {(50 / Math.ceil(50 / p.POST_EXPANSION_CONSUMPTION) * 100).toFixed(1)}%
          </code>{" "}
          (above the {(p.TARGET_CONSUMPTION_RATE * 100).toFixed(0)}% target).
        </p>
      </Section>

      <Section
        title="3b. Supply contraction (amendment — memory-based, asymmetric)"
        intuition="Contraction is slow and memory-based: supply size targets the rolling-window average of recent sales divided by TARGET_CONSUMPTION_RATE, and is clamped so it can only shrink via this path. The clamp closes the 'stuck slack' attack — a one-shot 100% manipulation can briefly inflate supply, but the rolling average pulls it back as soon as the spike rolls out of the window."
      >
        <Formula
          lines={[
            `# Rolling window of cores_sold over the last SCALE_DOWN_WINDOW (${p.SCALE_DOWN_WINDOW}) rounds.`,
            `avg_sold = mean(cores_sold over last ${p.SCALE_DOWN_WINDOW} rounds, inclusive of current)`,
            ``,
            `if consumption_rate < SCALE_UP_THRESHOLD:`,
            `    memory_target  = ceil(avg_sold / TARGET_CONSUMPTION_RATE)`,
            `                   = ceil(avg_sold / ${p.TARGET_CONSUMPTION_RATE})`,
            `    num_cores_next = min(num_cores, memory_target)   # never grows via this path`,
          ]}
        />
        <p className="text-sm text-slate-600">
          Final supply is clamped to{" "}
          <code className="font-mono text-xs">
            [max(renewals, MIN_CORES = {p.MIN_CORES}), MAX_CORES = {p.MAX_CORES}]
          </code>
          . The lower clamp guarantees every renewer keeps a core; the upper
          clamp prevents runaway expansion in pathological scenarios.
        </p>
      </Section>

      <Section
        title="4. Validator-set scaling (amendment §Cores and Validators)"
        intuition="Validators serve cores at a fixed ratio val_per_core, but a security floor (MIN_VALIDATORS) caps how small the active set can get. Below the break-even core count, contracting cores does not reduce validator cost — above it, the saving is linear."
      >
        <Formula
          lines={[
            `active_validators = max(MIN_VALIDATORS, num_cores × val_per_core)`,
            `                  = max(${p.MIN_VALIDATORS}, num_cores × ${p.val_per_core})`,
          ]}
        />
        <ul className="ml-5 list-disc text-sm text-slate-600 space-y-1">
          <li>
            Break-even point:{" "}
            <code className="font-mono text-xs">
              num_cores = MIN_VALIDATORS / val_per_core ={" "}
              {validatorBreakEvenCores}
            </code>
            . Below this, the floor binds. Above, validators scale 1:1 with cores.
          </li>
          <li>
            The validator-set resizing itself requires a separate on-chain
            mechanism — not specified here. The amendment treats this as a
            precondition for cost savings to materialise.
          </li>
        </ul>
      </Section>

      <Section
        title="5. Economic accounting (per round ≈ 1 month)"
        intuition="The simulator tracks two cost lines per validator. STAKE_INCENTIVES is a DOT outflow the protocol pays; OPERATIONAL_COST is a USD outflow the validator pays from their own pocket. For the protocol to be sustainable in DOT terms, revenue must cover stake incentives. For validators to participate, their incentive income must cover their operational cost."
      >
        <Formula
          lines={[
            `stake_incentives_round (DOT) = active_validators × ${p.STAKE_INCENTIVES_DOT_PER_VALIDATOR}`,
            `operational_cost_round (USD) = active_validators × ${p.OPERATIONAL_COST_USD_PER_VALIDATOR}`,
            ``,
            `protocol_net_round (DOT)     = revenue − stake_incentives_round`,
            `protocol_net_round (USD)     = revenue × ${p.DOT_USD_RATE} − operational_cost_round − stake_incentives_round × ${p.DOT_USD_RATE}`,
            ``,
            `validator_pl (USD/month)     = STAKE_INCENTIVES × DOT_USD_RATE − OPERATIONAL_COST`,
            `                             = ${p.STAKE_INCENTIVES_DOT_PER_VALIDATOR} × ${p.DOT_USD_RATE} − ${p.OPERATIONAL_COST_USD_PER_VALIDATOR}`,
            `                             = ${validatorPLUsd >= 0 ? "" : "−"}$${Math.abs(validatorPLUsd).toLocaleString()}`,
          ]}
        />
        {validatorPLUsd < 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Heads up:</strong> with current settings, each validator
            loses ${Math.abs(validatorPLUsd).toLocaleString()} per month
            (incentive income at ${p.DOT_USD_RATE}/DOT does not cover
            operational cost). In a live system, validators would exit until
            the set shrinks below MIN_VALIDATORS and security degrades. Either
            DOT_USD_RATE, STAKE_INCENTIVES_DOT_PER_VALIDATOR, or
            OPERATIONAL_COST_USD_PER_VALIDATOR needs to change for the steady
            state to be viable.
          </p>
        )}
      </Section>

      <Section
        title="6. Simulator-vs-spec deviations"
        intuition="The simulator collapses some spec mechanics that don't add value under truthful bidding, so be aware before reading too much into specific behaviors."
      >
        <ul className="ml-5 list-disc text-sm text-slate-600 space-y-2">
          <li>
            <strong>No renewal phase.</strong> The original RFC-17 splits the
            round into MARKET → RENEWAL → SETTLEMENT phases with separate
            pricing. Here, every interested party (renewer or newcomer)
            re-bids in a single combined auction each round.
          </li>
          <li>
            <strong>No PENALTY.</strong> Renewers pay the same{" "}
            <code className="font-mono text-xs">clearing_price</code> as new
            buyers, with no <code className="font-mono text-xs">×1.30</code>{" "}
            renewal premium. Under truthful bidding the premium never binds
            (a renewer with WTP below clearing would also reject the
            premium-adjusted renewal price), so it adds no economic content.
          </li>
          <li>
            <strong>No intra-round Dutch-clock dynamics.</strong> Bidders are
            assumed to reveal their WTP at the start of the round. Allocation
            and clearing price are computed analytically from the unit-bid
            ordering. No sniping, no tipping, no candle-auction randomness.
          </li>
          <li>
            <strong>Renewal floor preserved.</strong> Despite the absence of a
            renewal phase, the supply rule still respects{" "}
            <code className="font-mono text-xs">renewals ≥ ...</code> as a
            lower clamp on next-round supply, matching the amendment's intent
            that no current tenant is involuntarily evicted by supply
            contraction.
          </li>
        </ul>
      </Section>

      <CurrentParameters params={p} />
    </div>
  );
}

function Intro() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-ink">
        What this simulator implements
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        This page shows the full set of rules — price, supply, validator, and
        economic — exactly as the engine applies them, with the current
        parameter values inlined. Changing settings updates every formula
        below in real time. Use it as a quick reference for "what just
        happened" while exploring scenarios.
      </p>
    </div>
  );
}

function Section({
  title,
  intuition,
  children,
}: {
  title: string;
  intuition: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <header>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{intuition}</p>
      </header>
      {children}
    </section>
  );
}

function Formula({ lines }: { lines: string[] }) {
  return (
    <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs font-mono text-slate-800 overflow-x-auto whitespace-pre">
      {lines.join("\n")}
    </pre>
  );
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
      title: "Supply rule (amendment)",
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
        "OPERATIONAL_COST_USD_PER_VALIDATOR",
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
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Current parameter values (snapshot of settings)
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map(g => (
          <div key={g.title}>
            <div className="mb-1 text-xs font-medium text-slate-700">
              {g.title}
            </div>
            <table className="min-w-full text-xs font-mono">
              <tbody>
                {g.keys.map(k => (
                  <tr key={k}>
                    <td className="py-0.5 pr-3 text-slate-500">{k}</td>
                    <td className="py-0.5 text-slate-900">
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
