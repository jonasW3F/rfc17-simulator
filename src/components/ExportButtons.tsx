import { useEffect, useState } from "react";
import { useSim } from "../store";
import { downloadFile, toJson } from "../simulation/export";

export function ExportButtons() {
  const inputHistory = useSim(s => s.inputHistory);
  const params = useSim(s => s.params);
  const disabled = inputHistory.length === 0;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const filename = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return `rfc17-inputs-${inputHistory.length}rounds-${stamp}.json`;
  };

  const exportJson = () => {
    downloadFile(
      filename(),
      toJson(inputHistory, { note, parameters: params }),
      "application/json"
    );
    setOpen(false);
    setNote("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Export JSON
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-2">
              Export simulation inputs
            </h3>
            <p className="mt-1 text-xs text-fg-2">
              {inputHistory.length} round{inputHistory.length === 1 ? "" : "s"} captured, plus the
              current settings. The note is embedded in the JSON so others reading the file see your
              observations.
            </p>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-2">Note (optional)</span>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={6}
                autoFocus
                placeholder="e.g. 'Severe attrition scenario — tenants halved between r2 and r3, watch the supply contraction in r3 chart.'"
                className="rounded-md border border-line px-2 py-1.5 font-mono text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setNote("");
                }}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={exportJson}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Download JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
