export interface Parameters {
  // RFC-17 price rule
  K: number;
  P_MIN: number;
  MIN_INCREMENT: number;
  PRICE_MULTIPLIER: number;
  MIN_OPENING_PRICE: number;
  TARGET_CONSUMPTION_RATE: number;

  // Amendment supply rule (asymmetric, memory-based)
  SCALE_UP_THRESHOLD: number; // consumption at which expansion fires (e.g. 1.0)
  /**
   * Consumption rate the expansion rule aims to land at. Set above
   * TARGET_CONSUMPTION_RATE so post-expansion rounds stay above the price
   * target, leaving the reserve_price exponential update room to keep
   * working under genuine demand growth.
   */
  POST_EXPANSION_CONSUMPTION: number;
  SCALE_DOWN_WINDOW: number; // rounds in the rolling-avg contraction window
  /**
   * Hard ceiling on num_cores (market cores). The floor is not a parameter:
   * it is ceil(MIN_VALIDATORS / val_per_core) − SYSTEM_CORES, the market
   * offer left after the consensus-minimum validator set's cores are assigned
   * to system parachains — see minMarketCores in cores.ts.
   */
  MAX_CORES: number;

  // Validator scaling (amendment §Cores and Validators)
  val_per_core: number;
  MIN_VALIDATORS: number;
  /**
   * Cores assigned to system parachains, outside the market. They are never
   * sold and do not enter consumption (consumption = cores_sold / num_cores,
   * as the broker pallet computes it). They do need validators:
   *   active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core)
   * and they reduce the market floor: ceil(MIN_VALIDATORS / val_per_core) − SYSTEM_CORES.
   * They are funded by the budget inside the validator floor, not by the market.
   */
  SYSTEM_CORES: number;

  // Validator payout (metanode budget model; each round ≈ one month).
  // Every active validator is paid two protocol-funded lines:
  //   1. a self-stake incentive in DOT: SELF_STAKE_YIELD × SELF_STAKE_T_DOT per
  //      year (the yield the budget guarantees on a self-stake of T), and
  //   2. a salary in dotUSD, minted by the DAP against its own DOT at
  //      COLLATERAL_RATIO. The DOT is locked, not spent, but it is committed
  //      for the whole issuance step, so it counts as budget.
  // Both are income to the validator. The DOT the protocol *commits* per
  // validator per round is
  //   committed = SELF_STAKE_YIELD × SELF_STAKE_T_DOT / 12
  //             + COLLATERAL_RATIO × SALARY_USD_PER_VALIDATOR / DOT_USD_RATE
  // and the per-core marginal cost (val_per_core × committed) gates supply
  // expansion — see coreMarginalCostDot in validators.ts.
  SELF_STAKE_YIELD: number; // annual yield guaranteed on self-stake at T (e.g. 0.30)
  SELF_STAKE_T_DOT: number; // self-stake threshold T, in DOT (e.g. 30 000)
  SALARY_USD_PER_VALIDATOR: number; // dotUSD salary per validator per round (month)
  COLLATERAL_RATIO: number; // DOT locked per $1 of dotUSD minted (e.g. 2.0 = 200%)
  DOT_USD_RATE: number; // USD per 1 DOT — converts the USD salary into DOT

  // Initial state
  initial_num_cores: number; // market cores
  initial_reserve_price: number;
}

export const DEFAULT_PARAMETERS: Parameters = {
  K: 2.5,
  P_MIN: 1,
  MIN_INCREMENT: 300,
  PRICE_MULTIPLIER: 3,
  MIN_OPENING_PRICE: 150,
  TARGET_CONSUMPTION_RATE: 0.8,
  SCALE_UP_THRESHOLD: 1.0,
  POST_EXPANSION_CONSUMPTION: 0.9,
  SCALE_DOWN_WINDOW: 3,
  MAX_CORES: 81, // market cores; + 19 system = 100 total → 500 validators
  val_per_core: 5,
  // Metanode budget anchor: 320 validators are needed for consensus at any
  // price. They serve 320 / 5 = 64 cores; 19 are system cores, so the market
  // floor is 45. A saturated round at the floor expands by ceil(45/0.9) − 45 = 5.
  MIN_VALIDATORS: 320,
  SYSTEM_CORES: 19,
  // Metanode budget (v4, Sep 2026): 30% yield at T = 30k DOT → 750 DOT/month;
  // $2,000/month dotUSD salary minted at 200% collateral; DOT at $1.00.
  SELF_STAKE_YIELD: 0.3,
  SELF_STAKE_T_DOT: 30000,
  SALARY_USD_PER_VALIDATOR: 2000,
  COLLATERAL_RATIO: 2,
  DOT_USD_RATE: 1,
  initial_num_cores: 45, // the market floor (320 validators − 19 system cores)
  initial_reserve_price: 50,
};

export interface Bidder {
  id: string;
  wtp: number;
  quantity: number;
}

export interface Allocation {
  bidderId: string;
  cores: number;
  pricePaid: number; // per-core price (always equals clearing_price in this model)
  totalPaid: number; // cores * pricePaid
  isRenewer: boolean; // was a tenant at start of round
}

export interface RoundInput {
  bidders: Bidder[];
}

export interface TenantInfo {
  cores: number;
  lastWtp: number;
}

export interface RoundResult {
  round: number;

  // Pre-round state
  num_cores: number; // market cores offered this round
  system_cores: number; // SYSTEM_CORES in force this round (outside the market)
  reserve_price: number;
  opening_price: number;

  // Auction
  total_demand: number; // sum of bidder quantities
  unique_bidders: number;
  clearing_price: number;

  // Allocation
  allocations: Allocation[];
  cores_sold: number; // market cores allocated (renewals + new sales)
  new_sales_count: number; // cores allocated to non-tenants
  renewals_count: number; // cores allocated to entities who were tenants at start
  consumption_rate: number; // cores_sold / num_cores (system cores excluded)
  rolling_avg_consumption: number; // avg sold over window / num_cores
  revenue: number;

  // Validator set serving the current round (amendment §Cores and Validators).
  active_validators: number;
  // Budget-neutrality gate: the per-core marginal cost (DOT) the clearing
  // price had to cover this round, and whether a saturated round was held
  // back because it did not.
  core_marginal_cost: number;
  expansion_gated: boolean;

  // Post-round state propagated to next round
  next_reserve_price: number;
  next_num_cores: number; // market cores
  next_tenants: Record<string, TenantInfo>;
}
