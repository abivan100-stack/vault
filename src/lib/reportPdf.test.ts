import { describe, expect, it } from "vitest";
import { appendEntry, verifyChain, type LedgerEntry, type LedgerEventType } from "./ledger";
import { createFieldLog, type FieldLogMeta } from "./shipment";
import { buildShipmentReport, type ShipmentReport } from "./report";
import { PAGE_HEIGHT, PAGE_WIDTH, textWidth, type PdfOp, type PdfPage } from "./pdf";
import { layoutShipmentReport, renderShipmentReportPdf } from "./reportPdf";

const START = new Date("2026-08-27T09:00:00.000Z");
const SHIPMENT: FieldLogMeta = createFieldLog(START, "417");

function chainOf(events: [LedgerEventType, string][]): LedgerEntry[] {
  let chain: LedgerEntry[] = [];
  events.forEach(([event, detail], index) => {
    chain = appendEntry(chain, event, detail, new Date(START.getTime() + index * 10_000));
  });
  return chain;
}

function reportOf(chain: LedgerEntry[], shipment: FieldLogMeta = SHIPMENT): ShipmentReport {
  return buildShipmentReport({
    ledger: chain,
    shipment,
    verification: verifyChain(chain),
    discardedEntryCount: 0,
    generatedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
}

/** A shipment long enough to need several pages. */
function longChain(readings: number): LedgerEntry[] {
  const events: [LedgerEventType, string][] = [["SHIPMENT_CREATE", "VCC-BOX-417 opened"]];
  for (let i = 0; i < readings; i += 1) {
    events.push(["TEMPERATURE_READING", `${(3 + (i % 40) / 10).toFixed(1)} °C`]);
  }
  events.push(["EXCURSION_OPEN", "8.6 °C — left safe corridor"]);
  events.push(["INVESTIGATION_OPEN", "Investigation opened — triggered by excursion at 8.6 °C"]);
  events.push(["EXCURSION_CLEAR", "7.4 °C — back inside safe corridor"]);
  events.push(["INVESTIGATION_RESOLVED", "Sensor fault — probe reseated — covered excursion #2"]);
  return chainOf(events);
}

function textOps(pages: readonly PdfPage[]): Extract<PdfOp, { kind: "text" }>[] {
  return pages.flatMap((page) => page.ops).filter((op): op is Extract<PdfOp, { kind: "text" }> =>
    op.kind === "text",
  );
}

describe("layoutShipmentReport", () => {
  it("keeps every mark inside the printable area", () => {
    // Overflow is the failure a PDF hides: it renders happily, and the text
    // is simply gone off the edge of the sheet.
    const pages = layoutShipmentReport(reportOf(longChain(120)));
    for (const op of textOps(pages)) {
      expect(op.x).toBeGreaterThanOrEqual(0);
      expect(op.x + textWidth(op.text, op.font, op.size)).toBeLessThanOrEqual(PAGE_WIDTH);
      expect(op.y).toBeGreaterThan(0);
      expect(op.y).toBeLessThan(PAGE_HEIGHT);
    }
  });

  it("breaks a long ledger across pages rather than off the bottom", () => {
    const short = layoutShipmentReport(reportOf(longChain(4)));
    const long = layoutShipmentReport(reportOf(longChain(200)));
    expect(short).toHaveLength(1);
    expect(long.length).toBeGreaterThan(3);
  });

  it("repeats the column headers on every page of the table", () => {
    // A reader handed page four alone has to be able to tell which column is
    // the digest.
    const pages = layoutShipmentReport(reportOf(longChain(200)));
    const withHeaders = pages.filter((page) =>
      page.ops.some((op) => op.kind === "text" && op.text === "DIGEST"),
    );
    expect(withHeaders.length).toBe(pages.length);
  });

  it("stamps a footer with the page count on every page", () => {
    const pages = layoutShipmentReport(reportOf(longChain(200)));
    pages.forEach((page, index) => {
      const labels = page.ops.filter(
        (op) => op.kind === "text" && op.text === `${index + 1} / ${pages.length}`,
      );
      expect(labels).toHaveLength(1);
    });
  });

  it("carries the tamper-evidence caveat on every page", () => {
    // The PDF outlives the app that made it and will be read with none of the
    // app's context, so the limit of what the chain proves travels with it.
    const pages = layoutShipmentReport(reportOf(longChain(200)));
    for (const page of pages) {
      const hasCaveat = page.ops.some(
        (op) => op.kind === "text" && op.text.includes("Tamper evidence"),
      );
      expect(hasCaveat).toBe(true);
    }
  });

  it("prints an unresolved investigation rather than omitting it", () => {
    const pages = layoutShipmentReport(
      reportOf(
        chainOf([
          ["SHIPMENT_CREATE", "opened"],
          ["EXCURSION_OPEN", "8.6 °C — left safe corridor"],
          ["INVESTIGATION_OPEN", "Investigation opened"],
        ]),
      ),
    );
    const texts = textOps(pages).map((op) => op.text);
    expect(texts.some((text) => text.startsWith("Open  ·"))).toBe(true);
    expect(texts.some((text) => text.includes("not cleared"))).toBe(true);
  });

  it("says so plainly when the corridor never broke", () => {
    const pages = layoutShipmentReport(
      reportOf(chainOf([["SHIPMENT_CREATE", "opened"], ["TEMPERATURE_READING", "4.4 °C"]])),
    );
    const texts = textOps(pages).map((op) => op.text);
    expect(texts.some((text) => text.includes("None opened"))).toBe(true);
  });
});

describe("renderShipmentReportPdf", () => {
  it("produces an openable file for a real shipment", () => {
    const file = renderShipmentReportPdf(reportOf(longChain(60)));
    expect(file.startsWith("%PDF-1.4")).toBe(true);
    expect(file).toContain("/Type /Catalog");
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("names the shipment in the document metadata", () => {
    const file = renderShipmentReportPdf(reportOf(longChain(4)));
    expect(file).toContain("VCC-BOX-417");
  });
});
