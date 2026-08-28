import { describe, expect, it, vi } from "vitest";
import { acknowledgeAlarm, normaliseDeviceUrl } from "./device";

describe("normaliseDeviceUrl", () => {
  it("reduces a value to its origin", () => {
    // A trailing slash would make the request path `//ack`, and anything
    // after the host would move `/ack` somewhere else entirely.
    expect(normaliseDeviceUrl("http://10.0.0.8/")).toBe("http://10.0.0.8");
    expect(normaliseDeviceUrl("http://10.0.0.8/dashboard?tab=1#live")).toBe("http://10.0.0.8");
  });

  it("refuses a value that merely starts with http", () => {
    // `startsWith("http")` is satisfied by the word itself, which is not an
    // address; the UI would then offer a control that cannot work.
    expect(normaliseDeviceUrl("http")).toBeNull();
  });

  it("refuses a non-http scheme, an empty value and a non-string", () => {
    expect(normaliseDeviceUrl("file:///dev/ttyUSB0")).toBeNull();
    expect(normaliseDeviceUrl("   ")).toBeNull();
    expect(normaliseDeviceUrl(undefined)).toBeNull();
  });
});

describe("acknowledgeAlarm", () => {
  it("reports a failure rather than throwing when no device is configured", async () => {
    // The caller has to tell the operator something either way.
    const result = await acknowledgeAlarm(null);
    expect(result).toEqual({ ok: false, message: "No device is configured for this console." });
  });

  it("posts to the device's ack endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true } as Response);
    const result = await acknowledgeAlarm("http://10.0.0.8", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://10.0.0.8/ack",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports a refusal with its status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const result = await acknowledgeAlarm("http://10.0.0.8", fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("503");
  });

  it("says the buzzer is still sounding when the device cannot be reached", async () => {
    // The one failure that must not be swallowed: silence in the UI while the
    // board is still making noise.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const result = await acknowledgeAlarm("http://10.0.0.8", fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("still sounding");
  });
});
