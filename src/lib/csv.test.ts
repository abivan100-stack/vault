import { describe, expect, it } from "vitest";
import { escapeCsvField, toCsv } from "./csv";

describe("escapeCsvField", () => {
  it("leaves plain values alone", () => {
    expect(escapeCsvField("TEMPERATURE_READING")).toBe("TEMPERATURE_READING");
    expect(escapeCsvField("4.8 °C")).toBe("4.8 °C");
  });

  it("quotes delimiters, quotes and newlines", () => {
    expect(escapeCsvField("Delhi, Jaipur")).toBe('"Delhi, Jaipur"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("defuses spreadsheet formula injection", () => {
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-2")).toBe("'-2");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
  });

  it("quotes a neutralised value that also contains a comma", () => {
    expect(escapeCsvField("=A1,B2")).toBe(`"'=A1,B2"`);
  });
});

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("survives a detail field containing a comma", () => {
    const csv = toCsv(
      ["sequence", "detail"],
      [["1", "4.8 °C, back inside safe corridor"]],
    );
    expect(csv.split("\r\n")[1]).toBe('1,"4.8 °C, back inside safe corridor"');
    // One row in, one row out — the comma must not split into a third column.
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("handles an empty row set", () => {
    expect(toCsv(["a"], [])).toBe("a");
  });
});
