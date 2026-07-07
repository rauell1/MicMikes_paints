import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const zones = (await db.execute(sql`
      SELECT id, county_code AS county, locality AS town, base_fee_minor / 100 AS rate_kes, estimated_days_min, estimated_days_max
      FROM delivery.delivery_zones
      WHERE is_active = true
      ORDER BY county_code ASC, locality ASC NULLS LAST
    `)).rows;
    return NextResponse.json(zones);
  } catch (err) {
    console.error("[api/delivery-zones] GET failed:", err);
    return NextResponse.json({ error: "Failed to load delivery zones" }, { status: 500 });
  }
}
