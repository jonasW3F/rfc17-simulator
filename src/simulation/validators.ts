import type { Parameters } from "./types";

/**
 * Core marginal cost — the supply-expansion gate threshold.
 *
 * Adding one market core activates `val_per_core` additional validators, each
 * paid `payout_per_validator` per round by the protocol. So the marginal cost
 * the chain incurs to bring a core online is `val_per_core × payout`. The
 * engine gates supply expansion on `clearing_price ≥ coreMarginalCost`:
 * a core is only added when the income it earns (the clearing/closing price)
 * covers the validator payout it triggers. `coreMarginalCost` is static in
 * `num_cores` (no reward dilution is modelled).
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
 * Marginal cost of one market core (DOT/core): the validator payout the chain
 * takes on by activating it, = val_per_core × per-validator payout.
 */
export function coreMarginalCostDot(params: Parameters): number {
  return params.val_per_core * validatorPayoutDot(params);
}
