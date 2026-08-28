/**
 * Lays a `ShipmentReport` out onto PDF pages.
 *
 * This module owns typography and page breaks and nothing else: every fact it
 * prints is already decided in `report.ts`, and every byte it writes is
 * handled by `pdf.ts`. Keeping the three apart is what lets the wording of a
 * verdict be unit-tested without rendering anything.
 *
 * The footer's "page 2 of 5" cannot be written until the last page exists, so
 * pages are collected first and footers stamped onto all of them at the end.
 */

import { formatClock, formatIsoDate } from "./simulation";
import { shortEventLabel, type LedgerEntry } from "./ledger";
import { shortHash } from "./hash";
import { SAFE_MAX_C, SAFE_MIN_C } from "./chart";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  renderPdf,
  textWidth,
  truncateToWidth,
  wrapText,
  type PdfColor,
  type PdfFontName,
  type PdfOp,
  type PdfPage,
} from "./pdf";
import { reportVerdict, type ShipmentReport } from "./report";

const MARGIN_X = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 62;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

/**
 * A print palette, not the screen one. The app's tokens are tuned for a
 * backlit surface in two themes; paper is one theme and it is white, so the
 * report picks its own greys and keeps a single accent.
 */
const INK: PdfColor = [0.11, 0.12, 0.11];
const INK_MUTED: PdfColor = [0.36, 0.38, 0.37];
const INK_SUBTLE: PdfColor = [0.52, 0.54, 0.53];
const LINE: PdfColor = [0.82, 0.81, 0.79];
const BRAND: PdfColor = [0.05, 0.43, 0.39];
const WARNING: PdfColor = [0.54, 0.31, 0.04];
const WASH: PdfColor = [0.95, 0.945, 0.93];

/** Vertical rhythm. Sizes are points; leading is a multiple of the size. */
const BODY_SIZE = 9;
const BODY_LEADING = 12.5;

/**
 * A cursor down the page that opens a new page when it runs out of room.
 *
 * Everything below draws through this rather than computing absolute
 * positions, so adding a section never requires re-deriving where the ones
 * after it start.
 */
class Layout {
  readonly pages: PdfPage[] = [];
  private ops: PdfOp[] = [];
  y = MARGIN_TOP;

  constructor() {
    this.pages.push({ ops: this.ops });
  }

  /** Starts a new page. Callers use `ensure` rather than calling this. */
  break(): void {
    this.ops = [];
    this.pages.push({ ops: this.ops });
    this.y = MARGIN_TOP;
  }

  /** Opens a new page unless `height` more points still fit on this one. */
  ensure(height: number): void {
    if (this.y + height > PAGE_HEIGHT - MARGIN_BOTTOM) this.break();
  }

  push(...ops: PdfOp[]): void {
    this.ops.push(...ops);
  }

  text(
    text: string,
    x: number,
    options: { font?: PdfFontName; size?: number; color?: PdfColor } = {},
  ): void {
    this.push({
      kind: "text",
      x,
      y: this.y,
      text,
      font: options.font ?? "Helvetica",
      size: options.size ?? BODY_SIZE,
      color: options.color ?? INK,
    });
  }

  rule(color: PdfColor = LINE, width = 0.5): void {
    this.push({
      kind: "line",
      x1: MARGIN_X,
      y1: this.y,
      x2: MARGIN_X + CONTENT_WIDTH,
      y2: this.y,
      width,
      color,
    });
  }
}

function fieldOr(value: string | null, fallback = "—"): string {
  return value === null || value.trim().length === 0 ? fallback : value;
}

function stamp(iso: string | null): string {
  if (iso === null) return "—";
  return `${formatIsoDate(iso)}  ${formatClock(iso)}`;
}

/* -------------------------------------------------------------------------
   Sections
   ------------------------------------------------------------------------- */

function drawMasthead(layout: Layout, report: ShipmentReport): void {
  layout.y = MARGIN_TOP;
  layout.text("VAULT", MARGIN_X, { font: "Helvetica-Bold", size: 11, color: BRAND });

  const right = "COLD-CHAIN SHIPMENT REPORT";
  layout.push({
    kind: "text",
    x: MARGIN_X + CONTENT_WIDTH - textWidth(right, "Helvetica", 8),
    y: layout.y,
    text: right,
    font: "Helvetica",
    size: 8,
    color: INK_SUBTLE,
  });

  layout.y += 8;
  layout.rule(BRAND, 1.2);

  layout.y += 26;
  // Truncated: these are operator-entered and long ones ran off the page.
  layout.text(truncateToWidth(report.shipment.box, "Helvetica-Bold", 19, CONTENT_WIDTH), MARGIN_X, {
    font: "Helvetica-Bold",
    size: 19,
  });

  layout.y += 15;
  layout.text(
    truncateToWidth(
      `${report.shipment.product}  ·  ${report.shipment.batch}  ·  ${report.shipment.route}`,
      "Helvetica",
      9.5,
      CONTENT_WIDTH,
    ),
    MARGIN_X,
    { size: 9.5, color: INK_MUTED },
  );

  layout.y += 22;
}

function drawVerdict(layout: Layout, report: ShipmentReport): void {
  const verdict = reportVerdict(report);
  const clean =
    report.verification.intact &&
    report.discardedEntryCount === 0 &&
    report.openInvestigationCount === 0 &&
    report.complete;

  const lines = wrapText(verdict, "Helvetica", 10, CONTENT_WIDTH - 28);
  const height = 20 + lines.length * 13;

  layout.ensure(height + 10);
  layout.push({
    kind: "rect",
    x: MARGIN_X,
    y: layout.y,
    width: CONTENT_WIDTH,
    height,
    fill: WASH,
  });
  // A single accent bar carries the verdict's tone, so the box itself never
  // has to be tinted red — a coloured panel on a monochrome print is a smudge.
  layout.push({
    kind: "rect",
    x: MARGIN_X,
    y: layout.y,
    width: 3,
    height,
    fill: clean ? BRAND : WARNING,
  });

  layout.y += 15;
  for (const line of lines) {
    layout.text(line, MARGIN_X + 14, { size: 10, color: clean ? INK : WARNING });
    layout.y += 13;
  }
  layout.y += 18;
}

function drawSectionHeading(layout: Layout, title: string): void {
  layout.ensure(40);
  layout.text(title.toUpperCase(), MARGIN_X, {
    font: "Helvetica-Bold",
    size: 8,
    color: INK_SUBTLE,
  });
  layout.y += 6;
  layout.rule();
  layout.y += 16;
}

/** A two-column key/value grid — the shipment record and the corridor. */
function drawPairs(layout: Layout, pairs: readonly [string, string][]): void {
  const columnWidth = CONTENT_WIDTH / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    layout.ensure(30);
    const row = pairs.slice(i, i + 2);
    const top = layout.y;
    row.forEach(([label, value], column) => {
      const x = MARGIN_X + column * columnWidth;
      layout.push({
        kind: "text",
        x,
        y: top,
        text: label,
        font: "Helvetica",
        size: 7.5,
        color: INK_SUBTLE,
      });
      layout.push({
        kind: "text",
        x,
        y: top + 12,
        text: truncateToWidth(value, "Courier", 9, columnWidth - 16),
        font: "Courier",
        size: 9,
        color: INK,
      });
    });
    layout.y = top + 28;
  }
  layout.y += 4;
}

function drawInvestigations(layout: Layout, report: ShipmentReport): void {
  drawSectionHeading(layout, "Investigations");

  if (report.investigations.length === 0) {
    layout.text("None opened. The corridor held for the whole shipment.", MARGIN_X, {
      color: INK_MUTED,
    });
    layout.y += 22;
    return;
  }

  for (const investigation of report.investigations) {
    const resolved = investigation.resolvedAt !== null;
    const noteLines = wrapText(
      investigation.resolution ?? "Unresolved at the time this report was produced.",
      "Helvetica",
      BODY_SIZE,
      CONTENT_WIDTH - 16,
    );

    // Room for the heading, the timestamp line and at least the first line of
    // the note. The note itself is checked line by line below: a long
    // resolution can be longer than a page, and measuring the whole block
    // once meant it ran off the bottom rather than continuing overleaf.
    layout.ensure(46 + BODY_LEADING);

    layout.push({
      kind: "rect",
      x: MARGIN_X,
      y: layout.y - 4,
      width: 2,
      // Only as tall as what will actually be drawn on this page.
      height: 30 + Math.min(noteLines.length, 1) * BODY_LEADING,
      fill: resolved ? LINE : WARNING,
    });

    layout.text(
      resolved ? `Resolved  ·  #${investigation.openedSequence}` : `Open  ·  #${investigation.openedSequence}`,
      MARGIN_X + 12,
      { font: "Helvetica-Bold", size: 9, color: resolved ? INK : WARNING },
    );
    layout.y += 12;

    const span = resolved
      ? `${stamp(investigation.openedAt)}  to  ${stamp(investigation.resolvedAt)}`
      : `Opened ${stamp(investigation.openedAt)}`;
    const covered =
      investigation.coveredExcursions.length > 0
        ? `  ·  absorbed ${investigation.coveredExcursions.map((one) => `#${one}`).join(", ")}`
        : "";
    layout.text(
      truncateToWidth(`${span}${covered}`, "Courier", 8, CONTENT_WIDTH - 16),
      MARGIN_X + 12,
      { font: "Courier", size: 8, color: INK_SUBTLE },
    );
    layout.y += 14;

    for (const line of noteLines) {
      // Each line asks for its own room, so the note breaks across pages
      // instead of being clipped at the boundary.
      layout.ensure(BODY_LEADING);
      layout.text(line, MARGIN_X + 12, { color: resolved ? INK_MUTED : WARNING });
      layout.y += BODY_LEADING;
    }
    layout.y += 12;
  }
}

/* -------------------------------------------------------------------------
   The ledger table
   ------------------------------------------------------------------------- */

const COLUMNS = [
  { key: "seq", label: "SEQ", x: 0, width: 34 },
  { key: "event", label: "EVENT", x: 34, width: 74 },
  { key: "detail", label: "DETAIL", x: 108, width: 214 },
  { key: "recorded", label: "RECORDED", x: 322, width: 106 },
  { key: "hash", label: "DIGEST", x: 428, width: CONTENT_WIDTH - 428 },
] as const;

const ROW_HEIGHT = 15;

function drawTableHeader(layout: Layout): void {
  layout.push({
    kind: "rect",
    x: MARGIN_X,
    y: layout.y - 9,
    width: CONTENT_WIDTH,
    height: 17,
    fill: WASH,
  });
  for (const column of COLUMNS) {
    layout.text(column.label, MARGIN_X + column.x + 5, {
      font: "Helvetica-Bold",
      size: 7,
      color: INK_SUBTLE,
    });
  }
  layout.y += 8;
  layout.rule();
  layout.y += 12;
}

function drawLedgerTable(layout: Layout, entries: readonly LedgerEntry[]): void {
  drawSectionHeading(layout, `Ledger — ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`);
  drawTableHeader(layout);

  if (entries.length === 0) {
    layout.text("No entries retained for this shipment.", MARGIN_X + 5, { color: INK_MUTED });
    layout.y += 20;
    return;
  }

  for (const entry of entries) {
    // A row that would land in the footer starts the next page instead — and
    // takes the column headers with it, so page 4 is readable on its own.
    if (layout.y + ROW_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
      layout.break();
      layout.y = MARGIN_TOP + 12;
      drawTableHeader(layout);
    }

    const excursion = entry.event === "EXCURSION_OPEN" || entry.event === "INVESTIGATION_OPEN";
    const top = layout.y;

    const cells: [(typeof COLUMNS)[number], string, "mono" | "sans"][] = [
      [COLUMNS[0], String(entry.sequence).padStart(3, "0"), "mono"],
      [COLUMNS[1], shortEventLabel(entry.event), "sans"],
      [COLUMNS[2], entry.detail, "sans"],
      [COLUMNS[3], stamp(entry.at), "mono"],
      [COLUMNS[4], shortHash(entry.hash), "mono"],
    ];

    for (const [column, value, face] of cells) {
      const font = face === "mono" ? "Courier" : "Helvetica";
      const size = face === "mono" ? 7.5 : 8;
      layout.push({
        kind: "text",
        x: MARGIN_X + column.x + 5,
        y: top,
        text: truncateToWidth(value, font, size, column.width - 10),
        font,
        size,
        color: excursion && column.key === "detail" ? WARNING : column.key === "detail" ? INK : INK_MUTED,
      });
    }

    layout.y = top + ROW_HEIGHT;
    layout.push({
      kind: "line",
      x1: MARGIN_X,
      y1: layout.y - 5,
      x2: MARGIN_X + CONTENT_WIDTH,
      y2: layout.y - 5,
      width: 0.25,
      color: LINE,
    });
  }

  layout.y += 10;
}

/* -------------------------------------------------------------------------
   Footers
   ------------------------------------------------------------------------- */

/**
 * The standing caveat, on every page.
 *
 * The audit this codebase came out of was caused by a presentation layer
 * claiming guarantees the state layer never provided. A PDF outlives the app
 * that made it and will be read without any of that context, so the limit of
 * what the chain proves travels with it rather than being stated once.
 */
const DISCLAIMER =
  "Tamper evidence, not tamper proofing: the chain is unsigned and held in browser storage. Verification detects an edited, removed or reordered entry; it cannot authenticate a chain replaced wholesale.";

function stampFooters(pages: PdfPage[], report: ShipmentReport): void {
  const footerY = PAGE_HEIGHT - MARGIN_BOTTOM + 22;
  const disclaimerLines = wrapText(DISCLAIMER, "Helvetica", 6.5, CONTENT_WIDTH);

  pages.forEach((page, index) => {
    page.ops.push({
      kind: "line",
      x1: MARGIN_X,
      y1: footerY - 14,
      x2: MARGIN_X + CONTENT_WIDTH,
      y2: footerY - 14,
      width: 0.5,
      color: LINE,
    });

    page.ops.push({
      kind: "text",
      x: MARGIN_X,
      y: footerY,
      text: `${report.shipment.logId}  ·  generated ${stamp(report.generatedAt)}`,
      font: "Courier",
      size: 7,
      color: INK_SUBTLE,
    });

    const pageLabel = `${index + 1} / ${pages.length}`;
    page.ops.push({
      kind: "text",
      x: MARGIN_X + CONTENT_WIDTH - textWidth(pageLabel, "Courier", 7),
      y: footerY,
      text: pageLabel,
      font: "Courier",
      size: 7,
      color: INK_SUBTLE,
    });

    disclaimerLines.forEach((line, lineIndex) => {
      page.ops.push({
        kind: "text",
        x: MARGIN_X,
        y: footerY + 11 + lineIndex * 8,
        text: line,
        font: "Helvetica",
        size: 6.5,
        color: INK_SUBTLE,
      });
    });
  });
}

/* -------------------------------------------------------------------------
   Entry point
   ------------------------------------------------------------------------- */

function corridorPairs(report: ShipmentReport): [string, string][] {
  const { corridor } = report;
  const range =
    corridor.lowC === null || corridor.highC === null
      ? "—"
      : `${corridor.lowC.toFixed(1)} to ${corridor.highC.toFixed(1)} °C`;

  return [
    ["Safe corridor", `${SAFE_MIN_C.toFixed(1)}–${SAFE_MAX_C.toFixed(1)} °C`],
    ["Observed range", range],
    ["Readings on the ledger", String(corridor.sampleCount)],
    ["Excursions opened", String(corridor.excursionsOpened)],
    ["Excursions recovered", String(corridor.excursionsCleared)],
    ["Investigations", String(report.investigations.length)],
  ];
}

function shipmentPairs(report: ShipmentReport): [string, string][] {
  return [
    ["Log id", report.shipment.logId],
    ["Batch", report.shipment.batch],
    ["Product", report.shipment.product],
    ["Doses", report.shipment.doses],
    ["Route", report.shipment.route],
    ["Declared range", report.shipment.range],
    ["Opened", stamp(report.shipment.startedAt)],
    ["Handed off", fieldOr(report.closedAt === null ? null : stamp(report.closedAt), "In transit")],
  ];
}

/**
 * Lays the report out into pages, without serialising them.
 *
 * Exported so the geometry can be asserted directly — that nothing is drawn
 * into the margins, and that no table row overlaps the footer. Those are the
 * failures a PDF shows silently, and they cannot be seen from the file bytes.
 */
export function layoutShipmentReport(report: ShipmentReport): PdfPage[] {
  const layout = new Layout();

  drawMasthead(layout, report);
  drawVerdict(layout, report);

  drawSectionHeading(layout, "Shipment record");
  drawPairs(layout, shipmentPairs(report));

  drawSectionHeading(layout, "Corridor");
  drawPairs(layout, corridorPairs(report));

  drawInvestigations(layout, report);
  drawLedgerTable(layout, report.entries);

  stampFooters(layout.pages, report);
  return layout.pages;
}

/** Renders the report and returns the PDF file as a byte-per-char string. */
export function renderShipmentReportPdf(report: ShipmentReport): string {
  return renderPdf(layoutShipmentReport(report), {
    title: `Vault shipment report — ${report.shipment.box}`,
    author: "Vault cold-chain console",
    subject: `${report.shipment.batch} · ${report.shipment.route}`,
    createdAt: new Date(report.generatedAt),
  });
}
