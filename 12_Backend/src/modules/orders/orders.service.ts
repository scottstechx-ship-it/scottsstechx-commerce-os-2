import { getPool } from "../../db.js";
import type { OrderResponse } from "./checkout.schema.js";

export async function listUserOrders(userId: string, status?: string): Promise<OrderResponse[]> {
  const params: any[] = [userId];
  let sql = `
    SELECT o.id as order_id, o.status, o.total_minor, o.currency, o.fx_rate_snapshot
    FROM orders o
    WHERE o.customer_id = $1
  `;

  if (status) {
    params.push(status);
    sql += ` AND o.status = $${params.length}`;
  }

  sql += " ORDER BY o.created_at DESC";

  const res = await getPool().query(sql, params);

  const orders = await Promise.all(res.rows.map(async (row) => {
    const itemsRes = await getPool().query(
      "SELECT product_id, qty, unit_price_minor FROM order_items WHERE order_id = $1",
      [row.order_id]
    );
    return {
      ...row,
      total_minor: Number(row.total_minor),
      items: itemsRes.rows.map(i => ({ ...i, unit_price_minor: Number(i.unit_price_minor), line_total_minor: i.qty * Number(i.unit_price_minor) }))
    };
  }));

  return orders;
}

export async function getOrderById(orderId: string, userId: string): Promise<OrderResponse | null> {
  const res = await getPool().query(
    "SELECT id as order_id, status, total_minor, currency, fx_rate_snapshot FROM orders WHERE id = $1 AND customer_id = $2",
    [orderId, userId]
  );

  if (!res.rowCount) return null;
  const row = res.rows[0]!;

  const itemsRes = await getPool().query(
    "SELECT product_id, qty, unit_price_minor FROM order_items WHERE order_id = $1",
    [orderId]
  );

  return {
    ...row,
    total_minor: Number(row.total_minor),
    items: itemsRes.rows.map(i => ({ ...i, unit_price_minor: Number(i.unit_price_minor), line_total_minor: i.qty * Number(i.unit_price_minor) }))
  };
}
