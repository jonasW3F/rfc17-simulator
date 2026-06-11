import { useEffect, useState } from "react";
import { useSim } from "../store";
import {
  parseScheduleByExtension,
  type ParsedSchedule,
} from "../simulation/parse";

const SAMPLE_CSV = `round,bidder_id,wtp,quantity
1,alice,200,3
1,bob,150,2
1,carol,80,4
2,alice,200,3
2,bob,150,2
2,dan,300,3
3,alice,200,2
3,bob,150,2
3,dan,300,3
3,erin,500,5`;

export function BatchMode() {
  const [schedule, setSchedule] = useState<ParsedSchedule | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [applyParams, setApplyParams] = useState(true);
  const runBatch = useSim(s => s.runBatch);
  const resetSimulation = useSim(s => s.resetSimulation);
  const setParameters = useSim(s => s.setParameters);
  const history = useSim(s => s.history);

  const loadFromText = (name: string, text: string) => {
    const parsed = parseScheduleByExtension(name, text);
    setSchedule(parsed);
    setFilename(name);
    // Re-arm the apply-params checkbox each time a new file loads.
    setApplyParams(true);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    loadFromText(file.name, text);
  };

  // If parameters are present and the toggle is on, set them BEFORE running so
  // the simulation uses the file's settings. Zustand's set() is synchronous,
  // so a follow-up runBatch sees the updated params immediately.
  const maybeApplyParams = () => {
    if (schedule?.parameters && applyParams) {
      setParameters(schedule.parameters);
    }
  };

  const runAll = () => {
    if (!schedule) return;
    maybeApplyParams();
    runBatch(schedule.rounds.map(r => r.bidders));
  };

  const resetThenRun = () => {
    if (!schedule) return;
    maybeApplyParams();
    resetSimulation();
    runBatch(schedule.rounds.map(r => r.bidders));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-2">
          Upload a multi-round schedule
        </h3>
        <p className="mb-3 text-sm text-fg-2">
          Accepts CSV (<code className="font-mono text-xs">round,bidder_id,wtp,quantity</code>) or JSON
          (<code className="font-mono text-xs">{`{ rounds: [...], parameters?: {...} }`}</code>). JSON
          files exported from this tool round-trip with the embedded settings.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.json,.txt"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="text-sm"
          />
          <button
            onClick={() => loadFromText("sample.csv", SAMPLE_CSV)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Load sample
          </button>
          <button
            onClick={() => {
              setSchedule(null);
              setFilename("");
            }}
            disabled={!schedule}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear file
          </button>
        </div>
      </div>

      {schedule && (
        <SchedulePreview
          schedule={schedule}
          filename={filename}
          onRunAll={runAll}
          onResetThenRun={resetThenRun}
          historyLength={history.length}
          applyParams={applyParams}
          onApplyParamsChange={setApplyParams}
        />
      )}
    </div>
  );
}

function SchedulePreview(props: {
  schedule: ParsedSchedule;
  filename: string;
  historyLength: number;
  applyParams: boolean;
  onApplyParamsChange: (v: boolean) => void;
  onRunAll: () => void;
  onResetThenRun: () => void;
}) {
  const totalBidders = props.schedule.rounds.reduce(
    (s, r) => s + r.bidders.length,
    0
  );
  const hasParams = !!props.schedule.parameters;
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
        <div>
          <div className="text-sm font-semibold text-fg">{props.filename}</div>
          <div className="text-xs text-fg-2">
            {props.schedule.rounds.length} round{props.schedule.rounds.length === 1 ? "" : "s"},{" "}
            {totalBidders} bidder entries
            {hasParams && (
              <span className="ml-2 rounded-full bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 text-[11px] font-medium text-sky-900 dark:text-sky-200">
                settings detected
              </span>
            )}
            {props.schedule.errors.length > 0 && (
              <span className="ml-2 text-rose-600 dark:text-rose-400">
                · {props.schedule.errors.length} error
                {props.schedule.errors.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasParams && (
            <label className="flex items-center gap-1.5 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={props.applyParams}
                onChange={e => props.onApplyParamsChange(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Apply settings from file
            </label>
          )}
          <button
            onClick={props.onResetThenRun}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Reset & run all
          </button>
          <button
            onClick={props.onRunAll}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {props.historyLength > 0 ? "Append rounds" : "Run all rounds"}
          </button>
        </div>
      </div>

      {props.schedule.errors.length > 0 && (
        <div className="border-b border-rose-100 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 px-4 py-2 text-xs text-rose-700 dark:text-rose-400">
          {props.schedule.errors.slice(0, 5).map((e, i) => (
            <div key={i} className="font-mono">{e}</div>
          ))}
          {props.schedule.errors.length > 5 && (
            <div>… and {props.schedule.errors.length - 5} more</div>
          )}
        </div>
      )}

      {hasParams && props.applyParams && <ParameterDiff schedule={props.schedule} />}

      <div className="max-h-80 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-fg-2">
            <tr>
              <th className="px-4 py-2">Round</th>
              <th className="px-4 py-2">Bidders</th>
              <th className="px-4 py-2">Total cores requested</th>
              <th className="px-4 py-2">Max / mean WTP</th>
            </tr>
          </thead>
          <tbody>
            {props.schedule.rounds.map(r => {
              const qty = r.bidders.reduce((s, b) => s + b.quantity, 0);
              const maxWtp = r.bidders.reduce((m, b) => Math.max(m, b.wtp), 0);
              const meanWtp =
                r.bidders.reduce((s, b) => s + b.wtp * b.quantity, 0) / Math.max(qty, 1);
              return (
                <tr key={r.round} className="border-t border-line">
                  <td className="px-4 py-1.5 font-mono">{r.round}</td>
                  <td className="px-4 py-1.5 font-mono">{r.bidders.length}</td>
                  <td className="px-4 py-1.5 font-mono">{qty}</td>
                  <td className="px-4 py-1.5 font-mono">
                    {maxWtp.toFixed(0)} / {meanWtp.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParameterDiff({ schedule }: { schedule: ParsedSchedule }) {
  const current = useSim(s => s.params);
  const [open, setOpen] = useState(false);
  // Re-collapse when a new file replaces the prior schedule.
  useEffect(() => {
    setOpen(false);
  }, [schedule]);
  if (!schedule.parameters) return null;
  const diffs = Object.entries(schedule.parameters)
    .filter(([k, v]) => current[k as keyof typeof current] !== v)
    .map(([k, v]) => ({
      key: k,
      current: current[k as keyof typeof current],
      next: v as number,
    }));
  if (diffs.length === 0) {
    return (
      <div className="border-b border-line bg-surface-2 px-4 py-2 text-xs text-fg-2">
        File settings match current settings — nothing to change.
      </div>
    );
  }
  return (
    <div className="border-b border-line bg-sky-50 dark:bg-sky-950/40 px-4 py-2 text-xs text-sky-900 dark:text-sky-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="font-medium hover:underline"
      >
        {open ? "▾" : "▸"} {diffs.length} parameter{diffs.length === 1 ? "" : "s"} will change on run
      </button>
      {open && (
        <table className="mt-2 min-w-full text-xs">
          <thead className="text-left text-sky-700 dark:text-sky-300">
            <tr>
              <th className="py-1 pr-4">Parameter</th>
              <th className="py-1 pr-4">Current</th>
              <th className="py-1">From file</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {diffs.map(d => (
              <tr key={d.key}>
                <td className="py-0.5 pr-4">{d.key}</td>
                <td className="py-0.5 pr-4">{d.current}</td>
                <td className="py-0.5">{d.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
