import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE,
  boxSerial,
  createFieldLog,
  normalizeFieldLog,
  parseDoses,
  parseRoute,
  randomSerial,
  validateFieldLog,
  type FieldLogMeta,
} from "./shipment";

const NOW = new Date("2026-08-27T09:15:00.000Z");
const BASE = createFieldLog(NOW, "124");

describe("createFieldLog", () => {
  it("builds a complete record from the serial", () => {
    expect(BASE.box).toBe("VCC-BOX-124");
    expect(BASE.batch).toContain("124");
    expect(BASE.handedOffAt).toBeNull();
    expect(new Date(BASE.startedAt).toISOString()).toBe(NOW.toISOString());
  });
});

describe("randomSerial", () => {
  it("always produces three digits", () => {
    expect(randomSerial(() => 0)).toBe("100");
    expect(randomSerial(() => 0.999999)).toBe("999");
    for (let i = 0; i < 200; i += 1) {
      expect(randomSerial()).toMatch(/^\d{3}$/);
    }
  });
});

describe("normalizeFieldLog", () => {
  it("returns the fallback for non-objects", () => {
    expect(normalizeFieldLog(null, BASE)).toEqual(BASE);
    expect(normalizeFieldLog("corrupt", BASE)).toEqual(BASE);
    expect(normalizeFieldLog([1, 2], BASE)).toEqual(BASE);
  });

  it("fills every missing field so downstream string ops cannot throw", () => {
    // The pre-ISO schema: no handedOffAt, a locale `started`, missing batch.
    const stale = {
      logId: "FIELD LOG / 2026-0826-00124",
      box: "VCC-BOX-001",
      product: "IPV Polio Vaccine",
      started: "14:20:02",
    };
    const result = normalizeFieldLog(stale, BASE);

    expect(result.box).toBe("VCC-BOX-001");
    expect(result.batch).toBe(BASE.batch);
    expect(result.route).toBe(BASE.route);
    expect(result.handedOffAt).toBeNull();
    expect(() => result.batch.slice(0, 12)).not.toThrow();
    expect(() => boxSerial(result.box)).not.toThrow();

    for (const [key, value] of Object.entries(result)) {
      if (key === "handedOffAt") continue;
      expect(typeof value, key).toBe("string");
      expect((value as string).length, key).toBeGreaterThan(0);
    }
  });

  it("rejects blank and wrongly-typed values", () => {
    const result = normalizeFieldLog({ box: "   ", batch: 42, doses: null }, BASE);
    expect(result.box).toBe(BASE.box);
    expect(result.batch).toBe(BASE.batch);
    expect(result.doses).toBe(BASE.doses);
  });

  it("drops an unparseable handoff timestamp", () => {
    expect(normalizeFieldLog({ handedOffAt: "yesterday" }, BASE).handedOffAt).toBeNull();
    expect(normalizeFieldLog({ handedOffAt: 12345 }, BASE).handedOffAt).toBeNull();
  });

  it("keeps a valid handoff timestamp", () => {
    const stamp = "2026-08-27T11:00:00.000Z";
    expect(normalizeFieldLog({ handedOffAt: stamp }, BASE).handedOffAt).toBe(stamp);
  });

  it("falls back when startedAt is unparseable", () => {
    expect(normalizeFieldLog({ startedAt: "14:20:02" }, BASE).startedAt).toBe(BASE.startedAt);
  });
});

describe("parseRoute", () => {
  it("splits on every separator the UI accepts", () => {
    expect(parseRoute(DEFAULT_ROUTE)).toEqual({ origin: "DELHI", destination: "JAIPUR" });
    expect(parseRoute("DELHI -> JAIPUR")).toEqual({ origin: "DELHI", destination: "JAIPUR" });
    expect(parseRoute("Delhi to Jaipur")).toEqual({ origin: "Delhi", destination: "Jaipur" });
    expect(parseRoute("DELHI, JAIPUR")).toEqual({ origin: "DELHI", destination: "JAIPUR" });
    expect(parseRoute("DELHI - JAIPUR")).toEqual({ origin: "DELHI", destination: "JAIPUR" });
  });

  it("uses the first and last stop on a multi-leg route", () => {
    expect(parseRoute("DELHI → AGRA → JAIPUR")).toEqual({
      origin: "DELHI",
      destination: "JAIPUR",
    });
  });

  it("degrades gracefully on incomplete input", () => {
    expect(parseRoute("DELHI")).toEqual({ origin: "DELHI", destination: "DESTINATION" });
    expect(parseRoute("   ")).toEqual({ origin: "ORIGIN", destination: "DESTINATION" });
  });
});

describe("parseDoses", () => {
  it("reads the count out of free text", () => {
    expect(parseDoses("250 units")).toBe(250);
    expect(parseDoses("1,250 units")).toBe(1250);
    expect(parseDoses("approx 40")).toBe(40);
  });

  it("returns null when there is no number", () => {
    expect(parseDoses("plenty")).toBeNull();
    expect(parseDoses("")).toBeNull();
  });
});

describe("boxSerial", () => {
  it("returns the trailing segment", () => {
    expect(boxSerial("VCC-BOX-001")).toBe("001");
    expect(boxSerial("BOX")).toBe("BOX");
    expect(boxSerial("VCC-BOX-")).toBe("BOX");
  });
});

describe("validateFieldLog", () => {
  const draft = (patch: Partial<FieldLogMeta>): FieldLogMeta => ({ ...BASE, ...patch });

  it("accepts a complete record", () => {
    expect(validateFieldLog(BASE)).toEqual({ ok: true });
  });

  it("rejects blank required fields", () => {
    expect(validateFieldLog(draft({ box: "  " })).ok).toBe(false);
    expect(validateFieldLog(draft({ product: "" })).ok).toBe(false);
    expect(validateFieldLog(draft({ batch: "" })).ok).toBe(false);
    expect(validateFieldLog(draft({ range: "" })).ok).toBe(false);
  });

  it("rejects doses without a number", () => {
    const result = validateFieldLog(draft({ doses: "lots" }));
    expect(result).toEqual({ ok: false, message: "Doses must contain a number" });
  });

  it("rejects a route with no destination", () => {
    expect(validateFieldLog(draft({ route: "DELHI" })).ok).toBe(false);
  });
});
