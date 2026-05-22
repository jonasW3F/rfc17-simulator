import { describe, expect, it } from "vitest";
import { advanceState, initialState, runRound } from "./engine";
import { DEFAULT_PARAMETERS } from "./types";

describe("runRound", () => {
  it("returns reserve price when demand falls short of supply", () => {
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 10, initial_reserve_price: 50 };
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
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 3, initial_reserve_price: 10, MIN_OPENING_PRICE: 1000, PRICE_MULTIPLIER: 100 };
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
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 2, initial_reserve_price: 10, MIN_OPENING_PRICE: 50, PRICE_MULTIPLIER: 3 };
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
      ...DEFAULT_PARAMETERS,
      initial_num_cores: 10,
      initial_reserve_price: 50,
      MIN_CORES: 1,
      MIN_OPENING_PRICE: 1000,
      PRICE_MULTIPLIER: 100,
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
      ...DEFAULT_PARAMETERS,
      initial_num_cores: 20,
      initial_reserve_price: 50,
      MIN_CORES: 1,
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
      ...DEFAULT_PARAMETERS,
      initial_num_cores: 11,
      initial_reserve_price: 50,
      MIN_CORES: 1,
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
      ...DEFAULT_PARAMETERS,
      initial_num_cores: 10,
      initial_reserve_price: 50,
      MIN_CORES: 1,
      MIN_OPENING_PRICE: 10000,
      PRICE_MULTIPLIER: 1000,
      // Freeze the reserve price so the test isolates supply dynamics.
      // K=0 zeroes the exponential update; MIN_INCREMENT=0 disables the
      // saturation-floor bump that otherwise jumps reserve at 100%.
      K: 0,
      MIN_INCREMENT: 0,
      SCALE_DOWN_WINDOW: 3,
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
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 5, initial_reserve_price: 10 };
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

  it("computes active_validators = max(MIN_VALIDATORS, num_cores * val_per_core)", () => {
    // Floor case: 30 cores × 5 = 150 < MIN_VALIDATORS = 250 → 250.
    const lowParams = { ...DEFAULT_PARAMETERS, initial_num_cores: 30, MIN_CORES: 1 };
    const r1 = runRound(
      initialState(lowParams),
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      lowParams
    );
    expect(r1.active_validators).toBe(250);

    // Scaling case: 80 cores × 5 = 400 > 250 → 400.
    const highParams = { ...DEFAULT_PARAMETERS, initial_num_cores: 80, MIN_CORES: 1 };
    const r2 = runRound(
      initialState(highParams),
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      highParams
    );
    expect(r2.active_validators).toBe(400);

    // Break-even at 50 cores: 50 × 5 = 250 = MIN_VALIDATORS.
    const evenParams = { ...DEFAULT_PARAMETERS, initial_num_cores: 50, MIN_CORES: 1 };
    const r3 = runRound(
      initialState(evenParams),
      { bidders: [{ id: "a", wtp: 100, quantity: 10 }] },
      evenParams
    );
    expect(r3.active_validators).toBe(250);
  });

  it("counts renewals separately from new sales", () => {
    const params = { ...DEFAULT_PARAMETERS, initial_num_cores: 5, initial_reserve_price: 10 };
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
      ...DEFAULT_PARAMETERS,
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

  it("respects renewal floor on contraction", () => {
    const params = {
      ...DEFAULT_PARAMETERS,
      initial_num_cores: 10,
      initial_reserve_price: 50,
      MIN_CORES: 1,
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
    // ceil(10 * 0.4 / 0.8) = 5; floor = max(renewals=4, MIN_CORES=1) = 4; clamp → 5
    const r2 = runRound(
      state,
      { bidders: [{ id: "alice", wtp: 100, quantity: 4 }] },
      params
    );
    expect(r2.renewals_count).toBe(4);
    expect(r2.next_num_cores).toBeGreaterThanOrEqual(4);
  });
});
