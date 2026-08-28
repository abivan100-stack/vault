import { describe, expect, it } from "vitest";
import { appendEntry, verifyChain,
 type LedgerEntry, type LedgerEventType } from "./ledger";
import { createFieldLog, type FieldLogMeta } from "./shipment";
import {
  buildShipmentReport,
  collectInvestigations,
  entriesAreComplete,
  reportFilename,
  reportVerdict,
  shipmentEntries,
  summariseCorridor,
} from "./report";

const START = new Date("2026-08-27T09:00:00.000Z");

/** Builds a real hash-chained ledger, so nothing here tests a fake shape. */
function chainOf(...events: [LedgerEventType, string][]): LedgerEntry[] {
  let chain: LedgerEntry[] = [];
  events.forEach(([event, detail], index) => {
    chain = appendEntry(chain, event, detail, new Date(START.getTime() + index * 10_000));
  });
  return chain;
}

const SHIPMENT: FieldLogMeta = createFieldLog(START, "417");

function reportOf(chain: LedgerEntry[], shipment: FieldLogMeta = SHIPMENT) {
  return buildShipmentReport({
    ledger: chain,
    shipment,
    verification: verifyChain(chain),
    discardedEntryCount: 0,
    generatedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
}

describe("shipmentEntries", () => {
  it("scopes to the most recent shipment", () => {
    // The ledger is one chain across every shipment the browser has run. A
    // report that took it wholesale would attribute a previous shipment's
    // excursions to this one.
    const chain = chainOf(
      ["SHIPMENT_CREATE", "first"],
      ["EXCURSION_OPEN", "9.0 °C — left safe corridor"],
      ["SHIPMENT_CREATE", "second"],
      ["TEMPERATURE_READING", "4.4 °C"],
    );
    const scoped = shipmentEntries(chain);
    expect(scoped).toHaveLength(2);
    expect(scoped[0].detail).toBe("second");
    expect(scoped.some((entry) => entry.event === "EXCURSION_OPEN")).toBe(false);
  });

  it("returns the whole window when the opening entry has aged out", () => {
    const chain = chainOf(["TEMPERATURE_READING", "4.4 °C"], ["TEMPERATURE_READING", "4.6 °C"]);
    expect(shipmentEntries(chain)).toHaveLength(2);
    expect(entriesAreComplete(shipmentEntries(chain))).toBe(false);
  });

  it("is complete when it starts at a shipment boundary", () => {
    const chain = chainOf(["SHIPMENT_CREATE", "opened"], ["TEMPERATURE_READING", "4.4 °C"]);
    expect(entriesAreComplete(shipmentEntries(chain))).toBe(true);
  });
});

describe("summariseCorridor", () => {
  it("takes low and high from the ledger, not the live chart window", () => {
    // The chart holds 30 samples and dies with the session; the ledger is the
    // only history a report can be built from.
    const chain = chainOf(
      ["SHIPMENT_CREATE", "opened"],
      ["TEMPERATURE_READING", "4.4 °C"],
      ["TEMPERATURE_READING", "2.1 °C"],
      ["EXCURSION_OPEN", "8.6 °C — left safe corridor"],
      ["EXCURSION_CLEAR", "7.4 °C — back inside safe corridor"],
    );
    const summary = summariseCorridor(chain);
    expect(summary.lowC).toBe(2.1);
    expect(summary.highC).toBe(8.6);
    expect(summary.sampleCount).toBe(4);
    expect(summary.excursionsOpened).toBe(1);
    expect(summary.excursionsCleared).toBe(1);
  });

  it("reports no range at all when nothing was measured", () => {
    const summary = summariseCorridor(chainOf(["SHIPMENT_CREATE", "opened"]));
    expect(summary.lowC).toBeNull();
    expect(summary.highC).toBeNull();
    expect(summary.sampleCount).toBe(0);
  });
});

describe("collectInvestigations", () => {
  it("pairs each investigation with what resolved it", () => {
    const chain = chainOf(
      ["SHIPMENT_CREATE", "opened"],
      ["EXCURSION_OPEN", "8.6 °C — left safe corridor"],
      ["INVESTIGATION_OPEN", "Investigation opened"],
      ["EXCURSION_OPEN", "8.9 °C — left safe corridor"],
      ["INVESTIGATION_RESOLVED", "Sensor fault — probe reseated"],
    );
    const [investigation] = collectInvestigations(chain);
    expect(investigation.resolution).toBe("Sensor fault — probe reseated");
    // The excursion that triggered it precedes the open entry, so only the
    // one absorbed while open is attributed here.
    expect(investigation.coveredExcursions).toEqual([4]);
  });

  it("keeps an investigation that is still open", () => {
    // A report that dropped the one unresolved case would be the most
    // misleading thing this document could do.
    const chain = chainOf(
      ["SHIPMENT_CREATE", "opened"],
      ["INVESTIGATION_OPEN", "Investigation opened"],
    );
    const [investigation] = collectInvestigations(chain);
    expect(investigation.resolvedAt).toBeNull();
    expect(investigation.resolution).toBeNull();
  });
});

describe("reportVerdict", () => {
  it("puts a broken chain above every other concern", () => {
    const chain = chainOf(["SHIPMENT_CREATE", "opened"], ["TEMPERATURE_READING", "4.4 °C"]);
    const tampered = [...chain];
    tampered[1] = { ...tampered[1], detail: "9.9 °C" };
    const report = buildShipmentReport({
      ledger: tampered,
      shipment: SHIPMENT,
      verification: verifyChain(tampered),
      discardedEntryCount: 0,
      generatedAt: START,
    });
    expect(reportVerdict(report)).toContain("cannot be relied on");
  });

  it("will not call a shipment clear while an investigation is open", () => {
    const report = reportOf(
      chainOf(
        ["SHIPMENT_CREATE", "opened"],
        ["EXCURSION_OPEN", "8.6 °C — left safe corridor"],
        ["INVESTIGATION_OPEN", "Investigation opened"],
      ),
    );
    expect(reportVerdict(report)).toContain("not cleared");
  });

  it("says an excursion happened even once everything is resolved", () => {
    const report = reportOf(
      chainOf(
        ["SHIPMENT_CREATE", "opened"],
        ["EXCURSION_OPEN", "8.6 °C — left safe corridor"],
        ["INVESTIGATION_OPEN", "Investigation opened"],
        ["EXCURSION_CLEAR", "7.4 °C — back inside safe corridor"],
        ["INVESTIGATION_RESOLVED", "Sensor fault — probe reseated"],
      ),
    );
    const verdict = reportVerdict(report);
    expect(verdict).toContain("1 excursion");
    expect(verdict).toContain("resolved");
  });

  it("flags a discarded entry even though the surviving chain verifies", () => {
    const chain = chainOf(["SHIPMENT_CREATE", "opened"]);
    const report = buildShipmentReport({
      ledger: chain,
      shipment: SHIPMENT,
      verification: verifyChain(chain),
      discardedEntryCount: 3,
      generatedAt: START,
    });
    expect(reportVerdict(report)).toContain("incomplete");
  });

  it("clears a quiet shipment", () => {
    const report = reportOf(
      chainOf(["SHIPMENT_CREATE", "opened"], ["TEMPERATURE_READING", "4.4 °C"]),
    );
    expect(reportVerdict(report)).toContain("nothing outstanding");
  });
});

describe("buildShipmentReport", () => {
  it("takes the closing instant from the ledger, not the shipment record", () => {
    // The metadata is persisted separately and can be stale or hand-edited.
    // A closing date with no HANDOFF_INIT behind it is a claim the chain does
    // not support, so the report does not make it.
    const handedOff: FieldLogMeta = { ...SHIPMENT, handedOffAt: "2026-08-27T11:00:00.000Z" };
    const report = reportOf(chainOf(["SHIPMENT_CREATE", "opened"]), handedOff);
    expect(report.closedAt).toBeNull();
  });

  it("closes at the handoff entry and ignores what follows it", () => {
    // Monitoring continues after the box changes hands. Those readings are
    // not this shipment's custody, and counting them let a later excursion
    // appear in the closing report of a shipment that had already closed.
    const report = reportOf(
      chainOf(
        ["SHIPMENT_CREATE", "opened"],
        ["HANDOFF_INIT", "handed off"],
        ["TEMPERATURE_READING", "11.0 °C"],
      ),
    );
    expect(report.closedAt).not.toBeNull();
    expect(report.entries.map((entry) => entry.event)).toEqual(["SHIPMENT_CREATE", "HANDOFF_INIT"]);
  });

  it("has no closing instant mid-transit", () => {
    expect(reportOf(chainOf(["SHIPMENT_CREATE", "opened"])).closedAt).toBeNull();
  });
});

describe("reportFilename", () => {
  it("builds a filename that is safe on any filesystem", () => {
    expect(reportFilename(SHIPMENT, new Date("2026-08-27T12:00:00.000Z"))).toBe(
      "vault-report-VCC-BOX-417-2026-08-27.pdf",
    );
  });

  it("survives a box id made entirely of punctuation", () => {
    const odd: FieldLogMeta = { ...SHIPMENT, box: "///" };
    expect(reportFilename(odd, new Date("2026-08-27T12:00:00.000Z"))).toBe(
      "vault-report-shipment-2026-08-27.pdf",
    );
  });
});
