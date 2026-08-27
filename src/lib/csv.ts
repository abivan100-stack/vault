/** RFC 4180 CSV writing, plus a download path that survives Firefox. */

/**
 * Quotes a field when it contains a delimiter, quote or newline, and defuses
 * spreadsheet formula injection by prefixing risky leading characters.
 */
export function escapeCsvField(value: string): string {
  const neutralised = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(neutralised)) {
    return `"${neutralised.replace(/"/g, '""')}"`;
  }
  return neutralised;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

/**
 * Triggers a client-side download.
 *
 * The anchor is attached to the document before clicking (Firefox ignores
 * clicks on detached anchors) and the object URL is revoked on the next tick
 * rather than synchronously, which would cancel the download mid-flight.
 */
export function downloadCsv(filename: string, csv: string): void {
  // Excel needs the BOM to read UTF-8 correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
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
