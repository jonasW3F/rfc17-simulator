import type { Parameters } from "./types";

/**
 * Core accounting.
 *
 * `num_cores` is the number of cores OFFERED ON THE MARKET (RFC-17 semantics,
 * matching the broker pallet's `cores_offered`). System cores are assigned to
 * system parachains outside the market: they are never sold and do not enter
 * consumption. They do need validators, so the validator set is sized on the
 * total `num_cores + SYSTEM_CORES`.
 *
 * The market floor is not a free parameter: MIN_VALIDATORS validators are run
 * at any price and serve MIN_VALIDATORS / val_per_core cores in total; after
 * the system cores are assigned, the rest is the smallest market offer.
 */

/** Lowest total core count: the cores MIN_VALIDATORS validators serve. */
export function minTotalCores(params: Parameters): number {
  return params.val_per_core > 0
    ? Math.ceil(params.MIN_VALIDATORS / params.val_per_core)
    : 0;
}

/** Lowest market offer: the floor total minus the system cores. */
export function minMarketCores(params: Parameters): number {
  return Math.max(0, minTotalCores(params) - params.SYSTEM_CORES);
}

/** Total cores (market + system) for a given market offer. */
export function totalCores(numCores: number, params: Parameters): number {
  return numCores + params.SYSTEM_CORES;
}
