import { describe, expect, it } from "vitest";
import {
  CHART_HEIGHT,
  CHART_MAX_C,
  CHART_MIN_C,
  SAFE_MAX_C,
  SAFE_MIN_C,
  buildChartPath,
  clampTemperature,
  isExcursion,
  statusFor,
  toChartX,
  toChartY,
  toDomainPercent,
} from "./chart";
import {
  chartXLabels,
  formatIsoDate,
  formatWindowLabel,
  nextTemperature,
  pushReading,
  randomDrift,
  READING_WINDOW,
  type Reading,
} from "./simulation";

describe("chart domain", () => {
  it("plots wider than the safe corridor", () => {
    // Without headroom an excursion would clamp onto the threshold line and be
    // indistinguishable from a reading sitting exactly at the limit.
    expect(CHART_MIN_C).toBeLessThan(SAFE_MIN_C);
    expect(CHART_MAX_C).toBeGreaterThan(SAFE_MAX_C);
  });

  it("gives excursions a distinct y from the corridor limits", () => {
    expect(toChartY(1.5)).not.toBe(toChartY(SAFE_MIN_C));
    expect(toChartY(8.5)).not.toBe(toChartY(SAFE_MAX_C));
    expect(toChartY(1.5)).toBeGreaterThan(toChartY(SAFE_MIN_C));
    expect(toChartY(8.5)).toBeLessThan(toChartY(SAFE_MAX_C));
  });

  it("maps the domain ends to the plot ends", () => {
    expect(toChartY(CHART_MAX_C)).toBeCloseTo(0);
    expect(toChartY(CHART_MIN_C)).toBeCloseTo(CHART_HEIGHT);
  });

  it("keeps y inside the plot for out-of-domain input", () => {
    expect(toChartY(-40)).toBe(CHART_HEIGHT);
    expect(toChartY(100)).toBe(0);
  });

  it("gives the gauge distinct positions either side of the corridor", () => {
    expect(toDomainPercent(1.5)).toBeCloseTo(0);
    expect(toDomainPercent(8.5)).toBeCloseTo(100);
    expect(toDomainPercent(1.5)).not.toBeCloseTo(toDomainPercent(SAFE_MIN_C));
  });
});

describe("toChartX", () => {
  it("spreads points across the width", () => {
    expect(toChartX(0, 5, 100)).toBe(0);
    expect(toChartX(4, 5, 100)).toBe(100);
  });

  it("does not divide by zero on a single point", () => {
    expect(toChartX(0, 1, 100)).toBe(0);
    expect(Number.isFinite(toChartX(0, 0, 100))).toBe(true);
  });
});

describe("status", () => {
  it("flags readings outside the corridor", () => {
    expect(isExcursion(1.9)).toBe(true);
    expect(isExcursion(8.1)).toBe(true);
    expect(isExcursion(SAFE_MIN_C)).toBe(false);
    expect(isExcursion(SAFE_MAX_C)).toBe(false);
    expect(statusFor(4.8)).toBe("SAFE");
    expect(statusFor(8.4)).toBe("EXCURSION");
  });
});

describe("buildChartPath", () => {
  it("starts with a move and continues with lines", () => {
    const path = buildChartPath([4, 5, 6]);
    expect(path.startsWith("M")).toBe(true);
    expect(path.split("L")).toHaveLength(3);
  });

  it("handles empty and single-point input", () => {
    expect(buildChartPath([])).toBe("");
    expect(buildChartPath([4.8]).startsWith("M0.0")).toBe(true);
  });
});

describe("nextTemperature", () => {
  it("clamps to the simulated domain", () => {
    expect(nextTemperature(CHART_MAX_C, 5)).toBe(CHART_MAX_C);
    expect(nextTemperature(CHART_MIN_C, -5)).toBe(CHART_MIN_C);
  });

  it("is pure — the same inputs always give the same output", () => {
    expect(nextTemperature(4.8, 0.1)).toBe(nextTemperature(4.8, 0.1));
  });

  it("rounds to one decimal", () => {
    expect(nextTemperature(4.8, 0.0449)).toBe(4.8);
    expect(String(nextTemperature(4.8, 0.07))).toMatch(/^\d+(\.\d)?$/);
  });

  it("stays inside the domain across a long random walk", () => {
    let value = 4.8;
    for (let i = 0; i < 20_000; i += 1) {
      value = nextTemperature(value, randomDrift());
      expect(value).toBeGreaterThanOrEqual(CHART_MIN_C);
      expect(value).toBeLessThanOrEqual(CHART_MAX_C);
    }
  });

  it("can reach an excursion, so the state is exercisable", () => {
    expect(clampTemperature(1.2)).toBe(CHART_MIN_C);
    expect(isExcursion(clampTemperature(1.2))).toBe(true);
  });
});

describe("pushReading", () => {
  const make = (id: number): Reading => ({
    id,
    at: new Date(Date.UTC(2026, 7, 27, 9, 0, id * 2)).toISOString(),
    value: 4.8,
  });

  it("keeps the window bounded", () => {
    let readings: Reading[] = [];
    for (let i = 0; i < READING_WINDOW + 20; i += 1) readings = pushReading(readings, make(i));
    expect(readings).toHaveLength(READING_WINDOW);
    expect(readings[readings.length - 1].id).toBe(READING_WINDOW + 19);
  });

  it("keeps ids unique so React keys stay stable", () => {
    let readings: Reading[] = [];
    for (let i = 0; i < READING_WINDOW + 20; i += 1) readings = pushReading(readings, make(i));
    expect(new Set(readings.map((r) => r.id)).size).toBe(readings.length);
  });
});

describe("window labels", () => {
  const at = (seconds: number): Reading => ({
    id: seconds,
    at: new Date(Date.UTC(2026, 7, 27, 9, 0, seconds)).toISOString(),
    value: 4.8,
  });

  it("reports the real span, not a hardcoded one", () => {
    expect(formatWindowLabel([at(0), at(58)])).toBe("LAST 58 SEC");
    expect(formatWindowLabel([at(0), at(600)])).toBe("LAST 10 MIN");
    expect(formatWindowLabel([])).toBe("LAST 0 SEC");
    expect(formatWindowLabel([at(0)])).toBe("LAST 0 SEC");
  });

  it("labels the axis from the readings themselves", () => {
    const readings = Array.from({ length: 10 }, (_, i) => at(i * 2));
    const labels = chartXLabels(readings);
    expect(labels).toHaveLength(5);
    expect(labels[labels.length - 1]).toBe("NOW");
    expect(labels[0]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("handles degenerate label counts without throwing", () => {
    const readings = [at(0), at(2), at(4)];
    expect(chartXLabels(readings, 1)).toEqual(["NOW"]);
    expect(chartXLabels(readings, 0)).toEqual([]);
    expect(chartXLabels(readings, -2)).toEqual([]);
    expect(chartXLabels([], 5)).toEqual([]);
    expect(() => chartXLabels(readings, 1)).not.toThrow();
  });

  it("includes seconds, so 2s samples are distinguishable", () => {
    const labels = chartXLabels([at(0), at(2), at(4), at(6), at(8)]);
    expect(new Set(labels.slice(0, -1)).size).toBe(4);
  });
});

describe("formatIsoDate", () => {
  it("formats the entry's own date rather than a fixed one", () => {
    expect(formatIsoDate(new Date(2026, 7, 27, 12).toISOString())).toBe("2026-08-27");
    expect(formatIsoDate(new Date(2027, 0, 5, 12).toISOString())).toBe("2027-01-05");
  });
});
