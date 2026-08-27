/**
 * Chart + safe-corridor geometry.
 *
 * The plotted domain is deliberately WIDER than the safe corridor. If the two
 * matched, an excursion would clamp onto the threshold line and be visually
 * identical to a reading that is merely at the limit.
 */

/** Safe corridor for the vaccine payload. */
export const SAFE_MIN_C = 2;
export const SAFE_MAX_C = 8;

/** Plotted (and simulated) domain — one degree of headroom either side. */
export const CHART_MIN_C = 1.5;
export const CHART_MAX_C = 8.5;

export const CHART_WIDTH = 720;
export const CHART_HEIGHT = 190;

/** Gridline / axis-label values, top to bottom. */
export const CHART_TICKS = [8, 6, 4, 2] as const;

/** Clamps a temperature into the simulated domain. */
export function clampTemperature(value: number): number {
  return Math.min(CHART_MAX_C, Math.max(CHART_MIN_C, value));
}

/**
 * Clamps into the safe corridor rather than the plotted domain.
 *
 * Seeded history has to start inside the corridor. The Ledger is the sole
 * source of truth for whether an Excursion happened, and seeding writes no
 * entries — so a seeded reading outside 2-8 would render as EXCURSION with no
 * EXCURSION_OPEN or INVESTIGATION_OPEN behind it, leaving the gauge and the
 * Ledger disagreeing on a shipment nobody had touched yet.
 */
export function clampToCorridor(value: number): number {
  return Math.min(SAFE_MAX_C, Math.max(SAFE_MIN_C, value));
}

/** Maps a temperature to a y pixel, 0 = top (CHART_MAX_C). */
export function toChartY(value: number, height: number = CHART_HEIGHT): number {
  const span = CHART_MAX_C - CHART_MIN_C;
  const raw = height - ((value - CHART_MIN_C) / span) * height;
  return Math.min(height, Math.max(0, raw));
}

/** Maps a reading index to an x pixel across the plotted window. */
export function toChartX(index: number, count: number, width: number = CHART_WIDTH): number {
  return (index / Math.max(count - 1, 1)) * width;
}

/** Percentage of the domain filled — drives the gauge bar. */
export function toDomainPercent(value: number): number {
  const span = CHART_MAX_C - CHART_MIN_C;
  return Math.min(100, Math.max(0, ((value - CHART_MIN_C) / span) * 100));
}

export function isExcursion(value: number): boolean {
  return value < SAFE_MIN_C || value > SAFE_MAX_C;
}

export type Status = "SAFE" | "EXCURSION";

export function statusFor(value: number): Status {
  return isExcursion(value) ? "EXCURSION" : "SAFE";
}

/** Builds an SVG path across the plotted window. */
export function buildChartPath(values: readonly number[]): string {
  return values
    .map((value, index) => {
      const x = toChartX(index, values.length);
      const y = toChartY(value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
