import type {
  Allocation,
  Bidder,
  Parameters,
  RoundInput,
  RoundResult,
  TenantInfo,
} from "./types";

export interface SimulationState {
  round: number;
  num_cores: number;
  reserve_price: number;
  /** bidderId -> {cores held at start of this round, lastWtp from prior bid} */
  tenants: Record<string, TenantInfo>;
  /** cores_sold for every completed round (used by memory-based contraction). */
  recentSold: number[];
}

export function initialState(params: Parameters): SimulationState {
  return {
    round: 1,
    num_cores: params.initial_num_cores,
    reserve_price: params.initial_reserve_price,
    tenants: {},
    recentSold: [],
  };
}

export function openingPrice(reserve: number, params: Parameters): number {
  return Math.max(params.MIN_OPENING_PRICE, params.PRICE_MULTIPLIER * reserve);
}

/**
 * Resolve a single round given the current state and the round's bidders.
 *
 * Truthful-bidding assumption: each bidder reveals (wtp, quantity).
 * We expand into unit-bids, sort descending by effective price (capped at
 * opening_price per the Dutch-auction rule "bids above the current
 * descending price are not allowed"), and pick the top `num_cores`.
 *
 * Clearing price = price of the marginal unit, capped at opening_price
 * and floored at reserve_price. If demand < supply, clearing = reserve.
 *
 * Tenants who participated as bidders but whose effective wtp falls below
 * clearing_price are treated as having "dropped out" — we do not auto-renew
 * them, since renewal_price ≥ clearing_price under any active PENALTY.
 */
export function runRound(
  state: SimulationState,
  input: RoundInput,
  params: Parameters
): RoundResult {
  const opening = openingPrice(state.reserve_price, params);

  // Expand bidders into unit-bids. WTP is capped at opening_price because
  // bids cannot exceed the current descending clock; ties at the cap are
  // broken by larger quantity first (a simulation simplification of the
  // spec's "randomize winners at the opening price" rule).
  type UnitBid = { bidderId: string; effectiveWtp: number; trueWtp: number; qty: number };
  const unitBids: UnitBid[] = [];
  for (const b of input.bidders) {
    if (b.quantity <= 0 || b.wtp <= 0) continue;
    const eff = Math.min(b.wtp, opening);
    for (let i = 0; i < b.quantity; i++) {
      unitBids.push({
        bidderId: b.id,
        effectiveWtp: eff,
        trueWtp: b.wtp,
        qty: b.quantity,
      });
    }
  }

  // Sort: higher effective WTP first; among ties, larger total quantity first.
  unitBids.sort((a, b) =>
    b.effectiveWtp !== a.effectiveWtp
      ? b.effectiveWtp - a.effectiveWtp
      : b.qty - a.qty
  );

  const total_demand = unitBids.length;
  const unique_bidders = new Set(input.bidders.filter(b => b.quantity > 0 && b.wtp > 0).map(b => b.id)).size;
  const num_cores = state.num_cores;

  // Determine clearing price.
  let clearing_price: number;
  let winners: UnitBid[];
  if (total_demand === 0) {
    clearing_price = state.reserve_price;
    winners = [];
  } else if (total_demand <= num_cores) {
    // Some cores remain unsold (or it's an exact match) → clearing = reserve.
    clearing_price = state.reserve_price;
    winners = unitBids.filter(u => u.effectiveWtp >= clearing_price);
  } else {
    // Marginal unit-bid is the (num_cores)-th from the top (0-indexed: num_cores-1).
    const marginal = unitBids[num_cores - 1].effectiveWtp;
    clearing_price = Math.max(state.reserve_price, marginal);
    // Take the top num_cores units that meet or beat clearing.
    winners = unitBids.slice(0, num_cores);
  }

  // Aggregate winning unit-bids per bidder.
  const wonByBidder: Record<string, number> = {};
  for (const w of winners) {
    wonByBidder[w.bidderId] = (wonByBidder[w.bidderId] || 0) + 1;
  }

  // Build a WTP lookup for next-round tenant tracking.
  const wtpByBidder: Record<string, number> = {};
  for (const b of input.bidders) {
    if (b.quantity > 0 && b.wtp > 0) wtpByBidder[b.id] = b.wtp;
  }

  const allocations: Allocation[] = [];
  let renewals_count = 0;
  for (const [bidderId, cores] of Object.entries(wonByBidder)) {
    // Every winning bidder pays the uniform clearing price; we still tag
    // renewers (winners who were tenants in the prior round) so the chart
    // and statistics can show the renewed-vs-new-sales breakdown.
    const priorHolding = state.tenants[bidderId]?.cores ?? 0;
    const renewedCores = Math.min(cores, priorHolding);
    const newCores = cores - renewedCores;
    renewals_count += renewedCores;

    if (renewedCores > 0) {
      allocations.push({
        bidderId,
        cores: renewedCores,
        pricePaid: clearing_price,
        totalPaid: clearing_price * renewedCores,
        isRenewer: true,
      });
    }
    if (newCores > 0) {
      allocations.push({
        bidderId,
        cores: newCores,
        pricePaid: clearing_price,
        totalPaid: clearing_price * newCores,
        isRenewer: false,
      });
    }
  }

  const cores_sold = winners.length;
  const consumption_rate = num_cores > 0 ? cores_sold / num_cores : 0;
  const revenue = allocations.reduce((s, a) => s + a.totalPaid, 0);

  // Reserve-price update (RFC-17 §Reserve Price Adjustment).
  let price_candidate =
    state.reserve_price *
    Math.exp(params.K * (consumption_rate - params.TARGET_CONSUMPTION_RATE));
  price_candidate = Math.max(price_candidate, params.P_MIN);
  let next_reserve_price = price_candidate;
  if (consumption_rate >= 1.0) {
    if (price_candidate - state.reserve_price < params.MIN_INCREMENT) {
      next_reserve_price = state.reserve_price + params.MIN_INCREMENT;
    }
  }

  // Supply update (amendment §Asymmetric Scaling Rule).
  //
  // Asymmetric design: expansion is fast and bounded (a single saturated round
  // triggers +SCALE_UP_FACTOR); contraction is slow and memory-based (it sizes
  // supply so the rolling-window average sold equals TARGET_CONSUMPTION_RATE
  // of the new supply). The contraction branch never expands — only the
  // saturation trigger can grow supply. This closes the "stuck slack" attack
  // where a one-shot 100% manipulation would otherwise leave supply
  // permanently above demand and bleed price down to P_MIN.
  const recentWindow = [...state.recentSold, cores_sold].slice(
    -Math.max(1, params.SCALE_DOWN_WINDOW)
  );
  const avg_sold =
    recentWindow.reduce((s, v) => s + v, 0) / recentWindow.length;
  const rolling_avg_consumption = num_cores > 0 ? avg_sold / num_cores : 0;

  let raw_target: number;
  if (consumption_rate >= params.SCALE_UP_THRESHOLD) {
    // Size supply so this round's sold cores represent POST_EXPANSION_CONSUMPTION
    // of the new supply. Because that target sits above TARGET_CONSUMPTION_RATE,
    // the next round (if demand persists) stays above the price-rule's target
    // and reserve_price keeps rising — preserving the price signal under
    // genuine demand growth instead of immediately damping it.
    raw_target = Math.ceil(cores_sold / params.POST_EXPANSION_CONSUMPTION);
  } else {
    const memoryTarget = Math.ceil(avg_sold / params.TARGET_CONSUMPTION_RATE);
    raw_target = Math.min(num_cores, memoryTarget);
  }
  const next_num_cores = clamp(
    raw_target,
    Math.max(renewals_count, params.MIN_CORES),
    params.MAX_CORES
  );

  // Next-round tenants = current winners. lastWtp = the WTP they bid this
  // round (falls back to prior tenant lastWtp, or the clearing price as a
  // last resort if neither is available).
  const next_tenants: Record<string, TenantInfo> = {};
  for (const a of allocations) {
    const existing = next_tenants[a.bidderId];
    const cores = (existing?.cores ?? 0) + a.cores;
    const wtp =
      wtpByBidder[a.bidderId] ??
      state.tenants[a.bidderId]?.lastWtp ??
      clearing_price;
    next_tenants[a.bidderId] = { cores, lastWtp: wtp };
  }

  const new_sales_count = cores_sold - renewals_count;

  // Active validator set serving the current round's supply.
  const active_validators = Math.max(
    params.MIN_VALIDATORS,
    num_cores * params.val_per_core
  );

  return {
    round: state.round,
    num_cores,
    reserve_price: state.reserve_price,
    opening_price: opening,
    total_demand,
    unique_bidders,
    clearing_price,
    allocations,
    cores_sold,
    new_sales_count,
    renewals_count,
    consumption_rate,
    rolling_avg_consumption,
    revenue,
    active_validators,
    next_reserve_price,
    next_num_cores,
    next_tenants,
  };
}

export function advanceState(
  state: SimulationState,
  result: RoundResult
): SimulationState {
  return {
    round: state.round + 1,
    num_cores: result.next_num_cores,
    reserve_price: result.next_reserve_price,
    tenants: result.next_tenants,
    recentSold: [...state.recentSold, result.cores_sold],
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

export function makeBidder(id: string, wtp: number, quantity: number): Bidder {
  return { id, wtp, quantity };
}
