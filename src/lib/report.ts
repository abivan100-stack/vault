import type { ChainVerification, LedgerEntry } from "./ledger";
import type { Reading } from "./simulation";
import type { FieldLogMeta } from "./shipment";

export type ShipmentReport = {
  logId: string;
  box: string;
  batch: string;
  product: string;
  doses: string;
  route: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  readingCount: number;
  minTemperature: number | null;
  maxTemperature: number | null;
  averageTemperature: number | null;
  excursionCount: number;
  breachDurations: string[];
  finalVerdict: "WITHIN CORRIDOR" | "REVIEW REQUIRED";
  chainSummary: string;
  prototypeNote: string;
};

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTemp(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} °C`;
}

export function summarizeShipmentReport(
  meta: FieldLogMeta,
  readings: readonly Reading[],
  ledger: readonly LedgerEntry[],
  verification: ChainVerification,
  discardedEntryCount: number,
): ShipmentReport {
  const endedAt = meta.handedOffAt ?? new Date().toISOString();
  const values = readings.map((reading) => reading.value);
  const minTemperature = values.length > 0 ? Math.min(...values) : null;
  const maxTemperature = values.length > 0 ? Math.max(...values) : null;
  const averageTemperature = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const shipmentEntries = ledger.filter((entry) => entry.at >= meta.startedAt && entry.at <= endedAt);
  const excursionEntries = shipmentEntries.filter((entry) => entry.event === "EXCURSION_OPEN");
  const breachDurations: string[] = [];
  let openAt: number | null = null;
  for (const entry of shipmentEntries) {
    if (entry.event === "EXCURSION_OPEN") openAt = new Date(entry.at).getTime();
    if (entry.event === "EXCURSION_CLEAR" && openAt !== null) {
      breachDurations.push(formatDuration(new Date(entry.at).getTime() - openAt));
      openAt = null;
    }
  }
  if (openAt !== null) breachDurations.push(`${formatDuration(new Date(endedAt).getTime() - openAt)} · open`);

  const chainTrustworthy = verification.intact && discardedEntryCount === 0;
  return {
    logId: meta.logId,
    box: meta.box,
    batch: meta.batch,
    product: meta.product,
    doses: meta.doses,
    route: meta.route,
    startedAt: meta.startedAt,
    endedAt,
    durationMinutes: Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(meta.startedAt).getTime()) / 60_000)),
    readingCount: readings.length,
    minTemperature,
    maxTemperature,
    averageTemperature,
    excursionCount: excursionEntries.length,
    breachDurations,
    finalVerdict: chainTrustworthy && excursionEntries.length === 0 ? "WITHIN CORRIDOR" : "REVIEW REQUIRED",
    chainSummary: chainTrustworthy ? `Verified · ${ledger.length} retained entries` : "Review required · chain is incomplete or broken",
    prototypeNote: "Prototype report — readings are supplied by the connected ESP32/DHT22 path when the Vault API is online.",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function reportHtml(report: ShipmentReport): string {
  const row = (label: string, value: string) => `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const breaches = report.breachDurations.length > 0 ? report.breachDurations.join(", ") : "None recorded";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vault shipment report · ${escapeHtml(report.logId)}</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f1efe9;color:#20231f;font-family:Arial,Helvetica,sans-serif}main{max-width:820px;margin:0 auto;padding:48px 42px;background:#fff;min-height:100vh}.kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#0d6d63;font-weight:700}.brand{display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #d7d4cd;padding-bottom:24px}.brand h1{font-size:26px;letter-spacing:-.04em;margin:8px 0 0}.meta{font:12px monospace;color:#5f635d;text-align:right}.verdict{margin:28px 0;padding:18px;border:1px solid #a8cdc7;background:#dcece9}.verdict strong{font-size:20px;letter-spacing:-.02em}.section{margin-top:30px}.section h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:0 0 12px;color:#4d5250}.grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #d7d4cd}.row{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid #d7d4cd;font-size:13px}.row span{color:#5f635d}.row strong{font-weight:600;text-align:right}.note{margin-top:38px;padding-top:16px;border-top:1px solid #d7d4cd;color:#5f635d;font-size:11px;line-height:1.5}@media print{body{background:#fff}main{padding:20px 0;max-width:none}}
  </style></head><body><main><div class="brand"><div><div class="kicker">Vault · shipment report</div><h1>${escapeHtml(report.product)}</h1></div><div class="meta">${escapeHtml(report.logId)}<br>${escapeHtml(report.box)} · ${escapeHtml(report.batch)}</div></div><div class="verdict"><div class="kicker">Final assessment</div><strong>${escapeHtml(report.finalVerdict)}</strong><div style="margin-top:6px;font-size:13px">${escapeHtml(report.chainSummary)}</div></div><section class="section"><h2>Shipment record</h2><div class="grid">${row("Route", report.route)}${row("Doses", report.doses)}${row("Started", report.startedAt)}${row("Ended", report.endedAt)}${row("Duration", `${report.durationMinutes} min`)}${row("Retained readings", String(report.readingCount))}</div></section><section class="section"><h2>Temperature evidence</h2><div class="grid">${row("Minimum", formatTemp(report.minTemperature))}${row("Maximum", formatTemp(report.maxTemperature))}${row("Average", formatTemp(report.averageTemperature))}${row("Excursions", String(report.excursionCount))}${row("Breach duration", breaches)}</div></section><section class="section"><h2>Integrity</h2><div class="grid">${row("Ledger status", report.chainSummary)}${row("Report scope", "Current browser record")}</div></section><p class="note">${escapeHtml(report.prototypeNote)} This export is designed for review and handoff discussion; it is not a validated medical record.</p></main><script>window.addEventListener('afterprint',()=>window.close());window.print();</script></body></html>`;
}
