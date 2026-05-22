import { DEFAULT_PARAMETERS, type Bidder, type Parameters } from "./types";

export interface ParsedSchedule {
  rounds: Array<{ round: number; bidders: Bidder[] }>;
  /** Parameters embedded in the file, merged over DEFAULT_PARAMETERS. */
  parameters?: Parameters;
  errors: string[];
}

function parseParameters(
  raw: unknown
): { params?: Parameters; errors: string[] } {
  if (!raw || typeof raw !== "object") return { errors: [] };
  const errors: string[] = [];
  const out: Partial<Parameters> = {};
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_PARAMETERS) as (keyof Parameters)[];
  let touched = false;
  for (const k of keys) {
    if (k in obj) {
      const v = obj[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        out[k] = v;
        touched = true;
      } else {
        errors.push(`parameters.${k}: expected number, got ${typeof v}`);
      }
    }
  }
  if (!touched) return { errors };
  return { params: { ...DEFAULT_PARAMETERS, ...out }, errors };
}

/**
 * Parse a CSV of the form:
 *
 *   round,bidder_id,wtp,quantity
 *   1,alice,200,3
 *   1,bob,150,2
 *   2,alice,180,3
 *
 * The header row is optional; if absent, columns are assumed in the order
 * above. Lines starting with '#' and blank lines are ignored.
 */
export function parseCsv(text: string): ParsedSchedule {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) {
    return { rounds: [], errors: ["empty file"] };
  }

  let headerSeen = false;
  let cols = ["round", "bidder_id", "wtp", "quantity"];
  const first = lines[0].toLowerCase();
  if (first.includes("round") || first.includes("bidder")) {
    headerSeen = true;
    cols = lines[0].split(",").map(c => c.trim().toLowerCase());
  }

  const idx = (name: string) => cols.indexOf(name);
  const ri = idx("round");
  const bi = idx("bidder_id") >= 0 ? idx("bidder_id") : idx("id");
  const wi = idx("wtp");
  const qi = idx("quantity") >= 0 ? idx("quantity") : idx("cores");

  if ([ri, bi, wi, qi].some(i => i < 0)) {
    errors.push(`could not find required columns (round, bidder_id, wtp, quantity) — got [${cols.join(", ")}]`);
    return { rounds: [], errors };
  }

  const byRound = new Map<number, Bidder[]>();
  const dataStart = headerSeen ? 1 : 0;
  for (let i = dataStart; i < lines.length; i++) {
    const parts = lines[i].split(",").map(p => p.trim());
    const round = parseInt(parts[ri]);
    const id = parts[bi];
    const wtp = parseFloat(parts[wi]);
    const quantity = parseInt(parts[qi]);
    if (!Number.isFinite(round) || !id || !Number.isFinite(wtp) || !Number.isFinite(quantity)) {
      errors.push(`line ${i + 1}: malformed (${lines[i]})`);
      continue;
    }
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round)!.push({ id, wtp, quantity });
  }

  const rounds = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, bidders]) => ({ round, bidders }));

  return { rounds, errors };
}

/**
 * Parse a JSON file of the form:
 *
 *   {
 *     "rounds": [
 *       { "round": 1, "bidders": [{"id": "alice", "wtp": 200, "quantity": 3}] }
 *     ]
 *   }
 *
 * Also accepts a bare array of round objects.
 */
export function parseJson(text: string): ParsedSchedule {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { rounds: [], errors: [`invalid JSON: ${(e as Error).message}`] };
  }

  const roundsRaw = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "rounds" in data
    ? (data as { rounds: unknown }).rounds
    : null;

  if (!Array.isArray(roundsRaw)) {
    return { rounds: [], errors: ["expected { rounds: [...] } or [...] at top level"] };
  }

  const paramsRaw =
    data && typeof data === "object" && !Array.isArray(data) && "parameters" in data
      ? (data as { parameters: unknown }).parameters
      : null;
  const { params: parameters, errors: paramErrors } = parseParameters(paramsRaw);

  const rounds: ParsedSchedule["rounds"] = [];
  for (let i = 0; i < roundsRaw.length; i++) {
    const r = roundsRaw[i] as { round?: number; bidders?: unknown };
    const round = typeof r.round === "number" ? r.round : i + 1;
    if (!Array.isArray(r.bidders)) {
      errors.push(`round ${round}: bidders is not an array`);
      continue;
    }
    const bidders: Bidder[] = [];
    for (const b of r.bidders as Array<Record<string, unknown>>) {
      const id = typeof b.id === "string" ? b.id : null;
      const wtp = typeof b.wtp === "number" ? b.wtp : null;
      const quantity = typeof b.quantity === "number" ? b.quantity : null;
      if (!id || wtp === null || quantity === null) {
        errors.push(`round ${round}: bidder entry malformed (${JSON.stringify(b)})`);
        continue;
      }
      bidders.push({ id, wtp, quantity });
    }
    rounds.push({ round, bidders });
  }
  rounds.sort((a, b) => a.round - b.round);
  return { rounds, parameters, errors: [...errors, ...paramErrors] };
}

export function parseScheduleByExtension(filename: string, text: string): ParsedSchedule {
  if (filename.toLowerCase().endsWith(".json")) return parseJson(text);
  return parseCsv(text);
}
