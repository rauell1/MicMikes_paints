import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import { verifyAdminSession } from "../../src/lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await verifyAdminSession(req))) return res.status(401).json({ error: "Unauthorised" });

  const sql = neon(process.env.DATABASE_URL!);

  const [
    revRows,
    statusRows,
    topProductRows,
    slowRows,
    recentRows,
    mpesaRows,
    countyRows,
  ] = await Promise.all([
    /* 1 — Revenue: today, this week, this month, all time */
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('day',   now() AT TIME ZONE 'Africa/Nairobi') THEN total_kes END), 0) AS today,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('week',  now() AT TIME ZONE 'Africa/Nairobi') THEN total_kes END), 0) AS this_week,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') THEN total_kes END), 0) AS this_month,
        COALESCE(SUM(total_kes), 0) AS all_time,
        COUNT(*) AS total_orders,
        ROUND(AVG(total_kes)::numeric, 0) AS avg_order_value
      FROM orders
      WHERE status NOT IN ('cancelled')
    `,
    /* 2 — Orders by status */
    sql`
      SELECT status, COUNT(*) AS count
      FROM orders
      GROUP BY status
      ORDER BY count DESC
    `,
    /* 3 — Top 8 products by units sold (last 90 days) */
    sql`
      SELECT
        p.name,
        p.slug,
        p.image_url,
        p.category,
        SUM(oi.quantity)                         AS units_sold,
        SUM(oi.quantity * oi.unit_kes)           AS revenue_kes,
        COUNT(DISTINCT oi.order_id)              AS order_count
      FROM order_items oi
      JOIN orders o  ON o.id  = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.created_at >= now() - interval '90 days'
        AND o.status NOT IN ('cancelled')
      GROUP BY p.id, p.name, p.slug, p.image_url, p.category
      ORDER BY units_sold DESC
      LIMIT 8
    `,
    /* 4 — Slow / dead movers: products with no orders in 60 days */
    sql`
      SELECT p.name, p.slug, p.category, p.image_url,
        MAX(o.created_at) AS last_ordered
      FROM products p
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('cancelled')
      GROUP BY p.id, p.name, p.slug, p.category, p.image_url
      HAVING MAX(o.created_at) IS NULL OR MAX(o.created_at) < now() - interval '60 days'
      ORDER BY last_ordered ASC NULLS FIRST
      LIMIT 8
    `,
    /* 5 — 10 most recent orders */
    sql`
      SELECT id, name, email, phone, county, town, total_kes, status, mpesa_ref, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `,
    /* 6 — M-Pesa success rate (last 30 days) */
    sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status NOT IN ('SUCCESS','CANCELLED','PENDING') THEN 1 ELSE 0 END) AS failed
      FROM mpesa_payments
      WHERE created_at >= now() - interval '30 days'
    `,
    /* 7 — Revenue by county (top 8) */
    sql`
      SELECT county,
        COUNT(*) AS orders,
        SUM(total_kes) AS revenue_kes
      FROM orders
      WHERE status NOT IN ('cancelled')
        AND county IS NOT NULL
      GROUP BY county
      ORDER BY revenue_kes DESC
      LIMIT 8
    `,
  ]);

  return res.status(200).json({
    revenue:     revRows[0]  ?? {},
    byStatus:    statusRows,
    topProducts: topProductRows,
    slowMovers:  slowRows,
    recentOrders: recentRows,
    mpesa:       mpesaRows[0] ?? {},
    byCounty:    countyRows,
  });
}
