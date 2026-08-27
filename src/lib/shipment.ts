/** The shipment record: creation, and hardening of untrusted stored values. */

import { SAFE_MAX_C, SAFE_MIN_C } from "./chart";

export type FieldLogMeta = {
  logId: string;
  box: string;
  product: string;
  batch: string;
  doses: string;
  range: string;
  /** ISO-8601 instant the corridor started. */
  startedAt: string;
  route: string;
  /** ISO-8601 instant of handoff, or null while in transit. */
  handedOffAt: string | null;
};

export const DEFAULT_ROUTE = "DELHI \u2192 JAIPUR";
export const DEFAULT_RANGE = `0${SAFE_MIN_C.toFixed(1)}\u20130${SAFE_MAX_C.toFixed(1)} \u00B0C`;
export const DEFAULT_PRODUCT = "IPV Polio Vaccine";
export const DEFAULT_DOSES = "250 units";

function datePart(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}${month}${day}`;
}

/**
 * Builds a fresh shipment record. `serial` is injected so callers control
 * randomness (and tests stay deterministic).
 */
export function createFieldLog(now: Date, serial: string): FieldLogMeta {
  const stamp = datePart(now);
  return {
    logId: `FIELD LOG / ${now.getFullYear()}-${stamp.slice(4)}-${serial}`,
    box: `VCC-BOX-${serial}`,
    product: DEFAULT_PRODUCT,
    batch: `VAC-${stamp}-A${serial}`,
    doses: DEFAULT_DOSES,
    range: DEFAULT_RANGE,
    startedAt: now.toISOString(),
    route: DEFAULT_ROUTE,
    handedOffAt: null,
  };
}

/** A 3-digit serial in [100, 999]. */
export function randomSerial(random: () => number = Math.random): string {
  return String(Math.floor(random() * 900) + 100);
}

function readString(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readIsoDate(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

/**
 * Coerces an untrusted value (stale schema, hand-edited storage, corrupt JSON)
 * into a complete record. Every field is guaranteed to be a non-empty string,
 * so downstream `.split`/`.slice` calls can never throw.
 */
export function normalizeFieldLog(raw: unknown, fallback: FieldLogMeta): FieldLogMeta {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fallback;
  const source = raw as Record<string, unknown>;

  const handedOffRaw = source.handedOffAt;
  let handedOffAt: string | null = null;
  if (typeof handedOffRaw === "string") {
    const parsed = new Date(handedOffRaw);
    handedOffAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return {
    logId: readString(source, "logId", fallback.logId),
    box: readString(source, "box", fallback.box),
    product: readString(source, "product", fallback.product),
    batch: readString(source, "batch", fallback.batch),
    doses: readString(source, "doses", fallback.doses),
    range: readString(source, "range", fallback.range),
    // `started` was a locale time string in the pre-ISO schema; ignore it and
    // fall back rather than persist an unparseable value.
    startedAt: readIsoDate(source, "startedAt", fallback.startedAt),
    route: readString(source, "route", fallback.route),
    handedOffAt,
  };
}

export type ParsedRoute = { origin: string; destination: string };

/** Splits `DELHI -> JAIPUR` (or `->`, `-`, `,`) into its endpoints. */
export function parseRoute(route: string): ParsedRoute {
  const trimmed = route.trim();
  const separator = /\s*(?:\u2192|->|\u2013|\u2014|,|\sto\s|-)\s*/i;
  const parts = trimmed.split(separator).filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return { origin: parts[0], destination: parts[parts.length - 1] };
  }
  return { origin: trimmed.length > 0 ? trimmed : "ORIGIN", destination: "DESTINATION" };
}

/** Extracts the dose count, or null when the field carries no number. */
export function parseDoses(doses: string): number | null {
  const match = doses.match(/\d[\d,]*/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Trailing segment of the box id, e.g. `VCC-BOX-001` -> `001`. */
export function boxSerial(box: string): string {
  const parts = box.split("-").filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : box;
}

export type ShipmentValidation = { ok: true } | { ok: false; message: string };

export function validateFieldLog(draft: FieldLogMeta): ShipmentValidation {
  if (!draft.box.trim()) return { ok: false, message: "Box is required" };
  if (!draft.product.trim()) return { ok: false, message: "Product is required" };
  if (!draft.batch.trim()) return { ok: false, message: "Batch is required" };
  if (parseDoses(draft.doses) === null) return { ok: false, message: "Doses must contain a number" };
  if (!draft.range.trim()) return { ok: false, message: "Range is required" };
  const route = parseRoute(draft.route);
  if (route.destination === "DESTINATION") {
    return { ok: false, message: "Route needs an origin and a destination" };
  }
  return { ok: true };
}
