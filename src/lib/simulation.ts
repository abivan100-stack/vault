/** Cold-chain simulation cadence and the pure transforms behind it. */

import { clampTemperature } from "./chart";

/** One temperature sample every 2s. */
export const SAMPLE_INTERVAL_MS = 2_000;
/** One ledger append every 10s (i.e. every 5th sample). */
export const LEDGER_INTERVAL_MS = 10_000;
/** Samples retained in the live chart window. */
export const READING_WINDOW = 30;
/** Peak-to-peak drift applied per sample. */
export const DRIFT_RANGE_C = 0.24;

export type Reading = {
  /** Monotonic id — stable React key across the sliding window. */
  id: number;
  /** ISO-8601 instant the sample was taken. */
  at: string;
  value: number;
};

/**
 * Next temperature from the previous one. `drift` is injected rather than
 * drawn inside, so this stays pure and safe to call from a state updater.
 */
export function nextTemperature(previous: number, drift: number): number {
  return clampTemperature(Number((previous + drift).toFixed(1)));
}

/** A drift sample in [-DRIFT_RANGE_C/2, +DRIFT_RANGE_C/2). */
export function randomDrift(random: () => number = Math.random): number {
  return (random() - 0.5) * DRIFT_RANGE_C;
}

/** Appends a reading and trims the window to READING_WINDOW. */
export function pushReading(readings: readonly Reading[], reading: Reading): Reading[] {
  return [...readings, reading].slice(-READING_WINDOW);
}

/** `14:20:02` in the viewer's locale, 24h. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * `2026-08-27` for the ledger date column.
 *
 * Deliberately local-time, to match `formatClock` — a date and a time shown
 * side by side must describe the same instant in the same zone. It is only the
 * *format* that is locale-independent, not the timezone.
 */
export function formatIsoDate(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Describes the real span covered by the chart, e.g. `LAST 58 SEC`. */
export function formatWindowLabel(readings: readonly Reading[]): string {
  if (readings.length < 2) return "LAST 0 SEC";
  const first = new Date(readings[0].at).getTime();
  const last = new Date(readings[readings.length - 1].at).getTime();
  const seconds = Math.max(0, Math.round((last - first) / 1000));
  if (seconds < 90) return `LAST ${seconds} SEC`;
  return `LAST ${Math.round(seconds / 60)} MIN`;
}

/** Evenly spaced x-axis labels taken from the readings themselves. */
export function chartXLabels(readings: readonly Reading[], count = 5): string[] {
  if (readings.length === 0 || count <= 0) return [];
  // A single label has no interval to divide by; `i / (count - 1)` would be
  // 0/0, and indexing with NaN then throws.
  if (count === 1 || readings.length === 1) return ["NOW"];

  const labels: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i / (count - 1)) * (readings.length - 1));
    labels.push(i === count - 1 ? "NOW" : formatClock(readings[index].at).slice(0, 8));
  }
  return labels;
}
