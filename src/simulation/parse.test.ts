import { describe, expect, it } from "vitest";
import { parseCsv, parseJson } from "./parse";

describe("parseCsv", () => {
  it("parses a header + body", () => {
    const text = `round,bidder_id,wtp,quantity
1,alice,200,3
1,bob,150,2
2,alice,180,3`;
    const { rounds, errors } = parseCsv(text);
    expect(errors).toEqual([]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].bidders).toEqual([
      { id: "alice", wtp: 200, quantity: 3 },
      { id: "bob", wtp: 150, quantity: 2 },
    ]);
  });

  it("accepts headerless input", () => {
    const text = `1,alice,200,3
1,bob,150,2`;
    const { rounds } = parseCsv(text);
    expect(rounds[0].bidders).toHaveLength(2);
  });

  it("ignores comments and blank lines", () => {
    const text = `# warmup
round,bidder_id,wtp,quantity

1,alice,200,3`;
    const { rounds } = parseCsv(text);
    expect(rounds[0].bidders).toHaveLength(1);
  });
});

describe("parseJson", () => {
  it("parses { rounds: [...] }", () => {
    const text = JSON.stringify({
      rounds: [
        { round: 1, bidders: [{ id: "a", wtp: 100, quantity: 2 }] },
      ],
    });
    const { rounds, errors } = parseJson(text);
    expect(errors).toEqual([]);
    expect(rounds[0].bidders[0].id).toBe("a");
  });

  it("parses a bare array", () => {
    const text = JSON.stringify([
      { round: 1, bidders: [{ id: "a", wtp: 100, quantity: 2 }] },
    ]);
    const { rounds } = parseJson(text);
    expect(rounds).toHaveLength(1);
  });
});
