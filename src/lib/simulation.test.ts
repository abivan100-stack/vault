import { describe, expect, it } from "vitest";
import { SAFE_MAX_C, SAFE_MIN_C, statusFor } from "./chart";
import { FORCED_DRIFT_C, forcedDrift, nextTemperature } from "./simulation";

describe("forcedDrift", () => {
  it("runs the box warm when the reading is already on the warm side", () => {
    // Direction follows the reading rather than being fixed, so a forced
    // excursion is the one that was about to happen anyway.
    expect(forcedDrift(7.6, SAFE_MIN_C, SAFE_MAX_C)).toBe(FORCED_DRIFT_C);
  });

  it("runs it cold from the cold side", () => {
    expect(forcedDrift(2.4, SAFE_MIN_C, SAFE_MAX_C)).toBe(-FORCED_DRIFT_C);
  });

  it("breaks the corridor within a handful of samples from either edge", () => {
    // An operator who asks for an excursion should not have to wait out the
    // random walk; a drift too small to escape in a few ticks would be the
    // same as not having the control.
    for (const start of [2.1, 4.9, 7.9]) {
      let value = start;
      let samples = 0;
      while (statusFor(value) === "SAFE" && samples < 12) {
        value = nextTemperature(value, forcedDrift(value, SAFE_MIN_C, SAFE_MAX_C));
        samples += 1;
      }
      expect(statusFor(value)).toBe("EXCURSION");
      expect(samples).toBeLessThanOrEqual(6);
    }
  });
});
