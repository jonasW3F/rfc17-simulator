#!/usr/bin/env node
// Generates the example scenario JSON files in resources/scenarios/.
// Hand-rolled because all 5 share structure (parameters block, 24 rounds,
// recurring tenants) and are easier to keep in sync from one file than from
// five hand-written copies.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "resources", "scenarios");
mkdirSync(outDir, { recursive: true });

const PARAMETERS = {
  K: 2.5,
  P_MIN: 1,
  MIN_INCREMENT: 100,
  PRICE_MULTIPLIER: 3,
  MIN_OPENING_PRICE: 150,
  PENALTY: 1.3,
  TARGET_CONSUMPTION_RATE: 0.8,
  SCALE_UP_THRESHOLD: 1.0,
  POST_EXPANSION_CONSUMPTION: 0.9,
  SCALE_DOWN_WINDOW: 3,
  MIN_CORES: 10,
  MAX_CORES: 100,
  initial_num_cores: 50,
  initial_reserve_price: 50,
};

// WTPs are deliberately high (30k–60k) because reserve_price escalates
// exponentially under sustained above-target consumption (K=2.5). Within 24
// rounds at 90%+ consumption, reserve can climb past 10k–20k; bidders need
// headroom to survive the scenario instead of getting priced out and
// triggering spurious memory contractions. Treat these as premium-tenant
// values — the user can adjust per-bidder if they want to study price-out
// dynamics directly.
const TENANTS = [
  { id: "alice", wtp: 60000, quantity: 10 },
  { id: "bob", wtp: 60000, quantity: 10 },
  { id: "carol", wtp: 50000, quantity: 10 },
  { id: "dan", wtp: 45000, quantity: 10 },
];
// Total at equilibrium: 40 cores, exactly 80% of initial_num_cores = 50.

function build(name, note, roundFn) {
  const rounds = [];
  for (let r = 1; r <= 24; r++) {
    const bidders = roundFn(r).filter(b => b.quantity > 0 && b.wtp > 0);
    rounds.push({ round: r, bidders });
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    note,
    parameters: PARAMETERS,
    rounds,
  };
  const file = join(outDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
  // Quick demand summary so a glance at the run output shows the shape.
  const summary = rounds
    .map(r => r.bidders.reduce((s, b) => s + b.quantity, 0))
    .join(",");
  console.log(`${name.padEnd(22)}  demand per round: ${summary}`);
}

// 1) Gradual growth: equilibrium → slow linear growth, one core per round.
// Expected behaviour: price climbs across rounds 2–10 (consumption rising
// from 82% → 98%), a saturation expansion fires around round 11, then again
// at ~17 and ~24. Memory contraction never fires.
build(
  "gradual-growth",
  "Gradual demand growth across 24 rounds. Demand starts at the 80% target (40 cores on 50 supply) and grows by 1 core every 2 rounds, reaching 51 by round 24. Expected: reserve_price climbs as consumption approaches 100% over the first 20 rounds, supply expands once around round 21 when demand finally saturates the initial 50 cores, and the post-expansion rounds land just above the price target. The memory-based contraction branch never fires because the rolling average sits at or above the post-expansion supply. WTPs are deliberately high (30k–60k) — under K=2.5, sustained above-target consumption pushes reserve_price into the thousands within ~20 rounds, so bidders need headroom to survive the run. See the comment in scripts/generate-scenarios.mjs.",
  r => [
    ...TENANTS,
    { id: "growth", wtp: 30000, quantity: Math.floor((r - 1) / 2) },
  ]
);

// 2) Spike after stable: 5 quiet rounds, 10-round elevated demand, then a
// reduced but still-above-baseline tail.
build(
  "spike-after-stable",
  "5 rounds of equilibrium, then a sustained 10-round demand spike from 40 to 65 cores, then a 9-round elevated-but-lower tail at 48 cores. Watch supply expand multiple times in rounds 6–8 (50 → 56 → 63 → 70), reserve_price escalate sharply during the spike, and the memory-based contraction roll supply back down toward 60 once the spike subsides. End state: supply ~60, slightly above the original 50 because real demand is now genuinely higher than at the start.",
  r => {
    if (r <= 5) return [...TENANTS];
    if (r <= 15) {
      return [
        ...TENANTS,
        { id: "surge_a", wtp: 40000, quantity: 10 },
        { id: "surge_b", wtp: 38000, quantity: 8 },
        { id: "surge_c", wtp: 35000, quantity: 7 },
      ];
    }
    return [
      ...TENANTS,
      { id: "surge_a", wtp: 40000, quantity: 4 },
      { id: "surge_b", wtp: 38000, quantity: 4 },
    ];
  }
);

// 3) Spike then collapse: equilibrium → surge → collapse → recovery.
// Demonstrates both expansion AND memory contraction in one run.
build(
  "spike-then-collapse",
  "3 rounds of equilibrium, a 7-round demand spike (40 → 60), a severe 5-round collapse (60 → 20 — alice and bob exit), and a 9-round partial recovery (20 → 35). The mechanism exercises both directions: expansion during the spike (50 → 56 → 63), memory-based contraction during the collapse (down to ~25), and more expansion during recovery. Reserve_price oscillates substantially across the run.",
  r => {
    if (r <= 3) return [...TENANTS];
    if (r <= 10) {
      return [
        ...TENANTS,
        { id: "surge_a", wtp: 40000, quantity: 10 },
        { id: "surge_b", wtp: 38000, quantity: 10 },
      ];
    }
    if (r <= 15) {
      // alice + bob leave; carol + dan stay.
      return [
        { id: "carol", wtp: 50000, quantity: 10 },
        { id: "dan", wtp: 45000, quantity: 10 },
      ];
    }
    // Partial recovery.
    return [
      { id: "carol", wtp: 50000, quantity: 10 },
      { id: "dan", wtp: 45000, quantity: 10 },
      { id: "returning", wtp: 35000, quantity: 5 },
      { id: "newcomer", wtp: 32000, quantity: 10 },
    ];
  }
);

// 4) Grifter attack: one-shot 100% manipulation.
build(
  "grifter-attack",
  "5 rounds of equilibrium, then a one-shot supply-expansion attack: in round 6 an 'attacker' bidder pushes consumption to 100% with 10 extra cores, then drops out. Real demand stays at 40 throughout. The amendment's memory-based contraction should restore supply from the post-attack 56 back to 50 within ~4 rounds (by round 10), while reserve_price gets a single saturation bump but does not decay catastrophically. This is the regression scenario the amendment is designed to defend against.",
  r => {
    if (r === 6) {
      return [
        ...TENANTS,
        { id: "attacker", wtp: 70000, quantity: 10 },
      ];
    }
    return [...TENANTS];
  }
);

// 5) Severe attrition: genuine demand drop, gradual contraction.
build(
  "severe-attrition",
  "4 rounds of equilibrium, then alice and bob (20 cores) leave the network. Real demand drops to 25 cores. Supply contracts via the rolling-window memory rule over ~3 rounds, eventually stabilising near 32 cores (25/32 ≈ 78%, close to the 80% target). Reserve_price decays accordingly. Demonstrates that memory contraction is gradual, not whipsaw-y: with a 3-round window, the system takes about that long to fully absorb the shock and land near equilibrium.",
  r => {
    if (r <= 4) return [...TENANTS];
    return [
      { id: "carol", wtp: 50000, quantity: 10 },
      { id: "dan", wtp: 45000, quantity: 10 },
      { id: "small_a", wtp: 35000, quantity: 3 },
      { id: "small_b", wtp: 32000, quantity: 2 },
    ];
  }
);

console.log(`\nGenerated 5 scenarios in ${outDir}`);
