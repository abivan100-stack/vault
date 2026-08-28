/**
 * The end-of-shipment report model.
 *
 * A shipment ends when it is handed off, and the thing an auditor is given at
 * that moment is this: the shipment record, what the corridor did, every
 * Investigation and how it was resolved, and the ledger entries backing all
 * of it. The model is built here as plain data so it can be tested without a
 * PDF in sight; `reportPdf.ts` is only responsible for putting it on a page.
 *
 * Two facts about the ledger shape the whole thing:
 *
 * - The ledger is one continuous chain across every shipment the browser has
 *   ever run, so a report has to be *scoped* to its shipment rather than
 *   taking the chain wholesale. `SHIPMENT_CREATE` is the boundary.
 * - The chart's reading window holds 30 samples and does not survive a
 *   reload, so it is not a usable history. Temperatures in the report are
 *   recovered from the ledger entries themselves — the only record that
 *   persists.
 */

import { readingCelsius, type ChainVerification, type LedgerEntry } from "./ledger";
import type { FieldLogMeta } from "./shipment";

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
    // Counted, not assumed. An excursion recorded after the last
    // investigation closed, or one that never had an investigation opened
    // against it, is not reviewed -- and saying otherwise in a document
    // written to be filed is the kind of overclaim this report exists to
    // avoid.
    // An excursion is reviewed if an investigation absorbed it, or if one was
    // opened in response to it -- the entry that triggers an investigation
    // necessarily precedes it. What is left over is an excursion nothing was
    // ever opened about, and the report says so rather than implying it was
    // looked at.
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
