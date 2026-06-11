import type { Parameters } from "./types";

/**
 * Validator marginal profit per core — the supply-expansion gate threshold.
 *
 * A homogeneous validator cluster values activating itself on a core at its
 * profit: each validator nets `VALIDATOR_PROFIT_MARGIN` of its per-round payout,
 * and one core activates `val_per_core` validators. So the cluster would never
 * pay more than this per core (`P*`). The engine gates supply expansion on
 * `reserve_price > P*`: once the reserve clears P*, validators are priced out of
 * the auction entirely, so any saturation is genuine demand rather than
 * validators padding consumption to grow their own active set. `P*` is static
 * in `num_cores` (no reward dilution is modelled).
 */

/** Per-validator payout per round, in DOT (DOT staking reward + USD ops reward converted to DOT). */
export function validatorPayoutDot(params: Parameters): number {
  const opsRewardDot =
    params.DOT_USD_RATE > 0
      ? params.REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR / params.DOT_USD_RATE
      : 0;
  return params.STAKE_INCENTIVES_DOT_PER_VALIDATOR + opsRewardDot;
}

/**
 * Validator floor price P* (DOT per core): the most a homogeneous cluster will
 * pay for a core, = val_per_core × profit_margin × per-validator payout.
 */
export function validatorFloorPrice(params: Parameters): number {
  return (
    params.val_per_core * params.VALIDATOR_PROFIT_MARGIN * validatorPayoutDot(params)
  );
}
