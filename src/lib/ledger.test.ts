import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  MAX_LEDGER_ENTRIES,
  appendEntry,
  entryDigest,
  formatEventLabel,
  parseChain,
  verifyChain,
  type LedgerEntry,
} from "./ledger";

const T0 = new Date("2026-08-27T09:00:00.000Z");
const at = (offsetSeconds: number) => new Date(T0.getTime() + offsetSeconds * 1000);

function buildChain(length: number): LedgerEntry[] {
  let chain: LedgerEntry[] = [];
  for (let i = 0; i < length; i += 1) {
    chain = appendEntry(chain, "TEMPERATURE_READING", `${(4 + i / 10).toFixed(1)} °C`, at(i * 10));
  }
  return chain;
}

describe("appendEntry", () => {
  it("starts the chain at sequence 1 with the genesis prevHash", () => {
    const [entry] = appendEntry([], "SHIPMENT_CREATE", "Corridor opened", T0);
    expect(entry.sequence).toBe(1);
    expect(entry.prevHash).toBe(GENESIS_HASH);
    expect(entry.hash).toHaveLength(64);
  });

  it("links each entry to the one before it", () => {
    const chain = buildChain(4);
    expect(chain.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].prevHash).toBe(chain[i - 1].hash);
    }
  });

  it("does not mutate the input chain", () => {
    const original = buildChain(2);
    const snapshot = JSON.parse(JSON.stringify(original));
    appendEntry(original, "HANDOFF_INIT", "Handoff", at(99));
    expect(original).toEqual(snapshot);
  });

  it("produces different hashes for entries that differ only in detail", () => {
    const a = appendEntry([], "TEMPERATURE_READING", "4.8 °C", T0)[0];
    const b = appendEntry([], "TEMPERATURE_READING", "4.9 °C", T0)[0];
    expect(a.hash).not.toBe(b.hash);
  });

  it("caps the retained window", () => {
    const chain = buildChain(MAX_LEDGER_ENTRIES + 10);
    expect(chain).toHaveLength(MAX_LEDGER_ENTRIES);
    expect(chain[chain.length - 1].sequence).toBe(MAX_LEDGER_ENTRIES + 10);
  });
});

describe("verifyChain", () => {
  it("accepts an untouched chain", () => {
    expect(verifyChain(buildChain(6))).toEqual({ intact: true, brokenAt: null, reason: "OK" });
  });

  it("accepts an empty chain", () => {
    expect(verifyChain([]).intact).toBe(true);
  });

  it("accepts a window whose oldest entry links to a dropped entry", () => {
    // The retained window's first entry points at an entry that has slid out.
    const chain = buildChain(MAX_LEDGER_ENTRIES + 5);
    expect(chain[0].prevHash).not.toBe(GENESIS_HASH);
    expect(verifyChain(chain).intact).toBe(true);
  });

  it("detects an edited detail", () => {
    const chain = buildChain(5);
    const tampered = chain.map((entry, index) =>
      index === 2 ? { ...entry, detail: "2.0 °C" } : entry,
    );
    const result = verifyChain(tampered);
    expect(result.intact).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toBe("DIGEST_MISMATCH");
  });

  it("detects an edited timestamp", () => {
    const chain = buildChain(4);
    const tampered = chain.map((entry, index) =>
      index === 1 ? { ...entry, at: at(9999).toISOString() } : entry,
    );
    expect(verifyChain(tampered).reason).toBe("DIGEST_MISMATCH");
  });

  it("detects a removed entry", () => {
    const chain = buildChain(5);
    const result = verifyChain([...chain.slice(0, 2), ...chain.slice(3)]);
    expect(result.intact).toBe(false);
    expect(result.reason).toBe("BROKEN_LINK");
  });

  it("rejects a re-rooted chain whose first entry skips genesis", () => {
    // A forger replaces the whole chain with one correctly-hashed entry that
    // claims to be sequence 1 but points at an invented predecessor.
    const body = {
      sequence: 1,
      event: "SHIPMENT_CREATE" as const,
      at: T0.toISOString(),
      detail: "Corridor opened",
      prevHash: "de".repeat(32),
    };
    const forged: LedgerEntry = { ...body, hash: entryDigest(body) };

    // The digest itself is valid...
    expect(entryDigest(body)).toBe(forged.hash);
    // ...but sequence 1 can only ever root at genesis.
    const result = verifyChain([forged]);
    expect(result.intact).toBe(false);
    expect(result.reason).toBe("BAD_ROOT");
    expect(result.brokenAt).toBe(1);
  });

  it("still accepts a genuine chain rooted at genesis", () => {
    const chain = appendEntry([], "SHIPMENT_CREATE", "Corridor opened", T0);
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(verifyChain(chain).intact).toBe(true);
  });

  it("rejects impossible sequence numbers even when the digest matches", () => {
    const [genuine] = buildChain(1);
    for (const sequence of [0, -3, 2.5]) {
      const body = { ...genuine, sequence };
      const forged: LedgerEntry = { ...body, hash: entryDigest(body) };
      const result = verifyChain([forged]);
      expect(result.intact, `sequence ${sequence}`).toBe(false);
      expect(result.reason).toBe("BAD_SEQUENCE");
    }
  });

  it("documents the limit: a replaced window starting mid-chain still verifies", () => {
    // Once an entry slides out its digest is gone, so the oldest retained
    // entry's prevHash has nothing left to check against. This is a property of
    // an unauthenticated local chain, not a defect — it is asserted here so the
    // guarantee stays explicit rather than assumed.
    let forged: LedgerEntry[] = [];
    const body = {
      sequence: 7,
      event: "TEMPERATURE_READING" as const,
      at: T0.toISOString(),
      detail: "4.8 °C",
      prevHash: "ab".repeat(32),
    };
    forged = [{ ...body, hash: entryDigest(body) }];
    forged = appendEntry(forged, "TEMPERATURE_READING", "4.9 °C", at(10));

    expect(verifyChain(forged).intact).toBe(true);
  });

  it("detects a re-hashed entry whose link no longer matches", () => {
    // A forger who recomputes the digest still cannot fix the following link.
    const chain = buildChain(4);
    const forgedBody = { ...chain[1], detail: "1.9 °C" };
    const forged: LedgerEntry = {
      ...forgedBody,
      hash: entryDigest({
        sequence: forgedBody.sequence,
        event: forgedBody.event,
        at: forgedBody.at,
        detail: forgedBody.detail,
        prevHash: forgedBody.prevHash,
      }),
    };
    const result = verifyChain([chain[0], forged, chain[2], chain[3]]);
    expect(result.intact).toBe(false);
    expect(result.reason).toBe("BROKEN_LINK");
    expect(result.brokenAt).toBe(3);
  });
});

describe("parseChain", () => {
  it("round-trips a stored chain with nothing discarded", () => {
    const chain = buildChain(3);
    expect(parseChain(JSON.parse(JSON.stringify(chain)))).toEqual({
      entries: chain,
      discarded: 0,
    });
  });

  it("returns an empty chain for absent storage without reporting loss", () => {
    expect(parseChain(null)).toEqual({ entries: [], discarded: 0 });
    expect(parseChain(undefined)).toEqual({ entries: [], discarded: 0 });
  });

  it("reports loss when something was stored but is not a chain", () => {
    expect(parseChain("nope")).toEqual({ entries: [], discarded: 1 });
    expect(parseChain({ sequence: 1 })).toEqual({ entries: [], discarded: 1 });
  });

  it("counts malformed entries instead of silently dropping them", () => {
    const chain = buildChain(2);
    const stored = [
      ...JSON.parse(JSON.stringify(chain)),
      { sequence: "three", event: "TEMPERATURE_READING" },
      { sequence: 4, event: "NOT_A_REAL_EVENT", at: T0.toISOString(), detail: "", prevHash: "", hash: "" },
      { sequence: 5, event: "TEMPERATURE_READING", at: "not-a-date", detail: "", prevHash: "", hash: "" },
      null,
    ];
    const result = parseChain(stored);
    expect(result.entries).toEqual(chain);
    // A shortened chain that verifies is still evidence something rewrote it,
    // so the loss has to reach the caller.
    expect(result.discarded).toBe(4);
  });

  it("reports loss when the newest entry is the corrupt one", () => {
    const chain = buildChain(3);
    const stored = JSON.parse(JSON.stringify(chain));
    delete stored[2].hash;
    const result = parseChain(stored);
    expect(result.entries).toHaveLength(2);
    expect(verifyChain(result.entries).intact).toBe(true);
    // Verification alone would call this fine; the discard count is what shows
    // that the tail was lost.
    expect(result.discarded).toBe(1);
  });

  it("rejects sequence numbers that are not 1-based integers", () => {
    const [genuine] = buildChain(1);
    for (const sequence of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const forgedBody = { ...genuine, sequence };
      const forged = { ...forgedBody, hash: entryDigest(forgedBody) };
      const result = parseChain([forged]);
      expect(result.entries, `sequence ${sequence}`).toHaveLength(0);
      expect(result.discarded).toBe(1);
    }
  });

  it("rejects hashes that are not 64 hex characters", () => {
    const [genuine] = buildChain(1);
    expect(parseChain([{ ...genuine, hash: "abc" }]).entries).toHaveLength(0);
    expect(parseChain([{ ...genuine, prevHash: "not-a-hash" }]).entries).toHaveLength(0);
  });
});

describe("formatEventLabel", () => {
  it("replaces every underscore, not just the first", () => {
    expect(formatEventLabel("TEMPERATURE_READING")).toBe("TEMPERATURE READING");
    expect(formatEventLabel("A_B_C_D")).toBe("A B C D");
  });
});
