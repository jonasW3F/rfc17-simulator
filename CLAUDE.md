# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This is a **React/TypeScript simulation playground** for Polkadot RFC-0017 (Coretime Market Redesign) and its 2026-05-21 amendment (Dynamic Scaling of Available Cores).

- **Stack**: Vite + React 18 + TypeScript + Tailwind + Recharts + Zustand. Vitest for unit tests.
- **Run**: `npm install`, then `npm run dev` (binds to `localhost:5173`, falls back if busy).
- **Test**: `npm test` runs Vitest. Engine and parser have unit tests (`src/simulation/*.test.ts`).
- **Type-check**: `npx tsc --noEmit -p .`

## Code layout

- `src/simulation/engine.ts` — pure per-round resolver. `runRound(state, input, params) → RoundResult` plus `advanceState` to chain rounds. Truthful-bidding assumption: each bidder reveals `(wtp, quantity)`, the engine expands into unit-bids, caps at `opening_price`, sorts descending, and picks top `num_cores`. Implements the RFC-17 reserve-price update and the amendment's supply-scaling rule, including the renewal-floor clamp.
- `src/simulation/types.ts` — `Parameters`, `Bidder`, `Allocation`, `RoundResult`, plus `DEFAULT_PARAMETERS` (sourced from the spec table in this file).
- `src/simulation/parse.ts` — CSV and JSON schedule parsers for Batch mode.
- `src/store.ts` — Zustand store holding `params`, `state`, `history`, `stagedBidders`, plus actions (`submitRound`, `runBatch`, `prefillFromTenants`, etc.).
- `src/components/` — `Chart` (dual-axis Recharts), `ManualMode` (staging + Auto-renew), `BatchMode` (upload + preview), `Settings`, `Statistics`.
- `src/App.tsx` — tab shell (Simulation / Statistics / Settings) and mode toggle (Manual / Batch).

## Modelling choices to keep consistent

- **Bidder identity persists across rounds.** Winners become tenants automatically (`state.tenants`). The amendment's renewal-floor clamp (`num_cores_{t+1} ≥ renewals_t`) uses this.
- **No spec-style renewal phase.** Under truthful bidding, every tenant who wants to keep cores must re-bid; tenants whose WTP < `clearing_price` drop out (renewing would cost ≥ clearing). The engine flags winning-tenant allocations with `isRenewer: true` and applies `PENALTY` when `penalty_active` for stats, but renewals are not a separate auction phase.
- **Settings tab is live.** Parameter edits take effect on the next `submitRound`. Initial-state fields (`initial_num_cores`, `initial_reserve_price`) only apply while `history.length === 0`; after that the user must reset to re-seed.

## Authoritative specs

- `resources/rfc17.md` — original RFC-0017. Defines the three-phase `BULK_PERIOD` (Market / Renewal / Settlement), the clearing-price Dutch auction, the renewal `PENALTY`, and the exponential `reserve_price` adjustment rule.
- `resources/rfc17-amendment.md` — amendment introducing dynamic `num_cores` scaling. **Asymmetric**: a single 100% round expands supply so that the post-expansion consumption lands at `POST_EXPANSION_CONSUMPTION` (default 0.9), which sits *above* `TARGET_CONSUMPTION_RATE` (default 0.8). The 10pp gap is "price-signal headroom" — it keeps the reserve-price exponential update positive after expansion fires, so genuine demand growth keeps producing a price reaction. Contraction is driven by a rolling-window average of recent sales (default 3 rounds) and is clamped so it can only shrink supply — closing the "stuck slack" attack where a one-shot expansion would otherwise leave supply permanently above demand.

Treat these as the source of truth for any modelling decision. If something in code disagrees with the specs, the specs win unless the user says otherwise.

## Mechanics the simulator must model

A correct end-to-end period simulation has to chain these steps in order:

1. **Dutch auction over `MARKET_PERIOD` (14 days).** Price descends linearly from `opening_price = max(MIN_OPENING_PRICE, PRICE_MULTIPLIER * reserve_price)` to `reserve_price`. Bids at or below the current clock price are accepted; bids above it are not. Resolution sets a single uniform `clearing_price`.
2. **Renewals over `RENEWAL_PERIOD` (7 days).** Current tenants who didn't win equivalent cores in the market may renew at `clearing_price * PENALTY`. The `PENALTY` is only active when `unique_bidders + potential_renewers > num_cores`; otherwise renewers pay `clearing_price` flat. Allocation tie-breaks: existing renewable-core holders cannot be displaced; among displaceable bidders, lowest bids drop first.
3. **Reserve-price update.** `price_candidate = reserve_price * exp(K * (consumption_rate - TARGET_CONSUMPTION_RATE))`, floored at `P_MIN`. At 100% consumption, if the candidate increase is below `MIN_INCREMENT`, use `reserve_price + MIN_INCREMENT` instead.
4. **Supply update (amendment, asymmetric).** After step 3: at 100% consumption, set `next_num_cores = ceil(cores_sold / POST_EXPANSION_CONSUMPTION)` (default 0.9) so the next round lands at ~90% consumption — above the price target, preserving the price signal. Otherwise, compute the rolling average of `cores_sold` over the last `SCALE_DOWN_WINDOW` rounds (default 3, inclusive of the current round) and set `memory_target = ceil(avg_sold / TARGET_CONSUMPTION_RATE)`; the next supply is `min(num_cores, memory_target)` — the contraction branch can never expand. Final result is clamped to `[max(renewals, MIN_CORES), MAX_CORES]`.

Equilibrium of the combined system is **80% consumption** for both price and contraction; expansion intentionally overshoots to 90% to keep the price exponential positive on the next round. Worked examples in the amendment (one-shot grifter attack, severe attrition, sustained-demand-growth) are the canonical regression cases. The simulation state carries `recentSold: number[]` alongside `tenants` and the price/supply baselines so the contraction window survives across rounds.

## Default parameters (from the specs)

| Parameter | Value | Source |
|---|---|---|
| `TARGET_CONSUMPTION_RATE` | 0.8 | amendment (RFC-17's 0.9 → 0.8 to open price-signal headroom) |
| `K` | 2–3 (default 2.5) | RFC-17 |
| `P_MIN` | 1 DOT | RFC-17 |
| `MIN_INCREMENT` | 100 DOT | RFC-17 |
| `MIN_OPENING_PRICE` | 150 DOT | RFC-17 |
| `PRICE_MULTIPLIER` | 3 | RFC-17 |
| `PENALTY` | 1.30 | RFC-17 |
| `SCALE_UP_THRESHOLD` | 1.0 | amendment |
| `POST_EXPANSION_CONSUMPTION` | 0.9 | amendment |
| `SCALE_DOWN_WINDOW` | 3 rounds | amendment |
| `MIN_CORES` / `MAX_CORES` | 10 / 100 | amendment |
| `val_per_core` | 5 | amendment (informational, not in formulas) |

All are governance-adjustable; the simulator should treat them as configuration, not constants.
