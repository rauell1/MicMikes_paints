import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

const ALLOWED_ORIGINS = [
  "https://mic-mikes-paints.vercel.app",
  "https://www.micmikespaints.co.ke",
  "https://micmikespaints.co.ke",
  "http://localhost:5173",
  "http://localhost:3000",
];

function cors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const checkoutRequestId = req.query.id as string | undefined;
  if (!checkoutRequestId)
    return res.status(400).json({ error: "checkoutRequestId (path param) is required" });

  if (!process.env.DATABASE_URL)
    return res.status(503).json({ error: "Database not configured" });

  const sql = neon(process.env.DATABASE_URL!);
  const [payment] = await sql`
    SELECT mp.status, mp.mpesa_receipt, mp.failure_reason, mp.result_code,
           mp.amount_kes, mp.completed_at,
           o.id AS order_id, o.name AS customer_name, o.total_kes
    FROM mpesa_payments mp
    JOIN orders o ON o.id = mp.order_id
    WHERE mp.checkout_request_id = ${checkoutRequestId}
  `;

  if (!payment) return res.status(404).json({ error: "Payment not found" });

  // Normalize status to lowercase so frontend can reliably check === "success"
  const normalizedStatus = (payment.status as string).toLowerCase();

  return res.status(200).json({
    status:        normalizedStatus,
    receipt:       payment.mpesa_receipt ?? null,
    failureReason: payment.failure_reason ?? null,
    amountKes:     payment.amount_kes,
    completedAt:   payment.completed_at ?? null,
    orderId:       payment.order_id,
    customerName:  payment.customer_name,
    totalKes:      payment.total_kes,
  });
}
