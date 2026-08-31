import { readingCelsius, type ChainVerification, type LedgerEntry } from "./ledger";
import type { FieldLogMeta } from "./shipment";
import type { Reading } from "./simulation";

/**
 * The entries belonging to the current shipment: everything from the most
 * recent `SHIPMENT_CREATE` onward, that entry included.
 *
 * A chain whose `SHIPMENT_CREATE` has already slid out of the retained window
 * yields the whole window instead. That is the honest answer — the entries
 * are all we still hold — and `entriesAreComplete` reports it so the document
 * can say so on its face rather than implying the trail is whole.
 */
export function shipmentEntries(ledger: readonly LedgerEntry[]): LedgerEntry[] {
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    if (ledger[i].event === "SHIPMENT_CREATE") return ledger.slice(i);
  }
  return [...ledger];
}

/** Whether the scoped entries start at a real shipment boundary. */
export function entriesAreComplete(entries: readonly LedgerEntry[]): boolean {
  return entries.length > 0 && entries[0].event === "SHIPMENT_CREATE";
}

export type CorridorSummary = {
  /** Entries carrying a temperature — the sample count behind low/high. */
  sampleCount: number;
  lowC: number | null;
  highC: number | null;
  excursionsOpened: number;
  excursionsCleared: number;
};

export function summariseCorridor(entries: readonly LedgerEntry[]): CorridorSummary {
  let lowC: number | null = null;
  let highC: number | null = null;
  let sampleCount = 0;

  for (const entry of entries) {
    const value = readingCelsius(entry);
    if (value === null) continue;
    sampleCount += 1;
    lowC = lowC === null ? value : Math.min(lowC, value);
    highC = highC === null ? value : Math.max(highC, value);
  }

  return {
    sampleCount,
    lowC,
    highC,
    excursionsOpened: entries.filter((entry) => entry.event === "EXCURSION_OPEN").length,
    excursionsCleared: entries.filter((entry) => entry.event === "EXCURSION_CLEAR").length,
  };
}

export type ReportInvestigation = {
  openedAt: string;
  openedSequence: number;
  /** Null while still open at the time the report was produced. */
  resolvedAt: string | null;
  resolvedSequence: number | null;
  /** The resolution's reason and note, verbatim from the ledger entry. */
  resolution: string | null;
  /** Excursions recorded between this Investigation opening and closing. */
  coveredExcursions: number[];
};

/**
 * Pairs every `INVESTIGATION_OPEN` with the `INVESTIGATION_RESOLVED` that
 * closed it, and attributes the excursions in between to it.
 *
 * An Investigation still open when the report is produced is included with a
 * null resolution rather than omitted: a report that quietly dropped the one
 * unresolved case would be the single most misleading thing this document
 * could do.
 */
export function collectInvestigations(entries: readonly LedgerEntry[]): ReportInvestigation[] {
  const investigations: ReportInvestigation[] = [];
  let current: ReportInvestigation | null = null;

  for (const entry of entries) {
    if (entry.event === "INVESTIGATION_OPEN") {
      current = {
        openedAt: entry.at,
        openedSequence: entry.sequence,
        resolvedAt: null,
        resolvedSequence: null,
        resolution: null,
        coveredExcursions: [],
      };
      investigations.push(current);
    } else if (entry.event === "EXCURSION_OPEN" && current !== null) {
      current.coveredExcursions.push(entry.sequence);
    } else if (entry.event === "INVESTIGATION_RESOLVED" && current !== null) {
      current.resolvedAt = entry.at;
      current.resolvedSequence = entry.sequence;
      current.resolution = entry.detail;
      current = null;
    }
  }

  return investigations;
}

export type ShipmentReport = {
  shipment: FieldLogMeta;
  /** When the document was produced — not when the shipment ended. */
  generatedAt: string;
  /** Handoff instant, or null for a report taken mid-transit. */
  closedAt: string | null;
  entries: LedgerEntry[];
  /** False when the shipment's opening entry has aged out of the window. */
  complete: boolean;
  corridor: CorridorSummary;
  investigations: ReportInvestigation[];
  /** Investigations with no resolution — the report's headline caveat. */
  openInvestigationCount: number;
  verification: ChainVerification;
  discardedEntryCount: number;
};

export type ReportInput = {
  ledger: readonly LedgerEntry[];
  shipment: FieldLogMeta;
  verification: ChainVerification;
  discardedEntryCount: number;
  generatedAt: Date;
};

export function buildShipmentReport(input: ReportInput): ShipmentReport {
  const all = shipmentEntries(input.ledger);

  // The shipment closes at its handoff, and the simulation keeps running
  // afterwards. Readings taken after the box changed hands are not part of
  // this shipment's custody and were inflating the corridor summary of a
  // report that claims to describe it.
  const handoffAt = all.findIndex((entry) => entry.event === "HANDOFF_INIT");
  const entries = handoffAt >= 0 ? all.slice(0, handoffAt + 1) : all;

  // Taken from the ledger, not from the shipment record. The metadata is
  // persisted separately and can be stale or hand-edited; a closing date with
  // no entry behind it is a claim the chain does not support.
  const closedAt = handoffAt >= 0 ? entries[handoffAt].at : null;
  const investigations = collectInvestigations(entries);

  return {
    shipment: input.shipment,
    generatedAt: input.generatedAt.toISOString(),
    closedAt,
    entries,
    complete: entriesAreComplete(entries),
    corridor: summariseCorridor(entries),
    investigations,
    openInvestigationCount: investigations.filter((one) => one.resolvedAt === null).length,
    verification: input.verification,
    discardedEntryCount: input.discardedEntryCount,
  };
}

/**
 * One line stating whether the shipment can be relied on, and if not, why.
 *
 * Deliberately conservative and deliberately ordered: a broken chain outranks
 * an open Investigation, which outranks a recorded excursion. Nothing here
 * says "verified" unless the chain is intact AND nothing was discarded AND no
 * Investigation is open — the same gate the Ledger and Landing pages use.
 */
export function reportVerdict(report: ShipmentReport): string {
  if (!report.verification.intact) {
    return `Chain broken at entry #${report.verification.brokenAt}. This record cannot be relied on.`;
  }
  if (report.discardedEntryCount > 0) {
    return `Chain intact, but ${report.discardedEntryCount} stored ${
      report.discardedEntryCount === 1 ? "entry was" : "entries were"
    } unreadable and dropped on load. The trail is incomplete.`;
  }
  if (!report.complete) {
    return "Chain intact, but this shipment's opening entry is no longer retained. The trail shown starts mid-shipment.";
  }
  if (report.openInvestigationCount > 0) {
    return `Chain intact. ${report.openInvestigationCount} investigation${
      report.openInvestigationCount === 1 ? " remains" : "s remain"
    } unresolved — the shipment is not cleared.`;
  }
  if (report.corridor.excursionsOpened > 0) {
    const absorbed = new Set(
      report.investigations.flatMap((investigation) => investigation.coveredExcursions),
    );
    const excursionSequences = report.entries
      .filter((entry) => entry.event === "EXCURSION_OPEN")
      .map((entry) => entry.sequence);
    const reviewed = excursionSequences.filter(
      (sequence) =>
        absorbed.has(sequence) ||
        report.investigations.some((investigation) => investigation.openedSequence >= sequence),
    ).length;
    const opened = report.corridor.excursionsOpened;
    if (reviewed < opened) {
      return `Chain intact. ${opened} excursion${opened === 1 ? "" : "s"} occurred and ${
        opened - reviewed
      } ${opened - reviewed === 1 ? "was" : "were"} never reviewed.`;
    }
    return `Chain intact and every investigation resolved. ${opened} excursion${
      opened === 1 ? "" : "s"
    } occurred and ${opened === 1 ? "was" : "were"} reviewed.`;
  }
  return "Chain intact, no excursion recorded, nothing outstanding.";
}

/** `vault-report-VCC-BOX-417-2026-08-27.pdf`, safe on every filesystem. */
export function reportFilename(shipment: FieldLogMeta, generatedAt: Date): string {
  const slug = shipment.box.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const month = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const day = String(generatedAt.getDate()).padStart(2, "0");
  const stamp = `${generatedAt.getFullYear()}-${month}-${day}`;
  return `vault-report-${slug || "shipment"}-${stamp}.pdf`;
}

// ---------------------------------------------------------------------------
// HTML Report Export (for browser print preview)
// ---------------------------------------------------------------------------

export type HtmlShipmentReport = {
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
): HtmlShipmentReport {
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

export function reportHtml(report: HtmlShipmentReport): string {
  const row = (label: string, value: string) => `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  const breaches = report.breachDurations.length > 0 ? report.breachDurations.join(", ") : "None recorded";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Vault shipment report · ${escapeHtml(report.logId)}</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f1efe9;color:#20231f;font-family:Arial,Helvetica,sans-serif}main{max-width:820px;margin:0 auto;padding:48px 42px;background:#fff;min-height:100vh}.kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#0d6d63;font-weight:700}.brand{display:flex;justify-content:space-between;align-items:start;border-bottom:1px solid #d7d4cd;padding-bottom:24px}.brand h1{font-size:26px;letter-spacing:-.04em;margin:8px 0 0}.meta{font:12px monospace;color:#5f635d;text-align:right}.verdict{margin:28px 0;padding:18px;border:1px solid #a8cdc7;background:#dcece9}.verdict strong{font-size:20px;letter-spacing:-.02em}.section{margin-top:30px}.section h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:0 0 12px;color:#4d5250}.grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #d7d4cd}.row{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid #d7d4cd;font-size:13px}.row span{color:#5f635d}.row strong{font-weight:600;text-align:right}.note{margin-top:38px;padding-top:16px;border-top:1px solid #d7d4cd;color:#5f635d;font-size:11px;line-height:1.5}@media print{body{background:#fff}main{padding:20px 0;max-width:none}}
  </style></head><body><main><div class="brand"><div><div class="kicker">Vault · shipment report</div><h1>${escapeHtml(report.product)}</h1></div><div class="meta">${escapeHtml(report.logId)}<br>${escapeHtml(report.box)} · ${escapeHtml(report.batch)}</div></div><div class="verdict"><div class="kicker">Final assessment</div><strong>${escapeHtml(report.finalVerdict)}</strong><div style="margin-top:6px;font-size:13px">${escapeHtml(report.chainSummary)}</div></div><section class="section"><h2>Shipment record</h2><div class="grid">${row("Route", report.route)}${row("Doses", report.doses)}${row("Started", report.startedAt)}${row("Ended", report.endedAt)}${row("Duration", `${report.durationMinutes} min`)}${row("Retained readings", String(report.readingCount))}</div></section><section class="section"><h2>Temperature evidence</h2><div class="grid">${row("Minimum", formatTemp(report.minTemperature))}${row("Maximum", formatTemp(report.maxTemperature))}${row("Average", formatTemp(report.averageTemperature))}${row("Excursions", String(report.excursionCount))}${row("Breach duration", breaches)}</div></section><section class="section"><h2>Integrity</h2><div class="grid">${row("Ledger status", report.chainSummary)}${row("Report scope", "Current browser record")}</div></section><p class="note">${escapeHtml(report.prototypeNote)} This export is designed for review and handoff discussion; it is not a validated medical record.</p></main><script>window.addEventListener('afterprint',()=>window.close());window.print();</script></body></html>`;
}
