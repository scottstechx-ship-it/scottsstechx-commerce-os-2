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

import { NotImplementedError } from "../../errors.js";

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

export async function requestMomoCollection(
  _req: MomoCollectionRequest,
): Promise<MomoCollectionResult> {
  throw new NotImplementedError(
    "Mobile money collection not implemented. See MomoClient.requestMomoCollection for the real HTTP shape.",
  );
}
