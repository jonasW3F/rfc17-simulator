import { useSim, type Tab } from "./store";
import { Chart } from "./components/Chart";
import { Settings } from "./components/Settings";
import { ManualMode } from "./components/ManualMode";
import { BatchMode } from "./components/BatchMode";
import { Statistics } from "./components/Statistics";
import { ExportButtons } from "./components/ExportButtons";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "simulation", label: "Simulation" },
  { id: "statistics", label: "Statistics" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const tab = useSim(s => s.tab);
  const setTab = useSim(s => s.setTab);
  const mode = useSim(s => s.mode);
  const setMode = useSim(s => s.setMode);
  const resetSimulation = useSim(s => s.resetSimulation);
  const historyLen = useSim(s => s.history.length);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">RFC-17 Coretime Market Simulator</h1>
          <p className="text-sm text-slate-500">
            Clearing-price Dutch auction · Renewal rights · Dynamic core supply (amendment)
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "rounded-md px-3 py-1 font-medium " +
                (tab === t.id
                  ? "bg-ink text-white"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "simulation" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
              {(["manual", "batch"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "rounded-md px-3 py-1 font-medium capitalize " +
                    (mode === m
                      ? "bg-accent text-white"
                      : "text-slate-600 hover:bg-slate-100")
                  }
                >
                  {m} mode
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButtons />
              <button
                onClick={resetSimulation}
                disabled={historyLen === 0}
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset simulation
              </button>
            </div>
          </div>

          <Chart />
          {mode === "manual" ? <ManualMode /> : <BatchMode />}
        </div>
      )}

      {tab === "statistics" && <Statistics />}
      {tab === "settings" && <Settings />}

      <footer className="pt-4 text-xs text-slate-400">
        Spec sources: <code className="font-mono">resources/rfc17.md</code>,{" "}
        <code className="font-mono">resources/rfc17-amendment.md</code>
      </footer>
    </div>
  );
}
