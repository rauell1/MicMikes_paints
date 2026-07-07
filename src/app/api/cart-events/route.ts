import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

const VALID_EVENTS = ["add", "remove", "update", "checkout_start", "checkout_complete", "swatch_click", "visualizer_open"];

export async function POST(req: NextRequest) {
  try {
    const { sessionId, eventType, productSlug, colourId, size, finish, quantity, unitKes } = await req.json();

    if (!sessionId || !VALID_EVENTS.includes(eventType)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    let productId: string | null = null;
    if (productSlug) {
      const prods = (await db.execute(sql`
        SELECT id FROM catalog.products WHERE slug = ${productSlug} LIMIT 1
      `)).rows;
      if (prods.length > 0) productId = prods[0].id as string;
    }

    const payload = JSON.stringify({ size, finish, quantity, unitKes });

    await db.execute(sql`
      INSERT INTO analytics.events (session_id, event_name, entity_type, entity_id, payload)
      VALUES (${sessionId}, ${eventType}, 
              ${productId ? 'product' : (colourId ? 'shade' : null)}, 
              ${productId || colourId || null}, 
              ${payload}::jsonb)
    `);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/cart-events] Failed to record event:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
