import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, shortHash } from "./hash";

describe("sha256Hex", () => {
  // FIPS 180-4 / NIST published vectors.
  it("hashes the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("hashes 'abc'", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes a two-block message", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hashes messages either side of the padding boundary", () => {
    // 55 bytes is the largest single-block payload; 56 forces a second block.
    for (const length of [54, 55, 56, 57, 63, 64, 65, 119, 120]) {
      const sample = "a".repeat(length);
      expect(sha256Hex(sample)).toBe(createHash("sha256").update(sample, "utf8").digest("hex"));
    }
  });

  it("hashes a long message", () => {
    expect(sha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("matches node:crypto across mixed inputs, including multi-byte UTF-8", () => {
    const samples = [
      "",
      "a",
      "DELHI \u2192 JAIPUR",
      "\u00e9\u00fc\u00f1",
      "VAC-20260827-A124|02.0\u201308.0 \u00b0C",
      "\ud83d\udce6 VCC-BOX-001",
      "line one\nline two\ttabbed",
      JSON.stringify({ sequence: 42, event: "TEMPERATURE_READING", value: 4.8 }),
    ];
    for (const sample of samples) {
      expect(sha256Hex(sample)).toBe(createHash("sha256").update(sample, "utf8").digest("hex"));
    }
  });

  it("is deterministic and avalanches", () => {
    expect(sha256Hex("VAULT-01")).toBe(sha256Hex("VAULT-01"));
    expect(sha256Hex("VAULT-01")).not.toBe(sha256Hex("VAULT-02"));
  });
});

describe("shortHash", () => {
  it("elides the middle of a full digest", () => {
    expect(shortHash("0123456789abcdef0123456789abcdef")).toBe("01234567\u2026cdef");
  });

  it("leaves short values alone", () => {
    expect(shortHash("abc")).toBe("abc");
  });
});
