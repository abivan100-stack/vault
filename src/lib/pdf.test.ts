import { describe, expect, it } from "vitest";
import {
  PAGE_HEIGHT,
  encodeWinAnsi,
  pdfBytes,
  renderPdf,
  textWidth,
  truncateToWidth,
  wrapText,
  type PdfMeta,
  type PdfPage,
} from "./pdf";

const META: PdfMeta = {
  title: "Vault shipment report",
  author: "Vault",
  subject: "Cold chain",
  createdAt: new Date("2026-08-27T10:00:00.000Z"),
};

describe("textWidth", () => {
  it("treats Courier as monospace", () => {
    // Every Courier glyph is 600/1000 em, so width is purely a character count.
    expect(textWidth("abcd", "Courier", 10)).toBeCloseTo(24, 5);
    expect(textWidth("iiii", "Courier", 10)).toBeCloseTo(
      textWidth("mmmm", "Courier", 10),
      5,
    );
  });

  it("gives Helvetica real per-glyph widths", () => {
    // The whole point of carrying the AFM table: proportional text cannot be
    // measured by counting characters.
    expect(textWidth("i", "Helvetica", 10)).toBeLessThan(textWidth("m", "Helvetica", 10));
    expect(textWidth("Hello", "Helvetica-Bold", 10)).toBeGreaterThan(
      textWidth("Hello", "Helvetica", 10),
    );
  });

  it("scales linearly with size", () => {
    expect(textWidth("Vault", "Helvetica", 20)).toBeCloseTo(
      textWidth("Vault", "Helvetica", 10) * 2,
      5,
    );
  });
});

describe("truncateToWidth", () => {
  it("leaves text that already fits alone", () => {
    const text = "VCC-BOX-417";
    expect(truncateToWidth(text, "Courier", 9, 500)).toBe(text);
  });

  it("never returns something wider than the limit", () => {
    // A column that overflows collides with the next one, which is the whole
    // reason this exists.
    const limit = 40;
    const result = truncateToWidth("a very long shipment detail line", "Helvetica", 9, limit);
    expect(textWidth(result, "Helvetica", 9)).toBeLessThanOrEqual(limit);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("returns empty rather than overflow when even the ellipsis will not fit", () => {
    expect(truncateToWidth("anything", "Helvetica", 9, 0.5)).toBe("");
  });
});

describe("wrapText", () => {
  it("wraps on words and keeps every line within the limit", () => {
    const limit = 120;
    const lines = wrapText(
      "Sensor fault confirmed by the carrier after the box was reseated",
      "Helvetica",
      9,
      limit,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(textWidth(line, "Helvetica", 9)).toBeLessThanOrEqual(limit);
    }
  });

  it("breaks a single unbreakable word rather than overflowing", () => {
    // Hashes and log ids have no spaces to break on; letting one overflow
    // would run it straight through the next column.
    const hash = "a".repeat(64);
    const limit = 60;
    const lines = wrapText(hash, "Courier", 8, limit);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(textWidth(line, "Courier", 8)).toBeLessThanOrEqual(limit);
    }
    expect(lines.join("")).toBe(hash);
  });

  it("returns one empty line for empty input", () => {
    expect(wrapText("   ", "Helvetica", 9, 100)).toEqual([""]);
  });
});

describe("encodeWinAnsi", () => {
  it("substitutes characters WinAnsi has no glyph for", () => {
    // Routes carry a rightwards arrow; there is no WinAnsi arrow, and writing
    // the raw byte would render as an unrelated glyph.
    expect(encodeWinAnsi("DELHI → JAIPUR")).toBe("DELHI -> JAIPUR");
  });

  it("passes through Latin-1 characters the readings need", () => {
    expect(encodeWinAnsi("4.4 °C")).toBe("4.4 °C");
  });

  it("maps punctuation to its WinAnsi byte", () => {
    expect(encodeWinAnsi("a \u2013 b")).toBe("a \u0096 b");
  });

  it("replaces anything unrepresentable with a visible placeholder", () => {
    expect(encodeWinAnsi("cold ❄ chain")).toBe("cold ? chain");
  });
});

describe("renderPdf", () => {
  const page: PdfPage = {
    ops: [
      { kind: "text", x: 40, y: 60, text: "Shipment report", font: "Helvetica-Bold", size: 14 },
      { kind: "line", x1: 40, y1: 70, x2: 555, y2: 70 },
      { kind: "rect", x: 40, y: 80, width: 100, height: 20, fill: [0.9, 0.9, 0.9] },
    ],
  };

  it("produces a structurally complete file", () => {
    const file = renderPdf([page], META);
    expect(file.startsWith("%PDF-1.4")).toBe(true);
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(file).toContain("/Type /Catalog");
    expect(file).toContain("/Count 1");
  });

  it("points every xref entry at the object it claims", () => {
    // Byte offsets in the xref are what make a PDF openable at all, and they
    // are only correct because the file is one char per byte. Anything that
    // introduces a multi-byte character into `renderPdf` breaks this test.
    const file = renderPdf([page, page], META);
    // "startxref" contains "xref" and comes later in the file, so the table
    // has to be located by its own line rather than by substring.
    const xrefIndex = file.lastIndexOf("\nxref\n");
    const lines = file.slice(xrefIndex).split("\n");
    const offsets = lines
      .filter((line) => / 00000 n $/.test(line))
      .map((line) => Number(line.slice(0, 10)));

    expect(offsets.length).toBeGreaterThan(0);
    offsets.forEach((offset, index) => {
      expect(file.slice(offset, offset + 20)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });

    const startxref = Number(file.slice(file.lastIndexOf("startxref\n") + 10).split("\n")[0]);
    expect(file.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("counts and links one page object per page", () => {
    const file = renderPdf([page, page, page], META);
    expect(file).toContain("/Count 3");
    expect(file.match(/\/Type \/Page[^s]/g)?.length).toBe(3);
  });

  it("escapes characters that would end a PDF string early", () => {
    const file = renderPdf(
      [{ ops: [{ kind: "text", x: 0, y: 0, text: "a (b) c", font: "Helvetica", size: 9 }] }],
      META,
    );
    expect(file).toContain("(a \\(b\\) c) Tj");
  });

  it("flips top-left coordinates onto PDF's bottom-left origin", () => {
    const file = renderPdf(
      [{ ops: [{ kind: "text", x: 40, y: 100, text: "x", font: "Helvetica", size: 9 }] }],
      META,
    );
    expect(file).toContain(`40 ${PAGE_HEIGHT - 100} Td`);
  });

  it("still emits a valid file for a document with no pages", () => {
    const file = renderPdf([], META);
    expect(file).toContain("/Count 1");
  });
});

describe("pdfBytes", () => {
  it("writes exactly one byte per character", () => {
    const file = renderPdf([{ ops: [] }], META);
    const bytes = pdfBytes(file);
    expect(bytes.length).toBe(file.length);
    expect(bytes.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
  });
});
