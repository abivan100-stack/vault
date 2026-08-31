import { describe, expect, it } from "vitest";
import { appendEntry, verifyChain, type LedgerEntry } from "./ledger";
import { createFieldLog } from "./shipment";
import {
  describeSync,
  fromLedgerRow,
  isAnchored,
  toLedgerRow,
  toShipmentRow,
  unsyncedEntries,
} from "./sync";

const T0 = new Date("2026-08-27T09:00:00.000Z");
const CHAIN = "chain-1";
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function buildChain(length: number): LedgerEntry[] {
  let chain: LedgerEntry[] = [];
  for (let i = 0; i < length; i += 1) {
    chain = appendEntry(
      chain,
      "TEMPERATURE_READING",
      `${(4 + i / 10).toFixed(1)} °C`,
      new Date(T0.getTime() + i * 10_000),
    );
  }
  return chain;
}

describe("ledger row mapping", () => {
  it("round-trips an entry through a row without changing its digest", () => {
    // If the round trip altered a single committed field, the chain pulled
    // back from the server would fail verification — which would be reported
    // as tampering rather than as a mapping bug.
    const chain = buildChain(5);
    const rows = chain.map((entry) => toLedgerRow(entry, ORG, null, USER, CHAIN));
    const recovered = rows.map(fromLedgerRow).filter((entry): entry is LedgerEntry => entry !== null);

    expect(recovered).toHaveLength(chain.length);
    expect(recovered).toEqual(chain);
    expect(verifyChain(recovered).intact).toBe(true);
  });

  it("refuses a row that is not an entry", () => {
    // Server data is untrusted too. A row missing its digest, or carrying one
    // that is not a digest, must not become an entry.
    expect(fromLedgerRow(null)).toBeNull();
    expect(fromLedgerRow({ sequence: 1 })).toBeNull();
    expect(
      fromLedgerRow({
        sequence: 1,
        event: "TEMPERATURE_READING",
        at: T0.toISOString(),
        detail: "4.4 °C",
        prev_hash: "0".repeat(64),
        hash: "not a digest",
      }),
    ).toBeNull();
  });

  it("refuses a row carrying an event this build does not know", () => {
    const [entry] = buildChain(1);
    const row = { ...toLedgerRow(entry, ORG, null, USER, CHAIN), event: "SOMETHING_ELSE" };
    expect(fromLedgerRow(row)).toBeNull();
  });

  it("refuses a row whose timestamp does not parse, instead of throwing", () => {
    // A malformed server timestamp is untrusted input like any other field on
    // this row -- it must be discarded the same way a bad hash or an unknown
    // event is, not thrown out of the caller's .map (new Date("garbage")
    // parses to Invalid Date, and .toISOString() on that raises RangeError).
    const [entry] = buildChain(1);
    const row = { ...toLedgerRow(entry, ORG, null, USER, CHAIN), at: "not-a-date" };
    expect(() => fromLedgerRow(row)).not.toThrow();
    expect(fromLedgerRow(row)).toBeNull();
  });

  it("normalises a timestamp the database returns in its own format", () => {
    // Postgres hands back `2026-08-27T09:00:00+00:00`; the digest was computed
    // over `…Z`. Same instant, different string, and the digest only cares
    // about the string.
    const [entry] = buildChain(1);
    const row = { ...toLedgerRow(entry, ORG, null, USER, CHAIN), at: "2026-08-27T09:00:00+00:00" };
    expect(fromLedgerRow(row)?.at).toBe(entry.at);
  });
});

describe("shipment row mapping", () => {
  it("carries the corridor across under its own name", () => {
    const shipment = createFieldLog(T0, "417");
    const row = toShipmentRow(shipment, "33333333-3333-4333-8333-333333333333", ORG, USER);
    expect(row.corridor).toBe(shipment.range);
    expect(row.handed_off_at).toBeNull();
    expect(row.box).toBe(shipment.box);
  });
});

describe("unsyncedEntries", () => {
  it("returns only what the server has not seen", () => {
    const chain = buildChain(5);
    const synced = new Set(chain.slice(0, 3).map((entry) => entry.hash));
    expect(unsyncedEntries(chain, synced).map((entry) => entry.sequence)).toEqual([4, 5]);
  });

  it("makes a repeated push a no-op", () => {
    // Digests are what identify an entry, here and in the unique constraint on
    // the table, so re-running a sync cannot duplicate anything.
    const chain = buildChain(4);
    const synced = new Set(chain.map((entry) => entry.hash));
    expect(unsyncedEntries(chain, synced)).toEqual([]);
  });
});

describe("describeSync", () => {
  it("never claims an anchor the state does not have", () => {
    // The audit this codebase came out of was a presentation layer asserting
    // guarantees the state layer never provided. Only one state has a copy
    // outside the browser, and only that one is allowed to say so.
    const unanchored = [
      { status: "LOCAL_ONLY" } as const,
      { status: "SIGNED_OUT" } as const,
      { status: "NO_ORGANISATION" } as const,
      { status: "READ_ONLY" } as const,
      { status: "SYNCING", pending: 3 } as const,
      { status: "ERROR", message: "offline", pending: 3 } as const,
    ];
    for (const state of unanchored) {
      expect(isAnchored(state), state.status).toBe(false);
      expect(describeSync(state)).not.toContain("cannot be edited");
    }
  });

  it("says plainly what a synced ledger gains", () => {
    const state = { status: "SYNCED", at: T0.toISOString(), entryCount: 12 } as const;
    expect(isAnchored(state)).toBe(true);
    expect(describeSync(state)).toContain("cannot be edited or removed");
  });

  it("says how much is still held locally when a sync fails", () => {
    expect(describeSync({ status: "ERROR", message: "offline", pending: 2 })).toContain(
      "2 entries are held locally",
    );
  });
});
