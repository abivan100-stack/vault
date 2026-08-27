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

export function isLedgerEventType(value: unknown): value is LedgerEventType {
  return typeof value === "string" && (LEDGER_EVENTS as readonly string[]).includes(value);
}

const HEX_64 = /^[0-9a-f]{64}$/;

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
  if (!Array.isArray(raw)) {
    // A non-array value is only a loss if something was actually stored.
    return { entries: [], discarded: raw === null || raw === undefined ? 0 : 1 };
  }

  const entries: LedgerEntry[] = [];
  let discarded = 0;

  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      discarded += 1;
      continue;
    }
    const candidate = item as Record<string, unknown>;
    if (
      // Sequence numbers are 1-based integers. Without this a re-rooted entry
      // claiming sequence 0, -1 or 1.5 would skip the genesis root check and,
      // as a lone entry, the ordering check too.
      typeof candidate.sequence !== "number" ||
      !Number.isInteger(candidate.sequence) ||
      candidate.sequence < 1 ||
      !isLedgerEventType(candidate.event) ||
      typeof candidate.at !== "string" ||
      Number.isNaN(new Date(candidate.at).getTime()) ||
      typeof candidate.detail !== "string" ||
      typeof candidate.prevHash !== "string" ||
      !HEX_64.test(candidate.prevHash) ||
      typeof candidate.hash !== "string" ||
      !HEX_64.test(candidate.hash)
    ) {
      discarded += 1;
      continue;
    }
    entries.push({
      sequence: candidate.sequence,
      event: candidate.event,
      at: candidate.at,
      detail: candidate.detail,
      prevHash: candidate.prevHash,
      hash: candidate.hash,
    });
  }

  const trimmed = entries.slice(-MAX_LEDGER_ENTRIES);
  return { entries: trimmed, discarded };
}
