/**
 * Mobile Money stub.
 *
 * NOT IMPLEMENTED. The real MTN MoMo Collection / Airtel Money USSD push would
 * happen here. We expose the *shape* the real integration will need so that
 * when the real credentials land, the call site doesn't change.
 *
 * Real MTN MoMo Collection flow (per their docs):
 *   1. POST {base}/collection/v1_0/requesttopay
 *        headers: Authorization: Bearer <access_token>,
 *                 X-Reference-Id: <uuid>,
 *                 X-Target-Environment: sandbox|production,
 *                 Ocp-Apim-Subscription-Key: <key>
 *        body: {
 *          amount: "10000",       // STRING, not number, in minor units
 *          currency: "UGX",
 *          externalId: "<order_id>",
 *          payer: { partyIdType: "MSISDN", partyId: "256770000000" },
 *          payerMessage: "...", payeeNote: "..."
 *        }
 *   2. Receive 202 Accepted (sync). Async callback to your notifyUrl.
 *   3. GET {base}/collection/v1_0/requesttopay/{referenceId} to poll status.
 *
 * Real Airtel Money flow is similar but at a different endpoint with
 * different headers. We do not encode Airtel here.
 *
 * For now this returns 501 with X-Stub-Reason so the caller can show
 * "Mobile money not yet integrated (stub)" in the UI.
 */

import { withTransaction } from "../../db.js";
import { assertTransition } from "../orders/order.state.js";
import { insertAuditLog } from "../audit/audit.js";

export type MomoCollectionRequest = {
  orderId: string;
  amountMinor: number;
  currency: "UGX";
  payerPhone: string; // MSISDN, e.g. "256770000000"
  externalId: string;
};

export type MomoCollectionResult = {
  referenceId: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED";
};

/**
 * High-fidelity MoMo simulation for Uganda MVP.
 * - 25677... -> Success after 5s (MTN simulation)
 * - 25670... -> Success after 5s (Airtel simulation)
 * - 25678... -> Failure after 5s (Simulate Insufficient Funds)
 */
export async function requestMomoCollection(
  req: MomoCollectionRequest,
): Promise<MomoCollectionResult> {
  const referenceId = Math.random().toString(36).substring(7).toUpperCase();

  // Simulate async MoMo Push/Approval flow
  setTimeout(async () => {
    try {
      const isFailure = req.payerPhone.startsWith("25678");
      await handleMomoCompletion(req.orderId, referenceId, isFailure ? "FAILED" : "SUCCESSFUL");
    } catch (err) {
      console.error("[momo-sim] background update failed:", err);
    }
  }, 5000);

  return {
    referenceId,
    status: "PENDING",
  };
}

async function handleMomoCompletion(orderId: string, referenceId: string, status: "SUCCESSFUL" | "FAILED") {
  console.log(`[momo-sim] order=${orderId} reference=${referenceId} outcome=${status}`);

  await withTransaction({ userId: null, role: "system" }, async (client) => {
    const res = await client.query<{ status: any }>(
      "SELECT status FROM orders WHERE id = $1",
      [orderId]
    );

    if (!res.rowCount) return;
    const currentStatus = res.rows[0]!.status;

    if (status === "SUCCESSFUL") {
      if (currentStatus === "paid") return;
      assertTransition(currentStatus, "paid");

      await client.query(
        `UPDATE orders
         SET status = 'paid',
             paid_at = now(),
             payment_status = 'succeeded',
             payment_metadata = payment_metadata || $2::jsonb
         WHERE id = $1`,
        [orderId, JSON.stringify({ momo_ref: referenceId, provider: "momo" })]
      );

      await insertAuditLog(client, {
        actor_user_id: null,
        action: "payment_captured",
        resource_type: "order",
        resource_id: orderId,
        payload: { provider: "momo", reference: referenceId },
      });
    } else {
      await client.query(
        `UPDATE orders
         SET payment_status = 'failed',
             payment_metadata = payment_metadata || $2::jsonb
         WHERE id = $1`,
        [orderId, JSON.stringify({ momo_ref: referenceId, error: "customer_rejected" })]
      );

      await insertAuditLog(client, {
        actor_user_id: null,
        action: "payment_failed",
        resource_type: "order",
        resource_id: orderId,
        payload: { provider: "momo", reference: referenceId, reason: "customer_rejected" },
      });
    }
  });
}
