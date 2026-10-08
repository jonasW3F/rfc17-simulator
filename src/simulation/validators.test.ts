import { describe, expect, it } from "vitest";
import { minMarketCores, minTotalCores } from "./cores";
import { DEFAULT_PARAMETERS } from "./types";
import {
  coreMarginalCostDot,
  salaryCollateralDot,
  salaryDot,
  selfStakeIncentiveDot,
  validatorCommittedDot,
  validatorPayoutDot,
} from "./validators";

// Metanode budget v4 defaults: 30% at T = 30k → 750 DOT/month; $2,000 salary
// at 200% collateral with DOT = $1.00 → 2,000 DOT paid, 4,000 DOT locked.
describe("per-validator lines", () => {
  it("self-stake incentive = yield × T / 12", () => {
    expect(selfStakeIncentiveDot(DEFAULT_PARAMETERS)).toBeCloseTo(750);
  });

  it("salary converts USD to DOT at DOT_USD_RATE", () => {
    expect(salaryDot(DEFAULT_PARAMETERS)).toBeCloseTo(2000);
    expect(salaryDot({ ...DEFAULT_PARAMETERS, DOT_USD_RATE: 0.5 })).toBeCloseTo(4000);
    expect(salaryDot({ ...DEFAULT_PARAMETERS, DOT_USD_RATE: 0 })).toBe(0);
  });

  it("collateral = COLLATERAL_RATIO × salary in DOT", () => {
    expect(salaryCollateralDot(DEFAULT_PARAMETERS)).toBeCloseTo(4000);
  });

  it("payout (what the validator receives) = self-stake + salary", () => {
    expect(validatorPayoutDot(DEFAULT_PARAMETERS)).toBeCloseTo(2750);
  });

  it("committed (what the DAP puts up) = self-stake + collateral", () => {
    expect(validatorCommittedDot(DEFAULT_PARAMETERS)).toBeCloseTo(4750);
  });
});

describe("coreMarginalCostDot", () => {
  it("= val_per_core × committed DOT per validator", () => {
    // 5 × 4,750 = 23,750 DOT/core at defaults.
    expect(coreMarginalCostDot(DEFAULT_PARAMETERS)).toBeCloseTo(23750);
  });

  it("rises as the DOT price falls (USD salary costs more DOT)", () => {
    const atOne = coreMarginalCostDot(DEFAULT_PARAMETERS);
    const atHalf = coreMarginalCostDot({ ...DEFAULT_PARAMETERS, DOT_USD_RATE: 0.5 });
    const atOneFifty = coreMarginalCostDot({ ...DEFAULT_PARAMETERS, DOT_USD_RATE: 1.5 });
    expect(atHalf).toBeCloseTo(5 * (750 + 8000)); // 43,750
    expect(atOneFifty).toBeCloseTo(5 * (750 + 2 * 2000 / 1.5)); // ≈ 17,083
    expect(atHalf).toBeGreaterThan(atOne);
    expect(atOne).toBeGreaterThan(atOneFifty);
  });

  it("scales with the collateral ratio", () => {
    const cr1 = coreMarginalCostDot({ ...DEFAULT_PARAMETERS, COLLATERAL_RATIO: 1 });
    expect(cr1).toBeCloseTo(5 * (750 + 2000)); // 13,750
  });

  it("is zero when nothing is paid (gate disabled)", () => {
    expect(
      coreMarginalCostDot({
        ...DEFAULT_PARAMETERS,
        SELF_STAKE_YIELD: 0,
        SALARY_USD_PER_VALIDATOR: 0,
      })
    ).toBe(0);
  });

  it("is static in num_cores (no dependence on supply)", () => {
    const base = coreMarginalCostDot(DEFAULT_PARAMETERS);
    expect(base).toBeCloseTo(coreMarginalCostDot({ ...DEFAULT_PARAMETERS, initial_num_cores: 90 }));
  });
});

describe("default floors", () => {
  it("320 validators → 64 cores in total → 45 on the market after 19 system cores", () => {
    const p = DEFAULT_PARAMETERS;
    expect(minTotalCores(p)).toBe(64);
    expect(minMarketCores(p)).toBe(45);
    expect(p.initial_num_cores).toBe(minMarketCores(p));
    // Ceiling: 81 market + 19 system = 100 cores → 500 validators.
    expect((p.MAX_CORES + p.SYSTEM_CORES) * p.val_per_core).toBe(500);
  });
});
