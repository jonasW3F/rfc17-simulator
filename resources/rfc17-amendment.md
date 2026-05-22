# Amendment to RFC-0017: Dynamic Scaling of Available Cores

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Amendment Date** | 21.05.2026                                                                              |
| **Description** | This amendment extends RFC-0017 by introducing a mechanism to dynamically adjust the *number* of cores offered on the market in response to demand, alongside the existing price-scaling mechanism. The motivation is to reduce the operational cost of supporting more cores—and by extension more validators—than the network needs, while still expanding capacity when sustained demand materialises. Supply scaling is **asymmetric**: a single saturated round expands supply to land at a consumption rate **above** the price-rule target, so the price exponential keeps responding to demand growth instead of being damped to neutral; contraction is driven by a rolling-window average of recent sales, so one-shot manipulations cannot leave supply permanently above demand. `TARGET_CONSUMPTION_RATE` is moved from 0.9 to 0.8 to open a 10pp price-signal headroom between equilibrium and the post-expansion landing point.

## Motivation

RFC-17 introduces a robust mechanism for adjusting the *price* of coretime in response to demand. However, it leaves the *supply* of cores offered on the market fixed across periods. This has two undesirable consequences:

* **Persistent oversupply** carries a real cost: each active core requires validator capacity, and maintaining validators that secure unused cores is wasteful for the protocol.
* **Persistent undersupply** cannot be resolved by price alone: once the `reserve_price` has climbed and the market is consistently fully consumed, the only remaining signal of unmet demand is price, but additional capacity may genuinely be warranted.

A naive dual mechanism — expand when consumption is high, contract when it is low — is vulnerable to two distinct failure modes:

1. **Stuck slack.** An adversary buys all otherwise-unsold cores to push consumption to 100%, the supply rule expands, the attacker drops out, and the inflated supply faces only the genuine (lower) demand. With a wide dead zone, the resulting post-attack consumption sits inside that band, supply never contracts back, and `reserve_price` decays to its floor while the system remains structurally over-provisioned.
2. **Damped price signal.** If expansion sizes supply to land at the price-rule's target consumption, the round after expansion sits at neutral price (consumption ≈ target → exponent ≈ 0 → reserve unchanged). Genuine demand growth produces one round of price reaction and then goes quiet, even if the underlying demand pressure persists.

This amendment introduces a mechanism that adjusts `num_cores` between periods using an **asymmetric design** that addresses both: expansion is fast and sized so the post-expansion consumption sits *above* the price target (giving the price-rule room to keep working); contraction is slow, memory-based, and one-directional, correcting for stuck slack.

## Design Principles

Four properties guided the design:

1. **Asymmetric speed.** Expansion happens in a single round when saturation is observed, so genuine demand surges are met promptly. Contraction is smoothed across a rolling window of recent rounds, so transient demand dips and adversarial saturation spikes do not whipsaw the supply baseline.
2. **Manipulation-resistant contraction.** The contraction branch never expands. Only the saturation trigger can grow supply. This guarantees that whatever the rolling average says, supply only ever shrinks via this path — closing the "force expansion, then dump" attack on the older threshold-based rule.
3. **Price-signal headroom.** Expansion sizes supply to land at `POST_EXPANSION_CONSUMPTION` (proposed 0.9), which sits *above* `TARGET_CONSUMPTION_RATE` (proposed 0.8). The 10pp gap is the price rule's runway: if expansion sized supply to land exactly at the target, the reserve-price exponential `exp(K · (consumption − target))` would evaluate to ≈ 1 the round after expansion fires, instantly nullifying the price signal that genuine demand growth was producing. Landing 10pp above target preserves that signal — `exp(2.5 · 0.1) ≈ 1.28` per round under stable demand and K = 2.5 — so the reserve keeps climbing under sustained demand pressure even while supply also grows.

   Note that 1.28×/round under sustained 90% consumption is *moderate* compared to the alternative: at sustained 100% (no scaling) the per-round multiplier is `exp(0.5) ≈ 1.65`, which compounds to ~39× over seven rounds. Under the amendment's 90% landing rate, the same seven rounds compound to ~5.4× — substantial pressure on tenants and aspiring entrants, but well short of a price runaway. The mechanism preserves the *direction* of the signal without amplifying it to the same extent.
4. **Shared equilibrium.** Price and the contraction branch both target `TARGET_CONSUMPTION_RATE = 0.8`. Whenever the rolling-window average sold equals 80% of supply, neither price nor supply moves. Above 80% but below saturation, only price adjusts (upward, signalling scarcity). At saturation, supply expands to ~90% and price still has 10pp of headroom to keep responding.

## Specification

### Modification to RFC-17

`TARGET_CONSUMPTION_RATE` is changed from 0.9 to **0.8**. The lower target opens a 10pp gap between the equilibrium consumption (where the price rule rests) and the post-expansion consumption (where supply lands after firing). Under sustained 100% demand, this gap is the price rule's "runway" — it keeps the exponential update positive after expansion fires, so the price signal persists through demand growth rather than being damped to neutral the moment supply catches up.

All other elements of RFC-17 remain unchanged.

### New Parameters

The following parameters are introduced and are governance-adjustable via the Coretime Admin track defined in RFC-17:

* `SCALE_UP_THRESHOLD`: Consumption rate at or above which supply expands. **Proposed: 1.0** (the market sold out).
* `POST_EXPANSION_CONSUMPTION`: Consumption rate the expansion rule sizes supply to land at, with `cores_sold` from the saturated round used as the demand estimate. **Proposed: 0.9** — 10pp above `TARGET_CONSUMPTION_RATE`, leaving price-signal headroom for the next round.
* `SCALE_DOWN_WINDOW`: Number of recent rounds (including the current one) over which `cores_sold` is averaged when computing the contraction target. **Proposed: 3**.
* `MIN_CORES`: Hard floor on cores offered. **Proposed: 10**. See the *Cores and Validators* section for why this floor does not translate into a proportionally small validator set.
* `MAX_CORES`: Hard ceiling on cores offered. **Proposed: 100** (governance should revisit as the validator set grows).
* `val_per_core`: Number of validators required to securely operate one core. **Proposed: 5**. This parameter does not appear in the supply-scaling formula but is load-bearing for the validator-set scaling rule described in the *Cores and Validators* section.
* `MIN_VALIDATORS`: Hard floor on the active validator set, independent of `num_cores`. **Proposed: 250**. See the *Cores and Validators* section.

### Scaling Rule

After each `RENEWAL_PERIOD`, once renewal decisions are final and `consumption_rate_t` is known, the number of cores offered in the next period is computed as follows:

```
avg_sold_t = mean(cores_sold_i for i in last SCALE_DOWN_WINDOW rounds, inclusive of t)

if consumption_rate_t >= SCALE_UP_THRESHOLD:
    # Size supply so this round's sales represent POST_EXPANSION_CONSUMPTION
    # of the new supply. Because POST_EXPANSION_CONSUMPTION sits above
    # TARGET_CONSUMPTION_RATE, the next round (if demand persists) lands
    # above the price-rule target and reserve_price keeps rising.
    raw_target = ceil(cores_sold_t / POST_EXPANSION_CONSUMPTION)
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

Four properties of this rule deserve emphasis:

* **Asymmetric speed.** A single 100%-consumption round triggers immediate expansion. Contraction depends on a multi-round average, so a one-shot spike does not collapse the baseline.
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
| = 100%         | Increases                                  | Expands so post-expansion consumption ≈ `POST_EXPANSION_CONSUMPTION` (0.9) |

Equilibrium occurs at exactly 80% consumption. Above target but below saturation, only price adjusts — supply stays put because the memory branch can't expand. At saturation, supply expands and lands the next round at ~90% consumption, which still triggers a positive price update (`exp(2.5 · 0.1) ≈ 1.28x` per round under stable demand and K=2.5). Under sustained demand growth, this means price *and* supply both keep moving until the price prices out enough demand to bring consumption back to target.

### Attack Resistance

Two attack variants and how this amendment mitigates them:

* **One-shot expansion attack.** Attacker buys all otherwise-unsold cores in a single round, forcing 100% consumption and a one-shot supply expansion (~+20% from baseline, since `ceil(num/0.9)` rounds up), then drops out. The saturated round rolls out of the `SCALE_DOWN_WINDOW` within a few rounds, the rolling average converges to genuine demand, and the contraction branch returns supply to its pre-attack baseline. Cost to the attacker: buying enough cores to force saturation at the round's clearing price, plus a `reserve_price` bump that the attacker also pays. Damage to the protocol: temporary excess capacity that self-heals.

* **Sustained expansion attack.** Attacker maintains 100% consumption across many rounds to keep triggering expansion. The absolute number of cores the attacker must buy each round grows with supply (since the trigger requires every otherwise-unsold core to be bought), and `reserve_price` rises with every saturated round. The attacker pays a compoundingly larger bill for a structural effect that compounds at a similar rate, against a system that can fully reverse the expansion in `SCALE_DOWN_WINDOW`+1 rounds once the attack stops.

Contraction itself remains immune to manipulation: it requires actual unsold cores in the rolling window, which cannot be manufactured by an adversary — only revealed by genuine lack of demand.

### Worked Examples

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

### Edge Cases

* **Scaling at `MIN_CORES` or `MAX_CORES`.** When a bound is binding, the corresponding mechanism becomes inactive in that direction; only price continues to respond. If `MAX_CORES` is binding under sustained 100% consumption, governance should consider raising it.
* **Renewal floor binding.** If contraction would push `num_cores` below `renewals_t`, the clamp prevents this. The next period offers `renewals_t` cores; if any of those renewers subsequently do not renew, the rolling-average contraction continues to draw supply down in the period after that.
* **First few rounds.** When fewer than `SCALE_DOWN_WINDOW` rounds have completed, the rolling average is taken over the rounds that exist. The first round's average is just that round's `cores_sold`.
* **No new sales when consumption is at 100%.** If consumption hits 100% with `new_sales_t = 0`, every renewer renewed and no new entrants arrived. The system still expands. This is a deliberate design choice: full renewal saturation indicates the existing tenant population fully values the available supply, suggesting room to test whether new entrants are being priced out.

## Cores and Validators

The motivation for adjusting core supply is ultimately to reduce wasted validator capacity. Cost savings on the protocol side only materialise if the validator set actually shrinks when cores do. This section makes that relationship explicit.

### The relationship

Each core requires `val_per_core` (proposed: 5) validators to operate securely — enough redundancy for liveness and BFT margins under the active assignment scheme. Changing `num_cores` therefore has direct consequences for the active set:

* More cores → more validators (and more aggregate stake securing them).
* Fewer cores → fewer validators (the cost saving this amendment is designed to capture).

### A new on-chain mechanism is needed

RFC-17 and this amendment govern the *market-side* quantities (`num_cores`, `reserve_price`, allocations). They do not adjust the *active validator set*. Realising the cost benefits of supply contraction requires a separate on-chain mechanism that resizes the active set in response to changes in `num_cores`. The specification of that mechanism is out of scope here, but it is a precondition for the cost saving to materialise — without it, contracting cores merely leaves validators idle.

### Validator floor: `MIN_VALIDATORS = 250`

Not every validator-set size is sustainable. Below a threshold, security guarantees (finality, economic security of NPoS, finality stalls under adverse conditions) degrade beyond what the protocol can accept. We therefore propose a hard floor on the active set, independent of the market-side supply rule:

* `MIN_VALIDATORS` = **250**.

Crucially, this floor is *not* coupled to `MIN_CORES`. The market may contract cores all the way down to `MIN_CORES = 10` under prolonged low demand — but the validator set never falls below 250 regardless. The two minimums target different concerns: `MIN_CORES` bounds the market's price-discovery liquidity floor; `MIN_VALIDATORS` bounds the network's security floor.

### Combined scaling rule

The active validator set scales as:

```
active_validators = max(MIN_VALIDATORS, num_cores * val_per_core)
```

Concretely, with the proposed defaults:

| num_cores | num_cores × val_per_core | active_validators | scaling regime |
| --------- | ------------------------ | ----------------- | -------------- |
| 10        | 50                       | 250 (floor)       | floor binding — validator cost fixed |
| 30        | 150                      | 250 (floor)       | floor binding |
| 49        | 245                      | 250 (floor)       | floor binding |
| 50        | 250                      | 250 (break-even)  | floor exactly satisfied |
| 60        | 300                      | 300               | cores and validators scale together |
| 100       | 500                      | 500               | cores and validators scale together |

The break-even point at `num_cores = 50` is where `num_cores × val_per_core` first equals `MIN_VALIDATORS`. **Below 50 cores, contracting supply does not reduce validator cost** — only the operational overhead of unused cores. **At or above 50 cores, the cost saving is 1:1**: every core dropped removes 5 validators from the active set.

### Implications for governance

* `MIN_VALIDATORS` should be set with reference to network-security analyses (finality margins, slashing economics, NPoS bonding distribution), not market dynamics. It should not be tuned in response to short-term price or supply pressure.
* `val_per_core` is similarly security-driven and is expected to remain stable unless the assignment scheme or BFT parameters change materially.
* `MIN_CORES` is a market-side parameter and may be tuned more freely; it has no direct effect on validator count while the floor is binding.

### Transition

* At activation, `num_cores` is set to the current number of cores offered under the existing RFC-17 design.
* `TARGET_CONSUMPTION_RATE` moves from 0.9 to 0.8 immediately for the price rule.
* The supply scaling rule applies starting from the first full `BULK_PERIOD` after activation. The rolling window begins accumulating `cores_sold` from that round.
* `val_per_core` is initialised to 5 and is not expected to require adjustment unless validator architecture changes materially.

### Governance Parameters

The following are added to the governance-adjustable set defined in RFC-17:

* `SCALE_UP_THRESHOLD`
* `POST_EXPANSION_CONSUMPTION`
* `SCALE_DOWN_WINDOW`
* `MIN_CORES`
* `MAX_CORES`
* `val_per_core`
* `MIN_VALIDATORS`

`TARGET_CONSUMPTION_RATE` (now 0.8) remains governance-adjustable and is the shared equilibrium target for both the price rule and the contraction branch of the supply rule. The post-expansion landing rate (`POST_EXPANSION_CONSUMPTION`) should always be set above `TARGET_CONSUMPTION_RATE` so the price-signal headroom is preserved.

## Implications

* **Steady-state cost.** Equilibrium consumption at 80% means the protocol carries ~20% structural headroom in the supply baseline. This is the cost of preserving the price signal under demand growth: a higher headroom in exchange for a more informative price.
* **Price signal persists through expansion.** Under sustained demand growth, every saturated round still triggers a saturation-magnitude reserve bump, and post-expansion rounds remain above the price target until demand abates. Existing tenants get a continuously updating signal of marginal demand rather than a single bump followed by silence.
* **Sustained above-target consumption tames, but does not silence, the price.** At sustained 90% consumption (the post-expansion landing point), reserve price grows by ≈ 28% per round — substantial but well below the 65%/round of the no-scaling 100% case. Over seven rounds, the contrast is roughly 5.4× vs 39×. The mechanism keeps the direction of the price signal intact without amplifying it to a runaway.
* **Validator-set cost decoupling below 50 cores.** Because `MIN_VALIDATORS = 250` is independent of `num_cores`, contracting below 50 cores produces no validator-cost saving. Above 50 cores, the saving is linear (5 validators per core dropped). See the *Cores and Validators* section.
* **One-shot manipulation is self-correcting.** A successful expansion attack inflates supply temporarily and is undone within `SCALE_DOWN_WINDOW + 1` rounds after the attacker leaves.
* **Sustained attacks face compounding cost against compounding effect.** Attackers cannot grow the effect faster than they grow their bill, and `reserve_price` rises alongside every saturated round.
* **Genuine attrition contracts gradually.** Real demand drops are absorbed across the rolling window rather than over-corrected in a single round, leaving headroom for demand to return.
* **Coherent shared equilibrium.** Price and the contraction branch both target 80%, so governance changes to `TARGET_CONSUMPTION_RATE` automatically realign them. Expansion (which targets `POST_EXPANSION_CONSUMPTION`) is the only piece that may need a paired adjustment to preserve the headroom invariant.
