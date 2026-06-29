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
  MIN_CORES: number;
  MAX_CORES: number;

  // Validator scaling (amendment §Cores and Validators)
  val_per_core: number;
  MIN_VALIDATORS: number;
  /**
   * Fixed system cores (e.g. system parachains) that are NOT auctioned on the
   * market but still require val_per_core validators each. They sit outside the
   * dynamic supply rule entirely; they only add to the active validator count:
   *   active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) × val_per_core)
   */
  SYSTEM_CORES: number;

  // Validator economics (each round ≈ one BULK_PERIOD ≈ 28 days ≈ 1 month).
  // NOTE: both lines below are protocol-paid *income* to the validator, not
  // expenses the validator bears. REWARD_FOR_OPERATIONAL_COSTS is a USD-
  // denominated payment intended to cover the validator's real-world operating
  // costs; STAKE_INCENTIVES is the DOT-denominated staking reward. The
  // validator's actual operating cost is not currently modelled here.
  // Together they set the per-core marginal cost (val_per_core × payout) that
  // gates supply expansion — see coreMarginalCostDot in validators.ts.
  REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR: number;
  STAKE_INCENTIVES_DOT_PER_VALIDATOR: number;
  DOT_USD_RATE: number; // USD per 1 DOT — used to combine USD and DOT figures

  // Initial state
  initial_num_cores: number;
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
  // 45 is the smallest integer floor such that a saturated round's
  // ceil(n / POST_EXPANSION_CONSUMPTION) − n adds ≥ 5 cores (at n = 45,
  // ceil(45/0.9) − 45 = 5). Keeps post-collapse recovery from getting stuck
  // in tiny +1/+2 expansion steps.
  MIN_CORES: 45,
  MAX_CORES: 100,
  val_per_core: 5,
  MIN_VALIDATORS: 250,
  SYSTEM_CORES: 19,
  // 0 during the current transitionary period: no USD-denominated reward is
  // paid; validators are compensated entirely through the DOT staking
  // incentive below.
  REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR: 0,
  STAKE_INCENTIVES_DOT_PER_VALIDATOR: 1726,
  DOT_USD_RATE: 2,
  initial_num_cores: 50,
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
  num_cores: number;
  reserve_price: number;
  opening_price: number;

  // Auction
  total_demand: number; // sum of bidder quantities
  unique_bidders: number;
  clearing_price: number;

  // Allocation
  allocations: Allocation[];
  cores_sold: number; // total cores allocated (renewals + new sales)
  new_sales_count: number; // cores allocated to non-tenants
  renewals_count: number; // cores allocated to entities who were tenants at start
  consumption_rate: number;
  rolling_avg_consumption: number; // avg over last SCALE_DOWN_WINDOW rounds, used by the supply rule
  revenue: number;

  // Validator set serving the current round (amendment §Cores and Validators).
  active_validators: number;

  // Post-round state propagated to next round
  next_reserve_price: number;
  next_num_cores: number;
  next_tenants: Record<string, TenantInfo>;
}
