# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This is a **React/TypeScript simulation playground** for Polkadot RFC-0017 (Coretime Market Redesign) and its 2026-05-21 amendment (Dynamic Scaling of Available Cores).

- **Stack**: Vite + React 18 + TypeScript + Tailwind + Recharts + Zustand. Vitest for unit tests.
- **Run**: `npm install`, then `npm run dev` (binds to `localhost:5173`, falls back if busy).
- **Test**: `npm test` runs Vitest. Engine and parser have unit tests (`src/simulation/*.test.ts`).
- **Type-check**: `npx tsc --noEmit -p .`

## Code layout

- `src/simulation/engine.ts` — pure per-round resolver. `runRound(state, input, params) → RoundResult` plus `advanceState` to chain rounds. Truthful-bidding assumption: each bidder reveals `(wtp, quantity)`, the engine expands into unit-bids, caps at `opening_price`, sorts descending, and picks the top `num_cores`.
- `src/simulation/cores.ts` — core accounting: `minTotalCores` (= `ceil(MIN_VALIDATORS / val_per_core)`), `minMarketCores` (minus `SYSTEM_CORES`), `totalCores`. Implements the RFC-17 reserve-price update and the amendment's supply-scaling rule, including the renewal-floor clamp.
- `src/simulation/types.ts` — `Parameters`, `Bidder`, `Allocation`, `RoundResult`, plus `DEFAULT_PARAMETERS` (sourced from the spec table in this file).
- `src/simulation/parse.ts` — CSV and JSON schedule parsers for Batch mode.
- `src/store.ts` — Zustand store holding `params`, `state`, `history`, `stagedBidders`, plus actions (`submitRound`, `runBatch`, `prefillFromTenants`, etc.).
- `src/components/` — `Chart` (dual-axis Recharts), `ManualMode` (staging + Auto-renew), `BatchMode` (upload + preview), `Settings`, `Statistics`.
- `src/App.tsx` — tab shell (Simulation / Statistics / Settings) and mode toggle (Manual / Batch).

## Modelling choices to keep consistent

- **Bidder identity persists across rounds.** Winners become tenants automatically (`state.tenants`). The amendment's renewal-floor clamp (`num_cores_{t+1} ≥ renewals_t`) uses this.
- **No spec-style renewal phase.** Under truthful bidding, every tenant who wants to keep cores must re-bid; tenants whose WTP < `clearing_price` drop out (renewing would cost ≥ clearing). The engine flags winning-tenant allocations with `isRenewer: true` and applies `PENALTY` when `penalty_active` for stats, but renewals are not a separate auction phase.
- **Settings tab is live.** Parameter edits take effect on the next `submitRound`. Initial-state fields (`initial_num_cores`, `initial_reserve_price`) only apply while `history.length === 0`; after that the user must reset to re-seed.
- **Budget-neutrality gate on expansion.** Expansion fires only when consumption is 100% **and** `clearing_price ≥ core_marginal_cost`, where `core_marginal_cost = val_per_core × committed_dot_per_validator`. Adding a core activates `val_per_core` validators; the DAP commits DOT for each (the self-stake top-up that keeps the enlarged set at the guaranteed yield, plus the collateral locked behind the dotUSD salary). Coretime revenue flows to the DAP buffer, so a core is only added when the income it earns (the clearing/closing price) covers that commitment. This is now part of `resources/rfc17-amendment.md` (§Budget-Neutral Validator Scaling) and is the user's key design idea — do **not** remove it. It also defends against validators inflating their own active set: a validator cluster never bids above its profit (a fraction of payout), which is below the full committed cost, so it can never lift the clearing price to the threshold on its own. Validators are modelled as income-earners (both payout lines are protocol-paid income, never expenses). The regression scenarios in `resources/scenarios/` set `SELF_STAKE_YIELD: 0` and `SALARY_USD_PER_VALIDATOR: 0` (nothing paid → `core_marginal_cost` → 0) to disable the gate and test the base supply rule in isolation.
- **`num_cores` is the market offer; system cores are outside it and not in consumption.** This matches the broker pallet (`cores_offered` / `cores_sold` exclude reserved cores). `consumption_rate = cores_sold / num_cores`; system cores are never sold and never counted. They do need validators: `active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core)`. They are funded by the budget inside the validator floor, not by the market (user decision, 8 Oct 2026, after briefly trying a "count system cores as consumed" variant — do not reintroduce that; it biases the price rule by a supply-dependent amount).
- **The market floor is derived, not a parameter.** 320 validators are needed for consensus at any price; they serve `ceil(MIN_VALIDATORS / val_per_core) = 64` cores, 19 of which are system cores, so `minMarketCores = 45`. There is no `MIN_CORES` parameter; Settings specifies `MIN_VALIDATORS`, `val_per_core`, `SYSTEM_CORES` and shows the derived floor. `MAX_CORES` is a market count (81 → 100 cores in total → 500 validators). Adding a system core either lowers the market floor by one (same validators) or is paired with +`val_per_core` on `MIN_VALIDATORS` (more validators, market untouched) — the amendment spells out both options.
- **Zero offered cores is a valid state** (system cores can take the whole floor): no sale, clearing stays at reserve, consumption reads 0.

## Authoritative specs

- `resources/rfc17.md` — original RFC-0017. Defines the three-phase `BULK_PERIOD` (Market / Renewal / Settlement), the clearing-price Dutch auction, the renewal `PENALTY`, and the exponential `reserve_price` adjustment rule.
- `resources/Polkadot Issuance Outlook & New Budget for Metanodes.md` — the metanode budget (v4, 29 Sep 2026): 320 validators, each paid a $2,000/month dotUSD salary minted by the DAP at 200% collateral plus a 30% self-stake yield at T = 30k DOT. Source of the validator payout parameters and the committed-DOT cost basis.
- `resources/rfc17-amendment.md` — amendment introducing dynamic `num_cores` scaling and budget-neutral validator scaling. **Asymmetric**: a single 100% round expands supply so that the post-expansion consumption lands at `POST_EXPANSION_CONSUMPTION` (default 0.9), which sits *above* `TARGET_CONSUMPTION_RATE` (default 0.8). The 10pp gap is "price-signal headroom" — it keeps the reserve-price exponential update positive after expansion fires, so genuine demand growth keeps producing a price reaction. Contraction is driven by a rolling-window average of recent sales (default 3 rounds) and is clamped so it can only shrink supply — closing the "stuck slack" attack where a one-shot expansion would otherwise leave supply permanently above demand.

Treat these as the source of truth for any modelling decision. If something in code disagrees with the specs, the specs win unless the user says otherwise.

## Mechanics the simulator must model

A correct end-to-end period simulation has to chain these steps in order:

0. **Core accounting.** `num_cores` is the market offer; system cores are outside it (`consumption_rate = cores_sold / num_cores`) but need validators.
1. **Dutch auction over `MARKET_PERIOD` (14 days).** Price descends linearly from `opening_price = max(MIN_OPENING_PRICE, PRICE_MULTIPLIER * reserve_price)` to `reserve_price`. Bids at or below the current clock price are accepted; bids above it are not. Resolution sets a single uniform `clearing_price`.
2. **Renewals over `RENEWAL_PERIOD` (7 days).** Current tenants who didn't win equivalent cores in the market may renew at `clearing_price * PENALTY`. The `PENALTY` is only active when `unique_bidders + potential_renewers > num_cores`; otherwise renewers pay `clearing_price` flat. Allocation tie-breaks: existing renewable-core holders cannot be displaced; among displaceable bidders, lowest bids drop first.
3. **Reserve-price update.** `price_candidate = reserve_price * exp(K * (consumption_rate - TARGET_CONSUMPTION_RATE))`, floored at `P_MIN`. At 100% consumption, if the candidate increase is below `MIN_INCREMENT`, use `reserve_price + MIN_INCREMENT` instead.
4. **Supply update (amendment, asymmetric, with budget-neutrality gate).** After step 3: expansion fires only when consumption is at 100% **and** `clearing_price ≥ core_marginal_cost`, where `core_marginal_cost = val_per_core × committed_dot_per_validator` (see *Default parameters*). When both hold, set `next_num_cores = ceil(cores_sold / POST_EXPANSION_CONSUMPTION)` (default 0.9) so the next round lands at ~90% consumption — above the price target, preserving the price signal. Otherwise (including saturated rounds where `clearing_price < core_marginal_cost`, flagged `expansion_gated` in the result), compute the rolling average of `cores_sold` over the last `SCALE_DOWN_WINDOW` rounds (default 3, inclusive of the current round) and set `memory_target = ceil(avg_sold / TARGET_CONSUMPTION_RATE)`; the next supply is `min(num_cores, memory_target)` — the contraction branch can never expand (after a saturated round it holds). Final result is clamped to `[max(renewals, ceil(MIN_VALIDATORS / val_per_core) − SYSTEM_CORES), MAX_CORES]`. The gate keys off the **clearing** (closing) price — the income a core actually earns and pays into the DAP buffer. Because `core_marginal_cost` is the *full* committed DOT (well above what a validator cluster, which bids only up to its profit, would ever pay), a saturation that clears the gate is genuine demand paying more than cost; validators alone cannot push the clearing price to the threshold.

Equilibrium of the combined system is **80% consumption** for both price and contraction; expansion intentionally overshoots to 90% to keep the price exponential positive on the next round. Worked examples in the amendment (one-shot grifter attack, severe attrition, sustained-demand-growth) are the canonical regression cases. The simulation state carries `recentSold: number[]` alongside `tenants` and the price/supply baselines so the contraction window survives across rounds.

## Default parameters (from the specs)

| Parameter | Value | Source |
|---|---|---|
| `TARGET_CONSUMPTION_RATE` | 0.8 | amendment (RFC-17's 0.9 → 0.8 to open price-signal headroom) |
| `K` | 2–3 (default 2.5) | RFC-17 |
| `P_MIN` | 1 DOT | RFC-17 |
| `MIN_INCREMENT` | 300 DOT | RFC-17 proposes 100; raised to 300 so a saturated reserve recovers quickly after a collapse |
| `MIN_OPENING_PRICE` | 150 DOT | RFC-17 |
| `PRICE_MULTIPLIER` | 3 | RFC-17 |
| `PENALTY` | 1.30 | RFC-17 |
| `SCALE_UP_THRESHOLD` | 1.0 | amendment |
| `POST_EXPANSION_CONSUMPTION` | 0.9 | amendment |
| `SCALE_DOWN_WINDOW` | 3 rounds | amendment |
| market floor / `MAX_CORES` | 45 / 81 market cores | floor is derived: `ceil(MIN_VALIDATORS / val_per_core) − SYSTEM_CORES` = 64 − 19 = 45; `MAX_CORES` = 81 → 100 cores in total → 500 validators |
| `val_per_core` | 5 | amendment — load-bearing in `active_validators` and the per-core marginal cost |
| `MIN_VALIDATORS` | 320 | metanode budget anchor (set reduced from 600); needed for consensus at any price; sets the core floor |
| `SYSTEM_CORES` | 19 | cores assigned to system parachains outside the market: never sold, not in consumption; `active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core)` |
| `initial_num_cores` | 45 | the market floor |
| `SELF_STAKE_YIELD` | 0.30 | metanode budget — yield the budget guarantees on a self-stake of T (vested); per validator per round = `SELF_STAKE_YIELD × SELF_STAKE_T_DOT / 12` = 750 DOT |
| `SELF_STAKE_T_DOT` | 30 000 DOT | metanode budget — self-stake threshold T |
| `SALARY_USD_PER_VALIDATOR` | 2 000 USD | metanode budget — dotUSD salary per node per month ($1,000 salary + $650 hardware + $350 premium); the doc also tests 2 500 and 3 000 |
| `COLLATERAL_RATIO` | 2.0 | metanode budget — the DAP mints dotUSD against its own DOT at 200% (liquidation at 120%); the locked DOT is committed for the whole issuance step |
| `DOT_USD_RATE` | 1.00 USD | metanode budget baseline ($1.18 spot on 25 Sep 2026); converts the salary into DOT, so a lower price raises the gate threshold |
All are governance-adjustable; the simulator should treat them as configuration, not constants.

**Per-core marginal cost and the expansion gate.** `core_marginal_cost = val_per_core × committed_dot_per_validator`, where `committed_dot_per_validator = SELF_STAKE_YIELD × SELF_STAKE_T_DOT / 12 + COLLATERAL_RATIO × SALARY_USD_PER_VALIDATOR / DOT_USD_RATE` (750 + 4 000 = 4 750 DOT at the defaults, so 23 750 DOT per core). It is the DOT the DAP commits by bringing one new market core online: one core activates `val_per_core` validators, each of which needs its self-stake top-up (so the enlarged set still earns the guaranteed yield) and its salary collateral. The basis is **committed DOT, not payout**: the collateral is locked rather than spent, but it is unavailable for the rest of the step, so it is what the budget has to cover. It is **static in `num_cores`** (no reward dilution is modelled) and **price-dependent** (at $0.50 it is 43 750 DOT per core, at $1.50 about 17 083). Supply expansion is gated on `clearing_price ≥ core_marginal_cost` — a core is only added when the income it earns (the clearing/closing price, which flows to the DAP buffer) covers its marginal cost; see step 4. Setting both payout lines to 0 (`SELF_STAKE_YIELD = 0`, `SALARY_USD_PER_VALIDATOR = 0`) makes `core_marginal_cost = 0`, disabling the gate (used by the regression scenarios, which predate it). Debt interest, redemptions and the buffer-inflow ceiling on the set size are not modelled. Defined in `src/simulation/validators.ts` as `coreMarginalCostDot`; each `RoundResult` records `core_marginal_cost` and `expansion_gated`.
