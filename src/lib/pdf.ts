/**
 * A minimal PDF 1.4 writer.
 *
 * Vault's end-of-shipment report has to be a real file an auditor can keep,
 * not a print dialog and not a screenshot — so it is generated here rather
 * than pulled in as a dependency. The subset is deliberately small: the base
 * fourteen fonts (no embedding), flat uncompressed content streams, and the
 * three primitives a report actually needs — text, rules and filled boxes.
 *
 * Two things about the coordinate system are worth knowing before editing:
 *
 * - PDF's origin is the BOTTOM-left of the page and y grows upward. Every
 *   public API here takes TOP-left coordinates with y growing downward,
 *   because that is how the layout code thinks. The flip happens once, in
 *   `renderOp`.
 * - Fonts are not embedded, so a glyph only appears if it exists in
 *   WinAnsiEncoding. `encodeWinAnsi` maps the handful of characters the app
 *   actually emits (arrows, dashes, degree signs) and substitutes anything
 *   else rather than writing a byte that would render as an unrelated glyph.
 */

/** A4, in points. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export type PdfFontName = "Helvetica" | "Helvetica-Bold" | "Courier" | "Courier-Bold";

/** Red, green, blue — each in [0, 1]. */
export type PdfColor = readonly [number, number, number];

export type PdfOp =
  | {
      kind: "text";
      /** Left edge of the first glyph. */
      x: number;
      /** Baseline, measured down from the top of the page. */
      y: number;
      text: string;
      font: PdfFontName;
      size: number;
      color?: PdfColor;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width?: number;
      color?: PdfColor;
    }
  | {
      kind: "rect";
      /** Top-left corner. */
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: PdfColor;
      stroke?: PdfColor;
      strokeWidth?: number;
    };

export type PdfPage = { ops: PdfOp[] };

export type PdfMeta = {
  title: string;
  author: string;
  subject: string;
  /** Injected rather than read from the clock, so output is reproducible. */
  createdAt: Date;
};

const BLACK: PdfColor = [0, 0, 0];

/* -------------------------------------------------------------------------
   Text metrics.

   Widths are the AFM values for the base fonts, in 1/1000 em. They exist so
   the layout can right-align a column, truncate a hash and wrap a note
   without guessing — a report whose columns collide is worse than no report.
   ------------------------------------------------------------------------- */

// prettier-ignore
const HELVETICA_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// prettier-ignore
const HELVETICA_BOLD_WIDTHS: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Every Courier glyph is 600/1000 em wide — that is what monospace means. */
const COURIER_WIDTH = 600;

/** Width assumed for a character outside the ASCII table, in 1/1000 em. */
const FALLBACK_WIDTH = 556;

function widthTable(font: PdfFontName): readonly number[] | null {
  if (font === "Helvetica") return HELVETICA_WIDTHS;
  if (font === "Helvetica-Bold") return HELVETICA_BOLD_WIDTHS;
  return null;
}

/** Rendered width of a string, in points. */
export function textWidth(text: string, font: PdfFontName, size: number): number {
  const table = widthTable(font);
  let units = 0;
  // Measured over the encoded form, not the source. encodeWinAnsi turns an
  // arrow into two ASCII characters, so measuring the original counted one
  // glyph where two get drawn and a column could overflow.
  for (const character of encodeWinAnsi(text)) {
    const code = character.codePointAt(0) ?? 32;
    if (table === null) {
      units += COURIER_WIDTH;
    } else if (code >= 32 && code <= 126) {
      units += table[code - 32];
    } else {
      units += FALLBACK_WIDTH;
    }
  }
  return (units * size) / 1000;
}

/**
 * Shortens text to fit `maxWidth`, ending in a single-character ellipsis.
 *
 * Returns the text unchanged when it already fits, and an empty string when
 * even the ellipsis does not — never a string wider than asked for, because
 * callers use this to stop a table column colliding with the next one.
 */
export function truncateToWidth(
  text: string,
  font: PdfFontName,
  size: number,
  maxWidth: number,
): string {
  if (textWidth(text, font, size) <= maxWidth) return text;
  const ellipsis = "\u2026";
  const ellipsisWidth = textWidth(ellipsis, font, size);
  if (ellipsisWidth > maxWidth) return "";

  let kept = "";
  let width = 0;
  for (const character of text) {
    const next = width + textWidth(character, font, size);
    if (next + ellipsisWidth > maxWidth) break;
    kept += character;
    width = next;
  }
  return `${kept}${ellipsis}`;
}

/**
 * Greedy word wrap. A single word longer than the line is broken by
 * character rather than allowed to overflow — hashes and ids do that.
 */
export function wrapText(
  text: string,
  font: PdfFontName,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";

  const flush = () => {
    if (line.length > 0) lines.push(line);
    line = "";
  };

  for (const word of text.split(/\s+/).filter((part) => part.length > 0)) {
    const candidate = line.length > 0 ? `${line} ${word}` : word;
    if (textWidth(candidate, font, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    flush();
    if (textWidth(word, font, size) <= maxWidth) {
      line = word;
      continue;
    }
    // A word that cannot fit on a line of its own — break it by character.
    let chunk = "";
    for (const character of word) {
      if (chunk.length > 0 && textWidth(chunk + character, font, size) > maxWidth) {
        lines.push(chunk);
        chunk = "";
      }
      chunk += character;
    }
    line = chunk;
  }

  flush();
  return lines.length > 0 ? lines : [""];
}

/* -------------------------------------------------------------------------
   Encoding
   ------------------------------------------------------------------------- */

/**
 * Characters the app emits that are not ASCII: either their WinAnsi byte, or
 * an ASCII substitution where WinAnsi has no glyph at all.
 */
const WIN_ANSI_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  // No WinAnsi glyph at all - substituted with ASCII.
  "\u2192": "->", // rightwards arrow: routes, and before/after change lines
  "\u2190": "<-",
  // These DO have WinAnsi glyphs, but at bytes Latin-1 leaves undefined, so
  // each is written as its WinAnsi byte rather than passed through below.
  "\u2013": "\u0096", // en dash
  "\u2014": "\u0097", // em dash
  "\u2018": "\u0091", // left single quote
  "\u2019": "\u0092", // right single quote
  "\u201C": "\u0093", // left double quote
  "\u201D": "\u0094", // right double quote
  "\u2022": "\u0095", // bullet
  "\u2026": "\u0085", // horizontal ellipsis
};

/**
 * Maps a string into single-byte WinAnsi codes.
 *
 * Anything with no WinAnsi glyph becomes `?` rather than being written
 * through — an unmapped byte renders as an unrelated glyph, which in an
 * audit document is worse than an obvious placeholder.
 */
export function encodeWinAnsi(text: string): string {
  let out = "";
  for (const character of text) {
    const substitution = WIN_ANSI_SUBSTITUTIONS[character];
    if (substitution !== undefined) {
      out += substitution;
      continue;
    }
    const code = character.codePointAt(0) ?? 63;
    // 0xA0–0xFF are identical in WinAnsi and Latin-1, which covers the degree
    // sign the corridor readings carry.
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += character;
    } else {
      out += "?";
    }
  }
  return out;
}

/** Escapes a WinAnsi string for use inside a PDF literal string. */
function escapeLiteral(text: string): string {
  return text.replace(/[\\()]/g, (match) => `\\${match}`);
}

/** Encoded, escaped and parenthesised — ready to drop into a stream. */
function literal(text: string): string {
  return `(${escapeLiteral(encodeWinAnsi(text))})`;
}

/* -------------------------------------------------------------------------
   Content streams
   ------------------------------------------------------------------------- */

function num(value: number): string {
  // Three decimals is far below the resolution of anything on the page, and
  // keeps the stream readable when debugging it by eye.
  return Number(value.toFixed(3)).toString();
}

function colorOp(color: PdfColor, stroke: boolean): string {
  return `${num(color[0])} ${num(color[1])} ${num(color[2])} ${stroke ? "RG" : "rg"}`;
}

const FONT_RESOURCE: Readonly<Record<PdfFontName, string>> = {
  Helvetica: "F1",
  "Helvetica-Bold": "F2",
  Courier: "F3",
  "Courier-Bold": "F4",
};

/** Top-left y to PDF's bottom-left y. The single place the flip happens. */
function flipY(y: number): number {
  return PAGE_HEIGHT - y;
}

function renderOp(op: PdfOp): string {
  if (op.kind === "text") {
    return [
      "BT",
      colorOp(op.color ?? BLACK, false),
      `/${FONT_RESOURCE[op.font]} ${num(op.size)} Tf`,
      `${num(op.x)} ${num(flipY(op.y))} Td`,
      `${literal(op.text)} Tj`,
      "ET",
    ].join("\n");
  }

  if (op.kind === "line") {
    return [
      colorOp(op.color ?? BLACK, true),
      `${num(op.width ?? 0.5)} w`,
      `${num(op.x1)} ${num(flipY(op.y1))} m`,
      `${num(op.x2)} ${num(flipY(op.y2))} l`,
      "S",
    ].join("\n");
  }

  // A rect is given by its top-left corner, so its PDF origin is the corner
  // `height` further down the page.
  const rect = `${num(op.x)} ${num(flipY(op.y + op.height))} ${num(op.width)} ${num(op.height)} re`;
  const parts: string[] = [];
  if (op.fill) parts.push(colorOp(op.fill, false));
  if (op.stroke) {
    parts.push(colorOp(op.stroke, true));
    parts.push(`${num(op.strokeWidth ?? 0.5)} w`);
  }
  parts.push(rect);
  if (op.fill && op.stroke) parts.push("B");
  else if (op.fill) parts.push("f");
  else parts.push("S");
  return parts.join("\n");
}

/* -------------------------------------------------------------------------
   Document assembly
   ------------------------------------------------------------------------- */

/** `D:20260827143012Z` — the PDF date format. */
function pdfDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Serialises pages into a complete PDF file.
 *
 * Every byte written here is in the range 0–255 and `pdfBytes` converts the
 * result one char per byte, so a character index into this string is also a
 * byte offset — which is what makes the xref table correct.
 */
export function renderPdf(pages: readonly PdfPage[], meta: PdfMeta): string {
  // A PDF with no pages is not a valid PDF. An empty page is.
  const bodyPages = pages.length > 0 ? pages : [{ ops: [] }];

  // Object numbering: 1 catalog, 2 pages tree, 3–6 fonts, 7 info, then two
  // objects per page (the page, then its content stream).
  const FIRST_PAGE_OBJECT = 8;
  const pageObjectNumber = (index: number) => FIRST_PAGE_OBJECT + index * 2;
  const contentObjectNumber = (index: number) => FIRST_PAGE_OBJECT + index * 2 + 1;

  const objects: string[] = [];
  const kids = bodyPages.map((_, index) => `${pageObjectNumber(index)} 0 R`).join(" ");

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${bodyPages.length} >>`);

  const fontNames: readonly PdfFontName[] = [
    "Helvetica",
    "Helvetica-Bold",
    "Courier",
    "Courier-Bold",
  ];
  for (const font of fontNames) {
    objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`);
  }

  objects.push(
    "<< " +
      `/Title ${literal(meta.title)} ` +
      `/Author ${literal(meta.author)} ` +
      `/Subject ${literal(meta.subject)} ` +
      "/Producer (Vault cold-chain console) " +
      `/CreationDate (${pdfDate(meta.createdAt)}) >>`,
  );

  const resources = "<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >>";

  for (const [index, page] of bodyPages.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_WIDTH)} ${num(PAGE_HEIGHT)}] ` +
        `/Resources ${resources} /Contents ${contentObjectNumber(index)} 0 R >>`,
    );
    const content = page.ops.map(renderOp).join("\n");
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }

  // A comment of high bytes, so tools sniffing the first bytes treat the file
  // as binary and never newline-translate it.
  let file = "%PDF-1.4\n%âãÏÓ\n";

  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = file.length;
  file += `xref\n0 ${objects.length + 1}\n`;
  file += "0000000000 65535 f \n";
  for (const offset of offsets) {
    file += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  file +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return file;
}

/** One char per byte — see `renderPdf` for why that holds. */
export function pdfBytes(file: string): Uint8Array<ArrayBuffer> {
  // Explicitly backed by an ArrayBuffer (rather than the wider
  // ArrayBufferLike, which admits SharedArrayBuffer) so the result is a legal
  // BlobPart for `downloadPdf`.
  const bytes = new Uint8Array(new ArrayBuffer(file.length));
  for (let i = 0; i < file.length; i += 1) {
    bytes[i] = file.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Triggers a client-side download of a rendered PDF.
 *
 * Same anchor dance as `downloadCsv`: attached before clicking, because
 * Firefox ignores clicks on detached anchors, and the object URL revoked on
 * the next tick rather than synchronously, which would cancel the download.
 */
export function downloadPdf(filename: string, file: string): void {
  const blob = new Blob([pdfBytes(file)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 0);
}
