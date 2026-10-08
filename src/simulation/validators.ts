import type { Parameters } from "./types";

/**
 * Validator payout and the budget-neutrality gate.
 *
 * Under the metanode budget model every active validator is paid two lines:
 *   1. a self-stake incentive in DOT — the budget guarantees a yield of
 *      SELF_STAKE_YIELD on a self-stake of SELF_STAKE_T_DOT, and
 *   2. a dotUSD salary, minted by the DAP against its own DOT at
 *      COLLATERAL_RATIO. The DOT is locked rather than spent, but it is
 *      committed for the whole issuance step and so counts against the budget.
 *
 * Adding one market core activates `val_per_core` validators. For the
 * expansion to be budget-neutral, the income the core earns (the clearing
 * price, which flows to the DAP buffer) must cover the DOT the DAP commits
 * for those validators: the self-stake top-up that keeps the enlarged set at
 * the guaranteed yield, plus the collateral behind their salaries. The engine
 * gates expansion on `clearing_price ≥ coreMarginalCostDot`.
 */

/** One round ≈ one BULK_PERIOD ≈ one month. */
export const ROUNDS_PER_YEAR = 12;

/** Self-stake incentive per validator per round, in DOT (yield × T / 12). */
export function selfStakeIncentiveDot(params: Parameters): number {
  return (params.SELF_STAKE_YIELD * params.SELF_STAKE_T_DOT) / ROUNDS_PER_YEAR;
}

/** dotUSD salary per validator per round, expressed in DOT at the current rate. */
export function salaryDot(params: Parameters): number {
  return params.DOT_USD_RATE > 0
    ? params.SALARY_USD_PER_VALIDATOR / params.DOT_USD_RATE
    : 0;
}

/** DOT the DAP locks per validator per round to mint that salary. */
export function salaryCollateralDot(params: Parameters): number {
  return params.COLLATERAL_RATIO * salaryDot(params);
}

/** What a validator receives per round, in DOT-equivalent (self-stake + salary). */
export function validatorPayoutDot(params: Parameters): number {
  return selfStakeIncentiveDot(params) + salaryDot(params);
}

/**
 * What the protocol commits per validator per round, in DOT: the self-stake
 * incentive (paid out) plus the collateral locked behind the salary.
 */
export function validatorCommittedDot(params: Parameters): number {
  return selfStakeIncentiveDot(params) + salaryCollateralDot(params);
}

/**
 * Marginal cost of one market core (DOT/core): the DOT the DAP commits by
 * activating `val_per_core` more validators. Static in `num_cores`.
 */
export function coreMarginalCostDot(params: Parameters): number {
  return params.val_per_core * validatorCommittedDot(params);
}
