import type { Bidder, Parameters } from "./types";

export interface InputHistoryEntry {
  round: number;
  bidders: Bidder[];
}

export interface ExportOptions {
  note?: string;
  parameters?: Parameters;
}

export function toJson(
  entries: InputHistoryEntry[],
  options: ExportOptions = {}
): string {
  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
  };
  const note = options.note?.trim();
  if (note) payload.note = note;
  if (options.parameters) payload.parameters = options.parameters;
  payload.rounds = entries;
  return JSON.stringify(payload, null, 2);
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
