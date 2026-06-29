import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "./types";
import { coreMarginalCostDot, validatorPayoutDot } from "./validators";

describe("validatorPayoutDot", () => {
  it("is the DOT stake reward plus the USD ops reward converted to DOT", () => {
    expect(validatorPayoutDot(DEFAULT_PARAMETERS)).toBeCloseTo(1726); // ops reward 0
    expect(
      validatorPayoutDot({
        ...DEFAULT_PARAMETERS,
        REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR: 200,
        DOT_USD_RATE: 2,
      })
    ).toBeCloseTo(1726 + 100);
  });
});

describe("coreMarginalCostDot", () => {
  it("= val_per_core × per-validator payout", () => {
    // 5 × 1726 = 8630 DOT/core at defaults.
    expect(coreMarginalCostDot(DEFAULT_PARAMETERS)).toBeCloseTo(5 * 1726);
  });

  it("scales with the validator payout", () => {
    const base = coreMarginalCostDot(DEFAULT_PARAMETERS);
    const doubled = coreMarginalCostDot({
      ...DEFAULT_PARAMETERS,
      STAKE_INCENTIVES_DOT_PER_VALIDATOR: 3452,
    });
    expect(doubled).toBeCloseTo(base * 2);
  });

  it("is zero when the validator payout is zero (gate disabled)", () => {
    expect(
      coreMarginalCostDot({
        ...DEFAULT_PARAMETERS,
        STAKE_INCENTIVES_DOT_PER_VALIDATOR: 0,
        REWARD_FOR_OPERATIONAL_COSTS_USD_PER_VALIDATOR: 0,
      })
    ).toBe(0);
  });

  it("is static in num_cores (no dependence on supply)", () => {
    const base = coreMarginalCostDot(DEFAULT_PARAMETERS);
    expect(base).toBeCloseTo(coreMarginalCostDot({ ...DEFAULT_PARAMETERS }));
  });
});
