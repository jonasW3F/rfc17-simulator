import { describe, expect, it } from "vitest";
import { advanceState, initialState, runRound } from "./engine";
import { DEFAULT_PARAMETERS } from "./types";

// Supply-rule tests isolate the base rule: no system cores, no validator
// floor (so the core floor ceil(MIN_VALIDATORS / val_per_core) is 0).
const BASE = { ...DEFAULT_PARAMETERS, SYSTEM_CORES: 0, MIN_VALIDATORS: 0 };

describe("runRound", () => {
  it("returns reserve price when demand falls short of supply", () => {
    const params = { ...BASE, initial_num_cores: 10, initial_reserve_price: 50 };
    const state = initialState(params);
    const res = runRound(
      state,
      { bidders: [{ id: "a", wtp: 100, quantity: 3 }] },
      params
    );
    expect(res.clearing_price).toBe(50);
    expect(res.cores_sold).toBe(3);
    expect(res.consumption_rate).toBeCloseTo(0.3);
  });

  it("sets clearing price to marginal unit-bid when demand exceeds supply", () => {
    const params = { ...BASE, initial_num_cores: 3, initial_reserve_price: 10, MIN_OPENING_PRICE: 1000, PRICE_MULTIPLIER: 100 };
    const state = initialState(params);
    const res = runRound(
      state,
      {
        bidders: [
          { id: "a", wtp: 100, quantity: 1 },
          { id: "b", wtp: 80, quantity: 1 },
          { id: "c", wtp: 60, quantity: 1 },
          { id: "d", wtp: 40, quantity: 1 },
        ],
      },
      params
    );
    expect(res.clearing_price).toBe(60);
    expect(res.cores_sold).toBe(3);
  });

  it("caps clearing price at opening_price when many bidders exceed it", () => {
    const params = { ...BASE, initial_num_cores: 2, initial_reserve_price: 10, MIN_OPENING_PRICE: 50, PRICE_MULTIPLIER: 3 };
    const opening = Math.max(50, 3 * 10); // 50
    const state = initialState(params);
    const res = runRound(
      state,
      {
        bidders: [
          { id: "a", wtp: 1000, quantity: 1 },
          { id: "b", wtp: 500, quantity: 1 },
          { id: "c", wtp: 200, quantity: 1 },
        ],
      },
      params
    );
    expect(res.opening_price).toBe(opening);
    expect(res.clearing_price).toBe(opening);
  });

  it("expands supply so post-expansion consumption lands at POST_EXPANSION_CONSUMPTION", () => {
    const params = {
      ...BASE,
      initial_num_cores: 10,
      initial_reserve_price: 50,
      MIN_OPENING_PRICE: 1000,
      PRICE_MULTIPLIER: 100,
      SELF_STAKE_YIELD: 0, // nothing paid → marginal cost 0 → gate off
      SALARY_USD_PER_VALIDATOR: 0,
    };
    const state = initialState(params);
    const res = runRound(
      state,
      { bidders: [{ id: "a", wtp: 200, quantity: 10 }] },
      params
    );
    expect(res.consumption_rate).toBe(1);
    // ceil(10 / 0.9) = ceil(11.11) = 12 → post-expansion consumption = 10/12 ≈ 83%.
    expect(res.next_num_cores).toBe(12);
  });

  it("contracts supply via memory-based rolling average", () => {
    const params = {
      ...BASE,
      initial_num_cores: 20,
      initial_reserve_price: 50,
    };
    const state = initialState(params);
    // Only 10 of 20 cores demanded → consumption = 50%.
    const r1 = runRound(
      state,
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      params
    );
    // Window = [10]; avg_sold = 10. memoryTarget = ceil(10 / 0.8) = 13.
    // raw_target = min(20, 13) = 13. clamp(13, max(0,1), 100) = 13.
    expect(r1.next_num_cores).toBe(13);
  });

  it("memory path never expands above current num_cores", () => {
    const params = {
      ...BASE,
      initial_num_cores: 11,
      initial_reserve_price: 50,
    };
    const state = initialState(params);
    // 10/11 ≈ 90.9% consumption, well above target. memoryTarget = ceil(10/0.8) = 13 > 11.
    // The contraction branch is clamped at num_cores, so we hold rather than expand.
    const res = runRound(
      state,
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      params
    );
    expect(res.next_num_cores).toBe(11);
  });

  it("recovers from a one-shot 'grifter' supply-expansion attack", () => {
    const params = {
      ...BASE,
      initial_num_cores: 10,
      initial_reserve_price: 50,
      MIN_OPENING_PRICE: 10000,
      PRICE_MULTIPLIER: 1000,
      // Freeze the reserve price so the test isolates supply dynamics.
      // K=0 zeroes the exponential update; MIN_INCREMENT=0 disables the
      // saturation-floor bump that otherwise jumps reserve at 100%.
      K: 0,
      MIN_INCREMENT: 0,
      SCALE_DOWN_WINDOW: 3,
      SELF_STAKE_YIELD: 0, // nothing paid → marginal cost 0 → gate off
      SALARY_USD_PER_VALIDATOR: 0,
    };
    let state = initialState(params);

    // Equilibrium real demand = TARGET (0.8) * 10 = 8 cores.
    const realBidders = [{ id: "real", wtp: 100, quantity: 8 }];

    // r1: 8/10 = 80% = target. avg=8, memoryTarget=ceil(8/0.8)=10, raw=min(10,10)=10. No change.
    let r = runRound(state, { bidders: realBidders }, params);
    expect(r.next_num_cores).toBe(10);
    state = advanceState(state, r);

    // r2: attacker adds 2 → 100% → expand to ceil(10/0.9)=12.
    r = runRound(
      state,
      {
        bidders: [...realBidders, { id: "attacker", wtp: 100, quantity: 2 }],
      },
      params
    );
    expect(r.consumption_rate).toBe(1);
    expect(r.next_num_cores).toBe(12);
    state = advanceState(state, r);

    // r3: attacker gone. num=12, demand=8, consumption=66.7%.
    // avg=(8+10+8)/3=8.67. memoryTarget=ceil(8.67/0.8)=11. raw=min(12,11)=11.
    r = runRound(state, { bidders: realBidders }, params);
    expect(r.next_num_cores).toBe(11);
    state = advanceState(state, r);

    // r4: num=11, demand=8. avg=(10+8+8)/3=8.67. memoryTarget=11. raw=min(11,11)=11. Hold.
    r = runRound(state, { bidders: realBidders }, params);
    expect(r.next_num_cores).toBe(11);
    state = advanceState(state, r);

    // r5: 100% round rolled out. avg=8, memoryTarget=ceil(8/0.8)=10. raw=min(11,10)=10.
    r = runRound(state, { bidders: realBidders }, params);
    expect(r.next_num_cores).toBe(10);
  });

  it("tracks tenants across rounds via advanceState, carrying lastWtp", () => {
    const params = { ...BASE, initial_num_cores: 5, initial_reserve_price: 10 };
    let state = initialState(params);
    const r1 = runRound(
      state,
      { bidders: [{ id: "alice", wtp: 100, quantity: 2 }] },
      params
    );
    state = advanceState(state, r1);
    expect(state.tenants).toEqual({ alice: { cores: 2, lastWtp: 100 } });
    expect(state.round).toBe(2);
    expect(state.recentSold).toEqual([2]);
  });

  it("computes active_validators = max(MIN_VALIDATORS, (num_cores + SYSTEM_CORES) * val_per_core)", () => {
    const run = (initial_num_cores: number) =>
      runRound(
        initialState({ ...DEFAULT_PARAMETERS, initial_num_cores }),
        { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
        { ...DEFAULT_PARAMETERS, initial_num_cores }
      );
    // Floor case: (30 + 19) × 5 = 245 < MIN_VALIDATORS = 320 → 320.
    expect(run(30).active_validators).toBe(320);
    // Break-even: (45 + 19) × 5 = 320 exactly — the metanode anchor is the market floor.
    expect(run(45).active_validators).toBe(320);
    // Scaling case: (80 + 19) × 5 = 495 > 320 → 495.
    expect(run(80).active_validators).toBe(495);
    expect(run(80).system_cores).toBe(19);
  });

  it("keeps system cores out of consumption", () => {
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 45, initial_reserve_price: 50 };
    // 36 of 45 market cores sold → exactly 80%; the 19 system cores do not count.
    const r = runRound(
      initialState(params),
      { bidders: [{ id: "a", wtp: 100, quantity: 36 }] },
      params
    );
    expect(r.consumption_rate).toBeCloseTo(0.8);
    expect(r.rolling_avg_consumption).toBeCloseTo(0.8);
    expect(runRound(initialState(params), { bidders: [] }, params).consumption_rate).toBe(0);
  });

  it("sizes expansion on the market offer; validators follow the total", () => {
    const params = {
      ...DEFAULT_PARAMETERS,
      initial_num_cores: 45,
      initial_reserve_price: 50,
      SELF_STAKE_YIELD: 0, // gate off
      SALARY_USD_PER_VALIDATOR: 0,
    };
    const res = runRound(
      initialState(params),
      { bidders: [{ id: "a", wtp: 100, quantity: 45 }] },
      params
    );
    // ceil(45 / 0.9) = 50 market cores → (50 + 19) × 5 = 345 validators next round.
    expect(res.next_num_cores).toBe(50);
    const next = runRound(advanceState(initialState(params), res), { bidders: [] }, params);
    expect(next.active_validators).toBe(345);
  });

  it("never contracts below MIN_VALIDATORS / val_per_core − SYSTEM_CORES, at any price", () => {
    // 320 / 5 − 19 = 45 market cores even with nothing sold.
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 45, initial_reserve_price: 50 };
    const res = runRound(initialState(params), { bidders: [] }, params);
    expect(res.next_num_cores).toBe(45);
    expect(res.active_validators).toBe(320);
    // Above the floor: 61 offered, 10 sold → ceil(10 / 0.8) = 13 → clamped to 45.
    const p61 = { ...params, initial_num_cores: 61 };
    const r61 = runRound(
      initialState(p61),
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      p61
    );
    expect(r61.next_num_cores).toBe(45);
    // A higher validator floor raises the market floor: 400 / 5 − 19 = 61.
    const p400 = { ...p61, MIN_VALIDATORS: 400 };
    expect(runRound(initialState(p400), { bidders: [] }, p400).next_num_cores).toBe(61);
    // More system cores lower it: 320 / 5 − 25 = 39.
    const p25 = { ...params, SYSTEM_CORES: 25 };
    expect(runRound(initialState(p25), { bidders: [] }, p25).next_num_cores).toBe(39);
  });

  it("survives a round with nothing offered (system cores took the whole floor)", () => {
    // 64 system cores on a 320-validator floor → market floor 0.
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 0, initial_reserve_price: 50, SYSTEM_CORES: 64 };
    const res = runRound(
      initialState(params),
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      params
    );
    expect(res.cores_sold).toBe(0);
    expect(res.clearing_price).toBe(50);
    expect(res.consumption_rate).toBe(0);
    expect(res.next_num_cores).toBe(0);
    expect(res.active_validators).toBe(320);
  });

  it("counts renewals separately from new sales", () => {
    // MIN_VALIDATORS 25 → core floor 5, so supply stays at 5 for round 2.
    const params = { ...BASE, initial_num_cores: 5, initial_reserve_price: 10, MIN_VALIDATORS: 25 };
    let state = initialState(params);
    const r1 = runRound(
      state,
      { bidders: [{ id: "alice", wtp: 100, quantity: 2 }] },
      params
    );
    state = advanceState(state, r1);
    expect(r1.renewals_count).toBe(0);
    expect(r1.new_sales_count).toBe(2);

    const r2 = runRound(
      state,
      {
        bidders: [
          { id: "alice", wtp: 100, quantity: 3 }, // 2 renewed + 1 new
          { id: "bob", wtp: 80, quantity: 1 }, // 1 new
        ],
      },
      params
    );
    expect(r2.renewals_count).toBe(2);
    expect(r2.new_sales_count).toBe(2);
    expect(r2.cores_sold).toBe(4);
  });

  it("applies MIN_INCREMENT when reserve update is too small at 100% consumption", () => {
    const params = {
      ...BASE,
      K: 0.001, // tiny exponent → tiny price candidate increase
      initial_num_cores: 10,
      initial_reserve_price: 50,
      MIN_INCREMENT: 100,
      MIN_OPENING_PRICE: 10000,
      PRICE_MULTIPLIER: 1000,
    };
    const state = initialState(params);
    const res = runRound(
      state,
      { bidders: [{ id: "a", wtp: 9999, quantity: 10 }] },
      params
    );
    expect(res.next_reserve_price).toBe(150); // 50 + MIN_INCREMENT
  });

  // Budget-neutrality gate: expansion requires saturation AND
  // clearing_price ≥ core_marginal_cost, where core_marginal_cost =
  // val_per_core × committed DOT per validator (self-stake incentive +
  // collateral behind the dotUSD salary). These params pin the self-stake line
  // at 0.04 × 30 000 / 12 = 100 DOT/month with no salary, so the marginal cost
  // is 5 × 100 = 500 DOT/core. The gate keys off the clearing (closing) price.
  const gateBase = {
    ...BASE,
    initial_num_cores: 10,
    MIN_OPENING_PRICE: 2000, // high enough that the test bids aren't capped
    SELF_STAKE_YIELD: 0.04,
    SELF_STAKE_T_DOT: 30000,
    SALARY_USD_PER_VALIDATOR: 0,
    COLLATERAL_RATIO: 2,
    DOT_USD_RATE: 1,
    val_per_core: 5, // marginal cost = 5 × 100 = 500
  };

  it("does NOT expand when saturated but clearing < marginal cost", () => {
    // 12 unit-bids at 200 on 10 cores → clears at 200 < marginal cost 500.
    const params = { ...gateBase, initial_reserve_price: 50 };
    const res = runRound(
      initialState(params),
      { bidders: [{ id: "a", wtp: 200, quantity: 12 }] },
      params
    );
    expect(res.consumption_rate).toBe(1);
    expect(res.clearing_price).toBe(200);
    expect(res.core_marginal_cost).toBe(500);
    expect(res.expansion_gated).toBe(true);
    expect(res.next_num_cores).toBe(res.num_cores); // clearing < cost → no expansion
  });

  it("counts the salary on a committed-DOT basis (collateral, not payout)", () => {
    // No self-stake line; $100 salary at 200% collateral with DOT = $1 →
    // 200 DOT committed per validator → 5 × 200 = 1,000 DOT/core.
    const params = {
      ...gateBase,
      initial_reserve_price: 50,
      SELF_STAKE_YIELD: 0,
      SALARY_USD_PER_VALIDATOR: 100,
    };
    // Clears at 600: covers the 500 DOT payout basis but not the 1,000 DOT
    // committed basis → gated.
    const res = runRound(
      initialState(params),
      { bidders: [{ id: "a", wtp: 600, quantity: 12 }] },
      params
    );
    expect(res.core_marginal_cost).toBe(1000);
    expect(res.expansion_gated).toBe(true);
    expect(res.next_num_cores).toBe(res.num_cores);
  });

  it("expands when saturated and clearing ≥ marginal cost", () => {
    // 12 unit-bids at 600 on 10 cores → clears at 600 ≥ marginal cost 500.
    const params = { ...gateBase, initial_reserve_price: 50 };
    const res = runRound(
      initialState(params),
      { bidders: [{ id: "a", wtp: 600, quantity: 12 }] },
      params
    );
    expect(res.consumption_rate).toBe(1);
    expect(res.clearing_price).toBe(600);
    expect(res.expansion_gated).toBe(false);
    expect(res.next_num_cores).toBeGreaterThan(res.num_cores); // ceil(10/0.9)=12
  });

  it("zero validator payout disables the gate (marginal cost = 0)", () => {
    const params0 = {
      ...gateBase,
      initial_reserve_price: 50,
      SELF_STAKE_YIELD: 0,
    };
    const res = runRound(
      initialState(params0),
      { bidders: [{ id: "a", wtp: 80, quantity: 12 }] }, // clears at 80 ≥ cost 0
      params0
    );
    expect(res.next_num_cores).toBeGreaterThan(res.num_cores);
  });

  it("respects renewal floor on contraction", () => {
    const params = {
      ...BASE,
      initial_num_cores: 10,
      initial_reserve_price: 50,
    };
    let state = initialState(params);
    // Round 1: alice wins 4 cores
    const r1 = runRound(
      state,
      { bidders: [{ id: "alice", wtp: 100, quantity: 4 }] },
      params
    );
    state = advanceState(state, r1);
    // Round 2: alice renews 4, consumption = 40% (≤ scale-down threshold)
    // ceil(10 * 0.4 / 0.8) = 5; floor = max(renewals=4, market floor=0) = 4; clamp → 5
    const r2 = runRound(
      state,
      { bidders: [{ id: "alice", wtp: 100, quantity: 4 }] },
      params
    );
    expect(r2.renewals_count).toBe(4);
    expect(r2.next_num_cores).toBeGreaterThanOrEqual(4);
  });
});
