import { useSim, type Tab, type Theme } from "./store";
import { Chart } from "./components/Chart";
import { Settings } from "./components/Settings";
import { ManualMode } from "./components/ManualMode";
import { BatchMode } from "./components/BatchMode";
import { Statistics } from "./components/Statistics";
import { Specification } from "./components/Specification";
import { ExportButtons } from "./components/ExportButtons";

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-fg-2 hover:bg-surface-2"
    >
      {isDark ? (
        // Sun
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "simulation", label: "Simulation" },
  { id: "statistics", label: "Statistics" },
  { id: "specification", label: "Specification" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const tab = useSim(s => s.tab);
  const setTab = useSim(s => s.setTab);
  const mode = useSim(s => s.mode);
  const setMode = useSim(s => s.setMode);
  const resetSimulation = useSim(s => s.resetSimulation);
  const historyLen = useSim(s => s.history.length);
  const theme = useSim(s => s.theme);
  const toggleTheme = useSim(s => s.toggleTheme);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">RFC-17 Coretime Market Simulator</h1>
          <p className="text-sm text-fg-2">
            Clearing-price Dutch auction · Renewal rights · Dynamic core supply (amendment)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "rounded-md px-3 py-1 font-medium " +
                  (tab === t.id
                    ? "bg-ink text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-fg-2 hover:bg-surface-2")
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {tab === "simulation" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
              {(["manual", "batch"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "rounded-md px-3 py-1 font-medium capitalize " +
                    (mode === m
                      ? "bg-accent text-white"
                      : "text-fg-2 hover:bg-surface-2")
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
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/40"
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
      {tab === "specification" && <Specification />}
      {tab === "settings" && <Settings />}

      <footer className="pt-4 text-xs text-muted">
        Spec sources: <code className="font-mono">resources/rfc17.md</code>,{" "}
        <code className="font-mono">resources/rfc17-amendment.md</code>
      </footer>
    </div>
  );
}
