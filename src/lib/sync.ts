/**
 * Mapping between Vault's local records and their rows in Postgres.
 *
 * Kept pure and separate from the network calls that use it, so the part with
 * a decision in it — what a row must contain to be believed — is testable
 * without a database.
 *
 * The governing rule is the one this codebase already applies to
 * `localStorage`: **a row arriving from the server is untrusted input**. It is
 * closer to authoritative than the browser's copy, because the append-only
 * policies mean nobody using the API can have edited it, but "closer to
 * authoritative" is not "believe it unverified". Every row is put back through
 * `isLedgerEntry` before it is allowed to be an entry, and the chain it forms
 * is put back through `verifyChain` before anything calls it intact.
 */

import { isLedgerEntry, type LedgerEntry } from "./ledger";
import type { FieldLogMeta } from "./shipment";

/** Column names, so a typo is a compile error rather than a silent null. */
export const LEDGER_TABLE = "ledger_entries";
export const SHIPMENT_TABLE = "shipments";

export type LedgerRow = {
  org_id: string;
  chain_id: string;
  shipment_id: string | null;
  sequence: number;
  event: string;
  at: string;
  detail: string;
  prev_hash: string;
  hash: string;
  created_by: string;
};

export type ShipmentRow = {
  id: string;
  org_id: string;
  log_id: string;
  box: string;
  product: string;
  batch: string;
  doses: string;
  corridor: string;
  route: string;
  started_at: string;
  handed_off_at: string | null;
  created_by: string;
};

export function toLedgerRow(
  entry: LedgerEntry,
  orgId: string,
  shipmentId: string | null,
  userId: string,
  chainId: string,
): LedgerRow {
  return {
    org_id: orgId,
    chain_id: chainId,
    shipment_id: shipmentId,
    sequence: entry.sequence,
    event: entry.event,
    at: entry.at,
    detail: entry.detail,
    prev_hash: entry.prevHash,
    hash: entry.hash,
    created_by: userId,
  };
}

/**
 * A row back into an entry, or null if it is not one.
 *
 * The digest is not recomputed here — that is `verifyChain`'s job over the
 * whole chain, and doing it per row would report a break at the wrong place.
 * This only establishes that the shape is an entry at all.
 */
export function fromLedgerRow(row: unknown): LedgerEntry | null {
  if (typeof row !== "object" || row === null) return null;
  const source = row as Record<string, unknown>;
  // A server timestamp is untrusted like every other field here: an
  // unparseable string must make the row rejected, not throw out of the
  // caller's .map. `new Date(...).toISOString()` on a bad string raises
  // RangeError instead of degrading, so that case is checked first.
  if (typeof source.at === "string" && Number.isNaN(new Date(source.at).getTime())) {
    return null;
  }
  const candidate = {
    sequence: source.sequence,
    event: source.event,
    at: typeof source.at === "string" ? new Date(source.at).toISOString() : source.at,
    detail: source.detail,
    prevHash: source.prev_hash,
    hash: source.hash,
  };
  return isLedgerEntry(candidate) ? candidate : null;
}

export function toShipmentRow(
  shipment: FieldLogMeta,
  id: string,
  orgId: string,
  userId: string,
): ShipmentRow {
  return {
    id,
    org_id: orgId,
    log_id: shipment.logId,
    box: shipment.box,
    product: shipment.product,
    batch: shipment.batch,
    doses: shipment.doses,
    // `range` is a reserved word in enough SQL dialects to be worth avoiding,
    // and "corridor" is what this project calls it in prose anyway.
    corridor: shipment.range,
    route: shipment.route,
    started_at: shipment.startedAt,
    handed_off_at: shipment.handedOffAt,
    created_by: userId,
  };
}

/**
 * The entries the server has not seen.
 *
 * Membership is by digest, which is exactly right: the digest commits to the
 * entry's contents and its predecessor, so two entries with the same digest
 * are the same entry, and the database's unique constraint agrees. Re-running
 * a push is therefore a no-op rather than a duplicate.
 */
export function unsyncedEntries(
  local: readonly LedgerEntry[],
  syncedHashes: ReadonlySet<string>,
): LedgerEntry[] {
  return local.filter((entry) => !syncedHashes.has(entry.hash));
}

export type SyncState =
  /** No credentials configured — the app is local-only by design. */
  | { status: "LOCAL_ONLY" }
  /** Configured, but nobody is signed in. */
  | { status: "SIGNED_OUT" }
  /** Signed in with no organisation selected — nowhere to sync to. */
  | { status: "NO_ORGANISATION" }
  /** Signed in as a viewer: reads sync, writes are refused by policy. */
  | { status: "READ_ONLY" }
  | { status: "SYNCING"; pending: number }
  | { status: "SYNCED"; at: string; entryCount: number }
  | { status: "ERROR"; message: string; pending: number };

/**
 * One line describing where the ledger currently lives.
 *
 * Worth being exact about, because it is the difference between "this record
 * exists in one browser" and "this record exists somewhere it cannot be
 * edited". Overstating it would be the same class of mistake the audit found:
 * a presentation layer asserting a guarantee the state layer never provided.
 */
export function describeSync(state: SyncState): string {
  switch (state.status) {
    case "LOCAL_ONLY":
      return "This browser only. Nothing is synced, and clearing site data destroys the ledger.";
    case "SIGNED_OUT":
      return "Not signed in. The ledger stays in this browser until you are.";
    case "NO_ORGANISATION":
      return "No organisation selected. Create or join one to sync this ledger.";
    case "READ_ONLY":
      return "Signed in as a viewer. You can read the organisation's ledger, but this browser's entries are not appended to it.";
    case "SYNCING":
      return `Syncing ${state.pending} ${state.pending === 1 ? "entry" : "entries"}…`;
    case "SYNCED":
      return `Synced — ${state.entryCount} ${state.entryCount === 1 ? "entry" : "entries"} appended to the organisation's ledger, where they cannot be edited or removed through the app.`;
    case "ERROR":
      return `Sync failed: ${state.message}. ${state.pending} ${
        state.pending === 1 ? "entry is" : "entries are"
      } held locally and will be retried.`;
  }
}

/** Whether the ledger currently has a copy outside this browser. */
export function isAnchored(state: SyncState): boolean {
  return state.status === "SYNCED";
}
