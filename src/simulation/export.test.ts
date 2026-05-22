import { describe, expect, it } from "vitest";
import { toJson } from "./export";
import { parseJson } from "./parse";
import { DEFAULT_PARAMETERS } from "./types";

const SAMPLE = [
  {
    round: 1,
    bidders: [
      { id: "alice", wtp: 200, quantity: 3 },
      { id: "bob", wtp: 150, quantity: 2 },
    ],
  },
  {
    round: 2,
    bidders: [{ id: "alice", wtp: 200, quantity: 3 }],
  },
];

describe("export round-trip", () => {
  it("JSON export can be re-parsed identically", () => {
    const json = toJson(SAMPLE);
    const { rounds, errors } = parseJson(json);
    expect(errors).toEqual([]);
    expect(rounds).toEqual(SAMPLE);
  });

  it("includes the note when provided", () => {
    const json = toJson(SAMPLE, { note: "Severe attrition scenario." });
    const parsed = JSON.parse(json);
    expect(parsed.note).toBe("Severe attrition scenario.");
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("omits the note when empty or whitespace", () => {
    const j1 = JSON.parse(toJson(SAMPLE));
    const j2 = JSON.parse(toJson(SAMPLE, { note: "   " }));
    expect(j1.note).toBeUndefined();
    expect(j2.note).toBeUndefined();
  });

  it("preserves rounds when re-parsed even with note + exportedAt", () => {
    const json = toJson(SAMPLE, { note: "Test run." });
    const { rounds } = parseJson(json);
    expect(rounds).toEqual(SAMPLE);
  });

  it("round-trips embedded parameters", () => {
    const tweaked = {
      ...DEFAULT_PARAMETERS,
      TARGET_CONSUMPTION_RATE: 0.75,
      POST_EXPANSION_CONSUMPTION: 0.88,
      SCALE_DOWN_WINDOW: 4,
      initial_num_cores: 20,
    };
    const json = toJson(SAMPLE, { parameters: tweaked });
    const parsed = parseJson(json);
    expect(parsed.errors).toEqual([]);
    expect(parsed.parameters).toEqual(tweaked);
  });

  it("omits parameters when none are provided to the exporter", () => {
    const parsed = parseJson(toJson(SAMPLE));
    expect(parsed.parameters).toBeUndefined();
  });

  it("rejects non-numeric parameter values with a descriptive error", () => {
    const raw = JSON.stringify({
      rounds: SAMPLE,
      parameters: { ...DEFAULT_PARAMETERS, K: "not a number" },
    });
    const parsed = parseJson(raw);
    expect(parsed.errors.some(e => e.includes("parameters.K"))).toBe(true);
    // Other valid keys still load; K falls back to DEFAULT.
    expect(parsed.parameters?.K).toBe(DEFAULT_PARAMETERS.K);
  });
});
