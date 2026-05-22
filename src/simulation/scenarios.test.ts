import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { advanceState, initialState, runRound } from "./engine";
import { parseJson } from "./parse";

const here = dirname(fileURLToPath(import.meta.url));
const scenariosDir = join(here, "..", "..", "resources", "scenarios");

function runScenario(filename: string) {
  const text = readFileSync(join(scenariosDir, filename), "utf8");
  const parsed = parseJson(text);
  if (parsed.errors.length) {
    throw new Error(`parse errors: ${parsed.errors.join(", ")}`);
  }
  if (!parsed.parameters) {
    throw new Error("scenario missing embedded parameters");
  }
  let state = initialState(parsed.parameters);
  const history: ReturnType<typeof runRound>[] = [];
  for (const r of parsed.rounds) {
    const result = runRound(state, { bidders: r.bidders }, parsed.parameters);
    history.push(result);
    state = advanceState(state, result);
  }
  return { parsed, history };
}

describe("example scenarios", () => {
  it("gradual-growth: supply expands at least once and never contracts", () => {
    const { history } = runScenario("gradual-growth.json");
    expect(history).toHaveLength(24);
    const expansions = history.filter(h => h.next_num_cores > h.num_cores);
    expect(expansions.length).toBeGreaterThanOrEqual(1);
    expect(history.at(-1)!.next_num_cores).toBeGreaterThan(50);
    // Monotonically rising demand should never push supply down.
    const contractions = history.filter(h => h.next_num_cores < h.num_cores);
    expect(contractions).toHaveLength(0);
  });

  it("spike-after-stable: equilibrium then expansion-heavy phase", () => {
    const { history } = runScenario("spike-after-stable.json");
    // First 5 rounds at exact target consumption.
    for (let i = 0; i < 5; i++) {
      expect(history[i].consumption_rate).toBeCloseTo(0.8, 2);
      expect(history[i].next_num_cores).toBe(50);
    }
    // Spike rounds (6-10) should see consumption saturation drive expansion.
    const spike = history.slice(5, 10);
    const saturated = spike.filter(h => h.consumption_rate >= 1);
    expect(saturated.length).toBeGreaterThanOrEqual(2);
  });

  it("spike-then-collapse: both expansion and memory contraction fire", () => {
    const { history } = runScenario("spike-then-collapse.json");
    const expansions = history.filter(h => h.next_num_cores > h.num_cores);
    const contractions = history.filter(h => h.next_num_cores < h.num_cores);
    expect(expansions.length).toBeGreaterThanOrEqual(2);
    expect(contractions.length).toBeGreaterThanOrEqual(2);
  });

  it("grifter-attack: recovers from one-shot expansion within 6 rounds", () => {
    const { history } = runScenario("grifter-attack.json");
    // r6 is the attack: consumption=100%, expansion fires.
    expect(history[5].consumption_rate).toBe(1);
    expect(history[5].next_num_cores).toBeGreaterThan(history[5].num_cores);
    // By round 12, supply must be back at the pre-attack baseline.
    expect(history[11].num_cores).toBe(50);
  });

  it("severe-attrition: supply contracts and stabilises near new equilibrium", () => {
    const { history } = runScenario("severe-attrition.json");
    // Demand collapses to 25 at round 5; supply must shrink in the subsequent rounds.
    expect(history[4].next_num_cores).toBeLessThan(50);
    // Eventually settles: final supply is meaningfully below the start.
    const finalSupply = history.at(-1)!.next_num_cores;
    expect(finalSupply).toBeLessThan(40);
    // 25 / final ≈ TARGET (0.8) — within a few percentage points.
    expect(25 / finalSupply).toBeGreaterThan(0.7);
    expect(25 / finalSupply).toBeLessThan(0.95);
  });
});
