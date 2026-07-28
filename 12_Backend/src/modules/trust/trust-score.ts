/**
 * Composite Trust Score (T) — ScottsTechX Commerce OS.
 *
 * Implements the 5-layer weighted formula from the architectural blueprint:
 *   T = w1*Ssec + w2*Sid + w3*Stx + w4*Sai + w5*Srep
 *
 * Constraints enforced here (NOT in the DB):
 *   - Each component must be on a normalized 0..100 scale.
 *   - Weights must sum to 1.0 (default weights below).
 *   - Result is rounded to 2 decimal places; precision is honest, not cosmetic.
 *
 * NOTE: This is a pure function. It does NOT touch the DB, does NOT fetch a
 * buyer trust score for weighting Srep, and does NOT persist anything. The
 * real implementation will compute Srep as a weighted average of *buyer*
 * trust scores at the service layer; for now Srep is treated as an input.
 *
 * SCOPE: test-fixture implementation only. Do not deploy without:
 *   - DB-backed component fetch
 *   - Caller identity verification (JWT)
 *   - Audit log entry on every evaluation
 */

export const DEFAULT_TRUST_WEIGHTS = {
  security: 0.1,
  identity: 0.25,
  transactions: 0.35,
  anomalySafety: 0.2,
  reputation: 0.1,
} as const;

export type TrustScoreComponents = {
  security: number; // Ssec
  identity: number; // Sid
  transactions: number; // Stx
  anomalySafety: number; // Sai  (= 100 - Risk Index)
  reputation: number; // Srep
};

export class TrustScoreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustScoreInputError";
  }
}

export function calculateTrustScore(
  components: TrustScoreComponents,
  weights: typeof DEFAULT_TRUST_WEIGHTS = DEFAULT_TRUST_WEIGHTS,
): number {
  const keys = Object.keys(components) as (keyof TrustScoreComponents)[];
  for (const k of keys) {
    const v = components[k];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new TrustScoreInputError(`component ${k} must be a finite number, got ${v}`);
    }
    if (v < 0 || v > 100) {
      throw new TrustScoreInputError(`component ${k} must be in [0, 100], got ${v}`);
    }
  }

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  // Tolerate tiny floating-point drift from JSON-roundtripped weights.
  if (Math.abs(weightSum - 1.0) > 1e-9) {
    throw new TrustScoreInputError(`weights must sum to 1.0, got ${weightSum}`);
  }

  const raw =
    weights.security * components.security +
    weights.identity * components.identity +
    weights.transactions * components.transactions +
    weights.anomalySafety * components.anomalySafety +
    weights.reputation * components.reputation;

  return Math.round(raw * 100) / 100;
}
