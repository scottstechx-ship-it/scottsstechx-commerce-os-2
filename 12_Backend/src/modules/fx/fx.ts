/**
 * FX rate snapshot for orders.
 *
 * Every order persists the rate it was created with so later rate changes
 * don't rewrite history. For the MVP we only create orders in UGX; if a
 * product's currency is non-UGX, we look up the rate and snapshot it.
 *
 * The fx_rates table is intentionally simple: no historical joins, no
 * effective_at ranges. The caller is expected to insert a fresh row whenever
 * rates change. A more sophisticated design would use a ranges table and
 * SELECT the rate effective at order time; that's a follow-up.
 */

import type { PoolClient } from "pg";

export type Currency = "UGX" | "USD" | "EUR" | "KES" | "TZS" | "GHS";

const SUPPORTED: ReadonlySet<string> = new Set(["UGX", "USD", "EUR", "KES", "TZS", "GHS"]);

export function isSupportedCurrency(c: string): c is Currency {
  return SUPPORTED.has(c);
}

/**
 * Returns the rate (quote per 1 base) for base="UGX" -> quote=given currency.
 * Returns 1.0 if base==quote (no conversion). Throws if not found.
 *
 * The numeric is returned as a string to preserve precision.
 */
export async function getRateUGXto(
  client: PoolClient,
  quote: Currency,
): Promise<{ rate: string; source: string }> {
  if (quote === "UGX") return { rate: "1.00000000", source: "identity" };
  const r = await client.query<{ rate: string; source: string }>(
    `SELECT rate::text, source
       FROM fx_rates
      WHERE base_currency = 'UGX' AND quote_currency = $1
      ORDER BY effective_at DESC
      LIMIT 1`,
    [quote],
  );
  if (r.rowCount === 0) {
    const err = new Error(`no fx rate UGX->${quote}`);
    (err as Error & { code?: string }).code = "no_fx_rate";
    throw err;
  }
  return r.rows[0]!;
}
