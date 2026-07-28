import { describe, expect, it } from "vitest";
import { calculateTrustScore } from "../src/modules/trust/trust-score.js";

describe("calculateTrustScore", () => {
  it("returns the weighted score on a normalized 0-100 scale", () => {
    expect(
      calculateTrustScore({
        security: 100,
        identity: 80,
        transactions: 90,
        anomalySafety: 70,
        reputation: 60,
      }),
    ).toBe(81.5);
  });

  it("rejects component values outside 0-100", () => {
    expect(() =>
      calculateTrustScore({
        security: 101,
        identity: 80,
        transactions: 90,
        anomalySafety: 70,
        reputation: 60,
      }),
    ).toThrow();
  });
});
