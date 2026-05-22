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

  // Validator economics (each round ≈ one BULK_PERIOD ≈ 28 days ≈ 1 month)
  OPERATIONAL_COST_USD_PER_VALIDATOR: number;
  STAKE_INCENTIVES_DOT_PER_VALIDATOR: number;
  DOT_USD_RATE: number; // USD per 1 DOT — used to combine USD and DOT figures

  // Initial state
  initial_num_cores: number;
  initial_reserve_price: number;
}

export const DEFAULT_PARAMETERS: Parameters = {
  K: 2.5,
  P_MIN: 1,
  MIN_INCREMENT: 100,
  PRICE_MULTIPLIER: 3,
  MIN_OPENING_PRICE: 150,
  TARGET_CONSUMPTION_RATE: 0.8,
  SCALE_UP_THRESHOLD: 1.0,
  POST_EXPANSION_CONSUMPTION: 0.9,
  SCALE_DOWN_WINDOW: 3,
  MIN_CORES: 10,
  MAX_CORES: 100,
  val_per_core: 5,
  MIN_VALIDATORS: 250,
  OPERATIONAL_COST_USD_PER_VALIDATOR: 300,
  STAKE_INCENTIVES_DOT_PER_VALIDATOR: 100,
  DOT_USD_RATE: 5,
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
