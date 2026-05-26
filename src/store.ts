import { create } from "zustand";
import {
  advanceState,
  initialState,
  runRound,
  type SimulationState,
} from "./simulation/engine";
import {
  DEFAULT_PARAMETERS,
  type Bidder,
  type Parameters,
  type RoundResult,
} from "./simulation/types";
import type { InputHistoryEntry } from "./simulation/export";

export type Mode = "manual" | "batch";
export type Tab = "simulation" | "statistics" | "specification" | "settings";

interface StagedBidder extends Bidder {
  uiKey: string; // stable React key
}

interface SimStore {
  // Configuration
  params: Parameters;

  // Current simulation state
  state: SimulationState;
  history: RoundResult[];
  /** Raw bidder inputs submitted to each round, in submission order. */
  inputHistory: InputHistoryEntry[];

  // UI
  tab: Tab;
  mode: Mode;
  stagedBidders: StagedBidder[];

  // Setters
  setTab: (t: Tab) => void;
  setMode: (m: Mode) => void;
  updateParam: <K extends keyof Parameters>(key: K, value: Parameters[K]) => void;
  setParameters: (params: Parameters) => void;
  resetParams: () => void;

  // Staging
  addStagedBidder: (b: Bidder) => void;
  addStagedBidders: (bs: Bidder[]) => void;
  updateStagedBidder: (uiKey: string, patch: Partial<Bidder>) => void;
  removeStagedBidder: (uiKey: string) => void;
  clearStaged: () => void;
  removeNonTenants: () => void;

  // Simulation control
  submitRound: () => void;
  runBatch: (perRound: Bidder[][]) => void;
  resetSimulation: () => void;
}

let uiKeyCounter = 0;
const mkUiKey = () => `b${++uiKeyCounter}`;

function decorate(bidders: Bidder[]): StagedBidder[] {
  return bidders.map(b => ({ ...b, uiKey: mkUiKey() }));
}


export const useSim = create<SimStore>(set => ({
  params: DEFAULT_PARAMETERS,
  state: initialState(DEFAULT_PARAMETERS),
  history: [],
  inputHistory: [],
  tab: "simulation",
  mode: "manual",
  stagedBidders: [],

  setTab: t => set({ tab: t }),
  setMode: m => set({ mode: m }),

  updateParam: (key, value) =>
    set(s => {
      const params = { ...s.params, [key]: value };
      // If no rounds have run yet, also re-seed state so initial_* changes
      // are reflected live.
      if (s.history.length === 0) {
        return { params, state: initialState(params) };
      }
      return { params };
    }),

  resetParams: () =>
    set(s => {
      const params = DEFAULT_PARAMETERS;
      if (s.history.length === 0) {
        return { params, state: initialState(params) };
      }
      return { params };
    }),

  setParameters: params =>
    set(s => {
      if (s.history.length === 0) {
        return { params, state: initialState(params) };
      }
      return { params };
    }),

  addStagedBidder: b =>
    set(s => ({ stagedBidders: [...s.stagedBidders, { ...b, uiKey: mkUiKey() }] })),

  addStagedBidders: bs =>
    set(s => ({ stagedBidders: [...s.stagedBidders, ...decorate(bs)] })),

  updateStagedBidder: (uiKey, patch) =>
    set(s => ({
      stagedBidders: s.stagedBidders.map(b =>
        b.uiKey === uiKey ? { ...b, ...patch } : b
      ),
    })),

  removeStagedBidder: uiKey =>
    set(s => ({ stagedBidders: s.stagedBidders.filter(b => b.uiKey !== uiKey) })),

  clearStaged: () => set({ stagedBidders: [] }),

  removeNonTenants: () =>
    set(s => ({
      stagedBidders: s.stagedBidders.filter(b => !!s.state.tenants[b.id]),
    })),

  submitRound: () =>
    set(s => {
      const bidders: Bidder[] = s.stagedBidders.map(({ uiKey: _uiKey, ...b }) => b);
      const result = runRound(s.state, { bidders }, s.params);
      const nextState = advanceState(s.state, result);
      // stagedBidders intentionally left untouched — the user keeps the
      // exact list they submitted and can iterate. Use removeNonTenants to
      // drop bidders who didn't win cores this round.
      return {
        state: nextState,
        history: [...s.history, result],
        inputHistory: [
          ...s.inputHistory,
          { round: s.state.round, bidders },
        ],
      };
    }),

  runBatch: perRound =>
    set(s => {
      let state = s.state;
      const history = [...s.history];
      const inputHistory = [...s.inputHistory];
      let lastBidders: Bidder[] = [];
      for (const bidders of perRound) {
        const result = runRound(state, { bidders }, s.params);
        history.push(result);
        inputHistory.push({ round: state.round, bidders });
        state = advanceState(state, result);
        lastBidders = bidders;
      }
      // Surface the final batch round's bidders in the staging list so the
      // user can continue iterating manually without re-creating them.
      return {
        state,
        history,
        inputHistory,
        stagedBidders: decorate(lastBidders),
      };
    }),

  resetSimulation: () =>
    set(s => ({
      state: initialState(s.params),
      history: [],
      inputHistory: [],
      stagedBidders: [],
    })),
}));
