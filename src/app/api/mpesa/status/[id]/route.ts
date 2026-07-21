import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const checkoutRequestId = params.id;

  if (!checkoutRequestId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const payments = (await db.execute(sql`
      SELECT pa.status, pa.provider_reference AS mpesa_receipt,
             pa.failure_reason AS failure_reason,
             pa.raw_response->>'resultCode' AS result_code,
             pa.amount_minor / 100 AS amount_kes,
             pa.updated_at AS completed_at,
             o.id AS order_id, 
             addr.recipient_name AS customer_name, 
             o.total_minor / 100 AS total_kes
      FROM payment.payment_attempts pa
      JOIN commerce.orders o ON o.id = pa.order_id
      LEFT JOIN customer.addresses addr ON addr.id = o.shipping_address_id
      WHERE pa.provider_request_id = ${checkoutRequestId}
      LIMIT 1
    `)).rows;

    if (payments.length === 0) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const payment = payments[0];
    return NextResponse.json({
      status: String(payment.status).toLowerCase(),
      receipt: payment.mpesa_receipt ?? null,
      failureReason: payment.failure_reason ?? null,
      amountKes: Number(payment.amount_kes),
      completedAt: payment.completed_at ?? null,
      orderId: payment.order_id,
      customerName: payment.customer_name ?? "Customer",
      totalKes: Number(payment.total_kes),
    });
  } catch (err) {
    console.error("[api/mpesa/status] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
