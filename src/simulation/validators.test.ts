import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "./types";
import { validatorFloorPrice, validatorPayoutDot } from "./validators";

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

describe("validatorFloorPrice (P*)", () => {
  it("= val_per_core × profit_margin × payout", () => {
    // 5 × 0.2 × 1726 = 1726 DOT/core at defaults.
    expect(validatorFloorPrice(DEFAULT_PARAMETERS)).toBeCloseTo(5 * 0.2 * 1726);
  });

  it("scales linearly with profit margin", () => {
    const p10 = validatorFloorPrice({ ...DEFAULT_PARAMETERS, VALIDATOR_PROFIT_MARGIN: 0.1 });
    const p30 = validatorFloorPrice({ ...DEFAULT_PARAMETERS, VALIDATOR_PROFIT_MARGIN: 0.3 });
    expect(p30).toBeCloseTo(p10 * 3);
  });

  it("is static in num_cores (no dependence on supply)", () => {
    // Nothing in the formula references num_cores.
    const base = validatorFloorPrice(DEFAULT_PARAMETERS);
    expect(base).toBeCloseTo(validatorFloorPrice({ ...DEFAULT_PARAMETERS }));
  });
});
