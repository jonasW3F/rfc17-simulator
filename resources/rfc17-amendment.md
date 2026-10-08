# Amendment to RFC-0017: Dynamic Scaling of Available Cores

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Amendment Date** | 21.05.2026                                                                              |
| **Revised**     | 08.10.2026 — budget-neutral validator scaling (metanode budget model), validator floor 320, system cores outside the market |
| **Description** | This amendment extends RFC-0017 by introducing a mechanism to dynamically adjust the *number* of cores offered on the market in response to demand, alongside the existing price-scaling mechanism. The motivation is to reduce the operational cost of supporting more cores—and by extension more validators—than the network needs, while still expanding capacity when sustained demand materialises. Because every core activates validators the protocol pays, expansion is **budget-neutral by construction**: supply only grows when the clearing price a core earns covers the DOT the Dynamic Allocation Pool (DAP) commits for the validators that core brings online, and coretime revenue is routed to the DAP buffer that funds them. Supply scaling is **asymmetric**: a single saturated round expands supply to land at a consumption rate **above** the price-rule target, so the price exponential keeps responding to demand growth instead of being damped to neutral; contraction is driven by a rolling-window average of recent sales, so one-shot manipulations cannot leave supply permanently above demand. `TARGET_CONSUMPTION_RATE` is moved from 0.9 to 0.8 to open a 10pp price-signal headroom between equilibrium and the post-expansion landing point.

## Motivation

RFC-17 introduces a robust mechanism for adjusting the *price* of coretime in response to demand. However, it leaves the *supply* of cores offered on the market fixed across periods. This has two undesirable consequences:

* **Persistent oversupply** carries a real cost: each active core requires validator capacity, and maintaining validators that secure unused cores is wasteful for the protocol.
* **Persistent undersupply** cannot be resolved by price alone: once the `reserve_price` has climbed and the market is consistently fully consumed, the only remaining signal of unmet demand is price, but additional capacity may genuinely be warranted.
* **Validators are a budget line, not a free resource.** Under the metanode budget model every active validator is paid a dotUSD salary (minted by the DAP against its own DOT) plus a DOT self-stake incentive. Adding cores adds validators, and adding validators commits DOT from a budget that is fixed by issuance. A supply rule that expands on demand alone could grow the validator set past what the budget sustains.

A naive dual mechanism — expand when consumption is high, contract when it is low — is vulnerable to two distinct failure modes:

1. **Stuck slack.** An adversary buys all otherwise-unsold cores to push consumption to 100%, the supply rule expands, the attacker drops out, and the inflated supply faces only the genuine (lower) demand. With a wide dead zone, the resulting post-attack consumption sits inside that band, supply never contracts back, and `reserve_price` decays to its floor while the system remains structurally over-provisioned.
2. **Damped price signal.** If expansion sizes supply to land at the price-rule's target consumption, the round after expansion sits at neutral price (consumption ≈ target → exponent ≈ 0 → reserve unchanged). Genuine demand growth produces one round of price reaction and then goes quiet, even if the underlying demand pressure persists.

This amendment introduces a mechanism that adjusts `num_cores` between periods using an **asymmetric design** that addresses both: expansion is fast and sized so the post-expansion consumption sits *above* the price target (giving the price-rule room to keep working); contraction is slow, memory-based, and one-directional, correcting for stuck slack. Expansion is additionally **gated on budget neutrality**: a saturated round only adds cores when the clearing price covers the per-core cost of the validators those cores activate.

## Design Principles

Four properties guided the design:

1. **Asymmetric speed.** Expansion happens in a single round when saturation is observed, so genuine demand surges are met promptly. Contraction is smoothed across a rolling window of recent rounds, so transient demand dips and adversarial saturation spikes do not whipsaw the supply baseline.
2. **Manipulation-resistant contraction.** The contraction branch never expands. Only the saturation trigger can grow supply. This guarantees that whatever the rolling average says, supply only ever shrinks via this path — closing the "force expansion, then dump" attack on the older threshold-based rule.
3. **Price-signal headroom.** Expansion sizes supply to land at `POST_EXPANSION_CONSUMPTION` (proposed 0.9), which sits *above* `TARGET_CONSUMPTION_RATE` (proposed 0.8). The 10pp gap is the price rule's runway: if expansion sized supply to land exactly at the target, the reserve-price exponential `exp(K · (consumption − target))` would evaluate to ≈ 1 the round after expansion fires, instantly nullifying the price signal that genuine demand growth was producing. Landing 10pp above target preserves that signal — `exp(2.5 · 0.1) ≈ 1.28` per round under stable demand and K = 2.5 — so the reserve keeps climbing under sustained demand pressure even while supply also grows.

   Note that 1.28×/round under sustained 90% consumption is *moderate* compared to the alternative: at sustained 100% (no scaling) the per-round multiplier is `exp(0.5) ≈ 1.65`, which compounds to ~39× over seven rounds. Under the amendment's 90% landing rate, the same seven rounds compound to ~5.4× — substantial pressure on tenants and aspiring entrants, but well short of a price runaway. The mechanism preserves the *direction* of the signal without amplifying it to the same extent.
4. **Shared equilibrium.** Price and the contraction branch both target `TARGET_CONSUMPTION_RATE = 0.8`. Whenever the rolling-window average sold equals 80% of supply, neither price nor supply moves. Above 80% but below saturation, only price adjusts (upward, signalling scarcity). At saturation, supply expands to ~90% and price still has 10pp of headroom to keep responding.
5. **Budget neutrality.** The validator set only grows when the market pays for it. Each new core activates `val_per_core` validators, and the DAP commits DOT for each of them (the self-stake top-up that keeps the enlarged set at the guaranteed yield, plus the collateral locked behind the dotUSD salary). Expansion requires `clearing_price ≥ core_marginal_cost`, and coretime revenue flows to the DAP buffer, so a core that is added always carries its own validators. The threshold is the *full* committed cost, which is well above what a validator cluster bidding for its own seats could profitably pay, so the gate also closes validator self-dealing. Below the floor the rule is deliberately *not* budget-neutral: `MIN_VALIDATORS` are needed for consensus and are run at any core price, including zero. System cores, which earn nothing, are funded inside that floor by the budget and stay outside the market and its consumption measure.

## Specification

### Modification to RFC-17

`TARGET_CONSUMPTION_RATE` is changed from 0.9 to **0.8**. The lower target opens a 10pp gap between the equilibrium consumption (where the price rule rests) and the post-expansion consumption (where supply lands after firing). Under sustained 100% demand, this gap is the price rule's "runway" — it keeps the exponential update positive after expansion fires, so the price signal persists through demand growth rather than being damped to neutral the moment supply catches up.

`num_cores` and `consumption_rate` keep their RFC-17 meaning: `num_cores` is the number of cores **offered on the market**, and `consumption_rate = cores_sold / num_cores` counts only those cores (this is also how the broker pallet computes sell-out from `cores_offered` and `cores_sold`). Cores assigned to system parachains are outside the market: they are never offered, never sold and never counted. They do need validators, and this amendment accounts for them on the validator side — see *System cores* under *Cores and Validators*.

All other elements of RFC-17 remain unchanged.

### New Parameters

The following parameters are introduced and are governance-adjustable via the Coretime Admin track defined in RFC-17:

* `SCALE_UP_THRESHOLD`: Consumption rate at or above which supply expands. **Proposed: 1.0** (the market sold out).
* `POST_EXPANSION_CONSUMPTION`: Consumption rate the expansion rule sizes supply to land at, with `cores_sold` from the saturated round used as the demand estimate. **Proposed: 0.9** — 10pp above `TARGET_CONSUMPTION_RATE`, leaving price-signal headroom for the next round.
* `SCALE_DOWN_WINDOW`: Number of recent rounds (including the current one) over which `cores_sold` is averaged when computing the contraction target. **Proposed: 3**.
* `MAX_CORES`: Hard ceiling on `num_cores` (market cores). **Proposed: 81** — with 19 system cores that is 100 cores in total and 500 validators; governance should revisit as the budget allows.
* `SYSTEM_CORES`: Cores assigned to system parachains, outside the market. They are never offered, never sold and not counted in consumption, but each needs `val_per_core` validators. **Proposed: 19**.
* `val_per_core`: Number of validators required to securely operate one core. **Proposed: 5**. Load-bearing in the validator-set scaling rule, the core floor, and the per-core marginal cost that gates expansion.
* `MIN_VALIDATORS`: Hard floor on the active validator set — the number needed for consensus, run at any core price. **Proposed: 320**, the metanode budget anchor (the active set is reduced from 600 to 320).

There is no separate `MIN_CORES`. The market floor is **derived**: `MIN_VALIDATORS / val_per_core = 64` cores are served by the consensus-minimum set; `SYSTEM_CORES = 19` of them are assigned to system parachains, and **the remaining 45 are the smallest market offer**. Governance specifies the validator floor, the validators per core and the system cores; the market floor follows. A saturated round at the floor expands by `ceil(45 / 0.9) − 45 = 5` cores, so recovery from a collapse does not crawl in +1 steps.

The validator payout, which sets the budget-neutrality threshold, is described by four further parameters. They are set by the DAP budget referendum rather than by the Coretime Admin track, but the supply rule reads them:

* `SELF_STAKE_YIELD`: Annual yield the budget guarantees on a validator's self-stake of `SELF_STAKE_T`. **Proposed: 0.30** (vested over a year).
* `SELF_STAKE_T`: The self-stake threshold the yield is guaranteed on. **Proposed: 30 000 DOT**. Together: `SELF_STAKE_YIELD × SELF_STAKE_T / 12 = 750 DOT` per validator per period.
* `SALARY_USD`: dotUSD salary per validator per period, covering operating costs. **Proposed: $2 000** ($1 000 salary + $650 hardware + $350 service premium; $2 500 and $3 000 are under discussion).
* `COLLATERAL_RATIO`: DOT the DAP locks per $1 of dotUSD it mints to pay salaries. **Proposed: 2.0** (200%, liquidation at 120%). The locked DOT is not spent, but it is committed for the whole issuance step.

The salary is converted into DOT at the DOT/USD price the dotUSD system already requires (`DOT_USD`). The threshold therefore moves with the DOT price: a lower price raises the DOT a core must earn.

### Scaling Rule

After each `RENEWAL_PERIOD`, once renewal decisions are final and `consumption_rate_t` is known, the number of cores offered in the next period is computed as follows:

```
# num_cores_t is the market offer; system cores are outside it.
consumption_rate_t = cores_sold_t / num_cores_t
avg_sold_t         = mean(cores_sold_i for i in last SCALE_DOWN_WINDOW rounds, inclusive of t)
MIN_CORES          = ceil(MIN_VALIDATORS / val_per_core) − SYSTEM_CORES   # derived: 64 − 19 = 45

# DOT the DAP commits per validator per period (see Budget-Neutral Validator Scaling)
committed_per_validator = SELF_STAKE_YIELD * SELF_STAKE_T / 12
                        + COLLATERAL_RATIO * SALARY_USD / DOT_USD
core_marginal_cost      = val_per_core * committed_per_validator

if consumption_rate_t >= SCALE_UP_THRESHOLD and clearing_price_t >= core_marginal_cost:
    # Size supply so this round's sales represent POST_EXPANSION_CONSUMPTION
    # of the new supply. Because POST_EXPANSION_CONSUMPTION sits above
    # TARGET_CONSUMPTION_RATE, the next round (if demand persists) lands
    # above the price-rule target and reserve_price keeps rising.
    raw_target = ceil(cores_sold_t / POST_EXPANSION_CONSUMPTION)
elif consumption_rate_t >= SCALE_UP_THRESHOLD:
    # Saturated, but a new core would not pay for its validators: hold.
    # The price rule still applies its saturation bump, so clearing rises
    # toward the threshold in later rounds if demand persists.
    raw_target = num_cores_t
else:
    # Memory-based contraction; can only shrink supply, never grow it.
    memory_target = ceil(avg_sold_t / TARGET_CONSUMPTION_RATE)
    raw_target = min(num_cores_t, memory_target)

num_cores_{t+1} = clamp(
    raw_target,
    max(renewals_t, MIN_CORES),
    MAX_CORES
)
```

Five properties of this rule deserve emphasis:

* **Asymmetric speed.** A single 100%-consumption round triggers immediate expansion. Contraction depends on a multi-round average, so a one-shot spike does not collapse the baseline.
* **Budget-neutral expansion.** Expansion requires the clearing price to cover `core_marginal_cost`, the DOT the DAP commits for the `val_per_core` validators the new core activates. A saturated round that does not clear the threshold holds supply; the reserve-price rule keeps lifting the price, so persistent demand reaches the threshold on its own. The gate keys off the *clearing* (closing) price — the income a core actually earns and pays into the DAP buffer.
* **Price-signal headroom.** Expansion lands consumption at `POST_EXPANSION_CONSUMPTION` (0.9), which is above `TARGET_CONSUMPTION_RATE` (0.8). The next round's price exponential `exp(K · (consumption − target))` remains positive, so reserve_price continues rising under genuine demand growth rather than being damped to zero the moment supply catches up.
* **Contraction is one-directional.** `min(num_cores_t, memory_target)` ensures that the memory branch can shrink but never grow supply. Even if recent rounds averaged above the target consumption rate, this branch holds steady — expansion happens only via the saturation trigger.
* **Renewal floor preserved.** The clamp guarantees `num_cores_{t+1} ≥ renewals_t`, honouring RFC-17's guarantee that all renewers receive a core.

### Interaction with the Price Rule

The mechanisms partition the consumption range into four regimes:

| Consumption    | Price action (RFC-17, target = 0.8)        | Supply action (this amendment)                                  |
| -------------- | ------------------------------------------ | --------------------------------------------------------------- |
| < 80%          | Decreases (below target)                   | Contracts toward `avg_sold / TARGET_CONSUMPTION_RATE`           |
| = 80%          | Stable (at target)                         | Holds (memory-target equals current supply)                     |
| 80% – 100%    | Increases (above target)                   | Holds (memory branch clamped to current supply)                  |
| = 100%, `clearing_price < core_marginal_cost` | Increases (saturation bump) | Holds — a new core would not pay for its validators |
| = 100%, `clearing_price ≥ core_marginal_cost` | Increases                   | Expands so post-expansion consumption ≈ `POST_EXPANSION_CONSUMPTION` (0.9) |

Equilibrium occurs at exactly 80% consumption. Above target but below saturation, only price adjusts — supply stays put because the memory branch can't expand. At saturation, supply expands and lands the next round at ~90% consumption, which still triggers a positive price update (`exp(2.5 · 0.1) ≈ 1.28x` per round under stable demand and K=2.5). Under sustained demand growth, this means price *and* supply both keep moving until the price prices out enough demand to bring consumption back to target.

### Attack Resistance

Two attack variants and how this amendment mitigates them:

* **One-shot expansion attack.** Attacker buys all otherwise-unsold cores in a single round, forcing 100% consumption and a one-shot supply expansion (~+20% from baseline, since `ceil(num/0.9)` rounds up), then drops out. The saturated round rolls out of the `SCALE_DOWN_WINDOW` within a few rounds, the rolling average converges to genuine demand, and the contraction branch returns supply to its pre-attack baseline. Cost to the attacker: buying enough cores to force saturation at a clearing price of at least `core_marginal_cost` (otherwise the gate holds and nothing happens), plus a `reserve_price` bump that the attacker also pays. Damage to the protocol: temporary excess capacity that self-heals — and because the attacker paid at least the marginal cost into the DAP buffer, the extra validators were funded for the round they were added.
* **Validator self-dealing.** Validators (or a cluster of them) could try to buy slack cores to trigger expansion and so enlarge the set they are paid from. The gate makes this unprofitable: a seat is worth at most the validator's *profit* (a fraction of its payout), but the threshold is the *full* committed cost of `val_per_core` validators — self-stake top-up plus 200% salary collateral. A cluster bidding up to its profit cannot lift the clearing price to the threshold, so any saturation that clears the gate is genuine demand paying more than cost.

* **Sustained expansion attack.** Attacker maintains 100% consumption across many rounds to keep triggering expansion. The absolute number of cores the attacker must buy each round grows with supply (since the trigger requires every otherwise-unsold core to be bought), every one of them at or above `core_marginal_cost`, and `reserve_price` rises with every saturated round. The attacker pays a compoundingly larger bill for a structural effect that compounds at a similar rate, against a system that can fully reverse the expansion in `SCALE_DOWN_WINDOW`+1 rounds once the attack stops.

Contraction itself remains immune to manipulation: it requires actual unsold cores in the rolling window, which cannot be manufactured by an adversary — only revealed by genuine lack of demand.

### Worked Examples

The first three examples isolate the supply rule: no validator floor, and `clearing_price ≥ core_marginal_cost` whenever consumption hits 100% (equivalently, a payout of zero). The fourth uses the proposed defaults and shows the gate.

*One-shot grifter attack (8 stable tenants on 10 cores, attacker buys 2 extra in round 2):*

| Round | num_cores | demand | sold | consumption | avg_sold (3-window) | action     |
| ----- | --------- | ------ | ---- | ----------- | ------------------- | ---------- |
| 1     | 10        | 8      | 8    | 80%         | 8.00                | hold (at target) |
| 2     | 10        | 10     | 10   | 100%        | 9.00                | expand to ⌈10/0.9⌉ = 12 |
| 3     | 12        | 8      | 8    | 67%         | 8.67                | contract to ⌈8.67/0.8⌉ = 11 |
| 4     | 11        | 8      | 8    | 73%         | 8.67                | hold (memory pegs at 11) |
| 5     | 11        | 8      | 8    | 73%         | 8.00                | contract to ⌈8/0.8⌉ = 10 |
| 6     | 10        | 8      | 8    | 80%         | 8.00                | hold (at target) |

System absorbs the attack and self-corrects within `SCALE_DOWN_WINDOW + 1` rounds. Contraction begins immediately in round 3 because the post-attack consumption (67%) is below the price target, so the rolling average drops below the contraction threshold sooner than under the older threshold-based dead zone.

*Severe attrition (8 → 5 tenants on 10 cores):*

| Round | num_cores | demand | sold | consumption | avg_sold (3-window) | action     |
| ----- | --------- | ------ | ---- | ----------- | ------------------- | ---------- |
| 1     | 10        | 8      | 8    | 80%         | 8.00                | hold |
| 2     | 10        | 5      | 5    | 50%         | 6.50                | contract to ⌈6.5/0.8⌉ = 9 |
| 3     | 9         | 5      | 5    | 56%         | 6.00                | contract to ⌈6/0.8⌉ = 8 |
| 4     | 8         | 5      | 5    | 63%         | 5.00                | contract to ⌈5/0.8⌉ = 7 |
| 5     | 7         | 5      | 5    | 71%         | 5.00                | contract to ⌈5/0.8⌉ = 7 → hold |

Contraction is gradual — the rolling average smooths the shock and the system lands near the new equilibrium over `SCALE_DOWN_WINDOW + 1` rounds, leaving headroom for a return of demand without immediately re-triggering expansion.

*Sustained demand growth (real demand grows to 18 starting from 12):*

| Round | num_cores | demand | sold | consumption | reserve action          | supply action |
| ----- | --------- | ------ | ---- | ----------- | ----------------------- | ------------- |
| 1     | 10        | 12     | 10   | 100%        | ×1.65 (saturated)       | expand to 12  |
| 2     | 12        | 14     | 12   | 100%        | ×1.65 (saturated)       | expand to 14  |
| 3     | 14        | 16     | 14   | 100%        | ×1.65 (saturated)       | expand to 16  |
| 4     | 16        | 18     | 16   | 100%        | ×1.65 (saturated)       | expand to 18  |
| 5     | 18        | 18     | 18   | 100%        | ×1.65 (saturated)       | expand to 20  |
| 6     | 20        | 18     | 18   | 90%         | ×1.28 (above target)    | hold          |
| 7     | 20        | 18     | 18   | 90%         | ×1.28 (above target)    | hold          |

Both supply and price keep rising under sustained pressure. Once supply outpaces demand (round 6), consumption settles at the post-expansion landing rate, leaving 10pp above the price target — so the reserve continues to climb until the rising price prices enough bidders out to bring consumption down to 80%.

*Saturated below cost, at the floor (45 market cores; 19 system cores outside the market; demand 50; `core_marginal_cost` = 23 750 DOT at DOT = $1.00):*

| Round | num_cores | demand | sold | consumption | clearing (DOT) | gate                       | supply action | validators |
| ----- | --------- | ------ | ---- | ----------- | -------------- | -------------------------- | ------------- | ---------- |
| 1     | 45        | 50     | 45   | 100%        | 15 000         | 15 000 < 23 750 → held     | hold at 45; reserve ×1.65 | (45+19)×5 = 320 |
| 2     | 45        | 50     | 45   | 100%        | 24 750         | 24 750 ≥ 23 750 → passes   | expand to ⌈45/0.9⌉ = 50 | 320 |
| 3     | 50        | 50     | 50   | 100%        | 26 000         | passes                     | expand to ⌈50/0.9⌉ = 56 | (50+19)×5 = 345 |
| 4     | 56        | 50     | 50   | 89%         | 26 000         | not saturated              | hold; reserve ×1.25 | (56+19)×5 = 375 |

Round 1 is saturated, but the five validators a new core would activate cost more than the core earns, so supply holds. The saturation bump still raises the reserve, bidders who stay pay more in round 2, and the clearing price crosses the threshold. From then on every core added is funded by its own clearing price flowing into the DAP buffer, and the validator set grows by five per core. Had demand been unwilling to pay 23 750 DOT per core, the market would have stayed at 45 cores — fully consumed, but with no validator added beyond the 320 the budget already carries.

### Edge Cases

* **Scaling at `MIN_CORES` or `MAX_CORES`.** When a bound is binding, the corresponding mechanism becomes inactive in that direction; only price continues to respond. If `MAX_CORES` is binding under sustained 100% consumption, governance should consider raising it.
* **Renewal floor binding.** If contraction would push `num_cores` below `renewals_t`, the clamp prevents this. The next period offers `renewals_t` cores; if any of those renewers subsequently do not renew, the rolling-average contraction continues to draw supply down in the period after that.
* **First few rounds.** When fewer than `SCALE_DOWN_WINDOW` rounds have completed, the rolling average is taken over the rounds that exist. The first round's average is just that round's `cores_sold`.
* **No new sales when consumption is at 100%.** If consumption hits 100% with `new_sales_t = 0`, every renewer renewed and no new entrants arrived. The system still expands, subject to the budget gate. This is a deliberate design choice: full renewal saturation indicates the existing tenant population fully values the available supply, suggesting room to test whether new entrants are being priced out.
* **Saturated below cost.** When consumption is 100% but `clearing_price < core_marginal_cost`, supply holds and only the price rule acts. The saturation bump (`MIN_INCREMENT`, 300 DOT) guarantees the reserve rises by a fixed minimum each such round, so the clearing price reaches the threshold in a bounded number of rounds if demand persists.
* **Adding system cores.** A new system core needs `val_per_core` validators and must come from somewhere. Governance has exactly two choices, spelled out under *System cores*: lower the market floor by one core (the validators already in the floor serve it; the market offer at the floor shrinks), or raise `MIN_VALIDATORS` by `val_per_core` (new validators are added directly, the market is untouched). The supply rule never sees system cores, so neither choice alters market dynamics beyond the floor.
* **Nothing offered.** If system cores take every core the floor serves, `num_cores = 0` and consumption is undefined. The rule treats it as "no signal": no sale, the reserve is left unchanged, and the market floor keeps `num_cores` at zero until the floor or the system-core count changes. (The simulator reads consumption as 0 in this state, which lets the reserve decay; a production implementation should skip the price update.)
* **DOT price moves.** `core_marginal_cost` is evaluated at the DOT/USD price of the round. A falling price raises the threshold (the salary costs more DOT) and can hold expansion that would have passed a round earlier; it never contracts supply by itself — contraction remains purely demand-driven.

## Cores and Validators

The motivation for adjusting core supply is ultimately to reduce wasted validator capacity. Cost savings on the protocol side only materialise if the validator set actually shrinks when cores do. This section makes that relationship explicit.

### The relationship

Each core requires `val_per_core` (proposed: 5) validators to operate securely — enough redundancy for liveness and BFT margins under the active assignment scheme. Changing `num_cores` therefore has direct consequences for the active set:

* More cores → more validators (and more aggregate stake securing them).
* Fewer cores → fewer validators (the cost saving this amendment is designed to capture).

### A new on-chain mechanism is needed

RFC-17 and this amendment govern the *market-side* quantities (`num_cores`, `reserve_price`, allocations). They do not adjust the *active validator set*. Realising the cost benefits of supply contraction requires a separate on-chain mechanism that resizes the active set in response to changes in `num_cores`. The specification of that mechanism is out of scope here, but it is a precondition for the cost saving to materialise — without it, contracting cores merely leaves validators idle.

### Validator floor: `MIN_VALIDATORS = 320`

Not every validator-set size is sustainable. Below a threshold, security guarantees (finality, economic security of NPoS, finality stalls under adverse conditions) degrade beyond what the protocol can accept. The metanode budget plan sets the active set at **320** (reduced from 600): it is the size at which the dotUSD salaries fit within the DAP buffer's inflow with headroom for a price drop, and it is in line with the metanode plan's target of around 300. We adopt it as the hard floor on the active set, run **at any core price, including zero**:

* `MIN_VALIDATORS` = **320**.

The market floor follows from it rather than being set separately. 320 validators at `val_per_core = 5` serve 64 cores; 19 of those are assigned to system parachains, so **the market offers at least 45 cores**. Governance specifies the validator floor, the validators per core and the system cores, and the market floor is what is left:

```
cores the floor serves = MIN_VALIDATORS / val_per_core          = 64
MIN_CORES (market)     = MIN_VALIDATORS / val_per_core − SYSTEM_CORES = 45
```

Every validator the floor pays for therefore has a core to serve, and the market never offers fewer cores than the floor can serve after the system cores are assigned.

### Combined scaling rule

Validators serve market and system cores alike, so the active set is sized on their sum:

```
active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) * val_per_core)
```

Concretely, with the proposed defaults:

| num_cores (market) | + system | active_validators | scaling regime |
| ------------------ | -------- | ----------------- | -------------- |
| 45 (floor)         | 64       | 320 (floor = break-even) | floor exactly satisfied |
| 50                 | 69       | 345               | cores and validators scale together |
| 61                 | 80       | 400               | cores and validators scale together |
| 81 (ceiling)       | 100      | 500               | cores and validators scale together |

Because the floor is derived from the validator count, **every market core dropped removes 5 validators from the active set**, all the way down to the floor. There is no range in which contraction saves nothing.

### System cores

System cores are outside the market in every respect the supply rule can see: they are not offered, not sold and not counted in `consumption_rate`. That keeps the price signal clean — the reserve price measures what the market will pay for the cores it is offered, with no bias from cores that are never for sale — and it matches the broker pallet's existing sell-out accounting. What system cores do need is validators: 19 of them need 95, and no coretime sale pays for those. They are funded by the budget, inside the 320-validator floor that is run at any price. The budget-neutrality gate governs only cores *above* the floor; the floor itself, system cores included, is a consensus and infrastructure cost that issuance carries.

A clean identity holds at the floor: if all 45 market cores sell at exactly the gate price, market revenue (45 × 23 750 ≈ 1.07M DOT) covers the 225 validators the market cores need to the DOT, and the budget covers the 95 system-core validators (451 250 DOT).

**Adding a system core.** Because the validator floor is fixed by consensus and the market floor is derived from it, a new system core has to be paid for in one of exactly two ways, and governance must pick one when it assigns the core:

1. **Take it from the market floor.** `SYSTEM_CORES` goes up by one and `MIN_VALIDATORS` stays. The validators already in the floor serve the new system core, and the smallest market offer drops by one (45 → 44). No validator is added and the budget is unchanged; the cost is one less core for sale at the floor. If the market is currently *at* the floor, the next period offers one core less, and the renewal clamp guarantees that no current tenant is displaced (the reduction comes out of unsold or newly contested cores, never out of renewals). Above the floor nothing changes until contraction next reaches it.
2. **Add validators directly.** `SYSTEM_CORES` and `MIN_VALIDATORS` go up together, by one and by `val_per_core`. The market floor is unchanged (45 stays 45), the new system core is served by `val_per_core` new validators, and the budget takes on their committed DOT — self-stake top-up plus salary collateral — permanently and outside the gate. Market dynamics are untouched.

Neither option routes through the market. Option 1 is budget-neutral and costs market capacity; option 2 preserves the market and costs budget. Which one applies is a governance decision made alongside the system-parachain decision itself, not something the supply rule infers. The one combination to avoid is raising `SYSTEM_CORES` while believing the market floor is fixed: the floor is derived, so it moves unless `MIN_VALIDATORS` moves with it.

### Budget-neutral validator scaling

#### The payout model

Under the metanode budget every active validator is paid two protocol-funded lines per period (one period ≈ one month):

1. **A self-stake incentive in DOT.** The budget guarantees a yield of `SELF_STAKE_YIELD` (30%) on a self-stake of `SELF_STAKE_T` (30 000 DOT), vested over a year: `0.30 × 30 000 / 12 = 750 DOT` per validator per period. At 320 validators this is the 2.88M DOT a year of the budget's validator line.
2. **A dotUSD salary** of `SALARY_USD` ($2 000) per period, covering operating costs. The DAP mints it against its own DOT at `COLLATERAL_RATIO` (200%): $1 of salary locks $2 of DOT. The DOT is locked rather than sold, but the debt is not expected to be repaid within the issuance step, so the collateral is committed for the step.

Both lines are income to the validator. What matters for the supply rule is what the protocol has to *commit* to pay them.

#### Committed DOT per validator and per core

```
self_stake_dot          = SELF_STAKE_YIELD * SELF_STAKE_T / 12          # 750 DOT
salary_dot              = SALARY_USD / DOT_USD                           # 2 000 DOT at $1.00
collateral_dot          = COLLATERAL_RATIO * salary_dot                  # 4 000 DOT at $1.00

committed_per_validator = self_stake_dot + collateral_dot                # 4 750 DOT at $1.00
core_marginal_cost      = val_per_core * committed_per_validator         # 23 750 DOT at $1.00
```

The basis is **committed DOT, not payout**. A validator *receives* 2 750 DOT-equivalent (750 + 2 000), but the DAP has to put up 4 750 DOT to pay it: the self-stake incentive leaves the buffer, and the salary collateral is locked in the DAP's vault for the step. Budget neutrality means the core covers the larger figure.

The self-stake term is the top-up that keeps the *enlarged* set at the guaranteed yield. The validator line is sized for 320 validators at 30% of T; five more validators need `5 × 750 = 3 750 DOT` more per period, or the yield of every validator dilutes. A core is only added if its revenue funds that top-up, so the guaranteed yield holds at every set size the rule reaches.

#### The gate

Expansion fires only when the clearing price of the saturated round covers the marginal cost:

```
expand  ⇔  consumption_rate ≥ SCALE_UP_THRESHOLD  and  clearing_price ≥ core_marginal_cost
```

Three points about the choice of signal:

* **Clearing, not reserve.** The clearing price is what every core actually earns in the round, and under RFC-17 it is uniform across cores. It is the income the new core will realise if demand persists, which is what a budget comparison needs.
* **Full committed cost, not a profit margin.** The threshold is deliberately the whole 4 750 DOT per validator, not the slice a validator keeps after costs. This is what makes the gate also a self-dealing defence: validators bidding for their own seats can at most bid their profit, which is strictly below the threshold.
* **Price-dependent.** Because the salary is dollar-denominated and coretime is DOT-denominated, the threshold moves inversely with the DOT price:

| DOT price | salary_dot | collateral_dot | committed / validator | core_marginal_cost |
| --------- | ---------- | -------------- | --------------------- | ------------------ |
| $0.50     | 4 000      | 8 000          | 8 750                 | 43 750 DOT |
| $0.75     | 2 667      | 5 333          | 6 083                 | 30 417 DOT |
| $1.00     | 2 000      | 4 000          | 4 750                 | 23 750 DOT |
| $1.25     | 1 600      | 3 200          | 3 950                 | 19 750 DOT |
| $1.50     | 1 333      | 2 667          | 3 417                 | 17 083 DOT |

The rule reads the same DOT/USD price the dotUSD system uses to manage the DAP's collateral; no second oracle is introduced.

#### Revenue routing

Coretime revenue (`cores_sold × clearing_price` per period) is credited to the DAP buffer, the account the salary collateral and the self-stake incentive are drawn from. This closes the loop: the cores the gate admits pay, in the round they are admitted, at least what their validators commit, and that payment lands where the commitment is made. Under RFC-17 as written, coretime revenue has no designated destination; this amendment designates the DAP buffer.

#### Contraction

Contraction is unchanged and remains demand-driven. When cores are dropped, the validators they activated leave the active set and the DAP's future commitments fall by `committed_per_validator` per validator per period. Collateral already locked for past salaries is not released by contraction — it stays committed until the debt is settled — so contraction saves future budget, not past.

#### What is deliberately not modelled

* **Interest on the DAP's dotUSD debt.** Whether the DAP pays interest, and at what rate, is open (Ref 1944 lets borrowers set rates). If it does, `collateral_dot` should be extended by the per-period interest in DOT. The gate formula does not otherwise change.
* **A buffer-inflow ceiling on the set.** The buffer inflow (27.77M DOT a year under the proposed split) bounds how many validator salaries the DAP can collateralise at all, and that bound moves with the DOT price. This amendment does not derive `MAX_CORES` from it; governance sets `MAX_CORES` with the budget in view, and should lower it if the price falls far enough that the inflow no longer covers the set.
* **Reward dilution.** `core_marginal_cost` is static in `num_cores`; the self-stake term is the top-up needed to prevent dilution, not a diluted figure.

### Implications for governance

* `MIN_VALIDATORS` should be set with reference to network-security analyses (finality margins, slashing economics, NPoS bonding distribution), not market dynamics. It should not be tuned in response to short-term price or supply pressure.
* `val_per_core` is similarly security-driven and is expected to remain stable unless the assignment scheme or BFT parameters change materially.
* There is no `MIN_CORES` to tune: the market floor is `MIN_VALIDATORS / val_per_core − SYSTEM_CORES`. To change it, change the validator floor (a security decision) or the system cores (an infrastructure decision); the market follows.
* Every change to `SYSTEM_CORES` must be paired with a decision on `MIN_VALIDATORS`: leave it (the new system core comes out of the market floor) or raise it by `val_per_core` (new validators are added directly and the market is untouched). See *System cores*.
* `SELF_STAKE_YIELD`, `SELF_STAKE_T`, `SALARY_USD` and `COLLATERAL_RATIO` are budget-side parameters set by the DAP budget referendum. The supply rule reads them; it does not own them. Any change to the validator payout automatically retunes the expansion threshold, which is the point: the mechanism is budget-neutral under whatever validators are paid.

### Transition

* At activation, `num_cores` is set to the current number of cores offered under the existing RFC-17 design, but not below the derived market floor `MIN_VALIDATORS / val_per_core − SYSTEM_CORES = 45`, and the active set is set to `max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core)` — 320 at the floor, per the metanode plan's reduction from 600.
* Coretime revenue is routed to the DAP buffer from activation.
* `TARGET_CONSUMPTION_RATE` moves from 0.9 to 0.8 immediately for the price rule.
* The supply scaling rule applies starting from the first full `BULK_PERIOD` after activation. The rolling window begins accumulating `cores_sold` from that round.
* `val_per_core` is initialised to 5 and is not expected to require adjustment unless validator architecture changes materially.

### Governance Parameters

The following are added to the governance-adjustable set defined in RFC-17:

* `SCALE_UP_THRESHOLD`
* `POST_EXPANSION_CONSUMPTION`
* `SCALE_DOWN_WINDOW`
* `MAX_CORES`
* `SYSTEM_CORES`
* `val_per_core`
* `MIN_VALIDATORS`

The market floor is not a parameter; it is derived as `MIN_VALIDATORS / val_per_core − SYSTEM_CORES`.

The supply rule additionally reads the validator payout parameters owned by the DAP budget referendum: `SELF_STAKE_YIELD`, `SELF_STAKE_T`, `SALARY_USD`, `COLLATERAL_RATIO`, and the DOT/USD price used by the dotUSD system.

`TARGET_CONSUMPTION_RATE` (now 0.8) remains governance-adjustable and is the shared equilibrium target for both the price rule and the contraction branch of the supply rule. The post-expansion landing rate (`POST_EXPANSION_CONSUMPTION`) should always be set above `TARGET_CONSUMPTION_RATE` so the price-signal headroom is preserved.

## Implications

* **Steady-state cost.** Equilibrium consumption at 80% means the protocol carries ~20% structural headroom in the supply baseline. This is the cost of preserving the price signal under demand growth: a higher headroom in exchange for a more informative price.
* **Price signal persists through expansion.** Under sustained demand growth, every saturated round still triggers a saturation-magnitude reserve bump, and post-expansion rounds remain above the price target until demand abates. Existing tenants get a continuously updating signal of marginal demand rather than a single bump followed by silence.
* **Sustained above-target consumption tames, but does not silence, the price.** At sustained 90% consumption (the post-expansion landing point), reserve price grows by ≈ 28% per round — substantial but well below the 65%/round of the no-scaling 100% case. Over seven rounds, the contrast is roughly 5.4× vs 39×. The mechanism keeps the direction of the price signal intact without amplifying it to a runaway.
* **Budget-neutral by construction.** A core is only added when its clearing price covers the DOT the DAP commits for the validators it activates (self-stake top-up plus salary collateral), and that revenue flows to the DAP buffer. The validator set can therefore never grow past what the market pays for, and the guaranteed self-stake yield holds at every set size. Changing the validator payout changes the threshold automatically.
* **Validator cost scales 1:1 with cores.** Because the market floor is derived from the validator floor (320 validators → 64 cores → 45 on the market after 19 system cores), every market core dropped removes 5 validators and their committed DOT; there is no range in which contraction saves nothing. See the *Cores and Validators* section.
* **System cores stay outside the market.** They are never offered and never counted, so the price signal is unbiased and the rule matches the pallet's existing sell-out accounting. Their validators are funded by the budget inside the 320 floor; only cores above the floor must pass the gate. Adding a system core is a governance choice between a smaller market floor and more validators, never a change to market dynamics.
* **Expansion is price-sensitive.** The threshold rises as the DOT price falls, because the salary is dollar-denominated. In a drawdown, saturated rounds hold rather than expand, and the reserve keeps rising until either demand pays the higher DOT price or abates. Contraction is unaffected.
* **One-shot manipulation is self-correcting and self-funding.** A successful expansion attack must pay at least `core_marginal_cost` per core into the DAP buffer, inflates supply temporarily, and is undone within `SCALE_DOWN_WINDOW + 1` rounds after the attacker leaves. Validator self-dealing cannot reach the threshold at all.
* **Sustained attacks face compounding cost against compounding effect.** Attackers cannot grow the effect faster than they grow their bill, and `reserve_price` rises alongside every saturated round.
* **Genuine attrition contracts gradually.** Real demand drops are absorbed across the rolling window rather than over-corrected in a single round, leaving headroom for demand to return.
* **Coherent shared equilibrium.** Price and the contraction branch both target 80%, so governance changes to `TARGET_CONSUMPTION_RATE` automatically realign them. Expansion (which targets `POST_EXPANSION_CONSUMPTION`) is the only piece that may need a paired adjustment to preserve the headroom invariant.
