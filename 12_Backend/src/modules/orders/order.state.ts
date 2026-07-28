/**
 * Order lifecycle state machine.
 *
 * Closed enum (Postgres CHECK constraint mirrors this in 0001_init.sql) plus
 * a service-layer guard that rejects illegal transitions.
 *
 *   created -> paid
 *   paid    -> assigned
 *   assigned -> picked_up
 *   picked_up -> delivered
 *   any non-terminal state -> cancelled
 *   delivered -> refunded
 *
 * POD is the only legal writer of {picked_up, delivered} for a given order,
 * and the order must be in {assigned} for pickup, {picked_up} for delivery.
 */

export const ORDER_STATUSES = [
  "created",
  "paid",
  "assigned",
  "picked_up",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ["paid", "cancelled"],
  paid: ["assigned", "cancelled"],
  assigned: ["picked_up", "cancelled"],
  picked_up: ["delivered", "cancelled"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    const err = new Error(`illegal order status transition: ${from} -> ${to}`);
    (err as Error & { code?: string }).code = "illegal_transition";
    throw err;
  }
}

export const POD_ACTION_STATUS: Record<
  "pickup" | "deliver",
  { from: OrderStatus; to: OrderStatus }
> = {
  pickup: { from: "assigned", to: "picked_up" },
  deliver: { from: "picked_up", to: "delivered" },
};
