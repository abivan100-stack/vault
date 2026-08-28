/**
 * Append-only, hash-chained ledger.
 *
 * Every entry commits to its own contents AND to the previous entry's digest,
 * so any edit to a stored entry breaks verification from that point onward.
 * The chain is the source of truth for the Ledger page — nothing is seeded.
 */

import { sha256Hex } from "./hash";

export const LEDGER_EVENTS = [
  "SHIPMENT_CREATE",
  "SHIPMENT_UPDATE",
  "TEMPERATURE_READING",
  "EXCURSION_OPEN",
  "EXCURSION_CLEAR",
  "HANDOFF_INIT",
  "INVESTIGATION_OPEN",
  "INVESTIGATION_RESOLVED",
] as const;

export type LedgerEventType = (typeof LEDGER_EVENTS)[number];

export type LedgerEntry = {
  sequence: number;
  event: LedgerEventType;
  /** ISO-8601 instant the entry was appended. */
  at: string;
  /** Human-readable payload — what this entry actually records. */
  detail: string;
  prevHash: string;
  hash: string;
};

/** Entries retained in memory / storage before the window slides. */
export const MAX_LEDGER_ENTRIES = 250;

/** prevHash of the first entry in a chain. */
export const GENESIS_HASH = "0".repeat(64);

type EntryBody = Omit<LedgerEntry, "hash">;

/** The exact preimage committed to by an entry's hash. */
export function entryPreimage(body: EntryBody): string {
  return [body.sequence, body.event, body.at, body.detail, body.prevHash].join("\u0000");
}

export function entryDigest(body: EntryBody): string {
  return sha256Hex(entryPreimage(body));
}

/** Returns a new chain with one entry appended. Never mutates its input. */
export function appendEntry(
  chain: readonly LedgerEntry[],
  event: LedgerEventType,
  detail: string,
  at: Date,
): LedgerEntry[] {
  const previous = chain.length > 0 ? chain[chain.length - 1] : null;
  const body: EntryBody = {
    sequence: previous ? previous.sequence + 1 : 1,
    event,
    at: at.toISOString(),
    detail,
    prevHash: previous ? previous.hash : GENESIS_HASH,
  };
  return [...chain, { ...body, hash: entryDigest(body) }].slice(-MAX_LEDGER_ENTRIES);
}

export type ChainVerification = {
  intact: boolean;
  /** Sequence number of the first entry that fails verification. */
  brokenAt: number | null;
  reason: "OK" | "DIGEST_MISMATCH" | "BROKEN_LINK" | "OUT_OF_ORDER" | "BAD_ROOT" | "BAD_SEQUENCE";
};

/**
 * Verifies every retained entry's digest and its link to the entry before it.
 *
 * What this proves: no retained entry has been edited, removed, reordered or
 * inserted. Each digest is recomputed from the entry's own contents, and each
 * entry's `prevHash` must equal the previous entry's digest.
 *
 * What it cannot prove: that the retained window is the *real* window. Once an
 * entry slides out, its digest is gone, so the oldest retained entry's
 * `prevHash` has nothing left to check against — and a chain kept in
 * unauthenticated local storage can be replaced wholesale by anyone who can
 * write to that storage. Detecting that needs an anchor the writer cannot
 * forge (a server, a signature, a notary), which this prototype does not have.
 * Sequence 1 is the one exception: it can only ever root at the genesis hash.
 *
 * This is tamper *evidence* for edits, not tamper *proofing* against a writer.
 */
export function verifyChain(chain: readonly LedgerEntry[]): ChainVerification {
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i];
    const { hash, ...body } = entry;

    // Checked here as well as in parseChain: verifyChain is public and must not
    // assume its input came through the parser.
    if (!Number.isInteger(entry.sequence) || entry.sequence < 1) {
      return { intact: false, brokenAt: entry.sequence, reason: "BAD_SEQUENCE" };
    }
    if (entryDigest(body) !== hash) {
      return { intact: false, brokenAt: entry.sequence, reason: "DIGEST_MISMATCH" };
    }
    // The first entry ever written must root at the genesis hash. Without this
    // check the whole chain can be replaced by a single re-rooted entry whose
    // digest is recomputed to match.
    if (entry.sequence === 1 && entry.prevHash !== GENESIS_HASH) {
      return { intact: false, brokenAt: entry.sequence, reason: "BAD_ROOT" };
    }
    if (i > 0) {
      const previous = chain[i - 1];
      if (previous.hash !== entry.prevHash) {
        return { intact: false, brokenAt: entry.sequence, reason: "BROKEN_LINK" };
      }
      if (previous.sequence + 1 !== entry.sequence) {
        return { intact: false, brokenAt: entry.sequence, reason: "OUT_OF_ORDER" };
      }
    }
  }
  return { intact: true, brokenAt: null, reason: "OK" };
}

/** Plain-English explanation of a failed verification. */
export function describeVerification(verification: ChainVerification): string {
  switch (verification.reason) {
    case "OK":
      return "Every digest recomputes and every link matches.";
    case "DIGEST_MISMATCH":
      return "An entry's contents no longer match its digest — it has been edited.";
    case "BROKEN_LINK":
      return "An entry does not follow the one before it — an entry has been removed or replaced.";
    case "OUT_OF_ORDER":
      return "Sequence numbers are not consecutive — an entry has been inserted or removed.";
    case "BAD_ROOT":
      return "The first entry does not root at the genesis hash — the chain has been replaced.";
    case "BAD_SEQUENCE":
      return "An entry carries an impossible sequence number — the chain has been rewritten.";
  }
}

/** `TEMPERATURE_READING` -> `TEMPERATURE READING` (every underscore). */
export function formatEventLabel(event: string): string {
  return event.replace(/_/g, " ");
}

/**
 * Human labels for the events, for surfaces that show the payload alongside.
 *
 * `TEMPERATURE READING` beside a detail reading `4.4 °C` states the same fact
 * twice and, at the width of a table column, states it loudly. These are the
 * same events said once. Exhaustive by construction: a new event type fails
 * to compile here rather than falling back to a shouted constant name.
 */
const SHORT_EVENT_LABELS: Record<LedgerEventType, string> = {
  SHIPMENT_CREATE: "Opened",
  SHIPMENT_UPDATE: "Updated",
  TEMPERATURE_READING: "Reading",
  EXCURSION_OPEN: "Excursion",
  EXCURSION_CLEAR: "Recovered",
  HANDOFF_INIT: "Handoff",
  INVESTIGATION_OPEN: "Investigation",
  INVESTIGATION_RESOLVED: "Resolved",
};

export function shortEventLabel(event: LedgerEventType): string {
  return SHORT_EVENT_LABELS[event];
}

/**
 * The temperature an entry records, or null when it carries none.
 *
 * Reading and excursion details are written as `4.4 °C` / `8.2 °C — left safe
 * corridor`, so the value is recoverable from the front of the detail. This
 * parses a string written one function away, which is only acceptable because
 * the alternative — a second, unhashed store of readings — would be a source
 * of truth competing with the chain. An unparseable detail yields null rather
 * than a number, so a hand-edited entry can never be presented as a
 * measurement.
 */
export function readingCelsius(entry: LedgerEntry): number | null {
  if (
    entry.event !== "TEMPERATURE_READING" &&
    entry.event !== "EXCURSION_OPEN" &&
    entry.event !== "EXCURSION_CLEAR"
  ) {
    return null;
  }
  const match = entry.detail.match(/^(-?\d+(?:\.\d+)?)\s*°C/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reason chosen when resolving an Investigation. Structured rather than
 * freeform so investigations stay queryable (e.g. "how many were sensor
 * faults vs confirmed loss"), paired with a required freeform note.
 */
export const RESOLUTION_REASONS = [
  { value: "SENSOR_FAULT", label: "Sensor fault" },
  { value: "CARRIER_DELAY", label: "Carrier delay" },
  { value: "CONFIRMED_LOSS", label: "Confirmed loss" },
  { value: "OTHER", label: "Other" },
] as const;

export type ResolutionReason = (typeof RESOLUTION_REASONS)[number]["value"];

export function resolutionReasonLabel(reason: ResolutionReason): string {
  return RESOLUTION_REASONS.find((entry) => entry.value === reason)?.label ?? reason;
}

export type InvestigationStatus = "CLEARED" | "UNDER_INVESTIGATION";

export type InvestigationState = {
  status: InvestigationStatus;
  /** The still-open `INVESTIGATION_OPEN` entry, or null when Cleared. */
  openEntry: LedgerEntry | null;
};

/**
 * Whether the shipment is currently Cleared or Under Investigation, derived
 * from the ledger itself rather than tracked as separate state — the newest
 * `INVESTIGATION_OPEN`/`INVESTIGATION_RESOLVED` pair is authoritative.
 *
 * This is deliberately independent of `verifyChain`: a chain can be Intact
 * and Under Investigation at the same time, or Cleared and broken. One is a
 * cryptographic fact, the other a workflow fact.
 *
 * An Investigation cannot span a `SHIPMENT_CREATE`: it is scoped to the
 * shipment it was opened against, so a new shipment always starts Cleared,
 * even if the previous one's Investigation was never resolved. That old
 * Investigation stays truthfully recorded as unresolved on the prior
 * shipment's portion of the trail — this only stops it from blocking the
 * *current* one.
 */
export function deriveInvestigationState(chain: readonly LedgerEntry[]): InvestigationState {
  let openEntry: LedgerEntry | null = null;
  for (const entry of chain) {
    if (entry.event === "SHIPMENT_CREATE") openEntry = null;
    else if (entry.event === "INVESTIGATION_OPEN") openEntry = entry;
    else if (entry.event === "INVESTIGATION_RESOLVED") openEntry = null;
  }
  return { status: openEntry ? "UNDER_INVESTIGATION" : "CLEARED", openEntry };
}

/**
 * Sequence numbers of every `EXCURSION_OPEN` at or after `sinceSequence`.
 *
 * An open Investigation absorbs further breaches rather than spawning a new
 * Investigation per breach — this is how the absorbed set is recovered for
 * display and for the resolution note.
 */
export function coveredExcursionSequences(
  chain: readonly LedgerEntry[],
  sinceSequence: number,
): number[] {
  return chain
    .filter((entry) => entry.event === "EXCURSION_OPEN" && entry.sequence >= sinceSequence)
    .map((entry) => entry.sequence);
}

/** Shortest prefix treated as a digest lookup rather than a text search. */
export const MIN_DIGEST_QUERY_LENGTH = 8;

/**
 * Whether a search term is someone pasting a digest.
 *
 * Hex and long enough to be a digest prefix rather than a word. Eight
 * characters is the length the UI itself shows in a shortened hash, so
 * anything copied out of the app and pasted back is recognised.
 */
export function isDigestQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return trimmed.length >= MIN_DIGEST_QUERY_LENGTH && /^[0-9a-f]+$/.test(trimmed);
}

/**
 * The entry whose digest starts with `query`, or null.
 *
 * A miss is a genuinely ambiguous result and the caller has to say so
 * carefully: the digest may never have existed, or it may have belonged to an
 * entry that has since slid out of the retained window. This function cannot
 * tell those apart, and neither can anything else here.
 */
export function findByDigest(
  chain: readonly LedgerEntry[],
  query: string,
): LedgerEntry | null {
  const trimmed = query.trim().toLowerCase();
  if (!isDigestQuery(trimmed)) return null;
  return chain.find((entry) => entry.hash.startsWith(trimmed)) ?? null;
}

export function isLedgerEventType(value: unknown): value is LedgerEventType {
  return typeof value === "string" && (LEDGER_EVENTS as readonly string[]).includes(value);
}

const HEX_64 = /^[0-9a-f]{64}$/;

/** Structural validation for one untrusted (stored) value as a `LedgerEntry`. */
export function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    // Sequence numbers are 1-based integers. Without this a re-rooted entry
    // claiming sequence 0, -1 or 1.5 would skip the genesis root check and,
    // as a lone entry, the ordering check too.
    typeof candidate.sequence === "number" &&
    Number.isInteger(candidate.sequence) &&
    candidate.sequence >= 1 &&
    isLedgerEventType(candidate.event) &&
    typeof candidate.at === "string" &&
    !Number.isNaN(new Date(candidate.at).getTime()) &&
    typeof candidate.detail === "string" &&
    typeof candidate.prevHash === "string" &&
    HEX_64.test(candidate.prevHash) &&
    typeof candidate.hash === "string" &&
    HEX_64.test(candidate.hash)
  );
}

/**
 * Whether this (possibly truncated) window contains any event that bears on
 * Cleared/Under Investigation — a `SHIPMENT_CREATE`, `INVESTIGATION_OPEN` or
 * `INVESTIGATION_RESOLVED`. When it does, `deriveInvestigationState` is
 * authoritative. When it does not, the window cannot distinguish "genuinely
 * Cleared" from "an Investigation opened before this window's horizon and
 * aged out while still open" — callers should fall back to a separately
 * persisted last-known status in that case (see ColdChainContext).
 */
export function hasInvestigationEvidence(chain: readonly LedgerEntry[]): boolean {
  return chain.some(
    (entry) =>
      entry.event === "SHIPMENT_CREATE" ||
      entry.event === "INVESTIGATION_OPEN" ||
      entry.event === "INVESTIGATION_RESOLVED",
  );
}

export type ParsedChain = {
  entries: LedgerEntry[];
  /**
   * Stored items that were not well-formed entries. A non-zero count is an
   * integrity signal in its own right: something rewrote or truncated the
   * stored chain, and the surviving entries alone cannot show that.
   */
  discarded: number;
};

/**
 * Rebuilds a chain from untrusted (stored) JSON.
 *
 * Malformed items are dropped but *counted*, so the caller can surface the loss
 * rather than presenting a silently shortened chain as intact.
 */
export function parseChain(raw: unknown): ParsedChain {
  // Callers distinguish "nothing was stored" before getting here, so anything
  // that is not an array is a value someone wrote that is not a chain.
  if (!Array.isArray(raw)) return { entries: [], discarded: 1 };

  const entries: LedgerEntry[] = [];
  let discarded = 0;

  for (const item of raw) {
    if (!isLedgerEntry(item)) {
      discarded += 1;
      continue;
    }
    entries.push({
      sequence: item.sequence,
      event: item.event,
      at: item.at,
      detail: item.detail,
      prevHash: item.prevHash,
      hash: item.hash,
    });
  }

  const trimmed = entries.slice(-MAX_LEDGER_ENTRIES);
  return { entries: trimmed, discarded };
}
